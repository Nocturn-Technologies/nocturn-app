"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";
import { rateLimitStrict } from "@/lib/rate-limit";

// ── Helpers ──────────────────────────────────────────────────────────

// Per-field length caps for marketplace profile input. A rogue client sending
// a 10KB "city" would otherwise sail straight into the DB and blow up every
// downstream ilike() and Claude prompt that interpolates the field.
const MAX_DISPLAY_NAME = 100;
const MAX_BIO = 500;
const MAX_CITY = 80;
const MAX_INSTAGRAM_HANDLE = 60;
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

/** Validate an optional URL: must start with http(s)://, no javascript: protocol, max 500 chars. Returns null if invalid. */
function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.length > 500) return null;
  if (/^\s*javascript:/i.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
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

  // Get user_type from auth metadata (avoids PostgREST schema cache issues)
  const userType = user.user_metadata?.user_type ?? "artist";

  // Check for existing marketplace profile
  const { data: existing } = await admin.from("marketplace_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return { error: "You already have a marketplace profile", slug: null };
  }

  if (data.bio && data.bio.length > 500) {
    return { error: "Bio must be under 500 characters", slug: null };
  }

  const slug =
    slugify(data.displayName) +
    "-" +
    Math.random().toString(36).slice(2, 8);

  // Length-cap every field before the insert. Previously only bio/displayName
  // were checked; city/instagram/rateRange/availability/genres/services could
  // all pass through 10KB garbage from a rogue client straight into the row.
  const { error } = await admin.from("marketplace_profiles").insert({
    user_id: user.id,
    user_type: userType,
    display_name: data.displayName.trim().slice(0, MAX_DISPLAY_NAME),
    slug,
    bio: capString(data.bio, MAX_BIO),
    city: capString(data.city, MAX_CITY),
    instagram_handle: capString(data.instagramHandle, MAX_INSTAGRAM_HANDLE),
    website_url: sanitizeUrl(data.websiteUrl),
    soundcloud_url: sanitizeUrl(data.soundcloudUrl),
    spotify_url: sanitizeUrl(data.spotifyUrl),
    genres: capStringArray(data.genres, MAX_GENRE_OR_SERVICE, MAX_GENRE_OR_SERVICE_ARRAY),
    services: capStringArray(data.services, MAX_GENRE_OR_SERVICE, MAX_GENRE_OR_SERVICE_ARRAY),
    rate_range: capString(data.rateRange, MAX_RATE_RANGE),
    availability: capString(data.availability, MAX_AVAILABILITY),
    portfolio_urls: (capStringArray(data.portfolioUrls, MAX_PORTFOLIO_URL, MAX_PORTFOLIO_ARRAY) ?? [])
      .map((u) => sanitizeUrl(u))
      .filter((u): u is string => !!u),
    past_venues: capStringArray(data.pastVenues, MAX_PAST_VENUE, MAX_PAST_VENUES_ARRAY),
  });

  if (error) {
    console.error("[createMarketplaceProfile]", error);
    return { error: "Something went wrong", slug: null };
  }

  revalidatePath("/dashboard/discover");
  return { error: null, slug };
  } catch (err) {
    console.error("[createMarketplaceProfile]", err);
    return { error: "Something went wrong", slug: null };
  }
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

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // Length-cap every field — same rationale as createMarketplaceProfile.
  if (data.displayName !== undefined) updates.display_name = capString(data.displayName, MAX_DISPLAY_NAME);
  if (data.city !== undefined) updates.city = capString(data.city, MAX_CITY);
  if (data.bio !== undefined) updates.bio = capString(data.bio, MAX_BIO);
  if (data.instagramHandle !== undefined) updates.instagram_handle = capString(data.instagramHandle, MAX_INSTAGRAM_HANDLE);
  if (data.websiteUrl !== undefined) updates.website_url = sanitizeUrl(data.websiteUrl);
  if (data.soundcloudUrl !== undefined) updates.soundcloud_url = sanitizeUrl(data.soundcloudUrl);
  if (data.spotifyUrl !== undefined) updates.spotify_url = sanitizeUrl(data.spotifyUrl);
  if (data.genres !== undefined) updates.genres = capStringArray(data.genres, MAX_GENRE_OR_SERVICE, MAX_GENRE_OR_SERVICE_ARRAY);
  if (data.services !== undefined) updates.services = capStringArray(data.services, MAX_GENRE_OR_SERVICE, MAX_GENRE_OR_SERVICE_ARRAY);
  if (data.rateRange !== undefined) updates.rate_range = capString(data.rateRange, MAX_RATE_RANGE);
  if (data.availability !== undefined) updates.availability = capString(data.availability, MAX_AVAILABILITY);
  if (data.portfolioUrls !== undefined)
    updates.portfolio_urls = (capStringArray(data.portfolioUrls, MAX_PORTFOLIO_URL, MAX_PORTFOLIO_ARRAY) ?? [])
      .map((u) => sanitizeUrl(u))
      .filter((u): u is string => !!u);
  if (data.pastVenues !== undefined) updates.past_venues = capStringArray(data.pastVenues, MAX_PAST_VENUE, MAX_PAST_VENUES_ARRAY);
  if (data.avatarUrl !== undefined) updates.avatar_url = sanitizeUrl(data.avatarUrl);
  if (data.coverPhotoUrl !== undefined) updates.cover_photo_url = sanitizeUrl(data.coverPhotoUrl);

  const { error } = await admin.from("marketplace_profiles")
    .update(updates)
    .eq("user_id", user.id);

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

