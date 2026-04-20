"use server";

import { revalidatePath } from "next/cache";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { isValidUUID } from "@/lib/utils";

/**
 * Mark a settlement as paid by inserting a payout record and updating the
 * settlement status. Payouts are tracked manually (no Stripe Connect transfer)
 * — the operator marks the settlement paid after sending funds via e-transfer,
 * Venmo, etc.
 *
 * State machine:
 *   1. Insert `payouts` row with status="paid" and paid_at = now.
 *   2. Flip settlements.status to "paid_out".
 *
 * Preconditions:
 *   - Caller is an owner/admin of the settlement's collective.
 *   - Settlement status is "approved".
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

    // Fetch settlement + collective in one round-trip.
    const { data: settlement, error: fetchError } = await admin
      .from("settlements")
      .select(
        "id, status, collective_id, event_id, net_payout, total_revenue, collectives(id, name)"
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

    // Net payout amount from the settlement record.
    const netPayoutDollars = Number(settlement.net_payout) || 0;

    if (netPayoutDollars <= 0) {
      return {
        error:
          "Settlement net payout is zero or negative — nothing to pay out.",
      };
    }

    const now = new Date().toISOString();

    // Insert payout row + flip settlement status atomically.
    const { data: payoutRow, error: payoutInsertErr } = await admin
      .from("payouts")
      .insert({
        collective_id: collective.id,
        settlement_id: settlement.id,
        amount: netPayoutDollars,
        currency: "cad",
        status: "paid",
        paid_at: now,
        notes: `Marked paid by ${user.id}`,
      })
      .select("id")
      .maybeSingle();

    if (payoutInsertErr) {
      console.error(
        "[markSettlementPaid] payouts insert failed:",
        payoutInsertErr.message
      );
      return { error: "Failed to record payout. Please try again." };
    }
    if (!payoutRow) {
      return { error: "Failed to record payout. Please try again." };
    }

    // Advance settlement to paid_out.
    const { error: settlementUpdErr } = await admin
      .from("settlements")
      .update({ status: "paid_out", finalized_at: now })
      .eq("id", settlementId)
      .eq("status", "approved");

    if (settlementUpdErr) {
      console.error(
        "[markSettlementPaid] settlements update failed (non-fatal):",
        settlementUpdErr.message
      );
    }

    // Invalidate finance caches.
    revalidatePath("/dashboard/finance");
    revalidatePath(`/dashboard/events/${settlement.event_id}/financials`);

    return {
      error: null,
      payoutId: payoutRow.id,
    };
  } catch (err) {
    console.error("[markSettlementPaid] unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Fetch payout status for a settlement. Used by the Finance UI to render
 * the pipeline state (pending → paid / failed).
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

    // Fetch the latest payout row for this settlement.
    const { data: payout, error } = await admin
      .from("payouts")
      .select(
        "id, status, amount, currency, method, reference, notes, paid_at, created_at, collective_id"
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
