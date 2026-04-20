"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";
import { rateLimitStrict } from "@/lib/rate-limit";

// ── Helpers ──────────────────────────────────────────────────────────

const MAX_DISPLAY_NAME = 100;
const MAX_BIO = 500;
const MAX_CITY = 80;
const MAX_RATE_RANGE = 100;
const MAX_AVAILABILITY = 200;
const MAX_GENRE_OR_SERVICE = 50;
const MAX_GENRE_OR_SERVICE_ARRAY = 15;
const MAX_PORTFOLIO_URL = 500;
const MAX_PORTFOLIO_ARRAY = 10;
const MAX_PAST_VENUE = 120;
const MAX_PAST_VENUES_ARRAY = 20;

function capString(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function capStringArray(v: unknown, maxLen: number, maxItems: number): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  const cleaned = v
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().slice(0, maxLen))
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
  return cleaned;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Validate a URL: must start with http(s)://, no javascript: protocol, max 500 chars. */
function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.length > 500) return null;
  if (/^\s*javascript:/i.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

function sanitizeSearchInput(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/[.,()]/g, "")
    .slice(0, 100);
}

/**
 * Look up the current user's party_id from the users table.
 * Returns null if the user has no party yet.
 */
async function getUserPartyId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("party_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.party_id as string | null) ?? null;
}

// ── Actions ──────────────────────────────────────────────────────────

/**
 * Create an artist profile on the marketplace.
 * Uses users.party_id to link the artist profile to the current user.
 * If the user has no party yet, creates one and updates the users row.
 */
