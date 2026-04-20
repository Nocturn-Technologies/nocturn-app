import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { formatLocalAmount, isZeroDecimal } from "@/lib/currency";
import { logPaymentEvent } from "@/lib/payment-events";
import {
  validatePromo,
  isPromoError,
  calculateCheckoutPricing,
} from "@/lib/checkout-helpers";

export async function POST(request: NextRequest) {
  // TODO(audit): rate limit is per-IP only; add per-email limit to prevent card-testing via IP rotation
  const clientIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success } = await rateLimitStrict(`payment-intent:${clientIp}`, 10, 60000); // 10 requests per minute
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const tierId = typeof body.tierId === "string" ? body.tierId : "";
    const quantity = typeof body.quantity === "number" ? body.quantity : 0;
    const promoCode = typeof body.promoCode === "string" ? body.promoCode : undefined;
    const rawBuyerEmail = typeof body.buyerEmail === "string" ? body.buyerEmail : "";
    const buyerEmail = rawBuyerEmail.trim().toLowerCase();

    // Phone — required for all ticket purchases
    const rawBuyerPhone = typeof body.buyerPhone === "string" ? body.buyerPhone.trim() : "";
    const phoneDigits = rawBuyerPhone.replace(/[^0-9]/g, "");
    const buyerPhone =
      rawBuyerPhone && rawBuyerPhone.length <= 32 && phoneDigits.length >= 7 && phoneDigits.length <= 15
        ? rawBuyerPhone
        : null;

    // Validate referrerToken as UUID to prevent FK violations downstream
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rawReferrerToken = typeof body.referrerToken === "string" ? body.referrerToken : "";
    const referrerToken = rawReferrerToken && uuidRegex.test(rawReferrerToken) ? rawReferrerToken : undefined;

    if (!eventId || !tierId || !quantity || !buyerEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    // Look up event. Currency is hardcoded to CAD — events.currency was removed in schema rebuild.
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, collective_id, status")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Block purchases for non-active events
    if (["draft", "cancelled", "completed"].includes(event.status)) {
      return NextResponse.json(
        { error: event.status === "draft" ? "This event is not yet published" : `This event is ${event.status}` },
        { status: 400 }
      );
    }

    // Look up ticket tier (column renames: sales_start → sale_start_at, sales_end → sale_end_at)
    const { data: tier, error: tierError } = await supabase
      .from("ticket_tiers")
      .select("id, name, price, capacity, sale_start_at, sale_end_at")
      .eq("id", tierId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (tierError || !tier) {
      return NextResponse.json({ error: "Ticket tier not found" }, { status: 404 });
    }

    // Validate sales window
    const now = new Date();
    if (tier.sale_start_at && new Date(tier.sale_start_at) > now) {
      return NextResponse.json({ error: "Ticket sales have not started yet" }, { status: 400 });
    }
    if (tier.sale_end_at && new Date(tier.sale_end_at) < now) {
      return NextResponse.json({ error: "Ticket sales have ended" }, { status: 400 });
    }

    // Atomic capacity check — lock + count + validate in a single DB transaction
    const { data: capacityCheckRaw, error: capacityError } = await supabase.rpc("check_and_reserve_capacity", {
      p_tier_id: tierId,
      p_quantity: quantity,
    });
    const capacityCheck = capacityCheckRaw as { success: boolean; error?: string; remaining?: number } | null;

    if (capacityError || !capacityCheck?.success) {
      if (capacityError) {
        console.error("[create-payment-intent] Capacity check failed:", capacityError.message);
      }
      if (capacityCheck?.error) {
        console.error("[create-payment-intent] Capacity check error detail:", capacityCheck.error);
      }
      return NextResponse.json(
        { error: capacityCheck?.remaining !== undefined ? "Tickets unavailable" : "Failed to check capacity" },
        { status: capacityCheck?.remaining !== undefined ? 409 : 500 }
      );
    }

    // Ticket rows are created by fulfill_tickets_atomic after payment succeeds (via webhook).
    // No pending ticket rows needed here — capacity is reserved via check_and_reserve_capacity.
    const pendingTicketIds: string[] = [];

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
      const promoResult = await validatePromo(supabase, promoCode, eventId, basePriceCents, quantity);
      if (isPromoError(promoResult)) {
        return NextResponse.json({ error: promoResult.error }, { status: 400 });
      }
      promoId = promoResult.promoId;
      validatedPromoCode = promoResult.promoCode;
      discountCents = promoResult.discountCents;
    }

    // Calculate pricing using shared logic
    const pricing = calculateCheckoutPricing(tier.price, discountCents);
    const unitAmountCents = pricing.unitAmountCents;

    if (unitAmountCents < 50) {
      return NextResponse.json(
        { error: "Ticket price must be at least $0.50" },
        { status: 400 }
      );
    }

    // Track checkout start AFTER price validation to avoid inflating counts for invalid requests
    import("@/lib/analytics").then(({ trackCheckoutStart }) =>
      trackCheckoutStart(eventId)
    ).catch(() => {});

    const _serviceFeePerTicketCents = pricing.serviceFeePerTicketCents;
    const totalPerTicketCents = pricing.totalPerTicketCents;
    const totalEventCents = totalPerTicketCents * quantity;

    // Currency is hardcoded to CAD — events.currency was removed in schema rebuild.
    const chargeCurrency = "cad";

    if (isZeroDecimal(chargeCurrency)) {
      return NextResponse.json(
        {
          error: `${chargeCurrency.toUpperCase()} is not yet supported for ticket sales. Contact support.`,
        },
        { status: 400 }
      );
    }

    // Create PaymentIntent in the charge currency.
    let paymentIntent;
    try {
      paymentIntent = await getStripe().paymentIntents.create({
        amount: totalEventCents,
        currency: chargeCurrency,
        receipt_email: buyerEmail,
        metadata: {
          eventId,
          tierId,
          quantity: String(quantity),
          buyerEmail,
          buyerPhone,
          ticketPriceCents: String(unitAmountCents),
          chargeCurrency,
          totalAmountCents: String(totalEventCents),
          ...(referrerToken && { referrerToken }),
          ...(promoId && { promoId, promoCode: validatedPromoCode ?? "", promoClaimedQuantity: String(quantity) }),
          ...(discountCents > 0 && { discountCents: String(discountCents) }),
          // Only include pending IDs if they fit Stripe's 500-char metadata value limit
          ...(pendingTicketIds.length > 0 && JSON.stringify(pendingTicketIds).length < 490 && {
            pendingTicketIds: JSON.stringify(pendingTicketIds),
          }),
        },
        automatic_payment_methods: { enabled: true },
      });
    } catch (stripeErr) {
      console.error("[create-payment-intent] Stripe PaymentIntent creation failed:", stripeErr);
      // No pending tickets to clean up — capacity reservation via check_and_reserve_capacity
      // is not persisted as ticket rows, so nothing to delete here.
      return NextResponse.json(
        { error: "Payment service temporarily unavailable." },
        { status: 500 }
      );
    }

    // No pending ticket rows to link — tickets are created post-payment via fulfill_tickets_atomic

    // Log the payment creation for audit trail
    void logPaymentEvent({
      stripe_event_id: `pi_created:${paymentIntent.id}`,
      event_type: "payment_created",
      stripe_payment_intent_id: paymentIntent.id,
      event_id: eventId,
      amount: totalEventCents / 100,
      currency: chargeCurrency,
      customer_email: buyerEmail,
      metadata: {
        tier_id: tierId,
        quantity,
        promo_id: promoId ?? undefined,
        discount_cents: discountCents > 0 ? discountCents : undefined,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: totalEventCents,
      currency: chargeCurrency,
      displayAmount: formatLocalAmount(totalEventCents, chargeCurrency),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[create-payment-intent] Error:", errMsg);
    return NextResponse.json(
      { error: "Failed to initialize payment. Please try again." },
      { status: 500 }
    );
  }
}
