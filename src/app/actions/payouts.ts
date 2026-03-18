"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Execute payouts for an approved settlement via Stripe Connect transfers
export async function executePayouts(settlementId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Get settlement
  const { data: settlement } = await admin
    .from("settlements")
    .select("*, collectives(stripe_account_id)")
    .eq("id", settlementId)
    .single();

  if (!settlement) return { error: "Settlement not found" };
  if (settlement.status !== "approved") return { error: "Settlement must be approved first" };

  const collective = settlement.collectives as unknown as { stripe_account_id: string | null };
  if (!collective?.stripe_account_id) {
    return { error: "Collective has no Stripe account connected" };
  }

  // Get pending line items that need payout
  const { data: lines } = await admin
    .from("settlement_lines")
    .select("*")
    .eq("settlement_id", settlementId)
    .eq("payout_status", "pending")
    .neq("type", "stripe_fee")
    .neq("type", "platform_fee");

  if (!lines || lines.length === 0) {
    return { error: "No pending payouts" };
  }

  const errors: string[] = [];
  let paidCount = 0;

  // Transfer the net profit to the collective's connected account
  const netAmount = Number(settlement.profit);
  if (netAmount > 0) {
    try {
      const transfer = await getStripe().transfers.create({
        amount: Math.round(netAmount * 100), // convert to cents
        currency: "usd",
        destination: collective.stripe_account_id,
        description: `Settlement payout for event`,
        metadata: {
          settlement_id: settlementId,
          event_id: settlement.event_id,
        },
      });

      // Mark all lines as paid
      for (const line of lines) {
        await admin
          .from("settlement_lines")
          .update({
            payout_status: "paid",
            stripe_transfer_id: transfer.id,
          })
          .eq("id", line.id);
      }
      paidCount = lines.length;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transfer failed";
      errors.push(message);

      // Mark as failed
      for (const line of lines) {
        await admin
          .from("settlement_lines")
          .update({ payout_status: "failed" })
          .eq("id", line.id);
      }
    }
  }

  // Update settlement status
  if (errors.length === 0) {
    await admin
      .from("settlements")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", settlementId);
  }

  return {
    error: errors.length > 0 ? errors.join("; ") : null,
    paidCount,
  };
}

// Get payout status for a settlement
export async function getPayoutStatus(settlementId: string) {
  const admin = createAdminClient();

  const { data: lines } = await admin
    .from("settlement_lines")
    .select("id, label, amount, payout_status, stripe_transfer_id, type")
    .eq("settlement_id", settlementId)
    .order("created_at");

  return lines ?? [];
}
