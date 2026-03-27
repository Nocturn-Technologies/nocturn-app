"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import type { VenueResult } from "@/lib/mock-venues";

export async function saveVenue(venue: VenueResult) {
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

  if (error) return { error: error.message };
  return { error: null };
}

export async function removeSavedVenue(placeId: string) {
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

  if (error) return { error: error.message };
  return { error: null };
}

export async function getSavedVenues() {
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

  if (error) return { error: error.message, venues: [] };
  return { error: null, venues: data ?? [] };
}
