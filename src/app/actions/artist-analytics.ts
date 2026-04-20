"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export interface ArtistPerformance {
  artistId: string;
  artistName: string;
  genre: string[];
  location: string | null;
  totalEvents: number;
  totalTicketsSold: number;
  avgTicketsPerEvent: number;
  lastBookedDate: string | null;
  daysSinceLastBooking: number | null;
  suggestForNext: boolean;
}

export async function getArtistPerformanceAnalytics(): Promise<{
  error: string | null;
  artists: ArtistPerformance[];
  avgTicketsAcrossAll: number;
}> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", artists: [], avgTicketsAcrossAll: 0 };

    const admin = createAdminClient();

    // Get user's active collective
    const { data: membership, error: membershipError } = await admin.from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      console.error("[getArtistPerformanceAnalytics] membership lookup failed:", membershipError);
      return { error: "Something went wrong", artists: [], avgTicketsAcrossAll: 0 };
    }
    if (!membership) return { error: "No collective found", artists: [], avgTicketsAcrossAll: 0 };
    const collectiveId = (membership as { collective_id: string }).collective_id;

    // Get all events for this collective (include metadata for external ticket data)
    const { data: events, error: eventsError } = await admin.from("events")
      .select("id, metadata")
      .eq("collective_id", collectiveId);

    if (eventsError) {
      console.error("[getArtistPerformanceAnalytics] events lookup failed:", eventsError);
      return { error: "Something went wrong", artists: [], avgTicketsAcrossAll: 0 };
    }

    if (!events || (events as { id: string }[]).length === 0) {
      return { error: null, artists: [], avgTicketsAcrossAll: 0 };
    }

    const eventIds = (events as { id: string; metadata: Record<string, unknown> | null }[]).map((e) => e.id);

    // Build external ticket counts from event metadata
    const externalTicketsByEvent: Record<string, number> = {};
    for (const e of events as { id: string; metadata: Record<string, unknown> | null }[]) {
      const ext = e.metadata?.external_tickets as { tickets_sold?: number } | undefined;
      if (ext?.tickets_sold) {
        externalTicketsByEvent[e.id] = ext.tickets_sold;
      }
    }

    // Get all artist bookings for these events.
    // event_artists now links via party_id → parties (display_name).
    // Genre comes from artist_profiles joined on the same party_id.
    const { data: bookings } = await admin.from("event_artists")
      .select("party_id, event_id, created_at, parties(id, display_name), events(starts_at)")
      .in("event_id", eventIds)
      .not("party_id", "is", null);

    if (!bookings || (bookings as unknown[]).length === 0) {
      return { error: null, artists: [], avgTicketsAcrossAll: 0 };
    }

    // Collect unique party_ids to look up artist_profiles in one query
    const partyIds = [...new Set(
      (bookings as { party_id: string | null }[])
        .map((b) => b.party_id)
        .filter((id): id is string => id !== null)
    )];

    const { data: artistProfilesRaw } = await admin.from("artist_profiles")
      .select("party_id, genre")
      .in("party_id", partyIds);
    const genreByParty = new Map<string, string[]>();
    for (const ap of (artistProfilesRaw ?? []) as { party_id: string; genre: string[] | null }[]) {
      genreByParty.set(ap.party_id, ap.genre ?? []);
    }

    // Get all tickets for these events
    const { data: tickets } = await admin.from("tickets")
      .select("id, event_id")
      .in("event_id", eventIds)
      .neq("status", "refunded");

    // Count tickets per event (Nocturn tickets + external)
    const ticketsByEvent: Record<string, number> = {};
    for (const t of (tickets ?? []) as { id: string; event_id: string }[]) {
      ticketsByEvent[t.event_id] = (ticketsByEvent[t.event_id] || 0) + 1;
    }
    // Merge in external ticket counts
    for (const [eid, count] of Object.entries(externalTicketsByEvent)) {
      ticketsByEvent[eid] = (ticketsByEvent[eid] || 0) + count;
    }

    // Group bookings by party_id (one entry per artist-party)
    interface BookingRow {
      party_id: string | null;
      event_id: string;
      parties: { id: string; display_name: string } | null;
      events: { starts_at: string } | null;
    }

    const artistMap = new Map<string, {
      name: string;
      genre: string[];
      location: string | null;
      eventIds: Set<string>;
      lastBookedDate: string | null;
    }>();

    for (const b of bookings as BookingRow[]) {
      if (!b.party_id || !b.parties) continue;
      const existing = artistMap.get(b.party_id);
      const startsAt = b.events?.starts_at ?? null;

      if (existing) {
        existing.eventIds.add(b.event_id);
        if (startsAt && (!existing.lastBookedDate || startsAt > existing.lastBookedDate)) {
          existing.lastBookedDate = startsAt;
        }
      } else {
        artistMap.set(b.party_id, {
          name: b.parties.display_name,
          genre: genreByParty.get(b.party_id) ?? [],
          location: null,
          eventIds: new Set([b.event_id]),
          lastBookedDate: startsAt,
        });
      }
    }

    // Build performance data
    const now = Date.now();
    const results: ArtistPerformance[] = [];
    let totalTicketsSum = 0;
    let totalArtistCount = 0;

    for (const [artistId, data] of artistMap) {
      const totalEvents = data.eventIds.size;
      let totalTicketsSold = 0;
      for (const eid of data.eventIds) {
        totalTicketsSold += ticketsByEvent[eid] || 0;
      }
      const avgTicketsPerEvent = totalEvents > 0 ? Math.round(totalTicketsSold / totalEvents) : 0;

      let daysSinceLastBooking: number | null = null;
      if (data.lastBookedDate) {
        daysSinceLastBooking = Math.floor((now - new Date(data.lastBookedDate).getTime()) / (1000 * 60 * 60 * 24));
      }

      totalTicketsSum += totalTicketsSold;
      totalArtistCount++;

      results.push({
        artistId,
        artistName: data.name,
        genre: data.genre,
        location: data.location,
        totalEvents,
        totalTicketsSold,
        avgTicketsPerEvent,
        lastBookedDate: data.lastBookedDate,
        daysSinceLastBooking,
        suggestForNext: false, // calculated below
      });
    }

    // Calculate average tickets across all artists and mark suggestions
    const avgTicketsAcrossAll = totalArtistCount > 0 ? Math.round(totalTicketsSum / totalArtistCount) : 0;

    for (const artist of results) {
      artist.suggestForNext =
        artist.totalTicketsSold > avgTicketsAcrossAll &&
        artist.daysSinceLastBooking !== null &&
        artist.daysSinceLastBooking >= 90;
    }

    // Default sort: total tickets sold desc
    results.sort((a, b) => b.totalTicketsSold - a.totalTicketsSold);

    return { error: null, artists: results, avgTicketsAcrossAll };
  } catch (err) {
    console.error("[getArtistPerformanceAnalytics]", err);
    return { error: "Something went wrong", artists: [], avgTicketsAcrossAll: 0 };
  }
}
