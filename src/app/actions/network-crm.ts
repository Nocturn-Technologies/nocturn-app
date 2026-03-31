"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RelationshipTag = "Booked" | "Saved" | "Connected";

export interface IndustryContact {
  id: string;
  name: string;
  type: string; // matches marketplace user_type values
  avatarUrl: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  instagramHandle: string | null;
  soundcloudUrl: string | null;
  spotifyUrl: string | null;
  websiteUrl: string | null;
  eventsWorked: number;
  lastCollabDate: string | null;
  isSaved: boolean;
  relationships: RelationshipTag[];
  // For marketplace profile contacts — used to contact via dialog
  profileId: string | null;
  slug: string | null;
  // Set when contact comes from the unified contacts table
  _contactsTableId?: string;
}

export interface NetworkCRMStats {
  totalContacts: number;
  bookedArtists: number;
  savedProfiles: number;
  cities: number;
}

export interface NetworkCRMResult {
  error: string | null;
  contacts: IndustryContact[];
  stats: NetworkCRMStats;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getCollectiveIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId)
    .is("deleted_at", null);

  return (data as { collective_id: string }[] | null)?.map((m) => m.collective_id) ?? [];
}

// ── Main Action ────────────────────────────────────────────────────────────────

export async function getNetworkCRM(): Promise<NetworkCRMResult> {
  const empty: NetworkCRMResult = {
    error: null,
    contacts: [],
    stats: { totalContacts: 0, bookedArtists: 0, savedProfiles: 0, cities: 0 },
  };

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ...empty, error: "Not logged in" };

    const admin = createAdminClient();
    const collectiveIds = await getCollectiveIds(user.id);

    // ── Parallel data fetches ─────────────────────────────────────────────────

    const [
      savedResult,
      contactedResult,
      eventsResult,
    ] = await Promise.all([
      // 1. Saved marketplace profiles
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin.from("marketplace_saved") as any)
        .select("profile_id, saved_at:created_at, marketplace_profiles(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),

      // 2. Marketplace profiles the user has contacted (sent inquiry to)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin.from("marketplace_inquiries") as any)
        .select("to_profile_id, created_at")
        .eq("from_user_id", user.id)
        .order("created_at", { ascending: false }),

      // 3. Events for the user's collectives (to look up booked artists)
      collectiveIds.length > 0
        ? admin
            .from("events")
            .select("id, starts_at")
            .in("collective_id", collectiveIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // ── Process saved profiles ─────────────────────────────────────────────────

    type SavedRow = {
      profile_id: string;
      saved_at: string;
      marketplace_profiles: Record<string, unknown> | null;
    };

    const savedRows = (savedResult.data ?? []) as SavedRow[];
    const savedProfileIds = new Set(savedRows.map((r) => r.profile_id));

    // Build a map of profileId -> marketplace profile data
    const mpProfileMap = new Map<string, Record<string, unknown>>();
    for (const row of savedRows) {
      if (row.marketplace_profiles) {
        mpProfileMap.set(row.profile_id, row.marketplace_profiles);
      }
    }

    // ── Process contacted profiles ─────────────────────────────────────────────

    type ContactedRow = { to_profile_id: string; created_at: string };
    const contactedRows = (contactedResult.data ?? []) as ContactedRow[];
    const contactedProfileIds = new Set(contactedRows.map((r) => r.to_profile_id));

    // For contacted profiles that aren't already in our map, fetch them
    const missingProfileIds = [...contactedProfileIds].filter(
      (id) => !mpProfileMap.has(id)
    );

    if (missingProfileIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: missingProfiles } = await (admin.from("marketplace_profiles") as any)
        .select("*")
        .in("id", missingProfileIds);

      for (const p of (missingProfiles ?? []) as Record<string, unknown>[]) {
        mpProfileMap.set(p.id as string, p);
      }
    }

    // ── Process booked artists ─────────────────────────────────────────────────

    const events = (eventsResult.data ?? []) as { id: string; starts_at: string }[];
    const eventIds = events.map((e) => e.id);
    const eventDateMap = new Map(events.map((e) => [e.id, e.starts_at]));

    type EventArtistRow = {
      artist_id: string;
      event_id: string;
      artists: {
        id: string;
        name: string;
        slug: string | null;
        instagram: string | null;
        soundcloud: string | null;
        spotify: string | null;
        bio: string | null;
        genre: string[] | null;
        metadata: Record<string, unknown> | null;
      } | null;
    };

    let eventArtistRows: EventArtistRow[] = [];
    if (eventIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: eaData } = await (admin.from("event_artists") as any)
        .select("artist_id, event_id, artists(id, name, slug, instagram, soundcloud, spotify, bio, genre, metadata)")
        .in("event_id", eventIds)
        .in("status", ["confirmed", "pending"]);

      eventArtistRows = (eaData ?? []) as EventArtistRow[];
    }

    // Group event_artists by artist_id
    type ArtistBookingAgg = {
      artist: EventArtistRow["artists"];
      eventIds: string[];
      dates: string[];
    };

    const artistBookings = new Map<string, ArtistBookingAgg>();
    for (const row of eventArtistRows) {
      if (!row.artists) continue;
      const existing = artistBookings.get(row.artist_id);
      const date = eventDateMap.get(row.event_id) ?? null;
      if (existing) {
        existing.eventIds.push(row.event_id);
        if (date) existing.dates.push(date);
      } else {
        artistBookings.set(row.artist_id, {
          artist: row.artists,
          eventIds: [row.event_id],
          dates: date ? [date] : [],
        });
      }
    }

    // ── Build unified contact list ─────────────────────────────────────────────

    // We'll deduplicate by a "contact key":
    //   - Marketplace profiles: keyed by profile ID
    //   - Artists (from event_artists): keyed by artist ID (if no matching marketplace profile found)
    //
    // Priority: if an artist has a marketplace profile (same user), unify them.

    const contactMap = new Map<string, IndustryContact>();

    // First, add all marketplace profile contacts (saved + contacted)
    const allMpIds = new Set([...savedProfileIds, ...contactedProfileIds]);
    for (const profileId of allMpIds) {
      const profile = mpProfileMap.get(profileId);
      if (!profile) continue;

      const relationships: RelationshipTag[] = [];
      if (savedProfileIds.has(profileId)) relationships.push("Saved");
      if (contactedProfileIds.has(profileId)) relationships.push("Connected");

      // Determine lastCollabDate from contacted rows
      const latestContact = contactedRows
        .filter((r) => r.to_profile_id === profileId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      contactMap.set(`mp:${profileId}`, {
        id: profileId,
        name: (profile.display_name as string) ?? "Unknown",
        type: (profile.user_type as string) ?? "artist",
        avatarUrl: (profile.avatar_url as string) ?? null,
        city: (profile.city as string) ?? null,
        email: null,
        phone: null,
        instagramHandle: (profile.instagram_handle as string) ?? null,
        soundcloudUrl: (profile.soundcloud_url as string) ?? null,
        spotifyUrl: (profile.spotify_url as string) ?? null,
        websiteUrl: (profile.website_url as string) ?? null,
        eventsWorked: 0,
        lastCollabDate: latestContact?.created_at ?? null,
        isSaved: savedProfileIds.has(profileId),
        relationships,
        profileId,
        slug: (profile.slug as string) ?? null,
      });
    }

    // Then, add booked artists — merging with marketplace profile if found by user_id/slug
    for (const [artistId, booking] of artistBookings.entries()) {
      const { artist, eventIds: artistEventIds, dates } = booking;
      if (!artist) continue;

      const sortedDates = [...dates].sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      );
      const lastCollabDate = sortedDates[0] ?? null;

      // Check if this artist has a marketplace profile we already know about
      // We match by slug (artists.slug == marketplace_profiles.slug is possible)
      // Simple approach: check if any marketplace profile has same display_name (best effort)
      // For now, treat booked artists as separate contacts unless they have a marketplace profile

      const key = `artist:${artistId}`;
      // Don't add if we already have this as a marketplace contact with matching name
      // (rough dedup — marketplace profiles are the canonical source)

      if (!contactMap.has(key)) {
        const location = (artist.metadata?.location as string) ?? null;

        contactMap.set(key, {
          id: artistId,
          name: artist.name,
          type: "artist",
          avatarUrl: null,
          city: location,
          email: null,
          phone: null,
          instagramHandle: artist.instagram ?? null,
          soundcloudUrl: artist.soundcloud ?? null,
          spotifyUrl: artist.spotify ?? null,
          websiteUrl: null,
          eventsWorked: artistEventIds.length,
          lastCollabDate,
          isSaved: false,
          relationships: ["Booked"],
          profileId: null,
          slug: artist.slug ?? null,
        });
      } else {
        // Already exists as marketplace profile — update booking info
        const existing = contactMap.get(key)!;
        existing.eventsWorked = artistEventIds.length;
        if (!existing.relationships.includes("Booked")) {
          existing.relationships.unshift("Booked");
        }
        if (
          lastCollabDate &&
          (!existing.lastCollabDate ||
            new Date(lastCollabDate) > new Date(existing.lastCollabDate))
        ) {
          existing.lastCollabDate = lastCollabDate;
        }
      }
    }

    // ── Sort: Booked (most recent first) → Saved → Connected ─────────────────

    const relationshipOrder = (c: IndustryContact): number => {
      if (c.relationships.includes("Booked")) return 0;
      if (c.relationships.includes("Saved")) return 1;
      return 2;
    };

    const contacts = Array.from(contactMap.values()).sort((a, b) => {
      const orderDiff = relationshipOrder(a) - relationshipOrder(b);
      if (orderDiff !== 0) return orderDiff;

      // Within same group, sort by most recent lastCollabDate
      const aDate = a.lastCollabDate ? new Date(a.lastCollabDate).getTime() : 0;
      const bDate = b.lastCollabDate ? new Date(b.lastCollabDate).getTime() : 0;
      return bDate - aDate;
    });

    // ── Stats ─────────────────────────────────────────────────────────────────

    const bookedArtists = contacts.filter((c) => c.relationships.includes("Booked")).length;
    const savedProfilesCount = contacts.filter((c) => c.relationships.includes("Saved")).length;
    const cities = new Set(contacts.map((c) => c.city).filter(Boolean)).size;

    return {
      error: null,
      contacts,
      stats: {
        totalContacts: contacts.length,
        bookedArtists,
        savedProfiles: savedProfilesCount,
        cities,
      },
    };
  } catch (err) {
    console.error("[network-crm] getNetworkCRM failed:", err);
    return { ...empty, error: "Failed to load network." };
  }
}
