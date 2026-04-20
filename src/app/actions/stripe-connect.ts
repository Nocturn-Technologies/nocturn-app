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
 * Authz: all actions verify the caller is an owner/admin of the collective.
 * We deliberately do NOT allow regular members to initiate Connect — the
 * account's bank details belong to whoever completes onboarding, so only
 * collective leadership should be able to bind it.
 */

import Stripe from "stripe";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { getStripe } from "@/lib/stripe";
import { isValidUUID } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

// Helper to bypass generated-type constraints for Stripe columns not yet
// reflected in the schema (stripe_account_id, stripe_charges_enabled, etc.)
function untypedCollectives(admin: ReturnType<typeof createAdminClient>) {
  return (admin as unknown as SupabaseClient).from("collectives");
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

// Stripe Connect columns on collectives exist in the database but are not yet
// in the generated types. Extend with a local interface and use as unknown as.
interface CollectiveWithStripe {
  id: string;
  name: string;
  metadata: Record<string, unknown> | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
  stripe_requirements_currently_due: string[] | null;
  stripe_disabled_reason: string | null;
  stripe_status_updated_at: string | null;
}

// Shape returned to the client for the Payouts card state machine.
export type ConnectStatus = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: string[]; // currently_due items, surfaced to the UI
  disabledReason: string | null;
};

// Authz + collective fetch. Returns the collective row or an error string.
// Centralised so every action has the same check and the same error copy.
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

  const { data: rawCollective, error: collectiveError } = await untypedCollectives(admin)
    .select("id, name, metadata, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_requirements_currently_due, stripe_disabled_reason, stripe_status_updated_at")
    .eq("id", collectiveId)
    .maybeSingle() as {
      data: CollectiveWithStripe | null;
      error: { message: string } | null;
    };

  if (collectiveError || !rawCollective) {
    return { error: "Collective not found" as const };
  }

  const collective = rawCollective;

  return { user, admin, collective };
}

/**
 * Create a new Stripe Express connected account for the collective, if one
 * doesn't already exist. Returns the account id either way.
 *
 * Idempotency: if `collectives.stripe_account_id` is already set, we re-use it.
 * Creating a second account would orphan the first (no way to delete from the
 * API in test mode, requires a support ticket in live mode).
 */
