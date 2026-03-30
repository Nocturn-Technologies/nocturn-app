import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { calculateServiceFeeCents } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/config";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { rateLimitStrict } from "@/lib/rate-limit";

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
  const clientIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success } = await rateLimitStrict(`checkout:${clientIp}`, 10, 60000); // 10 requests per minute
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429 }
    );
  }

  try {
    const body: CheckoutBody = await request.json();
    const { eventId, tierId, quantity, promoCode } = body;
    // Normalize email to lowercase to prevent case-variant free ticket bypass
    const buyerEmail = body.buyerEmail?.trim().toLowerCase();
    // referrerToken must be a valid UUID (user ID from ?ref= link)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let referrerToken = body.referrerToken && uuidRegex.test(body.referrerToken) ? body.referrerToken : undefined;

    if (!eventId || !tierId || !quantity || !buyerEmail) {
      return NextResponse.json(
        { error: "Missing required fields: eventId, tierId, quantity, buyerEmail" },
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

    // Look up the event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, slug, collective_id, status")
      .eq("id", eventId)
      .is("deleted_at", null)
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

    if (promoCode && typeof promoCode === "string" && promoCode.length <= 50) {
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
          // Validate promo code availability (check uses) but DON'T claim yet.
          // Claiming happens in the webhook/fulfillment after payment succeeds,
          // so abandoned checkouts don't consume promo uses.
          const hasCapacity = promo.max_uses === null ||
            (promo.current_uses ?? 0) + quantity <= promo.max_uses;

          if (hasCapacity) {
            // Code is valid and has capacity — apply the discount
            promoId = promo.id;
            if (promo.discount_type === "percentage") {
              const pct = Number(promo.discount_value);
              if (pct < 0 || pct > 100) {
                // Invalid percentage — skip promo, no discount
                discountPercent = 0;
              } else {
                discountPercent = pct / 100;
              }
            } else {
              discountFixed = Number(promo.discount_value) * 100; // convert to cents
            }
          }
          // If no capacity, the code is maxed out — no discount applied
        }
      }
    }

    // Calculate price with discount
    const basePriceCents = Math.round(Number(tier.price) * 100);

    if (basePriceCents < 0) {
      return NextResponse.json({ error: "Invalid ticket price" }, { status: 400 });
    }

    const discountCents = discountPercent > 0
      ? Math.round(basePriceCents * discountPercent)
      : discountFixed;
    const unitAmountCents = Math.max(basePriceCents - discountCents, 0);

    // Free tickets — bypass Stripe, create directly
    // Insert BEFORE releasing the lock to prevent oversell race condition
    if (unitAmountCents === 0) {
      // IDEMPOTENCY: Limit free tickets per email per tier to prevent replay attacks.
      // Check if this email already has free tickets for this tier.
      const { count: existingFreeCount } = await supabaseAdmin
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("ticket_tier_id", tierId)
        .eq("status", "paid")
        .filter("metadata->>customer_email", "eq", buyerEmail)
        .is("stripe_payment_intent_id", null);

      if (existingFreeCount && existingFreeCount > 0) {
        // Already registered — return existing tickets instead of creating duplicates
        const { data: existingTickets } = await supabaseAdmin
          .from("tickets")
          .select("ticket_token")
          .eq("event_id", eventId)
          .eq("ticket_tier_id", tierId)
          .filter("metadata->>customer_email", "eq", buyerEmail)
          .is("stripe_payment_intent_id", null);

        const tokenList = existingTickets?.map((t) => t.ticket_token).join(",") ?? "";
        return NextResponse.json({
          url: `${APP_URL}/e/success?free=true&tickets=${existingFreeCount}&tokens=${encodeURIComponent(tokenList)}`,
        });
      }

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

      // Generate QR codes FIRST, then include in email
      const freeQrCodes: string[] = [];
      if (insertedTickets && insertedTickets.length > 0) {
        const qrResults = await Promise.allSettled(
          insertedTickets.map(async (ticket) => {
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
            return qrDataUrl;
          })
        );
        for (const r of qrResults) {
          if (r.status === "fulfilled") freeQrCodes.push(r.value);
        }
      }

      // Send confirmation email with QR codes
      try {
        const { sendTicketConfirmation } = await import("@/lib/email/actions");
        const { data: eventData } = await supabaseAdmin
          .from("events")
          .select("title, starts_at, venues(name)")
          .eq("id", eventId)
          .is("deleted_at", null)
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
            qrCodes: freeQrCodes.length > 0 ? freeQrCodes : undefined,
          });
        }
      } catch (emailErr) {
        console.error("[checkout] Free ticket email failed (non-blocking):", emailErr);
      }

      // Claim promo code uses for free tickets (webhook is bypassed for $0 tickets)
      if (promoId) {
        try {
          await supabaseAdmin.rpc("claim_promo_code", { p_code_id: promoId, p_quantity: quantity });
        } catch (promoErr) {
          console.error("[checkout] Free ticket promo claim failed (non-blocking):", promoErr);
        }
      }

      // Track free registration in analytics (H6: free tickets were invisible to event_analytics)
      import("@/lib/analytics").then(({ trackTicketSold }) =>
        trackTicketSold(eventId, quantity, 0)
      ).catch((err) => {
        console.error("[checkout] Free ticket analytics tracking failed:", err);
      });

      // Track free registration
      import("@/lib/track-server").then(({ trackServerEvent }) =>
        trackServerEvent("ticket_free_registered", { eventId, quantity, buyerEmail })
      ).catch(() => {});

      // Redirect to success page with ticket tokens so links are shown
      const tokenList = insertedTickets?.map((t) => t.ticket_token).join(",") ?? "";
      return NextResponse.json({
        url: `${APP_URL}/e/success?free=true&tickets=${quantity}&tokens=${encodeURIComponent(tokenList)}`,
      });
    }

    // Track checkout start for conversion rate analytics
    import("@/lib/analytics").then(({ trackCheckoutStart }) =>
      trackCheckoutStart(eventId)
    ).catch(() => {});

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
        const refererUrl = new URL(referer);
        const appOrigin = new URL(APP_URL).origin;
        if (refererUrl.origin === appOrigin) {
          const cancelPath = refererUrl.pathname;
          cancelUrl = APP_URL + cancelPath;
        }
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

    // Promo code uses are claimed in the webhook/fulfillment after payment succeeds

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
