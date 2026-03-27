"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SalesPatterns {
  bestDayToPost: string;
  bestHourToPost: number;
  avgDaysBeforeEvent: number;
  salesByDay: Record<string, number>;
  salesByHour: Record<string, number>;
}

export interface PromoScheduleItem {
  date: string;
  label: string;
  suggestedContent: string;
  optimalPostingTime: string;
}

export interface AudienceInsights {
  totalUniqueAttendees: number;
  repeatRate: number;
  avgTicketPrice: number;
  topCities: { city: string; count: number }[];
  growthTrend: { eventTitle: string; date: string; attendees: number }[];
}

// ─── 1. analyzeTicketSalesPatterns ───────────────────────────────────────────

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export async function analyzeTicketSalesPatterns(
  collectiveId: string
): Promise<{ error: string | null; data: SalesPatterns | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in.", data: null };
  }

  const admin = createAdminClient();

  // Get all events for this collective
  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("id, starts_at")
    .eq("collective_id", collectiveId);

  if (eventsError || !events || events.length === 0) {
    return { error: "No events found for this collective.", data: null };
  }

  const eventIds = events.map((e) => e.id);
  const eventStartMap = new Map(events.map((e) => [e.id, e.starts_at]));

  // Get all paid/checked-in tickets for these events
  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, event_id, created_at")
    .in("event_id", eventIds)
    .in("status", ["paid", "checked_in"]);

  if (ticketsError) {
    return { error: `Failed to fetch tickets: ${ticketsError.message}`, data: null };
  }

  if (!tickets || tickets.length === 0) {
    return { error: "No ticket sales data yet.", data: null };
  }

  // Initialize day and hour counters
  const salesByDay: Record<string, number> = {};
  const salesByHour: Record<string, number> = {};
  for (const day of DAY_NAMES) salesByDay[day] = 0;
  for (let h = 0; h < 24; h++) salesByHour[String(h)] = 0;

  let totalDaysBefore = 0;
  let countWithEventDate = 0;

  for (const ticket of tickets) {
    const purchaseDate = new Date(ticket.created_at);

    // Day of week distribution
    const dayName = DAY_NAMES[purchaseDate.getUTCDay()];
    salesByDay[dayName] = (salesByDay[dayName] ?? 0) + 1;

    // Hour of day distribution
    const hour = purchaseDate.getUTCHours();
    salesByHour[String(hour)] = (salesByHour[String(hour)] ?? 0) + 1;

    // Days before event
    const eventStart = eventStartMap.get(ticket.event_id);
    if (eventStart) {
      const eventDate = new Date(eventStart);
      const diffMs = eventDate.getTime() - purchaseDate.getTime();
      const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      totalDaysBefore += diffDays;
      countWithEventDate++;
    }
  }

  // Find best day and best hour
  const bestDayToPost = Object.entries(salesByDay).sort(
    (a, b) => b[1] - a[1]
  )[0][0];

  const bestHourToPost = Number(
    Object.entries(salesByHour).sort((a, b) => b[1] - a[1])[0][0]
  );

  const avgDaysBeforeEvent =
    countWithEventDate > 0
      ? Math.round(totalDaysBefore / countWithEventDate)
      : 0;

  return {
    error: null,
    data: {
      bestDayToPost,
      bestHourToPost,
      avgDaysBeforeEvent,
      salesByDay,
      salesByHour,
    },
  };
}

// ─── 2. generatePromoSchedule ───────────────────────────────────────────────

export async function generatePromoSchedule(
  eventId: string
): Promise<{ error: string | null; data: PromoScheduleItem[] | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in.", data: null };
  }

  const admin = createAdminClient();

  // Get the event details
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, title, starts_at, collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return { error: "Event not found.", data: null };
  }

  // Get sales patterns for optimal posting time
  const patternsResult = await analyzeTicketSalesPatterns(event.collective_id);
  const bestHour = patternsResult.data?.bestHourToPost ?? 19; // default 7 PM
  const bestDay = patternsResult.data?.bestDayToPost ?? "Thursday";

  const eventDate = new Date(event.starts_at);
  const now = new Date();

  // Format time helper
  const formatHour = (h: number): string => {
    const period = h >= 12 ? "PM" : "AM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${period}`;
  };

  const optimalTime = `${bestDay}s at ${formatHour(bestHour)}`;

  // Build the schedule milestones
  const milestones: {
    daysOut: number;
    label: string;
    suggestedContent: string;
  }[] = [
    {
      daysOut: 28,
      label: "4 weeks out: Announce event, share lineup",
      suggestedContent: `We're back. ${event.title} is officially on. Save the date, share with your crew. Lineup dropping soon.`,
    },
    {
      daysOut: 14,
      label: "2 weeks out: Push early bird, share behind-the-scenes",
      suggestedContent: `Early bird tickets for ${event.title} are moving fast. Grab yours before they're gone. Peek behind the scenes in our story.`,
    },
    {
      daysOut: 7,
      label: "1 week out: Urgency push, limited tickets",
      suggestedContent: `One week until ${event.title}. Limited tickets remaining. Don't be the one watching stories from home.`,
    },
    {
      daysOut: 3,
      label: "3 days out: Final push, share attendee count",
      suggestedContent: `${event.title} is almost here. The guest list is stacked. Last chance to lock in your spot.`,
    },
    {
      daysOut: 0,
      label: "Day of: Last chance, share lineup times",
      suggestedContent: `Tonight. ${event.title}. Doors open soon. See you there. Tag your crew.`,
    },
  ];

  const schedule: PromoScheduleItem[] = [];

  for (const m of milestones) {
    const postDate = new Date(eventDate);
    postDate.setDate(postDate.getDate() - m.daysOut);

    // Only include future dates
    if (postDate >= now || m.daysOut === 0) {
      schedule.push({
        date: postDate.toISOString().slice(0, 10),
        label: m.label,
        suggestedContent: m.suggestedContent,
        optimalPostingTime: optimalTime,
      });
    }
  }

  // If no milestones are in the future (event is very soon), include at least the day-of
  if (schedule.length === 0) {
    schedule.push({
      date: eventDate.toISOString().slice(0, 10),
      label: "Day of: Last chance, share lineup times",
      suggestedContent: `Tonight. ${event.title}. Doors open soon. See you there. Tag your crew.`,
      optimalPostingTime: optimalTime,
    });
  }

  return { error: null, data: schedule };
}

