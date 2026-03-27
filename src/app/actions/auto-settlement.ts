"use server";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { enrichAttendeeCRM } from "./crm-enrichment";

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const STRIPE_RATE = 0.029; // 2.9%
const STRIPE_FIXED = 0.3; // $0.30 per ticket
// Platform fee: 7% + $0.50 per ticket — paid by BUYER, not deducted from organizer
const PLATFORM_RATE = 0; // Organizer keeps 100% of ticket revenue

export async function generateAutoSettlement(eventId: string) {
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

    // 5. Calculate fees
    const stripeFees =
      grossRevenue > 0
        ? grossRevenue * STRIPE_RATE + STRIPE_FIXED * ticketCount
        : 0;
    const platformFee = grossRevenue * PLATFORM_RATE;

    // 6. Net revenue
    const netRevenue =
      grossRevenue -
      refundsTotal -
      artistFeesTotal -
      stripeFees -
      platformFee;

    // 7. Insert settlement record
    const { data: settlement, error: settlementError } = await admin
      .from("settlements")
      .insert({
        event_id: eventId,
        collective_id: event.collective_id,
        gross_revenue: Math.round(grossRevenue * 100) / 100,
        refunds_total: Math.round(refundsTotal * 100) / 100,
        artist_fees_total: Math.round(artistFeesTotal * 100) / 100,
        venue_fee: 0, // No venue fee data source specified — default to 0
        platform_fee: Math.round(platformFee * 100) / 100,
        stripe_fees: Math.round(stripeFees * 100) / 100,
        net_revenue: Math.round(netRevenue * 100) / 100,
        status: "draft",
      })
      .select("id")
      .single();

    if (settlementError) {
      // Handle unique constraint violation (race — another process created it)
      if (settlementError.code === "23505") {
        return { error: null }; // Already exists, that's fine
      }
      return { error: `Settlement insert failed: ${settlementError.message}` };
    }

    // 8. Trigger CRM enrichment for attendees
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
