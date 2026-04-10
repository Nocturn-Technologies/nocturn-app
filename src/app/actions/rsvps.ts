"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

// ── Types ──

export type RsvpStatus = "yes" | "maybe" | "no";

interface SubmitRsvpInput {
  eventId: string;
  status: RsvpStatus;
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  plusOnes?: number | null;
  message?: string | null;
}

// Phone: allow leading +, digits, spaces, dashes, parens, dots. Require 7-15 digits.
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  // Preserve formatting but cap length for DB safety
  return trimmed.slice(0, 32);
}

// ── Submit RSVP (public — attendees) ──

export async function submitRsvp(input: SubmitRsvpInput): Promise<{ error: string | null }> {
  try {
    // Basic validation
    if (!input.eventId?.trim()) return { error: "Event ID is required" };
    if (!["yes", "maybe", "no"].includes(input.status)) return { error: "Invalid RSVP status" };

    // UUID shape
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.eventId)) {
      return { error: "Invalid event ID" };
    }

    // Plus ones bounds
    const plusOnes = typeof input.plusOnes === "number" ? input.plusOnes : 0;
    if (!Number.isInteger(plusOnes) || plusOnes < 0 || plusOnes > 10) {
      return { error: "Plus-ones must be between 0 and 10" };
    }

    // Name cap
    let fullName: string | null = null;
    if (input.fullName != null) {
      if (typeof input.fullName !== "string") return { error: "Invalid name" };
      const trimmed = input.fullName.trim();
      if (trimmed.length > 200) return { error: "Name must be under 200 characters" };
      fullName = trimmed || null;
    }

    // Message cap
    let message: string | null = null;
    if (input.message != null) {
      if (typeof input.message !== "string") return { error: "Invalid message" };
      if (input.message.length > 1000) return { error: "Message must be under 1,000 characters" };
      message = input.message.trim() || null;
    }

    // Email — required if not logged in
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    let email: string | null = null;
    if (input.email != null && input.email !== "") {
      if (typeof input.email !== "string") return { error: "Invalid email" };
      if (input.email.length > 320) return { error: "Email is too long" };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { error: "Invalid email format" };
      email = input.email.toLowerCase().trim();
    }

    // Phone — required for ALL RSVPs (guests and logged-in users) so the
    // organizer always has a second way to reach the attendee.
    let phone: string | null = null;
    if (input.phone != null && input.phone !== "") {
      if (typeof input.phone !== "string") return { error: "Invalid phone number" };
      if (input.phone.length > 32) return { error: "Phone number is too long" };
      phone = normalizePhone(input.phone);
      if (!phone) return { error: "Please enter a valid phone number" };
    }

    if (!user && !email) {
      return { error: "Email is required to RSVP" };
    }
    // Guest (non-logged-in) RSVPs must also include a name.
    if (!user && (!fullName || fullName.length < 2)) {
      return { error: "Please enter your name" };
    }
    if (!phone) {
      return { error: "Please enter your phone number" };
    }

    // For logged-in users, resolve name + email from their profile and
    // persist the phone back to the users table if it's new or different.
    const adminClient = createAdminClient();
    if (user) {
      const { data: profile } = await adminClient
        .from("users")
        .select("id, full_name, email, phone")
        .eq("auth_id", user.id)
        .maybeSingle();
      if (profile) {
        if (!fullName) fullName = profile.full_name ?? null;
        if (!email) email = profile.email ?? null;
        if (phone && profile.phone !== phone) {
          // Save phone to profile so future RSVPs pre-fill
          await adminClient.from("users").update({ phone }).eq("id", profile.id);
        }
      }
      // Fall back to auth user email if profile didn't have one
      if (!email && user.email) email = user.email.toLowerCase().trim();
    }

    // Rate limit: 10 RSVPs / minute / identity (ip would be better, but user/email is what we have)
    const rlKey = user ? `rsvp:${user.id}` : `rsvp:email:${email}`;
    const { success: rlOk } = await rateLimitStrict(rlKey, 10, 60_000);
    if (!rlOk) return { error: "Too many requests. Please wait a moment." };

    const admin = adminClient;

    // Verify event exists and is published (or preview-able)
    const { data: event, error: eventErr } = await admin
      .from("events")
      .select("id, title, status, collective_id, event_mode, slug, starts_at, venue_id")
      .eq("id", input.eventId)
      .is("deleted_at", null)
      .maybeSingle();

    if (eventErr) {
      console.error("[submitRsvp] event lookup failed:", eventErr);
      return { error: "Something went wrong" };
    }
    if (!event) return { error: "Event not found" };
    if (event.status !== "published") return { error: "This event is not accepting RSVPs" };

    // Upsert: one RSVP per (event, user) or (event, email)
    const row = {
      event_id: input.eventId,
      user_id: user?.id ?? null,
      email,
      phone,
      full_name: fullName,
      status: input.status,
      plus_ones: plusOnes,
      message,
    };

    // Try upsert on user_id first if logged in, else on email
    const onConflict = user ? "event_id,user_id" : "event_id,email";
    const { error } = await admin
      .from("rsvps")
      .upsert(row, { onConflict, ignoreDuplicates: false });

    if (error) {
      console.error("[submitRsvp] upsert error:", error.message);
      return { error: "Failed to submit RSVP" };
    }

    // RSVP fans = collective fans. Feed them through the same CRM backend
    // that ticket buyers use (attendee_profiles + contacts) so they show up in
    // /dashboard/attendees and are targetable for email campaigns without any
    // separate "RSVP list" plumbing. Fire-and-forget — never blocks the RSVP.
    //
    // We only sync when:
    //   - the event has a collective_id, AND
    //   - we have an email (either from the guest or resolved from the user)
    if (event.collective_id) {
      let fanEmail: string | null = email;
      if (!fanEmail && user?.email) fanEmail = user.email.toLowerCase().trim();
      if (fanEmail) {
        try {
          const { syncRsvpFan } = await import("@/lib/analytics");
          syncRsvpFan({
            collectiveId: event.collective_id,
            email: fanEmail,
            fullName,
            phone,
            userId: user?.id ?? null,
            eventId: event.id,
            eventTitle: event.title ?? null,
          });
        } catch (syncErr) {
          // Non-blocking: RSVP is still recorded even if CRM sync fails.
          console.error("[submitRsvp] syncRsvpFan failed:", syncErr);
        }
      }
    }

    // Send RSVP confirmation email (fire-and-forget, never blocks success)
    // Only send on "yes" / "maybe" — no need to confirm a decline.
    const recipient = email || (user?.email ? user.email.toLowerCase().trim() : null);
    if (recipient && input.status !== "no") {
      try {
        // Resolve collective name + venue for a nicer email
        const [{ data: collective }, { data: venue }] = await Promise.all([
          event.collective_id
            ? admin.from("collectives").select("name, slug").eq("id", event.collective_id).maybeSingle()
            : Promise.resolve({ data: null }),
          event.venue_id
            ? admin.from("venues").select("name, city").eq("id", event.venue_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const publicUrl = collective?.slug && event.slug
          ? `https://app.trynocturn.com/e/${collective.slug}/${event.slug}`
          : `https://app.trynocturn.com`;

        const { sendEmail } = await import("@/lib/email/send");
        const { rsvpConfirmationEmail } = await import("@/lib/email/templates");

        void sendEmail({
          to: recipient,
          subject: input.status === "yes"
            ? `You're going to ${event.title} 🎉`
            : `Got it — we'll save you a spot at ${event.title}`,
          html: rsvpConfirmationEmail({
            eventTitle: event.title ?? "the event",
            collectiveName: collective?.name ?? "the collective",
            startsAt: event.starts_at,
            venueName: venue?.name ?? null,
            venueCity: venue?.city ?? null,
            status: input.status,
            eventUrl: publicUrl,
            firstName: (fullName ?? recipient.split("@")[0] ?? "").split(" ")[0] ?? null,
          }),
        }).catch((err) => console.error("[submitRsvp] confirmation email failed:", err));
      } catch (emailErr) {
        // Never let email failure bubble up to the user
        console.error("[submitRsvp] email prep failed:", emailErr);
      }
    }

    revalidatePath("/e/[slug]/[eventSlug]", "page");
    return { error: null };
  } catch (err) {
    console.error("[submitRsvp] Unexpected:", err);
    return { error: "Something went wrong" };
  }
}

// ── Get RSVP counts for an event (public) ──

export async function getRsvpCounts(eventId: string): Promise<{
  error: string | null;
  counts: { yes: number; maybe: number; no: number };
}> {
  try {
    if (!eventId?.trim()) return { error: "Event ID required", counts: { yes: 0, maybe: 0, no: 0 } };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
      return { error: "Invalid event ID", counts: { yes: 0, maybe: 0, no: 0 } };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("event_rsvp_counts")
      .select("status, count")
      .eq("event_id", eventId);

    if (error) {
      console.error("[getRsvpCounts]", error);
      return { error: "Failed to load counts", counts: { yes: 0, maybe: 0, no: 0 } };
    }

    const counts = { yes: 0, maybe: 0, no: 0 };
    for (const row of data || []) {
      const status = row.status as RsvpStatus;
      const count = typeof row.count === "number" ? row.count : Number(row.count ?? 0);
      if (status in counts) counts[status] = count;
    }
    return { error: null, counts };
  } catch (err) {
    console.error("[getRsvpCounts]", err);
    return { error: "Something went wrong", counts: { yes: 0, maybe: 0, no: 0 } };
  }
}

// ── Get my RSVP for an event (logged-in users) ──

export async function getMyRsvp(eventId: string): Promise<{
  error: string | null;
  rsvp: { status: RsvpStatus; plus_ones: number } | null;
}> {
  try {
    if (!eventId?.trim()) return { error: "Event ID required", rsvp: null };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: null, rsvp: null };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("rsvps")
      .select("status, plus_ones")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[getMyRsvp]", error);
      return { error: "Failed to load RSVP", rsvp: null };
    }

    return {
      error: null,
      rsvp: data ? { status: data.status as RsvpStatus, plus_ones: data.plus_ones ?? 0 } : null,
    };
  } catch (err) {
    console.error("[getMyRsvp]", err);
    return { error: "Something went wrong", rsvp: null };
  }
}

