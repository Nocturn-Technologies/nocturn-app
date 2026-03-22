"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function saveRecording(data: {
  user_id: string;
  collective_id?: string | null;
  duration_seconds?: number | null;
  status?: string;
}) {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("recordings")
    .insert({
      user_id: data.user_id,
      collective_id: data.collective_id ?? null,
      duration_seconds: data.duration_seconds ?? null,
      status: data.status ?? "recording",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
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
  const admin = createAdminClient();
  const { error } = await admin
    .from("recordings")
    .update(data)
    .eq("id", id);

  if (error) return { error: error.message };
  return { success: true };
}
