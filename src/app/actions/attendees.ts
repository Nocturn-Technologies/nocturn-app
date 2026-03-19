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

export interface AttendeeRow {
  email: string;
  totalEvents: number;
  totalSpent: number;
  ticketCount: number;
  firstEventDate: string;
  lastEventDate: string;
  eventTitles: string[];
}

export interface AttendeeStats {
  totalAttendees: number;
  repeatAttendees: number;
  totalRevenue: number;
}

async function getCollectiveIds(userId: string) {
  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId)
    .is("deleted_at", null);

  return memberships?.map((m) => m.collective_id) ?? [];
}

export async function getAttendees(collectiveId?: string): Promise<{
  error: string | null;
  attendees: AttendeeRow[];
  stats: AttendeeStats;
}> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "You must be logged in.",
      attendees: [],
      stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
    };
  }

  const admin = createAdminClient();

  // Get user's collectives
  const collectiveIds = collectiveId
    ? [collectiveId]
    : await getCollectiveIds(user.id);

  if (collectiveIds.length === 0) {
    return {
      error: null,
      attendees: [],
      stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
    };
  }

  // Get all events for these collectives
  const { data: events } = await admin
    .from("events")
    .select("id, title, starts_at")
    .in("collective_id", collectiveIds);

  if (!events || events.length === 0) {
    return {
      error: null,
      attendees: [],
      stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
    };
  }

  const eventIds = events.map((e) => e.id);
  const eventMap = new Map(events.map((e) => [e.id, e]));

  // Get all paid/checked-in tickets for these events
  const { data: tickets, error: ticketError } = await admin
    .from("tickets")
    .select("id, event_id, price_paid, metadata, created_at")
    .in("event_id", eventIds)
    .in("status", ["paid", "checked_in"]);

  if (ticketError) {
    return {
      error: `Failed to fetch tickets: ${ticketError.message}`,
      attendees: [],
      stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
    };
  }

  // Group tickets by customer email
  const emailMap = new Map<
    string,
    {
      events: Set<string>;
      totalSpent: number;
      ticketCount: number;
      dates: string[];
      eventTitles: Set<string>;
    }
  >();

  for (const ticket of tickets ?? []) {
    const meta = ticket.metadata as Record<string, unknown> | null;
    const email =
      (meta?.customer_email as string) ||
      (meta?.buyer_email as string) ||
      null;

    if (!email) continue;

    const normalized = email.toLowerCase().trim();

    if (!emailMap.has(normalized)) {
      emailMap.set(normalized, {
        events: new Set(),
        totalSpent: 0,
        ticketCount: 0,
        dates: [],
        eventTitles: new Set(),
      });
    }

    const entry = emailMap.get(normalized)!;
    entry.events.add(ticket.event_id);
    entry.totalSpent += Number(ticket.price_paid) || 0;
    entry.ticketCount += 1;

    const event = eventMap.get(ticket.event_id);
    if (event) {
      entry.dates.push(event.starts_at);
      entry.eventTitles.add(event.title);
    }
  }

  // Build attendee rows sorted by total spent descending
  const attendees: AttendeeRow[] = Array.from(emailMap.entries())
    .map(([email, data]) => {
      const sortedDates = data.dates.sort();
      return {
        email,
        totalEvents: data.events.size,
        totalSpent: data.totalSpent,
        ticketCount: data.ticketCount,
        firstEventDate: sortedDates[0] ?? "",
        lastEventDate: sortedDates[sortedDates.length - 1] ?? "",
        eventTitles: Array.from(data.eventTitles),
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const stats: AttendeeStats = {
    totalAttendees: attendees.length,
    repeatAttendees: attendees.filter((a) => a.totalEvents >= 2).length,
    totalRevenue: attendees.reduce((sum, a) => sum + a.totalSpent, 0),
  };

  return { error: null, attendees, stats };
}

export async function exportAttendeesCSV(collectiveId?: string): Promise<{
  error: string | null;
  csv: string;
}> {
  const result = await getAttendees(collectiveId);

  if (result.error) {
    return { error: result.error, csv: "" };
  }

  const headers = [
    "Email",
    "Events Attended",
    "Total Tickets",
    "Total Spent",
    "First Event Date",
    "Last Event Date",
    "Events",
  ];

  const rows = result.attendees.map((a) => [
    a.email,
    a.totalEvents.toString(),
    a.ticketCount.toString(),
    `$${a.totalSpent.toFixed(2)}`,
    a.firstEventDate
      ? new Date(a.firstEventDate).toLocaleDateString("en-US")
      : "",
    a.lastEventDate
      ? new Date(a.lastEventDate).toLocaleDateString("en-US")
      : "",
    `"${a.eventTitles.join(", ")}"`,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return { error: null, csv };
}
