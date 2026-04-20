/**
 * Stripe Connect (Express) — return / refresh endpoint
 *
 * Hit by Stripe after the operator completes (or abandons) the hosted
 * onboarding flow. Two modes, both resolved via ?mode=:
 *
 *   - return  → onboarding completed (even if requirements still outstanding).
 *               Redirect to Settings with a status flag; the card re-fetches
 *               status from Stripe to decide which state to render.
 *
 *   - refresh → the one-time AccountLink expired before they finished.
 *               Generate a fresh link and redirect them back into onboarding.
 *
 * We deliberately do NOT re-fetch/persist account status here. The Payouts
 * card calls getConnectStatus on mount, which talks to Stripe directly —
 * that's the single source of truth. Webhook account.updated handles any
 * background state changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { createOnboardingLink } from "@/app/actions/stripe-connect";
import { rateLimitStrict } from "@/lib/rate-limit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collectiveId = searchParams.get("collectiveId");
  const mode = searchParams.get("mode");

  // Rate limit: 20 requests per minute per IP. Higher than callback because
  // refresh can loop a few times if the operator bounces between devices.
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success: rateLimitOk } = await rateLimitStrict(
    `stripe-connect-return:${clientIp}`,
    20,
    60_000
  );
  if (!rateLimitOk) {
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=error`);
  }

  if (!collectiveId || !UUID_REGEX.test(collectiveId)) {
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=error`);
  }

  // Authentication: operator must still be logged in. If they are not, we
  // send them through login and back to Settings — Stripe's onboarding does
  // not require our session to be alive, so a long onboarding on a separate
  // device can come back here cold.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      `${APP_URL}/login?redirect=/dashboard/settings`
    );
  }

  // Authorization: still an owner/admin of the collective?
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("collective_members")
    .select("role")
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) {
    console.error(
      `[stripe-connect-return] User ${user.id} not authorized for collective ${collectiveId}`
    );
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=error`);
  }

  // Refresh mode: link expired, make a new one.
  if (mode === "refresh") {
    const result = await createOnboardingLink(collectiveId);
    if (result.error || !result.url) {
      console.error(
        "[stripe-connect-return] refresh failed:",
        result.error
      );
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?stripe=error`
      );
    }
    return NextResponse.redirect(result.url);
  }

  // Return mode (or anything else): land on Settings. The card fetches
  // live status from Stripe to decide which state to render.
  return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=connected`);
}
