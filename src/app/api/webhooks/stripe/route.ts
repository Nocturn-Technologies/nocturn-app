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
      default:
        console.info(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err);
    // Only return 500 (triggering Stripe retry) for transient errors like DB connection failures.
    // For logic errors, return 200 to prevent infinite retries and duplicate tickets.
    const isTransient = err instanceof Error && (
      err.message.includes("connect") ||
      err.message.includes("timeout") ||
      err.message.includes("ECONNREFUSED") ||
      err.message.includes("fetch failed")
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
      session.id
    );
    return;
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
  const { count: existingCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .or(`stripe_payment_intent_id.eq.${paymentIntentId},metadata->>checkout_session_id.eq.${session.id}`);

  if (existingCount && existingCount > 0) {
    console.info(
      `[stripe-webhook] Idempotency: tickets already exist for session ${session.id}` +
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
    console.error("[stripe-webhook] Ticket tier not found:", tierId);
    return;
  }

  // Calculate actual price paid, accounting for discounts
  // The checkout route stores ticketPriceCents (discounted unit price in cents) and
  // discountCents (per-ticket discount in cents) in session metadata
  let pricePaid: number;
  if (metadata.ticketPriceCents) {
    // Use the exact discounted price from checkout (convert cents to dollars)
    pricePaid = Number(metadata.ticketPriceCents) / 100;
  } else if (metadata.discountCents) {
    // Fallback: subtract discount from tier price
    pricePaid = Math.max(Number(tier.price) - Number(metadata.discountCents) / 100, 0);
  } else {
    // No discount — full price
    pricePaid = Number(tier.price);
  }

  // Re-check capacity before inserting (defense against overselling)
  const { data: recheck } = await supabase.rpc("check_and_reserve_capacity", {
    p_tier_id: tierId,
    p_quantity: quantity,
  });
  if (!recheck?.success) {
    console.error(`[webhook] Capacity exceeded for tier ${tierId} — auto-refunding payment ${paymentIntentId}`);
    void logPaymentEvent({
      event_type: "capacity_exceeded",
      payment_intent_id: paymentIntentId,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: session.amount_total ?? null,
      currency: session.currency ?? "usd",
      buyer_email: session.customer_email ?? session.customer_details?.email ?? null,
      metadata: { checkout_session_id: session.id, flow: "checkout_session" },
    });
    // Auto-refund the payment since we can't fulfill the tickets
    if (paymentIntentId) {
      try {
        await getStripe().refunds.create({
          payment_intent: paymentIntentId,
          reason: "requested_by_customer",
          metadata: {
            reason: "capacity_exceeded",
            event_id: eventId,
            tier_id: tierId,
          },
        });
        console.info(`[webhook] Auto-refund issued for PI ${paymentIntentId} (capacity exceeded)`);
        void logPaymentEvent({
          event_type: "refund_issued",
          payment_intent_id: paymentIntentId,
          event_id: eventId,
          tier_id: tierId,
          quantity,
          amount_cents: session.amount_total ?? null,
          currency: session.currency ?? "usd",
          buyer_email: session.customer_email ?? session.customer_details?.email ?? null,
          metadata: { reason: "capacity_exceeded", checkout_session_id: session.id },
        });
      } catch (refundErr) {
        const refundErrMsg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        console.error(`[webhook] Auto-refund FAILED for PI ${paymentIntentId}:`, refundErr);
        void logPaymentEvent({
          event_type: "refund_failed",
          payment_intent_id: paymentIntentId,
          event_id: eventId,
          tier_id: tierId,
          quantity,
          amount_cents: session.amount_total ?? null,
          currency: session.currency ?? "usd",
          buyer_email: session.customer_email ?? session.customer_details?.email ?? null,
          error_message: refundErrMsg,
          metadata: { reason: "capacity_exceeded", checkout_session_id: session.id },
        });
      }
    }
    return;
  }

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

  // CRITICAL: Insert tickets — must complete before responding to Stripe
  const { data: insertedTickets, error: insertError } = await supabase
    .from("tickets")
    .insert(tickets)
    .select("id, ticket_token");

  if (insertError) {
    console.error("[stripe-webhook] Failed to insert tickets:", insertError);
    throw insertError; // Will cause 500 so Stripe retries
  }

  console.info(
    `[stripe-webhook] Created ${quantity} ticket(s) for event ${eventId}, session ${session.id}`
  );

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
        if (customerEmail) {
          const { data: event } = await supabase
            .from("events")
            .select("title, starts_at, venues(name)")
            .eq("id", eventId)
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
  const buyerEmail = metadata.buyerEmail || paymentIntent.receipt_email;
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  const supabase = createAdminClient();

  // IDEMPOTENCY CHECK: Prevent duplicate ticket creation.
  // Check specifically for this payment_intent_id (no OR logic that could match unrelated tickets).
  const { count: existingCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("stripe_payment_intent_id", paymentIntent.id);

  if (existingCount && existingCount > 0) {
    console.info(
      `[stripe-webhook] Idempotency: tickets already exist for PI ${paymentIntent.id}, skipping duplicate creation`
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
    console.error("[stripe-webhook] Tier not found for PI:", tierId);
    return;
  }

  // Calculate actual price paid, accounting for discounts
  let pricePaid: number;
  if (metadata.ticketPriceCents) {
    pricePaid = Number(metadata.ticketPriceCents) / 100;
  } else if (metadata.discountCents) {
    pricePaid = Math.max(Number(tier.price) - Number(metadata.discountCents) / 100, 0);
  } else {
    pricePaid = Number(tier.price);
  }

  // Re-check capacity before inserting (defense against overselling)
  const { data: recheck } = await supabase.rpc("check_and_reserve_capacity", {
    p_tier_id: tierId,
    p_quantity: quantity,
  });
  if (!recheck?.success) {
    console.error(`[webhook] Capacity exceeded for tier ${tierId} — auto-refunding PI ${paymentIntent.id}`);
    void logPaymentEvent({
      event_type: "capacity_exceeded",
      payment_intent_id: paymentIntent.id,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: paymentIntent.amount,
      currency: paymentIntent.currency,
      buyer_email: buyerEmail ?? null,
      metadata: { flow: "payment_intent" },
    });
    // Auto-refund the payment since we can't fulfill the tickets
    try {
      await getStripe().refunds.create({
        payment_intent: paymentIntent.id,
        reason: "requested_by_customer",
        metadata: {
          reason: "capacity_exceeded",
          event_id: eventId,
          tier_id: tierId,
        },
      });
      console.info(`[webhook] Auto-refund issued for PI ${paymentIntent.id} (capacity exceeded)`);
      void logPaymentEvent({
        event_type: "refund_issued",
        payment_intent_id: paymentIntent.id,
        event_id: eventId,
        tier_id: tierId,
        quantity,
        amount_cents: paymentIntent.amount,
        currency: paymentIntent.currency,
        buyer_email: buyerEmail ?? null,
        metadata: { reason: "capacity_exceeded", flow: "payment_intent" },
      });
    } catch (refundErr) {
      const refundErrMsg = refundErr instanceof Error ? refundErr.message : String(refundErr);
      console.error(`[webhook] Auto-refund FAILED for PI ${paymentIntent.id}:`, refundErr);
      void logPaymentEvent({
        event_type: "refund_failed",
        payment_intent_id: paymentIntent.id,
        event_id: eventId,
        tier_id: tierId,
        quantity,
        amount_cents: paymentIntent.amount,
        currency: paymentIntent.currency,
        buyer_email: buyerEmail ?? null,
        error_message: refundErrMsg,
        metadata: { reason: "capacity_exceeded", flow: "payment_intent" },
      });
    }
    return;
  }

  const uuidRegex2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let referrerToken = metadata.referrerToken && uuidRegex2.test(metadata.referrerToken) ? metadata.referrerToken : null;
  if (referrerToken) {
    const { data: referrerUser } = await supabase.from("users").select("id").eq("id", referrerToken).maybeSingle();
    if (!referrerUser) referrerToken = null;
  }
  // Store base currency (USD) for organizer reporting, not the buyer's charge currency
  const ticketCurrency = metadata.baseCurrency || "usd";

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
    metadata: {
      payment_intent_id: paymentIntent.id,
      customer_email: buyerEmail,
      ...(metadata.chargeCurrency && metadata.chargeCurrency !== "usd" && {
        charge_currency: metadata.chargeCurrency,
        fx_rate: metadata.fxRate,
        buyer_country: metadata.buyerCountry,
      }),
      ...(referrerToken && { referrer_token: referrerToken }),
    },
  }));

  // CRITICAL: Insert tickets — must complete before responding to Stripe
  const { data: insertedTickets, error: insertError } = await supabase
    .from("tickets")
    .insert(tickets)
    .select("id, ticket_token");

  if (insertError) {
    console.error("[stripe-webhook] Failed to insert tickets:", insertError);
    throw insertError;
  }

  console.info(`[stripe-webhook] Created ${quantity} ticket(s) for PI ${paymentIntent.id}`);

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

  // NOTE: Promo code usage is already incremented atomically during checkout (checkout/route.ts).
  // Do NOT increment again here — webhook retries would cause double-counting.

  // Return background work to run AFTER the response is sent to Stripe
  return {
    backgroundWork: async () => {
      // Analytics tracking
      try {
        const { trackTicketSold, upsertAttendeeProfile } = await import("@/lib/analytics");
        trackTicketSold(eventId, quantity, pricePaid * quantity);
        if (buyerEmail) {
          const { data: eventForAnalytics } = await supabase
            .from("events")
            .select("collective_id")
            .eq("id", eventId)
            .maybeSingle();
          if (eventForAnalytics?.collective_id) {
            upsertAttendeeProfile(eventForAnalytics.collective_id, buyerEmail, eventId, pricePaid * quantity);
          }
        }
      } catch { /* non-critical */ }

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
