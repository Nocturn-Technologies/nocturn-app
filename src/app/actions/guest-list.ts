"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { sendEmail } from "@/lib/email/send";
import { escapeHtml } from "@/lib/html";
import { DEFAULT_TIMEZONE } from "@/lib/utils";
import { verifyCollectiveRole } from "@/lib/auth/ownership";

// Guest-list ops require a role stricter than plain membership —
// door_staff / promoter / admin can manage the list, regular members
// cannot. Composes the shared `verifyCollectiveRole` with an event
// lookup rather than maintaining a second copy of the membership query.
const GUEST_LIST_ROLES = ["admin", "promoter", "door_staff"] as const;

async function verifyEventAccess(eventId: string): Promise<{ error: string | null; userId: string | null }> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", userId: null };

    const admin = createAdminClient();
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      console.error("[verifyEventAccess]", eventError);
      return { error: "Something went wrong", userId: null };
    }
    if (!event) return { error: "Event not found", userId: null };

    const hasRole = await verifyCollectiveRole(user.id, event.collective_id, GUEST_LIST_ROLES);
    if (!hasRole) return { error: "You don't have access to this event", userId: null };

    return { error: null, userId: user.id };
  } catch (err) {
    console.error("[verifyEventAccess]", err);
    return { error: "Something went wrong", userId: null };
  }
}

/**
 * Guest interface presented to the UI.
 *
 * The DB schema (`guest_list`) stores only `checked_in` (boolean) and has no
 * `status`, `phone`, or `checked_in_at` columns. We derive `status` from the
 * boolean and return `null` for fields that no longer exist so that existing
 * UI code compiles without changes.
 */
export interface Guest {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  /** Derived from `checked_in` boolean. Values: "pending" | "checked_in". */
  status: "pending" | "confirmed" | "checked_in" | "no_show";
  phone: string | null;
  plus_ones: number;
  /** Always null — column removed in schema rebuild. */
  checked_in_at: string | null;
  notes: string | null;
  added_by: string | null;
  party_id: string | null;
  created_at: string;
}

// Internal DB row type matching the current schema
interface GuestRow {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  checked_in: boolean;
  plus_ones: number;
  notes: string | null;
  added_by: string | null;
  party_id: string | null;
  created_at: string;
}

function rowToGuest(row: GuestRow): Guest {
  return {
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    email: row.email,
    status: row.checked_in ? "checked_in" : "pending",
    phone: null,
    plus_ones: row.plus_ones,
    checked_in_at: null,
    notes: row.notes,
    added_by: row.added_by,
    party_id: row.party_id,
    created_at: row.created_at,
  };
}

// TODO(audit): add name length cap, email format, phone format, plusOnes bounds 0-20
export async function addGuest(input: {
  eventId: string;
  name: string;
  email?: string | null;
  /** Ignored — `phone` column removed in schema rebuild. Kept for UI compatibility. */
  phone?: string | null;
  plusOnes?: number;
  notes?: string | null;
  addedBy?: string | null;
}) {
  try {
    if (!input.eventId?.trim()) return { error: "Event ID is required" };
    if (!input.name?.trim()) return { error: "Guest name is required" };

    const { error: authError, userId } = await verifyEventAccess(input.eventId);
    if (authError) return { error: authError };

    const supabase = createAdminClient();

    if (input.notes && input.notes.length > 500) return { error: "Notes must be under 500 characters" };

    // Status guard — guest-list edits on completed/archived events shouldn't
    // silently change attendance records after the fact. Draft/published only.
    const { data: eventRow } = await supabase
      .from("events")
      .select("status")
      .eq("id", input.eventId)
      .maybeSingle();
    if (eventRow && eventRow.status !== "draft" && eventRow.status !== "published") {
      return { error: "Can't add guests to a completed or archived event." };
    }

    const { error } = await supabase.from("guest_list").insert({
      event_id: input.eventId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      plus_ones: input.plusOnes ?? 0,
      notes: input.notes?.trim() || null,
      added_by: userId,
    });

    if (error) return { error: "Failed to add guest" };

    // Send notification email to guest (fire-and-forget — don't block on failure)
    const guestEmail = input.email?.trim();
    if (guestEmail) {
      try {
        const { data: event } = await supabase
          .from("events")
          .select("title, starts_at, venue_name, city")
          .eq("id", input.eventId)
          .maybeSingle();

        if (event) {
          const eventDate = new Date(event.starts_at);
          const tz = DEFAULT_TIMEZONE;

          const html = `
            <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090B; color: #FAFAFA;">
              <p style="color: #7B2FF7; font-size: 14px; font-weight: 600;">🌙 nocturn.</p>

              <h2 style="margin: 16px 0 8px; font-size: 22px;">You're on the list ✨</h2>

              <p style="color: #A1A1AA; line-height: 1.6; font-size: 15px;">
                Hey ${escapeHtml(input.name.trim())}, you've been added to the guest list for:
              </p>

              <div style="background: #18181B; border-radius: 12px; padding: 20px; margin: 16px 0;">
                <h3 style="margin: 0 0 12px; font-size: 18px; font-weight: 700;">${escapeHtml(event.title)}</h3>
                <p style="color: #A1A1AA; margin: 4px 0;">📅 ${eventDate.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", timeZone: tz })}</p>
                <p style="color: #A1A1AA; margin: 4px 0;">⏰ ${eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz })}</p>
                ${event.venue_name ? `<p style="color: #A1A1AA; margin: 4px 0;">📍 ${escapeHtml(event.venue_name)}${event.city ? `, ${escapeHtml(event.city)}` : ""}</p>` : ""}
              </div>

              <p style="color: #A1A1AA; line-height: 1.6; font-size: 15px;">
                Just give your name at the door. See you there.
              </p>

              <p style="color: #71717A; font-size: 12px; margin-top: 24px;">
                Sent via Nocturn.
              </p>
            </div>
          `;

          await sendEmail({
            to: guestEmail,
            subject: `You're on the guest list for ${event.title}`,
            html,
          });
        }
      } catch (emailErr) {
        // Log but don't fail the guest addition
        console.error("[addGuest] Failed to send notification email:", emailErr);
      }
    }

    return { error: null };
  } catch (err) {
    console.error("[addGuest]", err);
    return { error: "Something went wrong" };
  }
}

