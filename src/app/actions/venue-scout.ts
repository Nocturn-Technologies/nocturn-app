"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface ScoutNote {
  place_id: string;
  sound_quality: number;
  crowd_estimate: number | null;
  vibe_notes: string;
  scouted_at: string;
}

export async function saveVenueScoutNotes(notes: ScoutNote) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Get the saved venue row for this place_id
  const { data: savedVenue } = await admin
    .from("saved_venues")
    .select("id, venue_notes")
    .eq("user_id", user.id)
    .eq("place_id", notes.place_id)
    .maybeSingle();

  if (!savedVenue) {
    return { error: "Venue not found in your saved venues" };
  }

  // Append to existing notes array (stored as JSONB)
  const existingNotes = Array.isArray(savedVenue.venue_notes)
    ? savedVenue.venue_notes
    : [];

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
    .update({ venue_notes: updatedNotes })
    .eq("id", savedVenue.id);

  if (error) return { error: error.message };
  return { error: null };
}
