"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export interface AttendeeRow {
  email: string;
  name: string;
  totalEvents: number;
  totalSpent: number;
  ticketCount: number;
  firstEventDate: string;
  lastEventDate: string;
  eventTitles: string[];
  // Fan source: "ticket" (bought), "rsvp" (RSVP'd only), or "both"
  source: "ticket" | "rsvp" | "both";
}

export interface AttendeeStats {
  totalAttendees: number;
  repeatAttendees: number;
  totalRevenue: number;
}

async function getCollectiveIds(userId: string) {
  try {
    const admin = createAdminClient();
    const { data: memberships, error } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) {
      console.error("[getCollectiveIds] query error:", error.message);
      return [];
    }

    return (memberships as { collective_id: string }[] | null)?.map((m) => m.collective_id) ?? [];
  } catch (err) {
    console.error("[getCollectiveIds] Unexpected error:", err);
    return [];
  }
}

export async function getAttendees(collectiveId?: string): Promise<{
  error: string | null;
  attendees: AttendeeRow[];
  stats: AttendeeStats;
}> {
  try {
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

    // If explicit collectiveId provided, verify membership
    if (collectiveId) {
      const { count: memberCount } = await admin
        .from("collective_members")
        .select("*", { count: "exact", head: true })
        .eq("collective_id", collectiveId)
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (!memberCount || memberCount === 0) {
        return {
          error: "Not a member of this collective",
          attendees: [],
          stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
        };
      }
    }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: eventsRaw, error: eventsError } = await admin
      .from("events")
      .select("id, title, starts_at")
      .in("collective_id", collectiveIds)
      .is("deleted_at", null);

    if (eventsError) {
      console.error("[getAttendees] events query error:", eventsError.message);
      return {
        error: "Failed to load events",
        attendees: [],
        stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
      };
    }
    const events = eventsRaw as { id: string; title: string; starts_at: string }[] | null;

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
    // Fetch in batches of 5000 to avoid single-query memory pressure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTickets: { id: string; event_id: string; price_paid: number | null; metadata: Record<string, unknown> | null; created_at: string }[] = [];
    let ticketError: unknown = null;
    const BATCH_SIZE = 5000;
    for (let offset = 0; ; offset += BATCH_SIZE) {
      const { data: batch, error: batchError } = await admin
        .from("tickets")
        .select("id, event_id, price_paid, metadata, created_at")
        .in("event_id", eventIds)
        .in("status", ["paid", "checked_in"])
        .range(offset, offset + BATCH_SIZE - 1);
      if (batchError) { ticketError = batchError; break; }
      if (!batch || batch.length === 0) break;
      allTickets.push(...(batch as typeof allTickets));
      if (batch.length < BATCH_SIZE) break; // last page
    }
    const ticketsRaw = allTickets;
    const tickets = ticketsRaw as { id: string; event_id: string; price_paid: number | null; metadata: Record<string, unknown> | null; created_at: string }[] | null;

    if (ticketError) {
      return {
        error: "Failed to fetch tickets",
        attendees: [],
        stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
      };
    }

    // Group tickets + RSVPs by customer email. RSVPs = fans too, per the
    // unified-CRM rule, so "yes" / "maybe" RSVPs roll into the same view as
    // ticket buyers. RSVPs don't contribute to spend or ticket counts, but
    // they do count toward events attended and show up in the list.
    const emailMap = new Map<
      string,
      {
        name: string;
        events: Set<string>;
        totalSpent: number;
        ticketCount: number;
        dates: string[];
        eventTitles: Set<string>;
        hasTicket: boolean;
        hasRsvp: boolean;
      }
    >();

    function ensureEntry(normalizedEmail: string) {
      if (!emailMap.has(normalizedEmail)) {
        emailMap.set(normalizedEmail, {
          name: "",
          events: new Set(),
          totalSpent: 0,
          ticketCount: 0,
          dates: [],
          eventTitles: new Set(),
          hasTicket: false,
          hasRsvp: false,
        });
      }
      return emailMap.get(normalizedEmail)!;
    }

    for (const ticket of tickets ?? []) {
      const meta = ticket.metadata as Record<string, unknown> | null;
      const email =
        (meta?.customer_email as string) ||
        (meta?.buyer_email as string) ||
        null;

      if (!email) continue;

      const normalized = email.toLowerCase().trim();
      const name = (meta?.customer_name ?? meta?.buyer_name ?? meta?.full_name ?? "") as string;

      const entry = ensureEntry(normalized);
      // Keep the first non-empty name we find
      if (!entry.name && name) {
        entry.name = name;
      }
      entry.events.add(ticket.event_id);
      entry.totalSpent += Number(ticket.price_paid) || 0;
      entry.ticketCount += 1;
      entry.hasTicket = true;

      const event = eventMap.get(ticket.event_id);
      if (event) {
        entry.dates.push(event.starts_at);
        entry.eventTitles.add(event.title);
      }
    }

    // Merge RSVPs (yes/maybe only) into the same map. This is the "backend
    // reuse" wire — RSVP fans appear alongside ticket buyers without a
    // separate page or export.
    const allRsvps: { event_id: string; email: string | null; full_name: string | null }[] = [];
    for (let offset = 0; ; offset += BATCH_SIZE) {
      const { data: batch, error: rsvpBatchError } = await admin
        .from("rsvps")
        .select("event_id, email, full_name")
        .in("event_id", eventIds)
        .in("status", ["yes", "maybe"])
        .not("email", "is", null)
        .range(offset, offset + BATCH_SIZE - 1);
      if (rsvpBatchError) {
        console.warn("[getAttendees] rsvp batch error:", rsvpBatchError.message);
        break;
      }
      if (!batch || batch.length === 0) break;
      allRsvps.push(...(batch as typeof allRsvps));
      if (batch.length < BATCH_SIZE) break;
    }

    for (const rsvp of allRsvps) {
      if (!rsvp.email) continue;
      const normalized = rsvp.email.toLowerCase().trim();
      if (!normalized) continue;

      const entry = ensureEntry(normalized);
      if (!entry.name && rsvp.full_name) {
        entry.name = rsvp.full_name;
      }
      entry.events.add(rsvp.event_id);
      entry.hasRsvp = true;

      const event = eventMap.get(rsvp.event_id);
      if (event) {
        entry.dates.push(event.starts_at);
        entry.eventTitles.add(event.title);
      }
    }

    // Build attendee rows sorted by total spent descending (ticket buyers
    // naturally rise to the top; RSVP-only fans with $0 spend fall below).
    const attendees: AttendeeRow[] = Array.from(emailMap.entries())
      .map(([email, data]) => {
        const sortedDates = data.dates.sort();
        const source: AttendeeRow["source"] =
          data.hasTicket && data.hasRsvp
            ? "both"
            : data.hasTicket
              ? "ticket"
              : "rsvp";
        return {
          email,
          name: data.name,
          totalEvents: data.events.size,
          totalSpent: data.totalSpent,
          ticketCount: data.ticketCount,
          firstEventDate: sortedDates[0] ?? "",
          lastEventDate: sortedDates[sortedDates.length - 1] ?? "",
          eventTitles: Array.from(data.eventTitles),
          source,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);

    const stats: AttendeeStats = {
      totalAttendees: attendees.length,
      repeatAttendees: attendees.filter((a) => a.totalEvents >= 2).length,
      totalRevenue: attendees.reduce((sum, a) => sum + a.totalSpent, 0),
    };

    return { error: null, attendees, stats };
  } catch (err) {
    console.error("[getAttendees]", err);
    return {
      error: "Something went wrong",
      attendees: [],
      stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
    };
  }
}

export async function exportAttendeesCSV(collectiveId?: string): Promise<{
  error: string | null;
  csv: string;
}> {
  try {
    const result = await getAttendees(collectiveId);

    if (result.error) {
      return { error: result.error, csv: "" };
    }

    // Sanitize CSV fields to prevent formula injection
    // TODO(audit): prefix CSV cells starting with =/+/-/@ to prevent Excel formula injection
    function csvSafe(field: string): string {
      const escaped = field.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    const headers = [
      "Name",
      "Email",
      "Source",
      "Events Attended",
      "Total Tickets",
      "Total Spent",
      "First Event Date",
      "Last Event Date",
      "Events",
    ];

    const rows = result.attendees.map((a) => [
      csvSafe(a.name),
      csvSafe(a.email),
      csvSafe(a.source),
      csvSafe(a.totalEvents.toString()),
      csvSafe(a.ticketCount.toString()),
      csvSafe(`$${a.totalSpent.toFixed(2)}`),
      csvSafe(
        a.firstEventDate
          ? new Date(a.firstEventDate).toLocaleDateString("en-US")
          : ""
      ),
      csvSafe(
        a.lastEventDate
          ? new Date(a.lastEventDate).toLocaleDateString("en-US")
          : ""
      ),
      csvSafe(a.eventTitles.join(", ")),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return { error: null, csv };
  } catch (err) {
    console.error("[exportAttendeesCSV]", err);
    return { error: "Something went wrong", csv: "" };
  }
}
