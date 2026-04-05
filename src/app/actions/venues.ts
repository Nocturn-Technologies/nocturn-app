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

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    const admin = createAdminClient();

    // Get user's collective
    const { data: membership } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (!membership) return { error: "You must belong to a collective to save venues" };

    // Upsert the venue into the venues table (use place_id in metadata to deduplicate)
    const slug = slugify(venue.name) + "-" + venue.place_id.slice(-6);

    const { data: existingVenue } = await admin
      .from("venues")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    let venueId: string;

    if (existingVenue) {
      venueId = existingVenue.id;
    } else {
      const { data: newVenue, error: venueError } = await admin
        .from("venues")
        .insert({
          name: venue.name,
          slug,
          address: venue.address,
          city: venue.city,
          capacity: venue.capacity,
          latitude: venue.latitude,
          longitude: venue.longitude,
          website: venue.website,
          metadata: {
            place_id: venue.place_id,
            neighbourhood: venue.neighbourhood,
            venue_type: venue.venue_type,
            review_count: venue.review_count,
            phone: venue.phone,
            photo_url: venue.photo_url,
            hours: venue.hours,
            rating: venue.rating,
          },
        })
        .select("id")
        .single();

      if (venueError || !newVenue) return { error: "Failed to save venue" };
      venueId = newVenue.id;
    }

    // Link venue to collective via saved_venues
    const { error } = await admin.from("saved_venues").upsert(
      {
        collective_id: membership.collective_id,
        venue_id: venueId,
        rating: venue.rating,
      },
      { onConflict: "collective_id,venue_id" }
    );

    if (error) return { error: "Failed to save venue" };
    return { error: null };
  } catch (err) {
    console.error("[saveVenue]", err);
    return { error: "Something went wrong" };
  }
}

export async function removeSavedVenue(venueId: string) {
  try {
    if (!venueId?.trim()) return { error: "Venue ID is required" };

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    const admin = createAdminClient();

    // Get user's collective
    const { data: membership } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (!membership) return { error: "Not a member of any collective" };

    const { error } = await admin
      .from("saved_venues")
      .delete()
      .eq("collective_id", membership.collective_id)
      .eq("venue_id", venueId);

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

    // Get user's collective
    const { data: membership } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (!membership) return { error: "Not a member of any collective", venues: [] };

    const { data, error } = await admin
      .from("saved_venues")
      .select("*, venues(*)")
      .eq("collective_id", membership.collective_id)
      .order("created_at", { ascending: false });

    if (error) return { error: "Failed to load saved venues", venues: [] };
    return { error: null, venues: data ?? [] };
  } catch (err) {
    console.error("[getSavedVenues]", err);
    return { error: "Something went wrong", venues: [] };
  }
}
