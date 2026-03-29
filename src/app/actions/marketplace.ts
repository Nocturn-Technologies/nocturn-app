"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";

// ── Helpers ──────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ── Actions ──────────────────────────────────────────────────────────

export async function createMarketplaceProfile(data: {
  displayName: string;
  city?: string | null;
  bio?: string | null;
  instagramHandle?: string | null;
  websiteUrl?: string | null;
  soundcloudUrl?: string | null;
  spotifyUrl?: string | null;
  genres?: string[] | null;
  services?: string[] | null;
  rateRange?: string | null;
  availability?: string | null;
  portfolioUrls?: string[] | null;
  pastVenues?: string[] | null;
}): Promise<{ error: string | null; slug: string | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in", slug: null };

  const admin = createAdminClient();

  // Get user_type from auth metadata (avoids PostgREST schema cache issues)
  const userType = user.user_metadata?.user_type ?? "artist";

  // Check for existing marketplace profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin.from("marketplace_profiles") as any)
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return { error: "You already have a marketplace profile", slug: null };
  }

  const slug =
    slugify(data.displayName) +
    "-" +
    Math.random().toString(36).slice(2, 8);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_profiles") as any).insert({
    user_id: user.id,
    user_type: userType,
    display_name: data.displayName,
    slug,
    bio: data.bio ?? null,
    city: data.city ?? null,
    instagram_handle: data.instagramHandle ?? null,
    website_url: data.websiteUrl ?? null,
    soundcloud_url: data.soundcloudUrl ?? null,
    spotify_url: data.spotifyUrl ?? null,
    genres: data.genres ?? null,
    services: data.services ?? null,
    rate_range: data.rateRange ?? null,
    availability: data.availability ?? null,
    portfolio_urls: data.portfolioUrls ?? null,
    past_venues: data.pastVenues ?? null,
  });

  if (error) return { error: (error as { message: string }).message, slug: null };

  revalidatePath("/dashboard/discover");
  return { error: null, slug };
}

export async function updateMarketplaceProfile(data: {
  displayName?: string;
  city?: string | null;
  bio?: string | null;
  instagramHandle?: string | null;
  websiteUrl?: string | null;
  soundcloudUrl?: string | null;
  spotifyUrl?: string | null;
  genres?: string[] | null;
  services?: string[] | null;
  rateRange?: string | null;
  availability?: string | null;
  portfolioUrls?: string[] | null;
  pastVenues?: string[] | null;
  avatarUrl?: string | null;
  coverPhotoUrl?: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.displayName !== undefined) updates.display_name = data.displayName;
  if (data.city !== undefined) updates.city = data.city;
  if (data.bio !== undefined) updates.bio = data.bio;
  if (data.instagramHandle !== undefined) updates.instagram_handle = data.instagramHandle;
  if (data.websiteUrl !== undefined) updates.website_url = data.websiteUrl;
  if (data.soundcloudUrl !== undefined) updates.soundcloud_url = data.soundcloudUrl;
  if (data.spotifyUrl !== undefined) updates.spotify_url = data.spotifyUrl;
  if (data.genres !== undefined) updates.genres = data.genres;
  if (data.services !== undefined) updates.services = data.services;
  if (data.rateRange !== undefined) updates.rate_range = data.rateRange;
  if (data.availability !== undefined) updates.availability = data.availability;
  if (data.portfolioUrls !== undefined) updates.portfolio_urls = data.portfolioUrls;
  if (data.pastVenues !== undefined) updates.past_venues = data.pastVenues;
  if (data.avatarUrl !== undefined) updates.avatar_url = data.avatarUrl;
  if (data.coverPhotoUrl !== undefined) updates.cover_photo_url = data.coverPhotoUrl;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_profiles") as any)
    .update(updates)
    .eq("user_id", user.id);

  if (error) return { error: (error as { message: string }).message };

  revalidatePath("/dashboard/discover");
  return { error: null };
}

export async function getMarketplaceProfile() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin.from("marketplace_profiles") as any)
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data ?? null;
}