export async function getGuestList(eventId: string): Promise<Guest[]> {
  try {
    if (!eventId?.trim()) return [];

    const { error: authError } = await verifyEventAccess(eventId);
    if (authError) return [];

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("guest_list")
      .select("id, event_id, name, email, checked_in, plus_ones, notes, added_by, party_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getGuestList]", error);
      return [];
    }

    return (data ?? []).map((row) => rowToGuest(row as GuestRow));
  } catch (err) {
    console.error("[getGuestList]", err);
    return [];
  }
}

/** Look up event_id from a guest record and verify access */
async function verifyGuestAccess(guestId: string): Promise<{ error: string | null }> {
  try {
    const supabase = createAdminClient();
    const { data: guest, error: guestError } = await supabase
      .from("guest_list")
      .select("event_id")
      .eq("id", guestId)
      .maybeSingle();

    if (guestError) {
      console.error("[verifyGuestAccess]", guestError);
      return { error: "Something went wrong" };
    }
    if (!guest) return { error: "Guest not found" };
    return verifyEventAccess(guest.event_id);
  } catch (err) {
    console.error("[verifyGuestAccess]", err);
    return { error: "Something went wrong" };
  }
}

export async function checkInGuest(guestId: string) {
  try {
    if (!guestId?.trim()) return { error: "Guest ID is required" };

    const { error: authError } = await verifyGuestAccess(guestId);
    if (authError) return { error: authError };

    const supabase = createAdminClient();

    // Atomic status guard — only check in if not already checked in
    const { data: updated, error } = await supabase
      .from("guest_list")
      .update({ checked_in: true })
      .eq("id", guestId)
      .eq("checked_in", false)
      .select("id");

    if (error) return { error: "Failed to check in guest" };
    if (!updated || updated.length === 0) return { error: "Guest is already checked in" };
    return { error: null };
  } catch (err) {
    console.error("[checkInGuest]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Update guest status. The DB only stores `checked_in` (boolean), so we map
 * the status enum from the UI to that column:
 *   "checked_in" → checked_in = true
 *   "pending" | "confirmed" | "no_show" → checked_in = false
 *
 * Kept for UI compatibility — callers pass the full status enum.
 */
export async function updateGuestStatus(
  guestId: string,
  status: "pending" | "confirmed" | "checked_in" | "no_show"
) {
  try {
    if (!guestId?.trim()) return { error: "Guest ID is required" };

    const validStatuses = ["pending", "confirmed", "checked_in", "no_show"];
    if (!validStatuses.includes(status)) return { error: "Invalid status" };

    const { error: authError } = await verifyGuestAccess(guestId);
    if (authError) return { error: authError };

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("guest_list")
      .update({ checked_in: status === "checked_in" })
      .eq("id", guestId);

    if (error) return { error: "Failed to update guest status" };
    return { error: null };
  } catch (err) {
    console.error("[updateGuestStatus]", err);
    return { error: "Something went wrong" };
  }
}

export async function removeGuest(guestId: string) {
  try {
    if (!guestId?.trim()) return { error: "Guest ID is required" };

    const { error: authError } = await verifyGuestAccess(guestId);
    if (authError) return { error: authError };

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("guest_list")
      .delete()
      .eq("id", guestId);

    if (error) return { error: "Failed to remove guest" };
    return { error: null };
  } catch (err) {
    console.error("[removeGuest]", err);
    return { error: "Something went wrong" };
  }
}
