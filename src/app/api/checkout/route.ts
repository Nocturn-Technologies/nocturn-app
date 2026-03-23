import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nocturn-app-navy.vercel.app";

interface CheckoutBody {
  eventId: string;
  tierId: string;
  quantity: number;
  buyerEmail: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckoutBody = await request.json();
    const { eventId, tierId, quantity, buyerEmail } = body;

    if (!eventId || !tierId || !quantity || !buyerEmail) {
      return NextResponse.json(
        { error: "Missing required fields: eventId, tierId, quantity, buyerEmail" },
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

    // Look up the event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, slug, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      console.error("[checkout] Event lookup failed:", eventError?.message);
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Look up the ticket tier
    const { data: tier, error: tierError } = await supabase
      .from("ticket_tiers")
      .select("id, name, price, capacity, sales_start, sales_end, event_id")
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

    // Validate sales window
    const now = new Date();
    if (tier.sales_start && new Date(tier.sales_start) > now) {
      return NextResponse.json(
        { error: "Ticket sales have not started yet" },
        { status: 400 }
      );
    }
    if (tier.sales_end && new Date(tier.sales_end) < now) {
      return NextResponse.json(
        { error: "Ticket sales have ended" },
        { status: 400 }
      );
    }

    // Check remaining capacity
    const { count: soldCount, error: countError } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("ticket_tier_id", tierId)
      .in("status", ["reserved", "paid", "checked_in"]);

    if (countError) {
      console.error("[checkout] Capacity check failed:", countError.message);
      return NextResponse.json(
        { error: "Failed to check ticket availability" },
        { status: 500 }
      );
    }

    const remaining = tier.capacity - (soldCount ?? 0);
    if (remaining < quantity) {
      return NextResponse.json(
        { error: `Only ${remaining} ticket(s) remaining for this tier` },
        { status: 409 }
      );
    }

    // Validate price
    const unitAmountCents = Math.round(Number(tier.price) * 100);
    if (unitAmountCents < 0) {
      return NextResponse.json({ error: "Invalid ticket price" }, { status: 400 });
    }

    // Free tickets — bypass Stripe
    if (unitAmountCents === 0) {
      // TODO: Create tickets directly for free events
      return NextResponse.json(
        { error: "Free ticket registration coming soon" },
        { status: 400 }
      );
    }

    // Stripe minimum is $0.50 USD
    if (unitAmountCents < 50) {
      return NextResponse.json(
        { error: "Ticket price must be at least $0.50" },
        { status: 400 }
      );
    }

    const referer = request.headers.get("referer");
    const cancelUrl = referer && referer.startsWith("http") ? referer : APP_URL;

    // All payments go to Nocturn platform account — payouts handled manually
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${tier.name} — ${event.title}`,
            },
            unit_amount: unitAmountCents,
          },
          quantity,
        },
      ],
      metadata: {
        eventId,
        tierId,
        quantity: String(quantity),
      },
      success_url: `${APP_URL}/e/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
    });

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
