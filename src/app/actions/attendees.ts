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
  // Fan source: "ticket" (bought a ticket)
  source: "ticket";
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
    const { data: eventsRaw, error: eventsError } = await admin
      .from("events")
      .select("id, title, starts_at")
      .in("collective_id", collectiveIds);

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

    // Fetch attendee_profiles for these collectives. Revenue (total_spend) is
    // already pre-aggregated on the profile row; we also join orders for a
    // per-event breakdown when needed. For the list view we use the profile
    // aggregates directly to avoid an expensive per-attendee orders scan.
    const targetCollectiveIds = collectiveId ? [collectiveId] : collectiveIds;

    type ProfileRow = {
      id: string;
      email: string | null;
      full_name: string | null;
      party_id: string | null;
      collective_id: string;
      total_events: number;
      total_spend: number;
      total_tickets: number;
      first_seen_at: string | null;
      last_seen_at: string | null;
    };

    const BATCH_SIZE = 5000;
    const allProfiles: ProfileRow[] = [];
    for (let offset = 0; ; offset += BATCH_SIZE) {
      const { data: batch, error: batchErr } = await admin
        .from("attendee_profiles")
        .select("id, email, full_name, party_id, collective_id, total_events, total_spend, total_tickets, first_seen_at, last_seen_at")
        .in("collective_id", targetCollectiveIds)
        .range(offset, offset + BATCH_SIZE - 1);

      if (batchErr) {
        console.error("[getAttendees] attendee_profiles batch error:", batchErr.message);
        return {
          error: "Failed to fetch attendees",
          attendees: [],
          stats: { totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 },
        };
      }
      if (!batch || batch.length === 0) break;
      allProfiles.push(...(batch as ProfileRow[]));
      if (batch.length < BATCH_SIZE) break;
    }

    // For event title lists, fetch tickets per party to find which events they attended
    // Only fetch if we have profiles — skip if empty
    let partyEventMap = new Map<string, Set<string>>();
    if (allProfiles.length > 0) {
      const partyIds = allProfiles
        .map((p) => p.party_id)
        .filter((pid): pid is string => !!pid);

      if (partyIds.length > 0) {
        type TicketPartyRow = { event_id: string; holder_party_id: string | null };
        const allTickets: TicketPartyRow[] = [];
        for (let offset = 0; ; offset += BATCH_SIZE) {
          const { data: batch, error: tErr } = await admin
            .from("tickets")
            .select("event_id, holder_party_id")
            .in("event_id", eventIds)
            .in("holder_party_id", partyIds)
            .in("status", ["paid", "checked_in"])
            .range(offset, offset + BATCH_SIZE - 1);

          if (tErr) {
            console.warn("[getAttendees] tickets batch error:", tErr.message);
            break;
          }
          if (!batch || batch.length === 0) break;
          allTickets.push(...(batch as TicketPartyRow[]));
          if (batch.length < BATCH_SIZE) break;
        }

        for (const t of allTickets) {
          if (!t.holder_party_id) continue;
          if (!partyEventMap.has(t.holder_party_id)) {
            partyEventMap.set(t.holder_party_id, new Set());
          }
          partyEventMap.get(t.holder_party_id)!.add(t.event_id);
        }
      }
    }

    // Build attendee rows from profiles
    const attendees: AttendeeRow[] = allProfiles
      .filter((p) => p.email)
      .map((p) => {
        const eventTitleSet = new Set<string>();
        if (p.party_id) {
          const attendedEventIds = partyEventMap.get(p.party_id) ?? new Set<string>();
          for (const eid of attendedEventIds) {
            const ev = eventMap.get(eid);
            if (ev) eventTitleSet.add(ev.title);
          }
        }

        return {
          email: p.email!,
          name: p.full_name ?? "",
          totalEvents: p.total_events,
          totalSpent: Number(p.total_spend) || 0,
          ticketCount: p.total_tickets,
          firstEventDate: p.first_seen_at ?? "",
          lastEventDate: p.last_seen_at ?? "",
          eventTitles: Array.from(eventTitleSet),
          source: "ticket" as const,
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
