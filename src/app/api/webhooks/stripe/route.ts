/**
 * Stripe Webhook Handler
 *
 * Handled events (configure in Stripe Dashboard → Webhooks):
 *   - checkout.session.completed    — Fulfill tickets from Checkout Sessions
 *   - payment_intent.succeeded      — Fulfill tickets from embedded/direct PaymentIntents
 *   - payment_intent.payment_failed — Delete pending tickets to release capacity
 *   - charge.refunded               — Mark paid/checked-in tickets as refunded
 *   - charge.dispute.created         — Mark tickets as disputed
 *
 * TODO: Add a cron job (e.g., Vercel cron every 15 min) to clean up expired pending
 * tickets older than 30 minutes. For now, the capacity queries in the public event
 * page and checkout routes only count pending tickets created within the last 30 min,
 * so expired ones are effectively ignored. A cleanup cron would just remove the rows:
 *   DELETE FROM tickets WHERE status = 'pending' AND created_at < now() - interval '30 minutes';
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getStripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/config";
import { logPaymentEvent } from "@/lib/payment-events";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const result = await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        if (result?.backgroundWork) {
          after(result.backgroundWork);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const result = await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent
        );
        if (result?.backgroundWork) {
          after(result.backgroundWork);
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const failureReason =
          pi.last_payment_error?.message ?? "unknown";
        console.warn(
          `[stripe-webhook] Payment failed for PI ${pi.id}: ${failureReason}`
        );
        // Delete pending tickets to release reserved capacity (Gap 9 + 25)
        const supabase = createAdminClient();
        const { data: failedTickets, error: failErr } = await supabase
          .from("tickets")
          .delete()
          .eq("stripe_payment_intent_id", pi.id)
          .eq("status", "pending")
          .select("id");
        if (failErr) {
          console.error("[stripe-webhook] Failed to delete pending tickets:", failErr);
        } else if (failedTickets && failedTickets.length > 0) {
          console.info(
            `[stripe-webhook] Deleted ${failedTickets.length} pending ticket(s) to release capacity for PI ${pi.id}`
          );
        }

        // Release promo code claim (Gap 22): promo uses were claimed atomically
        // before payment, so we must decrement on failure to free the slot.
        const piPromoId = pi.metadata?.promoId;
        const piPromoQuantity = parseInt(pi.metadata?.promoClaimedQuantity || "0", 10);
        if (piPromoId && piPromoQuantity > 0) {
          const { data: currentPromo } = await supabase
            .from("promo_codes")
            .select("current_uses")
            .eq("id", piPromoId)
            .maybeSingle();

          if (currentPromo) {
            const newUses = Math.max((currentPromo.current_uses ?? 0) - piPromoQuantity, 0);
            await supabase
              .from("promo_codes")
              .update({ current_uses: newUses })
              .eq("id", piPromoId);
            console.info(
              `[stripe-webhook] Released ${piPromoQuantity} promo claim(s) for code ${piPromoId} (PI ${pi.id})`
            );
          }
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const refundPiId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;
        if (refundPiId) {
          console.info(`[stripe-webhook] Charge refunded for PI ${refundPiId}`);
          const supabase = createAdminClient();
          const { data: refundedTickets, error: refundErr } = await supabase
            .from("tickets")
            .update({ status: "refunded" })
            .eq("stripe_payment_intent_id", refundPiId)
            .in("status", ["paid", "checked_in"])
            .select("id");
          if (refundErr) {
            console.error("[stripe-webhook] Failed to update tickets to refunded:", refundErr);
          } else if (refundedTickets && refundedTickets.length > 0) {
            console.info(
              `[stripe-webhook] Marked ${refundedTickets.length} ticket(s) as refunded for PI ${refundPiId}`
            );
          }
        } else {
          console.warn("[stripe-webhook] charge.refunded event has no payment_intent ID, skipping");
        }
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const disputePiId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : (dispute.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;
        const disputeReason = dispute.reason ?? "unknown";
        if (disputePiId) {
          console.warn(
            `[stripe-webhook] Charge disputed for PI ${disputePiId}, reason: ${disputeReason}`
          );
          const supabase = createAdminClient();
          const { data: disputedTickets, error: disputeErr } = await supabase
            .from("tickets")
            .update({ status: "cancelled" })
            .eq("stripe_payment_intent_id", disputePiId)
            .select("id");
          if (disputeErr) {
            console.error("[stripe-webhook] Failed to update tickets to cancelled:", disputeErr);
          } else if (disputedTickets && disputedTickets.length > 0) {
            console.info(
              `[stripe-webhook] Marked ${disputedTickets.length} ticket(s) as cancelled (dispute) for PI ${disputePiId}`
            );
          }
        } else {
          console.warn("[stripe-webhook] charge.dispute.created event has no payment_intent ID, skipping");
        }
        break;
      }
      default:
        console.info(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err);
    // Only return 500 (triggering Stripe retry) for transient errors like DB connection failures.
    // For logic errors, return 200 to prevent infinite retries and duplicate tickets.
    const errMsg = err instanceof Error ? err.message : "";
    const errMsgLower = errMsg.toLowerCase();
    const isTransient = err instanceof Error && (
      errMsgLower.includes("connect") ||
      errMsgLower.includes("timeout") ||
      errMsgLower.includes("econnrefused") ||
      errMsgLower.includes("econnreset") ||
      errMsgLower.includes("etimedout") ||
      errMsgLower.includes("fetch failed") ||
      errMsgLower.includes("socket hang up") ||
      errMsgLower.includes("network") ||
      errMsgLower.includes("too many connections") ||
      errMsgLower.includes("connection terminated") ||
      errMsgLower.includes("connection pool") ||
      errMsgLower.includes("54") || // Postgres connection-related error codes
      errMsgLower.includes("could not connect") ||
      errMsgLower.includes("503") ||
      errMsgLower.includes("502")
    );
    if (isTransient) {
      return NextResponse.json(
        { error: "Webhook handler failed (transient)" },
        { status: 500 }
      );
    }
    // Non-retryable error — acknowledge receipt so Stripe doesn't retry
    return NextResponse.json(
      { error: "Webhook handler failed (non-retryable)" },
      { status: 200 }
    );
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;

  if (!metadata?.eventId || !metadata?.tierId || !metadata?.quantity) {
    console.error(
      "[stripe-webhook] Missing metadata on checkout session:",
      session.id,
      "metadata:",
      JSON.stringify(metadata)
    );
    throw new Error(
      `Missing required metadata (eventId/tierId/quantity) on checkout session ${session.id}`
    );
  }

  const eventId = metadata.eventId;
  const tierId = metadata.tierId;
  const quantity = parseInt(metadata.quantity, 10);
  if (isNaN(quantity) || quantity < 1) {
    console.error("[stripe-webhook] Invalid quantity in metadata:", metadata.quantity);
    return;
  }
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const supabase = createAdminClient();

  // IDEMPOTENCY CHECK: Prevent duplicate ticket creation on webhook retry
  // Check for already-fulfilled (paid) tickets — not pending ones which we'll update
  let existingPaidCount = 0;
  if (paymentIntentId) {
    const { count } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("stripe_payment_intent_id", paymentIntentId)
      .in("status", ["paid", "checked_in"]);
    existingPaidCount = count ?? 0;
  }
  if (existingPaidCount === 0) {
    const { count } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .filter("metadata->>checkout_session_id", "eq", session.id)
      .in("status", ["paid", "checked_in"]);
    existingPaidCount = count ?? 0;
  }

  if (existingPaidCount && existingPaidCount > 0) {
    console.info(
      `[stripe-webhook] Idempotency: paid tickets already exist for session ${session.id}` +
      (paymentIntentId ? ` / PI ${paymentIntentId}` : "") +
      `, skipping duplicate creation`
    );
    return;
  }

  // Log payment_succeeded now that we know this is a new fulfillment
  void logPaymentEvent({
    event_type: "payment_succeeded",
    payment_intent_id: paymentIntentId,
    event_id: eventId,
    tier_id: tierId,
    quantity,
    amount_cents: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    buyer_email: session.customer_email ?? session.customer_details?.email ?? null,
    metadata: { checkout_session_id: session.id, flow: "checkout_session" },
  });

  // Look up the tier to get the price
  const { data: tier, error: tierError } = await supabase
    .from("ticket_tiers")
    .select("price")
    .eq("id", tierId)
    .maybeSingle();

  if (tierError || !tier) {
    console.error("[stripe-webhook] Ticket tier not found, tierId:", tierId, "error:", tierError);
    throw new Error(`Ticket tier not found for tierId ${tierId}`);
  }

  // Calculate actual price paid, accounting for discounts
  // The checkout route stores ticketPriceCents (discounted unit price in cents) and
  // discountCents (per-ticket discount in cents) in session metadata
  let pricePaid: number;
  if (metadata.ticketPriceCents) {
    // Use the exact discounted price from checkout (convert cents to dollars)
    pricePaid = parseFloat((Number(metadata.ticketPriceCents) / 100).toFixed(2));
  } else if (metadata.discountCents) {
    // Fallback: subtract discount from tier price
    pricePaid = parseFloat(Math.max(Number(tier.price) - Number(metadata.discountCents) / 100, 0).toFixed(2));
  } else {
    // No discount — full price
    pricePaid = Number(tier.price);
  }

  // NOTE: Capacity was already reserved at checkout creation (checkout/route.ts or
  // create-payment-intent/route.ts). We skip re-reserving here to prevent double-decrement.
  // The idempotency check above already prevents duplicate ticket creation on retries.

  // Build ticket records — referrerToken is a user UUID (from ?ref= link)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let referrerToken = metadata.referrerToken && uuidRegex.test(metadata.referrerToken) ? metadata.referrerToken : null;
  // Validate referrer user actually exists (prevents FK constraint violation)
  if (referrerToken) {
    const { data: referrerUser } = await supabase.from("users").select("id").eq("id", referrerToken).maybeSingle();
    if (!referrerUser) referrerToken = null;
  }
  const tickets = Array.from({ length: quantity }, () => ({
    event_id: eventId,
    ticket_tier_id: tierId,
    user_id: null, // Guest purchase — no user linked
    status: "paid" as const,
    price_paid: pricePaid,
    currency: "usd",
    stripe_payment_intent_id: paymentIntentId,
    ticket_token: randomUUID(),
    referred_by: referrerToken,
    metadata: {
      checkout_session_id: session.id,
      customer_email: session.customer_email ?? session.customer_details?.email,
      ...(referrerToken && { referrer_token: referrerToken }),
      ...(session.metadata?.promoId && { promo_id: session.metadata.promoId, promo_code: session.metadata.promoCode }),
      ...(session.metadata?.discountCents && { discount_cents: session.metadata.discountCents }),
    },
  }));

  // Try to update pending tickets (created at checkout) to "paid" first.
  // If pending tickets exist from checkout creation, update them instead of inserting new ones.
  let insertedTickets: { id: string; ticket_token: string }[] | null = null;
  const pendingTicketIds: string[] = metadata.pendingTicketIds ? JSON.parse(metadata.pendingTicketIds) : [];

  if (pendingTicketIds.length > 0) {
    const { data: updatedTickets, error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "paid",
        price_paid: pricePaid,
        currency: "usd",
        stripe_payment_intent_id: paymentIntentId,
        metadata: {
          checkout_session_id: session.id,
          customer_email: session.customer_email ?? session.customer_details?.email,
          ...(referrerToken && { referrer_token: referrerToken }),
          ...(session.metadata?.promoId && { promo_id: session.metadata.promoId, promo_code: session.metadata.promoCode }),
          ...(session.metadata?.discountCents && { discount_cents: session.metadata.discountCents }),
        },
      })
      .in("id", pendingTicketIds)
      .eq("status", "pending")
      .select("id, ticket_token");

    if (!updateError && updatedTickets && updatedTickets.length > 0) {
      insertedTickets = updatedTickets;
      console.info(
        `[stripe-webhook] Updated ${updatedTickets.length} pending ticket(s) to paid for session ${session.id}`
      );
    } else {
      if (updateError) console.warn("[stripe-webhook] Failed to update pending tickets, falling back to insert:", updateError);
    }
  }

  // Fallback: insert new tickets if no pending tickets were updated
  if (!insertedTickets || insertedTickets.length === 0) {
    const { data: newTickets, error: insertError } = await supabase
      .from("tickets")
      .insert(tickets)
      .select("id, ticket_token");

    if (insertError) {
      console.error("[stripe-webhook] Failed to insert tickets:", insertError);
      throw insertError; // Will cause 500 so Stripe retries
    }
    insertedTickets = newTickets;
    console.info(
      `[stripe-webhook] Created ${quantity} ticket(s) for event ${eventId}, session ${session.id}`
    );
  }

  // Contact upsert — best-effort fan sync
  try {
    const contactEmail = (session.customer_email ?? session.customer_details?.email ?? "").toLowerCase().trim();
    if (contactEmail) {
      const { data: eventForContact } = await supabase
        .from("events")
        .select("collective_id")
        .eq("id", eventId)
        .is("deleted_at", null)
        .maybeSingle();
      if (eventForContact?.collective_id) {
        await supabase.from("contacts").upsert({
          collective_id: eventForContact.collective_id,
          contact_type: "fan",
          email: contactEmail,
          full_name: (metadata.customerName || metadata.buyerName || session.customer_details?.name) ?? null,
          source: "ticket",
          total_events: 1,
          total_spend: pricePaid * quantity,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "collective_id,email", ignoreDuplicates: false });
      }
    }
  } catch (contactErr) {
    console.error("[stripe-webhook] Contact upsert failed (non-blocking):", contactErr);
  }

  // Promo code uses are now claimed atomically BEFORE payment (Gap 22 fix).
  // No need to claim here — the checkout/create-payment-intent routes handle it.
  // If payment fails, the payment_intent.payment_failed webhook decrements the counter.

  void logPaymentEvent({
    event_type: "tickets_fulfilled",
    payment_intent_id: paymentIntentId,
    event_id: eventId,
    tier_id: tierId,
    quantity,
    amount_cents: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    buyer_email: session.customer_email ?? session.customer_details?.email ?? null,
    metadata: { checkout_session_id: session.id, flow: "checkout_session" },
  });

  // Return background work to run AFTER the response is sent to Stripe.
  // QR generation + email sending can take 10-30s and would cause Stripe timeouts.
  return {
    backgroundWork: async () => {
      // Track ticket purchase
      try {
        const { trackServerEvent } = await import("@/lib/track-server");
        await trackServerEvent("ticket_purchased", {
          eventId,
          quantity,
          revenue: pricePaid * quantity,
          sessionId: session.id,
        });
      } catch { /* non-critical */ }

      // Analytics tracking
      try {
        const { trackTicketSold, upsertAttendeeProfile } = await import("@/lib/analytics");
        trackTicketSold(eventId, quantity, pricePaid * quantity);
        const customerEmailForAnalytics = session.customer_email ?? session.customer_details?.email;
        if (customerEmailForAnalytics) {
          const { data: eventForAnalytics } = await supabase
            .from("events")
            .select("collective_id")
            .eq("id", eventId)
            .is("deleted_at", null)
            .maybeSingle();
          if (eventForAnalytics?.collective_id) {
            upsertAttendeeProfile(eventForAnalytics.collective_id, customerEmailForAnalytics, eventId, pricePaid * quantity);
          }
        }
      } catch { /* non-critical */ }

      // Generate QR codes for each ticket FIRST, then include in email
      const qrCodes: string[] = [];
      if (insertedTickets && insertedTickets.length > 0) {
        const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

        const qrResults = await Promise.allSettled(
          insertedTickets.map(async (ticket) => {
            const checkInUrl = `${BASE_URL}/check-in/${ticket.ticket_token}`;
            const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
              width: 400,
              margin: 2,
              color: { dark: "#000000", light: "#ffffff" },
              errorCorrectionLevel: "H",
            });

            await supabase
              .from("tickets")
              .update({ qr_code: qrDataUrl })
              .eq("id", ticket.id);

            return qrDataUrl;
          })
        );

        for (const r of qrResults) {
          if (r.status === "fulfilled") qrCodes.push(r.value);
          else console.error("[stripe-webhook] QR generation failed:", r.reason);
        }

        console.info(
          `[stripe-webhook] Generated ${qrCodes.length}/${insertedTickets.length} QR codes`
        );
      }

      // Send branded confirmation email with QR codes
      try {
        const customerEmail = session.customer_email ?? session.customer_details?.email;
        if (!customerEmail) {
          console.warn(
            `[stripe-webhook] No buyer email available for session ${session.id}, skipping confirmation email`
          );
        }
        if (customerEmail) {
          const { data: event } = await supabase
            .from("events")
            .select("title, starts_at, venues(name)")
            .eq("id", eventId)
            .is("deleted_at", null)
            .maybeSingle();

          const { data: tierInfo } = await supabase
            .from("ticket_tiers")
            .select("name")
            .eq("id", tierId)
            .maybeSingle();

          if (event) {
            const venue = event.venues as unknown as { name: string } | null;
            const { sendTicketConfirmation } = await import("@/lib/email/actions");
            await sendTicketConfirmation({
              to: customerEmail,
              eventTitle: event.title || "Event",
              eventDate: new Date(event.starts_at).toLocaleDateString("en", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              }),
              venueName: venue?.name || "TBA",
              tierName: tierInfo?.name || "General Admission",
              quantity,
              totalPrice: `$${(pricePaid * quantity).toFixed(2)}`,
              ticketLink: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/ticket/${insertedTickets?.[0]?.ticket_token || ""}`,
              qrCodes: qrCodes.length > 0 ? qrCodes : undefined,
              ticketTokens: insertedTickets?.map((t) => t.ticket_token) || [],
            });
            console.info("[stripe-webhook] Confirmation email sent with QR codes");

            // Post-purchase hooks: referral nudge + milestone check
            try {
              const { runPostPurchaseHooks } = await import("@/app/actions/post-purchase-hooks");
              await runPostPurchaseHooks({
                eventId,
                buyerEmail: customerEmail!,
                ticketToken: insertedTickets?.[0]?.ticket_token || "",
              });
            } catch { /* non-critical */ }
          }
        }
      } catch (emailErr) {
        console.error("[stripe-webhook] Email send failed (non-blocking):", emailErr);
      }
    },
  };
}

// Handle embedded checkout (PaymentIntent) — same ticket creation logic
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata;

  if (!metadata?.eventId || !metadata?.tierId || !metadata?.quantity) {
    // Not a ticket purchase PaymentIntent (could be from Checkout Session which is handled above)
    return;
  }

  // If this PaymentIntent originated from a Checkout Session, skip entirely.
  // The checkout.session.completed handler already created tickets and stored
  // checkout_session_id in ticket metadata. Processing here would be a duplicate.
  const checkoutSessionId = metadata.checkoutSessionId ?? null;
  if (checkoutSessionId) {
    console.info(
      `[stripe-webhook] PI ${paymentIntent.id} originated from checkout session ${checkoutSessionId}, skipping (handled by checkout.session.completed)`
    );
    return;
  }

  // Also check if the Stripe PaymentIntent itself is linked to a checkout session
  // (even if metadata wasn't set, the PI object may reference one)
  if (paymentIntent.latest_charge) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(paymentIntent.id);
      // Stripe attaches invoice/checkout info — check for any session linkage
      if ((pi as unknown as Record<string, unknown>).invoice || metadata.checkout_session_id) {
        console.info(
          `[stripe-webhook] PI ${paymentIntent.id} linked to a checkout flow, skipping`
        );
        return;
      }
    } catch {
      // If retrieval fails, proceed with idempotency check below
    }
  }

  const eventId = metadata.eventId;
  const tierId = metadata.tierId;
  const quantity = parseInt(metadata.quantity, 10);
  if (isNaN(quantity) || quantity < 1) {
    console.error("[stripe-webhook] Invalid quantity in PI metadata:", metadata.quantity);
    return;
  }

  // SECURITY: Verify payment amount matches expected amount from metadata
  // Prevents fulfillment on amount mismatches (currency glitches, replay attacks)
  const expectedCents = parseInt(metadata.totalAmountCents || metadata.baseAmountCents || "0", 10);
  if (expectedCents > 0 && paymentIntent.amount !== expectedCents) {
    console.error(
      `[stripe-webhook] AMOUNT MISMATCH: PI ${paymentIntent.id} charged ${paymentIntent.amount} cents but expected ${expectedCents} cents`
    );
    void logPaymentEvent({
      event_type: "fulfillment_failed",
      payment_intent_id: paymentIntent.id,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: paymentIntent.amount,
      currency: paymentIntent.currency,
      buyer_email: metadata.buyerEmail ?? null,
      metadata: { error: `Amount mismatch: got ${paymentIntent.amount}, expected ${expectedCents}` },
    });
    return;
  }

  const buyerEmail = metadata.buyerEmail || paymentIntent.receipt_email;
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  const supabase = createAdminClient();

  // IDEMPOTENCY CHECK: Prevent duplicate ticket creation.
  // Only check for paid/checked_in tickets — pending ones will be updated to paid.
  const { count: existingPaidCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .in("status", ["paid", "checked_in"]);

  if (existingPaidCount && existingPaidCount > 0) {
    console.info(
      `[stripe-webhook] Idempotency: paid tickets already exist for PI ${paymentIntent.id}, skipping duplicate creation`
    );
    return;
  }

  // Log payment_succeeded now that we know this is a new fulfillment
  void logPaymentEvent({
    event_type: "payment_succeeded",
    payment_intent_id: paymentIntent.id,
    event_id: eventId,
    tier_id: tierId,
    quantity,
    amount_cents: paymentIntent.amount,
    currency: paymentIntent.currency,
    buyer_email: buyerEmail ?? null,
    metadata: { flow: "payment_intent" },
  });

  const { data: tier } = await supabase
    .from("ticket_tiers")
    .select("price")
    .eq("id", tierId)
    .maybeSingle();

  if (!tier) {
    console.error("[stripe-webhook] Tier not found for PI, tierId:", tierId);
    throw new Error(`Ticket tier not found for tierId ${tierId} (PI: ${paymentIntent.id})`);
  }

  // Calculate actual price paid, accounting for discounts
  let pricePaid: number;
  if (metadata.ticketPriceCents) {
    pricePaid = parseFloat((Number(metadata.ticketPriceCents) / 100).toFixed(2));
  } else if (metadata.discountCents) {
    pricePaid = parseFloat(Math.max(Number(tier.price) - Number(metadata.discountCents) / 100, 0).toFixed(2));
  } else {
    pricePaid = Number(tier.price);
  }

  // NOTE: Capacity was already reserved at checkout creation (create-payment-intent/route.ts).
  // We skip re-reserving here to prevent double-decrement.
  // The idempotency check above already prevents duplicate ticket creation on retries.

  const uuidRegex2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let referrerToken = metadata.referrerToken && uuidRegex2.test(metadata.referrerToken) ? metadata.referrerToken : null;
  if (referrerToken) {
    const { data: referrerUser } = await supabase.from("users").select("id").eq("id", referrerToken).maybeSingle();
    if (!referrerUser) referrerToken = null;
  }
  // Store base currency (USD) for organizer reporting, not the buyer's charge currency
  const ticketCurrency = metadata.baseCurrency || "usd";

  const ticketMetadata = {
    payment_intent_id: paymentIntent.id,
    customer_email: buyerEmail,
    fulfilled_by: "webhook",
    ...(metadata.chargeCurrency && metadata.chargeCurrency !== "usd" && {
      charge_currency: metadata.chargeCurrency,
      fx_rate: metadata.fxRate,
      buyer_country: metadata.buyerCountry,
    }),
    ...(referrerToken && { referrer_token: referrerToken }),
  };

  // Try to update pending tickets (created at checkout) to "paid" first.
  let insertedTickets: { id: string; ticket_token: string; is_new?: boolean }[] | null = null;
  let wasNewlyCreated = true;
  const pendingTicketIds: string[] = metadata.pendingTicketIds ? JSON.parse(metadata.pendingTicketIds) : [];

  if (pendingTicketIds.length > 0) {
    const { data: updatedTickets, error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "paid",
        price_paid: pricePaid,
        currency: ticketCurrency,
        stripe_payment_intent_id: paymentIntent.id,
        referred_by: referrerToken,
        metadata: ticketMetadata,
      })
      .in("id", pendingTicketIds)
      .eq("status", "pending")
      .select("id, ticket_token");

    if (!updateError && updatedTickets && updatedTickets.length > 0) {
      insertedTickets = updatedTickets;
      console.info(
        `[stripe-webhook] Updated ${updatedTickets.length} pending ticket(s) to paid for PI ${paymentIntent.id}`
      );
    } else {
      if (updateError) console.warn("[stripe-webhook] Failed to update pending tickets for PI, falling back:", updateError);
    }
  }

  // Fallback: Use atomic fulfillment RPC or plain insert if no pending tickets were updated.
  if (!insertedTickets || insertedTickets.length === 0) {
    try {
      const { data: atomicResult, error: atomicError } = await supabase.rpc("fulfill_tickets_atomic", {
        p_payment_intent_id: paymentIntent.id,
        p_event_id: eventId,
        p_tier_id: tierId,
        p_quantity: quantity,
        p_price_paid: pricePaid,
        p_currency: ticketCurrency,
        p_buyer_email: buyerEmail ?? undefined,
        p_referrer_token: referrerToken ?? undefined,
        p_metadata: ticketMetadata,
      });

      if (atomicError) throw atomicError;
      insertedTickets = atomicResult as unknown as { id: string; ticket_token: string; is_new?: boolean }[];

      // Deterministic: the RPC returns is_new=false for pre-existing tickets
      if (insertedTickets && insertedTickets.length > 0) {
        wasNewlyCreated = insertedTickets[0]?.is_new !== false;
      }
    } catch {
      // Fallback: plain insert (for pre-migration compatibility)
      const tickets = Array.from({ length: quantity }, () => ({
        event_id: eventId,
        ticket_tier_id: tierId,
        user_id: null,
        status: "paid" as const,
        price_paid: pricePaid,
        currency: ticketCurrency,
        stripe_payment_intent_id: paymentIntent.id,
        ticket_token: randomUUID(),
        referred_by: referrerToken,
        metadata: ticketMetadata,
      }));

      const { data, error: insertError } = await supabase
        .from("tickets")
        .insert(tickets)
        .select("id, ticket_token");

      if (insertError) {
        // If unique constraint violation, tickets already exist (created by client action)
        if (insertError.code === "23505") {
          console.info(`[stripe-webhook] Tickets already exist for PI ${paymentIntent.id} (unique constraint), skipping`);
          wasNewlyCreated = false;
          const { data: existing } = await supabase
            .from("tickets")
            .select("id, ticket_token")
            .eq("stripe_payment_intent_id", paymentIntent.id);
          insertedTickets = existing;
        } else {
          console.error("[stripe-webhook] Failed to insert tickets:", insertError);
          throw insertError;
        }
      } else {
        insertedTickets = data;
      }
    }
  }

  console.info(`[stripe-webhook] ${wasNewlyCreated ? "Created" : "Found existing"} ${quantity} ticket(s) for PI ${paymentIntent.id}`);

  // Contact upsert — best-effort fan sync
  if (wasNewlyCreated) {
    try {
      const contactEmail = (buyerEmail ?? "").toLowerCase().trim();
      if (contactEmail) {
        const { data: eventForContact } = await supabase
          .from("events")
          .select("collective_id")
          .eq("id", eventId)
          .is("deleted_at", null)
          .maybeSingle();
        if (eventForContact?.collective_id) {
          await supabase.from("contacts").upsert({
            collective_id: eventForContact.collective_id,
            contact_type: "fan",
            email: contactEmail,
            full_name: (metadata.buyerName || metadata.customerName) ?? null,
            source: "ticket",
            total_events: 1,
            total_spend: pricePaid * quantity,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "collective_id,email", ignoreDuplicates: false });
        }
      }
    } catch (contactErr) {
      console.error("[stripe-webhook] Contact upsert failed (non-blocking):", contactErr);
    }
  }

  // Only log fulfillment and claim promo if tickets were NEWLY created.
  // If they pre-existed (client action beat the webhook), skip to avoid double-counting.
  if (wasNewlyCreated) {
    void logPaymentEvent({
      event_type: "tickets_fulfilled",
      payment_intent_id: paymentIntent.id,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: paymentIntent.amount,
      currency: paymentIntent.currency,
      buyer_email: buyerEmail ?? null,
      metadata: { flow: "payment_intent" },
    });

    // Promo code uses are now claimed atomically BEFORE payment (Gap 22 fix).
    // No need to claim here — the create-payment-intent route handles it.
    // If payment fails, the payment_intent.payment_failed webhook decrements the counter.
    if (false && metadata.promoId) {
      // Kept for reference — this block is intentionally disabled (Gap 22)
    }
  } else {
    console.info(`[stripe-webhook] Tickets pre-existed for PI ${paymentIntent.id}, skipping promo/analytics`);
  }

  // Return background work to run AFTER the response is sent to Stripe
  return {
    backgroundWork: async () => {
      // Analytics tracking — only if tickets were newly created
      if (wasNewlyCreated) {
        try {
          const { trackTicketSold, upsertAttendeeProfile } = await import("@/lib/analytics");
          trackTicketSold(eventId, quantity, pricePaid * quantity);
          if (buyerEmail) {
            const { data: eventForAnalytics } = await supabase
              .from("events")
              .select("collective_id")
              .eq("id", eventId)
              .is("deleted_at", null)
              .maybeSingle();
            if (eventForAnalytics?.collective_id) {
              upsertAttendeeProfile(eventForAnalytics.collective_id, buyerEmail, eventId, pricePaid * quantity);
            }
          }
        } catch (err) {
          console.error("[stripe-webhook] Analytics tracking failed (non-blocking):", err);
        }
      }

      // Generate QR codes FIRST, then include in email
      const piQrCodes: string[] = [];
      if (insertedTickets && insertedTickets.length > 0) {
        const qrResults = await Promise.allSettled(
          insertedTickets.map(async (ticket) => {
            const qrDataUrl = await QRCode.toDataURL(
              `${BASE_URL}/check-in/${ticket.ticket_token}`,
              { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "H" }
            );
            await supabase.from("tickets").update({ qr_code: qrDataUrl }).eq("id", ticket.id);
            return qrDataUrl;
          })
        );
        for (const r of qrResults) {
          if (r.status === "fulfilled") piQrCodes.push(r.value);
          else console.error("[stripe-webhook] QR failed:", r.reason);
        }
      }

      // Send confirmation email with QR codes
      try {
        if (buyerEmail) {
          const { data: event } = await supabase
            .from("events")
            .select("title, starts_at, venues(name)")
            .eq("id", eventId)
            .is("deleted_at", null)
            .maybeSingle();

          const { data: tierInfo } = await supabase
            .from("ticket_tiers")
            .select("name")
            .eq("id", tierId)
            .maybeSingle();

          if (event) {
            const venue = event.venues as unknown as { name: string } | null;
            const { sendTicketConfirmation } = await import("@/lib/email/actions");
            await sendTicketConfirmation({
              to: buyerEmail,
              eventTitle: event.title || "Event",
              eventDate: new Date(event.starts_at).toLocaleDateString("en", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              }),
              venueName: venue?.name || "TBA",
              tierName: tierInfo?.name || "General Admission",
              quantity,
              totalPrice: `$${(pricePaid * quantity).toFixed(2)}`,
              ticketLink: `${BASE_URL}/ticket/${insertedTickets?.[0]?.ticket_token || ""}`,
              qrCodes: piQrCodes.length > 0 ? piQrCodes : undefined,
              ticketTokens: insertedTickets?.map((t) => t.ticket_token) || [],
            });
          }
        }
        // Post-purchase hooks
        if (buyerEmail) {
          try {
            const { runPostPurchaseHooks } = await import("@/app/actions/post-purchase-hooks");
            await runPostPurchaseHooks({
              eventId,
              buyerEmail,
              ticketToken: insertedTickets?.[0]?.ticket_token || "",
            });
          } catch { /* non-critical */ }
        }
      } catch (emailErr) {
        console.error("[stripe-webhook] Email failed (non-blocking):", emailErr);
      }
    },
  };
}
