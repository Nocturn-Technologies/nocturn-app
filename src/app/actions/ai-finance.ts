"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { generateWithClaude } from "@/lib/claude";
import { rateLimitStrict } from "@/lib/rate-limit";

export interface ForecastData {
  // Revenue projections
  projectedRevenue: number;
  bestCase: number;
  worstCase: number;
  ticketsSoldSoFar: number;
  totalCapacity: number;
  sellThroughRate: number;
  daysUntilEvent: number;

  // Cost breakdown
  artistFees: number;
  talentTravelCosts: number;
  venueCost: number;
  estimatedExpenses: number;
  stripeFees: number;
  platformFee: number;

  // Bar minimum
  barMinimum: number;
  venueDeposit: number;
  estimatedBarRevenue: number;
  barMinimumMet: boolean;
  depositAtRisk: boolean;

  // Bottom line
  projectedProfit: number;
  breakEvenTickets: number;

  // Tier breakdown
  tiers: Array<{
    name: string;
    price: number;
    capacity: number;
    sold: number;
    revenue: number;
  }>;

  // AI insights
  insights: string[];
  aiNarrative: string;
}

// Pre-event financial forecast
//
// `options.skipNarrative` skips the Claude API call (the only slow part of
// this function — everything else is fast SQL + math). The narrative isn't
// rendered anywhere right now, so callers can safely pass `true` whenever
// they only need the structured forecast data. Callers that DO want the
// narrative (none today) can omit the flag.
export async function generateEventForecast(
  eventId: string,
  options: { skipNarrative?: boolean } = {}
): Promise<{
  error: string | null;
  forecast: ForecastData | null;
}> {
  try {
  if (!eventId?.trim()) return { error: "Event ID is required", forecast: null };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", forecast: null };

  // Rate limit: 10 forecast requests per minute per user
  const { success: rlOk } = await rateLimitStrict(`ai-finance:${user.id}`, 10, 60_000);
  if (!rlOk) return { error: "Too many requests. Please wait a moment.", forecast: null };

  const admin = createAdminClient();

  // Get event
  const { data: eventRaw, error: eventError } = await admin
    .from("events")
    .select("id, title, starts_at, collective_id")
    .eq("id", eventId)
    .maybeSingle();
  const event = eventRaw as { id: string; title: string; starts_at: string; collective_id: string } | null;

  if (eventError) {
    console.error("[generateEventForecast] event lookup failed:", eventError);
    return { error: "Something went wrong", forecast: null };
  }
  if (!event) return { error: "Event not found", forecast: null };

  // Verify caller is a member of the event's collective
  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount) return { error: "Not authorized", forecast: null };

  const daysUntilEvent = Math.ceil(
    (new Date(event.starts_at).getTime() - Date.now()) / 86400000
  );

  // Get ticket tiers
  const { data: tiersRaw } = await admin
    .from("ticket_tiers")
    .select("id, name, price, capacity")
    .eq("event_id", eventId)
    .order("sort_order");
  const tiers = tiersRaw as { id: string; name: string; price: number; capacity: number }[] | null;

  if (!tiers || tiers.length === 0) {
    return { error: "No ticket tiers configured", forecast: null };
  }

  // Count sold tickets per tier
  const tierData = await Promise.all(
    tiers.map(async (tier) => {
      const { count } = await admin
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("tier_id", tier.id)
        .in("status", ["valid", "checked_in"]);

      const sold = count ?? 0;
      return {
        name: tier.name,
        price: Number(tier.price),
        capacity: tier.capacity,
        sold,
        revenue: sold * Number(tier.price),
      };
    })
  );

  const ticketsSoldSoFar = tierData.reduce((s, t) => s + t.sold, 0);
  const totalCapacity = tierData.reduce((s, t) => s + t.capacity, 0);
  const currentRevenue = tierData.reduce((s, t) => s + t.revenue, 0);
  const sellThroughRate = totalCapacity > 0 ? ticketsSoldSoFar / totalCapacity : 0;

  // Project remaining sales using nightlife-specific reference curves.
  // The old naive multiplier treated 30% sold the same whether it was 3
  // weeks out (normal dead zone) or 3 days out (actually behind). The
  // curve-aware version accounts for when nightlife tickets actually sell.
  let projectedSellThrough: number;
  if (daysUntilEvent <= 0) {
    projectedSellThrough = sellThroughRate;
  } else {
    const eventDate = new Date(event.starts_at);
    const curve = selectCurveProfile(eventDate.getDay(), totalCapacity, tiers.length);
    const curvePrediction = predictSales(curve, daysUntilEvent, sellThroughRate);
    projectedSellThrough = curvePrediction.projected;
  }

  // Calculate projected revenue (weighted average price × projected tickets)
  const avgTicketPrice = totalCapacity > 0
    ? tierData.reduce((s, t) => s + t.price * t.capacity, 0) / totalCapacity
    : 0;

  const projectedTickets = Math.round(totalCapacity * projectedSellThrough);
  const projectedRevenue = projectedTickets * avgTicketPrice;
  const bestCase = totalCapacity * avgTicketPrice; // sell out
  const worstCase = currentRevenue; // no more sales

  // Get artist fees (travel costs are now tracked via event_expenses)
  const { data: bookingsRaw } = await admin
    .from("event_artists")
    .select("fee")
    .eq("event_id", eventId);
  const bookings = bookingsRaw as { fee: number | null }[] | null;

  const artistFees = (bookings ?? []).reduce((s, b) => s + (Number(b.fee) || 0), 0);
  // Travel costs are no longer stored as flat columns on event_artists —
  // they are tracked as categorised rows in event_expenses instead.
  const talentTravelCosts = 0;

  // Get all expenses (venue cost, travel, other) from event_expenses
  const { data: expensesRaw } = await admin
    .from("event_expenses")
    .select("amount, category")
    .eq("event_id", eventId);
  const expenseRows = expensesRaw as { amount: number; category: string }[] | null;

  const venueCost = (expenseRows ?? [])
    .filter((e) => e.category === "venue")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const estimatedExpenses = (expenseRows ?? [])
    .filter((e) => e.category !== "venue")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Bar minimum / venue deposit are no longer stored on events.
  // Default to zero so the rest of the forecast math still works.
  const barMinimum = 0;
  const venueDeposit = 0;
  const estimatedBarRevenue = 0;
  const barMinimumMet = true;
  const depositAtRisk = false;

  // Stripe + Nocturn fees are buyer-paid (Nocturn is the merchant of
  // record), so the organizer keeps the full ticket face value. We zero
  // these fields out — kept on the response for backwards compatibility
  // with any client code that still reads them, but they no longer
  // distort the projected profit.
  const stripeFees = 0;
  const platformFee = 0;

  const totalCosts = artistFees + talentTravelCosts + venueCost + estimatedExpenses;
  const totalRevenue = projectedRevenue + estimatedBarRevenue;
  const projectedProfit = totalRevenue - totalCosts - (depositAtRisk ? venueDeposit : 0);

  // Break-even uses face value (no fee deduction) because the organizer
  // keeps 100% of what's printed on the ticket.
  const fixedCosts = artistFees + talentTravelCosts + venueCost + estimatedExpenses;
  const breakEvenTickets = avgTicketPrice > 0
    ? Math.ceil(Math.max(0, fixedCosts - estimatedBarRevenue) / avgTicketPrice)
    : 0;

  // Generate insights
  const insights: string[] = [];

  if (sellThroughRate === 0 && daysUntilEvent > 0) {
    insights.push("🎫 No tickets sold yet. Consider launching a social media push to drive early sales.");
  } else if (sellThroughRate < 0.2 && daysUntilEvent <= 7) {
    insights.push("⚠️ Low sell-through with less than a week to go. Consider a last-minute promo code or price drop.");
  } else if (sellThroughRate > 0.8) {
    insights.push("🔥 Over 80% sold! Consider raising prices on remaining tickets or adding a VIP tier.");
  } else if (sellThroughRate > 0.5) {
    insights.push("📈 Solid momentum — over half sold. A targeted email to past attendees could push you over the top.");
  }

  if (artistFees > projectedRevenue * 0.5) {
    insights.push("💰 Artist fees are over 50% of projected revenue. Watch your margins carefully.");
  }

  if (breakEvenTickets > totalCapacity * 0.8) {
    insights.push("⚠️ You need to sell 80%+ of tickets just to break even. Consider cutting costs.");
  } else if (ticketsSoldSoFar > 0 && breakEvenTickets <= ticketsSoldSoFar) {
    // B04: only claim "passed break-even" once real sales have actually
    // covered costs. Previously this fired when 0 tix sold + $0 costs because
    // 0 <= 0 is technically true.
    insights.push("✅ You've already passed break-even! Everything from here is profit.");
  } else if (ticketsSoldSoFar === 0) {
    insights.push(`📊 Break-even hits at ${breakEvenTickets} tickets sold.`);
  } else {
    insights.push(`📊 You need ${breakEvenTickets - ticketsSoldSoFar} more ticket sales to break even.`);
  }

  if (daysUntilEvent > 14 && sellThroughRate < 0.1) {
    insights.push("📣 You still have time. Events typically sell 60% of tickets in the final 2 weeks.");
  }

  if (estimatedExpenses === 0 && artistFees === 0) {
    insights.push("💡 No expenses logged yet. Add costs for a more accurate profit forecast.");
  }

  if (depositAtRisk) {
    insights.push(`🚨 Bar minimum of $${barMinimum.toFixed(0)} may not be met. Your $${venueDeposit.toFixed(0)} deposit is at risk.`);
  } else if (barMinimum > 0 && barMinimumMet) {
    insights.push(`✅ Estimated bar revenue ($${estimatedBarRevenue.toFixed(0)}) exceeds bar minimum ($${barMinimum.toFixed(0)}).`);
  }

  if (talentTravelCosts > 0) {
    insights.push(`✈️ Talent travel costs: $${talentTravelCosts.toFixed(0)} (flights, hotel, transport).`);
  }

  // AI narrative — only generated when explicitly requested. Most callers
  // (the merged financials page) skip this because it's a slow Claude call
  // and the rendered UI uses `insights` instead.
  let aiNarrative = "";
  if (!options.skipNarrative) {
    // Calculate ticket velocity: tickets sold / days since first ticket sale
    const { data: firstTicketRaw } = await admin
      .from("tickets")
      .select("created_at")
      .eq("event_id", eventId)
      .in("status", ["valid", "checked_in"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const firstTicket = firstTicketRaw as { created_at: string } | null;

    const daysSinceSalesStarted = firstTicket?.created_at
      ? Math.max(1, Math.ceil((Date.now() - new Date(firstTicket.created_at).getTime()) / 86400000))
      : 1;
    const ticketsPerDay = ticketsSoldSoFar > 0
      ? ticketsSoldSoFar / daysSinceSalesStarted
      : 0;

    const { SYSTEM_PROMPTS } = await import("@/lib/ai-prompts");
    const forecastPrompt = `${SYSTEM_PROMPTS.forecast}

Given this event forecast data, write a 2-3 sentence plain English explanation of where ticket sales stand and the financial outlook, followed by exactly 2 tactical recommendations. No headers, no bullet points — just a short paragraph.

Event: "${event.title}"
Days until event: ${daysUntilEvent}
Tickets sold: ${ticketsSoldSoFar} of ${totalCapacity} (${Math.round(sellThroughRate * 100)}% sell-through)
Ticket velocity: ~${Math.round(ticketsPerDay)} tickets/day
Projected revenue: $${projectedRevenue.toFixed(2)}
Projected profit: $${projectedProfit.toFixed(2)}
Break-even: ${breakEvenTickets} tickets (${breakEvenTickets <= ticketsSoldSoFar ? "ALREADY HIT" : `${breakEvenTickets - ticketsSoldSoFar} more needed`})
Artist fees: $${artistFees.toFixed(2)}
Other expenses: $${estimatedExpenses.toFixed(2)}
Tier breakdown: ${tierData.map(t => `${t.name}: ${t.sold}/${t.capacity} @ $${t.price}`).join(", ")}`;

    aiNarrative = await generateWithClaude(forecastPrompt) ?? "";
  }

  return {
    error: null,
    forecast: {
      projectedRevenue,
      bestCase,
      worstCase,
      ticketsSoldSoFar,
      totalCapacity,
      sellThroughRate,
      daysUntilEvent,
      artistFees,
      talentTravelCosts,
      venueCost,
      estimatedExpenses,
      stripeFees,
      platformFee,
      barMinimum,
      venueDeposit,
      estimatedBarRevenue,
      barMinimumMet,
      depositAtRisk,
      projectedProfit,
      breakEvenTickets,
      tiers: tierData,
      insights,
      aiNarrative,
    },
  };
  } catch (err) {
    console.error("[generateEventForecast]", err);
    return { error: "Something went wrong", forecast: null };
  }
}

// ── Ticket Sales Trajectory ──────────────────────────────────────────────

import {
  selectCurveProfile,
  predictSales,
  getTrajectoryInsight,
  getDayOfWeekLabel,
  type SalesPrediction,
} from "@/lib/sales-prediction";

export interface TrajectoryData {
  prediction: SalesPrediction;
  ticketsSold: number;
  totalCapacity: number;
  breakEvenTickets: number;
  insight: string;
  dayOfWeekLabel: string;
}

/**
 * Compute the ticket sales trajectory for an event.
 * Returns curve-aware prediction, chart data, and a plain-English insight.
 * No Claude call — all math + templates for instant rendering.
 */
export async function getTicketSalesTrajectory(
  eventId: string
): Promise<{ error: string | null; trajectory: TrajectoryData | null }> {
  try {
    if (!eventId?.trim()) return { error: "Event ID is required", trajectory: null };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", trajectory: null };

    const admin = createAdminClient();

    // Get event
    const { data: event } = await admin
      .from("events")
      .select("id, starts_at, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) return { error: "Event not found", trajectory: null };

    // Verify membership
    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", (event as { collective_id: string }).collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount) return { error: "Not authorized", trajectory: null };

    const startsAt = new Date((event as { starts_at: string }).starts_at);
    const daysOut = Math.max(
      0,
      Math.ceil((startsAt.getTime() - Date.now()) / 86400000)
    );
    const dayOfWeek = startsAt.getDay();

    // Get ticket tiers
    const { data: tiers } = await admin
      .from("ticket_tiers")
      .select("id, name, price, capacity")
      .eq("event_id", eventId)
      .order("sort_order");

    if (!tiers || tiers.length === 0)
      return { error: "No ticket tiers", trajectory: null };

    const typedTiers = tiers as { id: string; name: string; price: number; capacity: number }[];

    // Count sold tickets per tier + get daily sales data for chart
    const [tierCounts, dailySales] = await Promise.all([
      Promise.all(
        typedTiers.map(async (tier) => {
          const { count } = await admin
            .from("tickets")
            .select("*", { count: "exact", head: true })
            .eq("tier_id", tier.id)
            .in("status", ["valid", "checked_in"]);
          return { ...tier, sold: count ?? 0 };
        })
      ),
      // Get all ticket purchase dates for the sales curve chart
      admin
        .from("tickets")
        .select("created_at")
        .eq("event_id", eventId)
        .in("status", ["valid", "checked_in"])
        .order("created_at", { ascending: true }),
    ]);

    const ticketsSold = tierCounts.reduce((s, t) => s + t.sold, 0);
    const totalCapacity = typedTiers.reduce((s, t) => s + t.capacity, 0);
    const currentPctSold = totalCapacity > 0 ? ticketsSold / totalCapacity : 0;

    // Build daily cumulative sales history for chart
    const salesHistory: Array<{ daysOut: number; pct: number }> = [];
    const ticketDates = (dailySales.data ?? []) as { created_at: string }[];
    if (ticketDates.length > 0) {
      // Group by date, compute cumulative
      const dailyMap = new Map<number, number>();
      let cumulative = 0;
      for (const t of ticketDates) {
        const ticketDate = new Date(t.created_at);
        const ticketDaysOut = Math.max(
          0,
          Math.ceil((startsAt.getTime() - ticketDate.getTime()) / 86400000)
        );
        cumulative++;
        dailyMap.set(ticketDaysOut, cumulative);
      }
      // Convert to array — ensure we have at least start and current point
      const sortedDays = [...dailyMap.entries()].sort((a, b) => b[0] - a[0]);
      for (const [d, cum] of sortedDays) {
        salesHistory.push({ daysOut: d, pct: totalCapacity > 0 ? cum / totalCapacity : 0 });
      }
    }
    // Always include current point
    if (salesHistory.length === 0 || salesHistory[salesHistory.length - 1]?.daysOut !== daysOut) {
      salesHistory.push({ daysOut, pct: currentPctSold });
    }

    // Select curve + predict
    const curve = selectCurveProfile(dayOfWeek, totalCapacity, typedTiers.length);
    const prediction = predictSales(curve, daysOut, currentPctSold, salesHistory);

    // Break-even calculation (same as generateEventForecast)
    const { data: bookingsRaw } = await admin
      .from("event_artists")
      .select("fee")
      .eq("event_id", eventId);
    const bookings = (bookingsRaw ?? []) as { fee: number | null }[];

    const artistFees = bookings.reduce((s, b) => s + (Number(b.fee) || 0), 0);

    const { data: expensesRaw } = await admin
      .from("event_expenses")
      .select("amount, category")
      .eq("event_id", eventId);
    const expenseRows = (expensesRaw ?? []) as { amount: number; category: string }[];

    const venueCost = expenseRows
      .filter((e) => e.category === "venue")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const estimatedExpenses = expenseRows
      .filter((e) => e.category !== "venue")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    // Bar revenue / minimums are no longer stored on events
    const estimatedBarRevenue = 0;

    const fixedCosts = artistFees + venueCost + estimatedExpenses;
    const avgTicketPrice = totalCapacity > 0
      ? typedTiers.reduce((s, t) => s + Number(t.price) * t.capacity, 0) / totalCapacity
      : 0;
    const breakEvenTickets = avgTicketPrice > 0
      ? Math.ceil(Math.max(0, fixedCosts - estimatedBarRevenue) / avgTicketPrice)
      : 0;

    const dayOfWeekLabel = getDayOfWeekLabel(dayOfWeek);
    const insight = getTrajectoryInsight(
      prediction,
      ticketsSold,
      totalCapacity,
      breakEvenTickets,
      dayOfWeekLabel
    );

    return {
      error: null,
      trajectory: {
        prediction,
        ticketsSold,
        totalCapacity,
        breakEvenTickets,
        insight,
        dayOfWeekLabel,
      },
    };
  } catch (err) {
    console.error("[getTicketSalesTrajectory]", err);
    return { error: "Something went wrong", trajectory: null };
  }
}

export interface PostEventRecap {
  event: { title: string; date: string; venue: string };
  financial: {
    grossRevenue: number;
    netProfit: number;
    ticketsSold: number;
    capacity: number;
    sellThrough: number;
    avgTicketPrice: number;
  };
  attendance: {
    checkedIn: number;
    noShows: number;
    checkInRate: number;
  };
  actionItems: Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    category: string;
  }>;
  highlights: string[];
}

// Post-event recap with action items
export async function generatePostEventRecap(eventId: string): Promise<{
  error: string | null;
  recap: PostEventRecap | null;
}> {
  try {
  if (!eventId?.trim()) return { error: "Event ID is required", recap: null };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", recap: null };

  const { success: rlOk } = await rateLimitStrict(`ai-recap:${user.id}`, 10, 60_000);
  if (!rlOk) return { error: "Too many requests. Please wait a moment.", recap: null };

  const admin = createAdminClient();

  // Get event with flat venue columns
  const { data: eventRaw2, error: eventError2 } = await admin
    .from("events")
    .select("id, title, starts_at, collective_id, status, venue_name, city")
    .eq("id", eventId)
    .maybeSingle();
  const event = eventRaw2 as { id: string; title: string; starts_at: string; collective_id: string; status: string; venue_name: string | null; city: string | null } | null;

  if (eventError2) {
    console.error("[generatePostEventRecap] event lookup failed:", eventError2);
    return { error: "Something went wrong", recap: null };
  }
  if (!event) return { error: "Event not found", recap: null };

  // Verify caller is a member of the event's collective
  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount) return { error: "Not authorized", recap: null };

  const venueLabel = event.venue_name
    ? `${event.venue_name}${event.city ? `, ${event.city}` : ""}`
    : null;

  // Ticket data (price_paid removed — derive revenue from orders)
  const [ticketsRaw2, ordersRaw] = await Promise.all([
    admin.from("tickets").select("status").eq("event_id", eventId),
    admin.from("orders").select("total").eq("event_id", eventId).eq("status", "paid"),
  ]);
  const tickets = ticketsRaw2.data as { status: string }[] | null;
  const paidOrders = ordersRaw.data as { total: number }[] | null;

  const paidTickets = (tickets ?? []).filter((t) => t.status === "paid" || t.status === "checked_in");
  const checkedIn = (tickets ?? []).filter((t) => t.status === "checked_in").length;
  const ticketsSold = paidTickets.length;
  const grossRevenue = (paidOrders ?? []).reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avgTicketPrice = ticketsSold > 0 ? grossRevenue / ticketsSold : 0;

  // Capacity
  const { data: tiersRaw2 } = await admin
    .from("ticket_tiers")
    .select("capacity")
    .eq("event_id", eventId);
  const tiers2 = tiersRaw2 as { capacity: number }[] | null;
  const capacity = (tiers2 ?? []).reduce((s, t) => s + t.capacity, 0);
  const sellThrough = capacity > 0 ? ticketsSold / capacity : 0;

  // Settlement
  const { data: settlementRaw } = await admin
    .from("settlements")
    .select("net_payout, status")
    .eq("event_id", eventId)
    .maybeSingle();
  const settlement = settlementRaw as { net_payout: number | null; status: string } | null;

  const netProfit = Number(settlement?.net_payout ?? 0);

  // Past events for comparison
  const { data: pastEventsRaw } = await admin
    .from("events")
    .select("id")
    .eq("collective_id", event.collective_id)
    .eq("status", "completed")
    .neq("id", eventId);
  const pastEvents = pastEventsRaw as { id: string }[] | null;

  let avgPastSellThrough = 0;
  if (pastEvents && pastEvents.length > 0) {
    // Simplified — just compare ticket count
    const pastEventIds = pastEvents.map((e) => e.id);
    const { count: pastTicketCount } = await admin
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .in("event_id", pastEventIds)
      .in("status", ["valid", "checked_in"]);

    avgPastSellThrough = (pastTicketCount ?? 0) / pastEvents.length;
  }

  // Check-in rate
  const noShows = ticketsSold - checkedIn;
  const checkInRate = ticketsSold > 0 ? checkedIn / ticketsSold : 0;

  // Generate action items
  const actionItems: PostEventRecap["actionItems"] = [];

  // Always: settle
  if (!settlement) {
    actionItems.push({
      title: "Generate settlement",
      description: "Run the numbers and create the P&L breakdown",
      priority: "high",
      category: "finance",
    });
  } else if (settlement.status === "draft") {
    actionItems.push({
      title: "Approve settlement",
      description: `Settlement is in draft — review and approve the $${netProfit.toFixed(2)} profit`,
      priority: "high",
      category: "finance",
    });
  }

  // Post-event content
  actionItems.push({
    title: "Post recap content",
    description: "Share photos and videos within 48 hours while the energy is fresh",
    priority: "high",
    category: "marketing",
  });

  // Thank-you email
  actionItems.push({
    title: "Send thank-you email",
    description: `${ticketsSold} attendees are waiting. Use Nocturn AI to draft a recap email`,
    priority: "medium",
    category: "marketing",
  });

  // Low check-in rate
  if (checkInRate < 0.7 && ticketsSold > 10) {
    actionItems.push({
      title: "Address no-show rate",
      description: `${Math.round((1 - checkInRate) * 100)}% no-show rate. Consider requiring deposits or adjusting pricing`,
      priority: "medium",
      category: "operations",
    });
  }

  // Low sell-through
  if (sellThrough < 0.5) {
    actionItems.push({
      title: "Review marketing strategy",
      description: `Only ${Math.round(sellThrough * 100)}% sell-through. Analyze what channels drove sales for next time`,
      priority: "medium",
      category: "marketing",
    });
  }

  // High sell-through — scale up
  if (sellThrough > 0.9) {
    actionItems.push({
      title: "Consider a bigger venue",
      description: `${Math.round(sellThrough * 100)}% sell-through — you could fill a larger space next time`,
      priority: "low",
      category: "growth",
    });
  }

  // Profit analysis
  if (netProfit < 0) {
    actionItems.push({
      title: "Review costs for next event",
      description: `This event lost $${Math.abs(netProfit).toFixed(2)}. Identify which costs to cut`,
      priority: "high",
      category: "finance",
    });
  }

  // Plan next event
  actionItems.push({
    title: "Plan the next one",
    description: "Strike while the iron is hot — announce your next event within 2 weeks",
    priority: "medium",
    category: "growth",
  });

  // Generate highlights
  const highlights: string[] = [];

  if (ticketsSold > 0) {
    highlights.push(`🎫 ${ticketsSold} tickets sold ($${grossRevenue.toFixed(2)} gross)`);
  }
  if (checkedIn > 0) {
    highlights.push(`✅ ${checkedIn} people checked in (${Math.round(checkInRate * 100)}% show rate)`);
  }
  if (sellThrough >= 0.9) {
    highlights.push("🔥 Near sellout!");
  }
  if (netProfit > 0) {
    highlights.push(`💰 $${netProfit.toFixed(2)} net profit`);
  } else if (netProfit < 0) {
    highlights.push(`📉 -$${Math.abs(netProfit).toFixed(2)} loss`);
  }
  if (pastEvents && pastEvents.length > 0 && ticketsSold > avgPastSellThrough) {
    highlights.push("📈 Outperformed your average event");
  }

  // AI enhancement — send gathered data to Claude for deeper insights
  const recapPrompt = `You are a concise post-event analyst for a nightlife promoter. Analyze this event data and respond in EXACTLY this JSON format (no markdown, no code fences):
{"worked":["thing1","thing2","thing3"],"improve":["thing1","thing2","thing3"],"actions":[{"title":"...","description":"...","priority":"high|medium|low","category":"finance|marketing|operations|growth"},{"title":"...","description":"...","priority":"...","category":"..."},{"title":"...","description":"...","priority":"...","category":"..."},{"title":"...","description":"...","priority":"...","category":"..."},{"title":"...","description":"...","priority":"...","category":"..."}]}

Event: "${event.title}" at ${venueLabel ?? "N/A"}
Date: ${new Date(event.starts_at).toLocaleDateString()}
Tickets sold: ${ticketsSold} of ${capacity} (${Math.round(sellThrough * 100)}% sell-through)
Gross revenue: $${grossRevenue.toFixed(2)}
Net profit: $${netProfit.toFixed(2)}
Avg ticket price: $${avgTicketPrice.toFixed(2)}
Check-in rate: ${Math.round(checkInRate * 100)}% (${checkedIn} checked in, ${noShows} no-shows)
Past events by this collective: ${pastEvents?.length ?? 0}
${pastEvents && pastEvents.length > 0 ? `Avg past attendance: ${Math.round(avgPastSellThrough)}` : "First event for this collective"}

Give specific, actionable advice. Reference the actual numbers.`;

  const aiRecapRaw = await generateWithClaude(recapPrompt);

  if (aiRecapRaw) {
    try {
      const aiRecap = JSON.parse(aiRecapRaw) as {
        worked?: string[];
        improve?: string[];
        actions?: Array<{ title: string; description: string; priority: string; category: string }>;
      };

      // Merge AI highlights with existing ones
      if (aiRecap.worked) {
        for (const item of aiRecap.worked) {
          highlights.push(`✨ ${item}`);
        }
      }
      if (aiRecap.improve) {
        for (const item of aiRecap.improve) {
          highlights.push(`🔧 ${item}`);
        }
      }

      // Merge AI action items with existing ones
      if (aiRecap.actions) {
        for (const action of aiRecap.actions) {
          const priority = (["high", "medium", "low"].includes(action.priority) ? action.priority : "medium") as "high" | "medium" | "low";
          actionItems.push({
            title: action.title,
            description: action.description,
            priority,
            category: action.category || "growth",
          });
        }
      }
    } catch (parseErr) {
      console.error("[ai-finance] Failed to parse AI recap response:", parseErr);
      console.error("[ai-finance] Raw AI response:", aiRecapRaw);
    }
  }

  return {
    error: null,
    recap: {
      event: {
        title: event.title,
        date: new Date(event.starts_at).toLocaleDateString("en", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        venue: venueLabel ?? "N/A",
      },
      financial: {
        grossRevenue,
        netProfit,
        ticketsSold,
        capacity,
        sellThrough,
        avgTicketPrice,
      },
      attendance: {
        checkedIn,
        noShows,
        checkInRate,
      },
      actionItems,
      highlights,
    },
  };
  } catch (err) {
    console.error("[generatePostEventRecap]", err);
    return { error: "Something went wrong", recap: null };
  }
}
