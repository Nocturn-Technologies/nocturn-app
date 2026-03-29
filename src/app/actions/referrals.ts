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
}

/**
 * Generate a referral link for an attendee
 */
export async function generateReferralLink(eventSlug: string, collectiveSlug: string): Promise<{
  error: string | null;
  link: string | null;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", link: null };

  const link = `https://app.trynocturn.com/e/${collectiveSlug}/${eventSlug}?ref=${user.id}`;
  return { error: null, link };
}

/**
 * Track a referral when a ticket is purchased with a ref parameter.
 * Called from the checkout flow.
 */
export async function trackReferral(ticketId: string, referrerId: string): Promise<void> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();

  // Verify the caller owns the ticket being updated
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, user_id")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket || ticket.user_id !== user.id) return;

  await admin
    .from("tickets")
    .update({ referred_by: referrerId })
    .eq("id", ticketId);
}

/**
 * Check if a referrer has earned a reward and return the reward details
 */
export async function checkReferralReward(
  referrerId: string,
  eventId: string,
  threshold: number = 5
): Promise<{
  earned: boolean;
  count: number;
  threshold: number;
  remaining: number;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { earned: false, count: 0, threshold, remaining: threshold };

  // Verify the caller is the referrer or a member of the event's collective
  if (referrerId !== user.id) {
    const admin2 = createAdminClient();
    const { data: event } = await admin2
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (event) {
      const { count: memberCount } = await admin2
        .from("collective_members")
        .select("*", { count: "exact", head: true })
        .eq("collective_id", event.collective_id)
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (!memberCount || memberCount === 0) {
        return { earned: false, count: 0, threshold, remaining: threshold };
      }
    } else {
      return { earned: false, count: 0, threshold, remaining: threshold };
    }
  }

  const admin = createAdminClient();

  const { count } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("referred_by", referrerId)
    .in("status", ["paid", "checked_in"]);

  const referralCount = count ?? 0;

  return {
    earned: referralCount >= threshold,
    count: referralCount,
    threshold,
    remaining: Math.max(0, threshold - referralCount),
  };
}