// ── List RSVPs for a collective member (dashboard) ──

export async function listEventRsvps(eventId: string): Promise<{
  error: string | null;
  rsvps: Array<{
    id: string;
    status: RsvpStatus;
    full_name: string | null;
    email: string | null;
    plus_ones: number;
    message: string | null;
    created_at: string;
  }>;
}> {
  try {
    if (!eventId?.trim()) return { error: "Event ID required", rsvps: [] };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", rsvps: [] };

    const admin = createAdminClient();

    // Verify user is a member of the collective that owns the event
    const { data: event } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!event) return { error: "Event not found", rsvps: [] };

    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount || memberCount === 0) return { error: "Not authorized", rsvps: [] };

    const { data, error } = await admin
      .from("rsvps")
      .select("id, status, full_name, email, plus_ones, message, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listEventRsvps]", error);
      return { error: "Failed to load RSVPs", rsvps: [] };
    }

    return {
      error: null,
      rsvps: (data || []).map((r) => ({
        id: r.id,
        status: r.status as RsvpStatus,
        full_name: r.full_name,
        email: r.email,
        plus_ones: r.plus_ones ?? 0,
        message: r.message,
        created_at: r.created_at,
      })),
    };
  } catch (err) {
    console.error("[listEventRsvps]", err);
    return { error: "Something went wrong", rsvps: [] };
  }
}
