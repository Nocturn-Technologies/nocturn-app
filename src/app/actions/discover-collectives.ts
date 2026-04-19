"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export interface DiscoverCollective {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  bio: string | null;
  logo_url: string | null;
  city: string | null;
  member_count: number;
  event_count: number;
  recent_events_count: number;
  latest_flyer_url: string | null;
  latest_event_title: string | null;
  latest_event_date: string | null;
  created_at: string;
}

/**
 * Fetch all signed-up collectives for discovery.
 * Excludes the current user's own collective.
 * Supports search by name/city and city filter.
 */
export async function getDiscoverCollectives(opts?: {
  query?: string | null;
  city?: string | null;
  page?: number;
}): Promise<{ collectives: DiscoverCollective[]; total: number }> {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { collectives: [], total: 0 };

  const sb = createAdminClient();
  const page = opts?.page ?? 1;
  const perPage = 20;
  const offset = (page - 1) * perPage;

  // Get the user's own collective to exclude it
  const { data: membership, error: membershipError } = await sb
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("[getDiscoverCollectives] membership query error:", membershipError.message);
  }

  const myCollectiveId = membership?.collective_id;

  // Build query
  let builder = sb
    .from("collectives")
    .select("id, name, slug, description, bio, logo_url, city, created_at", {
      count: "exact",
    });

  // Exclude own collective
  if (myCollectiveId) {
    builder = builder.neq("id", myCollectiveId);
  }

  // Search filter
  if (opts?.query?.trim()) {
    // TODO(audit): replace inline sanitizer with shared sanitizePostgRESTInput() from @/lib/utils + length cap
    const sanitized = opts.query
      .replace(/\\/g, "")
      .replace(/[%_.,()'"`]/g, "")
      .trim();
    if (sanitized) {
      const escaped = sanitized
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      builder = builder.or(
        `name.ilike.%${escaped}%,city.ilike.%${escaped}%,slug.ilike.%${escaped}%,description.ilike.%${escaped}%`
      );
    }
  }

  // City filter
  if (opts?.city?.trim()) {
    const cityEscaped = opts.city
      .trim()
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    builder = builder.ilike("city", `%${cityEscaped}%`);
  }

  const {
    data: collectives,
    count,
    error,
  } = await builder
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (error) {
    console.error("[getDiscoverCollectives] collectives query error:", error.message);
    return { collectives: [], total: 0 };
  }
  if (!collectives) return { collectives: [], total: 0 };

  // Batch-fetch member counts and event data for all collectives
  const collectiveIds = collectives.map((c) => c.id);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [memberCounts, eventRows] = await Promise.all([
    sb
      .from("collective_members")
      .select("collective_id", { count: "exact" })
      .in("collective_id", collectiveIds)
      .is("deleted_at", null),
    sb
      .from("events")
      .select("collective_id, title, flyer_url, starts_at")
      .in("collective_id", collectiveIds)
      .neq("status", "draft")
      .order("starts_at", { ascending: false }),
  ]);

  // Count members per collective
  const memberMap = new Map<string, number>();
  if (memberCounts.data) {
    for (const row of memberCounts.data) {
      const cid = (row as { collective_id: string }).collective_id;
      memberMap.set(cid, (memberMap.get(cid) ?? 0) + 1);
    }
  }

  // Build per-collective event stats: total count, recent-60d count, and latest event details
  type EventRow = { collective_id: string; title: string | null; flyer_url: string | null; starts_at: string | null };
  const eventStatsMap = new Map<
    string,
    { total: number; recent: number; latest: EventRow | null }
  >();
  if (eventRows.data) {
    for (const raw of eventRows.data) {
      const row = raw as EventRow;
      const cid = row.collective_id;
      const existing = eventStatsMap.get(cid) ?? { total: 0, recent: 0, latest: null };
      existing.total += 1;
      if (row.starts_at && row.starts_at >= sixtyDaysAgo) existing.recent += 1;
      // First row per collective is the latest (rows are ordered desc by starts_at)
      if (!existing.latest) existing.latest = row;
      eventStatsMap.set(cid, existing);
    }
  }

  const result: DiscoverCollective[] = collectives.map((c) => {
    const stats = eventStatsMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      bio: c.bio,
      logo_url: c.logo_url,
      city: c.city,
      member_count: memberMap.get(c.id) ?? 0,
      event_count: stats?.total ?? 0,
      recent_events_count: stats?.recent ?? 0,
      latest_flyer_url: stats?.latest?.flyer_url ?? null,
      latest_event_title: stats?.latest?.title ?? null,
      latest_event_date: stats?.latest?.starts_at ?? null,
      created_at: c.created_at,
    };
  });

  return { collectives: result, total: count ?? 0 };
  } catch (err) {
    console.error("[getDiscoverCollectives]", err);
    return { collectives: [], total: 0 };
  }
}

