"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

/** Verify the caller is an admin/member of the collective that owns this event */
async function verifyEventAccess(eventId: string): Promise<{ error: string | null; userId: string | null }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", userId: null };

  const admin = createAdminClient();

  // Get the event's collective
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", userId: null };

  // Check membership with role verification
  const { data: membership } = await admin
    .from("collective_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("collective_id", event.collective_id)
    .in("role", ["admin", "promoter", "event_staff"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) return { error: "You don't have access to this event", userId: null };

  return { error: null, userId: user.id };
}

export interface Guest {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  plus_ones: number;
  status: "pending" | "confirmed" | "checked_in" | "no_show";
  notes: string | null;
  added_by: string | null;
  checked_in_at: string | null;
  created_at: string;
}

export async function addGuest(input: {
  eventId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  plusOnes?: number;
  notes?: string | null;
  addedBy?: string | null;
}) {
  const { error: authError, userId } = await verifyEventAccess(input.eventId);
  if (authError) return { error: authError };

  const supabase = createAdminClient();

  const { error } = await supabase.from("guest_list").insert({
    event_id: input.eventId,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    plus_ones: input.plusOnes ?? 0,
    status: "pending",
    notes: input.notes?.trim() || null,
    added_by: userId,
  });

  if (error) return { error: error.message };
  return { error: null };
}

export async function getGuestList(eventId: string): Promise<Guest[]> {
  const { error: authError } = await verifyEventAccess(eventId);
  if (authError) return [];

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("guest_list")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[guest-list] Failed to fetch:", error);
    return [];
  }

  return (data ?? []) as Guest[];
}

/** Look up event_id from a guest record and verify access */
async function verifyGuestAccess(guestId: string): Promise<{ error: string | null }> {
  const supabase = createAdminClient();
  const { data: guest } = await supabase
    .from("guest_list")
    .select("event_id")
    .eq("id", guestId)
    .maybeSingle();

  if (!guest) return { error: "Guest not found" };
  return verifyEventAccess(guest.event_id);
}

export async function checkInGuest(guestId: string) {
  const { error: authError } = await verifyGuestAccess(guestId);
  if (authError) return { error: authError };

  const supabase = createAdminClient();

  // Atomic status guard — only check in if not already checked in
  const { data: updated, error } = await supabase
    .from("guest_list")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
    })
    .eq("id", guestId)
    .neq("status", "checked_in")
    .select("id");

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "Guest is already checked in" };
  return { error: null };
}

export async function updateGuestStatus(
  guestId: string,
  status: "pending" | "confirmed" | "checked_in" | "no_show"
) {
  const { error: authError } = await verifyGuestAccess(guestId);
  if (authError) return { error: authError };

  const supabase = createAdminClient();

  const updates: Record<string, unknown> = { status };

  if (status === "checked_in") {
    updates.checked_in_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("guest_list")
    .update(updates)
    .eq("id", guestId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function removeGuest(guestId: string) {
  const { error: authError } = await verifyGuestAccess(guestId);
  if (authError) return { error: authError };

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("guest_list")
    .delete()
    .eq("id", guestId);

  if (error) return { error: error.message };
  return { error: null };
}
