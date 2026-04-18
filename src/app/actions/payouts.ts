"use server";

import { revalidatePath } from "next/cache";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { getStripe } from "@/lib/stripe";
import { isValidUUID } from "@/lib/utils";
import { toStripeAmount } from "@/lib/currency";

/**
 * Mark a settlement as paid — triggers a real Stripe Transfer from the
 * Nocturn platform balance to the collective's connected account.
 *
 * Preconditions:
 *   - Caller is an owner/admin of the settlement's collective.
 *   - Settlement status is "approved".
 *   - Collective has a connected Stripe account with payouts_enabled=true.
 *
 * State machine:
 *   1. Insert `payouts` row with status="pending" (before calling Stripe —
 *      crash-safe, if we fail between DB and Stripe we have a record).
 *   2. Call stripe.transfers.create with idempotency key = settlement.id
 *      (so retries don't double-transfer).
 *   3. On success: update payouts.stripe_transfer_id, status="processing";
 *      flip settlements.status to "paid_out".
 *   4. On failure: mark payouts.status="failed", leave settlement at
 *      "approved" so the operator can retry.
 *
 * Webhooks (transfer.created, payout.paid) later advance status → completed.
 */
export async function markSettlementPaid(settlementId: string) {
  try {
    if (!settlementId || !isValidUUID(settlementId)) {
      return { error: "Invalid settlement ID" };
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const admin = createAdminClient();

    // Fetch settlement + collective + event currency in one round-trip.
    // The event's currency is what the tickets were charged in — also the
    // currency Nocturn's platform balance accumulated, and therefore the
    // currency of the transfer we need to send.
    const { data: settlement, error: fetchError } = await admin
      .from("settlements")
      .select(
        "id, status, collective_id, event_id, net_profit, net_revenue, gross_revenue, collectives(id, name, stripe_account_id, default_currency), events(currency)"
      )
      .eq("id", settlementId)
      .maybeSingle();

    if (fetchError) {
      console.error("[markSettlementPaid] fetch error:", fetchError.message);
      return { error: "Something went wrong" };
    }
    if (!settlement) return { error: "Settlement not found" };
    if (settlement.status !== "approved") {
      return { error: "Settlement must be approved first" };
    }

    const collective = settlement.collectives as unknown as {
      id: string;
      name: string;
      stripe_account_id: string | null;
      default_currency: string;
    } | null;

    if (!collective) {
      return { error: "Collective not found" };
    }

    // Role check: owner or admin only.
    const { data: membership, error: memberError } = await admin
      .from("collective_members")
      .select("role")
      .eq("collective_id", settlement.collective_id)
      .eq("user_id", user.id)
      .in("role", ["admin", "owner"])
      .is("deleted_at", null)
      .maybeSingle();

    if (memberError) {
      console.error("[markSettlementPaid] membership error:", memberError.message);
      return { error: "Something went wrong" };
    }
    if (!membership) {
      return { error: "Only admins and owners can mark settlements as paid" };
    }

    // Connect precondition: must have a connected account and payouts must
    // be enabled. We call accounts.retrieve to check live status rather than
    // trusting any DB cache — onboarding can fail mid-flight.
    if (!collective.stripe_account_id) {
      return {
        error:
          "Set up Stripe Connect in Settings before paying out. Your collective needs a connected bank account.",
      };
    }

    let stripeAccount;
    try {
      stripeAccount = await getStripe().accounts.retrieve(
        collective.stripe_account_id
      );
    } catch (err) {
      console.error("[markSettlementPaid] accounts.retrieve error:", err);
      return { error: "Couldn't reach Stripe. Please try again." };
    }

    if (!stripeAccount.payouts_enabled) {
      return {
        error:
          "Stripe hasn't enabled payouts on your account yet. Finish onboarding in Settings (and check for any pending requirements).",
      };
    }

    // Transfer amount = NET REVENUE (gross minus refunds), NOT profit.
    // Rationale: Nocturn collects ticket money only. Artist/venue/vendor
    // costs are paid out-of-band by the operator (via e-transfer, cash,
    // etc.) — they never flow through Nocturn. So the operator needs to
    // receive the full ticket revenue they're entitled to, and manage
    // their own expenses from there. Profit (net − expenses) is a P&L
    // reporting number, not a cash-flow number.
    const netRevenueDollars = Number(settlement.net_revenue) || 0;
    const transferCurrency = (() => {
      const eventRow = settlement.events as unknown as {
        currency: string | null;
      } | null;
      const collectiveForCurrency = settlement.collectives as unknown as {
        default_currency: string | null;
      } | null;
      return (
        eventRow?.currency ||
        collectiveForCurrency?.default_currency ||
        "usd"
      ).toLowerCase();
    })();

    // Zero-decimal aware amount conversion. For USD/CAD/EUR/GBP/AUD this
    // is dollars × 100; for JPY it's whole yen. Defensive even though
    // checkout blocks zero-decimal today.
    const amountCents = toStripeAmount(netRevenueDollars, transferCurrency);

    if (amountCents <= 0) {
      return {
        error:
          "Settlement net revenue is zero or negative — nothing to transfer. Nothing to pay out.",
      };
    }

    // Transfer currency already resolved above as transferCurrency.
    const currency = transferCurrency;

    // Platform-balance health check: if Nocturn's Stripe account doesn't
    // have the transfer currency enabled in Payouts settings, charges in
    // that currency auto-converted to USD on arrival (with ~1% FX markup),
    // so the platform's balance for the event currency is zero — transfer
    // will fail. Detect this before calling transfers.create and surface a
    // clear message + Sentry alert so Shawn knows to enable the currency.
    try {
      const balance = await getStripe().balance.retrieve();
      const availableInCurrency = (balance.available ?? []).find(
        (b) => b.currency.toLowerCase() === currency
      );
      const pendingInCurrency = (balance.pending ?? []).find(
        (b) => b.currency.toLowerCase() === currency
      );
      const totalAvailable =
        (availableInCurrency?.amount ?? 0) + (pendingInCurrency?.amount ?? 0);

      if (totalAvailable < amountCents) {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureMessage(
          `Platform balance insufficient for transfer: ${currency.toUpperCase()} has ${totalAvailable} (need ${amountCents}). Likely missing currency support in Stripe Dashboard → Payouts settings.`,
          {
            level: "error",
            tags: {
              area: "stripe-connect",
              currency,
              settlement_id: settlement.id,
              collective_id: collective.id,
            },
          }
        );

        // Soft-fail if balance is ZERO for this currency (strong signal the
        // currency isn't enabled on the platform). Otherwise proceed —
        // Stripe will surface a clearer error than ours, and the transfer
        // might still succeed against the USD balance via Stripe FX.
        if (totalAvailable === 0) {
          return {
            error: `Nocturn's Stripe account doesn't accept ${currency.toUpperCase()} yet. Enable it in Stripe Dashboard → Settings → Payouts, or contact support.`,
          };
        }
      }
    } catch (balanceErr) {
      // Non-fatal: balance.retrieve can fail on rate limit or transient
      // network. Log and proceed — the transfer call itself will catch
      // anything that matters.
      console.warn(
        "[markSettlementPaid] balance.retrieve failed (non-fatal), proceeding with transfer:",
        balanceErr
      );
    }

    // Insert payouts row BEFORE calling Stripe. This insert is the race
    // guard: `payouts_one_active_per_settlement` is a unique partial
    // index on (settlement_id) WHERE kind='payout' AND status IN
    // ('pending','processing','completed'). Two concurrent
    // markSettlementPaid calls both reach this INSERT; the second hits a
    // 23505 unique-violation and returns a clear error. No race window.
    // If we crash between INSERT and Stripe call, the pending row stays
    // — a future retry would hit 23505. Operator can clear manually or
    // we can add a reconciliation cron later.
    const { data: payoutRow, error: payoutInsertErr } = await admin
      .from("payouts")
      .insert({
        collective_id: collective.id,
        settlement_id: settlement.id,
        kind: "payout",
        amount: netRevenueDollars,
        currency,
        status: "pending",
        initiated_at: new Date().toISOString(),
        metadata: {
          initiated_by: user.id,
          event_id: settlement.event_id,
        },
      })
      .select("id")
      .maybeSingle();

    if (payoutInsertErr) {
      if (payoutInsertErr.code === "23505") {
        return {
          error:
            "A payout is already in progress (or completed) for this settlement. Refresh to see status.",
        };
      }
      console.error(
        "[markSettlementPaid] payouts insert failed:",
        payoutInsertErr.message
      );
      return { error: "Failed to record payout. Please try again." };
    }
    if (!payoutRow) {
      return { error: "Failed to record payout. Please try again." };
    }

    // Call Stripe Transfer. Idempotency key = settlement id so retries on
    // network hiccups don't double-transfer.
    let transfer;
    try {
      transfer = await getStripe().transfers.create(
        {
          amount: amountCents,
          currency,
          destination: collective.stripe_account_id,
          transfer_group: `event_${settlement.event_id}`,
          // Stripe limits description to ~255 chars; truncate to be safe.
          description: `Nocturn settlement payout for ${collective.name}`.slice(0, 200),
          metadata: {
            settlement_id: settlement.id,
            event_id: settlement.event_id,
            collective_id: collective.id,
            initiated_by: user.id,
            platform: "nocturn",
          },
        },
        {
          idempotencyKey: `settlement_${settlement.id}`,
        }
      );
    } catch (stripeErr) {
      const msg =
        stripeErr instanceof Error ? stripeErr.message : "Unknown Stripe error";
      console.error("[markSettlementPaid] transfers.create failed:", msg);

      // Roll the payouts row forward to failed so we don't leave orphan
      // "pending" rows in the DB. Settlement stays at "approved" so the
      // operator can retry.
      await admin
        .from("payouts")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: msg.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payoutRow.id);

      // Stripe error messages are generally safe to surface — they describe
      // things like "insufficient funds in platform account" or "destination
      // account has restricted capabilities". Truncate defensively.
      return {
        error: `Transfer failed: ${msg.slice(0, 200)}`,
      };
    }

    // Stripe call succeeded. Advance state.
    const [{ error: payoutUpdErr }, { error: settlementUpdErr }] =
      await Promise.all([
        admin
          .from("payouts")
          .update({
            stripe_transfer_id: transfer.id,
            status: "processing",
            updated_at: new Date().toISOString(),
          })
          .eq("id", payoutRow.id),
        admin
          .from("settlements")
          .update({
            status: "paid_out",
            updated_at: new Date().toISOString(),
            metadata: {
              paid_by: user.id,
              paid_at: new Date().toISOString(),
              stripe_transfer_id: transfer.id,
            },
          })
          .eq("id", settlementId)
          .eq("status", "approved"),
      ]);

    if (payoutUpdErr) {
      // Non-fatal — transfer happened, we just couldn't annotate our row.
      // Reconciliation via webhook (transfer.created) will clean this up.
      console.error(
        "[markSettlementPaid] payouts post-transfer update failed (non-fatal):",
        payoutUpdErr.message
      );
    }
    if (settlementUpdErr) {
      console.error(
        "[markSettlementPaid] settlements update failed (non-fatal):",
        settlementUpdErr.message
      );
    }

    // Invalidate finance caches — the settlement badge and payout pipeline
    // both render from server-side fetches.
    revalidatePath("/dashboard/finance");
    revalidatePath(`/dashboard/events/${settlement.event_id}/financials`);

    return {
      error: null,
      transferId: transfer.id,
      payoutId: payoutRow.id,
    };
  } catch (err) {
    console.error("[markSettlementPaid] unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Fetch payout status for a settlement. Used by the Finance UI to render
 * the pipeline state (pending → processing → completed / failed).
 */
export async function getPayoutStatus(settlementId: string) {
  try {
    if (!settlementId || !isValidUUID(settlementId)) {
      return { error: "Invalid settlement ID", payout: null };
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", payout: null };

    const admin = createAdminClient();

    // Fetch the latest payout row for this settlement. A retry after a
    // failed transfer may create multiple rows; newest wins.
    const { data: payout, error } = await admin
      .from("payouts")
      .select(
        "id, status, amount, currency, stripe_transfer_id, stripe_payout_id, initiated_at, completed_at, failed_at, failure_reason, collective_id"
      )
      .eq("settlement_id", settlementId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[getPayoutStatus] fetch error:", error.message);
      return { error: "Something went wrong", payout: null };
    }
    if (!payout) return { error: null, payout: null };

    // Authorization: member of the payout's collective.
    const { count } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", payout.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!count) return { error: "Not authorized", payout: null };

    return { error: null, payout };
  } catch (err) {
    console.error("[getPayoutStatus] unexpected error:", err);
    return { error: "Something went wrong", payout: null };
  }
}
