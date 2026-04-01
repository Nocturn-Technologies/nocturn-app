"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export interface ReferralStats {
  userId: string;
  userName: string;
  referralCount: number;
  ticketsSold: number;
  rewardEarned: boolean;
  rewardType: string | null;
}

/**
 * Get referral stats for an event — who brought the most friends
 */
export async function getEventReferralStats(eventId: string): Promise<{
  error: string | null;
  stats: ReferralStats[];
  totalReferrals: number;
}> {
  try {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", stats: [], totalReferrals: 0 };

  const admin = createAdminClient();

  // Verify user has access to this event's collective
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", stats: [], totalReferrals: 0 };

  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!memberCount || memberCount === 0) {
    return { error: "You don't have access to this event", stats: [], totalReferrals: 0 };
  }

  // Get all tickets with referrals for this event
  const { data: tickets } = await admin
    .from("tickets")
    .select("id, referred_by, user_id, status")
    .eq("event_id", eventId)
    .not("referred_by", "is", null)
    .in("status", ["paid", "checked_in"]);

  if (!tickets || tickets.length === 0) {
    return { error: null, stats: [], totalReferrals: 0 };
  }

  // Count referrals per referrer
  const referrerCounts: Record<string, number> = {};
  for (const t of tickets) {
    const ref = t.referred_by as string;
    referrerCounts[ref] = (referrerCounts[ref] ?? 0) + 1;
  }

  // Get referrer names
  const referrerIds = Object.keys(referrerCounts);
  const { data: users } = await admin
    .from("users")
    .select("id, display_name, email")
    .in("id", referrerIds);

  const userMap: Record<string, string> = {};
  for (const u of users ?? []) {
    userMap[u.id] = u.display_name || u.email?.split("@")[0] || "Unknown";
  }

  const stats: ReferralStats[] = referrerIds
    .map((id) => ({
      userId: id,
      userName: userMap[id] ?? "Unknown",
      referralCount: referrerCounts[id],
      ticketsSold: referrerCounts[id],
      rewardEarned: referrerCounts[id] >= 5,
      rewardType: referrerCounts[id] >= 5 ? "free_ticket" : null,
    }))
    .sort((a, b) => b.referralCount - a.referralCount);

  return {
    error: null,
    stats,
    totalReferrals: tickets.length,
  };
  } catch (err) {
    console.error("[getEventReferralStats]", err);
    return { error: "Something went wrong", stats: [], totalReferrals: 0 };
  }
}


