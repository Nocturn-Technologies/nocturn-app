"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// Mark a settlement as paid (manual payout — e-transfer, Venmo, etc.)
export async function markSettlementPaid(settlementId: string, payoutMethod?: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Get settlement
  const { data: settlement } = await admin
    .from("settlements")
    .select("id, status, collective_id")
    .eq("id", settlementId)
    .maybeSingle();

  if (!settlement) return { error: "Settlement not found" };
  if (settlement.status !== "approved") return { error: "Settlement must be approved first" };

  // Verify user is a member of this collective
  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", settlement.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "You don't have permission" };

  // Mark all pending line items as paid
  const { error: linesError } = await admin
    .from("settlement_lines")
    .update({
      payout_status: "paid",
    })
    .eq("settlement_id", settlementId)
    .eq("payout_status", "pending");

  if (linesError) {
    console.error("Failed to update settlement lines:", linesError);
    return { error: linesError.message };
  }

  // Update settlement status
  const { error: settlementError } = await admin
    .from("settlements")
    .update({
      status: "paid",
      updated_at: new Date().toISOString(),
      metadata: {
        payout_method: payoutMethod || "manual",
        paid_by: user.id,
        paid_at: new Date().toISOString(),
      },
    })
    .eq("id", settlementId);

  if (settlementError) return { error: settlementError.message };

  return { error: null };
}

// Get payout status for a settlement
export async function getPayoutStatus(settlementId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();

  const { data: lines } = await admin
    .from("settlement_lines")
    .select("id, label, amount, payout_status, type")
    .eq("settlement_id", settlementId)
    .order("created_at");

  return lines ?? [];
}
