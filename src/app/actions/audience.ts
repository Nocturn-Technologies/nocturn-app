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

// ── Helpers ──

async function getCollectiveIds(userId: string) {
  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId)
    .is("deleted_at", null);
  return memberships?.map((m) => m.collective_id) ?? [];
}

// ── Main: Get Audience Segments ──

export async function getAudienceSegments(): Promise<{
  error: string | null;
  segments: AudienceSegments;
  overview: AudienceOverview;
}> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Not authenticated",
      segments: { core50: [], ambassadors: [], repeatFans: [], firstTimers: [] },
      overview: { totalUniqueAttendees: 0, totalEvents: 0, avgEventsPerPerson: 0, totalReferrals: 0, totalRevenue: 0 },
    };
  }

  const admin = createAdminClient();
  const collectiveIds = await getCollectiveIds(user.id);

  if (collectiveIds.length === 0) {
    return {
      error: null,
      segments: { core50: [], ambassadors: [], repeatFans: [], firstTimers: [] },
      overview: { totalUniqueAttendees: 0, totalEvents: 0, avgEventsPerPerson: 0, totalReferrals: 0, totalRevenue: 0 },
    };
  }

  // Get all events for collectives
  const { data: events } = await admin
    .from("events")
    .select("id, title, starts_at, status")
    .in("collective_id", collectiveIds)
    .order("starts_at", { ascending: false });

  if (!events || events.length === 0) {
    return {
      error: null,
      segments: { core50: [], ambassadors: [], repeatFans: [], firstTimers: [] },
      overview: { totalUniqueAttendees: 0, totalEvents: 0, avgEventsPerPerson: 0, totalReferrals: 0, totalRevenue: 0 },
    };
  }

  const eventIds = events.map((e) => e.id);
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const totalEvents = events.length;

  // Get all paid/checked-in tickets
  const { data: tickets } = await admin
    .from("tickets")
    .select("id, event_id, user_id, price_paid, metadata, referred_by, created_at")
    .in("event_id", eventIds)
    .in("status", ["paid", "checked_in"]);

  if (!tickets || tickets.length === 0) {
    return {
      error: null,
      segments: { core50: [], ambassadors: [], repeatFans: [], firstTimers: [] },
      overview: { totalUniqueAttendees: 0, totalEvents: 0, avgEventsPerPerson: 0, totalReferrals: 0, totalRevenue: 0 },
    };
  }

  // Count referrals per referrer (by user_id or email in metadata)
  const referralCounts = new Map<string, number>();
  for (const t of tickets) {
    if (t.referred_by) {
      const key = t.referred_by as string;
      referralCounts.set(key, (referralCounts.get(key) ?? 0) + 1);
    }
    // Also check metadata.referrer_token for backwards compat
    const meta = t.metadata as Record<string, unknown> | null;
    if (meta?.referrer_token && typeof meta.referrer_token === "string") {
      referralCounts.set(
        meta.referrer_token,
        (referralCounts.get(meta.referrer_token) ?? 0) + 1
      );
    }
  }

  // Group tickets by customer email (primary identifier)
  const emailMap = new Map<
    string,
    {
      name: string | null;
      userId: string | null;
      events: Set<string>;
      totalSpent: number;
      dates: string[];
      eventNames: Set<string>;
    }
  >();

  for (const ticket of tickets) {
    const meta = ticket.metadata as Record<string, unknown> | null;
    const email =
      (meta?.customer_email as string) ||
      (meta?.buyer_email as string) ||
      (meta?.email as string) ||
      null;

    if (!email) continue;

    const normalized = email.toLowerCase().trim();

    if (!emailMap.has(normalized)) {
      emailMap.set(normalized, {
        name: (meta?.customer_name as string) || (meta?.buyer_name as string) || (meta?.name as string) || null,
        userId: ticket.user_id ?? null,
        events: new Set(),
        totalSpent: 0,
        dates: [],
        eventNames: new Set(),
      });
    }

    const entry = emailMap.get(normalized)!;
    entry.events.add(ticket.event_id);
    entry.totalSpent += Number(ticket.price_paid) || 0;

    // Update name if we have one and didn't before
    if (!entry.name) {
      entry.name = (meta?.customer_name as string) || (meta?.buyer_name as string) || null;
    }
    if (!entry.userId && ticket.user_id) {
      entry.userId = ticket.user_id;
    }

    const event = eventMap.get(ticket.event_id);
    if (event) {
      entry.dates.push(event.starts_at);
      entry.eventNames.add(event.title);
    }
  }

  // Build audience members
  const members: AudienceMember[] = [];
  let totalReferrals = 0;

  for (const [email, data] of emailMap.entries()) {
    const sortedDates = data.dates.sort();
    const friendsReferred = data.userId
      ? (referralCounts.get(data.userId) ?? 0)
      : 0;

    totalReferrals += friendsReferred;

    // Determine segment
    let segment: AudienceMember["segment"];
    if (friendsReferred >= 3) {
      segment = "ambassador";
    } else if (data.events.size >= totalEvents && totalEvents >= 2) {
      segment = "core";
    } else if (data.events.size >= 2) {
      segment = "repeat";
    } else {
      segment = "first_timer";
    }

    members.push({
      email,
      name: data.name,
      userId: data.userId,
      eventsAttended: data.events.size,
      totalEventsAvailable: totalEvents,
      friendsReferred,
      totalSpent: data.totalSpent,
      firstEventDate: sortedDates[0] ?? "",
      lastEventDate: sortedDates[sortedDates.length - 1] ?? "",
      eventNames: Array.from(data.eventNames),
      segment,
    });
  }

  // Sort by events attended desc, then total spent desc
  members.sort((a, b) => {
    if (b.eventsAttended !== a.eventsAttended) return b.eventsAttended - a.eventsAttended;
    return b.totalSpent - a.totalSpent;
  });

  // Build segments
  const core50 = members
    .filter((m) => m.eventsAttended >= 2)
    .sort((a, b) => b.eventsAttended - a.eventsAttended || b.totalSpent - a.totalSpent)
    .slice(0, 50);

  // Mark core50 members
  const core50Emails = new Set(core50.map((m) => m.email));
  for (const m of core50) {
    if (m.segment !== "ambassador") m.segment = "core";
  }

  const ambassadors = members.filter((m) => m.friendsReferred >= 3);
  const repeatFans = members.filter((m) => m.eventsAttended >= 2 && !core50Emails.has(m.email) && m.friendsReferred < 3);
  const firstTimers = members.filter((m) => m.eventsAttended === 1);

  const totalRevenue = members.reduce((sum, m) => sum + m.totalSpent, 0);

  return {
    error: null,
    segments: { core50, ambassadors, repeatFans, firstTimers },
    overview: {
      totalUniqueAttendees: members.length,
      totalEvents,
      avgEventsPerPerson: members.length > 0 ? Math.round((members.reduce((s, m) => s + m.eventsAttended, 0) / members.length) * 10) / 10 : 0,
      totalReferrals,
      totalRevenue,
    },
  };
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
      const _referrerTickets = allTickets?.filter((at) => at.event_id && (at.metadata as Record<string, unknown>)?.customer_email);
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
