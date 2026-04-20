"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import type { VenueResult } from "@/lib/mock-venues";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function saveVenue(venue: VenueResult) {
  try {
    if (!venue?.place_id?.trim() || !venue?.name?.trim()) {
      return { error: "Venue details are required" };
    }

    // Validate capacity if provided
    if (venue.capacity != null) {
      if (typeof venue.capacity !== "number" || venue.capacity < 0 || venue.capacity > 500000 || !Number.isInteger(venue.capacity)) {
        return { error: "Capacity must be a positive integer under 500,000" };
      }
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    const admin = createAdminClient();

    const slug = slugify(venue.name) + "-" + venue.place_id.slice(-6);

    // Check if a venue_profile with this slug already exists
    const { data: existingVenueProfile } = await admin
      .from("venue_profiles")
      .select("id, party_id")
      .eq("slug", slug)
      .maybeSingle();

    let venuePartyId: string;

    if (existingVenueProfile) {
      venuePartyId = existingVenueProfile.party_id;
    } else {
      // 1. Create a parties record for this venue
      const { data: party, error: partyError } = await admin
        .from("parties")
        .insert({ display_name: venue.name, type: "venue" })
        .select("id")
        .maybeSingle();

      if (partyError || !party) {
        console.error("[saveVenue] party insert error:", partyError?.message);
        return { error: "Failed to save venue" };
      }

      // 2. Create the venue_profile (drop instagram/website/lat/lng — not in schema)
      const { error: vpError } = await admin
        .from("venue_profiles")
        .insert({
          party_id: party.id,
          name: venue.name,
          slug,
          address: venue.address ?? null,
          city: venue.city ?? null,
          capacity: venue.capacity ?? null,
          photo_url: venue.photo_url ?? null,
        });

      if (vpError) {
        console.error("[saveVenue] venue_profiles insert error:", vpError.message);
        return { error: "Failed to save venue" };
      }

      venuePartyId = party.id;
    }

    // Link venue to user via saved_venues (schema: user_id + venue_party_id)
    // Check for existing save first (no unique constraint to rely on for upsert)
    const { count: existingCount } = await admin
      .from("saved_venues")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("venue_party_id", venuePartyId);

    if (!existingCount || existingCount === 0) {
      const { error } = await admin.from("saved_venues").insert({
        user_id: user.id,
        venue_party_id: venuePartyId,
      });
      if (error) return { error: "Failed to save venue" };
    }
    return { error: null };
  } catch (err) {
    console.error("[saveVenue]", err);
    return { error: "Something went wrong" };
  }
}

export async function removeSavedVenue(venuePartyId: string) {
  try {
    if (!venuePartyId?.trim()) return { error: "Venue ID is required" };

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    const admin = createAdminClient();

    const { error } = await admin
      .from("saved_venues")
      .delete()
      .eq("user_id", user.id)
      .eq("venue_party_id", venuePartyId);

    if (error) return { error: "Failed to remove venue" };
    return { error: null };
  } catch (err) {
    console.error("[removeSavedVenue]", err);
    return { error: "Something went wrong" };
  }
}

export async function getSavedVenues() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in", venues: [] };

    const admin = createAdminClient();

    // saved_venues joins to parties via venue_party_id; venue_profiles joins to parties
    const { data, error } = await admin
      .from("saved_venues")
      .select("id, venue_party_id, created_at, parties(id, display_name, venue_profiles(id, slug, name, city, address, capacity, photo_url, cover_photo_url, is_verified, is_active))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return { error: "Failed to load saved venues", venues: [] };
    return { error: null, venues: (data ?? []) as unknown[] };
  } catch (err) {
    console.error("[getSavedVenues]", err);
    return { error: "Something went wrong", venues: [] };
  }
}
