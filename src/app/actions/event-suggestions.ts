"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

export interface Suggestion {
  title: string;
  vibe: string;
  suggestedDate: string;
  suggestedVenue: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export async function getEventSuggestions(
  collectiveId: string
): Promise<Suggestion[]> {
  try {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  if (!collectiveId?.trim()) return [];

  const admin = createAdminClient();

  // Verify caller is a member of the supplied collective
  const { count, error: memberError } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (memberError) {
    console.error("[getEventSuggestions] membership query error:", memberError.message);
    return [];
  }
  if (!count) return [];

  // Fetch past events for this collective to analyze patterns
  const { data: pastEvents, error: pastEventsError } = await admin
    .from("events")
    .select("id, title, starts_at, status, venues(name, city)")
    .eq("collective_id", collectiveId)
    .in("status", ["completed", "published"])
    .is("deleted_at", null)
    .order("starts_at", { ascending: false })
    .limit(20);

  if (pastEventsError) {
    console.error("[getEventSuggestions] past events query error:", pastEventsError.message);
  }

  // Fetch upcoming events to avoid scheduling conflicts
  const now = new Date().toISOString();
  const { data: upcomingEvents, error: upcomingError } = await admin
    .from("events")
    .select("starts_at")
    .eq("collective_id", collectiveId)
    .gte("starts_at", now)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true });

  if (upcomingError) {
    console.error("[getEventSuggestions] upcoming events query error:", upcomingError.message);
  }

  // Fetch ticket data for past events to gauge popularity
  const eventIds = (pastEvents ?? []).map((e) => e.id);
  let ticketCounts: Record<string, number> = {};
  if (eventIds.length > 0) {
    const { data: tickets } = await admin
      .from("tickets")
      .select("event_id")
      .in("event_id", eventIds);
    if (tickets) {
      for (const t of tickets) {
        ticketCounts[t.event_id] = (ticketCounts[t.event_id] ?? 0) + 1;
      }
    }
  }

  const events = (pastEvents ?? []) as unknown as Array<{
    id: string;
    title: string;
    starts_at: string;
    status: string;
    venues: { name: string; city: string } | null;
  }>;

  // Analyze past event patterns
  const venueFrequency: Record<string, number> = {};
  const titleWords: Record<string, number> = {};

  for (const event of events) {
    if (event.venues?.name) {
      venueFrequency[event.venues.name] =
        (venueFrequency[event.venues.name] ?? 0) + 1;
    }
    // Extract vibe words from titles
    const words = event.title.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3) {
        titleWords[word] = (titleWords[word] ?? 0) + 1;
      }
    }
  }

  // Find the most popular venue
  const sortedVenues = Object.entries(venueFrequency).sort(
    (a, b) => b[1] - a[1]
  );
  const topVenue = sortedVenues[0]?.[0] ?? "Scout a venue";
  const secondVenue = sortedVenues[1]?.[0] ?? topVenue;

  // Find the best-attended event
  let bestEvent: (typeof events)[0] | null = null;
  let bestCount = 0;
  for (const event of events) {
    const count = ticketCounts[event.id] ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestEvent = event;
    }
  }

  // Find next open Friday/Saturday dates
  const bookedDates = new Set(
    (upcomingEvents ?? []).map((e) =>
      new Date(e.starts_at).toISOString().split("T")[0]
    )
  );

  function findNextOpenWeekendDate(startOffset = 0): string {
    const date = new Date();
    date.setDate(date.getDate() + 7 + startOffset); // Start at least a week out
    let attempts = 0;
    while (attempts < 60) {
      const day = date.getDay();
      const dateStr = date.toISOString().split("T")[0];
      if ((day === 5 || day === 6) && !bookedDates.has(dateStr)) {
        return dateStr;
      }
      date.setDate(date.getDate() + 1);
      attempts++;
    }
    // Fallback: 3 weeks from now
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 21 + startOffset);
    return fallback.toISOString().split("T")[0];
  }

  const date1 = findNextOpenWeekendDate(0);
  const date2 = findNextOpenWeekendDate(7);
  const date3 = findNextOpenWeekendDate(14);

  // Generate vibes from title analysis
  const vibes = [
    "techno",
    "house",
    "drum & bass",
    "hip-hop",
    "afrobeats",
    "disco",
    "amapiano",
    "open format",
  ];
  const detectedVibes = vibes.filter((v) =>
    events.some((e) => e.title.toLowerCase().includes(v))
  );
  const topVibe = detectedVibes[0] ?? "open format";

  // Build 3 suggestions
  const suggestions: Suggestion[] = [];

  // Suggestion 1: Repeat the best event
  if (bestEvent && bestCount > 0) {
    suggestions.push({
      title: `${bestEvent.title} Vol. 2`,
      vibe: topVibe,
      suggestedDate: date1,
      suggestedVenue: bestEvent.venues?.name ?? topVenue,
      reason: `Your last "${bestEvent.title}" had ${bestCount} ticket${bestCount === 1 ? "" : "s"} sold -- run it back.`,
      confidence: "high",
    });
  } else {
    suggestions.push({
      title: "The Grand Opening",
      vibe: "open format",
      suggestedDate: date1,
      suggestedVenue: topVenue,
      reason:
        "You haven't thrown an event yet -- start with an open format night to gauge your crowd.",
      confidence: "medium",
    });
  }

  // Suggestion 2: Try a new vibe
  const newVibe =
    vibes.find((v) => !detectedVibes.includes(v)) ?? "open format";
  suggestions.push({
    title:
      newVibe === "techno"
        ? "Dark Matter"
        : newVibe === "house"
          ? "Soul Session"
          : newVibe === "drum & bass"
            ? "Jungle Frequency"
            : newVibe === "hip-hop"
              ? "The Cypher"
              : newVibe === "afrobeats"
                ? "Afro Fusion"
                : newVibe === "disco"
                  ? "Studio 54 Revival"
                  : newVibe === "amapiano"
                    ? "Piano People"
                    : "Midnight Social",
    vibe: newVibe,
    suggestedDate: date2,
    suggestedVenue: secondVenue,
    reason: `You haven't done a ${newVibe} night yet -- diversify your audience and test the waters.`,
    confidence: "medium",
  });

  // Suggestion 3: Venue-based suggestion
  if (sortedVenues.length > 0) {
    const venueCount = sortedVenues[0][1];
    suggestions.push({
      title: "Homebase Sessions",
      vibe: topVibe,
      suggestedDate: date3,
      suggestedVenue: topVenue,
      reason: `You've hosted ${venueCount} event${venueCount === 1 ? "" : "s"} at ${topVenue} -- build a residency there.`,
      confidence: venueCount >= 3 ? "high" : "medium",
    });
  } else {
    suggestions.push({
      title: "Venue Showcase",
      vibe: "open format",
      suggestedDate: date3,
      suggestedVenue: "Venue TBA",
      reason:
        "Scout a new venue this month and lock in a date -- first-mover advantage matters.",
      confidence: "low",
    });
  }

  return suggestions;
  } catch (err) {
    console.error("[getEventSuggestions]", err);
    return [];
  }
}
