"use server";

/**
 * Stripe Connect (Express) — onboarding & status actions
 *
 * Money flow: Separate Charges and Transfers.
 *   - Checkout keeps collecting 100% into Nocturn's platform account.
 *   - On settlement payout, we call stripe.transfers.create({ destination: acct_... })
 *     to move the collective's profit to their connected account.
 *
 * Account type: Express — Stripe-hosted onboarding. Operators never sign up for
 * their own Stripe account; Nocturn owns the customer relationship.
 *
 * Storage: connected-account state lives in `collective_stripe_accounts`
 * (one row per collective), added after PR #93 slimmed `collectives`. The
 * webhook at /api/webhooks/stripe keeps the denorm fields (charges_enabled,
 * payouts_enabled, details_submitted) fresh.
 */

import Stripe from "stripe";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { getStripe } from "@/lib/stripe";
import { isValidUUID } from "@/lib/utils";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

// Shape returned to the client for the Payouts card state machine.
export type ConnectStatus = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: string[]; // currently_due items, surfaced to the UI
  disabledReason: string | null;
};

type StripeAccountRow = {
  collective_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  default_currency: string | null;
  status_updated_at: string;
};

// Authz + collective fetch. Returns the collective row, membership, and (if
// present) the stripe_account row. Centralised so every action has the same
// check and the same error copy.
async function assertCollectiveAdmin(collectiveId: string) {
  if (!isValidUUID(collectiveId)) {
    return { error: "Invalid collective ID" as const };
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  const admin = createAdminClient();

  const { data: membership, error: memberError } = await admin
    .from("collective_members")
    .select("role")
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .is("deleted_at", null)
    .maybeSingle();

  if (memberError) {
    console.error("[stripe-connect] membership check error:", memberError.message);
    return { error: "Something went wrong" as const };
  }
  if (!membership) {
    return { error: "Only collective owners and admins can manage payouts" as const };
  }

  // Post-PR #93: collectives has only lean columns. Select only what exists.
  const { data: collective, error: collectiveError } = await admin
    .from("collectives")
    .select("id, name, city")
    .eq("id", collectiveId)
    .maybeSingle();

  if (collectiveError || !collective) {
    return { error: "Collective not found" as const };
  }

  // Stripe account state — separate row, may not exist yet.
  const { data: stripeAccount } = await admin
    .from("collective_stripe_accounts")
    .select("collective_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, default_currency, status_updated_at")
    .eq("collective_id", collective.id)
    .maybeSingle();

  return { user, admin, collective, stripeAccount: stripeAccount as StripeAccountRow | null } as const;
}

/**
 * Create a new Stripe Express connected account for the collective, if one
 * doesn't already exist. Returns the account id either way.
 *
 * Idempotency: if a row exists in `collective_stripe_accounts`, we re-use it.
 * Creating a second account would orphan the first (no way to delete from the
 * API in test mode, requires a support ticket in live mode).
 */
export async function createConnectAccount(collectiveId: string) {
  try {
    const auth = await assertCollectiveAdmin(collectiveId);
    if ("error" in auth) return { error: auth.error };

    const { user, admin, collective, stripeAccount } = auth;

    if (stripeAccount?.stripe_account_id) {
      return { error: null, accountId: stripeAccount.stripe_account_id };
    }

    // Country is inferred from the collective's city. Stripe's hosted form
    // lets the operator correct it if we guess wrong.
    const country = inferCountryFromCity(collective.city) ?? "US";

    let account: Stripe.Account;
    try {
      account = await getStripe().accounts.create({
        type: "express",
        country,
        email: user.email ?? undefined,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: undefined, // Let operator pick individual/company during onboarding
        business_profile: {
          name: collective.name,
          product_description: "Music events and ticket sales",
          mcc: "7922", // Theatrical producers, ticket agencies
        },
        metadata: {
          collective_id: collective.id,
          collective_name: collective.name,
          created_by: user.id,
          platform: "nocturn",
        },
      });
    } catch (stripeErr) {
      console.error("[stripe-connect] accounts.create failed:", stripeErr);
      return { error: "Failed to create Stripe account. Please try again." };
    }

    const { error: upsertError } = await admin
      .from("collective_stripe_accounts")
      .upsert({
        collective_id: collective.id,
        stripe_account_id: account.id,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        default_currency: account.default_currency ?? null,
        status_updated_at: new Date().toISOString(),
      }, { onConflict: "collective_id" });

    if (upsertError) {
      // We have a Stripe account we can't persist. Operator can retry and
      // we'll re-use the existing one (future: add an idempotency key).
      console.error("[stripe-connect] Failed to persist stripe_account_id:", upsertError.message, "account:", account.id);
      return { error: "Account created but not saved. Please contact support with ID: " + account.id };
    }

    return { error: null, accountId: account.id };
  } catch (err) {
    console.error("[stripe-connect] createConnectAccount unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Generate a one-time onboarding link for the operator to complete KYC.
 * Links expire after a few minutes — always generate fresh, never store.
 */
export async function createOnboardingLink(collectiveId: string) {
  try {
    const auth = await assertCollectiveAdmin(collectiveId);
    if ("error" in auth) return { error: auth.error };

    const { collective, stripeAccount } = auth;

    let accountId = stripeAccount?.stripe_account_id;
    if (!accountId) {
      const createResult = await createConnectAccount(collectiveId);
      if (createResult.error || !createResult.accountId) {
        return { error: createResult.error ?? "Failed to create Stripe account" };
      }
      accountId = createResult.accountId;
    }

    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/api/stripe/connect/return?collectiveId=${collective.id}&mode=refresh`,
      return_url: `${APP_URL}/api/stripe/connect/return?collectiveId=${collective.id}&mode=return`,
      type: "account_onboarding",
    });

    return { error: null, url: accountLink.url };
  } catch (err) {
    console.error("[stripe-connect] createOnboardingLink error:", err);
    return { error: "Failed to generate onboarding link" };
  }
}

/**
 * Fetch current onboarding status. Reads the denormalized fields on
 * collective_stripe_accounts first (kept in sync by the account.updated
 * webhook) and only falls through to Stripe when the cache is stale.
 */
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getConnectStatus(
  collectiveId: string,
  opts?: { forceRefresh?: boolean }
): Promise<{ error: string | null; status: ConnectStatus | null }> {
  try {
    const auth = await assertCollectiveAdmin(collectiveId);
    if ("error" in auth) return { error: auth.error ?? "Something went wrong", status: null };

    const { admin, collective, stripeAccount } = auth;

    if (!stripeAccount?.stripe_account_id) {
      return {
        error: null,
        status: {
          accountId: null,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: [],
          disabledReason: null,
        },
      };
    }

    // Serve from cache when fresh.
    const updatedAt = stripeAccount.status_updated_at
      ? new Date(stripeAccount.status_updated_at).getTime()
      : 0;
    const isCacheFresh = !opts?.forceRefresh
      && updatedAt > 0
      && Date.now() - updatedAt < STATUS_CACHE_TTL_MS;

    if (isCacheFresh) {
      return {
        error: null,
        status: {
          accountId: stripeAccount.stripe_account_id,
          chargesEnabled: stripeAccount.charges_enabled,
          payoutsEnabled: stripeAccount.payouts_enabled,
          detailsSubmitted: stripeAccount.details_submitted,
          requirements: [],
          disabledReason: null,
        },
      };
    }

    // Cold fetch from Stripe + refresh the denorm cache in the background.
    let account: Stripe.Account;
    try {
      account = await getStripe().accounts.retrieve(stripeAccount.stripe_account_id);
    } catch (stripeErr) {
      console.error("[stripe-connect] accounts.retrieve error:", stripeErr);
      return { error: "Failed to reach Stripe", status: null };
    }

    // Best-effort cache refresh — don't block on this.
    void admin
      .from("collective_stripe_accounts")
      .update({
        charges_enabled: account.charges_enabled ?? false,
        payouts_enabled: account.payouts_enabled ?? false,
        details_submitted: account.details_submitted ?? false,
        default_currency: account.default_currency ?? null,
        status_updated_at: new Date().toISOString(),
      })
      .eq("collective_id", collective.id);

    return {
      error: null,
      status: {
        accountId: account.id,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
        requirements: account.requirements?.currently_due ?? [],
        disabledReason: account.requirements?.disabled_reason ?? null,
      },
    };
  } catch (err) {
    console.error("[stripe-connect] getConnectStatus unexpected error:", err);
    return { error: "Something went wrong", status: null };
  }
}

/**
 * Generate a one-time login link to the operator's Express dashboard.
 */
export async function createLoginLink(collectiveId: string) {
  try {
    const auth = await assertCollectiveAdmin(collectiveId);
    if ("error" in auth) return { error: auth.error };

    const { stripeAccount } = auth;

    if (!stripeAccount?.stripe_account_id) {
      return { error: "No Stripe account connected yet" };
    }

    const link = await getStripe().accounts.createLoginLink(stripeAccount.stripe_account_id);
    return { error: null, url: link.url };
  } catch (err) {
    console.error("[stripe-connect] createLoginLink error:", err);
    return { error: "Failed to generate dashboard link" };
  }
}

// Rough city → country inference so Stripe's onboarding form opens in the
// right locale. We only need a good default — Stripe's hosted form lets
// the operator correct it if we guess wrong.
function inferCountryFromCity(city: string | undefined | null): string | null {
  if (!city) return null;
  const c = city.toLowerCase().trim();
  const CA_CITIES = ["toronto", "montreal", "vancouver", "calgary", "ottawa", "edmonton", "winnipeg", "hamilton", "quebec", "halifax"];
  const GB_CITIES = ["london", "manchester", "birmingham", "leeds", "bristol", "glasgow", "edinburgh"];
  if (CA_CITIES.some((ca) => c.includes(ca))) return "CA";
  if (GB_CITIES.some((gb) => c.includes(gb))) return "GB";
  return "US";
}
