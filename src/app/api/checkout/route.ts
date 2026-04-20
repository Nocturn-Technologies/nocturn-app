import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import {
  validatePromo,
  isPromoError,
  calculateCheckoutPricing,
} from "@/lib/checkout-helpers";
import { isZeroDecimal } from "@/lib/currency";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

// Currency is hardcoded to CAD after the schema rebuild removed events.currency
const DEFAULT_CURRENCY = "cad";

interface CheckoutBody {
  eventId: string;
  tierId: string;
  quantity: number;
  buyerEmail: string;
  buyerPhone: string;
  promoCode?: string;
  referrerToken?: string;
}

// Phone validation — allow +, digits, spaces, dashes, parens, dots; require 7-15 digits
function validatePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 32) return null;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed;
}

/**
 * Resolve or create a party record for the buyer.
 * If the buyer's email matches a user with a party_id, use that.
 * Otherwise, create a temporary 'person' party so the orders.party_id NOT NULL constraint is satisfied.
 */
async function resolveOrCreateParty(
  supabase: ReturnType<typeof createAdminClient>,
  buyerEmail: string
): Promise<string> {
  // Check if there's a user with this email who has a party_id
  const { data: user } = await supabase
    .from("users")
    .select("party_id")
    .eq("email", buyerEmail)
    .maybeSingle();

  if (user?.party_id) {
    return user.party_id;
  }

  // Create a temporary person party for guest buyers
  const { data: newParty, error } = await supabase
    .from("parties")
    .insert({ type: "person", display_name: buyerEmail })
    .select("id")
    .single();

  if (error || !newParty) {
    throw new Error(`Failed to create guest party: ${error?.message ?? "unknown"}`);
  }

  return newParty.id;
}

