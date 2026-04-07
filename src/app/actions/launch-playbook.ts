"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { buildContentPlan } from "./content-playbook";

// ─── Playbook Templates ────────────────────────────────────────────────────

interface PlaybookTask {
  title: string;
  description: string;
  category: string;
  /** Negative = days before event, 0 = event day, positive = after */
  dayOffset: number;
  priority: "low" | "medium" | "high" | "urgent";
  /** "current" = assign to the user creating the event, "team" = unassigned */
  ownerType: "current" | "team";
}

export interface PlaybookOption {
  id: string;
  name: string;
  description: string;
  taskCount: number;
  icon: string;
  recommended?: boolean;
}

const LAUNCH_PROMOTE: PlaybookTask[] = [
  // ── Immediate (Day 0 — event creation day) ──
  { title: "Invite team members to event chat", description: "Get your crew in the loop from day one", category: "general", dayOffset: 0, priority: "high", ownerType: "current" },
  { title: "Invite collab collectives to event chat", description: "Reach out to partners and collaborators", category: "general", dayOffset: 0, priority: "medium", ownerType: "current" },
  { title: "Confirm headliner / lock in talent", description: "Get verbal or written confirmation from your main act", category: "talent", dayOffset: 0, priority: "urgent", ownerType: "current" },

  // ── Week 1 ──
  { title: "Create or upload event poster / artwork", description: "Design your flyer in Nocturn or upload from your designer", category: "marketing", dayOffset: -1, priority: "high", ownerType: "team" },
  { title: "Write event description and copy", description: "Craft the story for your event page — vibe, lineup, what to expect", category: "marketing", dayOffset: -2, priority: "medium", ownerType: "current" },
  { title: "Publish event page", description: "Go live so tickets are available and the public page is shareable", category: "marketing", dayOffset: -3, priority: "urgent", ownerType: "current" },
  { title: "Post teaser — 'something's coming' (no lineup)", description: "Build intrigue without revealing details. Dark/moody image, date only.", category: "marketing", dayOffset: -3, priority: "high", ownerType: "team" },

  // ── Week 2 ──
  { title: "Post event poster with full lineup reveal", description: "Drop the flyer with full artist names. Tag every artist.", category: "marketing", dayOffset: -7, priority: "high", ownerType: "team" },
  { title: "Share event to personal + collective socials", description: "Every team member shares to their personal accounts for maximum reach", category: "marketing", dayOffset: -7, priority: "medium", ownerType: "team" },
  { title: "Artist spotlight post #1 (headliner)", description: "Feature your headliner — bio, music link, what they bring to the night", category: "marketing", dayOffset: -9, priority: "medium", ownerType: "team" },
  { title: "Set up promo codes for street team", description: "Create discount codes in Nocturn for your promoters and ambassadors", category: "marketing", dayOffset: -9, priority: "medium", ownerType: "current" },
  { title: "Create Instagram story / reel teaser (15-30s)", description: "Short video content — use artist music, venue shots, or past event clips", category: "marketing", dayOffset: -11, priority: "medium", ownerType: "team" },

  // ── Week 3 ──
  { title: "Artist spotlight post #2 (support act)", description: "Feature a supporting artist to keep momentum going", category: "marketing", dayOffset: -14, priority: "medium", ownerType: "team" },
  { title: "FAQ post (venue info, dress code, age, parking)", description: "Answer common questions proactively — reduces DMs and builds confidence", category: "marketing", dayOffset: -16, priority: "low", ownerType: "team" },
  { title: "Reach out to media / blogs / local pages", description: "Send press release or event details to local nightlife blogs and pages", category: "marketing", dayOffset: -16, priority: "medium", ownerType: "current" },
  { title: "Early bird price increase reminder post", description: "'Last chance for early bird pricing' — drives urgency before tier change", category: "marketing", dayOffset: -18, priority: "high", ownerType: "team" },

  // ── Week 4 ──
  { title: "Set times post / schedule reveal", description: "Share the performance schedule — helps attendees plan their night", category: "marketing", dayOffset: -21, priority: "high", ownerType: "team" },
  { title: "'1 week out' countdown post", description: "Countdown content builds excitement and reminds fence-sitters", category: "marketing", dayOffset: -24, priority: "medium", ownerType: "team" },
  { title: "'Limited tickets' final push post", description: "Scarcity messaging — share actual ticket counts if possible", category: "marketing", dayOffset: -26, priority: "high", ownerType: "team" },
  { title: "Confirm all vendors (sound, lights, security)", description: "Final confirmation with all vendors — arrival times, contact numbers, requirements", category: "logistics", dayOffset: -27, priority: "urgent", ownerType: "current" },

  // ── Final Days + Event Day ──
  { title: "Day-of logistics checklist", description: "Doors time, sound check, guest list printed, QR scanner tested, bar stock confirmed", category: "logistics", dayOffset: -32, priority: "urgent", ownerType: "current" },
  { title: "'Tonight' hype post + story", description: "Day-of social media — build last-minute excitement and FOMO", category: "marketing", dayOffset: -33, priority: "high", ownerType: "team" },
  { title: "Print guest list / test QR scanner", description: "Have a backup paper list and make sure check-in tech works", category: "logistics", dayOffset: -33, priority: "high", ownerType: "current" },

  // ── Post-Event ──
  { title: "Post-event thank you + recap teaser", description: "Thank attendees, artists, and venue within 24 hours while energy is fresh", category: "marketing", dayOffset: 1, priority: "high", ownerType: "team" },
  { title: "Review financials + send settlement", description: "Generate P&L in Nocturn, split revenue, send settlement to artists/venue", category: "finance", dayOffset: 2, priority: "urgent", ownerType: "current" },
];

