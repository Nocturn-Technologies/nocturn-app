"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface FinancialPulseData {
  revenue: number;
  expenses: number;
  netPL: number;
  outstandingSettlements: number;
  recentEvents: Array<{ title: string; profit: number }>;
}

export async function getFinancialPulse(): Promise<FinancialPulseData> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
  }

  const admin = createAdminClient();

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  if (collectiveIds.length === 0) {
    return { revenue: 0, expenses: 0, netPL: 0, outstandingSettlements: 0, recentEvents: [] };
  }

  // Get this month's start date
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Get events this month
  const { data: events } = await admin
    .from("events")
    .select("id, title, starts_at")
    .in("collective_id", collectiveIds)
    .gte("starts_at", monthStart)
    .order("starts_at", { ascending: false })
    .limit(10);

  const eventIds = events?.map((e) => e.id) ?? [];

  // Get this month's ticket revenue
  let revenue = 0;
  if (eventIds.length > 0) {
    const { data: tickets } = await admin
      .from("tickets")
      .select("price_paid")
      .in("event_id", eventIds)
      .in("status", ["paid", "checked_in"]);

    revenue = (tickets ?? []).reduce(
      (sum, t) => sum + (Number(t.price_paid) || 0),
      0
    );
  }

  // Get this month's expenses from settlements
  let expenses = 0;
  const { data: settlements } = await admin
    .from("settlements")
    .select("total_expenses, total_artist_fees, stripe_fees, platform_fee, gross_revenue, profit, events(title)")
    .in("collective_id", collectiveIds)
    .gte("created_at", monthStart);

  if (settlements && settlements.length > 0) {
    expenses = settlements.reduce(
      (sum, s) =>
        sum +
        (Number(s.total_expenses) || 0) +
        (Number(s.total_artist_fees) || 0) +
        (Number(s.stripe_fees) || 0) +
        (Number(s.platform_fee) || 0),
      0
    );
  }

  // Calculate net P&L
  const netPL = revenue - expenses;

  // Count outstanding (unapproved) settlements
  const { count: outstandingCount } = await admin
    .from("settlements")
    .select("*", { count: "exact", head: true })
    .in("collective_id", collectiveIds)
    .eq("status", "draft");

  const outstandingSettlements = outstandingCount ?? 0;

  // Build recent events with profit
  const recentEvents: Array<{ title: string; profit: number }> = [];

  if (settlements && settlements.length > 0) {
    for (const s of settlements.slice(0, 5)) {
      const event = s.events as unknown as { title: string } | null;
      recentEvents.push({
        title: event?.title ?? "Unknown Event",
        profit: Number(s.profit) || 0,
      });
    }
  }

  // If not enough from settlements, pad with events (zero profit)
  if (recentEvents.length < 5 && events) {
    for (const e of events) {
      if (recentEvents.length >= 5) break;
      if (!recentEvents.some((r) => r.title === e.title)) {
        recentEvents.push({ title: e.title, profit: 0 });
      }
    }
  }

  return {
    revenue,
    expenses,
    netPL,
    outstandingSettlements,
    recentEvents,
  };
}
