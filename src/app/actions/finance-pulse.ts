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

// Accept collectiveIds as optional param so callers (like /dashboard) that already
// have the user's memberships can skip the redundant auth + membership queries
// (~200ms round-trip saved on cold path).
export async function getFinancialPulse(preFetchedCollectiveIds?: string[]): Promise<FinancialPulseData> {
  try {
    const admin = createAdminClient();

    // Resolve collectiveIds — fast path if caller passed them, slow path otherwise
    let collectiveIds: string[];
    if (preFetchedCollectiveIds) {
      collectiveIds = preFetchedCollectiveIds;
    } else {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
      }
      const { data: memberships, error: membershipsError } = await admin
        .from("collective_members")
        .select("collective_id")
        .eq("user_id", user.id)
        .is("deleted_at", null);
      if (membershipsError) {
        console.error("[getFinancialPulse] memberships query error:", membershipsError.message);
        return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
      }
      collectiveIds = memberships?.map((m) => m.collective_id) ?? [];
    }

    if (collectiveIds.length === 0) {
      return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Wave 1: all collective-scoped queries run in parallel (no dependency on event IDs yet)
    const [currentEventsRes, pastEventsRes, outstandingRes] = await Promise.all([
      admin
        .from("events")
        .select("id, title, starts_at")
        .in("collective_id", collectiveIds)
        .gte("starts_at", monthStart)
        .order("starts_at", { ascending: true })
        .limit(20),
      admin
        .from("events")
        .select("id, title, starts_at")
        .in("collective_id", collectiveIds)
        .lt("starts_at", monthStart)
        .eq("status", "completed")
        .order("starts_at", { ascending: false })
        .limit(5),
      admin
        .from("settlements")
        .select("*", { count: "exact", head: true })
        .in("collective_id", collectiveIds)
        .eq("status", "draft"),
    ]);

    if (currentEventsRes.error) console.error("[getFinancialPulse] current events error:", currentEventsRes.error.message);
    if (pastEventsRes.error) console.error("[getFinancialPulse] past events error:", pastEventsRes.error.message);
    if (outstandingRes.error) console.error("[getFinancialPulse] outstanding error:", outstandingRes.error.message);

    const currentEvents = currentEventsRes.data ?? [];
    const pastEvents = pastEventsRes.data ?? [];
    const outstandingSettlements = outstandingRes.count ?? 0;

    const currentEventIds = currentEvents.map((e) => e.id);
    const pastEventIds = pastEvents.map((e) => e.id);

    // Wave 2: all event-scoped aggregations run in parallel
    const [ticketsRes, currentSettlementsRes, pastSettlementsRes] = await Promise.all([
      currentEventIds.length > 0
        ? admin.from("tickets").select("price_paid").in("event_id", currentEventIds).in("status", ["paid", "checked_in"])
        : Promise.resolve({ data: [], error: null } as { data: { price_paid: number }[]; error: null }),
      currentEventIds.length > 0
        ? admin.from("settlements").select("total_costs").in("event_id", currentEventIds)
        : Promise.resolve({ data: [], error: null } as { data: { total_costs: number | null }[]; error: null }),
      pastEventIds.length > 0
        ? admin.from("settlements").select("event_id, net_profit").in("event_id", pastEventIds)
        : Promise.resolve({ data: [], error: null } as { data: { event_id: string; net_profit: number | null }[]; error: null }),
    ]);

    const tickets = ticketsRes.data ?? [];
    const currentSettlements = currentSettlementsRes.data ?? [];
    const pastSettlements = pastSettlementsRes.data ?? [];

    const revenue = tickets.reduce((sum, t) => sum + (Number(t.price_paid) || 0), 0);

    // total_costs is a GENERATED column that already sums
    // artist_fees_total + venue_fee + platform_fee + stripe_fees + other_costs.
    const expenses = currentSettlements.reduce((sum, s) => sum + (Number(s.total_costs) || 0), 0);
    const netPL = revenue - expenses;

    // Build recent-events trend chart from past settlements (net_profit is a GENERATED column)
    const profitByEvent = new Map<string, number>();
    for (const s of pastSettlements) {
      profitByEvent.set(s.event_id, Number(s.net_profit) || 0);
    }

    const recentEvents: Array<{ title: string; profit: number }> = [];
    for (const e of pastEvents) {
      recentEvents.push({ title: e.title, profit: profitByEvent.get(e.id) ?? 0 });
      if (recentEvents.length >= 5) break;
    }
    if (recentEvents.length === 0) {
      for (const e of currentEvents.slice(0, 5)) {
        recentEvents.push({ title: e.title, profit: 0 });
      }
    }

    return { revenue, expenses, netPL, outstandingSettlements, recentEvents };
  } catch (err) {
    console.error("[getFinancialPulse]", err);
    return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
  }
}
