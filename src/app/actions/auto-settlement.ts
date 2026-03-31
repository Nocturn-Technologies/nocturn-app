"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { PLATFORM_FEE_PERCENT, PLATFORM_FEE_FLAT_CENTS } from "@/lib/pricing";
import { enrichAttendeeCRM } from "./crm-enrichment";

export async function generateAutoSettlement(eventId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  try {
    // 1. Get event + collective_id
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id, collective_id, status")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      return { error: eventError?.message ?? "Event not found." };
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

    // 2. Calculate gross revenue from paid/checked-in tickets
    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, price_paid")
      .eq("event_id", eventId)
      .in("status", ["paid", "checked_in"]);

    if (ticketsError) {
      return { error: `Tickets query failed: ${ticketsError.message}` };
    }

    const ticketCount = tickets?.length ?? 0;
    const grossRevenue = (tickets ?? []).reduce(
      (sum, t) => sum + (Number(t.price_paid) || 0),
      0
    );

    // 3. Calculate refunds total
    const { data: refundedTickets, error: refundsError } = await admin
      .from("tickets")
      .select("price_paid")
      .eq("event_id", eventId)
      .eq("status", "refunded");

    if (refundsError) {
      return { error: `Refunds query failed: ${refundsError.message}` };
    }

    const refundsTotal = (refundedTickets ?? []).reduce(
      (sum, t) => sum + (Number(t.price_paid) || 0),
      0
    );

    // 4. Calculate artist fees
    const { data: eventArtists, error: artistsError } = await admin
      .from("event_artists")
      .select("fee")
      .eq("event_id", eventId)
      .eq("status", "confirmed");

    if (artistsError) {
      return { error: `Artists query failed: ${artistsError.message}` };
    }

    const artistFeesTotal = (eventArtists ?? []).reduce(
      (sum, a) => sum + (Number(a.fee) || 0),
      0
    );

    // 5. Fetch expenses
    const { data: expenses } = await admin
      .from("expenses")
      .select("amount")
      .eq("event_id", eventId);

    const totalExpenses = (expenses ?? []).reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0
    );

    // 6. Calculate fees (matching manual settlement formula)
    const stripeFees =
      grossRevenue > 0
        ? grossRevenue * 0.029 + 0.30 * ticketCount
        : 0;
    // Platform fee: buyer pays, organizer keeps 100%
    const platformFee = 0;

    // Nocturn revenue reporting (not deducted from organizer)
    const _nocturnRevenue = grossRevenue * (PLATFORM_FEE_PERCENT / 100) + (PLATFORM_FEE_FLAT_CENTS / 100) * ticketCount;

    // 7. Net revenue = gross - refunds - stripe fees - platform fee (matches manual settlement)
    const netRevenue = grossRevenue - refundsTotal - stripeFees - platformFee;
    const profit = netRevenue - artistFeesTotal - totalExpenses;

    // 8. Insert settlement record (matching manual settlement structure)
    const { data: settlement, error: settlementError } = await admin
      .from("settlements")
      .insert({
        event_id: eventId,
        collective_id: event.collective_id,
        gross_revenue: Math.round(grossRevenue * 100) / 100,
        refunds_total: Math.round(refundsTotal * 100) / 100,
        total_artist_fees: Math.round(artistFeesTotal * 100) / 100,
        total_costs: Math.round(totalExpenses * 100) / 100,
        platform_fee: Math.round(platformFee * 100) / 100,
        stripe_fees: Math.round(stripeFees * 100) / 100,
        net_revenue: Math.round(netRevenue * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        status: "draft",
      })
      .select("id")
      .maybeSingle();

    if (settlementError) {
      // Handle unique constraint violation (race — another process created it)
      if (settlementError.code === "23505") {
        return { error: null }; // Already exists, that's fine
      }
      return { error: `Settlement insert failed: ${settlementError.message}` };
    }

    if (!settlement) {
      return { error: "Settlement insert returned no data" };
    }

    // 9. Trigger CRM enrichment for attendees
    const crmResult = await enrichAttendeeCRM(eventId);
    if (crmResult.error) {
      console.error("CRM enrichment warning:", crmResult.error);
      // Non-fatal — settlement was still created
    }

    return { error: null, settlementId: settlement.id };
  } catch (err) {
    console.error("Auto-settlement error:", err);
    return {
      error: err instanceof Error ? err.message : "Unexpected settlement error.",
    };
  }
}
