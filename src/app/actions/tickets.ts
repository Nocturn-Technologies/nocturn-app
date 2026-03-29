"use server";

import QRCode from "qrcode";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { logPaymentEvent } from "@/lib/payment-events";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

/**
 * Generate a QR code data URL for a ticket and persist it.
 * The QR encodes the check-in URL: {APP_URL}/check-in/{ticket_token}
 */
export async function generateTicketQRCode(ticketToken: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", qrCode: null };

  const admin = createAdminClient();

  // Verify the ticket exists
  const { data: ticket, error: fetchError } = await admin
    .from("tickets")
    .select("id, qr_code, user_id, event_id")
    .eq("ticket_token", ticketToken)
    .maybeSingle();

  if (fetchError || !ticket) {
    return { error: "Ticket not found", qrCode: null };
  }

  // Verify caller owns the ticket or is a collective member (check-in staff)
  if (ticket.user_id !== user.id) {
    const { data: event } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", ticket.event_id)
      .maybeSingle();
    const { count } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event?.collective_id ?? "")
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!count) return { error: "Not authorized", qrCode: null };
  }

  // If QR code already exists, return it
  if (ticket.qr_code) {
    return { error: null, qrCode: ticket.qr_code };
  }

  const checkInUrl = `${BASE_URL}/check-in/${ticketToken}`;

  // Generate QR code as data URL (PNG)
  const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
    width: 400,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
    errorCorrectionLevel: "H",
  });

  // Persist the QR code to the ticket record
  const { error: updateError } = await admin
    .from("tickets")
    .update({ qr_code: qrDataUrl })
    .eq("id", ticket.id);

  if (updateError) {
    console.error("[tickets] Failed to save QR code:", updateError);
    return { error: "Failed to save QR code", qrCode: null };
  }

  return { error: null, qrCode: qrDataUrl };
}

/**
 * Bulk-generate QR codes for an array of ticket tokens.
 * Used by the Stripe webhook after ticket creation.
 */
export async function generateQRCodesForTokens(tokens: string[]) {
  const results = await Promise.allSettled(
    tokens.map((token) => generateTicketQRCode(token))
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(
      `[tickets] ${failures.length}/${tokens.length} QR code generations failed`
    );
  }

  return results;
}

/**
 * Fetch a ticket with its event and tier details by token.
 */
export async function getTicketByToken(ticketToken: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", ticket: null };

  const admin = createAdminClient();

  const { data: ticket, error } = await admin
    .from("tickets")
    .select(
      `
      id,
      ticket_token,
      user_id,
      status,
      price_paid,
      currency,
      qr_code,
      checked_in_at,
      metadata,
      created_at,
      events:event_id (
        id,
        title,
        slug,
        starts_at,
        ends_at,
        doors_at,
        venues:venue_id (
          name,
          address,
          city
        )
      ),
      ticket_tiers:ticket_tier_id (
        name,
        price
      )
    `
    )
    .eq("ticket_token", ticketToken)
    .maybeSingle();

  if (error || !ticket) {
    return { error: "Ticket not found", ticket: null };
  }

  // Verify the caller owns this ticket
  if (ticket.user_id && ticket.user_id !== user.id) {
    return { error: "Not authorized to view this ticket", ticket: null };
  }

  return { error: null, ticket };
}

/**
 * Look up tickets by Stripe checkout session ID.
 */
export async function getTicketsBySessionId(sessionOrPaymentId: string) {
  // This is called from the public success page — buyer may not be logged in.
  // The session/payment ID itself acts as proof of purchase (only the buyer has it).
  if (!sessionOrPaymentId || sessionOrPaymentId.length < 10) {
    return { error: "Invalid session ID", tickets: null };
  }

  const admin = createAdminClient();

  // Try checkout_session_id first (Stripe Checkout Sessions flow)
  const { data: sessionTickets } = await admin
    .from("tickets")
    .select("ticket_token, status, created_at")
    .filter("metadata->>checkout_session_id", "eq", sessionOrPaymentId);

  if (sessionTickets && sessionTickets.length > 0) {
    return { error: null, tickets: sessionTickets };
  }

  // Try payment_intent_id in metadata (embedded PaymentElement flow)
  const { data: piMetaTickets } = await admin
    .from("tickets")
    .select("ticket_token, status, created_at")
    .filter("metadata->>payment_intent_id", "eq", sessionOrPaymentId);

  if (piMetaTickets && piMetaTickets.length > 0) {
    return { error: null, tickets: piMetaTickets };
  }

  // Try stripe_payment_intent_id column directly
  const { data: piTickets } = await admin
    .from("tickets")
    .select("ticket_token, status, created_at")
    .eq("stripe_payment_intent_id", sessionOrPaymentId);

  if (piTickets && piTickets.length > 0) {
    return { error: null, tickets: piTickets };
  }

  return { error: null, tickets: [] };
}

