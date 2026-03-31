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
  website: string | null;
  instagram: string | null;
  city: string | null;
  member_count: number;
  event_count: number;
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
  const { data: membership } = await sb
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const myCollectiveId = membership?.collective_id;

  // Build query
  let builder = sb
    .from("collectives")
    .select("id, name, slug, description, bio, logo_url, website, instagram, city, created_at", {
      count: "exact",
    });

  // Exclude own collective
  if (myCollectiveId) {
    builder = builder.neq("id", myCollectiveId);
  }

  // Search filter
  if (opts?.query?.trim()) {
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

  if (error || !collectives) return { collectives: [], total: 0 };

  // Batch-fetch member counts and event counts for all collectives
  const collectiveIds = collectives.map((c) => c.id);

  const [memberCounts, eventCounts] = await Promise.all([
    sb
      .from("collective_members")
      .select("collective_id", { count: "exact" })
      .in("collective_id", collectiveIds)
      .is("deleted_at", null),
    sb
      .from("events")
      .select("collective_id")
      .in("collective_id", collectiveIds)
      .neq("status", "draft"),
  ]);

  // Count members per collective
  const memberMap = new Map<string, number>();
  if (memberCounts.data) {
    for (const row of memberCounts.data) {
      const cid = (row as { collective_id: string }).collective_id;
      memberMap.set(cid, (memberMap.get(cid) ?? 0) + 1);
    }
  }

  // Count events per collective
  const eventMap = new Map<string, number>();
  if (eventCounts.data) {
    for (const row of eventCounts.data) {
      const cid = (row as { collective_id: string }).collective_id;
      eventMap.set(cid, (eventMap.get(cid) ?? 0) + 1);
    }
  }

  const result: DiscoverCollective[] = collectives.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    bio: c.bio,
    logo_url: c.logo_url,
    website: c.website,
    instagram: c.instagram,
    city: c.city,
    member_count: memberMap.get(c.id) ?? 0,
    event_count: eventMap.get(c.id) ?? 0,
    created_at: c.created_at,
  }));

  return { collectives: result, total: count ?? 0 };
}
