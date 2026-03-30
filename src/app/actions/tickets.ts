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
 * If the user is authenticated, verifies ownership.
 * If not authenticated, returns limited public data (for check-in page / ticket view).
 */
export async function getTicketByToken(ticketToken: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

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

  // If authenticated, verify ownership (unless ticket is unlinked/guest purchase)
  if (user && ticket.user_id && ticket.user_id !== user.id) {
    // Check if user is a collective member (staff viewing for check-in)
    const { data: event } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", (ticket as unknown as { events: { id: string } | null }).events?.id ?? "")
      .maybeSingle();

    if (event?.collective_id) {
      const { count } = await admin
        .from("collective_members")
        .select("*", { count: "exact", head: true })
        .eq("collective_id", event.collective_id)
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (!count) {
        return { error: "Not authorized to view this ticket", ticket: null };
      }
    } else {
      return { error: "Not authorized to view this ticket", ticket: null };
    }
  }

  // For unauthenticated users, the ticket token itself is the proof of access
  // (only the buyer has the token from their email/success page)
  return { error: null, ticket };
}

/**
 * Look up tickets by Stripe checkout session ID.
 */
export async function getTicketsBySessionId(sessionOrPaymentId: string) {
  // This is called from the public success page — buyer may not be logged in.
  // The session/payment ID itself acts as proof of purchase (only the buyer has it).
  if (!sessionOrPaymentId || sessionOrPaymentId.length < 10 || sessionOrPaymentId.length > 255) {
    return { error: "Invalid session ID", tickets: null };
  }
  // Only allow alphanumeric, underscores, and hyphens (Stripe IDs follow this pattern)
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionOrPaymentId)) {
    return { error: "Invalid session ID format", tickets: null };
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
 * Send ticket confirmation email with QR codes.
 * Extracted as a helper so ALL fulfillment paths (success, retry, idempotent)
 * can send the email — not just the happy path.
 */
async function sendConfirmationEmail(params: {
  admin: ReturnType<typeof createAdminClient>;
  ticketTokens: string[];
  ticketIds?: string[];
  eventId: string;
  tierId: string;
  buyerEmail: string;
  quantity: number;
  pricePaid: number;
}) {
  const { admin, ticketTokens, ticketIds, eventId, tierId, buyerEmail, quantity, pricePaid } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  try {
    // Generate QR codes for tickets that don't have them yet
    const QRCodeLib = (await import("qrcode")).default;
    const qrCodes: string[] = [];

    if (ticketIds && ticketIds.length > 0) {
      const qrResults = await Promise.allSettled(
        ticketIds.map(async (id, i) => {
          // Check if QR already exists
          const { data: existing } = await admin
            .from("tickets")
            .select("qr_code")
            .eq("id", id)
            .maybeSingle();

          if (existing?.qr_code) return existing.qr_code;

          const token = ticketTokens[i] || id;
          const qrDataUrl = await QRCodeLib.toDataURL(
            `${appUrl}/check-in/${token}`,
            { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "H" }
          );
          await admin.from("tickets").update({ qr_code: qrDataUrl }).eq("id", id);
          return qrDataUrl;
        })
      );

      for (const r of qrResults) {
        if (r.status === "fulfilled") qrCodes.push(r.value);
      }
    }

    // Fetch event + tier info for email
    const [{ data: event }, { data: tierInfo }] = await Promise.all([
      admin.from("events").select("title, starts_at, venues(name)").eq("id", eventId).maybeSingle(),
      admin.from("ticket_tiers").select("name").eq("id", tierId).maybeSingle(),
    ]);

    if (!event) {
      console.error("[fulfillPaymentIntent] Event not found for email, skipping");
      return;
    }

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
      ticketLink: `${appUrl}/ticket/${ticketTokens[0] || ""}`,
      qrCodes: qrCodes.length > 0 ? qrCodes : undefined,
      ticketTokens,
    });
    console.info("[fulfillPaymentIntent] Confirmation email sent with QR codes");
  } catch (err) {
    console.error("[fulfillPaymentIntent] Email failed:", err);
  }
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

  // IDEMPOTENCY: If tickets already exist for this PI, send email if needed and return them
  const { data: existingTickets } = await admin
    .from("tickets")
    .select("id, ticket_token, status, created_at, qr_code, metadata")
    .eq("stripe_payment_intent_id", paymentIntentId);

  if (existingTickets && existingTickets.length > 0) {
    // Tickets exist (from webhook or earlier call) — ensure email was sent
    const customerEmail = (existingTickets[0]?.metadata as Record<string, unknown>)?.customer_email as string | undefined;
    if (customerEmail) {
      // Check if a confirmation email was already sent by looking for a QR code
      // (QR + email are always sent together). If no QR, email likely wasn't sent.
      const missingQr = existingTickets.some((t) => !t.qr_code);
      if (missingQr) {
        // Retrieve tier price from Stripe metadata for the email
        try {
          const { getStripe } = await import("@/lib/stripe");
          const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
          const meta = pi.metadata;
          const { data: tier } = await admin.from("ticket_tiers").select("price").eq("id", meta?.tierId || "").maybeSingle();
          let pricePaid = Number(tier?.price ?? 0);
          if (meta?.ticketPriceCents) pricePaid = Number(meta.ticketPriceCents) / 100;
          else if (meta?.discountCents) pricePaid = Math.max(pricePaid - Number(meta.discountCents) / 100, 0);

          await sendConfirmationEmail({
            admin,
            ticketTokens: existingTickets.map((t) => t.ticket_token),
            ticketIds: existingTickets.map((t) => t.id),
            eventId: meta?.eventId || "",
            tierId: meta?.tierId || "",
            buyerEmail: customerEmail,
            quantity: existingTickets.length,
            pricePaid,
          });
        } catch (err) {
          console.error("[fulfillPaymentIntent] Email recovery failed:", err);
        }
      }
    }
    return { error: null, tickets: existingTickets.map((t) => ({ ticket_token: t.ticket_token, status: t.status, created_at: t.created_at })) };
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

  // ATOMIC FULFILLMENT: Use a single DB function that acquires an advisory lock,
  // checks for existing tickets, and inserts — all within one transaction.
  // This prevents race conditions between concurrent client fulfillment + webhook.
  // Falls back to manual insert if the RPC doesn't exist yet (migration not applied).
  let insertedTickets: { id: string; ticket_token: string; is_new?: boolean }[] | null = null;
  let insertError: { message: string } | null = null;
  let wasNewlyCreated = true; // Track if tickets were newly created vs pre-existing

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: atomicResult, error: atomicError } = await (admin as any).rpc("fulfill_tickets_atomic", {
      p_payment_intent_id: paymentIntentId,
      p_event_id: eventId,
      p_tier_id: tierId,
      p_quantity: quantity,
      p_price_paid: pricePaid,
      p_currency: ticketCurrency,
      p_buyer_email: buyerEmail ?? null,
      p_referrer_token: referrerToken,
      p_metadata: {
        payment_intent_id: paymentIntentId,
        customer_email: buyerEmail,
        fulfilled_by: "client_action",
        ...(referrerToken && { referrer_token: referrerToken }),
      },
    });

    if (atomicError) throw atomicError;
    insertedTickets = atomicResult;

    // The atomic function returns is_new=false for pre-existing tickets.
    // Use this deterministic flag to avoid double-counting promo/analytics.
    if (insertedTickets && insertedTickets.length > 0) {
      wasNewlyCreated = insertedTickets[0]?.is_new !== false;
    }
  } catch {
    // Fallback: manual insert (for pre-migration compatibility)
    // Re-check for existing tickets first (idempotency)
    const { data: postLockTickets } = await admin
      .from("tickets")
      .select("id, ticket_token, status, created_at, qr_code")
      .eq("stripe_payment_intent_id", paymentIntentId);

    if (postLockTickets && postLockTickets.length > 0) {
      // Tickets created by webhook — still send email + QR if missing
      if (buyerEmail) {
        await sendConfirmationEmail({
          admin,
          ticketTokens: postLockTickets.map((t) => t.ticket_token),
          ticketIds: postLockTickets.map((t) => t.id),
          eventId, tierId, buyerEmail, quantity, pricePaid,
        });
      }
      return { error: null, tickets: postLockTickets.map((t) => ({ ticket_token: t.ticket_token, status: t.status, created_at: t.created_at })) };
    }

    const result = await admin
      .from("tickets")
      .insert(tickets)
      .select("id, ticket_token, status, created_at");

    insertedTickets = result.data;
    insertError = result.error;
  }

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
      .select("id, ticket_token, status, created_at, qr_code")
      .eq("stripe_payment_intent_id", paymentIntentId);
    if (retryTickets && retryTickets.length > 0) {
      // Tickets exist from webhook — send email before returning
      if (buyerEmail) {
        await sendConfirmationEmail({
          admin,
          ticketTokens: retryTickets.map((t) => t.ticket_token),
          ticketIds: retryTickets.map((t) => t.id),
          eventId, tierId, buyerEmail, quantity, pricePaid,
        });
      }
      return { error: null, tickets: retryTickets.map((t) => ({ ticket_token: t.ticket_token, status: t.status, created_at: t.created_at })) };
    }
    return { error: "Failed to create tickets", tickets: null };
  }

  console.info(`[fulfillPaymentIntent] Created ${quantity} ticket(s) for PI ${paymentIntentId}`);

  // Only claim promo and track analytics if tickets were NEWLY created.
  // If tickets already existed (from webhook), skip to avoid double-counting.
  if (wasNewlyCreated) {
    // Claim promo code uses AFTER successful ticket creation.
    // Uses claim_promo_code RPC which accepts quantity.
    if (metadata.promoId) {
      try {
        await admin.rpc("claim_promo_code", { p_code_id: metadata.promoId, p_quantity: quantity });
      } catch (promoErr) {
        console.error("[fulfillPaymentIntent] Failed to claim promo uses (non-blocking):", promoErr);
      }
    }

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

    // Analytics tracking
    try {
      const { trackTicketSold, upsertAttendeeProfile } = await import("@/lib/analytics");
      trackTicketSold(eventId, quantity, pricePaid * quantity);
      if (buyerEmail) {
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
      }
    } catch (analyticsErr) {
      console.error("[fulfillPaymentIntent] Analytics tracking failed (non-blocking):", analyticsErr);
    }
  } else {
    console.info(`[fulfillPaymentIntent] Tickets pre-existed for PI ${paymentIntentId}, skipping promo/analytics`);
  }

  // Send confirmation email with QR codes — AWAITED so serverless doesn't kill it
  if (buyerEmail && insertedTickets) {
    await sendConfirmationEmail({
      admin,
      ticketTokens: insertedTickets.map((t) => t.ticket_token),
      ticketIds: insertedTickets.map((t) => t.id),
      eventId, tierId, buyerEmail, quantity, pricePaid,
    });
  }

  return {
    error: null,
    tickets: (insertedTickets ?? []).map((t) => ({
      ticket_token: t.ticket_token,
      status: "paid" as const,
      created_at: new Date().toISOString(),
    })),
  };
}
