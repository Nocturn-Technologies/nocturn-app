"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RelationshipTag = "Booked" | "Saved" | "Connected";

export interface IndustryContact {
  id: string;
  name: string;
  type: string; // "artist", "venue", "contact", etc.
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
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) {
      console.error("[getCollectiveIds]", error);
      return [];
    }

    return (data as { collective_id: string }[] | null)?.map((m) => m.collective_id) ?? [];
  } catch (err) {
    console.error("[getCollectiveIds]", err);
    return [];
  }
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

    // ── Fetch events for the user's collectives ─────────────────────────────

    const eventsResult = collectiveIds.length > 0
      ? await admin
          .from("events")
          .select("id, starts_at")
          .in("collective_id", collectiveIds)
      : { data: [], error: null };

    const events = (eventsResult.data ?? []) as { id: string; starts_at: string }[];
    const eventIds = events.map((e) => e.id);
    const eventDateMap = new Map(events.map((e) => [e.id, e.starts_at]));

    // ── Fetch booked artists via event_artists ──────────────────────────────
    // event_artists now stores artist name inline + optional party_id link

    type EventArtistRow = {
      id: string;
      event_id: string;
      party_id: string | null;
      name: string;
      role: string | null;
    };

    let eventArtistRows: EventArtistRow[] = [];
    if (eventIds.length > 0) {
      const { data: eaData } = await admin
        .from("event_artists")
        .select("id, event_id, party_id, name, role")
        .in("event_id", eventIds);

      eventArtistRows = (eaData ?? []) as EventArtistRow[];
    }

    // ── Fetch artist_profiles for known party_ids ───────────────────────────

    const artistPartyIds = Array.from(
      new Set(eventArtistRows.map((r) => r.party_id).filter((pid): pid is string => !!pid))
    );

    type ArtistProfileRow = {
      party_id: string;
      slug: string;
      spotify: string | null;
      bio: string | null;
      genre: string[] | null;
      photo_url: string | null;
    };

    const artistProfileMap = new Map<string, ArtistProfileRow>();
    if (artistPartyIds.length > 0) {
      const { data: apData } = await admin
        .from("artist_profiles")
        .select("party_id, slug, spotify, bio, genre, photo_url")
        .in("party_id", artistPartyIds)
        .is("deleted_at", null);

      for (const ap of (apData ?? []) as ArtistProfileRow[]) {
        artistProfileMap.set(ap.party_id, ap);
      }
    }

    // ── Fetch contact methods (email/phone/instagram) for known party_ids ───

    type ContactMethodRow = {
      party_id: string;
      type: string;
      value: string;
      is_primary: boolean;
    };

    const contactMethodsByParty = new Map<string, ContactMethodRow[]>();
    if (artistPartyIds.length > 0) {
      const { data: cmData } = await admin
        .from("party_contact_methods")
        .select("party_id, type, value, is_primary")
        .in("party_id", artistPartyIds);

      for (const cm of (cmData ?? []) as ContactMethodRow[]) {
        if (!contactMethodsByParty.has(cm.party_id)) {
          contactMethodsByParty.set(cm.party_id, []);
        }
        contactMethodsByParty.get(cm.party_id)!.push(cm);
      }
    }

    // ── Build contact map keyed by event_artist.id ──────────────────────────

    // Group event_artist rows by (party_id if present, otherwise by name)
    type BookingAgg = {
      name: string;
      partyId: string | null;
      eventIds: string[];
      dates: string[];
    };

    const bookingMap = new Map<string, BookingAgg>();
    for (const row of eventArtistRows) {
      // Key by party_id if we have one, otherwise by lowercase name
      const key = row.party_id ? `party:${row.party_id}` : `name:${row.name.toLowerCase()}`;
      const date = eventDateMap.get(row.event_id) ?? null;
      const existing = bookingMap.get(key);
      if (existing) {
        existing.eventIds.push(row.event_id);
        if (date) existing.dates.push(date);
      } else {
        bookingMap.set(key, {
          name: row.name,
          partyId: row.party_id,
          eventIds: [row.event_id],
          dates: date ? [date] : [],
        });
      }
    }

    // ── Build unified contact list ──────────────────────────────────────────

    const contactMap = new Map<string, IndustryContact>();

    for (const [key, booking] of bookingMap.entries()) {
      const { name, partyId, eventIds: artistEventIds, dates } = booking;

      const sortedDates = [...dates].sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      );
      const lastCollabDate = sortedDates[0] ?? null;

      let avatarUrl: string | null = null;
      let spotifyUrl: string | null = null;
      let slug: string | null = null;
      let contactEmail: string | null = null;
      let contactPhone: string | null = null;
      let instagramHandle: string | null = null;

      if (partyId) {
        const ap = artistProfileMap.get(partyId);
        if (ap) {
          spotifyUrl = ap.spotify ?? null;
          slug = ap.slug ?? null;
          avatarUrl = ap.photo_url ?? null;
        }

        const cms = contactMethodsByParty.get(partyId) ?? [];
        for (const cm of cms) {
          if (cm.type === "email" && !contactEmail) contactEmail = cm.value;
          if (cm.type === "phone" && !contactPhone) contactPhone = cm.value;
          if (cm.type === "instagram" && !instagramHandle) instagramHandle = cm.value;
        }
      }

      contactMap.set(key, {
        id: partyId ?? key,
        name,
        type: "artist",
        avatarUrl,
        city: null,
        email: contactEmail,
        phone: contactPhone,
        instagramHandle,
        soundcloudUrl: null,
        spotifyUrl,
        websiteUrl: null,
        eventsWorked: artistEventIds.length,
        lastCollabDate,
        isSaved: false,
        relationships: ["Booked"],
        profileId: partyId,
        slug,
      });
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