export async function createConnectAccount(collectiveId: string) {
  try {
    const auth = await assertCollectiveAdmin(collectiveId);
    if ("error" in auth) return { error: auth.error };

    const { user, admin, collective } = auth;

    if (collective.stripe_account_id) {
      return { error: null, accountId: collective.stripe_account_id };
    }

    // Country is inferred from the operator's billing address during the
    // hosted onboarding flow. We pass the best guess we have from collective
    // metadata.city — Stripe overrides it if the operator enters an address
    // in a different country. Default to US if unset (majority of target
    // collectives are US + Canada; either triggers the right Express form).
    const collectiveCity = collective.metadata?.["city"] as string | undefined;
    const country = inferCountryFromCity(collectiveCity) ?? "US";

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

    const { error: updateError } = await untypedCollectives(admin)
      .update({ stripe_account_id: account.id })
      .eq("id", collective.id);

    if (updateError) {
      // We have a Stripe account we can't persist. Better to surface this
      // than to silently leak orphan accounts — operator can retry and
      // we'll re-use the existing one (Stripe's create is not idempotent
      // on its own, but a future enhancement could add an idempotency key
      // keyed on collective_id to make this recoverable).
      console.error("[stripe-connect] Failed to persist stripe_account_id:", updateError.message, "account:", account.id);
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
 *
 * The return_url brings them back to /api/stripe/connect/return, which
 * re-fetches status and redirects to Settings. refresh_url is hit if the
 * link expires before they finish — same route re-issues a fresh link.
 */
export async function createOnboardingLink(collectiveId: string) {
  try {
    const auth = await assertCollectiveAdmin(collectiveId);
    if ("error" in auth) return { error: auth.error };

    const { collective } = auth;

    // Ensure an account exists first. This double-call is intentional — if
    // the operator clicks "Set up payouts" on a collective that has never
    // had an account, we create and link in one flow.
    let accountId = collective.stripe_account_id;
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
 * collectives first (kept in sync by the account.updated webhook) and
 * only falls through to Stripe when we have no cached value yet — that
 * is, for the first load after account creation but before the first
 * webhook arrives. Saves a Stripe API call on every Settings mount.
 *
 * Pass `forceRefresh: true` to bypass the cache (e.g. immediately after
 * the user returns from hosted onboarding).
 */
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getConnectStatus(
  collectiveId: string,
  opts?: { forceRefresh?: boolean }
): Promise<{ error: string | null; status: ConnectStatus | null }> {
  try {
    const auth = await assertCollectiveAdmin(collectiveId);
    if ("error" in auth) return { error: auth.error ?? "Something went wrong", status: null };

    const { admin, collective } = auth;

    const stripeAccountId = collective.stripe_account_id;
    if (!stripeAccountId) {
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

    // Try cached status first. The account.updated webhook populates
    // stripe_status_updated_at; if it's recent and caller didn't force a
    // refresh, return the denorm columns.
    if (!opts?.forceRefresh) {
      const { data: cached } = await untypedCollectives(admin)
        .select(
          "stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_requirements_currently_due, stripe_disabled_reason, stripe_status_updated_at"
        )
        .eq("id", collective.id)
        .maybeSingle() as {
          data: Pick<
            CollectiveWithStripe,
            | "stripe_charges_enabled"
            | "stripe_payouts_enabled"
            | "stripe_details_submitted"
            | "stripe_requirements_currently_due"
            | "stripe_disabled_reason"
            | "stripe_status_updated_at"
          > | null;
        };

      const updatedAt = cached?.stripe_status_updated_at
        ? new Date(cached.stripe_status_updated_at).getTime()
        : 0;
      const isCacheFresh =
        updatedAt > 0 && Date.now() - updatedAt < STATUS_CACHE_TTL_MS;

      if (cached && isCacheFresh) {
        return {
          error: null,
          status: {
            accountId: stripeAccountId,
            chargesEnabled: cached.stripe_charges_enabled,
            payoutsEnabled: cached.stripe_payouts_enabled,
            detailsSubmitted: cached.stripe_details_submitted,
            requirements: cached.stripe_requirements_currently_due ?? [],
            disabledReason: cached.stripe_disabled_reason,
          },
        };
      }
    }

    // Cold fetch from Stripe + refresh the denorm cache in the background.
    let account: Stripe.Account;
    try {
      account = await getStripe().accounts.retrieve(stripeAccountId);
    } catch (stripeErr) {
      console.error("[stripe-connect] accounts.retrieve error:", stripeErr);
      return { error: "Failed to reach Stripe", status: null };
    }

    // Best-effort cache refresh — don't block on this.
    void untypedCollectives(admin)
      .update({
        stripe_charges_enabled: account.charges_enabled ?? false,
        stripe_payouts_enabled: account.payouts_enabled ?? false,
        stripe_details_submitted: account.details_submitted ?? false,
        stripe_requirements_currently_due:
          account.requirements?.currently_due ?? [],
        stripe_disabled_reason:
          account.requirements?.disabled_reason ?? null,
        stripe_status_updated_at: new Date().toISOString(),
      })
      .eq("id", collective.id);

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
 * Generate a one-time login link to the operator's Express dashboard,
 * where they can manage payout schedule, bank accounts, and view payouts.
 */
export async function createLoginLink(collectiveId: string) {
  try {
    const auth = await assertCollectiveAdmin(collectiveId);
    if ("error" in auth) return { error: auth.error };

    const { collective } = auth;

    const stripeAccountId = collective.stripe_account_id;
    if (!stripeAccountId) {
      return { error: "No Stripe account connected yet" };
    }

    const link = await getStripe().accounts.createLoginLink(stripeAccountId);
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
