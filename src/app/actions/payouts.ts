"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// Mark a settlement as paid (manual payout — e-transfer, Venmo, etc.)
// TODO(audit): validate payoutMethod against enum ["etransfer","venmo","cashapp","wire","paypal","manual","other"]
export async function markSettlementPaid(settlementId: string, payoutMethod?: string) {
  try {
    if (!settlementId || typeof settlementId !== "string" || settlementId.length > 100) {
      return { error: "Invalid settlement ID" };
    }
    if (payoutMethod && (typeof payoutMethod !== "string" || payoutMethod.length > 100)) {
      return { error: "Invalid payout method" };
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const admin = createAdminClient();

    // Get settlement
    const { data: settlement, error: fetchError } = await admin
      .from("settlements")
      .select("id, status, collective_id")
      .eq("id", settlementId)
      .maybeSingle();

    if (fetchError) {
      console.error("[markSettlementPaid]", fetchError);
      return { error: "Something went wrong" };
    }
    if (!settlement) return { error: "Settlement not found" };
    if (settlement.status !== "approved") return { error: "Settlement must be approved first" };

    // Verify user is an admin/owner of this collective (role check)
    const { data: membership, error: memberError } = await admin
      .from("collective_members")
      .select("role")
      .eq("collective_id", settlement.collective_id)
      .eq("user_id", user.id)
      .in("role", ["admin", "owner"])
      .is("deleted_at", null)
      .maybeSingle();

    if (memberError) {
      console.error("[markSettlementPaid]", memberError);
      return { error: "Something went wrong" };
    }
    if (!membership) return { error: "Only admins and owners can mark settlements as paid" };

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

