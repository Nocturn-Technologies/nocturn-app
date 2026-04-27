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

  // Booking email: validate format
  let sanitizedEmail: string | null = null;
  if (formData.bookingEmail != null && formData.bookingEmail !== "") {
    if (typeof formData.bookingEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.bookingEmail)) {
      return { error: "Invalid booking email", artist: null };
    }
    sanitizedEmail = formData.bookingEmail.toLowerCase().trim();
  }

  // Phone: cap 30 chars (stored as contact method separately — validated here for caller convenience)
  if (formData.phone != null && formData.phone !== "") {
    if (typeof formData.phone !== "string") return { error: "Invalid phone", artist: null };
    const trimmedPhone = formData.phone.trim();
    if (trimmedPhone.length > 30) return { error: "Phone must be under 30 characters", artist: null };
    if (!/^[\d\s+\-()]+$/.test(trimmedPhone)) return { error: "Phone can only contain digits, spaces, +, -, ()", artist: null };
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

  // 1. Create the party record
  const { data: party, error: partyError } = await admin
    .from("parties")
    .insert({ display_name: trimmedName, type: "person" })
    .select("id")
    .maybeSingle();

  if (partyError || !party) {
    console.error("[createArtist] party insert error:", partyError?.message);
    return { error: "Failed to create artist", artist: null };
  }

  // 2. Create the artist_profile linked to that party
  const { data: artist, error } = await admin
    .from("artist_profiles")
    .insert({
      party_id: party.id,
      slug,
      bio: sanitizedBio,
      genre: sanitizedGenre,
      spotify: sp.value,
      booking_email: sanitizedEmail,
      default_fee: sanitizedFee,
    })
    .select("id, slug, party_id")
    .maybeSingle();

  if (error) {
    console.error("[createArtist] insert error:", (error as { message: string }).message);
    return { error: "Failed to create artist", artist: null };
  }

  // 3. Store phone as a contact method (best-effort)
  if (formData.phone) {
    const trimmedPhone = formData.phone.trim();
    try {
      await admin.from("party_contact_methods").insert({
        party_id: party.id,
        type: "phone",
        value: trimmedPhone,
        is_primary: true,
      });
    } catch (phoneErr) {
      console.error("[createArtist] phone contact method insert failed (non-blocking):", phoneErr);
    }
  }

  return {
    error: null,
    artist: { id: artist!.id, name: trimmedName, slug: artist!.slug } as {
      id: string;
      name: string;
      slug: string;
    },
  };
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

  // Validate setTime: HH:MM (24h) or ISO date string.
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

  // Look up the artist_profile to get the party_id and display name
  const { data: artistProfile } = await admin
    .from("artist_profiles")
    .select("party_id, booking_email, parties(display_name)")
    .eq("id", formData.artistId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!artistProfile) return { error: "Artist not found" };

  const artistName =
    (artistProfile.parties as { display_name: string } | null)?.display_name ?? "";

  const { error } = await admin.from("event_artists").insert({
    event_id: formData.eventId,
    party_id: artistProfile.party_id,
    name: artistName,
    fee: formData.fee,
    set_time: resolvedSetTime,
    set_length: formData.setDuration,
    notes: sanitizedNotes,
  });

  if (error) {
    console.error("[addArtistToEvent] insert error:", (error as { message: string }).message);
    return { error: "Failed to add artist to event" };
  }

  // Auto-add artist to event chat (non-blocking)
  void syncEventMembers(formData.eventId).catch((err) => console.error("[artists] sync event chat failed:", err));

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

  // event_artists no longer has a status column — store in role instead.
  const { error } = await admin.from("event_artists")
    .update({ role: formData.status })
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
 * fires off a branded Nocturn magic-link invite (non-blocking — the booking
 * succeeds even if the invite email fails).
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

    // Optional invite. Best-effort — never block the booking on an email
    // failure. We send a fully-branded Nocturn email (Resend) with event
    // details + an accept link that takes the artist through a Supabase
    // magic-link sign-in on the landing side. Previously this used
    // `admin.auth.admin.inviteUserByEmail`, which fired Supabase's default
    // template with no event context and off-brand styling.
    if (formData.sendInvite && formData.email) {
      try {
        const sbServer = await createServerClient();
        const { data: { user: currentUser } } = await sbServer.auth.getUser();
        const admin = createAdminClient();
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trynocturn.com";
        const email = formData.email.toLowerCase().trim();

        // Generate a magic link the artist can click to land on /dashboard/artists/me
        // without setting a password.
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: {
            redirectTo: `${appUrl}/dashboard/artists/me`,
            data: { full_name: formData.name, user_type: "artist", artist_id: created.artist.id },
          },
        });
        const actionLink = linkData?.properties?.action_link
          ?? `${appUrl}/login?email=${encodeURIComponent(email)}`;

        // Pull event + collective context for a useful email body.
        const [{ data: eventRow }, { data: collectiveRow }] = await Promise.all([
          admin
            .from("events")
            .select("title, starts_at, venue_name, collective_id")
            .eq("id", formData.eventId)
            .maybeSingle(),
          currentUser
            ? admin
                .from("collective_members")
                .select("collective_id, collectives:collective_id(name)")
                .eq("user_id", currentUser.id)
                .is("deleted_at", null)
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const eventTitle = eventRow?.title ?? "an upcoming event";
        const eventDate = eventRow?.starts_at
          ? new Date(eventRow.starts_at).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
          : "TBD";
        const venueName = eventRow?.venue_name ?? null;
        const collectiveName = ((collectiveRow?.collectives as unknown as { name?: string } | null)?.name) ?? "A collective";
        const setTime = formData.setTime
          ? `${new Date(formData.setTime).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}${formData.setDuration ? ` (${formData.setDuration} min)` : ""}`
          : null;
        const feeDisplay = typeof formData.fee === "number" && formData.fee > 0
          ? `CA$${formData.fee.toFixed(2)}`
          : null;

        const firstName = (formData.name ?? "").trim().split(/\s+/)[0] ?? "there";

        const { lineupInviteEmail } = await import("@/lib/email/templates");
        const { sendEmail } = await import("@/lib/email/send");
        const html = await lineupInviteEmail({
          artistFirstName: firstName,
          collectiveName,
          eventTitle,
          eventDate,
          venueName,
          setTime,
          feeDisplay,
          acceptLink: actionLink,
        });

        const result = await sendEmail({
          to: email,
          subject: `You're booked — ${eventTitle}`,
          html,
        });
        if (result.error) {
          console.error("[createArtistAndAddToEvent] lineup invite email failed:", result.error);
        }
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
