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
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Only show performance data for the viewer's own collective — prevents privacy leaks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membership } = await (admin.from("collective_members") as any)
    .select("collective_id")
    .eq("user_id", user.id)
    .in("role", ["admin", "owner"])
    .limit(1)
    .maybeSingle();

  if (!membership) return null;
  const collectiveId = (membership as { collective_id: string }).collective_id;

  // Find artist record linked to this profile user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: artist } = await (admin.from("artists") as any)
    .select("id")
    .eq("user_id", profileUserId)
    .maybeSingle();

  if (!artist) return null;
  const artistId = (artist as { id: string }).id;

  // Get collective's events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (admin.from("events") as any)
    .select("id")
    .eq("collective_id", collectiveId);

  if (!events || (events as { id: string }[]).length === 0) return null;
  const eventIds = (events as { id: string }[]).map((e) => e.id);

  // Get bookings for this artist at these events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bookings } = await (admin.from("event_artists") as any)
    .select("event_id, events(starts_at, title)")
    .eq("artist_id", artistId)
    .in("event_id", eventIds)
    .neq("status", "cancelled");

  if (!bookings || (bookings as unknown[]).length === 0) return null;

  // Get tickets for those events
  const bookedEventIds = [
    ...new Set(
      (bookings as { event_id: string }[]).map((b) => b.event_id)
    ),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tickets } = await (admin.from("tickets") as any)
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
        new Date(b.events!.starts_at).getTime() -
        new Date(a.events!.starts_at).getTime()
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
}

export async function getMarketplaceInquiryCount(): Promise<number> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const admin = createAdminClient();

  // Get user's marketplace profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin.from("marketplace_profiles") as any)
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return 0;

  // Count inquiries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (admin.from("marketplace_inquiries") as any)
    .select("*", { count: "exact", head: true })
    .eq("to_profile_id", (profile as { id: string }).id);

  return (count ?? 0) as number;
}
