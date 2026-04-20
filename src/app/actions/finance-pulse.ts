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

    // Revenue for current events — sum orders.total where status='paid'
    let revenue = 0;
    if (currentEventIds.length > 0) {
      const { data: orders, error: ordersError } = await admin
        .from("orders")
        .select("total")
        .in("event_id", currentEventIds)
        .eq("status", "paid");

      if (ordersError) {
        console.error("[getFinancialPulse] orders query error:", ordersError.message);
      }

      revenue = (orders ?? []).reduce(
        (sum, o) => sum + (Number(o.total) || 0),
        0
      );
    }

    // Expenses for current events — sum event_expenses.amount
    let expenses = 0;
    if (currentEventIds.length > 0) {
      const { data: currentExpenses, error: expensesError } = await admin
        .from("event_expenses")
        .select("amount")
        .in("event_id", currentEventIds);

      if (expensesError) {
        console.error("[getFinancialPulse] current expenses query error:", expensesError.message);
      }

      expenses = (currentExpenses ?? []).reduce(
        (sum, e) => sum + (Number(e.amount) || 0),
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
    // settlements.net_payout = revenue after platform_fee + stripe_fee deducted
    const recentEvents: Array<{ title: string; profit: number }> = [];
    const pastEventIds = (pastEvents ?? []).map((e) => e.id);

    if (pastEventIds.length > 0) {
      const { data: pastSettlements, error: pastSettlementsError } = await admin
        .from("settlements")
        .select("event_id, net_payout")
        .in("event_id", pastEventIds);

      if (pastSettlementsError) {
        console.error("[getFinancialPulse] past settlements query error:", pastSettlementsError.message);
      }

      const payoutByEvent = new Map<string, number>();
      for (const s of pastSettlements ?? []) {
        const p = Number(s.net_payout) || 0;
        payoutByEvent.set(s.event_id, p);
      }

      for (const e of pastEvents ?? []) {
        recentEvents.push({
          title: e.title,
          profit: payoutByEvent.get(e.id) ?? 0,
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
