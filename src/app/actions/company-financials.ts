"use server";

import { cache } from "react";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export type CompanyFinancials = {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalTicketsSold: number;
  avgRevenuePerEvent: number;
  totalEvents: number;
  profitMargin: number;
};

export type EventFinancialSummary = {
  id: string;
  eventId: string;
  title: string;
  date: string;
  ticketsSold: number;
  grossRevenue: number;
  totalExpenses: number;
  netRevenue: number;
  profit: number;
  status: string;
  eventStatus: string;
  margin: number;
};

export type RevenueForecastItem = {
  id: string;
  title: string;
  startsAt: string;
  publishedAt: string | null;
  status: string;
  ticketsSold: number;
  totalCapacity: number;
  currentRevenue: number;
  projectedRevenue: number;
  avgTicketPrice: number;
  daysUntilEvent: number;
  daysSincePublish: number;
  dailySalesVelocity: number;
  projectedTickets: number;
  capacityUtilization: number;
  projectedUtilization: number;
  artistCosts: number;
  projectedProfit: number;
};

// Wrapped in `React.cache()` so multiple calls on the Finance page
// share a single auth.getUser() + membership lookup per render.
const getCollectiveIds = cache(async () => {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, collectiveIds: [] as string[] };

    const admin = createAdminClient();
    const { data: memberships, error } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (error) {
      console.error("[getCollectiveIds] query error:", error.message);
      return { user, collectiveIds: [] as string[] };
    }

    const collectiveIds =
      (memberships as { collective_id: string }[] | null)?.map(
        (m) => m.collective_id
      ) ?? [];

    return { user, collectiveIds };
  } catch (err) {
    console.error("[getCollectiveIds] Unexpected error:", err);
    return { user: null, collectiveIds: [] as string[] };
  }
});

export async function getCompanyFinancials(): Promise<{
  error: string | null;
  data: CompanyFinancials | null;
}> {
  try {
    const { user, collectiveIds } = await getCollectiveIds();
    if (!user) return { error: "Not authenticated", data: null };
    if (collectiveIds.length === 0)
      return {
        error: null,
        data: {
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          totalTicketsSold: 0,
          avgRevenuePerEvent: 0,
          totalEvents: 0,
          profitMargin: 0,
        },
      };

    const admin = createAdminClient();

    // New settlements schema: total_revenue, platform_fee, stripe_fee, net_payout
    // (no gross_revenue, net_revenue, net_profit, stripe_fees, artist_fees_total, total_costs)
    const { data: settlements, error: settlementsError } = await admin
      .from("settlements")
      .select("event_id, total_revenue, platform_fee, stripe_fee, net_payout")
      .in("collective_id", collectiveIds);

    if (settlementsError) {
      console.error("[getCompanyFinancials] settlements query error:", settlementsError.message);
      return { error: "Something went wrong", data: null };
    }

    // Count all events (settled and unsettled) for overview metrics
    const { data: allEvents } = await admin
      .from("events")
      .select("id")
      .in("collective_id", collectiveIds)
      .in("status", ["completed", "published"])
      .is("deleted_at", null);

    const settledEventIds = (settlements ?? []).map((s) => s.event_id);

    // Count tickets sold via orders (source of truth in new schema)
    // tickets table no longer has price_paid — use orders.total for revenue
    let totalTicketsSold = 0;

    const allEventIds = (allEvents ?? []).map((e) => e.id);
    if (allEventIds.length > 0) {
      // ticket_tiers.tickets_sold is a denormalized counter kept in sync by the DB
      const { data: tiers } = await admin
        .from("ticket_tiers")
        .select("tickets_sold")
        .in("event_id", allEventIds);
      totalTicketsSold = (tiers ?? []).reduce(
        (sum, t) => sum + (t.tickets_sold ?? 0),
        0
      );
    }

    // Revenue from finalized settlements (total_revenue = sum of order totals for the event)
    const totalRevenue = (settlements ?? []).reduce(
      (sum, s) => sum + Number(s.total_revenue),
      0
    );

    // Costs visible on settlements: stripe + platform fees (buyer-paid but recorded)
    // plus we'll add event_expenses for a more complete picture
    const settlementFees = (settlements ?? []).reduce(
      (sum, s) => sum + Number(s.stripe_fee) + Number(s.platform_fee),
      0
    );

    // Fetch event_expenses for all settled events for the totalExpenses field
    let totalEventExpenses = 0;
    if (settledEventIds.length > 0) {
      const { data: expenses } = await admin
        .from("event_expenses")
        .select("amount")
        .in("event_id", settledEventIds);
      totalEventExpenses = (expenses ?? []).reduce(
        (sum, e) => sum + Number(e.amount),
        0
      );
    }

    const totalExpenses = settlementFees + totalEventExpenses;

    // Net profit = sum of settlements' net_payout (revenue minus expenses as computed at settlement time)
    const netProfit = (settlements ?? []).reduce(
      (sum, s) => sum + Number(s.net_payout),
      0
    );

    const totalEvents = (allEvents ?? []).length;

    return {
      error: null,
      data: {
        totalRevenue,
        totalExpenses,
        netProfit,
        totalTicketsSold,
        avgRevenuePerEvent: totalEvents > 0 ? totalRevenue / totalEvents : 0,
        totalEvents,
        profitMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
      },
    };
  } catch (err) {
    console.error("[getCompanyFinancials]", err);
    return { error: "Something went wrong", data: null };
  }
}

