"use server";

import QRCode from "qrcode";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { logPaymentEvent } from "@/lib/payment-events";
import type { Json } from "@/lib/supabase/database.types";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

// In-memory rate limit for fulfillPaymentIntent: max 5 calls per minute per PI ID
// NOTE: This rate limit is per-serverless-instance (resets on cold start).
// It's a best-effort guard against rapid client retries, not a global rate limit.
// The real protection is Stripe PaymentIntent verification + DB idempotency checks.
const fulfillRateLimit = new Map<string, number[]>();
const FULFILL_RATE_LIMIT = 5;
const FULFILL_RATE_WINDOW_MS = 60_000;

function checkFulfillRateLimit(paymentIntentId: string): boolean {
  const now = Date.now();
  const timestamps = fulfillRateLimit.get(paymentIntentId) ?? [];
  // Remove expired entries
  const recent = timestamps.filter((t) => now - t < FULFILL_RATE_WINDOW_MS);
  if (recent.length >= FULFILL_RATE_LIMIT) {
    fulfillRateLimit.set(paymentIntentId, recent);
    return false;
  }
  recent.push(now);
  fulfillRateLimit.set(paymentIntentId, recent);
  return true;
}

/**
 * Generate a QR code data URL for a ticket and persist it.
 * The QR encodes the check-in URL: {APP_URL}/check-in/{qr_code}
 * In the new schema, tickets.qr_code stores the UUID token.
 */
