"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { convertBetween } from "@/lib/currency";

import { enrichAttendeeCRM } from "./crm-enrichment";

export async function generateAutoSettlement(eventId: string) {
  try {
  if (!eventId?.trim()) return { error: "Event ID is required" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
    // 1. Get event + collective_id + financial columns. The bar-minimum
    // shortfall and venue-cost/deposit columns are part of profit math per
    // the finance UI — must be fetched here so the settlement record
    // matches what getEventFinancials shows. currency + collective's
    // default_currency let us normalize cross-currency operator inputs.
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id, collective_id, status, venue_cost, venue_deposit, bar_minimum, actual_bar_revenue, currency, collectives(default_currency)")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      if (eventError) console.error("[generateAutoSettlement] event query error:", eventError.message);
      return { error: "Event not found" };
    }

    const eventCurrency = (
      event.currency ||
      (event.collectives as unknown as { default_currency: string | null } | null)
        ?.default_currency ||
      "usd"
    ).toLowerCase();

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
      console.error("[generateAutoSettlement] tickets query error:", ticketsError.message);
      return { error: "Failed to calculate ticket revenue" };
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
      console.error("[generateAutoSettlement] refunds query error:", refundsError.message);
      return { error: "Failed to calculate refunds" };
    }

    const refundsTotal = (refundedTickets ?? []).reduce(
      (sum, t) => sum + (Number(t.price_paid) || 0),
      0
    );

    // 4. Calculate artist fees, normalized to the event currency. An
    // artist paid in USD for a CAD event (fee_currency = "usd",
    // eventCurrency = "cad") is converted at the current ECB cross-rate
    // via convertBetween. Fees in the same currency as the event (or with
    // null fee_currency) pass through unchanged.
    const { data: eventArtists, error: artistsError } = await admin
      .from("event_artists")
      .select("fee, fee_currency")
      .eq("event_id", eventId)
      .eq("status", "confirmed");

    if (artistsError) {
      console.error("[generateAutoSettlement] artists query error:", artistsError.message);
      return { error: "Failed to calculate artist fees" };
    }

    const artistFeeConversions = await Promise.all(
      (eventArtists ?? []).map(async (a) => {
        const raw = Number(a.fee) || 0;
        const from = (a.fee_currency || eventCurrency).toLowerCase();
        if (raw === 0 || from === eventCurrency) return raw;
        const { amount } = await convertBetween(raw, from, eventCurrency);
        return amount;
      })
    );
    const artistFeesTotal = artistFeeConversions.reduce((sum, v) => sum + v, 0);

    // 5. Fetch expenses, filtering out categories that are accounted for
    //    elsewhere to prevent double-count:
    //    - venue_rental + deposit → authoritative in events.venue_cost /
    //      events.venue_deposit columns (subtracted separately below).
    //    - talent + flights + hotel + transport + per_diem → headliner-
    //      related, accounted for via `event_artists.fee` (subtracted as
    //      artistFeesTotal). Wizard-added rows for these would otherwise
    //      double-count against the lineup fee.
    const { data: expenses, error: expensesError } = await admin
      .from("expenses")
      .select("amount, category, currency")
      .eq("event_id", eventId);

    if (expensesError) {
      console.error("[generateAutoSettlement] expenses query error:", expensesError.message);
      return { error: "Failed to calculate expenses" };
    }

    const HEADLINER_CATEGORIES = new Set(["talent", "flights", "hotel", "transport", "per_diem"]);
    const VENUE_CATEGORIES = new Set(["venue_rental", "deposit"]);

    // Normalize every expense to the event currency BEFORE the pair-wise
    // matching below, so double-count prevention compares like-for-like.
    // expenses.currency was added in the add_currency_to_expenses
    // migration; rows created before that default to the event's currency
    // via the backfill, so this is safe on historical data.
    const normalizedExpenses = await Promise.all(
      (expenses ?? []).map(async (e) => {
        const raw = Number(e.amount) || 0;
        const from = (e.currency || eventCurrency).toLowerCase();
        if (raw === 0 || from === eventCurrency) return { ...e, amount: raw };
        const { amount } = await convertBetween(raw, from, eventCurrency);
        return { ...e, amount };
      })
    );

    // Pair-wise talent double-count prevention.
    //
    // A single event can legitimately have BOTH:
    //   (a) `event_artists.fee` — structured per-artist records
    //   (b) `expenses` with headliner categories — wizard-entered
    // The previous blanket filter ("drop all headliner expenses when any
    // event_artists.fee > 0") silently dropped unrelated talent expenses.
    // Example: artist A booked via lineup at $50, artist B tracked only as
    // a wizard expense at $500 → old filter dropped B's $500 entirely,
    // overstating profit.
    //
    // New approach: for each headliner-category expense, try to match it
    // against an event_artists.fee row of the same amount. Matched → skip
    // (avoid double-count). Unmatched → include (real separate cost).
    // Cents-based to avoid FP drift on the pairing key.
    // Match against normalized (event-currency) fees so the dedup works
    // even when artist fees are entered in a different currency.
    const availableArtistFeeCents = artistFeeConversions
      .map((v) => Math.round(v * 100))
      .filter((c) => c > 0);
    let totalExpenses = 0;
    for (const e of normalizedExpenses) {
      const category = e.category ?? "";
      const amount = e.amount; // already in event currency
      if (VENUE_CATEGORIES.has(category)) continue;
      if (HEADLINER_CATEGORIES.has(category)) {
        const cents = Math.round(amount * 100);
        const matchIdx = availableArtistFeeCents.indexOf(cents);
        if (matchIdx >= 0) {
          // Consume the matched artist-fee slot so multiple equal-fee
          // artists don't all match the same expense row.
          availableArtistFeeCents.splice(matchIdx, 1);
          continue;
        }
      }
      totalExpenses += amount;
    }

    // Event-column venue costs (authoritative source for those values).
    const venueCostNum = event.venue_cost ? Number(event.venue_cost) : 0;
    const venueDepositNum = event.venue_deposit ? Number(event.venue_deposit) : 0;

    // Bar-minimum shortfall: actual deficit the operator eats if bar sales
    // fall below the venue's contracted minimum. Matches getEventFinancials.
    const barMin = event.bar_minimum ? Number(event.bar_minimum) : 0;
    const actualBar = event.actual_bar_revenue != null ? Number(event.actual_bar_revenue) : null;
    const barShortfall =
      barMin > 0 && actualBar != null && actualBar < barMin
        ? Math.round((barMin - actualBar) * 100) / 100
        : 0;

    // 6. Nocturn is merchant of record — buyer pays the 7%+$0.50 service
    // fee on top, and Nocturn absorbs Stripe (2.9% + $0.30). Neither is
    // deducted from the organizer's net. Keeping the columns in the
    // settlement record for historical reporting / Nocturn revenue view.
    const platformFee = 0;
    // Informational only: what Stripe actually took, for Nocturn's P&L.
    // NOT subtracted from netRevenue (was the old bug).
    const stripeFees =
      grossRevenue > 0
        ? grossRevenue * 0.029 + 0.30 * ticketCount
        : 0;

    // 7. Net revenue and profit — match getEventFinancials exactly.
    // `grossRevenue` above already excluded refunded tickets (we queried
    // only paid + checked_in), so there's no additional refunds subtraction
    // on the organizer's net. `refundsTotal` is still written to the
    // settlement record for historical reporting but does NOT flow into
    // netRevenue — otherwise we'd double-count the refunds removal.
    // Previously the settlement's gross_revenue disagreed with the finance
    // page by exactly refundsTotal; now both show the same number.
    const netRevenue = grossRevenue;
    const profit =
      netRevenue - artistFeesTotal - totalExpenses - venueCostNum - venueDepositNum - barShortfall;

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
      console.error("[generateAutoSettlement] settlement insert error:", settlementError.message);
      return { error: "Failed to create settlement" };
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
    return { error: "Something went wrong" };
  }
}