export async function getProfileBySlug(slug: string) {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin.from("marketplace_profiles") as any)
    .select("id, slug, user_type, display_name, bio, city, instagram_handle, website_url, soundcloud_url, spotify_url, genres, services, rate_range, availability, portfolio_urls, past_venues, avatar_url, cover_photo_url, is_active, created_at, users(full_name)")
    .eq("slug", slug)
    .maybeSingle();

  return data ?? null;
}

/** Escape special Postgres LIKE/ILIKE pattern chars and PostgREST filter delimiters */
function sanitizeSearchInput(input: string): string {
  return input
    .replace(/\\/g, "\\\\") // backslash first
    .replace(/%/g, "\\%")   // wildcard %
    .replace(/_/g, "\\_")   // wildcard _
    .replace(/[.,()]/g, "") // PostgREST filter delimiters
    .slice(0, 100);         // cap length
}

export async function searchProfiles(filters: {
  query?: string | null;
  type?: string | null;
  city?: string | null;
  page?: number;
}): Promise<{ profiles: Record<string, unknown>[]; total: number }> {
  const admin = createAdminClient();
  const page = filters.page ?? 1;
  const perPage = 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin.from("marketplace_profiles") as any)
    .select("id, slug, user_type, display_name, bio, city, instagram_handle, website_url, soundcloud_url, spotify_url, genres, services, rate_range, availability, portfolio_urls, past_venues, avatar_url, cover_photo_url, is_active, created_at", { count: "exact" })
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.type) {
    query = query.eq("user_type", filters.type);
  }

  if (filters.city) {
    const safeCity = sanitizeSearchInput(filters.city);
    query = query.ilike("city", `%${safeCity}%`);
  }

  if (filters.query) {
    const safeQuery = sanitizeSearchInput(filters.query);
    query = query.or(
      `display_name.ilike.%${safeQuery}%,bio.ilike.%${safeQuery}%`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[marketplace] searchProfiles error:", error.message, error.details);
    return { profiles: [], total: 0 };
  }

  return {
    profiles: (data ?? []) as Record<string, unknown>[],
    total: (count as number) ?? 0,
  };
}

export async function saveProfile(
  profileId: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_saved") as any).insert({
    user_id: user.id,
    profile_id: profileId,
  });

  // Ignore duplicate key (23505) — idempotent save
  if (error && (error as { code?: string }).code !== "23505") {
    return { error: (error as { message: string }).message };
  }

  revalidatePath("/dashboard/discover");
  return { error: null };
}

export async function unsaveProfile(
  profileId: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_saved") as any)
    .delete()
    .eq("user_id", user.id)
    .eq("profile_id", profileId);

  if (error) return { error: (error as { message: string }).message };

  revalidatePath("/dashboard/discover");
  return { error: null };
}

export async function isProfileSaved(profileId: string): Promise<boolean> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (admin.from("marketplace_saved") as any)
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", profileId);

  return (count ?? 0) > 0;
}

export async function getSavedProfiles(): Promise<{
  profiles: Record<string, unknown>[];
  savedIds: string[];
}> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profiles: [], savedIds: [] };

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.from("marketplace_saved") as any)
    .select("profile_id, marketplace_profiles(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[marketplace] getSavedProfiles error:", error.message);
    return { profiles: [], savedIds: [] };
  }

  const rows = (data ?? []) as {
    profile_id: string;
    marketplace_profiles: Record<string, unknown>;
  }[];

  const profiles = rows
    .map((r) => r.marketplace_profiles)
    .filter(Boolean);

  const savedIds = rows.map((r) => r.profile_id);

  return { profiles, savedIds };
}

/**
 * Get "Your Network" — saved profiles + people you've exchanged inquiries with.
 * Deduplicates and labels each connection type.
 */
