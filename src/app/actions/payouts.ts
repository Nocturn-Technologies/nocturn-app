"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// Mark a settlement as paid (manual payout — e-transfer, Venmo, etc.)
export async function markSettlementPaid(settlementId: string, payoutMethod?: string) {
  try {
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

    // Update settlement status
    const { error: settlementError } = await admin
      .from("settlements")
      .update({
        status: "paid_out",
        updated_at: new Date().toISOString(),
        metadata: {
          payout_method: payoutMethod || "manual",
          paid_by: user.id,
          paid_at: new Date().toISOString(),
        },
      })
      .eq("id", settlementId);

    if (settlementError) return { error: "Something went wrong" };

    return { error: null };
  } catch (err) {
    console.error("[markSettlementPaid]", err);
    return { error: "Something went wrong" };
  }
}

