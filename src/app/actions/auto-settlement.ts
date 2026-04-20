"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

import { enrichAttendeeCRM } from "./crm-enrichment";

export async function generateAutoSettlement(eventId: string) {
  try {
  if (!eventId?.trim()) return { error: "Event ID is required" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // 1. Get event + collective_id.
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, collective_id, status")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    if (eventError) console.error("[generateAutoSettlement] event query error:", eventError.message);
    return { error: "Event not found" };
  }

  // Verify caller is a member of the event's collective
  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount) {
    return { error: "Not authorized" };
  }

  // Check for existing settlement (prevent duplicates)
  const { data: existingSettlement } = await admin
    .from("settlements")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingSettlement) {
    return { error: null }; // Already exists, silently skip
  }

  // 2. Calculate gross revenue from paid orders (sum orders.total WHERE status='paid')
  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("total, platform_fee, stripe_fee")
    .eq("event_id", eventId)
    .eq("status", "paid");

  if (ordersError) {
    console.error("[generateAutoSettlement] orders query error:", ordersError.message);
    return { error: "Failed to calculate revenue" };
  }

  const totalRevenue = (orders ?? []).reduce(
    (sum, o) => sum + (Number(o.total) || 0),
    0
  );
  // Platform fee = sum of all order platform fees (Nocturn's cut, 7%+$0.50)
  const platformFee = (orders ?? []).reduce(
    (sum, o) => sum + (Number(o.platform_fee) || 0),
    0
  );
  // Stripe fees = sum of all order stripe fees (informational for Nocturn P&L)
  const stripeFee = (orders ?? []).reduce(
    (sum, o) => sum + (Number(o.stripe_fee) || 0),
    0
  );

  // 3. Calculate artist fees from confirmed event_artists.
  const { data: eventArtists, error: artistsError } = await admin
    .from("event_artists")
    .select("fee")
    .eq("event_id", eventId);

  if (artistsError) {
    console.error("[generateAutoSettlement] artists query error:", artistsError.message);
    return { error: "Failed to calculate artist fees" };
  }

  const artistFeesTotal = (eventArtists ?? []).reduce(
    (sum, a) => sum + (Number(a.fee) || 0),
    0
  );

  // 4. Fetch event expenses (non-talent costs like venue, equipment, etc.)
  const { data: expenses, error: expensesError } = await admin
    .from("event_expenses")
    .select("amount, category")
    .eq("event_id", eventId);

  if (expensesError) {
    console.error("[generateAutoSettlement] expenses query error:", expensesError.message);
    return { error: "Failed to calculate expenses" };
  }

  const totalExpenses = (expenses ?? []).reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );

  // 5. Net payout = total revenue minus platform fee, stripe fee, artist fees, and other expenses.
  // total_revenue is what was collected from buyers (including the buyer-facing service fee).
  // net_payout is what the collective actually receives.
  const netPayout = Math.max(
    0,
    totalRevenue - platformFee - stripeFee - artistFeesTotal - totalExpenses
  );

  // 6. Insert settlement record matching the settlements table schema.
  const { data: settlement, error: settlementError } = await admin
    .from("settlements")
    .insert({
      event_id: eventId,
      collective_id: event.collective_id,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      platform_fee: Math.round(platformFee * 100) / 100,
      stripe_fee: Math.round(stripeFee * 100) / 100,
      net_payout: Math.round(netPayout * 100) / 100,
      status: "draft",
    })
    .select("id")
    .maybeSingle();

  if (settlementError) {
    // Handle unique constraint violation (race — another process created it)
    if (settlementError.code === "23505") {
      return { error: null }; // Already exists, that's fine
    }
    console.error("[generateAutoSettlement] settlement insert error:", settlementError.message);
    return { error: "Failed to create settlement" };
  }

  if (!settlement) {
    return { error: "Settlement insert returned no data" };
  }

  // 7. Trigger CRM enrichment for attendees
  const crmResult = await enrichAttendeeCRM(eventId);
  if (crmResult.error) {
    console.error("CRM enrichment warning:", crmResult.error);
    // Non-fatal — settlement was still created
  }

  return { error: null, settlementId: settlement.id };
  } catch (err) {
    console.error("Auto-settlement error:", err);
    return { error: "Something went wrong" };
  }
}