export async function generateTicketQRCode(ticketToken: string) {
  try {
  // Verify caller is authenticated and owns this ticket
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", qrCode: null };

  const admin = createAdminClient();

  // In the new schema, qr_code holds the UUID token value
  const { data: ticket, error: fetchError } = await admin
    .from("tickets")
    .select("id, qr_code, holder_party_id, event_id")
    .eq("qr_code", ticketToken)
    .maybeSingle();

  if (fetchError || !ticket) {
    return { error: "Ticket not found", qrCode: null };
  }

  // If the holder is linked to a party, verify access via the user's party_id
  if (ticket.holder_party_id) {
    const { data: userRow } = await admin
      .from("users")
      .select("party_id")
      .eq("id", user.id)
      .maybeSingle();
    // If the user has a party and it doesn't match the holder's party, deny access
    if (userRow?.party_id && userRow.party_id !== ticket.holder_party_id) {
      return { error: "You don't have access to this ticket", qrCode: null };
    }
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

  // qr_code column stores the UUID token, not the image — return the generated image
  return { error: null, qrCode: qrDataUrl };
  } catch (err) {
    console.error("[generateTicketQRCode] Unexpected error:", err);
    return { error: "Something went wrong", qrCode: null };
  }
}

/**
 * Fetch a ticket with its event and tier details by token (qr_code UUID).
 * If the user is authenticated, verifies ownership.
 * If not authenticated, returns limited public data (for check-in page / ticket view).
 * Returns a shape compatible with existing callers that cast via `as unknown as`.
 */
// TODO(audit): defense-in-depth gap — add isValidUUID(ticketToken) guard. Current callers validate upstream, but any new caller introduces regression.
export async function getTicketByToken(ticketToken: string) {
  try {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // Join through order_lines → orders to get price/payment data
  const { data: ticket, error } = await admin
    .from("tickets")
    .select(
      `
      id,
      qr_code,
      holder_party_id,
      status,
      issued_at,
      created_at,
      event_id,
      tier_id,
      order_line_id,
      events:event_id (
        id,
        title,
        slug,
        status,
        starts_at,
        ends_at,
        doors_at,
        venue_name,
        venue_address,
        city
      ),
      ticket_tiers:tier_id (
        name,
        price
      ),
      order_lines:order_line_id (
        id,
        unit_price,
        subtotal,
        orders:order_id (
          id,
          stripe_payment_intent_id,
          currency,
          metadata,
          party_id
        )
      )
    `
    )
    .eq("qr_code", ticketToken)
    .maybeSingle();

  if (error || !ticket) {
    return { error: "Ticket not found", ticket: null };
  }

  // Resolve the linked order for price and metadata
  const orderLine = ticket.order_lines as unknown as {
    id: string;
    unit_price: number;
    subtotal: number;
    orders: {
      id: string;
      stripe_payment_intent_id: string | null;
      currency: string;
      metadata: Record<string, unknown> | null;
      party_id: string;
    } | null;
  } | null;

  const order = orderLine?.orders ?? null;
  const pricePaid = orderLine?.unit_price ?? null;
  const currency = order?.currency ?? "cad";
  const orderMetadata = order?.metadata ?? null;

  // Look up checked_in_at from ticket_events (the audit log)
  const { data: checkInEvent } = await admin
    .from("ticket_events")
    .select("occurred_at")
    .eq("ticket_id", ticket.id)
    .eq("event_type", "checked_in")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const checkedInAt = checkInEvent?.occurred_at ?? null;

  // If authenticated, verify ownership or collective membership
  if (user && ticket.holder_party_id) {
    const { data: userRow } = await admin
      .from("users")
      .select("party_id")
      .eq("id", user.id)
      .maybeSingle();

    const isOwner = userRow?.party_id && userRow.party_id === ticket.holder_party_id;

    if (!isOwner) {
      // Check if user is a collective member (staff viewing for check-in)
      const eventData = ticket.events as unknown as { id: string } | null;
      const { data: event } = await admin
        .from("events")
        .select("collective_id")
        .eq("id", eventData?.id ?? "")
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
  }

  // Include metadata for any authenticated user (staff or owner already verified above)
  const shouldIncludeMetadata = !!user;

  // Reshape events to include a synthesized `venues` object for backward-compat with callers
  // Events now store venue_name/venue_address directly; callers expect events.venues.{name,address,city}
  const rawEvent = ticket.events as unknown as {
    id: string;
    title: string;
    slug: string;
    status: string;
    starts_at: string;
    ends_at: string | null;
    doors_at: string | null;
    venue_name: string | null;
    venue_address: string | null;
    city: string | null;
  } | null;

  const shapedEvent = rawEvent
    ? {
        id: rawEvent.id,
        title: rawEvent.title,
        slug: rawEvent.slug,
        status: rawEvent.status,
        starts_at: rawEvent.starts_at,
        ends_at: rawEvent.ends_at,
        doors_at: rawEvent.doors_at,
        venues: rawEvent.venue_name
          ? { name: rawEvent.venue_name, address: rawEvent.venue_address ?? "", city: rawEvent.city ?? "" }
          : null,
      }
    : null;

  // Build backward-compatible return shape
  // Callers cast via `as unknown as {...}` so we can include extra aliased fields
  const shaped = {
    id: ticket.id,
    ticket_token: ticket.qr_code,          // alias for callers expecting ticket_token
    qr_code: ticket.qr_code,
    holder_party_id: ticket.holder_party_id,
    user_id: null,                          // removed; kept as null for compat
    status: ticket.status,
    price_paid: pricePaid,                  // sourced from order_lines.unit_price
    currency,
    checked_in_at: checkedInAt,            // sourced from ticket_events
    metadata: shouldIncludeMetadata ? orderMetadata : null,
    created_at: ticket.created_at,
    events: shapedEvent,
    ticket_tiers: ticket.ticket_tiers,
  };

  if (!shouldIncludeMetadata) {
    return { error: null, ticket: { ...shaped, metadata: null } };
  }
  return { error: null, ticket: shaped };
  } catch (err) {
    console.error("[getTicketByToken] Unexpected error:", err);
    return { error: "Something went wrong", ticket: null };
  }
}

/**
 * Look up tickets by Stripe payment intent ID.
 * Resolves via orders.stripe_payment_intent_id → order_lines → tickets.
 */
export async function getTicketsBySessionId(sessionOrPaymentId: string) {
  try {
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

  // Look up the order by stripe_payment_intent_id, then join through order_lines to tickets
  const { data: orders } = await admin
    .from("orders")
    .select(`
      id,
      stripe_payment_intent_id,
      currency,
      metadata,
      order_lines (
        id,
        unit_price,
        tier_id,
        tickets:tickets!tickets_order_line_id_fkey (
          id,
          qr_code,
          status,
          created_at,
          event_id,
          tier_id,
          ticket_tiers:tier_id (name, price),
          events:event_id (id, title, starts_at, venue_name, city)
        )
      )
    `)
    .eq("stripe_payment_intent_id", sessionOrPaymentId);

  if (orders && orders.length > 0) {
    // Flatten tickets from all order lines
    const tickets = orders.flatMap((o) =>
      (o.order_lines ?? []).flatMap((ol) => {
        const lineTickets = (ol.tickets as unknown as Array<{
          id: string;
          qr_code: string | null;
          status: string;
          created_at: string;
          event_id: string;
          tier_id: string;
          ticket_tiers: { name: string; price: number } | null;
          events: { id: string; title: string; starts_at: string; venue_name: string | null; city: string | null } | null;
        }>) ?? [];
        return lineTickets.map((t) => ({
          ticket_token: t.qr_code,
          status: t.status,
          created_at: t.created_at,
          price_paid: ol.unit_price,
          ticket_tiers: t.ticket_tiers,
          events: t.events,
        }));
      })
    );
    if (tickets.length > 0) {
      return { error: null, tickets };
    }
  }

  // Also try metadata-based lookup for checkout session IDs (Stripe Checkout flow)
  const { data: metaOrders } = await admin
    .from("orders")
    .select(`
      id,
      currency,
      metadata,
      order_lines (
        id,
        unit_price,
        tickets:tickets!tickets_order_line_id_fkey (
          id,
          qr_code,
          status,
          created_at,
          event_id,
          tier_id,
          ticket_tiers:tier_id (name, price),
          events:event_id (id, title, starts_at, venue_name, city)
        )
      )
    `)
    .filter("metadata->>checkout_session_id", "eq", sessionOrPaymentId);

  if (metaOrders && metaOrders.length > 0) {
    const tickets = metaOrders.flatMap((o) =>
      (o.order_lines ?? []).flatMap((ol) => {
        const lineTickets = (ol.tickets as unknown as Array<{
          id: string;
          qr_code: string | null;
          status: string;
          created_at: string;
          event_id: string;
          tier_id: string;
          ticket_tiers: { name: string; price: number } | null;
          events: { id: string; title: string; starts_at: string; venue_name: string | null; city: string | null } | null;
        }>) ?? [];
        return lineTickets.map((t) => ({
          ticket_token: t.qr_code,
          status: t.status,
          created_at: t.created_at,
          price_paid: ol.unit_price,
          ticket_tiers: t.ticket_tiers,
          events: t.events,
        }));
      })
    );
    if (tickets.length > 0) {
      return { error: null, tickets };
    }
  }

  return { error: null, tickets: [] };
  } catch (err) {
    console.error("[getTicketsBySessionId] Unexpected error:", err);
    return { error: "Something went wrong", tickets: null };
  }
}

/**
 * Send ticket confirmation email with QR codes.
 * Extracted as a helper so ALL fulfillment paths (success, retry, idempotent)
 * can send the email — not just the happy path.
 */
async function sendConfirmationEmail(params: {
  admin: ReturnType<typeof createAdminClient>;
  ticketTokens: string[];
  ticketIds?: string[]; // kept for call-site compat, unused in new schema
  eventId: string;
  tierId: string;
  buyerEmail: string;
  quantity: number;
  pricePaid: number;
  orderId?: string;
}) {
  const { admin, ticketTokens, eventId, tierId, buyerEmail, quantity, pricePaid, orderId } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  try {
    // Dedup check: if any order already has confirmation_email_sent flag, skip
    if (orderId) {
      const { data: orderCheck } = await admin
        .from("orders")
        .select("id, metadata")
        .eq("id", orderId)
        .maybeSingle();
      if (orderCheck?.metadata && typeof orderCheck.metadata === "object" &&
          (orderCheck.metadata as Record<string, unknown>).confirmation_email_sent === true) {
        console.info("[sendConfirmationEmail] Email already sent, skipping duplicate");
        return;
      }
    }

    // Generate QR codes for each ticket token (the token IS the qr_code UUID)
    const QRCodeLib = (await import("qrcode")).default;
    const qrCodes: string[] = [];

    const qrResults = await Promise.allSettled(
      ticketTokens.map(async (token) => {
        const qrDataUrl = await QRCodeLib.toDataURL(
          `${appUrl}/check-in/${token}`,
          { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "H" }
        );
        return qrDataUrl;
      })
    );

    for (const r of qrResults) {
      if (r.status === "fulfilled") qrCodes.push(r.value);
    }

    // Fetch event + tier info for email
    const [{ data: event }, { data: tierInfo }] = await Promise.all([
      admin.from("events").select("title, starts_at, venue_name").eq("id", eventId).maybeSingle(),
      admin.from("ticket_tiers").select("name").eq("id", tierId).maybeSingle(),
    ]);

    if (!event) {
      console.error("[fulfillPaymentIntent] Event not found for email, skipping");
      return;
    }

    const { sendTicketConfirmation } = await import("@/lib/email/actions");
    await sendTicketConfirmation({
      to: buyerEmail,
      eventTitle: event.title || "Event",
      eventDate: new Date(event.starts_at).toLocaleDateString("en", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      }),
      venueName: event.venue_name || "TBA",
      tierName: tierInfo?.name || "General Admission",
      quantity,
      totalPrice: `$${(pricePaid * quantity).toFixed(2)}`,
      ticketLink: `${appUrl}/ticket/${ticketTokens[0] || ""}`,
      qrCodes: qrCodes.length > 0 ? qrCodes : undefined,
      ticketTokens,
    });
    console.info("[fulfillPaymentIntent] Confirmation email sent with QR codes");

    // Mark order as having had email sent (dedup flag for concurrent client+webhook)
    if (orderId) {
      const { data: currentOrder } = await admin
        .from("orders")
        .select("id, metadata")
        .eq("id", orderId)
        .maybeSingle();
      if (currentOrder) {
        await admin
          .from("orders")
          .update({
            metadata: {
              ...((currentOrder.metadata as Record<string, unknown>) ?? {}),
              confirmation_email_sent: true,
            },
          })
          .eq("id", currentOrder.id)
          .then(() => {}, () => { /* non-blocking */ });
      }
    }
  } catch (err) {
    console.error("[fulfillPaymentIntent] Email failed:", err);
  }
}

/**
 * Fulfill tickets after a successful embedded payment (PaymentElement flow).
 * This is the PRIMARY ticket creation path — called directly from the client
 * after stripe.confirmPayment() succeeds. The webhook serves as a backup.
 *
 * New schema: creates orders → order_lines → tickets.
 * Security: Verifies the PaymentIntent with Stripe before creating tickets,
 * so a client can't forge a request.
 */
export async function fulfillPaymentIntent(paymentIntentId: string) {
  try {
  if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) {
    return { error: "Invalid payment intent ID", tickets: null };
  }

  // Rate limit: 5 calls per minute per PaymentIntent ID to prevent abuse
  if (!checkFulfillRateLimit(paymentIntentId)) {
    return { error: "Too many requests for this payment. Please wait a moment.", tickets: null };
  }

  const admin = createAdminClient();

  // IDEMPOTENCY: If an order + tickets already exist for this PI, return them
  const { data: existingOrder } = await admin
    .from("orders")
    .select(`
      id,
      status,
      metadata,
      currency,
      order_lines (
        id,
        unit_price,
        tier_id,
        tickets:tickets!tickets_order_line_id_fkey (
          id,
          qr_code,
          status,
          created_at
        )
      )
    `)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .in("status", ["paid"])
    .maybeSingle();

  if (existingOrder) {
    const existingTickets = (existingOrder.order_lines ?? []).flatMap((ol) =>
      (ol.tickets as unknown as Array<{ id: string; qr_code: string | null; status: string; created_at: string }>) ?? []
    );

    if (existingTickets.length > 0) {
      // Tickets exist (from webhook or earlier call) — ensure email was sent
      const orderMeta = existingOrder.metadata as Record<string, unknown> | null;
      const customerEmail = orderMeta?.customer_email as string | undefined;
      const emailAlreadySent = orderMeta?.confirmation_email_sent === true;

      if (customerEmail && !emailAlreadySent) {
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
            ticketTokens: existingTickets.map((t) => t.qr_code ?? ""),
            ticketIds: existingTickets.map((t) => t.id),
            eventId: meta?.eventId || "",
            tierId: meta?.tierId || "",
            buyerEmail: customerEmail,
            quantity: existingTickets.length,
            pricePaid,
            orderId: existingOrder.id,
          });
        } catch (err) {
          console.error("[fulfillPaymentIntent] Email recovery failed:", err);
        }
      }
      return {
        error: null,
        tickets: existingTickets.map((t) => ({
          ticket_token: t.qr_code ?? "",
          status: t.status,
          created_at: t.created_at,
        })),
      };
    }
  }

  // Verify the PaymentIntent with Stripe — this is the security check (with retry)
  const { getStripe } = await import("@/lib/stripe");
  let pi;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
      break;
    } catch (stripeErr) {
      console.error(`[fulfillPaymentIntent] Stripe retrieve attempt ${attempt + 1} failed:`, stripeErr);
      if (attempt === 2) return { error: "Could not verify payment — please refresh the page", tickets: null };
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // 1s, 2s backoff
    }
  }

  if (!pi || pi.status !== "succeeded") {
    return { error: "Payment has not succeeded yet. Please try again.", tickets: null };
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

  const ticketCurrency = metadata.baseCurrency || pi.currency || "cad";

  // Resolve the buyer's party_id (required for orders.party_id)
  // If we have a buyer user_id in metadata, look up their party; otherwise create/find a guest party
  let buyerPartyId: string | null = null;
  if (metadata.userId) {
    const { data: buyerUser } = await admin
      .from("users")
      .select("party_id")
      .eq("id", metadata.userId)
      .maybeSingle();
    buyerPartyId = buyerUser?.party_id ?? null;
  }

  // If no party resolved, try to find an existing party by email (via party_contact_methods) or create one
  if (!buyerPartyId && buyerEmail) {
    const { data: existingContact } = await admin
      .from("party_contact_methods")
      .select("party_id")
      .eq("type", "email")
      .eq("value", buyerEmail)
      .limit(1)
      .maybeSingle();
    if (existingContact) {
      buyerPartyId = existingContact.party_id;
    } else {
      // Create a new guest party with a display name derived from email
      const displayName = buyerEmail.split("@")[0] || "Guest";
      const { data: newParty } = await admin
        .from("parties")
        .insert({ display_name: displayName, type: "person" as const })
        .select("id")
        .single();
      if (newParty) {
        buyerPartyId = newParty.id;
        // Record email as a contact method
        void admin
          .from("party_contact_methods")
          .insert({ party_id: newParty.id, type: "email" as const, value: buyerEmail, is_primary: true })
          .then(() => {}, () => { /* non-blocking */ });
      }
    }
  }

  if (!buyerPartyId) {
    return { error: "Could not resolve buyer identity", tickets: null };
  }

  const subtotal = pricePaid * quantity;
  const platformFee = subtotal * 0.07 + quantity * 0.50;
  const stripeFee = subtotal * 0.029 + 0.30;
  const total = subtotal;

  const orderMetadata: Json = {
    payment_intent_id: paymentIntentId,
    customer_email: buyerEmail ?? null,
    fulfilled_by: "client_action",
    ...(referrerToken && { referrer_token: referrerToken }),
  };

  // Try to update a pending order if one exists (created at checkout)
  let orderId: string | null = null;
  let orderLineId: string | null = null;

  const { data: pendingOrder } = await admin
    .from("orders")
    .select("id, order_lines(id, tier_id)")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingOrder) {
    // Update existing pending order to paid
    await admin
      .from("orders")
      .update({ status: "paid", metadata: orderMetadata })
      .eq("id", pendingOrder.id);
    orderId = pendingOrder.id;
    const matchedLine = (pendingOrder.order_lines as unknown as Array<{ id: string; tier_id: string }>)
      ?.find((ol) => ol.tier_id === tierId);
    orderLineId = matchedLine?.id ?? null;
  } else {
    // Create a new order
    const { data: newOrder, error: orderError } = await admin
      .from("orders")
      .insert({
        party_id: buyerPartyId,
        event_id: eventId,
        stripe_payment_intent_id: paymentIntentId,
        promo_code_id: metadata.promoId || null,
        subtotal,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total,
        currency: ticketCurrency,
        status: "paid",
        metadata: orderMetadata,
      })
      .select("id")
      .single();

    if (orderError || !newOrder) {
      console.error("[fulfillPaymentIntent] Order creation failed:", orderError);
      return { error: "Failed to create order", tickets: null };
    }
    orderId = newOrder.id;

    // Create the order line
    const { data: newOrderLine, error: olError } = await admin
      .from("order_lines")
      .insert({
        order_id: orderId,
        tier_id: tierId,
        quantity,
        unit_price: pricePaid,
        subtotal,
      })
      .select("id")
      .single();

    if (olError || !newOrderLine) {
      console.error("[fulfillPaymentIntent] Order line creation failed:", olError);
      return { error: "Failed to create order line", tickets: null };
    }
    orderLineId = newOrderLine.id;
  }

  // Generate ticket UUIDs (qr_code = the UUID token)
  const { randomUUID } = await import("crypto");
  const now = new Date().toISOString();
  const ticketRows = Array.from({ length: quantity }, () => ({
    event_id: eventId,
    tier_id: tierId,
    order_line_id: orderLineId,
    holder_party_id: buyerPartyId,
    qr_code: randomUUID(),
    status: "valid" as const,
    issued_at: now,
  }));

  // Check for existing tickets on this order line (idempotency)
  if (orderLineId) {
    const { data: existingLineTickets } = await admin
      .from("tickets")
      .select("id, qr_code, status, created_at")
      .eq("order_line_id", orderLineId);

    if (existingLineTickets && existingLineTickets.length > 0) {
      console.info(`[fulfillPaymentIntent] Tickets already exist for order line ${orderLineId}`);
      // Ensure email was sent
      if (buyerEmail) {
        await sendConfirmationEmail({
          admin,
          ticketTokens: existingLineTickets.map((t) => t.qr_code ?? ""),
          ticketIds: existingLineTickets.map((t) => t.id),
          eventId, tierId, buyerEmail, quantity, pricePaid, orderId: orderId ?? undefined,
        });
      }
      return {
        error: null,
        tickets: existingLineTickets.map((t) => ({
          ticket_token: t.qr_code ?? "",
          status: t.status,
          created_at: t.created_at,
        })),
      };
    }
  }

  // Insert tickets
  const { data: insertedTickets, error: insertError } = await admin
    .from("tickets")
    .insert(ticketRows)
    .select("id, qr_code, status, created_at");

  if (insertError || !insertedTickets) {
    console.error("[fulfillPaymentIntent] Insert failed:", insertError);
    void logPaymentEvent({
      stripe_event_id: `fulfillment_failed:${paymentIntentId}`,
      event_type: "fulfillment_failed",
      stripe_payment_intent_id: paymentIntentId,
      event_id: eventId,
      order_id: orderId ?? null,
      amount: pricePaid * quantity,
      currency: ticketCurrency,
      customer_email: buyerEmail ?? null,
      status: "failed",
      metadata: {
        tier_id: tierId,
        quantity,
        error: insertError?.message ?? "Unknown insert error",
        fulfilled_by: "client_action",
      },
    });
    return { error: "Failed to create tickets", tickets: null };
  }

  console.info(`[fulfillPaymentIntent] Created ${quantity} ticket(s) for PI ${paymentIntentId}`);

  // Insert ticket_events audit records for each ticket
  void admin
    .from("ticket_events")
    .insert(
      insertedTickets.map((t) => ({
        ticket_id: t.id,
        event_type: "purchased" as const,
        party_id: buyerPartyId,
        metadata: {
          payment_intent_id: paymentIntentId,
          customer_email: buyerEmail ?? null,
          price_paid: pricePaid,
          currency: ticketCurrency,
        },
      }))
    )
    .then(() => {}, (e: unknown) => console.error("[fulfillPaymentIntent] ticket_events insert failed (non-blocking):", e));

  // Claim promo code uses AFTER successful ticket creation
  if (metadata.promoId && metadata.promoCode) {
    try {
      await admin.rpc("claim_promo_code", { p_code: metadata.promoCode, p_event_id: eventId });
    } catch (promoErr) {
      console.error("[fulfillPaymentIntent] Failed to claim promo uses (non-blocking):", promoErr);
    }
  }

  void logPaymentEvent({
    stripe_event_id: `tickets_fulfilled:${paymentIntentId}`,
    event_type: "tickets_fulfilled",
    stripe_payment_intent_id: paymentIntentId,
    event_id: eventId,
    order_id: orderId ?? null,
    amount: pricePaid * quantity,
    currency: ticketCurrency,
    customer_email: buyerEmail ?? null,
    status: "succeeded",
    metadata: { tier_id: tierId, quantity, fulfilled_by: "client_action" },
  });

  // Analytics tracking
  try {
    const { trackTicketSold } = await import("@/lib/analytics");
    trackTicketSold(tierId, quantity);
  } catch (analyticsErr) {
    console.error("[fulfillPaymentIntent] Analytics tracking failed (non-blocking):", analyticsErr);
  }

  // Send confirmation email with QR codes — AWAITED so serverless doesn't kill it
  if (buyerEmail) {
    await sendConfirmationEmail({
      admin,
      ticketTokens: insertedTickets.map((t) => t.qr_code ?? ""),
      ticketIds: insertedTickets.map((t) => t.id),
      eventId, tierId, buyerEmail, quantity, pricePaid, orderId: orderId ?? undefined,
    });
  }

  // Post-purchase hooks: referral nudge + milestone emails
  if (buyerEmail) {
    try {
      const { runPostPurchaseHooks } = await import("@/app/actions/post-purchase-hooks");
      await runPostPurchaseHooks({
        eventId,
        buyerEmail,
        ticketToken: insertedTickets[0]?.qr_code || "",
      });
    } catch (hookErr) { console.error("[fulfillPaymentIntent] Post-purchase hooks failed (non-blocking):", hookErr); }
  }

  return {
    error: null,
    tickets: insertedTickets.map((t) => ({
      ticket_token: t.qr_code ?? "",
      status: "valid" as const,
      created_at: t.created_at,
    })),
  };
  } catch (err) {
    console.error("[fulfillPaymentIntent] Unexpected error:", err);
    return { error: "Something went wrong", tickets: null };
  }
}
