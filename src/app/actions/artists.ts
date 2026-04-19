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
  spotify: string | null;
  bookingEmail: string | null;
  defaultFee: number | null;
  location?: string | null;
  website?: string | null;
  phone?: string | null;
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

  // Spotify handle: cap 100
  const capSocial = (field: string | null, label: string): { value: string | null; error: string | null } => {
    if (field == null) return { value: null, error: null };
    if (typeof field !== "string") return { value: null, error: `Invalid ${label}` };
    if (field.length > 100) return { value: null, error: `${label} must be under 100 characters` };
    return { value: field, error: null };
  };
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
    sanitizedEmail = formData.bookingEmail.toLowerCase().trim();
  }

  // Phone: cap 30 chars, allow digits/spaces/+/-/()
  let sanitizedPhone: string | null = null;
  if (formData.phone != null && formData.phone !== "") {
    if (typeof formData.phone !== "string") return { error: "Invalid phone", artist: null };
    const trimmedPhone = formData.phone.trim();
    if (trimmedPhone.length > 30) return { error: "Phone must be under 30 characters", artist: null };
    if (!/^[\d\s+\-()]+$/.test(trimmedPhone)) return { error: "Phone can only contain digits, spaces, +, -, ()", artist: null };
    sanitizedPhone = trimmedPhone;
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
      spotify: sp.value,
      booking_email: sanitizedEmail,
      phone: sanitizedPhone,
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

  // Validate setTime: HH:MM (24h) or ISO date string. We accept both forms
  // and resolve to a real timestamptz before insert (the column is timestamp
  // with time zone, not a clock time — so a bare "22:00" would otherwise
  // fail at insert time).
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  let setTimeIsHhmm = false;
  if (formData.setTime != null && formData.setTime !== "") {
    if (typeof formData.setTime !== "string") return { error: "Invalid set time" };
    const isoOk = !Number.isNaN(Date.parse(formData.setTime));
    if (hhmm.test(formData.setTime)) {
      setTimeIsHhmm = true;
    } else if (!isoOk) {
      return { error: "Invalid set time" };
    }
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const admin = createAdminClient();

  // Verify user owns this event via collective membership. Also pull
  // starts_at so we can resolve an HH:MM set time against the event date.
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("collective_id, starts_at")
    .eq("id", formData.eventId)
    .maybeSingle();
  if (eventError) {
    console.error("[addArtistToEvent] event lookup failed:", eventError);
    return { error: "Something went wrong" };
  }
  if (!event) return { error: "Event not found" };

  // Resolve HH:MM into a full ISO timestamp anchored to the event's date.
  // If the set time is earlier than the event start (e.g. event starts 22:00,
  // artist plays at 02:00), assume it rolls over to the next day.
  let resolvedSetTime: string | null = null;
  if (formData.setTime != null && formData.setTime !== "") {
    if (setTimeIsHhmm && event.starts_at) {
      const [hh, mm] = formData.setTime.split(":").map(Number);
      const eventStart = new Date(event.starts_at);
      const candidate = new Date(eventStart);
      candidate.setHours(hh, mm, 0, 0);
      if (candidate.getTime() < eventStart.getTime() - 60 * 60 * 1000) {
        candidate.setDate(candidate.getDate() + 1);
      }
      resolvedSetTime = candidate.toISOString();
    } else {
      resolvedSetTime = formData.setTime;
    }
  }

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
    set_time: resolvedSetTime,
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
      .select("id, name, booking_email, spotify")
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

/**
 * Creates a brand-new artist and immediately books them onto an event in a
 * single round-trip. If an email is supplied and `sendInvite` is true, also
 * fires off a Supabase magic-link invite (non-blocking — the booking succeeds
 * even if the invite email fails).
 */
export async function createArtistAndAddToEvent(formData: {
  eventId: string;
  name: string;
  email: string | null;
  phone: string | null;
  fee: number | null;
  setTime: string | null;
  setDuration: number | null;
  notes: string | null;
  sendInvite: boolean;
}) {
  try {
    if (!formData?.eventId?.trim()) return { error: "Event ID is required", artistId: null };

    // Reuse createArtist's validation by calling it directly. It also handles
    // collective ownership / auth via createServerClient under the hood.
    const created = await createArtist({
      name: formData.name,
      bio: null,
      genre: [],
      spotify: null,
      bookingEmail: formData.email,
      defaultFee: formData.fee,
      phone: formData.phone,
    });

    if (created.error || !created.artist) {
      return { error: created.error ?? "Failed to create artist", artistId: null };
    }

    // Book onto the event using the existing pathway (which handles auth,
    // ownership, set-time resolution, chat sync, contact upsert, etc).
    const booked = await addArtistToEvent({
      eventId: formData.eventId,
      artistId: created.artist.id,
      fee: formData.fee,
      setTime: formData.setTime,
      setDuration: formData.setDuration,
      notes: formData.notes,
    });

    if (booked.error) {
      return { error: booked.error, artistId: created.artist.id };
    }

    // Optional magic-link invite. Best-effort — never block the booking on
    // an invite email failure (the artist still exists in the DB and is
    // booked on the event).
    if (formData.sendInvite && formData.email) {
      try {
        const admin = createAdminClient();
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trynocturn.com";
        await admin.auth.admin.inviteUserByEmail(formData.email.toLowerCase().trim(), {
          redirectTo: `${appUrl}/dashboard/artists/me`,
          data: { full_name: formData.name, user_type: "artist", artist_id: created.artist.id },
        });
      } catch (inviteErr) {
        console.error("[createArtistAndAddToEvent] invite failed (non-blocking):", inviteErr);
      }
    }

    return { error: null, artistId: created.artist.id };
  } catch (err) {
    console.error("[createArtistAndAddToEvent] Unexpected error:", err);
    return { error: "Something went wrong", artistId: null };
  }
}
