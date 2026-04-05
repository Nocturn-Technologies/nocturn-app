"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { syncEventMembers } from "@/app/actions/chat-members";

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
  location?: string | null;
}) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in", artist: null };

  const admin = createAdminClient();
  const slug = slugify(formData.name) + "-" + Math.random().toString(36).slice(2, 6);

  const { data: artist, error } = await admin.from("artists")
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
      metadata: formData.location ? { location: formData.location } : {},
    })
    .select("id, name, slug")
    .maybeSingle();

  if (error) {
    console.error("[createArtist] insert error:", (error as { message: string }).message);
    return { error: "Failed to create artist", artist: null };
  }
  return { error: null, artist: artist as { id: string; name: string; slug: string } };
  } catch (err) {
    console.error("[createArtist] Unexpected error:", err);
    return { error: "Something went wrong", artist: null };
  }
}

export async function addArtistToEvent(formData: {
  eventId: string;
  artistId: string;
  fee: number | null;
  setTime: string | null;
  setDuration: number | null;
  notes: string | null;
}) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Verify user owns this event via collective membership
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", formData.eventId)
    .maybeSingle();
  if (!event) return { error: "Event not found" };

  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount || memberCount === 0) return { error: "Not authorized" };

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

  if (error) {
    console.error("[addArtistToEvent] insert error:", (error as { message: string }).message);
    return { error: "Failed to add artist to event" };
  }

  // Auto-add artist to event chat (non-blocking)
  void syncEventMembers(formData.eventId).catch((err) => console.error("[artists] sync event chat failed:", err));

  // Contact upsert — best-effort industry sync for booked artist
  try {
    const { data: artist } = await admin.from("artists")
      .select("id, name, booking_email, instagram, soundcloud, spotify")
      .eq("id", formData.artistId)
      .maybeSingle();

    if (artist?.booking_email) {
      await admin.from("contacts").upsert({
        collective_id: event.collective_id,
        contact_type: "industry",
        email: artist.booking_email.toLowerCase().trim(),
        full_name: artist.name ?? null,
        source: "artist_booking",
        role: "artist",
        artist_id: artist.id,
        instagram: artist.instagram ?? null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "collective_id,email", ignoreDuplicates: false });
    }
  } catch (contactErr) {
    console.error("[artists] Contact upsert on booking failed (non-blocking):", contactErr);
  }

  return { error: null };
  } catch (err) {
    console.error("[addArtistToEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function updateBookingStatus(formData: {
  eventArtistId: string;
  status: "pending" | "confirmed" | "declined" | "cancelled";
}) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Look up the event_artist to get event_id, then verify ownership
  const { data: ea } = await admin.from("event_artists")
    .select("event_id")
    .eq("id", formData.eventArtistId)
    .maybeSingle();
  if (!ea) return { error: "Booking not found" };

  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", ea.event_id)
    .maybeSingle();
  if (!event) return { error: "Event not found" };

  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount || memberCount === 0) return { error: "Not authorized" };

  const { error } = await admin.from("event_artists")
    .update({ status: formData.status })
    .eq("id", formData.eventArtistId);

  if (error) {
    console.error("[updateBookingStatus] update error:", (error as { message: string }).message);
    return { error: "Failed to update booking status" };
  }
  return { error: null };
  } catch (err) {
    console.error("[updateBookingStatus] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}