/**
 * Fulfill tickets after a successful embedded payment (PaymentElement flow).
 * This is the PRIMARY ticket creation path — called directly from the client
 * after stripe.confirmPayment() succeeds. The webhook serves as a backup.
 *
 * Security: Verifies the PaymentIntent with Stripe before creating tickets,
 * so a client can't forge a request.
 */
export async function fulfillPaymentIntent(paymentIntentId: string) {
  if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) {
    return { error: "Invalid payment intent ID", tickets: null };
  }

  const admin = createAdminClient();

  // IDEMPOTENCY: If tickets already exist for this PI, return them
  const { data: existingTickets } = await admin
    .from("tickets")
    .select("ticket_token, status, created_at")
    .eq("stripe_payment_intent_id", paymentIntentId);

  if (existingTickets && existingTickets.length > 0) {
    return { error: null, tickets: existingTickets };
  }

  // Verify the PaymentIntent with Stripe — this is the security check
  const { getStripe } = await import("@/lib/stripe");
  let pi;
  try {
    pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
  } catch {
    return { error: "Could not verify payment", tickets: null };
  }

  if (pi.status !== "succeeded") {
    return { error: `Payment status is ${pi.status}, not succeeded`, tickets: null };
  }

  const metadata = pi.metadata;
  if (!metadata?.eventId || !metadata?.tierId || !metadata?.quantity) {
    return { error: "Missing ticket metadata on payment", tickets: null };
  }

  const eventId = metadata.eventId;
  const tierId = metadata.tierId;
  const quantity = parseInt(metadata.quantity, 10);
  if (isNaN(quantity) || quantity < 1) {
    return { error: "Invalid quantity", tickets: null };
  }
  const buyerEmail = metadata.buyerEmail || pi.receipt_email;

  // Get tier price for record
  const { data: tier } = await admin
    .from("ticket_tiers")
    .select("price")
    .eq("id", tierId)
    .maybeSingle();

  if (!tier) {
    return { error: "Ticket tier not found", tickets: null };
  }

  // Calculate price paid (accounting for discounts)
  let pricePaid: number;
  if (metadata.ticketPriceCents) {
    pricePaid = Number(metadata.ticketPriceCents) / 100;
  } else if (metadata.discountCents) {
    pricePaid = Math.max(Number(tier.price) - Number(metadata.discountCents) / 100, 0);
  } else {
    pricePaid = Number(tier.price);
  }

  // Validate referrer
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let referrerToken = metadata.referrerToken && uuidRegex.test(metadata.referrerToken) ? metadata.referrerToken : null;
  if (referrerToken) {
    const { data: referrerUser } = await admin.from("users").select("id").eq("id", referrerToken).maybeSingle();
    if (!referrerUser) referrerToken = null;
  }

  // Use the base USD price for the ticket record (organizer always sees USD)
  const ticketCurrency = metadata.baseCurrency || pi.currency || "usd";

  const { randomUUID } = await import("crypto");
  const tickets = Array.from({ length: quantity }, () => ({
    event_id: eventId,
    ticket_tier_id: tierId,
    user_id: null,
    status: "paid" as const,
    price_paid: pricePaid,
    currency: ticketCurrency,
    stripe_payment_intent_id: paymentIntentId,
    ticket_token: randomUUID(),
    referred_by: referrerToken,
    metadata: {
      payment_intent_id: paymentIntentId,
      customer_email: buyerEmail,
      fulfilled_by: "client_action",
      ...(referrerToken && { referrer_token: referrerToken }),
    },
  }));

  // RACE CONDITION PROTECTION: Acquire a transaction-scoped advisory lock keyed on this
  // payment intent ID before inserting, so concurrent client fulfillment + webhook can't
  // both create tickets. The lock auto-releases when the DB operation completes.
  // We reuse the existing acquire_ticket_lock function (which calls pg_advisory_xact_lock
  // with hashtext of the input) — passing the PI ID as the lock key.
  // Errors are intentionally ignored — if the lock RPC fails the idempotency
  // check below still prevents duplicate ticket creation.
  await admin.rpc("acquire_ticket_lock", { p_tier_id: paymentIntentId });

  // Re-check for existing tickets AFTER acquiring the lock (prevents double-creation race)
  const { data: postLockTickets } = await admin
    .from("tickets")
    .select("ticket_token, status, created_at")
    .eq("stripe_payment_intent_id", paymentIntentId);

  if (postLockTickets && postLockTickets.length > 0) {
    // Webhook already created tickets while we were waiting for the lock
    return { error: null, tickets: postLockTickets };
  }

  const { data: insertedTickets, error: insertError } = await admin
    .from("tickets")
    .insert(tickets)
    .select("id, ticket_token, status, created_at");

  if (insertError) {
    console.error("[fulfillPaymentIntent] Insert failed:", insertError);
    void logPaymentEvent({
      event_type: "fulfillment_failed",
      payment_intent_id: paymentIntentId,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: Math.round(pricePaid * quantity * 100),
      currency: ticketCurrency,
      buyer_email: buyerEmail ?? null,
      error_message: insertError.message,
      metadata: { fulfilled_by: "client_action" },
    });
    // Check if tickets were created by webhook in the meantime
    const { data: retryTickets } = await admin
      .from("tickets")
      .select("ticket_token, status, created_at")
      .eq("stripe_payment_intent_id", paymentIntentId);
    if (retryTickets && retryTickets.length > 0) {
      return { error: null, tickets: retryTickets };
    }
    return { error: "Failed to create tickets", tickets: null };
  }

  console.info(`[fulfillPaymentIntent] Created ${quantity} ticket(s) for PI ${paymentIntentId}`);

  void logPaymentEvent({
    event_type: "tickets_fulfilled",
    payment_intent_id: paymentIntentId,
    event_id: eventId,
    tier_id: tierId,
    quantity,
    amount_cents: Math.round(pricePaid * quantity * 100),
    currency: ticketCurrency,
    buyer_email: buyerEmail ?? null,
    metadata: { fulfilled_by: "client_action" },
  });

  // Analytics tracking (non-blocking, fire-and-forget)
  {
    const { trackTicketSold, upsertAttendeeProfile } = await import("@/lib/analytics");
    trackTicketSold(eventId, quantity, pricePaid * quantity);
    if (buyerEmail) {
      (async () => {
        try {
          const { data: eventForAnalytics } = await admin
            .from("events")
            .select("collective_id")
            .eq("id", eventId)
            .maybeSingle();
          if (eventForAnalytics?.collective_id) {
            upsertAttendeeProfile(eventForAnalytics.collective_id, buyerEmail, eventId, pricePaid * quantity);
          }
        } catch { /* non-critical */ }
      })();
    }
  }

  // Generate QR codes FIRST, then send email with QR codes embedded
  const QRCodeLib = (await import("qrcode")).default;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  if (insertedTickets) {
    // Generate all QR codes and collect data URLs
    const qrResults = await Promise.allSettled(
      insertedTickets.map(async (ticket) => {
        const qrDataUrl = await QRCodeLib.toDataURL(
          `${appUrl}/check-in/${ticket.ticket_token}`,
          { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "H" }
        );
        // Persist QR to DB
        await admin.from("tickets").update({ qr_code: qrDataUrl }).eq("id", ticket.id);
        return qrDataUrl;
      })
    );

    const qrCodes = qrResults
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    // Send confirmation email WITH QR codes inline
    if (buyerEmail) {
      (async () => {
        try {
          const { data: event } = await admin
            .from("events")
            .select("title, starts_at, venues(name)")
            .eq("id", eventId)
            .maybeSingle();

          const { data: tierInfo } = await admin
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
              ticketLink: `${appUrl}/ticket/${insertedTickets[0]?.ticket_token || ""}`,
              qrCodes: qrCodes.length > 0 ? qrCodes : undefined,
            });
            console.info("[fulfillPaymentIntent] Confirmation email sent with QR codes");
          }
        } catch (err) {
          console.error("[fulfillPaymentIntent] Email failed:", err);
        }
      })();
    }
  }

  return {
    error: null,
    tickets: (insertedTickets ?? []).map((t) => ({
      ticket_token: t.ticket_token,
      status: t.status,
      created_at: t.created_at,
    })),
  };
}