// ─── 3. getAudienceInsights ─────────────────────────────────────────────────

export async function getAudienceInsights(
  collectiveId: string
): Promise<{ error: string | null; data: AudienceInsights | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in.", data: null };
  }

  const admin = createAdminClient();

  // Get all events for this collective, ordered by date
  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("id, title, starts_at")
    .eq("collective_id", collectiveId)
    .order("starts_at", { ascending: true });

  if (eventsError || !events || events.length === 0) {
    return { error: "No events found for this collective.", data: null };
  }

  const eventIds = events.map((e) => e.id);
  const eventMap = new Map(events.map((e) => [e.id, e]));

  // Get all paid/checked-in tickets
  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, event_id, price_paid, metadata, created_at")
    .in("event_id", eventIds)
    .in("status", ["paid", "checked_in"]);

  if (ticketsError) {
    return {
      error: `Failed to fetch tickets: ${ticketsError.message}`,
      data: null,
    };
  }

  if (!tickets || tickets.length === 0) {
    return {
      error: null,
      data: {
        totalUniqueAttendees: 0,
        repeatRate: 0,
        avgTicketPrice: 0,
        topCities: [],
        growthTrend: [],
      },
    };
  }

  // Group by email to find unique attendees and repeat rate
  const emailEventMap = new Map<string, Set<string>>();
  const cityCount = new Map<string, number>();
  let totalPricePaid = 0;
  let ticketWithPrice = 0;

  // Track attendees per event
  const eventAttendeeCount = new Map<string, number>();

  for (const ticket of tickets) {
    const meta = ticket.metadata as Record<string, unknown> | null;
    const email =
      (meta?.customer_email as string) ||
      (meta?.buyer_email as string) ||
      null;

    // Count per event
    eventAttendeeCount.set(
      ticket.event_id,
      (eventAttendeeCount.get(ticket.event_id) ?? 0) + 1
    );

    // Price tracking
    const price = Number(ticket.price_paid) || 0;
    if (price > 0) {
      totalPricePaid += price;
      ticketWithPrice++;
    }

    if (!email) continue;
    const normalized = email.toLowerCase().trim();

    if (!emailEventMap.has(normalized)) {
      emailEventMap.set(normalized, new Set());
    }
    emailEventMap.get(normalized)!.add(ticket.event_id);

    // City from metadata (if available)
    const city = (meta?.city as string) || (meta?.customer_city as string);
    if (city) {
      const normalizedCity = city.trim();
      cityCount.set(normalizedCity, (cityCount.get(normalizedCity) ?? 0) + 1);
    }
  }

  const totalUniqueAttendees = emailEventMap.size;
  const repeatAttendees = Array.from(emailEventMap.values()).filter(
    (evts) => evts.size >= 2
  ).length;
  const repeatRate =
    totalUniqueAttendees > 0
      ? Math.round((repeatAttendees / totalUniqueAttendees) * 100)
      : 0;

  const avgTicketPrice =
    ticketWithPrice > 0
      ? Math.round((totalPricePaid / ticketWithPrice) * 100) / 100
      : 0;

  // Top 5 cities
  const topCities = Array.from(cityCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city, count]) => ({ city, count }));

  // Growth trend — attendees per event over time
  const growthTrend = events.map((e) => ({
    eventTitle: e.title,
    date: e.starts_at,
    attendees: eventAttendeeCount.get(e.id) ?? 0,
  }));

  return {
    error: null,
    data: {
      totalUniqueAttendees,
      repeatRate,
      avgTicketPrice,
      topCities,
      growthTrend,
    },
  };
}
