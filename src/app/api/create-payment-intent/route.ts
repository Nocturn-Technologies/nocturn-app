import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { calculateServiceFeeCents } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrencyForCountry, convertAmount, formatLocalAmount } from "@/lib/currency";

export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success } = rateLimit(`payment-intent:${clientIp}`, 10, 60000); // 10 requests per minute
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { eventId, tierId, quantity, buyerEmail, promoCode } = body;
    // Validate referrerToken as UUID to prevent FK violations downstream
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const referrerToken = body.referrerToken && uuidRegex.test(body.referrerToken) ? body.referrerToken : undefined;

    if (!eventId || !tierId || !quantity || !buyerEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (quantity < 1 || quantity > 10) {
      return NextResponse.json(
        { error: "Quantity must be between 1 and 10" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Look up event
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
    const { data: capacityCheck, error: capacityError } = await supabase.rpc("check_and_reserve_capacity", {
      p_tier_id: tierId,
      p_quantity: quantity,
    });

    if (capacityError || !capacityCheck?.success) {
      if (capacityError) {
        console.error("[create-payment-intent] Capacity check failed:", capacityError.message);
      }
      return NextResponse.json(
        { error: capacityCheck?.error || "Failed to check capacity" },
        { status: capacityCheck?.remaining !== undefined ? 409 : 500 }
      );
    }

    // Apply promo code discount if provided
    const basePriceCents = Math.round(Number(tier.price) * 100);
    let discountCents = 0;
    let promoId: string | null = null;
    let validatedPromoCode: string | null = null;

    if (promoCode) {
      const { data: promo } = await supabase
        .from("promo_codes")
        .select("id, code, discount_type, discount_value, max_uses, current_uses, expires_at")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .ilike("code", promoCode)
        .maybeSingle();

      if (promo) {
        const isExpired = promo.expires_at && new Date(promo.expires_at) < new Date();

        if (!isExpired) {
          // Atomic claim: increment current_uses and check max_uses in one query
          const claimQuery = promo.max_uses !== null
            ? supabase
                .from("promo_codes")
                .update({ current_uses: (promo.current_uses ?? 0) + quantity })
                .eq("id", promo.id)
                .lte("current_uses", promo.max_uses - quantity)
                .select("id")
            : supabase
                .from("promo_codes")
                .update({ current_uses: (promo.current_uses ?? 0) + quantity })
                .eq("id", promo.id)
                .select("id");

          const { data: claimResult } = await claimQuery;

          if (claimResult && claimResult.length > 0) {
            promoId = promo.id;
            validatedPromoCode = promo.code;
            if (promo.discount_type === "percentage") {
              discountCents = Math.round(basePriceCents * (Number(promo.discount_value) / 100));
            } else {
              discountCents = Math.round(Number(promo.discount_value) * 100);
            }
          }
        }
      }
    }

    const unitAmountCents = Math.max(basePriceCents - discountCents, 0);
    if (unitAmountCents < 50) {
      return NextResponse.json(
        { error: "Ticket price must be at least $0.50" },
        { status: 400 }
      );
    }

    const serviceFeePerTicketCents = calculateServiceFeeCents(unitAmountCents);
    const totalPerTicketCents = unitAmountCents + serviceFeePerTicketCents;
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
        ...(promoId && { promoId, promoCode: validatedPromoCode ?? "" }),
        ...(discountCents > 0 && { discountCents: String(discountCents) }),
      },
      automatic_payment_methods: { enabled: true },
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
