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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", code: null };

  const admin = createAdminClient();

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

  if (updateError) return { error: updateError.message, code: null };

  return { error: null, code };
}

/**
 * Look up a collective by referral code. Used during signup to link new users.
 */
export async function lookupReferralCode(code: string): Promise<{
  error: string | null;
  collective: { id: string; name: string; slug: string } | null;
}> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("collectives")
    .select("id, name, slug")
    .eq("referral_code", code.toUpperCase().trim())
    .maybeSingle();

  if (!data) return { error: "Invalid referral code", collective: null };

  return { error: null, collective: data };
}

/**
 * Track a signup that came through a referral code.
 * Stores the referral in the user's metadata.
 */
export async function trackReferralSignup(
  userId: string,
  referralCode: string,
  collectiveId: string
): Promise<{ error: string | null }> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({
      metadata: {
        referred_by_code: referralCode,
        referred_by_collective: collectiveId,
        referred_at: new Date().toISOString(),
      },
    })
    .eq("id", userId);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Get referral stats for a collective — how many signups their code brought.
 */
export async function getReferralProgramStats(collectiveId: string): Promise<{
  error: string | null;
  totalSignups: number;
  code: string | null;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", totalSignups: 0, code: null };

  const admin = createAdminClient();

  const { data: collective } = await admin
    .from("collectives")
    .select("referral_code")
    .eq("id", collectiveId)
    .maybeSingle();

  if (!collective?.referral_code) {
    return { error: null, totalSignups: 0, code: null };
  }

  // Count users who signed up with this collective's referral code
  const { count } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .contains("metadata", { referred_by_collective: collectiveId });

  return {
    error: null,
    totalSignups: count ?? 0,
    code: collective.referral_code,
  };
}
