"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export interface ArtistPerformance {
  artistId: string;
  artistName: string;
  genre: string[];
  instagram: string | null;
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
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in", artists: [], avgTicketsAcrossAll: 0 };

  const admin = createAdminClient();

  // Get user's active collective
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membership } = await (admin.from("collective_members") as any)
    .select("collective_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "No collective found", artists: [], avgTicketsAcrossAll: 0 };
  const collectiveId = (membership as { collective_id: string }).collective_id;

  // Get all events for this collective (include metadata for external ticket data)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (admin.from("events") as any)
    .select("id, metadata")
    .eq("collective_id", collectiveId);

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

  // Get all artist bookings for these events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bookings } = await (admin.from("event_artists") as any)
    .select("artist_id, event_id, created_at, artists(id, name, genre, instagram, metadata), events(starts_at)")
    .in("event_id", eventIds)
    .neq("status", "cancelled");

  if (!bookings || (bookings as unknown[]).length === 0) {
    return { error: null, artists: [], avgTicketsAcrossAll: 0 };
  }

  // Get all tickets for these events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tickets } = await (admin.from("tickets") as any)
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

  // Group bookings by artist
  interface BookingRow {
    artist_id: string;
    event_id: string;
    artists: { id: string; name: string; genre: string[] | null; instagram: string | null; metadata: { location?: string } | null } | null;
    events: { starts_at: string } | null;
  }

  const artistMap = new Map<string, {
    name: string;
    genre: string[];
    instagram: string | null;
    location: string | null;
    eventIds: Set<string>;
    lastBookedDate: string | null;
  }>();

  for (const b of bookings as BookingRow[]) {
    if (!b.artists) continue;
    const existing = artistMap.get(b.artist_id);
    const startsAt = b.events?.starts_at ?? null;

    if (existing) {
      existing.eventIds.add(b.event_id);
      if (startsAt && (!existing.lastBookedDate || startsAt > existing.lastBookedDate)) {
        existing.lastBookedDate = startsAt;
      }
    } else {
      artistMap.set(b.artist_id, {
        name: b.artists.name,
        genre: b.artists.genre ?? [],
        instagram: b.artists.instagram,
        location: (b.artists.metadata as { location?: string })?.location ?? null,
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
      instagram: data.instagram,
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
}
