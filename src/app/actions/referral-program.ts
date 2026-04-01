"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

/**
 * Get the referral code for a collective. Generate one if it doesn't exist.
 */
export async function getReferralCode(collectiveId: string): Promise<{
  error: string | null;
  code: string | null;
}> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", code: null };

    const admin = createAdminClient();

    // Verify user is a member of this collective
    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!memberCount || memberCount === 0) return { error: "Not a member of this collective", code: null };

    // Check if collective already has a code
    const { data: collective } = await admin
      .from("collectives")
      .select("referral_code, slug")
      .eq("id", collectiveId)
      .maybeSingle();

    if (!collective) return { error: "Collective not found", code: null };

    if (collective.referral_code) {
      return { error: null, code: collective.referral_code };
    }

    // Generate a new referral code
    const base = collective.slug.replace(/-/g, "").slice(0, 6).toUpperCase();
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `${base}${suffix}`;

    const { error: updateError } = await admin
      .from("collectives")
      .update({ referral_code: code })
      .eq("id", collectiveId);

    if (updateError) return { error: "Something went wrong", code: null };

    return { error: null, code };
  } catch (err) {
    console.error("[getReferralCode]", err);
    return { error: "Something went wrong", code: null };
  }
}
