"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// ── Types ──

export interface VenueProfile {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  capacity: number | null;
  amenities: string[] | null;
  photo_url: string | null;
  is_active: boolean;
  is_verified: boolean;
  party_id: string;
  /** Display name from the linked party */
  display_name: string | null;
}

export interface SavedVenue {
  id: string;
  venue_party_id: string | null;
  created_at: string;
  venue: VenueProfile | null;
}

// ── Search venue profiles ──

/**
 * Search venue_profiles by name, city, or address.
 * Results are active venues only, ordered by name.
 */
export async function searchVenueProfiles(query: string): Promise<VenueProfile[]> {
  try {
    const admin = createAdminClient();

    let builder = admin
      .from("venue_profiles")
      .select("id, slug, name, city, address, capacity, amenities, photo_url, is_active, is_verified, party_id, parties(display_name)")
      .eq("is_active", true)
      .order("name");

    if (query.trim()) {
      const sanitized = query.replace(/\\/g, "").replace(/[%_.,()'"`]/g, "").trim();
      if (sanitized) {
        const escaped = sanitized.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
        builder = builder.or(`name.ilike.%${escaped}%,city.ilike.%${escaped}%,address.ilike.%${escaped}%`);
      }
    }

    const { data, error } = await builder.limit(30);
    if (error) {
      console.error("[searchVenueProfiles] error:", error.message);
      return [];
    }

    return ((data ?? []) as unknown as Array<{
      id: string;
      slug: string;
      name: string;
      city: string | null;
      address: string | null;
      capacity: number | null;
      amenities: string[] | null;
      photo_url: string | null;
      is_active: boolean;
      is_verified: boolean;
      party_id: string;
      parties: { display_name: string } | null;
    }>).map((v) => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      city: v.city,
      address: v.address,
      capacity: v.capacity,
      amenities: v.amenities,
      photo_url: v.photo_url,
      is_active: v.is_active,
      is_verified: v.is_verified,
      party_id: v.party_id,
      display_name: v.parties?.display_name ?? null,
    }));
  } catch (err) {
    console.error("[searchVenueProfiles]", err);
    return [];
  }
}

/**
 * Get a single venue profile by slug.
 */
export async function getVenueProfileBySlug(slug: string): Promise<VenueProfile | null> {
  try {
    if (!slug?.trim()) return null;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("venue_profiles")
      .select("id, slug, name, city, address, capacity, amenities, photo_url, is_active, is_verified, party_id, parties(display_name)")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !data) return null;

    const v = data as unknown as {
      id: string;
      slug: string;
      name: string;
      city: string | null;
      address: string | null;
      capacity: number | null;
      amenities: string[] | null;
      photo_url: string | null;
      is_active: boolean;
      is_verified: boolean;
      party_id: string;
      parties: { display_name: string } | null;
    };

    return {
      id: v.id,
      slug: v.slug,
      name: v.name,
      city: v.city,
      address: v.address,
      capacity: v.capacity,
      amenities: v.amenities,
      photo_url: v.photo_url,
      is_active: v.is_active,
      is_verified: v.is_verified,
      party_id: v.party_id,
      display_name: v.parties?.display_name ?? null,
    };
  } catch (err) {
    console.error("[getVenueProfileBySlug]", err);
    return null;
  }
}

// ── Saved venues ──

/**
 * Save a venue profile to the current user's saved venues list.
 * saved_venues links user_id → venue_party_id.
 */
export async function saveVenue(venuePartyId: string): Promise<{ error: string | null }> {
  try {
    if (!venuePartyId?.trim()) return { error: "Venue party ID is required" };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    const admin = createAdminClient();

    // Verify the venue exists
    const { data: venue } = await admin
      .from("venue_profiles")
      .select("id")
      .eq("party_id", venuePartyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!venue) return { error: "Venue not found" };

    // Check if already saved to keep this idempotent
    const { data: existing } = await admin
      .from("saved_venues")
      .select("id")
      .eq("user_id", user.id)
      .eq("venue_party_id", venuePartyId)
      .maybeSingle();

    if (existing) return { error: null }; // Already saved — no-op

    const { error } = await admin
      .from("saved_venues")
      .insert({ user_id: user.id, venue_party_id: venuePartyId });

    if (error) {
      console.error("[saveVenue] insert error:", error);
      return { error: "Failed to save venue" };
    }

    return { error: null };
  } catch (err) {
    console.error("[saveVenue]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Remove a saved venue for the current user.
 */
export async function unsaveVenue(venuePartyId: string): Promise<{ error: string | null }> {
  try {
    if (!venuePartyId?.trim()) return { error: "Venue party ID is required" };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    const admin = createAdminClient();

    const { error } = await admin
      .from("saved_venues")
      .delete()
      .eq("user_id", user.id)
      .eq("venue_party_id", venuePartyId);

    if (error) return { error: "Failed to remove saved venue" };
    return { error: null };
  } catch (err) {
    console.error("[unsaveVenue]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Get all saved venues for the current user, with venue_profiles data joined.
 */
export async function getSavedVenues(): Promise<SavedVenue[]> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("saved_venues")
      .select("id, venue_party_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getSavedVenues] error:", error.message);
      return [];
    }

    const rows = (data ?? []) as Array<{
      id: string;
      venue_party_id: string | null;
      created_at: string;
    }>;

    if (rows.length === 0) return rows.map((r) => ({ ...r, venue: null }));

    // Batch-fetch venue profiles for all saved venue party IDs
    const partyIds = rows.map((r) => r.venue_party_id).filter((id): id is string => !!id);
    const venueMap = new Map<string, VenueProfile>();

    if (partyIds.length > 0) {
      const { data: venueRows } = await admin
        .from("venue_profiles")
        .select("id, slug, name, city, address, capacity, amenities, photo_url, is_active, is_verified, party_id, parties(display_name)")
        .in("party_id", partyIds);

      for (const v of (venueRows ?? []) as unknown as Array<{
        id: string;
        slug: string;
        name: string;
        city: string | null;
        address: string | null;
        capacity: number | null;
        amenities: string[] | null;
        photo_url: string | null;
        is_active: boolean;
        is_verified: boolean;
        party_id: string;
        parties: { display_name: string } | null;
      }>) {
        venueMap.set(v.party_id, {
          id: v.id,
          slug: v.slug,
          name: v.name,
          city: v.city,
          address: v.address,
          capacity: v.capacity,
          amenities: v.amenities,
          photo_url: v.photo_url,
          is_active: v.is_active,
          is_verified: v.is_verified,
          party_id: v.party_id,
          display_name: v.parties?.display_name ?? null,
        });
      }
    }

    return rows.map((r) => ({
      id: r.id,
      venue_party_id: r.venue_party_id,
      created_at: r.created_at,
      venue: r.venue_party_id ? venueMap.get(r.venue_party_id) ?? null : null,
    }));
  } catch (err) {
    console.error("[getSavedVenues]", err);
    return [];
  }
}

/**
 * @deprecated Scout notes storage was removed in the schema rebuild.
 * Use event notes or event_activity for scouting records instead.
 */
export async function saveVenueScoutNotes(_notes: {
  place_id: string;
  sound_quality: number;
  crowd_estimate: number | null;
  vibe_notes: string;
  scouted_at: string;
}): Promise<{ error: string | null }> {
  return { error: "Scout notes storage is not available in the current schema. Please record notes in the event details instead." };
}
