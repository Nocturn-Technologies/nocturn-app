import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { getCurrencyForCountry, convertAmount, formatLocalAmount } from "@/lib/currency";
import { logPaymentEvent } from "@/lib/payment-events";
import {
  validatePromo,
  isPromoError,
  calculateCheckoutPricing,
  insertPendingTickets,
} from "@/lib/checkout-helpers";

export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success } = await rateLimitStrict(`payment-intent:${clientIp}`, 10, 60000); // 10 requests per minute
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { eventId, tierId, quantity, buyerEmail: rawBuyerEmail, promoCode } = body;
    const buyerEmail = typeof rawBuyerEmail === "string" ? rawBuyerEmail.trim().toLowerCase() : rawBuyerEmail;
    // Validate referrerToken as UUID to prevent FK violations downstream
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const referrerToken = body.referrerToken && uuidRegex.test(body.referrerToken) ? body.referrerToken : undefined;

    if (!eventId || !tierId || !quantity || !buyerEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    // Look up event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, collective_id, status")
      .eq("id", eventId)
      .is("deleted_at", null)
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

    // Look up ticket tier
    const { data: tier, error: tierError } = await supabase
      .from("ticket_tiers")
      .select("id, name, price, capacity, sales_start, sales_end")
      .eq("id", tierId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (tierError || !tier) {
      return NextResponse.json({ error: "Ticket tier not found" }, { status: 404 });
    }

    // Validate sales window
    const now = new Date();
    if (tier.sales_start && new Date(tier.sales_start) > now) {
      return NextResponse.json({ error: "Ticket sales have not started yet" }, { status: 400 });
    }
    if (tier.sales_end && new Date(tier.sales_end) < now) {
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
      return NextResponse.json(
        { error: capacityCheck?.error || "Failed to check capacity" },
        { status: capacityCheck?.remaining !== undefined ? 409 : 500 }
      );
    }

    // Reserve capacity by inserting "pending" tickets immediately.
    // These count toward capacity and will be updated to "paid" on fulfillment,
    // or cleaned up after 30 minutes if the checkout is abandoned (Gap 9 + 25).
    let pendingTicketIds: string[];
    try {
      const pendingResult = await insertPendingTickets(supabase, {
        eventId,
        tierId,
        quantity,
        email: buyerEmail,
      });
      pendingTicketIds = pendingResult.pendingTicketIds;
    } catch (err) {
      console.error("[create-payment-intent] Failed to insert pending tickets:", err);
      return NextResponse.json(
        { error: "Failed to reserve tickets. Please try again." },
        { status: 500 }
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

    const serviceFeePerTicketCents = pricing.serviceFeePerTicketCents;
    const totalPerTicketCents = pricing.totalPerTicketCents;
    const totalUsdCents = totalPerTicketCents * quantity;

    // Detect buyer's country from Vercel header → convert to local currency
    const buyerCountry = request.headers.get("x-vercel-ip-country") || null;
    const targetCurrency = getCurrencyForCountry(buyerCountry);
    const { amount: chargeAmount, rate: fxRate, currency: chargeCurrency } =
      await convertAmount(totalUsdCents, targetCurrency);

    // Create PaymentIntent in buyer's local currency
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: chargeAmount,
      currency: chargeCurrency,
      receipt_email: buyerEmail,
      metadata: {
        eventId,
        tierId,
        quantity: String(quantity),
        buyerEmail,
        ticketPriceCents: String(unitAmountCents),
        baseCurrency: "usd",
        baseAmountCents: String(totalUsdCents),
        chargeCurrency,
        fxRate: String(fxRate),
        ...(buyerCountry && { buyerCountry }),
        ...(referrerToken && { referrerToken }),
        ...(promoId && { promoId, promoCode: validatedPromoCode ?? "", promoClaimedQuantity: String(quantity) }),
        ...(discountCents > 0 && { discountCents: String(discountCents) }),
        pendingTicketIds: JSON.stringify(pendingTicketIds),
      },
      automatic_payment_methods: { enabled: true },
    });

    // Link pending tickets to this PaymentIntent so webhooks can find them
    if (pendingTicketIds.length > 0) {
      await supabase
        .from("tickets")
        .update({
          stripe_payment_intent_id: paymentIntent.id,
          metadata: {
            customer_email: buyerEmail,
            pending_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            payment_intent_id: paymentIntent.id,
          },
        })
        .in("id", pendingTicketIds);
    }

    // Log the payment creation for audit trail
    void logPaymentEvent({
      event_type: "payment_created",
      payment_intent_id: paymentIntent.id,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: chargeAmount,
      currency: chargeCurrency,
      buyer_email: buyerEmail,
      metadata: {
        base_amount_cents: totalUsdCents,
        fx_rate: fxRate,
        promo_id: promoId ?? undefined,
        discount_cents: discountCents > 0 ? discountCents : undefined,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: chargeAmount,
      currency: chargeCurrency,
      displayAmount: formatLocalAmount(chargeAmount, chargeCurrency),
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
