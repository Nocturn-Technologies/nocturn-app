"use server";

import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Creates a Stripe Connect Express account for a collective,
 * saves the account ID, and returns an onboarding URL.
 */
export async function createConnectAccount(collectiveId: string) {
  const supabase = createAdminClient();

  // Check if collective already has a Stripe account
  const { data: collective, error: fetchError } = await supabase
    .from("collectives")
    .select("stripe_account_id, name")
    .eq("id", collectiveId)
    .single();

  if (fetchError || !collective) {
    return { error: "Collective not found" };
  }

  let accountId = collective.stripe_account_id;

  // Create a new Express account if one doesn't exist
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      metadata: { collective_id: collectiveId },
      business_profile: {
        name: collective.name,
      },
    });

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
  const accountLink = await stripe.accountLinks.create({
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
  const supabase = createAdminClient();

  const { data: collective, error } = await supabase
    .from("collectives")
    .select("stripe_account_id")
    .eq("id", collectiveId)
    .single();

  if (error || !collective || !collective.stripe_account_id) {
    return { hasAccount: false, chargesEnabled: false, payoutsEnabled: false };
  }

  const account = await stripe.accounts.retrieve(
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
  const supabase = createAdminClient();

  const { data: collective, error } = await supabase
    .from("collectives")
    .select("stripe_account_id")
    .eq("id", collectiveId)
    .single();

  if (error || !collective || !collective.stripe_account_id) {
    return { error: "No Stripe account found" };
  }

  const loginLink = await stripe.accounts.createLoginLink(
    collective.stripe_account_id
  );

  return { url: loginLink.url };
}