export async function getNetworkProfiles(): Promise<{
  profiles: Record<string, unknown>[];
  connectionTypes: Record<string, string[]>;
}> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { profiles: [], connectionTypes: {} };

    const admin = createAdminClient();

    // Run all initial queries in parallel
    const [savedResult, sentResult, myProfileResult] = await Promise.all([
      admin.from("marketplace_saved").select("profile_id").eq("user_id", user.id),
      admin.from("marketplace_inquiries").select("to_profile_id").eq("from_user_id", user.id),
      admin.from("marketplace_profiles").select("id").eq("user_id", user.id).maybeSingle(),
    ]);

    const savedProfileIds = new Set<string>(
      (savedResult.data ?? []).map((r: { profile_id: string }) => r.profile_id)
    );

    const contactedProfileIds = new Set<string>(
      (sentResult.data ?? []).map((r: { to_profile_id: string }) => r.to_profile_id)
    );

    // Inquiries received by user
    const receivedFromProfileIds = new Set<string>();
    if (myProfileResult.data) {
      const { data: receivedInquiries } = await admin
        .from("marketplace_inquiries")
        .select("from_user_id")
        .eq("to_profile_id", myProfileResult.data.id);

      const fromUserIds = (receivedInquiries ?? []).map((r: { from_user_id: string }) => r.from_user_id);
      if (fromUserIds.length > 0) {
        const { data: fromProfiles } = await admin
          .from("marketplace_profiles")
          .select("id")
          .in("user_id", fromUserIds);

        (fromProfiles ?? []).forEach((p: { id: string }) => receivedFromProfileIds.add(p.id));
      }
    }

    // Combine all unique profile IDs
    const allProfileIds = new Set<string>([
      ...savedProfileIds,
      ...contactedProfileIds,
      ...receivedFromProfileIds,
    ]);

    if (allProfileIds.size === 0) {
      return { profiles: [], connectionTypes: {} };
    }

    // Fetch full profiles
    const { data: profiles } = await admin
      .from("marketplace_profiles")
      .select("*")
      .in("id", Array.from(allProfileIds))
      .order("display_name");

    // Build connection type labels
    const connectionTypes: Record<string, string[]> = {};
    for (const id of allProfileIds) {
      const types: string[] = [];
      if (savedProfileIds.has(id)) types.push("saved");
      if (contactedProfileIds.has(id)) types.push("contacted");
      if (receivedFromProfileIds.has(id)) types.push("contacted you");
      connectionTypes[id] = types;
    }

    return {
      profiles: (profiles ?? []) as Record<string, unknown>[],
      connectionTypes,
    };
  } catch (err) {
    console.error("[marketplace] getNetworkProfiles failed:", err);
    return { profiles: [], connectionTypes: {} };
  }
}

export async function sendInquiry(data: {
  toProfileId: string;
  eventId?: string | null;
  message: string;
  inquiryType?: string;
}): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Prevent self-inquiry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetProfile } = await (admin.from("marketplace_profiles") as any)
    .select("user_id")
    .eq("id", data.toProfileId)
    .maybeSingle();

  if (targetProfile?.user_id === user.id) {
    return { error: "You cannot send an inquiry to yourself" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("marketplace_inquiries") as any).insert({
    from_user_id: user.id,
    to_profile_id: data.toProfileId,
    event_id: data.eventId ?? null,
    message: data.message ?? null,
    inquiry_type: data.inquiryType ?? "general",
    status: "pending",
  });

  if (error) return { error: (error as { message: string }).message };

  // Fire-and-forget: email the profile owner about the inquiry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin.from("marketplace_profiles") as any)
    .select("user_id, display_name, users(email)")
    .eq("id", data.toProfileId)
    .maybeSingle();

  if (profile?.users?.email) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trynocturn.com";
      if (!process.env.INTERNAL_API_SECRET) {
        console.warn("INTERNAL_API_SECRET is not set — internal API calls will not be authenticated");
      }
      const internalSecret = process.env.INTERNAL_API_SECRET || "";
      fetch(`${appUrl}/api/marketplace-inquiry-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${internalSecret}`,
        },
        body: JSON.stringify({
          toEmail: profile.users.email,
          toName: profile.display_name,
          fromUserId: user.id,
          senderName: user.user_metadata?.full_name ?? user.email ?? "Someone",
          message: data.message,
          inquiryType: data.inquiryType ?? "general",
        }),
      }).catch(() => {
        // fire-and-forget — ignore email failures
      });
    } catch {
      // fire-and-forget — ignore email failures
    }
  }

  revalidatePath("/dashboard/discover");
  return { error: null };
}
