import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { eventId, tierId, quantity, buyerEmail } = await request.json();

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
      .select("id, title, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
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

    // Check capacity
    const { count: soldCount } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("ticket_tier_id", tierId)
      .in("status", ["reserved", "paid", "checked_in"]);

    const remaining = tier.capacity - (soldCount ?? 0);
    if (remaining < quantity) {
      return NextResponse.json(
        { error: `Only ${remaining} ticket(s) remaining` },
        { status: 409 }
      );
    }

    const unitAmountCents = Math.round(Number(tier.price) * 100);
    if (unitAmountCents < 50) {
      return NextResponse.json(
        { error: "Ticket price must be at least $0.50" },
        { status: 400 }
      );
    }

    const totalCents = unitAmountCents * quantity;

    // Create PaymentIntent
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      receipt_email: buyerEmail,
      metadata: {
        eventId,
        tierId,
        quantity: String(quantity),
        buyerEmail,
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
