"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { PLATFORM_FEE_PERCENT } from "@/lib/stripe";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { generateWithClaude } from "@/lib/claude";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

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
export async function generateEventForecast(eventId: string): Promise<{
  error: string | null;
  forecast: ForecastData | null;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", forecast: null };

  const admin = createAdminClient();

  // Get event
  const { data: event } = await admin
    .from("events")
    .select("id, title, starts_at, collective_id, bar_minimum, venue_deposit, venue_cost, estimated_bar_revenue")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", forecast: null };

  const daysUntilEvent = Math.ceil(
    (new Date(event.starts_at).getTime() - Date.now()) / 86400000
  );

  // Get ticket tiers
  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("id, name, price, capacity")
    .eq("event_id", eventId)
    .order("sort_order");

  if (!tiers || tiers.length === 0) {
    return { error: "No ticket tiers configured", forecast: null };
  }

  // Count sold tickets per tier
  const tierData = await Promise.all(
    tiers.map(async (tier) => {
      const { count } = await admin
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("ticket_tier_id", tier.id)
        .in("status", ["paid", "checked_in"]);

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

  // Project remaining sales based on current momentum
  // Simple model: if X% sold with Y days left, project final sell-through
  let projectedSellThrough: number;
  if (daysUntilEvent <= 0) {
    projectedSellThrough = sellThroughRate;
  } else if (sellThroughRate > 0.7) {
    projectedSellThrough = Math.min(sellThroughRate * 1.15, 1.0); // likely sells out
  } else if (sellThroughRate > 0.3) {
    projectedSellThrough = Math.min(sellThroughRate * 1.3, 0.95);
  } else {
    projectedSellThrough = Math.min(sellThroughRate * 1.5, 0.8);
  }

  // Calculate projected revenue (weighted average price × projected tickets)
  const avgTicketPrice = totalCapacity > 0
    ? tierData.reduce((s, t) => s + t.price * t.capacity, 0) / totalCapacity
    : 0;

  const projectedTickets = Math.round(totalCapacity * projectedSellThrough);
  const projectedRevenue = projectedTickets * avgTicketPrice;
  const bestCase = totalCapacity * avgTicketPrice; // sell out
  const worstCase = currentRevenue; // no more sales

  // Get artist fees + travel costs
  const { data: bookings } = await admin
    .from("event_artists")
    .select("fee, flight_cost, hotel_cost, transport_cost")
    .eq("event_id", eventId)
    .eq("status", "confirmed");

  const artistFees = (bookings ?? []).reduce((s, b) => s + (Number(b.fee) || 0), 0);
  const talentTravelCosts = (bookings ?? []).reduce(
    (s, b) => s + (Number(b.flight_cost) || 0) + (Number(b.hotel_cost) || 0) + (Number(b.transport_cost) || 0),
    0
  );

  // Venue financials
  const venueCost = Number(event.venue_cost) || 0;
  const barMinimum = Number(event.bar_minimum) || 0;
  const venueDeposit = Number(event.venue_deposit) || 0;
  const estimatedBarRevenue = Number(event.estimated_bar_revenue) || 0;
  const barMinimumMet = estimatedBarRevenue >= barMinimum || barMinimum === 0;
  const depositAtRisk = !barMinimumMet && venueDeposit > 0;

  // Get known expenses
  const { data: expenses } = await admin
    .from("event_expenses")
    .select("amount")
    .eq("event_id", eventId);

  const estimatedExpenses = (expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Calculate fees
  const stripeFees = Math.round(projectedRevenue * 0.029 * 100 + projectedTickets * 30) / 100;
  const platformFee = Math.round(projectedRevenue * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;

  const totalCosts = stripeFees + platformFee + artistFees + talentTravelCosts + venueCost + estimatedExpenses;
  const totalRevenue = projectedRevenue + estimatedBarRevenue;
  const projectedProfit = totalRevenue - totalCosts - (depositAtRisk ? venueDeposit : 0);

  // Break-even calculation (includes all fixed costs)
  const fixedCosts = artistFees + talentTravelCosts + venueCost + estimatedExpenses;
  const netPerTicket = avgTicketPrice * (1 - PLATFORM_FEE_PERCENT / 100 - 0.029);
  const breakEvenTickets = netPerTicket > 0
    ? Math.ceil(Math.max(0, fixedCosts - estimatedBarRevenue) / netPerTicket)
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
  } else if (breakEvenTickets <= ticketsSoldSoFar) {
    insights.push("✅ You've already passed break-even! Everything from here is profit.");
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

  // AI narrative — send computed data to Claude for a plain-English summary
  // Calculate ticket velocity: tickets sold / days since first ticket sale
  const { data: firstTicket } = await admin
    .from("tickets")
    .select("created_at")
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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

  const aiNarrative = await generateWithClaude(forecastPrompt) ?? "";

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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", recap: null };

  const admin = createAdminClient();

  // Get event with venue
  const { data: event } = await admin
    .from("events")
    .select("id, title, starts_at, collective_id, status, venues(name, city)")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", recap: null };

  const venue = event.venues as unknown as { name: string; city: string } | null;

  // Ticket data
  const { data: tickets } = await admin
    .from("tickets")
    .select("status, price_paid, checked_in_at")
    .eq("event_id", eventId);

  const paidTickets = (tickets ?? []).filter((t) => t.status === "paid" || t.status === "checked_in");
  const checkedIn = (tickets ?? []).filter((t) => t.status === "checked_in").length;
  const ticketsSold = paidTickets.length;
  const grossRevenue = paidTickets.reduce((s, t) => s + (Number(t.price_paid) || 0), 0);
  const avgTicketPrice = ticketsSold > 0 ? grossRevenue / ticketsSold : 0;

  // Capacity
  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("capacity")
    .eq("event_id", eventId);
  const capacity = (tiers ?? []).reduce((s, t) => s + t.capacity, 0);
  const sellThrough = capacity > 0 ? ticketsSold / capacity : 0;

  // Settlement
  const { data: settlement } = await admin
    .from("settlements")
    .select("profit, status")
    .eq("event_id", eventId)
    .maybeSingle();

  const netProfit = Number(settlement?.profit ?? 0);

  // Past events for comparison
  const { data: pastEvents } = await admin
    .from("events")
    .select("id")
    .eq("collective_id", event.collective_id)
    .eq("status", "completed")
    .neq("id", eventId);

  let avgPastSellThrough = 0;
  if (pastEvents && pastEvents.length > 0) {
    // Simplified — just compare ticket count
    const pastEventIds = pastEvents.map((e) => e.id);
    const { count: pastTicketCount } = await admin
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .in("event_id", pastEventIds)
      .in("status", ["paid", "checked_in"]);

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

Event: "${event.title}" at ${venue ? `${venue.name}, ${venue.city}` : "N/A"}
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
    } catch {
      // JSON parse failed — keep rule-based insights only
      console.error("Failed to parse AI recap response");
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
        venue: venue ? `${venue.name}, ${venue.city}` : "N/A",
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
}
