"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export async function saveRecording(data: {
  collective_id?: string | null;
  duration_seconds?: number | null;
  status?: string;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Verify caller is a member of the supplied collective
  if (data.collective_id) {
    const { count } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", data.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!count) return { error: "Not authorized" };
  }

  const { data: row, error } = await admin
    .from("recordings")
    .insert({
      user_id: user.id,
      collective_id: data.collective_id ?? null,
      duration_seconds: data.duration_seconds ?? null,
      status: data.status ?? "recording",
    })
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!row) return { error: "Failed to create recording" };
  return { id: row.id };
}

export async function getRecordings() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { recordings: [] };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recordings")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return { recordings: [] };
  return { recordings: data ?? [] };
}

export async function updateRecording(
  id: string,
  data: {
    status?: string;
    duration_seconds?: number;
    transcript?: string;
    summary?: string;
    action_items?: string[];
    key_decisions?: string[];
  }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  // Only allow updating own recordings
  const { error } = await admin
    .from("recordings")
    .update(data)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}
