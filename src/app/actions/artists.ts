"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { syncEventMembers } from "@/app/actions/chat-members";
import type { Json } from "@/lib/supabase/database.types";

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
  website?: string | null;
}) {
  try {
  // Name: trim, cap 200, require non-empty
  const trimmedName = formData?.name?.trim() ?? "";
  if (!trimmedName) return { error: "Artist name is required", artist: null };
  if (trimmedName.length > 200) return { error: "Artist name must be under 200 characters", artist: null };

  // Bio: cap 2000
  let sanitizedBio: string | null = null;
  if (formData.bio != null) {
    if (typeof formData.bio !== "string") return { error: "Invalid bio", artist: null };
    if (formData.bio.length > 2000) return { error: "Bio must be under 2,000 characters", artist: null };
    sanitizedBio = formData.bio;
  }

  // Social handles: cap 100
  const capSocial = (field: string | null, label: string): { value: string | null; error: string | null } => {
    if (field == null) return { value: null, error: null };
    if (typeof field !== "string") return { value: null, error: `Invalid ${label}` };
    if (field.length > 100) return { value: null, error: `${label} must be under 100 characters` };
    return { value: field, error: null };
  };
  const ig = capSocial(formData.instagram, "Instagram");
  if (ig.error) return { error: ig.error, artist: null };
  const sc = capSocial(formData.soundcloud, "SoundCloud");
  if (sc.error) return { error: sc.error, artist: null };
  const sp = capSocial(formData.spotify, "Spotify");
  if (sp.error) return { error: sp.error, artist: null };

  // Website: cap 300, require https:// if present
  let sanitizedWebsite: string | null = null;
  if (formData.website != null && formData.website !== "") {
    if (typeof formData.website !== "string" || formData.website.length > 300) {
      return { error: "Invalid website URL", artist: null };
    }
    if (!/^https:\/\//i.test(formData.website)) {
      return { error: "Website must start with https://", artist: null };
    }
    sanitizedWebsite = formData.website;
  }

  // Booking email: validate format
  let sanitizedEmail: string | null = null;
  if (formData.bookingEmail != null && formData.bookingEmail !== "") {
    if (typeof formData.bookingEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.bookingEmail)) {
      return { error: "Invalid booking email", artist: null };
    }
    sanitizedEmail = formData.bookingEmail;
  }

  // Default fee: finite, 0 to 1_000_000
  let sanitizedFee: number | null = null;
  if (formData.defaultFee != null) {
    if (!Number.isFinite(formData.defaultFee) || formData.defaultFee < 0 || formData.defaultFee > 1_000_000) {
      return { error: "Invalid default fee", artist: null };
    }
    sanitizedFee = formData.defaultFee;
  }

  // Genre: cap 10 items, each max 50 chars
  let sanitizedGenre: string[] = [];
  if (formData.genre != null) {
    if (!Array.isArray(formData.genre)) return { error: "Invalid genre", artist: null };
    sanitizedGenre = formData.genre
      .slice(0, 10)
      .map((g) => (typeof g === "string" ? g.trim().slice(0, 50) : ""))
      .filter((g) => g.length > 0);
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in", artist: null };

  const admin = createAdminClient();
  const slug = slugify(trimmedName) + "-" + Math.random().toString(36).slice(2, 6);

  const metadata: Record<string, unknown> = {};
  if (formData.location) metadata.location = formData.location;
  if (sanitizedWebsite) metadata.website = sanitizedWebsite;

  const { data: artist, error } = await admin.from("artists")
    .insert({
      name: trimmedName,
      slug,
      bio: sanitizedBio,
      genre: sanitizedGenre,
      instagram: ig.value,
      soundcloud: sc.value,
      spotify: sp.value,
      booking_email: sanitizedEmail,
      default_fee: sanitizedFee,
      metadata: metadata as unknown as Json,
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
  if (!formData?.eventId?.trim()) return { error: "Event ID is required" };
  if (!formData?.artistId?.trim()) return { error: "Artist ID is required" };

  // Validate fee: finite, 0 to 1_000_000
  if (formData.fee != null) {
    if (!Number.isFinite(formData.fee) || formData.fee < 0 || formData.fee > 1_000_000) {
      return { error: "Invalid fee" };
    }
  }

  // Validate setDuration: integer, 0 to 480
  if (formData.setDuration != null) {
    if (!Number.isInteger(formData.setDuration) || formData.setDuration < 0 || formData.setDuration > 480) {
      return { error: "Invalid set duration" };
    }
  }

  // Cap notes at 1000 chars
  let sanitizedNotes: string | null = null;
  if (formData.notes != null) {
    if (typeof formData.notes !== "string") return { error: "Invalid notes" };
    if (formData.notes.length > 1000) return { error: "Notes must be under 1,000 characters" };
    sanitizedNotes = formData.notes;
  }

  // Validate setTime: HH:MM (24h) or ISO date string
  if (formData.setTime != null && formData.setTime !== "") {
    if (typeof formData.setTime !== "string") return { error: "Invalid set time" };
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    const isoOk = !Number.isNaN(Date.parse(formData.setTime));
    if (!hhmm.test(formData.setTime) && !isoOk) {
      return { error: "Invalid set time" };
    }
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Verify user owns this event via collective membership
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", formData.eventId)
    .maybeSingle();
  if (eventError) {
    console.error("[addArtistToEvent] event lookup failed:", eventError);
    return { error: "Something went wrong" };
  }
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
    notes: sanitizedNotes,
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
  if (!formData?.eventArtistId?.trim()) return { error: "Booking ID is required" };
  if (!formData?.status || !["pending", "confirmed", "declined", "cancelled"].includes(formData.status)) return { error: "Invalid status" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Look up the event_artist to get event_id, then verify ownership
  const { data: ea, error: eaError } = await admin.from("event_artists")
    .select("event_id")
    .eq("id", formData.eventArtistId)
    .maybeSingle();
  if (eaError) {
    console.error("[updateBookingStatus] booking lookup failed:", eaError);
    return { error: "Something went wrong" };
  }
  if (!ea) return { error: "Booking not found" };

  const { data: event, error: eventErr } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", ea.event_id)
    .maybeSingle();
  if (eventErr) {
    console.error("[updateBookingStatus] event lookup failed:", eventErr);
    return { error: "Something went wrong" };
  }
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
