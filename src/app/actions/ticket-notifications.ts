"use server";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface TicketSaleNotification {
  id: string;
  eventTitle: string;
  tierName: string;
  quantity: number;
  revenue: number;
  buyerEmail: string;
  soldAt: string;
  // Running totals
  totalSold: number;
  totalCapacity: number;
  totalRevenue: number;
  sellThrough: number;
}

// Get recent ticket sales for a collective (last 24h)
export async function getRecentSales(collectiveId: string, limit = 10): Promise<TicketSaleNotification[]> {
  const sb = admin();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get collective's events
  const { data: events } = await sb
    .from("events")
    .select("id, title")
    .eq("collective_id", collectiveId)
    .in("status", ["published", "upcoming"]);

  if (!events || events.length === 0) return [];

  const eventIds = events.map((e) => e.id);
  const eventMap = Object.fromEntries(events.map((e) => [e.id, e.title]));

  // Get recent tickets
  const { data: tickets } = await sb
    .from("tickets")
    .select("id, event_id, ticket_tier_id, price_paid, status, created_at, metadata, ticket_tiers(name, capacity)")
    .in("event_id", eventIds)
    .in("status", ["paid", "checked_in"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!tickets || tickets.length === 0) return [];

  // Get running totals per event
  const totals: Record<string, { sold: number; capacity: number; revenue: number }> = {};
  for (const eid of eventIds) {
    const { count } = await sb
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eid)
      .in("status", ["paid", "checked_in"]);

    const { data: tiers } = await sb
      .from("ticket_tiers")
      .select("capacity")
      .eq("event_id", eid);

    const { data: revData } = await sb
      .from("tickets")
      .select("price_paid")
      .eq("event_id", eid)
      .in("status", ["paid", "checked_in"]);

    const cap = (tiers || []).reduce((s, t) => s + (t.capacity || 0), 0);
    const rev = (revData || []).reduce((s, t) => s + Number(t.price_paid || 0), 0);

    totals[eid] = { sold: count ?? 0, capacity: cap, revenue: rev };
  }

  return tickets.map((t) => {
    const tier = t.ticket_tiers as unknown as { name: string; capacity: number } | null;
    const eventTotals = totals[t.event_id] || { sold: 0, capacity: 0, revenue: 0 };
    const meta = (t.metadata || {}) as Record<string, string>;

    return {
      id: t.id,
      eventTitle: eventMap[t.event_id] || "Event",
      tierName: tier?.name || "General Admission",
      quantity: 1,
      revenue: Number(t.price_paid || 0),
      buyerEmail: meta.customer_email || "",
      soldAt: t.created_at,
      totalSold: eventTotals.sold,
      totalCapacity: eventTotals.capacity,
      totalRevenue: eventTotals.revenue,
      sellThrough: eventTotals.capacity > 0
        ? Math.round((eventTotals.sold / eventTotals.capacity) * 100)
        : 0,
    };
  });
}

// Get live ticket stats for dashboard (lightweight)
export async function getLiveTicketStats(collectiveId: string) {
  const sb = admin();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

  // Get collective's active events
  const { data: events } = await sb
    .from("events")
    .select("id")
    .eq("collective_id", collectiveId)
    .in("status", ["published", "upcoming"]);

  if (!events || events.length === 0) {
    return { todaySales: 0, todayRevenue: 0, yesterdaySales: 0, trend: 0 };
  }

  const eventIds = events.map((e) => e.id);

  // Today's sales
  const { data: todayTickets } = await sb
    .from("tickets")
    .select("price_paid")
    .in("event_id", eventIds)
    .in("status", ["paid", "checked_in"])
    .gte("created_at", todayStart);

  // Yesterday's sales
  const { data: yesterdayTickets } = await sb
    .from("tickets")
    .select("price_paid")
    .in("event_id", eventIds)
    .in("status", ["paid", "checked_in"])
    .gte("created_at", yesterdayStart)
    .lt("created_at", todayStart);

  const todaySales = todayTickets?.length ?? 0;
  const todayRevenue = (todayTickets || []).reduce((s, t) => s + Number(t.price_paid || 0), 0);
  const yesterdaySales = yesterdayTickets?.length ?? 0;

  // Trend: % change from yesterday
  const trend = yesterdaySales > 0
    ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
    : todaySales > 0 ? 100 : 0;

  return { todaySales, todayRevenue, yesterdaySales, trend };
}
