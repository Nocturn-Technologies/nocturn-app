"use server";

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

async function getCollectiveIds() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, collectiveIds: [] };

    const admin = createAdminClient();
    const { data: memberships, error } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (error) {
      console.error("[getCollectiveIds] query error:", error.message);
      return { user, collectiveIds: [] };
    }

    const collectiveIds =
      (memberships as { collective_id: string }[] | null)?.map(
        (m) => m.collective_id
      ) ?? [];

    return { user, collectiveIds };
  } catch (err) {
    console.error("[getCollectiveIds] Unexpected error:", err);
    return { user: null, collectiveIds: [] };
  }
}

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

    // Get all settlements for aggregates
    const { data: settlements, error: settlementsError } = await admin
      .from("settlements")
      .select(
        "gross_revenue, net_revenue, profit, platform_fee, stripe_fees, total_artist_fees, total_costs, event_id"
      )
      .in("collective_id", collectiveIds);

    if (settlementsError) {
      console.error("[getCompanyFinancials] settlements query error:", settlementsError.message);
      return { error: "Something went wrong", data: null };
    }

    // Get ticket counts for settled events
    const settledEventIds = (settlements ?? []).map((s) => s.event_id);
    let totalTicketsSold = 0;

    if (settledEventIds.length > 0) {
      const { count } = await admin
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .in("event_id", settledEventIds)
        .in("status", ["paid", "checked_in"]);
      totalTicketsSold = count ?? 0;
    }

    // Also count tickets for unsettled completed events
    const { data: allEvents } = await admin
      .from("events")
      .select("id")
      .in("collective_id", collectiveIds)
      .in("status", ["completed", "published"])
      .is("deleted_at", null);

    const unsettledIds = (allEvents ?? [])
      .map((e) => e.id)
      .filter((id) => !settledEventIds.includes(id));

    if (unsettledIds.length > 0) {
      const { count } = await admin
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .in("event_id", unsettledIds)
        .in("status", ["paid", "checked_in"]);
      totalTicketsSold += count ?? 0;
    }

    const totalRevenue = (settlements ?? []).reduce(
      (sum, s) => sum + Number(s.gross_revenue),
      0
    );
    const totalCosts = (settlements ?? []).reduce(
      (sum, s) =>
        sum +
        Number(s.stripe_fees) +
        Number(s.platform_fee) +
        Number(s.total_artist_fees) +
        Number(s.total_costs),
      0
    );
    const netProfit = (settlements ?? []).reduce(
      (sum, s) => sum + Number(s.profit),
      0
    );
    // Count ALL events (not just settlements) so the overview shows even pre-revenue
    const totalEvents = (allEvents ?? []).length;

    return {
      error: null,
      data: {
        totalRevenue,
        totalExpenses: totalCosts,
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

    // Get all events with settlements
    const [{ data: settlements }, { data: allEvents }] = await Promise.all([
      admin
        .from("settlements")
        .select(
          "id, event_id, status, gross_revenue, net_revenue, profit, platform_fee, stripe_fees, total_artist_fees, total_costs, events(title, starts_at, status)"
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

    // Get ticket counts per event
    const eventIds = [
      ...new Set([
        ...settledEventIds,
        ...(allEvents ?? []).map((e) => e.id),
      ]),
    ];

    let ticketCounts: Record<string, number> = {};
    let ticketRevenue: Record<string, number> = {};
    if (eventIds.length > 0) {
      const { data: tickets } = await admin
        .from("tickets")
        .select("event_id, price_paid")
        .in("event_id", eventIds)
        .in("status", ["paid", "checked_in"]);

      (tickets ?? []).forEach((t) => {
        ticketCounts[t.event_id] = (ticketCounts[t.event_id] || 0) + 1;
        ticketRevenue[t.event_id] = (ticketRevenue[t.event_id] || 0) + Number(t.price_paid || 0);
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
      const gross = Number(s.gross_revenue);
      const totalExp =
        Number(s.stripe_fees) +
        Number(s.platform_fee) +
        Number(s.total_artist_fees) +
        Number(s.total_costs);
      const profit = Number(s.profit);

      results.push({
        id: s.id,
        eventId: s.event_id,
        title: event?.title ?? "Unknown Event",
        date: event?.starts_at ?? "",
        ticketsSold: ticketCounts[s.event_id] ?? 0,
        grossRevenue: gross,
        totalExpenses: totalExp,
        netRevenue: Number(s.net_revenue),
        profit,
        status: s.status,
        eventStatus: event?.status ?? "unknown",
        margin: gross > 0 ? (profit / gross) * 100 : 0,
      });
    });

    // Add unsettled events — show estimated revenue from ticket sales
    (allEvents ?? [])
      .filter((e) => !settledEventIds.includes(e.id))
      .forEach((e) => {
        const sold = ticketCounts[e.id] ?? 0;
        const gross = ticketRevenue[e.id] ?? 0;
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

  const [{ data: tiers }, { data: tickets }, { data: artists }] =
    await Promise.all([
      admin
        .from("ticket_tiers")
        .select("id, event_id, price, capacity")
        .in("event_id", eventIds),
      admin
        .from("tickets")
        .select("event_id, price_paid")
        .in("event_id", eventIds)
        .in("status", ["paid", "checked_in"]),
      admin
        .from("event_artists")
        .select("event_id, fee")
        .in("event_id", eventIds),
    ]);

  const results: RevenueForecastItem[] = upcomingEvents.map((event) => {
    const eventTiers = (tiers ?? []).filter((t) => t.event_id === event.id);
    const eventTickets = (tickets ?? []).filter(
      (t) => t.event_id === event.id
    );
    const eventArtists = (artists ?? []).filter(
      (a) => a.event_id === event.id
    );

    const ticketsSold = eventTickets.length;
    const totalCapacity = eventTiers.reduce((s, t) => s + (t.capacity ?? 0), 0);
    const currentRevenue = eventTickets.reduce(
      (s, t) => s + Number(t.price_paid),
      0
    );
    const avgTicketPrice =
      ticketsSold > 0
        ? currentRevenue / ticketsSold
        : eventTiers.length > 0
          ? eventTiers.reduce((s, t) => s + Number(t.price), 0) /
            eventTiers.length
          : 0;
    const artistCosts = eventArtists.reduce(
      (s, a) => s + Number(a.fee),
      0
    );

    const eventDate = new Date(event.starts_at);
    // TODO: Add published_at column to events table for accurate forecasting.
    // Using created_at as proxy — inaccurate for events that sit in draft.
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
    // If totalCapacity is 0 (unlimited/unset), don't cap the projection
    const projectedTickets = totalCapacity > 0
      ? Math.min(totalCapacity, ticketsSold + projectedAdditionalTickets)
      : ticketsSold + projectedAdditionalTickets;
    const projectedRevenue = projectedTickets * avgTicketPrice;

    // Projected profit (revenue - estimated stripe fees - artist costs)
    // Only apply per-transaction fee ($0.30) to additional projected tickets, not already-sold ones
    const additionalTickets = projectedTickets - ticketsSold;
    // Stripe charges 2.9% + $0.30 per TRANSACTION (checkout), not per ticket.
    // Approximate: assume ~1.5 tickets per checkout on average for group purchases.
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