export async function getEventFinancialSummaries(): Promise<{
  error: string | null;
  data: EventFinancialSummary[];
}> {
  try {
    const { user, collectiveIds } = await getCollectiveIds();
    if (!user) return { error: "Not authenticated", data: [] };
    if (collectiveIds.length === 0) return { error: null, data: [] };

    const admin = createAdminClient();

    // Get all events with settlements. New settlements schema fields used.
    const [{ data: settlements }, { data: allEvents }] = await Promise.all([
      admin
        .from("settlements")
        .select(
          "id, event_id, status, total_revenue, platform_fee, stripe_fee, net_payout, events(title, starts_at, status)"
        )
        .in("collective_id", collectiveIds)
        .order("created_at", { ascending: false }),
      admin
        .from("events")
        .select("id, title, starts_at, status")
        .in("collective_id", collectiveIds)
        .in("status", ["published", "completed", "draft"])
        .is("deleted_at", null)
        .order("starts_at", { ascending: false }),
    ]);

    const settledEventIds = (settlements ?? []).map((s) => s.event_id);

    const eventIds = [
      ...new Set([
        ...settledEventIds,
        ...(allEvents ?? []).map((e) => e.id),
      ]),
    ];

    // Revenue from orders (source of truth) and ticket counts from ticket_tiers
    let orderRevenue: Record<string, number> = {};
    let ticketCounts: Record<string, number> = {};

    if (eventIds.length > 0) {
      // Fetch paid orders for revenue
      const { data: orders } = await admin
        .from("orders")
        .select("event_id, total")
        .in("event_id", eventIds)
        .eq("status", "paid");

      (orders ?? []).forEach((o) => {
        orderRevenue[o.event_id] = (orderRevenue[o.event_id] ?? 0) + Number(o.total || 0);
      });

      // Ticket counts from ticket_tiers denormalized counter
      const { data: tiers } = await admin
        .from("ticket_tiers")
        .select("event_id, tickets_sold")
        .in("event_id", eventIds);

      (tiers ?? []).forEach((t) => {
        ticketCounts[t.event_id] = (ticketCounts[t.event_id] ?? 0) + (t.tickets_sold ?? 0);
      });
    }

    const results: EventFinancialSummary[] = [];

    // Add settled events
    (settlements ?? []).forEach((s) => {
      const event = s.events as unknown as {
        title: string;
        starts_at: string;
        status: string;
      } | null;

      const gross = Number(s.total_revenue);
      // totalExpenses = stripe + platform fees (buyer-paid, included for completeness)
      const totalExp = Number(s.stripe_fee) + Number(s.platform_fee);
      const profit = Number(s.net_payout);

      results.push({
        id: s.id,
        eventId: s.event_id,
        title: event?.title ?? "Unknown Event",
        date: event?.starts_at ?? "",
        ticketsSold: ticketCounts[s.event_id] ?? 0,
        grossRevenue: gross,
        totalExpenses: totalExp,
        netRevenue: gross,
        profit,
        status: s.status,
        eventStatus: event?.status ?? "unknown",
        margin: gross > 0 ? (profit / gross) * 100 : 0,
      });
    });

    // Add unsettled events — show estimated revenue from paid orders
    (allEvents ?? [])
      .filter((e) => !settledEventIds.includes(e.id))
      .forEach((e) => {
        const sold = ticketCounts[e.id] ?? 0;
        const gross = orderRevenue[e.id] ?? 0;
        results.push({
          id: e.id,
          eventId: e.id,
          title: e.title,
          date: e.starts_at,
          ticketsSold: sold,
          grossRevenue: Math.round(gross * 100) / 100,
          totalExpenses: 0,
          netRevenue: Math.round(gross * 100) / 100,
          profit: 0,
          status: "unsettled",
          eventStatus: e.status,
          margin: 0,
        });
      });

    // Sort by date descending
    results.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return { error: null, data: results };
  } catch (err) {
    console.error("[getEventFinancialSummaries]", err);
    return { error: "Something went wrong", data: [] };
  }
}

