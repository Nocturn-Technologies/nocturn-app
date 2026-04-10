"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export interface FinancialPulseData {
  revenue: number;
  expenses: number;
  netPL: number;
  outstandingSettlements: number;
  recentEvents: Array<{ title: string; profit: number }>;
}

export async function getFinancialPulse(): Promise<FinancialPulseData> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
    }

    const admin = createAdminClient();

    // Get user's collectives
    const { data: memberships, error: membershipsError } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (membershipsError) {
      console.error("[getFinancialPulse] memberships query error:", membershipsError.message);
      return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
    }

    const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

    if (collectiveIds.length === 0) {
      return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
    }

    // Get this month's start date
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Current events = this month + upcoming (for revenue/expense calc)
    const { data: currentEvents, error: currentEventsError } = await admin
      .from("events")
      .select("id, title, starts_at")
      .in("collective_id", collectiveIds)
      .gte("starts_at", monthStart)
      .order("starts_at", { ascending: true })
      .limit(20);

    if (currentEventsError) {
      console.error("[getFinancialPulse] current events query error:", currentEventsError.message);
    }

    const currentEventIds = currentEvents?.map((e) => e.id) ?? [];

    // Recent past events (for the trend chart)
    const { data: pastEvents, error: pastEventsError } = await admin
      .from("events")
      .select("id, title, starts_at")
      .in("collective_id", collectiveIds)
      .lt("starts_at", monthStart)
      .eq("status", "completed")
      .order("starts_at", { ascending: false })
      .limit(5);

    if (pastEventsError) {
      console.error("[getFinancialPulse] past events query error:", pastEventsError.message);
    }

    // Revenue for current events (this month + upcoming)
    let revenue = 0;
    if (currentEventIds.length > 0) {
      const { data: tickets, error: ticketsError } = await admin
        .from("tickets")
        .select("price_paid")
        .in("event_id", currentEventIds)
        .in("status", ["paid", "checked_in"]);

      if (ticketsError) {
        console.error("[getFinancialPulse] tickets query error:", ticketsError.message);
      }

      revenue = (tickets ?? []).reduce(
        (sum, t) => sum + (Number(t.price_paid) || 0),
        0
      );
    }

    // Expenses for current events (scoped by event, not settlement.created_at).
    // NOTE: `total_costs` is a generated column that already sums
    // artist_fees_total + venue_fee + platform_fee + stripe_fees + other_costs.
    // Do NOT add artist/stripe/platform on top of it — that would double-count.
    let expenses = 0;
    if (currentEventIds.length > 0) {
      const { data: currentSettlements, error: settlementsError } = await admin
        .from("settlements")
        .select("total_costs")
        .in("event_id", currentEventIds);

      if (settlementsError) {
        console.error("[getFinancialPulse] current settlements query error:", settlementsError.message);
      }

      expenses = (currentSettlements ?? []).reduce(
        (sum, s) => sum + (Number(s.total_costs) || 0),
        0
      );
    }

    // Calculate net P&L
    const netPL = revenue - expenses;

    // Count outstanding (unapproved) settlements
    const { count: outstandingCount, error: outstandingError } = await admin
      .from("settlements")
      .select("*", { count: "exact", head: true })
      .in("collective_id", collectiveIds)
      .eq("status", "draft");

    if (outstandingError) {
      console.error("[getFinancialPulse] outstanding settlements query error:", outstandingError.message);
    }

    const outstandingSettlements = outstandingCount ?? 0;

    // Build recent events trend chart from the last 5 completed events
    const recentEvents: Array<{ title: string; profit: number }> = [];
    const pastEventIds = (pastEvents ?? []).map((e) => e.id);

    if (pastEventIds.length > 0) {
      const { data: pastSettlements, error: pastSettlementsError } = await admin
        .from("settlements")
        .select("event_id, net_profit, profit")
        .in("event_id", pastEventIds);

      if (pastSettlementsError) {
        console.error("[getFinancialPulse] past settlements query error:", pastSettlementsError.message);
      }

      const profitByEvent = new Map<string, number>();
      for (const s of pastSettlements ?? []) {
        // Prefer net_profit (generated from source fields); fall back to manual `profit` column
        const p = Number(s.net_profit ?? s.profit) || 0;
        profitByEvent.set(s.event_id, p);
      }

      for (const e of pastEvents ?? []) {
        recentEvents.push({
          title: e.title,
          profit: profitByEvent.get(e.id) ?? 0,
        });
        if (recentEvents.length >= 5) break;
      }
    }

    // Fallback: if no past events, show current events so the card isn't empty
    if (recentEvents.length === 0 && currentEvents) {
      for (const e of currentEvents.slice(0, 5)) {
        recentEvents.push({ title: e.title, profit: 0 });
      }
    }

    return {
      revenue,
      expenses,
      netPL,
      outstandingSettlements,
      recentEvents,
    };
  } catch (err) {
    console.error("[getFinancialPulse]", err);
    return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
  }
}
