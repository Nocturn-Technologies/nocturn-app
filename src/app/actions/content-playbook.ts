"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { buildContentPlan } from "@/lib/content-plan-builder";

// Re-export types for consumers that import from this file
export type { PlaybookPost, OpsTask } from "@/lib/content-plan-builder";

export interface ContentPlaybook {
  eventTitle: string;
  eventDate: string;
  eventSize: "small" | "medium" | "large";
  totalPosts: number;
  totalTasks: number;
  phases: {
    name: string;
    weekLabel: string;
    posts: import("@/lib/content-plan-builder").PlaybookPost[];
    tasks: import("@/lib/content-plan-builder").OpsTask[];
  }[];
}

export async function generateContentPlaybook(eventId: string): Promise<{
  error: string | null;
  playbook: ContentPlaybook | null;
}> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", playbook: null };

    if (!eventId?.trim()) return { error: "Event ID is required", playbook: null };

    const admin = createAdminClient();

    // Get event details
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("title, slug, starts_at, description, vibe_tags, venues(name, city), collective_id, collectives(name, slug)")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      console.error("[generateContentPlaybook] event query error:", eventError.message);
      return { error: "Failed to load event", playbook: null };
    }
    if (!event) return { error: "Event not found", playbook: null };

    // Verify caller is a member of the event's collective
    const { count, error: memberError } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (memberError) {
      console.error("[generateContentPlaybook] membership query error:", memberError.message);
      return { error: "Failed to verify membership", playbook: null };
    }
    if (!count) return { error: "Not authorized", playbook: null };

    const eventDate = new Date(event.starts_at);
    const now = new Date();
    const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / 86400000);
    const venue = event.venues as unknown as { name: string; city: string } | null;
    const collective = event.collectives as unknown as { name: string; slug: string } | null;
    const title = event.title;
    const venueName = venue?.name ?? "the venue";
    const city = venue?.city ?? "the city";
    const collectiveName = collective?.name ?? "the collective";
    const vibes = (event.vibe_tags as string[]) ?? [];
    const vibeStr = vibes.length > 0 ? vibes.slice(0, 3).join(", ") : "underground";

    // Get lineup
    const { data: lineup, error: lineupError } = await admin
      .from("event_artists")
      .select("name")
      .eq("event_id", eventId);

    if (lineupError) {
      console.error("[generateContentPlaybook] lineup query error:", lineupError.message);
    }

    const artistNames = (lineup ?? [])
      .map((l) => (l as { name: string | null }).name)
      .filter(Boolean);

    const lineupStr = artistNames.length > 0
      ? artistNames.join(", ")
      : "a curated lineup";

    // Get ticket info
    const { data: tiers, error: tiersError } = await admin
      .from("ticket_tiers")
      .select("name, price")
      .eq("event_id", eventId)
      .order("price", { ascending: true })
      .limit(1);

    if (tiersError) {
      console.error("[generateContentPlaybook] tiers query error:", tiersError.message);
    }

    const lowestPrice = tiers?.[0]?.price ? `$${Number(tiers[0].price).toFixed(0)}` : "limited";
    const collectiveSlug = collective?.slug ?? event.collective_id;
    const eventSlug = event.slug ?? eventId;
    const ticketLink = `app.trynocturn.com/e/${collectiveSlug}/${eventSlug}`;

    // Get total capacity to determine event size
    const { data: allTiers, error: allTiersError } = await admin
      .from("ticket_tiers")
      .select("capacity")
      .eq("event_id", eventId);

    if (allTiersError) {
      console.error("[generateContentPlaybook] allTiers query error:", allTiersError.message);
    }

    const totalCapacity = (allTiers ?? []).reduce((sum, t) => sum + (t.capacity ?? 0), 0);
    const eventSize: "small" | "medium" | "large" =
      totalCapacity > 300 ? "large" : totalCapacity > 100 ? "medium" : "small";

    const dressCode = (event as unknown as { metadata?: { dress_code?: string } })?.metadata?.dress_code;

    // Build playbook using pure function
    const { posts, tasks } = buildContentPlan({
      eventDate,
      daysUntil,
      title,
      venueName,
      city,
      collectiveName,
      vibeStr,
      lineupStr,
      lowestPrice,
      ticketLink,
      eventSize,
      startsAt: event.starts_at,
      dressCode,
    });

    // Group by phase
    const phaseOrder = ["Plan & Book", "Announce", "Build Hype", "Urgency", "Final Push", "Day-Of", "Recap"];
    const weekLabels: Record<string, string> = {
      "Plan & Book": "6-8 weeks out",
      "Announce": "4 weeks out",
      "Build Hype": "2 weeks out",
      "Urgency": "1 week out",
      "Final Push": "3 days out",
      "Day-Of": "Event day",
      "Recap": "After the event",
    };

    const phases = phaseOrder
      .map((name) => ({
        name,
        weekLabel: weekLabels[name] ?? "",
        posts: posts.filter((p) => p.phase === name),
        tasks: tasks.filter((t) => t.phase === name),
      }))
      .filter((p) => p.posts.length > 0 || p.tasks.length > 0);

    return {
      error: null,
      playbook: {
        eventTitle: title,
        eventDate: event.starts_at,
        eventSize,
        totalPosts: posts.length,
        totalTasks: tasks.length,
        phases,
      },
    };
  } catch (err) {
    console.error("[generateContentPlaybook]", err);
    return { error: "Something went wrong", playbook: null };
  }
}
