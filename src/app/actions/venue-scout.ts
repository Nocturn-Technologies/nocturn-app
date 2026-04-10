"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

interface ScoutNote {
  place_id: string;
  sound_quality: number;
  crowd_estimate: number | null;
  vibe_notes: string;
  scouted_at: string;
}

export async function saveVenueScoutNotes(notes: ScoutNote) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not logged in" };

    // Validate input fields
    if (!notes.place_id?.trim()) return { error: "Place ID is required" };

    if (typeof notes.sound_quality !== "number" || notes.sound_quality < 1 || notes.sound_quality > 10 || !Number.isInteger(notes.sound_quality)) {
      return { error: "Sound quality must be an integer between 1 and 10" };
    }

    if (notes.crowd_estimate != null) {
      if (typeof notes.crowd_estimate !== "number" || notes.crowd_estimate < 0 || notes.crowd_estimate > 100000 || !Number.isInteger(notes.crowd_estimate)) {
        return { error: "Crowd estimate must be a positive integer under 100,000" };
      }
    }

    if (typeof notes.vibe_notes !== "string" || notes.vibe_notes.trim().length === 0) {
      return { error: "Vibe notes are required" };
    }
    if (notes.vibe_notes.length > 2000) {
      return { error: "Vibe notes must be under 2,000 characters" };
    }

    if (!notes.scouted_at?.trim()) return { error: "Scouted date is required" };
    // Validate ISO date format
    const scoutedDate = new Date(notes.scouted_at);
    if (isNaN(scoutedDate.getTime())) {
      return { error: "Invalid scouted date format" };
    }

    const admin = createAdminClient();

    // Get the saved venue row for this place_id
    const { data: savedVenue } = await admin
      .from("saved_venues")
      .select("id, notes")
      .eq("user_id", user.id)
      .eq("place_id", notes.place_id)
      .maybeSingle();

    if (!savedVenue) {
      return { error: "Venue not found in your saved venues" };
    }

    // NOTE: saved_venues.notes is a TEXT column per generated DB types.
    // We persist the notes array as a JSON-encoded string, and parse on read.
    // TODO(audit): table also lacks user_id/place_id columns — the query at line 55-56
    // references fields that don't exist on saved_venues. This whole function needs
    // a schema refactor to either add user_id/place_id or rewrite queries against
    // the actual collective_id/venue_id columns.
    let existingNotes: Array<Record<string, unknown>> = [];
    if (typeof savedVenue.notes === "string" && savedVenue.notes.trim().length > 0) {
      try {
        const parsed = JSON.parse(savedVenue.notes);
        if (Array.isArray(parsed)) existingNotes = parsed;
      } catch {
        existingNotes = [];
      }
    }

    const updatedNotes = [
      ...existingNotes,
      {
        sound_quality: notes.sound_quality,
        crowd_estimate: notes.crowd_estimate,
        vibe_notes: notes.vibe_notes,
        scouted_at: notes.scouted_at,
      },
    ];

    const { error } = await admin
      .from("saved_venues")
      .update({ notes: JSON.stringify(updatedNotes) })
      .eq("id", savedVenue.id);

    if (error) return { error: "Something went wrong" };
    return { error: null };
  } catch (err) {
    console.error("[saveVenueScoutNotes]", err);
    return { error: "Something went wrong" };
  }
}
