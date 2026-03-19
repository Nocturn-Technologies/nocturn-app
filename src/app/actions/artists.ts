"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createArtist(formData: {
  name: string;
  bio: string | null;
  genre: string[];
  instagram: string | null;
  soundcloud: string | null;
  spotify: string | null;
  bookingEmail: string | null;
  defaultFee: number | null;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in", artist: null };

  const admin = createAdminClient();
  const slug = slugify(formData.name) + "-" + Math.random().toString(36).slice(2, 6);

  const { data: artist, error } = await admin
    .from("artists")
    .insert({
      name: formData.name,
      slug,
      bio: formData.bio,
      genre: formData.genre,
      instagram: formData.instagram,
      soundcloud: formData.soundcloud,
      spotify: formData.spotify,
      booking_email: formData.bookingEmail,
      default_fee: formData.defaultFee,
    })
    .select("id, name, slug")
    .single();

  if (error) return { error: error.message, artist: null };
  return { error: null, artist };
}

export async function addArtistToEvent(formData: {
  eventId: string;
  artistId: string;
  fee: number | null;
  setTime: string | null;
  setDuration: number | null;
  notes: string | null;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  const { error } = await admin.from("event_artists").insert({
    event_id: formData.eventId,
    artist_id: formData.artistId,
    fee: formData.fee,
    set_time: formData.setTime,
    set_duration: formData.setDuration,
    status: "pending",
    booked_by: user.id,
    notes: formData.notes,
  });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateBookingStatus(formData: {
  eventArtistId: string;
  status: "pending" | "confirmed" | "declined" | "cancelled";
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  const { error } = await admin
    .from("event_artists")
    .update({ status: formData.status })
    .eq("id", formData.eventArtistId);

  if (error) return { error: error.message };
  return { error: null };
}