const LEAN_LAUNCH: PlaybookTask[] = [
  { title: "Create or upload event poster", description: "Design your flyer or upload one from your designer", category: "marketing", dayOffset: 0, priority: "high", ownerType: "team" },
  { title: "Publish event page", description: "Go live so your link is shareable", category: "marketing", dayOffset: -1, priority: "urgent", ownerType: "current" },
  { title: "Invite team to event chat", description: "Get your crew in the loop", category: "general", dayOffset: 0, priority: "medium", ownerType: "current" },
  { title: "Post lineup announcement", description: "Share flyer to socials with artist tags", category: "marketing", dayOffset: -3, priority: "high", ownerType: "team" },
  { title: "Share event link to personal accounts", description: "Every team member shares for maximum reach", category: "marketing", dayOffset: -3, priority: "medium", ownerType: "team" },
  { title: "'This week' reminder post", description: "Countdown post to drive last-minute sales", category: "marketing", dayOffset: -21, priority: "medium", ownerType: "team" },
  { title: "'Tonight' hype story", description: "Day-of stories building anticipation", category: "marketing", dayOffset: -33, priority: "medium", ownerType: "team" },
  { title: "Confirm door staff and sound", description: "Final check with all vendors", category: "logistics", dayOffset: -27, priority: "urgent", ownerType: "current" },
  { title: "Day-of checklist", description: "Sound check, guest list, QR scanner, bar stock", category: "logistics", dayOffset: -33, priority: "urgent", ownerType: "current" },
  { title: "Post-event thank you", description: "Thank attendees and artists within 24 hours", category: "marketing", dayOffset: 1, priority: "high", ownerType: "team" },
];

const FULL_CAMPAIGN: PlaybookTask[] = [
  ...LAUNCH_PROMOTE,
  { title: "Create press release / media kit", description: "Professional press release with hi-res images, artist bios, and event details", category: "marketing", dayOffset: -5, priority: "medium", ownerType: "team" },
  { title: "Plan aftermovie / recap video", description: "Brief your videographer on shots needed for post-event content", category: "marketing", dayOffset: -9, priority: "medium", ownerType: "team" },
  { title: "Set up paid ad campaign", description: "Instagram/Facebook ads targeting local nightlife audience", category: "marketing", dayOffset: -7, priority: "high", ownerType: "current" },
  { title: "Influencer / tastemaker outreach", description: "Send comp tickets to local influencers and nightlife tastemakers", category: "marketing", dayOffset: -14, priority: "medium", ownerType: "current" },
  { title: "Coordinate artist travel and hospitality", description: "Book flights, hotel, ground transport. Send itinerary to artists.", category: "talent", dayOffset: -5, priority: "urgent", ownerType: "current" },
  { title: "Book event photographer", description: "Confirm photographer for the night — needed for recap content", category: "production", dayOffset: -9, priority: "high", ownerType: "current" },
  { title: "Book videographer for aftermovie", description: "Professional video for post-event content and future promo", category: "production", dayOffset: -9, priority: "medium", ownerType: "current" },
  { title: "Create multiple video content pieces", description: "Venue walkthrough, BTS prep, artist interview clips", category: "marketing", dayOffset: -20, priority: "medium", ownerType: "team" },
];

