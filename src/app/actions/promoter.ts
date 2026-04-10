"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

interface PromoterEvent {
  eventId: string;
  title: string;
  startsAt: string;
  flyerUrl: string | null;
  collectiveSlug: string;
  eventSlug: string;
  ticketsSold: number;
}

interface BrowseEvent {
  eventId: string;
  title: string;
  startsAt: string;
  flyerUrl: string | null;
  collectiveSlug: string;
  eventSlug: string;
  venueName: string | null;
}

export interface PromoterDashboardData {
  stats: { totalTickets: number; totalEvents: number };
  myEvents: PromoterEvent[];
  browseEvents: BrowseEvent[];
}

export async function getPromoterDashboard(): Promise<PromoterDashboardData> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { stats: { totalTickets: 0, totalEvents: 0 }, myEvents: [], browseEvents: [] };

    const admin = createAdminClient();
    const userId = user.id;

    // Parallel: my referred tickets + upcoming published events for browsing
    const [{ data: referredTickets, error: referredError }, { data: upcomingEvents, error: upcomingError }] = await Promise.all([
      admin
        .from("tickets")
        .select("event_id, events(id, title, starts_at, flyer_url, slug, collectives(slug))")
        .eq("referred_by", userId)
        .in("status", ["paid", "checked_in"]),
      admin
        .from("events")
        .select("id, title, starts_at, flyer_url, slug, collective_id, collectives(slug), venues(name)")
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(20),
    ]);

    if (referredError) console.error("[getPromoterDashboard] Failed to fetch referred tickets:", referredError);
    if (upcomingError) console.error("[getPromoterDashboard] Failed to fetch upcoming events:", upcomingError);

    // Aggregate referred tickets by event
    const eventMap = new Map<string, PromoterEvent>();
    for (const ticket of (referredTickets ?? []) as unknown as {
      event_id: string;
      events: { id: string; title: string; starts_at: string; flyer_url: string | null; slug: string; collectives: { slug: string } | null } | null;
    }[]) {
      const ev = ticket.events;
      if (!ev) continue;
      const existing = eventMap.get(ev.id);
      if (existing) {
        existing.ticketsSold++;
      } else {
        eventMap.set(ev.id, {
          eventId: ev.id,
          title: ev.title,
          startsAt: ev.starts_at,
          flyerUrl: ev.flyer_url,
          collectiveSlug: ev.collectives?.slug ?? "",
          eventSlug: ev.slug,
          ticketsSold: 1,
        });
      }
    }

    const myEvents = Array.from(eventMap.values()).sort((a, b) =>
      new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    );

    const browseEvents: BrowseEvent[] = ((upcomingEvents ?? []) as unknown as {
      id: string; title: string; starts_at: string; flyer_url: string | null; slug: string;
      collective_id: string; collectives: { slug: string } | null; venues: { name: string } | null;
    }[]).map((e) => ({
      eventId: e.id,
      title: e.title,
      startsAt: e.starts_at,
      flyerUrl: e.flyer_url,
      collectiveSlug: e.collectives?.slug ?? "",
      eventSlug: e.slug,
      venueName: e.venues?.name ?? null,
    }));

    return {
      stats: {
        totalTickets: (referredTickets ?? []).length,
        totalEvents: eventMap.size,
      },
      myEvents,
      browseEvents,
    };
  } catch (err) {
    console.error("[getPromoterDashboard]", err);
    return { stats: { totalTickets: 0, totalEvents: 0 }, myEvents: [], browseEvents: [] };
  }
}