export async function getMarketplaceProfile() {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const { data, error: queryError } = await admin.from("marketplace_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (queryError) {
    console.error("[getMarketplaceProfile]", queryError);
    return null;
  }

  return data ?? null;
  } catch (err) {
    console.error("[getMarketplaceProfile] Unexpected error:", err);
    return null;
  }
}

export async function getProfileBySlug(slug: string) {
  try {
  if (!slug || typeof slug !== "string" || slug.length > 200) return null;

  const admin = createAdminClient();

  const { data, error: queryError } = await admin.from("marketplace_profiles")
    .select("id, slug, user_type, user_id, display_name, bio, city, instagram_handle, website_url, soundcloud_url, spotify_url, genres, services, rate_range, availability, portfolio_urls, past_venues, avatar_url, cover_photo_url, is_active, is_verified, created_at, users(full_name)")
    .eq("slug", slug)
    .maybeSingle();

  if (queryError) {
    console.error("[getProfileBySlug]", queryError);
    return null;
  }

  return data ?? null;
  } catch (err) {
    console.error("[getProfileBySlug] Unexpected error:", err);
    return null;
  }
}

// TODO(audit): replace inline sanitizer with shared sanitizePostgRESTInput() from @/lib/utils + length cap
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
  try {
    // Input validation
    if (filters.query && typeof filters.query !== "string") return { profiles: [], total: 0 };
    if (filters.type && typeof filters.type !== "string") return { profiles: [], total: 0 };
    if (filters.city && typeof filters.city !== "string") return { profiles: [], total: 0 };
    if (filters.page !== undefined && (typeof filters.page !== "number" || filters.page < 1 || !Number.isFinite(filters.page))) {
      return { profiles: [], total: 0 };
    }

    const admin = createAdminClient();
    const page = filters.page ?? 1;
    const perPage = 20;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let query = admin.from("marketplace_profiles")
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
      console.error("[searchProfiles]", error);
      return { profiles: [], total: 0 };
    }

    return {
      profiles: (data ?? []) as Record<string, unknown>[],
      total: (count as number) ?? 0,
    };
  } catch (err) {
    console.error("[searchProfiles]", err);
    return { profiles: [], total: 0 };
  }
}

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

  const { error } = await admin.from("marketplace_saved").insert({
    user_id: user.id,
    profile_id: profileId,
  });

  // Ignore duplicate key (23505) — idempotent save
  if (error && (error as { code?: string }).code !== "23505") {
    console.error("[saveProfile]", error);
    return { error: "Something went wrong" };
  }

  // Contact upsert — best-effort industry sync for saved marketplace profile
  try {
    // Fetch the saved profile details + owner email for contact record
    const { data: savedProfile } = await admin.from("marketplace_profiles")
      .select("id, display_name, instagram_handle, user_type, users(email)")
      .eq("id", profileId)
      .maybeSingle();

    if (savedProfile?.users?.email) {
      // Get the saver's collective (first one they belong to)
      const { data: membership } = await admin
        .from("collective_members")
        .select("collective_id")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (membership?.collective_id) {
        await admin.from("contacts").upsert({
          collective_id: membership.collective_id,
          contact_type: "industry",
          email: savedProfile.users.email.toLowerCase().trim(),
          full_name: savedProfile.display_name ?? null,
          source: "marketplace",
          instagram: savedProfile.instagram_handle ?? null,
          marketplace_profile_id: savedProfile.id,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "collective_id,email", ignoreDuplicates: false });
      }
    }
  } catch (contactErr) {
    console.error("[marketplace] Contact upsert on save failed (non-blocking):", contactErr);
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

  const { error } = await admin.from("marketplace_saved")
    .delete()
    .eq("user_id", user.id)
    .eq("profile_id", profileId);

  if (error) {
    console.error("[unsaveProfile]", error);
    return { error: "Something went wrong" };
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

  const { count } = await admin.from("marketplace_saved")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", profileId);

  return (count ?? 0) > 0;
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

  const { data, error } = await admin.from("marketplace_saved")
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

  // Rate limits: per-user (spam velocity) AND per (sender, recipient) pair
  // (prevents one sender from repeatedly messaging the same target, which
  // the per-user limit alone allows). Also triggers recipient email each
  // time, so without the pair limit a single attacker can inbox-spam a
  // target 5/min × N attackers without the target blocking them.
  const { success: rlOk } = await rateLimitStrict(`inquiry:${user.id}`, 5, 60_000);
  if (!rlOk) return { error: "Too many messages. Please wait a moment." };
  const { success: pairOk } = await rateLimitStrict(
    `inquiry:pair:${user.id}:${data.toProfileId}`,
    1,
    86_400_000, // one per target per day
  );
  if (!pairOk) return { error: "You've already messaged this collective today. Wait for their reply." };

  const admin = createAdminClient();

  // Prevent self-inquiry
  const { data: targetProfile } = await admin.from("marketplace_profiles")
    .select("user_id")
    .eq("id", data.toProfileId)
    .maybeSingle();

  if (targetProfile?.user_id === user.id) {
    return { error: "You cannot send an inquiry to yourself" };
  }

  if (data.message && data.message.length > 5000) {
    return { error: "Message is too long" };
  }

  const { error } = await admin.from("marketplace_inquiries").insert({
    from_user_id: user.id,
    to_profile_id: data.toProfileId,
    event_id: data.eventId ?? null,
    message: data.message ?? null,
    inquiry_type: data.inquiryType ?? "general",
    status: "pending",
  });

  if (error) {
    console.error("[sendInquiry]", error);
    return { error: "Something went wrong" };
  }

  // Fire-and-forget: email the profile owner about the inquiry
  const { data: profile } = await admin.from("marketplace_profiles")
    .select("user_id, display_name, users(email)")
    .eq("id", data.toProfileId)
    .maybeSingle();

  // SECURITY: never fall back to CRON_SECRET — these serve different trust boundaries.
  // If INTERNAL_API_SECRET is unset, skip the email entirely rather than sending
  // unauthenticated internal requests.
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const internalSecretOk = !!internalSecret && internalSecret.length >= 16;
  if (!internalSecretOk) {
    console.warn(
      "[marketplace] INTERNAL_API_SECRET is not set or too short — skipping inquiry email"
    );
  }

  if (profile?.users?.email && internalSecretOk) {
    // Must `await` the email fetch — on Vercel the lambda freezes after the
    // server action returns, which silently kills any in-flight requests.
    // Pattern previously caused inquiry emails to fail ~100% of the time in
    // production (same bug fixed in actions/rsvps.ts during MVP audit).
    // Wrapped in try/catch so email failure never blocks inquiry success.
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
            toEmail: profile.users.email,
            toName: profile.display_name,
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
      // Inquiry row is already inserted — surface the failure in logs but
      // don't turn it into a user-visible error. The recipient can still see
      // the inquiry in-app; only the notification email failed.
      console.error("[sendInquiry] notification email failed (non-blocking):", emailErr);
    }
  }

  // Contact upsert — best-effort industry sync for inquiry recipient
  try {
    if (profile?.users?.email) {
      const { data: membership } = await admin
        .from("collective_members")
        .select("collective_id")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (membership?.collective_id) {
        await admin.from("contacts").upsert({
          collective_id: membership.collective_id,
          contact_type: "industry",
          email: profile.users.email.toLowerCase().trim(),
          full_name: profile.display_name ?? null,
          source: "marketplace",
          marketplace_profile_id: data.toProfileId,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "collective_id,email", ignoreDuplicates: false });
      }
    }
  } catch (contactErr) {
    console.error("[marketplace] Contact upsert on inquiry failed (non-blocking):", contactErr);
  }

  revalidatePath("/dashboard/discover");
  return { error: null };
  } catch (err) {
    console.error("[sendInquiry] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}
