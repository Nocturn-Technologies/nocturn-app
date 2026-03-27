import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getStripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/config";

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
      { error: "Webhook secret is not configured" },
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
      { error: `Webhook signature verification failed: ${message}` },
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
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
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
    console.log(
      `[stripe-webhook] Idempotency: tickets already exist for session ${session.id}` +
      (paymentIntentId ? ` / PI ${paymentIntentId}` : "") +
      `, skipping duplicate creation`
    );
    return;
  }

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

  // Build ticket records
  const tickets = Array.from({ length: quantity }, () => ({
    event_id: eventId,
    ticket_tier_id: tierId,
    user_id: null, // Guest purchase — no user linked
    status: "paid" as const,
    price_paid: tier.price,
    currency: "usd",
    stripe_payment_intent_id: paymentIntentId,
    ticket_token: randomUUID(),
    metadata: {
      checkout_session_id: session.id,
      customer_email: session.customer_email ?? session.customer_details?.email,
      ...(session.metadata?.referrerToken && { referrer_token: session.metadata.referrerToken }),
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

  console.log(
    `[stripe-webhook] Created ${quantity} ticket(s) for event ${eventId}, session ${session.id}`
  );

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
          revenue: Number(tier.price) * quantity,
          sessionId: session.id,
        });
      } catch { /* non-critical */ }

      // Generate QR codes for each ticket
      if (insertedTickets && insertedTickets.length > 0) {
        const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

        await Promise.allSettled(
          insertedTickets.map(async (ticket) => {
            try {
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
            } catch (qrErr) {
              console.error(
                `[stripe-webhook] QR generation failed for ticket ${ticket.id}:`,
                qrErr
              );
            }
          })
        );

        console.log(
          `[stripe-webhook] Generated QR codes for ${insertedTickets.length} ticket(s)`
        );
      }

      // Send branded confirmation email
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
            const { sendTicketConfirmation } = await import("@/app/actions/email");
            await sendTicketConfirmation({
              to: customerEmail,
              eventTitle: event.title || "Event",
              eventDate: new Date(event.starts_at).toLocaleDateString("en", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              }),
              venueName: venue?.name || "TBA",
              tierName: tierInfo?.name || "General Admission",
              quantity,
              totalPrice: `$${(Number(tier.price) * quantity).toFixed(2)}`,
              ticketLink: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/ticket/${insertedTickets?.[0]?.ticket_token || ""}`,
            });
            console.log("[stripe-webhook] Confirmation email sent");

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

  const eventId = metadata.eventId;
  const tierId = metadata.tierId;
  const quantity = parseInt(metadata.quantity, 10);
  const buyerEmail = metadata.buyerEmail || paymentIntent.receipt_email;
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  const supabase = createAdminClient();

  // Retrieve checkout_session_id if this PI originated from a Checkout Session
  const checkoutSessionId = metadata.checkoutSessionId ?? null;

  // IDEMPOTENCY CHECK: Prevent duplicate ticket creation using BOTH identifiers
  const idempotencyFilter = checkoutSessionId
    ? `stripe_payment_intent_id.eq.${paymentIntent.id},metadata->>checkout_session_id.eq.${checkoutSessionId}`
    : `stripe_payment_intent_id.eq.${paymentIntent.id}`;

  const { count: existingCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .or(idempotencyFilter);

  if (existingCount && existingCount > 0) {
    console.log(
      `[stripe-webhook] Idempotency: tickets already exist for PI ${paymentIntent.id}` +
      (checkoutSessionId ? ` / session ${checkoutSessionId}` : "") +
      `, skipping duplicate creation`
    );
    return;
  }

  const { data: tier } = await supabase
    .from("ticket_tiers")
    .select("price")
    .eq("id", tierId)
    .maybeSingle();

  if (!tier) {
    console.error("[stripe-webhook] Tier not found for PI:", tierId);
    return;
  }

  const tickets = Array.from({ length: quantity }, () => ({
    event_id: eventId,
    ticket_tier_id: tierId,
    user_id: null,
    status: "paid" as const,
    price_paid: tier.price,
    currency: "usd",
    stripe_payment_intent_id: paymentIntent.id,
    ticket_token: randomUUID(),
    metadata: {
      payment_intent_id: paymentIntent.id,
      ...(checkoutSessionId && { checkout_session_id: checkoutSessionId }),
      customer_email: buyerEmail,
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

  console.log(`[stripe-webhook] Created ${quantity} ticket(s) for PI ${paymentIntent.id}`);

  // Return background work to run AFTER the response is sent to Stripe
  return {
    backgroundWork: async () => {
      // Generate QR codes
      if (insertedTickets && insertedTickets.length > 0) {
        await Promise.allSettled(
          insertedTickets.map(async (ticket) => {
            try {
              const qrDataUrl = await QRCode.toDataURL(
                `${BASE_URL}/check-in/${ticket.ticket_token}`,
                { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "H" }
              );
              await supabase.from("tickets").update({ qr_code: qrDataUrl }).eq("id", ticket.id);
            } catch (qrErr) {
              console.error(`[stripe-webhook] QR failed for ${ticket.id}:`, qrErr);
            }
          })
        );
      }

      // Send confirmation email
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
            const { sendTicketConfirmation } = await import("@/app/actions/email");
            await sendTicketConfirmation({
              to: buyerEmail,
              eventTitle: event.title || "Event",
              eventDate: new Date(event.starts_at).toLocaleDateString("en", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              }),
              venueName: venue?.name || "TBA",
              tierName: tierInfo?.name || "General Admission",
              quantity,
              totalPrice: `$${(Number(tier.price) * quantity).toFixed(2)}`,
              ticketLink: `${BASE_URL}/ticket/${insertedTickets?.[0]?.ticket_token || ""}`,
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