export async function createMarketplaceProfile(data: {
  displayName: string;
  city?: string | null;
  bio?: string | null;
  spotifyUrl?: string | null;
  genres?: string[] | null;
  services?: string[] | null;
  rateRange?: string | null;
  availability?: string | null;
  portfolioUrls?: string[] | null;
  pastVenues?: string[] | null;
}): Promise<{ error: string | null; slug: string | null }> {
  try {
  if (!data.displayName || typeof data.displayName !== "string" || data.displayName.trim().length === 0) {
    return { error: "Display name is required", slug: null };
  }
  if (data.displayName.length > 100) {
    return { error: "Display name must be under 100 characters", slug: null };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in", slug: null };

  const admin = createAdminClient();

  // Check for existing artist_profile via users.party_id
  const existingPartyId = await getUserPartyId(user.id);
  if (existingPartyId) {
    const { data: existing } = await admin
      .from("artist_profiles")
      .select("id")
      .eq("party_id", existingPartyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      return { error: "You already have a marketplace profile", slug: null };
    }
  }

  if (data.bio && data.bio.length > 500) {
    return { error: "Bio must be under 500 characters", slug: null };
  }

  const displayName = data.displayName.trim().slice(0, MAX_DISPLAY_NAME);
  const slug = slugify(displayName) + "-" + Math.random().toString(36).slice(2, 8);

  // 1. Get or create the party for this user
  let partyId = existingPartyId;
  if (!partyId) {
    const { data: party, error: partyError } = await admin
      .from("parties")
      .insert({ display_name: displayName, type: "person" })
      .select("id")
      .maybeSingle();

    if (partyError || !party) {
      console.error("[createMarketplaceProfile] party insert error:", partyError?.message);
      return { error: "Something went wrong", slug: null };
    }
    partyId = party.id;

    // Link party to the user row
    await admin
      .from("users")
      .update({ party_id: partyId })
      .eq("id", user.id);
  }

  // 2. Create artist_profile
  const { error } = await admin.from("artist_profiles").insert({
    party_id: partyId,
    slug,
    bio: capString(data.bio, MAX_BIO),
    spotify: sanitizeUrl(data.spotifyUrl),
    genre: capStringArray(data.genres, MAX_GENRE_OR_SERVICE, MAX_GENRE_OR_SERVICE_ARRAY),
    services: capStringArray(data.services, MAX_GENRE_OR_SERVICE, MAX_GENRE_OR_SERVICE_ARRAY),
    rate_range: capString(data.rateRange, MAX_RATE_RANGE),
    availability: capString(data.availability, MAX_AVAILABILITY),
    portfolio_urls: (capStringArray(data.portfolioUrls, MAX_PORTFOLIO_URL, MAX_PORTFOLIO_ARRAY) ?? [])
      .map((u) => sanitizeUrl(u))
      .filter((u): u is string => !!u),
    past_venues: capStringArray(data.pastVenues, MAX_PAST_VENUE, MAX_PAST_VENUES_ARRAY),
    is_active: true,
  });

  if (error) {
    console.error("[createMarketplaceProfile]", error);
    return { error: "Something went wrong", slug: null };
  }

  // 3. Ensure the party has an 'artist' role
  await admin.from("party_roles").insert({
    party_id: partyId,
    role: "artist",
  });

  revalidatePath("/dashboard/discover");
  return { error: null, slug };
  } catch (err) {
    console.error("[createMarketplaceProfile]", err);
    return { error: "Something went wrong", slug: null };
  }
}

/**
 * Update the current user's artist profile.
 */
export async function updateMarketplaceProfile(data: {
  displayName?: string;
  city?: string | null;
  bio?: string | null;
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
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  if (data.bio && data.bio.length > 500) {
    return { error: "Bio must be under 500 characters" };
  }

  // Find this user's artist profile via users.party_id
  const partyId = await getUserPartyId(user.id);
  if (!partyId) return { error: "Profile not found" };

  const { data: artistProfile } = await admin
    .from("artist_profiles")
    .select("id")
    .eq("party_id", partyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!artistProfile) return { error: "Profile not found" };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.displayName !== undefined && data.displayName !== null) {
    const cappedName = capString(data.displayName, MAX_DISPLAY_NAME);
    if (cappedName) {
      // Update the party display_name
      await admin
        .from("parties")
        .update({ display_name: cappedName })
        .eq("id", partyId);
    }
  }
  if (data.bio !== undefined) updates.bio = capString(data.bio, MAX_BIO);
  if (data.spotifyUrl !== undefined) updates.spotify = sanitizeUrl(data.spotifyUrl);
  if (data.genres !== undefined) updates.genre = capStringArray(data.genres, MAX_GENRE_OR_SERVICE, MAX_GENRE_OR_SERVICE_ARRAY);
  if (data.services !== undefined) updates.services = capStringArray(data.services, MAX_GENRE_OR_SERVICE, MAX_GENRE_OR_SERVICE_ARRAY);
  if (data.rateRange !== undefined) updates.rate_range = capString(data.rateRange, MAX_RATE_RANGE);
  if (data.availability !== undefined) updates.availability = capString(data.availability, MAX_AVAILABILITY);
  if (data.portfolioUrls !== undefined)
    updates.portfolio_urls = (capStringArray(data.portfolioUrls, MAX_PORTFOLIO_URL, MAX_PORTFOLIO_ARRAY) ?? [])
      .map((u) => sanitizeUrl(u))
      .filter((u): u is string => !!u);
  if (data.pastVenues !== undefined) updates.past_venues = capStringArray(data.pastVenues, MAX_PAST_VENUE, MAX_PAST_VENUES_ARRAY);
  if (data.avatarUrl !== undefined) updates.photo_url = sanitizeUrl(data.avatarUrl);
  if (data.coverPhotoUrl !== undefined) updates.cover_photo_url = sanitizeUrl(data.coverPhotoUrl);

  const { error } = await admin
    .from("artist_profiles")
    .update(updates)
    .eq("id", artistProfile.id);

  if (error) {
    console.error("[updateMarketplaceProfile]", error);
    return { error: "Something went wrong" };
  }

  revalidatePath("/dashboard/discover");
  return { error: null };
  } catch (err) {
    console.error("[updateMarketplaceProfile]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Get the current user's artist profile (or null).
 */
export async function getMarketplaceProfile() {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const partyId = await getUserPartyId(user.id);
  if (!partyId) return null;

  const { data, error: queryError } = await admin
    .from("artist_profiles")
    .select("id, slug, party_id, bio, genre, services, spotify, rate_range, availability, portfolio_urls, past_venues, photo_url, cover_photo_url, is_active, is_verified, booking_email, created_at, updated_at, parties(display_name)")
    .eq("party_id", partyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (queryError) {
    console.error("[getMarketplaceProfile]", queryError);
    return null;
  }

  if (!data) return null;

  const party = data.parties as { display_name: string } | null;
  return {
    ...(data as unknown as Record<string, unknown>),
    display_name: party?.display_name ?? null,
  };
  } catch (err) {
    console.error("[getMarketplaceProfile] Unexpected error:", err);
    return null;
  }
}

/**
 * Get a profile (artist or venue) by slug.
 */
export async function getProfileBySlug(slug: string) {
  try {
  if (!slug || typeof slug !== "string" || slug.length > 200) return null;

  const admin = createAdminClient();

  // Try artist_profiles first
  const { data: artistProfile } = await admin
    .from("artist_profiles")
    .select("id, slug, party_id, bio, genre, services, spotify, rate_range, availability, portfolio_urls, past_venues, photo_url, cover_photo_url, is_active, is_verified, booking_email, created_at, parties(display_name)")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (artistProfile) {
    const party = artistProfile.parties as { display_name: string } | null;
    return {
      ...(artistProfile as unknown as Record<string, unknown>),
      display_name: party?.display_name ?? null,
      user_type: "artist",
    };
  }

  // Then try venue_profiles
  const { data: venueProfile } = await admin
    .from("venue_profiles")
    .select("id, slug, party_id, name, city, address, capacity, amenities, photo_url, cover_photo_url, is_active, is_verified, created_at, parties(display_name)")
    .eq("slug", slug)
    .maybeSingle();

  if (venueProfile) {
    const party = venueProfile.parties as { display_name: string } | null;
    return {
      ...(venueProfile as unknown as Record<string, unknown>),
      display_name: party?.display_name ?? (venueProfile as unknown as { name: string }).name,
      user_type: "venue",
    };
  }

  return null;
  } catch (err) {
    console.error("[getProfileBySlug] Unexpected error:", err);
    return null;
  }
}

/**
 * Search artist_profiles and venue_profiles where is_active=true.
 */
export async function searchProfiles(filters: {
  query?: string | null;
  type?: string | null;
  city?: string | null;
  page?: number;
}): Promise<{ profiles: Record<string, unknown>[]; total: number }> {
  try {
    if (filters.query && typeof filters.query !== "string") return { profiles: [], total: 0 };
    if (filters.type && typeof filters.type !== "string") return { profiles: [], total: 0 };
    if (filters.city && typeof filters.city !== "string") return { profiles: [], total: 0 };
    if (
      filters.page !== undefined &&
      (typeof filters.page !== "number" || filters.page < 1 || !Number.isFinite(filters.page))
    ) {
      return { profiles: [], total: 0 };
    }

    const admin = createAdminClient();
    const page = filters.page ?? 1;
    const perPage = 20;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const profileType = filters.type ?? "all";
    const profiles: Record<string, unknown>[] = [];
    let total = 0;

    if (profileType === "all" || profileType === "artist") {
      let artistQuery = admin
        .from("artist_profiles")
        .select(
          "id, slug, party_id, bio, genre, services, spotify, rate_range, availability, portfolio_urls, past_venues, photo_url, cover_photo_url, is_active, is_verified, booking_email, created_at, parties(display_name)",
          { count: "exact" }
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filters.query) {
        const safeQuery = sanitizeSearchInput(filters.query);
        artistQuery = artistQuery.ilike("bio", `%${safeQuery}%`);
      }

      const { data: artistData, count: artistCount, error: artistError } = await artistQuery;

      if (!artistError && artistData) {
        for (const ap of artistData) {
          const party = (ap as { parties: { display_name: string } | null }).parties;
          profiles.push({
            ...(ap as unknown as Record<string, unknown>),
            display_name: party?.display_name ?? null,
            user_type: "artist",
          });
        }
        total += artistCount ?? 0;
      }
    }

    if (profileType === "all" || profileType === "venue") {
      let venueQuery = admin
        .from("venue_profiles")
        .select(
          "id, slug, party_id, name, city, address, capacity, amenities, photo_url, cover_photo_url, is_active, is_verified, created_at, parties(display_name)",
          { count: "exact" }
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filters.city) {
        const safeCity = sanitizeSearchInput(filters.city);
        venueQuery = venueQuery.ilike("city", `%${safeCity}%`);
      }

      if (filters.query) {
        const safeQuery = sanitizeSearchInput(filters.query);
        venueQuery = venueQuery.ilike("name", `%${safeQuery}%`);
      }

      const { data: venueData, count: venueCount, error: venueError } = await venueQuery;

      if (!venueError && venueData) {
        for (const vp of venueData) {
          const party = (vp as { parties: { display_name: string } | null }).parties;
          profiles.push({
            ...(vp as unknown as Record<string, unknown>),
            display_name: party?.display_name ?? (vp as unknown as { name: string }).name,
            user_type: "venue",
          });
        }
        total += venueCount ?? 0;
      }
    }

    return { profiles, total };
  } catch (err) {
    console.error("[searchProfiles]", err);
    return { profiles: [], total: 0 };
  }
}

/**
 * Save a profile (artist_profiles.id).
 * Stored as a party_roles row with role='platform_user' on the target party.
 * Uses saved_venues for venue profiles.
 */
export async function saveProfile(
  profileId: string
): Promise<{ error: string | null }> {
  try {
  if (!profileId || typeof profileId !== "string" || profileId.length > 100) {
    return { error: "Invalid profile ID" };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Find the target party_id from artist_profiles
  const { data: artistProfile } = await admin
    .from("artist_profiles")
    .select("id, party_id")
    .eq("id", profileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!artistProfile) {
    // Try venue_profiles — save via saved_venues
    const { data: venueProfile } = await admin
      .from("venue_profiles")
      .select("id, party_id")
      .eq("id", profileId)
      .maybeSingle();

    if (!venueProfile) return { error: "Profile not found" };

    // Check for existing save
    const { count: existingSave } = await admin
      .from("saved_venues")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("venue_party_id", venueProfile.party_id);

    if (!existingSave || existingSave === 0) {
      await admin.from("saved_venues").insert({
        user_id: user.id,
        venue_party_id: venueProfile.party_id,
      });
    }

    revalidatePath("/dashboard/discover");
    return { error: null };
  }

  // Prevent self-save
  const currentUserPartyId = await getUserPartyId(user.id);
  if (currentUserPartyId && currentUserPartyId === artistProfile.party_id) {
    return { error: "You cannot save your own profile" };
  }

  // Store as a platform_user party_role on the target party.
  // No unique constraint exists — deduplicate by scanning metadata in-memory.
  const { data: existingRoles } = await admin
    .from("party_roles")
    .select("id, metadata")
    .eq("role", "platform_user")
    .eq("party_id", artistProfile.party_id);

  const alreadySaved = (existingRoles ?? []).some(
    (r) => (r.metadata as Record<string, unknown> | null)?.saved_by_user_id === user.id
  );

  if (!alreadySaved) {
    await admin.from("party_roles").insert({
      party_id: artistProfile.party_id,
      role: "platform_user",
      metadata: { saved_by_user_id: user.id, saved_at: new Date().toISOString() },
    });
  }

  revalidatePath("/dashboard/discover");
  return { error: null };
  } catch (err) {
    console.error("[saveProfile] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function unsaveProfile(
  profileId: string
): Promise<{ error: string | null }> {
  try {
  if (!profileId || typeof profileId !== "string" || profileId.length > 100) {
    return { error: "Invalid profile ID" };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Try artist profile first
  const { data: artistProfile } = await admin
    .from("artist_profiles")
    .select("party_id")
    .eq("id", profileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (artistProfile?.party_id) {
    // Find and delete the platform_user role with this user's saved marker
    const { data: roles } = await admin
      .from("party_roles")
      .select("id, metadata")
      .eq("role", "platform_user")
      .eq("party_id", artistProfile.party_id);

    const toDelete = (roles ?? [])
      .filter((r) => (r.metadata as Record<string, unknown> | null)?.saved_by_user_id === user.id)
      .map((r) => r.id);

    for (const id of toDelete) {
      await admin.from("party_roles").delete().eq("id", id);
    }
  } else {
    // Try venue profile
    const { data: venueProfile } = await admin
      .from("venue_profiles")
      .select("party_id")
      .eq("id", profileId)
      .maybeSingle();

    if (venueProfile?.party_id) {
      await admin
        .from("saved_venues")
        .delete()
        .eq("user_id", user.id)
        .eq("venue_party_id", venueProfile.party_id);
    }
  }

  revalidatePath("/dashboard/discover");
  return { error: null };
  } catch (err) {
    console.error("[unsaveProfile]", err);
    return { error: "Something went wrong" };
  }
}

export async function isProfileSaved(profileId: string): Promise<boolean> {
  try {
  if (!profileId || typeof profileId !== "string" || profileId.length > 100) {
    return false;
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const admin = createAdminClient();

  // Try artist profile
  const { data: artistProfile } = await admin
    .from("artist_profiles")
    .select("party_id")
    .eq("id", profileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (artistProfile?.party_id) {
    const { data: roles } = await admin
      .from("party_roles")
      .select("id, metadata")
      .eq("role", "platform_user")
      .eq("party_id", artistProfile.party_id);

    return (roles ?? []).some(
      (r) => (r.metadata as Record<string, unknown> | null)?.saved_by_user_id === user.id
    );
  }

  // Try venue profile
  const { data: venueProfile } = await admin
    .from("venue_profiles")
    .select("party_id")
    .eq("id", profileId)
    .maybeSingle();

  if (venueProfile?.party_id) {
    const { count } = await admin
      .from("saved_venues")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("venue_party_id", venueProfile.party_id);
    return (count ?? 0) > 0;
  }

  return false;
  } catch (err) {
    console.error("[isProfileSaved] Unexpected error:", err);
    return false;
  }
}

export async function getSavedProfiles(): Promise<{
  profiles: Record<string, unknown>[];
  savedIds: string[];
}> {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profiles: [], savedIds: [] };

  const admin = createAdminClient();

  // Fetch all platform_user roles (saved artist profiles) and filter in-memory
  // to find those saved by this user.
  const { data: platformRoles, error } = await admin
    .from("party_roles")
    .select("id, party_id, metadata, parties(id, display_name, artist_profiles(id, slug, bio, genre, photo_url, cover_photo_url, is_active))")
    .eq("role", "platform_user")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getSavedProfiles] error:", error.message);
    return { profiles: [], savedIds: [] };
  }

  const profiles: Record<string, unknown>[] = [];
  const savedIds: string[] = [];

  for (const row of (platformRoles ?? []) as {
    id: string;
    party_id: string;
    metadata: Record<string, unknown> | null;
    parties: {
      id: string;
      display_name: string;
      artist_profiles:
        | {
            id: string;
            slug: string;
            bio: string | null;
            genre: string[] | null;
            photo_url: string | null;
            cover_photo_url: string | null;
            is_active: boolean;
          }[]
        | null;
    } | null;
  }[]) {
    if (row.metadata?.saved_by_user_id !== user.id) continue;

    const artistProfileArr = row.parties?.artist_profiles;
    const ap = Array.isArray(artistProfileArr) ? artistProfileArr[0] : null;
    if (ap) {
      savedIds.push(ap.id);
      profiles.push({
        ...ap,
        display_name: row.parties?.display_name ?? null,
        party_id: row.party_id,
        user_type: "artist",
      });
    }
  }

  return { profiles, savedIds };
  } catch (err) {
    console.error("[getSavedProfiles] Unexpected error:", err);
    return { profiles: [], savedIds: [] };
  }
}

export async function sendInquiry(data: {
  toProfileId: string;
  eventId?: string | null;
  message: string;
  inquiryType?: string;
}): Promise<{ error: string | null }> {
  try {
  if (!data.toProfileId || typeof data.toProfileId !== "string" || data.toProfileId.length > 100) {
    return { error: "Invalid profile ID" };
  }
  if (!data.message || typeof data.message !== "string") {
    return { error: "Message is required" };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const { success: rlOk } = await rateLimitStrict(`inquiry:${user.id}`, 5, 60_000);
  if (!rlOk) return { error: "Too many messages. Please wait a moment." };
  const { success: pairOk } = await rateLimitStrict(
    `inquiry:pair:${user.id}:${data.toProfileId}`,
    1,
    86_400_000,
  );
  if (!pairOk) return { error: "You've already messaged this collective today. Wait for their reply." };

  if (data.message.length > 5000) {
    return { error: "Message is too long" };
  }

  const admin = createAdminClient();

  // Find artist profile + booking email, and prevent self-inquiry
  const { data: targetProfile } = await admin
    .from("artist_profiles")
    .select("id, party_id, booking_email, parties(display_name)")
    .eq("id", data.toProfileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (targetProfile) {
    const currentUserPartyId = await getUserPartyId(user.id);
    if (currentUserPartyId && currentUserPartyId === targetProfile.party_id) {
      return { error: "You cannot send an inquiry to yourself" };
    }
  }

  // Get recipient email: booking_email first, then party_contact_methods
  let recipientEmail = targetProfile?.booking_email ?? null;
  const recipientName =
    (targetProfile?.parties as { display_name: string } | null)?.display_name ?? null;

  if (!recipientEmail && targetProfile?.party_id) {
    const { data: emailMethod } = await admin
      .from("party_contact_methods")
      .select("value")
      .eq("party_id", targetProfile.party_id)
      .eq("type", "email")
      .eq("is_primary", true)
      .maybeSingle();
    recipientEmail = emailMethod?.value ?? null;
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;
  const internalSecretOk = !!internalSecret && internalSecret.length >= 16;
  if (!internalSecretOk) {
    console.warn(
      "[marketplace] INTERNAL_API_SECRET is not set or too short — skipping inquiry email"
    );
  }

  if (recipientEmail && internalSecretOk) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trynocturn.com";
      const emailController = new AbortController();
      const emailTimeout = setTimeout(() => emailController.abort(), 5_000);
      try {
        await fetch(`${appUrl}/api/marketplace-inquiry-email`, {
          method: "POST",
          signal: emailController.signal,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${internalSecret}`,
          },
          body: JSON.stringify({
            toEmail: recipientEmail,
            toName: recipientName,
            fromUserId: user.id,
            senderName: user.user_metadata?.full_name ?? user.email ?? "Someone",
            message: data.message,
            inquiryType: data.inquiryType ?? "general",
          }),
        });
      } finally {
        clearTimeout(emailTimeout);
      }
    } catch (emailErr) {
      console.error("[sendInquiry] notification email failed (non-blocking):", emailErr);
    }
  }

  revalidatePath("/dashboard/discover");
  return { error: null };
  } catch (err) {
    console.error("[sendInquiry] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}