export async function getRevenueForecast(): Promise<{
  error: string | null;
  data: RevenueForecastItem[];
}> {
  try {
    const { user, collectiveIds } = await getCollectiveIds();
    if (!user) return { error: "Not authenticated", data: [] };
    if (collectiveIds.length === 0) return { error: null, data: [] };

    const admin = createAdminClient();
    const now = new Date();

  // Get upcoming published events (include events starting today)
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const { data: upcomingEvents } = await admin
    .from("events")
    .select("id, title, starts_at, status, created_at")
    .in("collective_id", collectiveIds)
    .in("status", ["published"])
    .gte("starts_at", todayStart.toISOString())
    .is("deleted_at", null)
    .order("starts_at", { ascending: true });

  if (!upcomingEvents || upcomingEvents.length === 0) {
    return { error: null, data: [] };
  }

  const eventIds = upcomingEvents.map((e) => e.id);

  // Fetch tiers, paid orders, and artist fees in parallel.
  // Revenue comes from orders, not tickets (no price_paid column in new schema).
  const [{ data: tiers }, { data: orders }, { data: artists }] =
    await Promise.all([
      admin
        .from("ticket_tiers")
        .select("id, event_id, price, capacity, tickets_sold")
        .in("event_id", eventIds),
      admin
        .from("orders")
        .select("event_id, total, subtotal")
        .in("event_id", eventIds)
        .eq("status", "paid"),
      admin
        .from("event_artists")
        .select("event_id, fee")
        .in("event_id", eventIds),
    ]);

  const results: RevenueForecastItem[] = upcomingEvents.map((event) => {
    const eventTiers = (tiers ?? []).filter((t) => t.event_id === event.id);
    const eventOrders = (orders ?? []).filter((o) => o.event_id === event.id);
    const eventArtists = (artists ?? []).filter((a) => a.event_id === event.id);

    // tickets_sold is the denormalized count on ticket_tiers
    const ticketsSold = eventTiers.reduce((s, t) => s + (t.tickets_sold ?? 0), 0);
    const totalCapacity = eventTiers.reduce((s, t) => s + (t.capacity ?? 0), 0);

    // Current revenue from paid orders (subtotal = face value before buyer fees)
    const currentRevenue = eventOrders.reduce(
      (s, o) => s + Number(o.subtotal || 0),
      0
    );

    const avgTicketPrice =
      ticketsSold > 0
        ? currentRevenue / ticketsSold
        : eventTiers.length > 0
          ? eventTiers.reduce((s, t) => s + Number(t.price), 0) / eventTiers.length
          : 0;

    const artistCosts = eventArtists.reduce((s, a) => s + Number(a.fee || 0), 0);

    const eventDate = new Date(event.starts_at);
    const publishDate = new Date(event.created_at);
    const daysUntilEvent = Math.max(
      1,
      Math.ceil(
        (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    const daysSincePublish = Math.max(
      1,
      Math.ceil(
        (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    // Velocity-based projection
    const dailySalesVelocity = ticketsSold / daysSincePublish;
    const projectedAdditionalTickets = Math.round(
      dailySalesVelocity * daysUntilEvent
    );
    const projectedTickets = totalCapacity > 0
      ? Math.min(totalCapacity, ticketsSold + projectedAdditionalTickets)
      : ticketsSold + projectedAdditionalTickets;
    const projectedRevenue = projectedTickets * avgTicketPrice;

    // Projected profit: revenue - estimated stripe fees - artist costs
    const additionalTickets = projectedTickets - ticketsSold;
    const avgTicketsPerCheckout = 1.5;
    const existingCheckouts = Math.ceil(ticketsSold / avgTicketsPerCheckout);
    const existingStripeFees = currentRevenue > 0 ? currentRevenue * 0.029 + 0.3 * existingCheckouts : 0;
    const additionalCheckouts = Math.ceil(additionalTickets / avgTicketsPerCheckout);
    const additionalStripeFees = additionalTickets > 0 ? (projectedRevenue - currentRevenue) * 0.029 + 0.3 * additionalCheckouts : 0;
    const projectedStripe = existingStripeFees + additionalStripeFees;
    const projectedProfit = projectedRevenue - projectedStripe - artistCosts;

    return {
      id: event.id,
      title: event.title,
      startsAt: event.starts_at,
      publishedAt: event.created_at,
      status: event.status,
      ticketsSold,
      totalCapacity,
      currentRevenue,
      projectedRevenue,
      avgTicketPrice,
      daysUntilEvent,
      daysSincePublish,
      dailySalesVelocity,
      projectedTickets,
      capacityUtilization:
        totalCapacity > 0 ? (ticketsSold / totalCapacity) * 100 : 0,
      projectedUtilization:
        totalCapacity > 0 ? (projectedTickets / totalCapacity) * 100 : 0,
      artistCosts,
      projectedProfit,
    };
  });

    return { error: null, data: results };
  } catch (err) {
    console.error("[getRevenueForecast]", err);
    return { error: "Something went wrong", data: [] };
  }
}