/**
 * Fetch the user's nearest upcoming event (for the discover-page context card).
 * Returns null if the user has no upcoming published event or no collective.
 */
export interface NextEventSummary {
  id: string;
  title: string;
  starts_at: string;
  city: string | null;
  vibe_tags: string[] | null;
  collective_city: string | null;
}

export async function getMyNextEvent(): Promise<NextEventSummary | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const sb = createAdminClient();

    const { data: membership } = await sb
      .from("collective_members")
      .select("collective_id, collectives(city)")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    const collectiveId = (membership as { collective_id?: string } | null)?.collective_id;
    if (!collectiveId) return null;

    const collectiveCity =
      (membership as unknown as { collectives?: { city?: string | null } | null } | null)
        ?.collectives?.city ?? null;

    const { data: event } = await sb
      .from("events")
      .select("id, title, starts_at, vibe_tags")
      .eq("collective_id", collectiveId)
      .neq("status", "draft")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!event) return null;

    return {
      id: event.id as string,
      title: event.title as string,
      starts_at: event.starts_at as string,
      city: null,
      vibe_tags: (event.vibe_tags as string[] | null) ?? null,
      collective_city: collectiveCity,
    };
  } catch (err) {
    console.error("[getMyNextEvent]", err);
    return null;
  }
}

/**
 * Return the set of collective IDs the current user's collective has
 * already started a collab chat with — i.e. "collectives in my network."
 * Used to power the "My network" filter on the Discover page.
 */
export async function getMyConnectedCollectiveIds(): Promise<string[]> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const sb = createAdminClient();

    // Find the user's collective
    const { data: membership } = await sb
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    const myCollectiveId = (membership as { collective_id?: string } | null)?.collective_id;
    if (!myCollectiveId) return [];

    // Find collab channels where I'm owner OR partner, then extract the OTHER collective id
    const [owned, partnered] = await Promise.all([
      sb
        .from("channels")
        .select("partner_collective_id")
        .eq("collective_id", myCollectiveId)
        .eq("type", "collab"),
      sb
        .from("channels")
        .select("collective_id")
        .eq("partner_collective_id", myCollectiveId)
        .eq("type", "collab"),
    ]);

    const ids = new Set<string>();
    for (const row of (owned.data ?? []) as { partner_collective_id: string | null }[]) {
      if (row.partner_collective_id) ids.add(row.partner_collective_id);
    }
    for (const row of (partnered.data ?? []) as { collective_id: string | null }[]) {
      if (row.collective_id) ids.add(row.collective_id);
    }
    return Array.from(ids);
  } catch (err) {
    console.error("[getMyConnectedCollectiveIds]", err);
    return [];
  }
}

/**
 * Fetch the 5 most recent published events for a collective (for detail page).
 */
export interface CollectiveEventTile {
  id: string;
  title: string;
  flyer_url: string | null;
  starts_at: string;
  venue_name: string | null;
  status: string;
}

export async function getCollectiveRecentEvents(
  collectiveId: string,
  limit = 5
): Promise<CollectiveEventTile[]> {
  try {
    const sb = createAdminClient();
    // Step 1: fetch events with venue_id (events table has no venue_name column)
    const { data: events } = await sb
      .from("events")
      .select("id, title, flyer_url, starts_at, status, venue_id")
      .eq("collective_id", collectiveId)
      .neq("status", "draft")
      .order("starts_at", { ascending: false })
      .limit(limit);

    if (!events || events.length === 0) return [];

    // Step 2: batch-resolve venue names (one query, not N)
    const venueIds = Array.from(
      new Set((events as { venue_id: string | null }[]).map((e) => e.venue_id).filter((v): v is string => !!v))
    );
    const venueMap = new Map<string, string>();
    if (venueIds.length > 0) {
      const { data: venues } = await sb.from("venues").select("id, name").in("id", venueIds);
      for (const v of (venues ?? []) as { id: string; name: string }[]) {
        venueMap.set(v.id, v.name);
      }
    }

    return (events as Array<{
      id: string;
      title: string;
      flyer_url: string | null;
      starts_at: string;
      status: string;
      venue_id: string | null;
    }>).map((e) => ({
      id: e.id,
      title: e.title,
      flyer_url: e.flyer_url,
      starts_at: e.starts_at,
      venue_name: e.venue_id ? venueMap.get(e.venue_id) ?? null : null,
      status: e.status,
    }));
  } catch (err) {
    console.error("[getCollectiveRecentEvents]", err);
    return [];
  }
}
