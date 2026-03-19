"use server";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
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
  const supabase = createAdminClient();

  const { error } = await supabase.from("guest_list").insert({
    event_id: input.eventId,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    plus_ones: input.plusOnes ?? 0,
    status: "pending",
    notes: input.notes?.trim() || null,
    added_by: input.addedBy ?? null,
  });

  if (error) return { error: error.message };
  return { error: null };
}

export async function getGuestList(eventId: string): Promise<Guest[]> {
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

export async function checkInGuest(guestId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("guest_list")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
    })
    .eq("id", guestId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateGuestStatus(
  guestId: string,
  status: "pending" | "confirmed" | "checked_in" | "no_show"
) {
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
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("guest_list")
    .delete()
    .eq("id", guestId);

  if (error) return { error: error.message };
  return { error: null };
}