const PLAYBOOK_MAP: Record<string, PlaybookTask[]> = {
  "launch-promote": LAUNCH_PROMOTE,
  "lean-launch": LEAN_LAUNCH,
  "full-campaign": FULL_CAMPAIGN,
};

export async function getPlaybookOptions(): Promise<PlaybookOption[]> {
  return [
    {
      id: "launch-promote",
      name: "Launch & Promote",
      description: "25 tasks covering promo plan, logistics, and post-event wrap",
      taskCount: LAUNCH_PROMOTE.length,
      icon: "rocket",
      recommended: true,
    },
    {
      id: "lean-launch",
      name: "Lean Launch",
      description: "10 essential tasks for small or free events",
      taskCount: LEAN_LAUNCH.length,
      icon: "zap",
    },
    {
      id: "full-campaign",
      name: "Full Campaign",
      description: "33 tasks including press, paid ads, video, and influencer outreach",
      taskCount: FULL_CAMPAIGN.length,
      icon: "megaphone",
    },
  ];
}

/**
 * Apply a launch playbook to a newly created event.
 * Generates tasks with due dates calculated backwards from the event date.
 * dayOffset is relative: tasks are distributed proportionally if the event is less than 5 weeks out.
 */
export async function applyLaunchPlaybook(eventId: string, playbookId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!eventId?.trim()) return { error: "Event ID is required" };
    if (!playbookId?.trim()) return { error: "Playbook ID is required" };

    const template = PLAYBOOK_MAP[playbookId];
    if (!template) return { error: "Unknown playbook" };

    const admin = createAdminClient();

    // Verify access
    const { data: event } = await admin
      .from("events")
      .select("starts_at, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) return { error: "Event not found" };

    const { count } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!count) return { error: "Not authorized" };

    const eventDate = new Date(event.starts_at);
    const now = new Date();
    const daysUntilEvent = Math.max(1, Math.ceil((eventDate.getTime() - now.getTime()) / 86400000));

    // Find the max dayOffset span in the template (for proportional scaling)
    const preLaunchTasks = template.filter(t => t.dayOffset <= 0);
    const postEventTasks = template.filter(t => t.dayOffset > 0);
    const maxPreOffset = Math.max(...preLaunchTasks.map(t => Math.abs(t.dayOffset)), 1);

    // Scale factor: if event is 35 days out and template spans 33 days, scale ~1:1
    // If event is 10 days out, compress proportionally
    const scaleFactor = Math.min(1, (daysUntilEvent - 1) / maxPreOffset);

    const tasks = template.map((t, i) => {
      let dueDate: Date;

      if (t.dayOffset > 0) {
        // Post-event tasks: offset from event date
        dueDate = new Date(eventDate.getTime() + t.dayOffset * 86400000);
      } else if (t.dayOffset === 0) {
        // Due today (event creation day) — give a few hours
        dueDate = new Date(now.getTime() + 4 * 3600000);
      } else {
        // Pre-event tasks: scale proportionally
        const scaledDays = Math.round(Math.abs(t.dayOffset) * scaleFactor);
        const daysBefore = Math.max(1, scaledDays);
        dueDate = new Date(eventDate.getTime() - daysBefore * 86400000);

        // Don't schedule tasks in the past
        if (dueDate < now) {
          dueDate = new Date(now.getTime() + (i + 1) * 3600000); // stagger by hours from now
        }
      }

      return {
        event_id: eventId,
        title: t.title,
        description: t.description,
        status: "todo",
        priority: t.priority,
        assigned_to: t.ownerType === "current" ? user.id : null,
        due_at: dueDate.toISOString(),
        metadata: {
          created_by: user.id,
          source: `playbook:${playbookId}`,
          category: t.category,
          position: i,
        },
      };
    });

    const { error } = await admin.from("event_tasks").insert(tasks);
    if (error) {
      console.error("[applyLaunchPlaybook] insert error", error);
      return { error: "Failed to create tasks" };
    }

    // ── Generate content tasks ──────────────────────────────────────────────
    let contentTaskCount = 0;
    try {
      // Fetch event data needed for content generation (parallel)
      const [eventData, lineupData, tierData, allTierData] = await Promise.all([
        admin
          .from("events")
          .select("title, slug, starts_at, vibe_tags, venues(name, city), collectives(name, slug)")
          .eq("id", eventId)
          .maybeSingle(),
        admin
          .from("event_artists")
          .select("artists(name)")
          .eq("event_id", eventId),
        admin
          .from("ticket_tiers")
          .select("name, price")
          .eq("event_id", eventId)
          .order("price", { ascending: true })
          .limit(1),
        admin
          .from("ticket_tiers")
          .select("capacity")
          .eq("event_id", eventId),
      ]);

      if (eventData.data) {
        const ev = eventData.data;
        const venue = ev.venues as unknown as { name: string; city: string } | null;
        const collective = ev.collectives as unknown as { name: string; slug: string } | null;
        const vibes = (ev.vibe_tags as string[]) ?? [];
        const vibeStr = vibes.length > 0 ? vibes.slice(0, 3).join(", ") : "underground";

        const artistNames = (lineupData.data ?? [])
          .map((l) => (l.artists as unknown as { name: string })?.name)
          .filter(Boolean);
        const lineupStr = artistNames.length > 0 ? artistNames.join(", ") : "a curated lineup";

        const lowestPrice = tierData.data?.[0]?.price
          ? `$${Number(tierData.data[0].price).toFixed(0)}`
          : "limited";

        const collectiveSlug = collective?.slug ?? event.collective_id;
        const eventSlug = ev.slug ?? eventId;
        const ticketLink = `app.trynocturn.com/e/${collectiveSlug}/${eventSlug}`;

        const totalCapacity = (allTierData.data ?? []).reduce(
          (sum, t) => sum + (t.capacity ?? 0),
          0,
        );
        const eventSize: "small" | "medium" | "large" =
          totalCapacity > 300 ? "large" : totalCapacity > 100 ? "medium" : "small";

        const contentPlan = buildContentPlan({
          eventDate,
          daysUntil: daysUntilEvent,
          title: ev.title,
          venueName: venue?.name ?? "the venue",
          city: venue?.city ?? "the city",
          collectiveName: collective?.name ?? "the collective",
          vibeStr,
          lineupStr,
          lowestPrice,
          ticketLink,
          eventSize,
          startsAt: ev.starts_at,
        });

        const contentTasks = contentPlan.posts.map((post, i) => {
          const platformLabels: Record<string, string> = {
            instagram: "Instagram",
            twitter: "Twitter/X",
            email: "Email",
            story: "IG Story",
            all: "All Platforms",
          };
          const dueDate = new Date(eventDate.getTime() - post.daysBefore * 86400000);
          // Don't schedule in the past
          if (dueDate < new Date()) dueDate.setTime(Date.now() + (i + 1) * 3600000);

          return {
            event_id: eventId,
            title: `${platformLabels[post.platform] ?? post.platform} post — ${post.phase}`,
            description: post.caption.slice(0, 500),
            status: "todo",
            priority: "medium",
            assigned_to: null,
            due_at: dueDate.toISOString(),
            metadata: {
              created_by: user.id,
              source: `playbook:${playbookId}:content`,
              category: "content",
              task_type: "content",
              platform: post.platform,
              caption: post.caption,
              hashtags: post.hashtags,
              tip: post.tip,
              phase: post.phase,
              position: 1000 + i,
            },
          };
        });

        if (contentTasks.length > 0) {
          await admin.from("event_tasks").insert(contentTasks);
          contentTaskCount = contentTasks.length;
        }
      }
    } catch (contentErr) {
      // Content generation is best-effort — don't fail the whole playbook
      console.error("[applyLaunchPlaybook] content generation error", contentErr);
    }

    // Log activity
    const totalCount = tasks.length + contentTaskCount;
    await admin.from("event_activity").insert({
      event_id: eventId,
      user_id: user.id,
      action: "system",
      description: `Applied "${playbookId}" playbook — ${tasks.length} ops tasks + ${contentTaskCount} content tasks created (${totalCount} total)`,
    });

    return { error: null, taskCount: totalCount };
  } catch (err) {
    console.error("[applyLaunchPlaybook]", err);
    return { error: "Something went wrong" };
  }
}
