import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { calculateServiceFeeCents } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimit } from "@/lib/rate-limit";

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
    const { eventId, tierId, quantity, buyerEmail } = body;
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

    const unitAmountCents = Math.round(Number(tier.price) * 100);
    if (unitAmountCents < 50) {
      return NextResponse.json(
        { error: "Ticket price must be at least $0.50" },
        { status: 400 }
      );
    }

    const serviceFeePerTicketCents = calculateServiceFeeCents(unitAmountCents);
    const totalPerTicketCents = unitAmountCents + serviceFeePerTicketCents;
    const totalCents = totalPerTicketCents * quantity;

    // Create PaymentIntent (includes ticket price + service fee)
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      receipt_email: buyerEmail,
      metadata: {
        eventId,
        tierId,
        quantity: String(quantity),
        buyerEmail,
        ...(referrerToken && { referrerToken }),
      },
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: totalCents,
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
