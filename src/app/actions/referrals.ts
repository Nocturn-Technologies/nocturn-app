"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { isValidUUID } from "@/lib/utils";

export interface ReferralStats {
  linkId: string;
  label: string | null;
  code: string;
  clicks: number;
  createdBy: string | null;
}

/**
 * Get referral link stats for an event — which promo links drove the most traffic.
 */
export async function getEventReferralStats(eventId: string): Promise<{
  error: string | null;
  stats: ReferralStats[];
  totalClicks: number;
}> {
  try {
  if (!eventId?.trim()) return { error: "Event ID is required", stats: [], totalClicks: 0 };
  if (!isValidUUID(eventId)) return { error: "Invalid event ID format", stats: [], totalClicks: 0 };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", stats: [], totalClicks: 0 };

  const admin = createAdminClient();

  // Verify user has access to this event's collective
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", stats: [], totalClicks: 0 };

  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!memberCount || memberCount === 0) {
    return { error: "You don't have access to this event", stats: [], totalClicks: 0 };
  }

  // Get all promo links for this event with their click counts
  const { data: links } = await admin
    .from("promo_links")
    .select("id, code, label, clicks, created_by")
    .eq("event_id", eventId)
    .order("clicks", { ascending: false });

  if (!links || links.length === 0) {
    return { error: null, stats: [], totalClicks: 0 };
  }

  const stats: ReferralStats[] = links.map((link) => ({
    linkId: link.id,
    label: link.label,
    code: link.code,
    clicks: link.clicks,
    createdBy: link.created_by,
  }));

  const totalClicks = stats.reduce((sum, s) => sum + s.clicks, 0);

  return {
    error: null,
    stats,
    totalClicks,
  };
  } catch (err) {
    console.error("[getEventReferralStats]", err);
    return { error: "Something went wrong", stats: [], totalClicks: 0 };
  }
}
