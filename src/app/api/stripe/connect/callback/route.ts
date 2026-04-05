import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/config";
import { createClient as createServerClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // collective_id passed as state during OAuth

  if (!code) {
    // No authorization code — just redirect (e.g., user cancelled)
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=cancelled`);
  }

  // Authentication: Verify the user is logged in
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error("[stripe-connect] No authenticated user on callback");
    return NextResponse.redirect(`${APP_URL}/login?redirect=/dashboard/settings`);
  }

  // State validation: Ensure collective_id was provided and is a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!state || !uuidRegex.test(state)) {
    console.error("[stripe-connect] Invalid or missing state param:", state);
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=error`);
  }

  // Authorization: Verify the user is an owner/admin of the collective
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("collective_members")
    .select("role")
    .eq("collective_id", state)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    console.error(`[stripe-connect] User ${user.id} not authorized for collective ${state}`);
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=error`);
  }

  try {
    // Exchange the authorization code for a connected account
    const response = await getStripe().oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const stripeAccountId = response.stripe_user_id;

    if (!stripeAccountId) {
      console.error("[stripe-connect] No stripe_user_id in OAuth response");
      return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=error`);
    }

    // Store the Stripe account ID on the collective
    const { error: updateError } = await admin.from("collectives")
      .update({ stripe_account_id: stripeAccountId })
      .eq("id", state);

    if (updateError) {
      console.error(`[stripe-connect] Failed to save Stripe account ${stripeAccountId} to collective ${state}:`, updateError);
      return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=error`);
    }

    console.info(`[stripe-connect] Connected Stripe account ${stripeAccountId} to collective ${state}`);

    return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=connected`);
  } catch (err) {
    console.error("[stripe-connect] OAuth callback error:", err);
    return NextResponse.redirect(`${APP_URL}/dashboard/settings?stripe=error`);
  }
}
