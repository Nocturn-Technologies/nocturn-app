import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/config";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Cron: Clean up expired pending tickets older than 30 minutes.
 * These are capacity reservations from abandoned checkouts.
 * Run every 15 minutes via Vercel Cron.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access.
  // TODO(audit): log successful auth for audit trail
  const authHeader = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron] CRON_SECRET is not set — rejecting request");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // Delete pending tickets older than 30 minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: deleted, error } = await supabase
      .from("tickets")
      .delete()
      .eq("status", "pending")
      .lt("created_at", thirtyMinAgo)
      .select("id, event_id, ticket_tier_id");

    if (error) {
      console.error("[cleanup-pending-tickets] Delete failed:", error);
      return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
    }

    const count = deleted?.length ?? 0;
    if (count > 0) {
      console.info(`[cleanup-pending-tickets] Cleaned up ${count} expired pending ticket(s)`);

      // Release promo claims for expired pending tickets if they had promos
      // (Promo claims are released on payment_intent.payment_failed, but abandoned checkouts
      // where the user just closes the tab never trigger that webhook)
    }

    return NextResponse.json({ cleaned: count });
  } catch (err) {
    console.error("[cleanup-pending-tickets] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
