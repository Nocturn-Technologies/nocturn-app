import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitStrict } from "@/lib/rate-limit";

/**
 * Build the set of allowed origins from NEXT_PUBLIC_APP_URL plus any
 * additional origins configured via ALLOWED_ORIGINS (comma separated).
 * Values are normalized to origin only (scheme + host + optional port).
 */
function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const push = (raw: string | undefined) => {
    if (!raw) return;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // ignore malformed
    }
  };
  push(process.env.NEXT_PUBLIC_APP_URL);
  const extras = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const e of extras) push(e);
  // Default fallback so the public checkout page works out of the box.
  if (origins.size === 0) push("https://app.trynocturn.com");
  return origins;
}

function isAllowedOrigin(request: NextRequest): boolean {
  const allowed = getAllowedOrigins();
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return allowed.has(new URL(origin).origin);
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  // Neither Origin nor Referer — reject. Browsers send at least one of these
  // for cross-origin fetches; absence is a strong signal of a scraper.
  return false;
}

/**
 * GET /api/tier-availability?eventId=xxx
 * Returns remaining ticket counts per tier for real-time capacity updates.
 *
 * Public endpoint (used by the checkout flow) but defended by:
 *   1. Per-IP rate limiting (rateLimitStrict)
 *   2. Origin/Referer allowlist (blocks competitor scrapers)
 *   3. Cache-Control: private, no-store (no shared caching)
 *
 * TODO(audit): consider a short-lived HMAC token issued by the event page
 * for stronger binding to a specific checkout session.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const { success } = await rateLimitStrict(`tier-availability:${ip}`, 60, 60_000);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Origin/Referer check — reject requests that don't come from an allowed origin.
    // This still allows the public checkout page (same-origin) while blocking
    // server-side scrapers and competitors polling from other domains.
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
    }

    const supabase = await createClient();

    const [{ data: tiers, error: tiersError }, { data: soldTickets, error: soldError }, { data: pendingTickets, error: pendingError }] = await Promise.all([
      supabase.from("ticket_tiers").select("id, capacity").eq("event_id", eventId).eq("is_active", true),
      supabase.from("tickets").select("ticket_tier_id").eq("event_id", eventId).in("status", ["paid", "checked_in"]),
      supabase.from("tickets").select("ticket_tier_id").eq("event_id", eventId).eq("status", "pending").gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    ]);

    if (tiersError || soldError || pendingError) {
      console.error("[tier-availability] DB error:", tiersError || soldError || pendingError);
      return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 });
    }

    const soldCounts: Record<string, number> = {};
    for (const t of soldTickets || []) {
      if (t.ticket_tier_id) soldCounts[t.ticket_tier_id] = (soldCounts[t.ticket_tier_id] || 0) + 1;
    }
    for (const t of pendingTickets || []) {
      if (t.ticket_tier_id) soldCounts[t.ticket_tier_id] = (soldCounts[t.ticket_tier_id] || 0) + 1;
    }

    const remaining: Record<string, number> = {};
    for (const t of tiers || []) {
      if (t.capacity != null) {
        remaining[t.id] = Math.max(0, t.capacity - (soldCounts[t.id] || 0));
      }
    }

    return NextResponse.json({ remaining }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[tier-availability] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
