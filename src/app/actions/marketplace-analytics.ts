"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export interface ProfilePerformance {
  totalEvents: number;
  totalTickets: number;
  avgPerEvent: number;
  lastBooked: string | null;
  lastBookedTitle: string | null;
}

export async function getProfilePerformanceWithCollective(
  profileUserId: string
): Promise<ProfilePerformance | null> {
  try {
    if (!profileUserId || typeof profileUserId !== "string" || profileUserId.length > 100) {
      return null;
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdminClient();

    // Only show performance data for the viewer's own collective — prevents privacy leaks
    const { data: membership, error: membershipError } = await admin.from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .in("role", ["admin", "owner"])
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      console.error("[getProfilePerformanceWithCollective]", membershipError);
      return null;
    }
    if (!membership) return null;
    const collectiveId = (membership as { collective_id: string }).collective_id;

    // Find the party_id linked to the target user
    const { data: targetUser } = await admin.from("users")
      .select("party_id")
      .eq("id", profileUserId)
      .maybeSingle();

    if (!targetUser?.party_id) return null;
    const partyId = (targetUser as { party_id: string }).party_id;

    // Find artist_profile linked to this party
    const { data: artistProfile } = await admin.from("artist_profiles")
      .select("id")
      .eq("party_id", partyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!artistProfile) return null;

    // Get collective's events
    const { data: events } = await admin.from("events")
      .select("id")
      .eq("collective_id", collectiveId)
      .is("deleted_at", null);

    if (!events || (events as { id: string }[]).length === 0) return null;
    const eventIds = (events as { id: string }[]).map((e) => e.id);

    // Get bookings for this artist at these events via event_artists.party_id
    const { data: bookings } = await admin.from("event_artists")
      .select("event_id, events(starts_at, title)")
      .eq("party_id", partyId)
      .in("event_id", eventIds);

    if (!bookings || (bookings as unknown[]).length === 0) {
      return null;
    }

    // Get tickets for those events
    const bookedEventIds = [
      ...new Set(
        (bookings as { event_id: string }[]).map((b) => b.event_id)
      ),
    ];

    const { data: tickets } = await admin.from("tickets")
      .select("id, event_id")
      .in("event_id", bookedEventIds)
      .neq("status", "refunded");

    const ticketsByEvent: Record<string, number> = {};
    for (const t of (tickets ?? []) as { event_id: string }[]) {
      ticketsByEvent[t.event_id] = (ticketsByEvent[t.event_id] || 0) + 1;
    }

    const totalEvents = bookedEventIds.length;
    const totalTickets = Object.values(ticketsByEvent).reduce(
      (s, n) => s + n,
      0
    );
    const avgPerEvent =
      totalEvents > 0 ? Math.round(totalTickets / totalEvents) : 0;

    // Last booked
    const sortedBookings = (
      bookings as {
        events: { starts_at: string; title: string } | null;
      }[]
    )
      .filter((b) => b.events?.starts_at)
      .sort(
        (a, b) =>
          new Date(b.events?.starts_at ?? "").getTime() -
          new Date(a.events?.starts_at ?? "").getTime()
      );

    const lastBooked = sortedBookings[0]?.events?.starts_at ?? null;
    const lastBookedTitle = sortedBookings[0]?.events?.title ?? null;

    return {
      totalEvents,
      totalTickets,
      avgPerEvent,
      lastBooked,
      lastBookedTitle,
    };
  } catch (err) {
    console.error("[getProfilePerformanceWithCollective]", err);
    return null;
  }
}
