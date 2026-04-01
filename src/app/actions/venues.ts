"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import type { VenueResult } from "@/lib/mock-venues";

export async function saveVenue(venue: VenueResult) {
  try {
    if (!venue?.place_id?.trim() || !venue?.name?.trim()) {
      return { error: "Venue details are required" };
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    const admin = createAdminClient();

    const { error } = await admin.from("saved_venues").insert({
      user_id: user.id,
      place_id: venue.place_id,
      name: venue.name,
      address: venue.address,
      city: venue.city,
      neighbourhood: venue.neighbourhood,
      venue_type: venue.venue_type,
      rating: venue.rating,
      review_count: venue.review_count,
      phone: venue.phone,
      website: venue.website,
      capacity: venue.capacity,
      photo_url: venue.photo_url,
      hours: venue.hours,
      latitude: venue.latitude,
      longitude: venue.longitude,
    });

    if (error) return { error: "Failed to save venue" };
    return { error: null };
  } catch (err) {
    console.error("[saveVenue]", err);
    return { error: "Something went wrong" };
  }
}

export async function removeSavedVenue(placeId: string) {
  try {
    if (!placeId?.trim()) return { error: "Venue ID is required" };

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
      .eq("place_id", placeId);

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

    const { data, error } = await admin
      .from("saved_venues")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return { error: "Failed to load saved venues", venues: [] };
    return { error: null, venues: data ?? [] };
  } catch (err) {
    console.error("[getSavedVenues]", err);
    return { error: "Something went wrong", venues: [] };
  }
}
