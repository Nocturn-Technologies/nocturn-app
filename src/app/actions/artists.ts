"use server";
import { revalidatePath } from "next/cache";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

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
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in", artist: null };

  const admin = createAdminClient();
  const slug = slugify(formData.name) + "-" + Math.random().toString(36).slice(2, 6);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: artist, error } = await (admin.from("artists") as any)
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

  if (error) return { error: (error as { message: string }).message, artist: null };
  return { error: null, artist: artist as { id: string; name: string; slug: string } };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("event_artists") as any).insert({
    event_id: formData.eventId,
    artist_id: formData.artistId,
    fee: formData.fee,
    set_time: formData.setTime,
    set_duration: formData.setDuration,
    status: "pending",
    booked_by: user.id,
    notes: formData.notes,
  });

  if (error) return { error: (error as { message: string }).message };

  // Contact upsert — best-effort industry sync for booked artist
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: artist } = await (admin.from("artists") as any)
      .select("id, name, booking_email, instagram, soundcloud, spotify")
      .eq("id", formData.artistId)
      .maybeSingle();

    if (artist?.booking_email) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from("contacts") as any).upsert({
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

  // Look up the event_artist to get event_id, then verify ownership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ea } = await (admin.from("event_artists") as any)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("event_artists") as any)
    .update({ status: formData.status })
    .eq("id", formData.eventArtistId);

  if (error) return { error: (error as { message: string }).message };
  return { error: null };
}
