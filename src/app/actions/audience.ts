"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// ── Types ──

export interface AudienceMember {
  email: string;
  name: string | null;
  userId: string | null;
  eventsAttended: number;
  totalEventsAvailable: number;
  friendsReferred: number;
  totalSpent: number;
  firstEventDate: string;
  lastEventDate: string;
  eventNames: string[];
  segment: "core" | "ambassador" | "repeat" | "first_timer";
}

export interface AudienceSegments {
  core50: AudienceMember[];
  ambassadors: AudienceMember[];
  repeatFans: AudienceMember[];
  firstTimers: AudienceMember[];
}

export interface AudienceOverview {
  totalUniqueAttendees: number;
  totalEvents: number;
  avgEventsPerPerson: number;
  totalReferrals: number;
  totalRevenue: number;
}

// ── Post-Event Auto-Identification ──

export interface PostEventInsight {
  type: "repeat_attendee" | "top_referrer" | "core_fan";
  email: string;
  name: string | null;
  detail: string;
  value: number; // events attended, referrals, or attendance rate
}

export async function getPostEventInsights(eventId: string): Promise<{
  error: string | null;
  insights: PostEventInsight[];
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", insights: [] };

  const admin = createAdminClient();

  // Get the event and its collective
  const { data: event } = await admin
    .from("events")
    .select("id, collective_id, title")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", insights: [] };

  // Verify user is a member of this event's collective
  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!memberCount || memberCount === 0) return { error: "Not a member of this collective", insights: [] };

  // Get all events for this collective
  const { data: collectiveEvents } = await admin
    .from("events")
    .select("id, title")
    .eq("collective_id", event.collective_id);

  const allEventIds = collectiveEvents?.map((e) => e.id) ?? [];
  const totalCollectiveEvents = allEventIds.length;

  // Get attendees of THIS event
  const { data: thisEventTickets } = await admin
    .from("tickets")
    .select("id, user_id, metadata, referred_by")
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"]);

  if (!thisEventTickets || thisEventTickets.length === 0) {
    return { error: null, insights: [] };
  }

  // Extract emails from this event
  const thisEventEmails = new Set<string>();
  const emailToName = new Map<string, string | null>();

  for (const t of thisEventTickets) {
    const meta = t.metadata as Record<string, unknown> | null;
    const email = ((meta?.customer_email ?? meta?.buyer_email ?? meta?.email) as string)?.toLowerCase().trim();
    if (email) {
      thisEventEmails.add(email);
      if (!emailToName.has(email)) {
        emailToName.set(email, (meta?.customer_name ?? meta?.buyer_name ?? meta?.name) as string | null);
      }
    }
  }

  // Get ALL tickets across collective events to find repeat attendees
  const { data: allTickets } = await admin
    .from("tickets")
    .select("id, event_id, metadata, referred_by")
    .in("event_id", allEventIds)
    .in("status", ["paid", "checked_in"]);

  // Count events per email across the collective
  const emailEventCount = new Map<string, Set<string>>();
  const referralCountByEmail = new Map<string, number>();

  for (const t of allTickets ?? []) {
    const meta = t.metadata as Record<string, unknown> | null;
    const email = ((meta?.customer_email ?? meta?.buyer_email ?? meta?.email) as string)?.toLowerCase().trim();
    if (!email) continue;

    if (!emailEventCount.has(email)) emailEventCount.set(email, new Set());
    emailEventCount.get(email)!.add(t.event_id);

    // Count referrals they've generated
    if (t.referred_by) {
      // We'll match by user_id later
    }
  }

  // Count referrals from this event's attendees
  for (const t of allTickets ?? []) {
    if (t.referred_by) {
      // Find the referrer's email from their tickets
      // Simplified: count by referred_by user_id
      const key = t.referred_by as string;
      referralCountByEmail.set(key, (referralCountByEmail.get(key) ?? 0) + 1);
    }
  }

  const insights: PostEventInsight[] = [];

  // 1. Repeat attendees (attended 2+ events from this collective, including this one)
  for (const email of thisEventEmails) {
    const eventCount = emailEventCount.get(email)?.size ?? 0;
    if (eventCount >= 2) {
      insights.push({
        type: "repeat_attendee",
        email,
        name: emailToName.get(email) ?? null,
        detail: `Attended ${eventCount} of your events`,
        value: eventCount,
      });
    }
  }

  // 2. Top referrers from this event
  const thisEventReferrers = new Map<string, number>();
  for (const t of thisEventTickets) {
    if (t.referred_by) {
      const ref = t.referred_by as string;
      thisEventReferrers.set(ref, (thisEventReferrers.get(ref) ?? 0) + 1);
    }
  }

  // Get referrer user info
  const referrerIds = Array.from(thisEventReferrers.keys());
  if (referrerIds.length > 0) {
    const { data: referrerUsers } = await admin
      .from("users")
      .select("id, display_name, email")
      .in("id", referrerIds);

    for (const ru of referrerUsers ?? []) {
      const count = thisEventReferrers.get(ru.id) ?? 0;
      if (count >= 1) {
        insights.push({
          type: "top_referrer",
          email: ru.email ?? "unknown",
          name: ru.display_name ?? null,
          detail: `Brought ${count} friend${count !== 1 ? "s" : ""} to this event`,
          value: count,
        });
      }
    }
  }

  // 3. Core fans — attended every event (or nearly every) if 2+ events exist
  if (totalCollectiveEvents >= 2) {
    for (const email of thisEventEmails) {
      const eventCount = emailEventCount.get(email)?.size ?? 0;
      if (eventCount >= totalCollectiveEvents) {
        insights.push({
          type: "core_fan",
          email,
          name: emailToName.get(email) ?? null,
          detail: `Attended all ${totalCollectiveEvents} events — true core fan`,
          value: totalCollectiveEvents,
        });
      }
    }
  }

  // Sort: core fans first, then top referrers by count, then repeat attendees
  insights.sort((a, b) => {
    const priority = { core_fan: 0, top_referrer: 1, repeat_attendee: 2 };
    if (priority[a.type] !== priority[b.type]) return priority[a.type] - priority[b.type];
    return b.value - a.value;
  });

  return { error: null, insights };
}
