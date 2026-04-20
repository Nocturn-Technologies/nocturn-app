"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";

export interface CollectiveDefaults {
  collectiveId: string;
  defaultCurrency: string;
}

/**
 * Return the signed-in user's first collective's ID.
 * `defaultCurrency` is fixed to "cad" since per-collective currency overrides
 * were removed in the full schema rebuild. Falls back to null on any failure.
 */
export async function getMyCollectiveDefaults(): Promise<CollectiveDefaults | null> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (!membership) return null;

    const { data: collective } = await admin
      .from("collectives")
      .select("id")
      .eq("id", membership.collective_id)
      .maybeSingle();
    if (!collective) return null;

    return {
      collectiveId: collective.id,
      defaultCurrency: "cad",
    };
  } catch (err) {
    console.error("[getMyCollectiveDefaults]", err);
    return null;
  }
}

/**
 * No-op stub — per-collective currency overrides were removed in the full
 * schema rebuild. Kept so existing callers don't need to be updated immediately.
 */
export async function updateCollectiveCurrency(_input: { currency: string }): Promise<{ error: string | null }> {
  revalidatePath("/dashboard/settings");
  return { error: null };
}
