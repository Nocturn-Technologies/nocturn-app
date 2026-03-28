import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { calculateServiceFeeCents } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/config";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { rateLimit } from "@/lib/rate-limit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

interface CheckoutBody {
  eventId: string;
  tierId: string;
  quantity: number;
  buyerEmail: string;
  promoCode?: string;
  referrerToken?: string;
}

export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success } = rateLimit(`checkout:${clientIp}`, 10, 60000); // 10 requests per minute
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429 }
    );
  }

  try {
    const body: CheckoutBody = await request.json();
    const { eventId, tierId, quantity, buyerEmail, promoCode } = body;
    // referrerToken must be a valid UUID (user ID from ?ref= link)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let referrerToken = body.referrerToken && uuidRegex.test(body.referrerToken) ? body.referrerToken : undefined;

    if (!eventId || !tierId || !quantity || !buyerEmail) {
      return NextResponse.json(
        { error: "Missing required fields: eventId, tierId, quantity, buyerEmail" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(buyerEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (quantity < 1 || quantity > 10) {
      return NextResponse.json(
        { error: "Quantity must be between 1 and 10" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Validate referrer user actually exists (prevents FK constraint violation)
    if (referrerToken) {
      const { data: referrerUser } = await supabase.from("users").select("id").eq("id", referrerToken).maybeSingle();
      if (!referrerUser) referrerToken = undefined;
    }

    // Look up the event
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

    // Atomic capacity check — lock + count + validate in a single DB transaction
    const supabaseAdmin = createAdminClient();
    const { data: capacityCheck, error: capacityError } = await supabaseAdmin.rpc("check_and_reserve_capacity", {
      p_tier_id: tierId,
      p_quantity: quantity,
    });

    if (capacityError || !capacityCheck?.success) {
      if (capacityError) {
        console.error("[checkout] Capacity check failed:", capacityError.message);
      }
      return NextResponse.json(
        { error: capacityCheck?.error || "Failed to check capacity" },
        { status: capacityCheck?.remaining !== undefined ? 409 : 500 }
      );
    }

    // Apply promo code discount if provided
    let discountPercent = 0;
    let discountFixed = 0;
    let promoId: string | null = null;

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

        if (isExpired) {
          // Expired — skip silently (no discount applied)
        } else {
          // Atomic claim: increment current_uses only if capacity remains.
          // This prevents race conditions where two concurrent checkouts
          // both read current_uses < max_uses and both claim.
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
            // Successfully claimed — apply the discount
            promoId = promo.id;
            if (promo.discount_type === "percentage") {
              discountPercent = Number(promo.discount_value) / 100;
            } else {
              discountFixed = Number(promo.discount_value) * 100; // convert to cents
            }
          }
          // If claimResult is empty, the code is maxed out — no discount applied
        }
      }
    }

    // Calculate price with discount
    const basePriceCents = Math.round(Number(tier.price) * 100);
    const discountCents = discountPercent > 0
      ? Math.round(basePriceCents * discountPercent)
      : discountFixed;
    const unitAmountCents = Math.max(basePriceCents - discountCents, 0);

    if (basePriceCents < 0) {
      return NextResponse.json({ error: "Invalid ticket price" }, { status: 400 });
    }

    // Free tickets — bypass Stripe, create directly
    // Insert BEFORE releasing the lock to prevent oversell race condition
    if (unitAmountCents === 0) {
      // Build ticket records
      const freeTickets = Array.from({ length: quantity }, () => ({
        event_id: eventId,
        ticket_tier_id: tierId,
        user_id: null,
        status: "paid" as const,
        price_paid: 0,
        currency: "usd",
        stripe_payment_intent_id: null,
        ticket_token: randomUUID(),
        referred_by: referrerToken ?? null,
        metadata: {
          registration_type: "free",
          customer_email: buyerEmail,
          ...(promoId && { promo_id: promoId, promo_code: promoCode }),
          ...(referrerToken && { referrer_token: referrerToken }),
        },
      }));

      const { data: insertedTickets, error: insertError } = await supabaseAdmin
        .from("tickets")
        .insert(freeTickets)
        .select("id, ticket_token");

      if (insertError) {
        console.error("[checkout] Free ticket insert failed:", insertError);
        return NextResponse.json(
          { error: "Failed to register tickets" },
          { status: 500 }
        );
      }

      // Generate QR codes
      if (insertedTickets && insertedTickets.length > 0) {
        await Promise.allSettled(
          insertedTickets.map(async (ticket) => {
            try {
              const checkInUrl = `${APP_URL}/check-in/${ticket.ticket_token}`;
              const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
                width: 400,
                margin: 2,
                color: { dark: "#000000", light: "#ffffff" },
                errorCorrectionLevel: "H",
              });
              await supabaseAdmin
                .from("tickets")
                .update({ qr_code: qrDataUrl })
                .eq("id", ticket.id);
            } catch (qrErr) {
              console.error(`[checkout] QR failed for free ticket ${ticket.id}:`, qrErr);
            }
          })
        );
      }

      // Send confirmation email
      try {
        const { sendTicketConfirmation } = await import("@/app/actions/email");
        const { data: eventData } = await supabaseAdmin
          .from("events")
          .select("title, starts_at, venues(name)")
          .eq("id", eventId)
          .maybeSingle();

        if (eventData) {
          const venue = eventData.venues as unknown as { name: string } | null;
          await sendTicketConfirmation({
            to: buyerEmail,
            eventTitle: eventData.title || "Event",
            eventDate: new Date(eventData.starts_at).toLocaleDateString("en", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            }),
            venueName: venue?.name || "TBA",
            tierName: tier.name || "Free",
            quantity,
            totalPrice: "Free",
            ticketLink: `${APP_URL}/ticket/${insertedTickets?.[0]?.ticket_token || ""}`,
          });
        }
      } catch (emailErr) {
        console.error("[checkout] Free ticket email failed (non-blocking):", emailErr);
      }

      // Promo code was already atomically claimed during validation above

      // Track free registration
      import("@/lib/track-server").then(({ trackServerEvent }) =>
        trackServerEvent("ticket_free_registered", { eventId, quantity, buyerEmail })
      ).catch(() => {});

      // Redirect to success page
      return NextResponse.json({
        url: `${APP_URL}/e/success?free=true&tickets=${quantity}`,
      });
    }

    const serviceFeePerTicketCents = calculateServiceFeeCents(unitAmountCents);
    const totalPerTicketCents = unitAmountCents + serviceFeePerTicketCents;

    // Stripe minimum is $0.50 USD
    if (totalPerTicketCents < 50) {
      return NextResponse.json(
        { error: "Ticket price too low to process" },
        { status: 400 }
      );
    }

    const referer = request.headers.get("referer");
    let cancelUrl = APP_URL;
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        const appOrigin = new URL(APP_URL).origin;
        if (refererOrigin === appOrigin) cancelUrl = referer;
      } catch {}
    }

    // All payments go to Nocturn platform account — payouts handled manually
    // Buyer pays ticket price + service fee (7% + $0.50)
    let session;
    try {
      session = await getStripe().checkout.sessions.create({
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
          {
            price_data: {
              currency: "usd",
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
          quantity: String(quantity),
          ticketPriceCents: String(unitAmountCents),
          serviceFeeCents: String(serviceFeePerTicketCents),
          ...(promoId && { promoId, promoCode: promoCode ?? "" }),
          ...(referrerToken && { referrerToken }),
          ...(discountCents > 0 && { discountCents: String(discountCents) }),
        },
        success_url: `${APP_URL}/e/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
      });
    } catch (stripeErr) {
      console.error("[checkout] Stripe session creation failed:", stripeErr);
      return NextResponse.json(
        { error: "Payment service temporarily unavailable." },
        { status: 500 }
      );
    }

    // Promo code was already atomically claimed during validation above

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
