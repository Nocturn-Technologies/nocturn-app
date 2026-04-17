"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { revalidatePath } from "next/cache";

export interface CollectiveDefaults {
  collectiveId: string;
  defaultCurrency: string;
}

/**
 * Return the signed-in user's first collective's default currency + ID.
 * Used by the event-creation wizard to pre-select the Budget step's event
 * currency picker. Falls back to { defaultCurrency: "usd" } on any failure
 * since a non-critical preference shouldn't block the wizard.
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
      .select("id, default_currency")
      .eq("id", membership.collective_id)
      .maybeSingle();
    if (!collective) return null;

    return {
      collectiveId: collective.id,
      defaultCurrency: (collective.default_currency ?? "usd").toLowerCase(),
    };
  } catch (err) {
    console.error("[getMyCollectiveDefaults]", err);
    return null;
  }
}

/**
 * Update the collective's default_currency. Caller must be a member.
 */
export async function updateCollectiveCurrency(input: { currency: string }): Promise<{ error: string | null }> {
  try {
    const currency = input.currency.toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) {
      return { error: "Currency must be a 3-letter ISO code (e.g. usd, cad, eur)." };
    }
    if (!SUPPORTED_CURRENCIES.some(c => c.code === currency)) {
      return { error: "Unsupported currency." };
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (!membership) return { error: "No collective found" };

    const { error: updateErr } = await admin
      .from("collectives")
      .update({ default_currency: currency })
      .eq("id", membership.collective_id);

    if (updateErr) {
      console.error("[updateCollectiveCurrency] update failed:", updateErr.message);
      return { error: "Failed to update currency" };
    }

    revalidatePath("/dashboard/settings");
    return { error: null };
  } catch (err) {
    console.error("[updateCollectiveCurrency]", err);
    return { error: "Something went wrong" };
  }
}