export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success } = await rateLimitStrict(`checkout:${clientIp}`, 10, 60000); // 10 requests per minute
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429 }
    );
  }

  let body: CheckoutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    const { eventId, tierId, quantity, promoCode } = body;
    // Normalize email to lowercase to prevent case-variant free ticket bypass
    const buyerEmail = body.buyerEmail?.trim().toLowerCase();
    const buyerPhone = validatePhone(body.buyerPhone);
    // referrerToken must be a valid UUID (user ID from ?ref= link)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let referrerToken = body.referrerToken && uuidRegex.test(body.referrerToken) ? body.referrerToken : undefined;

    if (!eventId || !tierId || !quantity || !buyerEmail) {
      return NextResponse.json(
        { error: "Missing required fields: eventId, tierId, quantity, buyerEmail" },
        { status: 400 }
      );
    }

    if (!buyerPhone) {
      return NextResponse.json(
        { error: "A valid phone number is required" },
        { status: 400 }
      );
    }

    // Validate eventId and tierId as UUIDs to prevent injection/invalid queries
    if (!uuidRegex.test(eventId) || !uuidRegex.test(tierId)) {
      return NextResponse.json({ error: "Invalid event or tier ID" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(buyerEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return NextResponse.json(
        { error: "Quantity must be a whole number between 1 and 10" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Validate referrer user actually exists (prevents FK constraint violation)
    if (referrerToken) {
      const { data: referrerUser } = await supabase.from("users").select("id").eq("id", referrerToken).maybeSingle();
      if (!referrerUser) referrerToken = undefined;
    }

    // Look up the event. Currency is now hardcoded to CAD — the schema no longer
    // has a currency column on events or collectives.
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, slug, collective_id, status")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      console.error("[checkout] Event lookup failed:", eventError?.message);
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    if (event.status === "draft" || event.status === "cancelled" || event.status === "completed") {
      return NextResponse.json(
        { error: "This event is not available for ticket purchases" },
        { status: 400 }
      );
    }

    // Look up the ticket tier (column renames: sales_start → sale_start_at, sales_end → sale_end_at)
    const { data: tier, error: tierError } = await supabase
      .from("ticket_tiers")
      .select("id, name, price, capacity, sale_start_at, sale_end_at, event_id")
      .eq("id", tierId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (tierError || !tier) {
      console.error("[checkout] Tier lookup failed:", tierError?.message);
      return NextResponse.json(
        { error: "Ticket tier not found" },
        { status: 404 }
      );
    }

    // Validate sales window using renamed columns
    const now = new Date();
    if (tier.sale_start_at && new Date(tier.sale_start_at) > now) {
      return NextResponse.json(
        { error: "Ticket sales have not started yet" },
        { status: 400 }
      );
    }
    if (tier.sale_end_at && new Date(tier.sale_end_at) < now) {
      return NextResponse.json(
        { error: "Ticket sales have ended" },
        { status: 400 }
      );
    }

    // Atomic capacity check — lock + count + validate in a single DB transaction
    const supabaseAdmin = createAdminClient();
    const { data: capacityCheckRaw, error: capacityError } = await supabaseAdmin.rpc("check_and_reserve_capacity", {
      p_tier_id: tierId,
      p_quantity: quantity,
    });
    const capacityCheck = capacityCheckRaw as { success: boolean; error?: string; remaining?: number } | null;

    if (capacityError || !capacityCheck?.success) {
      if (capacityError) {
        console.error("[checkout] Capacity check failed:", capacityError.message);
      }
      if (capacityCheck?.error) {
        console.error("[checkout] Capacity check error detail:", capacityCheck.error);
      }
      return NextResponse.json(
        { error: capacityCheck?.remaining !== undefined ? "Tickets unavailable" : "Failed to check capacity" },
        { status: capacityCheck?.remaining !== undefined ? 409 : 500 }
      );
    }

    // Validate tier price
    const basePriceNumber = Number(tier.price);
    if (!Number.isFinite(basePriceNumber) || basePriceNumber < 0) {
      return NextResponse.json({ error: "Invalid ticket price" }, { status: 400 });
    }
    const basePriceCents = Math.round(basePriceNumber * 100);

    // Apply promo code discount if provided
    let discountCents = 0;
    let promoId: string | null = null;
    let validatedPromoCode: string | null = null;

    if (promoCode) {
      const promoResult = await validatePromo(supabaseAdmin, promoCode, eventId, basePriceCents, quantity);
      if (isPromoError(promoResult)) {
        return NextResponse.json({ error: promoResult.error }, { status: 400 });
      }
      promoId = promoResult.promoId;
      validatedPromoCode = promoResult.promoCode;
      discountCents = promoResult.discountCents;
    }

    // Calculate price with discount using shared pricing logic
    const pricing = calculateCheckoutPricing(tier.price, discountCents);
    const unitAmountCents = pricing.unitAmountCents;

    // ── Free tickets — bypass Stripe, fulfill immediately ───────────────
    if (unitAmountCents === 0) {
      // IDEMPOTENCY: Limit free tickets per email per tier to prevent replay attacks.
      const { count: existingFreeCount } = await supabaseAdmin
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("tier_id", tierId)
        .eq("status", "issued");

      if (existingFreeCount && existingFreeCount > 0) {
        // Already registered — look up existing qr_codes for response
        const { data: existingTickets } = await supabaseAdmin
          .from("tickets")
          .select("qr_code")
          .eq("event_id", eventId)
          .eq("tier_id", tierId)
          .eq("status", "issued");

        const tokenList = existingTickets?.map((t) => t.qr_code ?? "").join(",") ?? "";
        return NextResponse.json({
          url: `${APP_URL}/e/success?free=true&tickets=${existingFreeCount}&tokens=${encodeURIComponent(tokenList)}`,
        });
      }

      // Resolve or create a party for the buyer
      let buyerPartyId: string;
      try {
        buyerPartyId = await resolveOrCreateParty(supabaseAdmin, buyerEmail);
      } catch (partyErr) {
        console.error("[checkout] Party resolution failed:", partyErr);
        return NextResponse.json({ error: "Failed to register tickets" }, { status: 500 });
      }

      // Create an order record for free tickets (subtotal=0, fees=0)
      const { data: freeOrder, error: freeOrderErr } = await supabaseAdmin
        .from("orders")
        .insert({
          party_id: buyerPartyId,
          event_id: eventId,
          stripe_payment_intent_id: null,
          promo_code_id: promoId,
          subtotal: 0,
          platform_fee: 0,
          stripe_fee: 0,
          total: 0,
          currency: DEFAULT_CURRENCY,
          status: "paid",
          metadata: {
            customer_email: buyerEmail,
            customer_phone: buyerPhone,
            registration_type: "free",
            ...(referrerToken && { referrer_token: referrerToken }),
          },
        })
        .select("id")
        .single();

      if (freeOrderErr || !freeOrder) {
        console.error("[checkout] Free order insert failed:", freeOrderErr);
        return NextResponse.json({ error: "Failed to register tickets" }, { status: 500 });
      }

      // Create order_line for the free tier
      const { data: freeOrderLine, error: freeOrderLineErr } = await supabaseAdmin
        .from("order_lines")
        .insert({
          order_id: freeOrder.id,
          tier_id: tierId,
          quantity,
          unit_price: 0,
          subtotal: 0,
        })
        .select("id")
        .single();

      if (freeOrderLineErr || !freeOrderLine) {
        console.error("[checkout] Free order_line insert failed:", freeOrderLineErr);
        return NextResponse.json({ error: "Failed to register tickets" }, { status: 500 });
      }

      // Fulfill tickets via the atomic RPC
      const { data: fulfilledTickets, error: fulfillErr } = await supabaseAdmin.rpc("fulfill_tickets_atomic", {
        p_tier_id: tierId,
        p_order_line_id: freeOrderLine.id,
        p_quantity: quantity,
        p_holder_party_id: buyerPartyId,
        p_event_id: eventId,
      });

      if (fulfillErr || !fulfilledTickets) {
        console.error("[checkout] Free ticket fulfillment failed:", fulfillErr);
        return NextResponse.json({ error: "Failed to register tickets" }, { status: 500 });
      }

      const ticketRows = fulfilledTickets as Array<{ id: string; qr_code: string | null }>;

      // Send confirmation email
      try {
        const { sendTicketConfirmation } = await import("@/lib/email/actions");
        const { data: eventData } = await supabaseAdmin
          .from("events")
          .select("title, starts_at, venue_name")
          .eq("id", eventId)
          .maybeSingle();

        if (eventData) {
          const qrCodes = ticketRows.map((t) => t.qr_code ?? "").filter(Boolean);
          await sendTicketConfirmation({
            to: buyerEmail,
            eventTitle: eventData.title || "Event",
            eventDate: new Date(eventData.starts_at).toLocaleDateString("en", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            }),
            venueName: eventData.venue_name || "TBA",
            tierName: tier.name || "Free",
            quantity,
            totalPrice: "Free",
            ticketLink: `${APP_URL}/ticket/${ticketRows[0]?.qr_code ?? ""}`,
            qrCodes: qrCodes.length > 0 ? qrCodes : undefined,
            ticketTokens: ticketRows.map((t) => t.qr_code ?? ""),
          });
        }
      } catch (emailErr) {
        console.error("[checkout] Free ticket email failed (non-blocking):", emailErr);
      }

      // Note: contacts table was removed in the schema rebuild — fan sync is now via party_contact_methods

      // Track free registration in analytics
      import("@/lib/analytics").then(({ trackTicketSold }) =>
        trackTicketSold(tierId, quantity)
      ).catch((err) => {
        console.error("[checkout] Free ticket analytics tracking failed:", err);
      });

      import("@/lib/track-server").then(({ trackServerEvent }) =>
        trackServerEvent("ticket_free_registered", { eventId, quantity, buyerEmail })
      ).catch(() => {});

      const tokenList = ticketRows.map((t) => t.qr_code ?? "").join(",");
      return NextResponse.json({
        url: `${APP_URL}/e/success?free=true&tickets=${quantity}&tokens=${encodeURIComponent(tokenList)}`,
      });
    }

    // ── Paid tickets ────────────────────────────────────────────────────

    // Track checkout start for conversion rate analytics
    import("@/lib/analytics").then(({ trackCheckoutStart }) =>
      trackCheckoutStart(eventId)
    ).catch(() => {});

    const serviceFeePerTicketCents = pricing.serviceFeePerTicketCents;
    const totalPerTicketCents = pricing.totalPerTicketCents;

    // Stripe minimum is $0.50 USD
    if (totalPerTicketCents < 50) {
      return NextResponse.json(
        { error: "Ticket price too low to process" },
        { status: 400 }
      );
    }

    // Currency is hardcoded to CAD — no zero-decimal risk for now
    // but keep the guard in case DEFAULT_CURRENCY is ever changed
    if (isZeroDecimal(DEFAULT_CURRENCY)) {
      return NextResponse.json(
        {
          error: `${DEFAULT_CURRENCY.toUpperCase()} is not yet supported for ticket sales. Contact support.`,
        },
        { status: 400 }
      );
    }

    // Resolve or create a party for the buyer before creating the order
    let buyerPartyId: string;
    try {
      buyerPartyId = await resolveOrCreateParty(supabaseAdmin, buyerEmail);
    } catch (partyErr) {
      console.error("[checkout] Party resolution failed:", partyErr);
      return NextResponse.json(
        { error: "Failed to reserve tickets. Please try again." },
        { status: 500 }
      );
    }

    // Calculate fee amounts in dollars for the order record
    const subtotalDollars = (unitAmountCents * quantity) / 100;
    const platformFeeDollars = (serviceFeePerTicketCents * quantity) / 100;
    const totalDollars = (totalPerTicketCents * quantity) / 100;

    // Create the order with status='pending' — will be updated to 'paid' by webhook
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        party_id: buyerPartyId,
        event_id: eventId,
        stripe_payment_intent_id: null, // filled in after session creation
        promo_code_id: promoId,
        subtotal: subtotalDollars,
        platform_fee: platformFeeDollars,
        stripe_fee: 0, // updated post-payout when Stripe fee is known
        total: totalDollars,
        currency: DEFAULT_CURRENCY,
        status: "pending",
        metadata: {
          customer_email: buyerEmail,
          customer_phone: buyerPhone,
          ...(referrerToken && { referrer_token: referrerToken }),
          ...(discountCents > 0 && { discount_cents: discountCents }),
        },
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("[checkout] Order insert failed:", orderErr);
      return NextResponse.json(
        { error: "Failed to reserve tickets. Please try again." },
        { status: 500 }
      );
    }

    // Create order_line for this tier
    const { data: orderLine, error: orderLineErr } = await supabaseAdmin
      .from("order_lines")
      .insert({
        order_id: order.id,
        tier_id: tierId,
        quantity,
        unit_price: unitAmountCents / 100,
        subtotal: subtotalDollars,
      })
      .select("id")
      .single();

    if (orderLineErr || !orderLine) {
      console.error("[checkout] Order line insert failed:", orderLineErr);
      // Clean up the dangling order
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: "Failed to reserve tickets. Please try again." },
        { status: 500 }
      );
    }

    // Fulfill tickets atomically — creates ticket rows linked to the order_line
    // holder_party_id is set to the buyer's party (known at checkout time)
    const { data: fulfilledTickets, error: fulfillErr } = await supabaseAdmin.rpc("fulfill_tickets_atomic", {
      p_tier_id: tierId,
      p_order_line_id: orderLine.id,
      p_quantity: quantity,
      p_holder_party_id: buyerPartyId,
      p_event_id: eventId,
    });

    if (fulfillErr || !fulfilledTickets) {
      console.error("[checkout] Ticket fulfillment failed:", fulfillErr);
      // Clean up order and order_line
      await supabaseAdmin.from("order_lines").delete().eq("id", orderLine.id);
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: "Failed to reserve tickets. Please try again." },
        { status: 500 }
      );
    }

    const ticketRows = fulfilledTickets as Array<{ id: string; qr_code: string | null }>;
    const ticketIds = ticketRows.map((t) => t.id);

    const referer = request.headers.get("referer");
    let cancelUrl = APP_URL;
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const appOrigin = new URL(APP_URL).origin;
        if (refererUrl.origin === appOrigin) {
          cancelUrl = APP_URL + refererUrl.pathname;
        }
      } catch {}
    }

    // Create Stripe Checkout Session
    let session;
    try {
      session = await getStripe().checkout.sessions.create({
        mode: "payment",
        customer_email: buyerEmail,
        line_items: [
          {
            price_data: {
              currency: DEFAULT_CURRENCY,
              product_data: {
                name: `${tier.name} — ${event.title}`,
              },
              unit_amount: unitAmountCents,
            },
            quantity,
          },
          {
            price_data: {
              currency: DEFAULT_CURRENCY,
              product_data: {
                name: "Service fee",
              },
              unit_amount: serviceFeePerTicketCents,
            },
            quantity,
          },
        ],
        metadata: {
          eventId,
          tierId,
          orderId: order.id,
          orderLineId: orderLine.id,
          quantity: String(quantity),
          ticketPriceCents: String(unitAmountCents),
          serviceFeeCents: String(serviceFeePerTicketCents),
          chargeCurrency: DEFAULT_CURRENCY,
          buyerPhone,
          ...(promoId && { promoId, promoCode: validatedPromoCode ?? "", promoClaimedQuantity: String(quantity) }),
          ...(referrerToken && { referrerToken }),
          ...(discountCents > 0 && { discountCents: String(discountCents) }),
          // Include ticket IDs if they fit Stripe's 500-char metadata value limit
          ...(ticketIds.length > 0 && JSON.stringify(ticketIds).length < 490 && {
            ticketIds: JSON.stringify(ticketIds),
          }),
        },
        success_url: `${APP_URL}/e/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
      });
    } catch (stripeErr) {
      console.error("[checkout] Stripe session creation failed:", stripeErr);
      // Clean up tickets, order_line, and order to release reserved capacity
      try {
        if (ticketIds.length > 0) {
          await supabaseAdmin.from("tickets").delete().in("id", ticketIds);
        }
        await supabaseAdmin.from("order_lines").delete().eq("id", orderLine.id);
        await supabaseAdmin.from("orders").delete().eq("id", order.id);
        console.info(`[checkout] Cleaned up ${ticketIds.length} ticket(s) after Stripe failure`);
      } catch (cleanupErr) {
        console.error("[checkout] Failed to clean up after Stripe failure:", cleanupErr);
      }
      return NextResponse.json(
        { error: "Payment service temporarily unavailable." },
        { status: 500 }
      );
    }

    // Backfill the stripe payment_intent_id onto the order now that we have it
    if (session.payment_intent) {
      const piId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent.id;
      await supabaseAdmin
        .from("orders")
        .update({ stripe_payment_intent_id: piId })
        .eq("id", order.id);
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[checkout] Error:", errMsg);

    return NextResponse.json(
      { error: "Something went wrong processing your payment. Please try again." },
      { status: 500 }
    );
  }
}
