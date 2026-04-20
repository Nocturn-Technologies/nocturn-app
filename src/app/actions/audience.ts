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
  try {
  if (!eventId?.trim()) return { error: "Event ID is required", insights: [] };

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
  const { data: collectiveEvents, error: collectiveEventsError } = await admin
    .from("events")
    .select("id, title")
    .eq("collective_id", event.collective_id);

  if (collectiveEventsError) {
    console.error("[getPostEventInsights] collective events query error:", collectiveEventsError.message);
    return { error: "Something went wrong", insights: [] };
  }

  const allEventIds = collectiveEvents?.map((e) => e.id) ?? [];
  const totalCollectiveEvents = allEventIds.length;

  // Get attendee_profiles for this collective — these are our audience records
  const { data: allProfiles } = await admin
    .from("attendee_profiles")
    .select("id, email, full_name, party_id, user_id, total_events, first_seen_at, last_seen_at")
    .eq("collective_id", event.collective_id)
    .not("email", "is", null);

  type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    party_id: string | null;
    user_id: string | null;
    total_events: number;
    first_seen_at: string | null;
    last_seen_at: string | null;
  };

  const profiles = (allProfiles ?? []) as ProfileRow[];

  // Get tickets for THIS event to identify who attended
  const { data: thisEventTickets } = await admin
    .from("tickets")
    .select("id, holder_party_id")
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"]);

  type TicketRow = { id: string; holder_party_id: string | null };
  const thisEventTicketRows = (thisEventTickets ?? []) as TicketRow[];

  if (thisEventTicketRows.length === 0) {
    return { error: null, insights: [] };
  }

  // Build set of party_ids that attended this event
  const thisEventPartyIds = new Set(
    thisEventTicketRows.map((t) => t.holder_party_id).filter((pid): pid is string => !!pid)
  );

  // Build profile lookup by party_id
  const profileByPartyId = new Map<string, ProfileRow>();
  for (const p of profiles) {
    if (p.party_id) profileByPartyId.set(p.party_id, p);
  }

  const insights: PostEventInsight[] = [];

  // 1. Repeat attendees (attended 2+ events from this collective, including this one)
  for (const partyId of thisEventPartyIds) {
    const profile = profileByPartyId.get(partyId);
    if (!profile?.email) continue;

    const eventCount = profile.total_events;
    if (eventCount >= 2) {
      insights.push({
        type: "repeat_attendee",
        email: profile.email,
        name: profile.full_name ?? null,
        detail: `Attended ${eventCount} of your events`,
        value: eventCount,
      });
    }
  }

  // 2. Core fans — attended every event (or nearly every) if 2+ events exist
  if (totalCollectiveEvents >= 2) {
    for (const partyId of thisEventPartyIds) {
      const profile = profileByPartyId.get(partyId);
      if (!profile?.email) continue;

      const eventCount = profile.total_events;
      if (eventCount >= totalCollectiveEvents) {
        insights.push({
          type: "core_fan",
          email: profile.email,
          name: profile.full_name ?? null,
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
  } catch (err) {
    console.error("[getPostEventInsights]", err);
    return { error: "Something went wrong", insights: [] };
  }
}
