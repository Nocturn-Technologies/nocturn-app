"use server";

import { getStripe } from "@/lib/stripe";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

/**
 * Creates a Stripe Connect Express account for a collective,
 * saves the account ID, and returns an onboarding URL.
 */
export async function createConnectAccount(collectiveId: string) {
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = createAdminClient();

  // Verify user is a member of this collective
  const { count } = await supabase
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "You don't have permission to manage this collective" };

  // Check if collective already has a Stripe account
  const { data: collective, error: fetchError } = await supabase
    .from("collectives")
    .select("stripe_account_id, name")
    .eq("id", collectiveId)
    .maybeSingle();

  if (fetchError || !collective) {
    return { error: "Collective not found" };
  }

  let accountId = collective.stripe_account_id;

  // Create a new Express account if one doesn't exist
  if (!accountId) {
    const account = await getStripe().accounts.create(
      {
        type: "express",
        metadata: { collective_id: collectiveId },
        business_profile: {
          name: collective.name,
        },
      },
      { idempotencyKey: `connect-account-${collectiveId}` }
    );

    accountId = account.id;

    const { error: updateError } = await supabase
      .from("collectives")
      .update({ stripe_account_id: accountId })
      .eq("id", collectiveId);

    if (updateError) {
      return { error: "Failed to save Stripe account" };
    }
  }

  // Create an Account Link for onboarding
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const accountLink = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/dashboard/settings?stripe=refresh`,
    return_url: `${appUrl}/api/stripe/connect/callback`,
    type: "account_onboarding",
  });

  return { url: accountLink.url };
}

/**
 * Checks whether a collective's Stripe Connect account is fully set up.
 */
export async function getConnectAccountStatus(collectiveId: string) {
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return { hasAccount: false, chargesEnabled: false, payoutsEnabled: false };

  const supabase = createAdminClient();

  // Verify user is a member of this collective
  const { count: memberCount } = await supabase
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!memberCount || memberCount === 0) return { hasAccount: false, chargesEnabled: false, payoutsEnabled: false };

  const { data: collective, error } = await supabase
    .from("collectives")
    .select("stripe_account_id")
    .eq("id", collectiveId)
    .maybeSingle();

  if (error || !collective || !collective.stripe_account_id) {
    return { hasAccount: false, chargesEnabled: false, payoutsEnabled: false };
  }

  const account = await getStripe().accounts.retrieve(
    collective.stripe_account_id
  );

  return {
    hasAccount: true,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
  };
}

/**
 * Creates a login link to the Stripe Express Dashboard for a collective.
 */
export async function createConnectLoginLink(collectiveId: string) {
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = createAdminClient();

  // Verify user is a member of this collective
  const { count: memberCount } = await supabase
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!memberCount || memberCount === 0) return { error: "You don't have permission to manage this collective" };

  const { data: collective, error } = await supabase
    .from("collectives")
    .select("stripe_account_id")
    .eq("id", collectiveId)
    .maybeSingle();

  if (error || !collective || !collective.stripe_account_id) {
    return { error: "No Stripe account found" };
  }

  const loginLink = await getStripe().accounts.createLoginLink(
    collective.stripe_account_id
  );

  return { url: loginLink.url };
}
