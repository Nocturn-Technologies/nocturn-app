"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { buildContentPlan } from "@/lib/content-plan-builder";

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

// ─── Warehouse / Underground ────────────────────────────────────────────────
// Location-reveal strategy — RSVP first, address DM'd day-of
const WAREHOUSE_RAVE: PlaybookTask[] = [
  { title: "Scout + confirm warehouse space", description: "Lock in the venue with written agreement and deposit", category: "logistics", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Confirm generator, sound system, lights", description: "Production is everything in a warehouse — confirm PA, subs, lights, fog", category: "production", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Hire security + door staff", description: "Warehouse events need pros — confirm team, liability waivers, and plan", category: "logistics", dayOffset: -2, priority: "urgent", ownerType: "current" },
  { title: "Set up RSVP / access list (no public address)", description: "Publish event page with location hidden — 'address DM'd day-of'", category: "marketing", dayOffset: -1, priority: "urgent", ownerType: "current" },
  { title: "Post teaser — date + vibe, no location", description: "Dark aesthetic, cryptic caption, no address. Build intrigue.", category: "marketing", dayOffset: -3, priority: "high", ownerType: "team" },
  { title: "Lineup reveal with location-reveal countdown", description: "Drop the flyer with 'Location reveal 24h before'", category: "marketing", dayOffset: -7, priority: "high", ownerType: "team" },
  { title: "Confirm bar / drink service + ice run plan", description: "Warehouse = BYO bar. Confirm supplier, ice logistics, cups, bartenders", category: "logistics", dayOffset: -7, priority: "high", ownerType: "current" },
  { title: "Coordinate load-in access + parking plan", description: "Where do trucks unload? Where do guests park? Neighbors?", category: "logistics", dayOffset: -5, priority: "high", ownerType: "current" },
  { title: "Send location + entry instructions to RSVPs", description: "Mass email/DM the address, entry code, and rules 24h before", category: "marketing", dayOffset: -1, priority: "urgent", ownerType: "current" },
  { title: "Day-of runner — supplies, ice, cash floats", description: "Assign someone to handle last-minute runs and door cash", category: "logistics", dayOffset: -33, priority: "urgent", ownerType: "current" },
  { title: "Clean-up crew + trash plan", description: "Warehouses need to be left spotless — confirm cleaning team for 6am", category: "logistics", dayOffset: -33, priority: "high", ownerType: "current" },
  { title: "Post-event: thank you + next location tease", description: "Keep the audience warm with a cryptic 'until next time'", category: "marketing", dayOffset: 1, priority: "medium", ownerType: "team" },
];

// ─── Rooftop / Day Party ────────────────────────────────────────────────────
const ROOFTOP_DAY_PARTY: PlaybookTask[] = [
  { title: "Confirm rooftop venue + weather contingency", description: "Lock the space with a rain plan — indoor backup or date", category: "logistics", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Confirm sound permit + noise bylaw times", description: "Daytime events need permits — confirm allowed hours and volume limits", category: "logistics", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Publish event page", description: "Go live with date, rain plan, and ticket link", category: "marketing", dayOffset: -1, priority: "urgent", ownerType: "current" },
  { title: "Post daytime aesthetic teaser", description: "Golden hour, cocktails, rooftop vibes — leans into the day party angle", category: "marketing", dayOffset: -3, priority: "high", ownerType: "team" },
  { title: "Lineup reveal with flyer", description: "Drop full lineup with sunny/tropical aesthetic", category: "marketing", dayOffset: -7, priority: "high", ownerType: "team" },
  { title: "Confirm bar + signature cocktails menu", description: "Day parties live and die by the drinks — confirm menu and pricing", category: "logistics", dayOffset: -7, priority: "high", ownerType: "current" },
  { title: "Confirm sunshade / umbrellas / hydration", description: "Guest comfort = free water, shade, sunscreen station if possible", category: "logistics", dayOffset: -5, priority: "medium", ownerType: "current" },
  { title: "Monitor weather forecast + send update if needed", description: "3 days out — send an update to ticket holders with weather plan", category: "marketing", dayOffset: -3, priority: "high", ownerType: "current" },
  { title: "Day-of: soundcheck, bar setup, door staff brief", description: "Arrive 3h early for full setup — sound, bar, door, security", category: "logistics", dayOffset: -33, priority: "urgent", ownerType: "current" },
  { title: "Post recap within 24h — golden hour shots", description: "Day parties have the best photos — post recap fast while buzz is hot", category: "marketing", dayOffset: 1, priority: "high", ownerType: "team" },
];

// ─── Intimate House Party / Invite-Only ─────────────────────────────────────
const INTIMATE_HOUSE_PARTY: PlaybookTask[] = [
  { title: "Set guest cap + invite list", description: "Decide headcount (20-80) and draft the invite list", category: "general", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Send personal invites via DM / text", description: "Invite-only events are personal — send 1:1 messages, not mass posts", category: "marketing", dayOffset: -1, priority: "urgent", ownerType: "current" },
  { title: "Set up RSVP collection on Nocturn", description: "Use the event page to track yeses, maybes, and plus-ones", category: "marketing", dayOffset: -1, priority: "high", ownerType: "current" },
  { title: "Confirm food, drinks, and playlist", description: "Intimate events need thoughtful hosting — plan the menu and music", category: "logistics", dayOffset: -2, priority: "high", ownerType: "current" },
  { title: "Send reminder + address to confirmed RSVPs", description: "24-48h before — send address, time, and any house rules", category: "marketing", dayOffset: -2, priority: "high", ownerType: "current" },
  { title: "Prep the space + soundcheck", description: "Day-of: clean, set up bar, test speakers, lighting", category: "logistics", dayOffset: -33, priority: "high", ownerType: "current" },
  { title: "Thank-you message to guests", description: "Next morning — personal thank you in the group chat", category: "marketing", dayOffset: 1, priority: "medium", ownerType: "current" },
];

// ─── Multi-Day Festival ─────────────────────────────────────────────────────
const MULTI_DAY_FESTIVAL: PlaybookTask[] = [
  { title: "Lock festival site + multi-day agreement", description: "Confirm venue for all days with a detailed contract", category: "logistics", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Confirm all headliners across days", description: "Lock talent for every day with written agreements", category: "talent", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Apply for permits (sound, alcohol, capacity)", description: "Festivals require city permits — start early, allow 4-8 weeks", category: "logistics", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Set up multi-day ticket tiers (single day + festival pass)", description: "Offer single-day tickets + a festival pass with a discount", category: "marketing", dayOffset: -1, priority: "urgent", ownerType: "current" },
  { title: "Publish festival page + tease lineup", description: "Go live with dates, lineup teaser, and passes on sale", category: "marketing", dayOffset: -1, priority: "urgent", ownerType: "current" },
  { title: "Confirm camping / accommodation partnerships", description: "Partner with local hotels or set up camping logistics", category: "logistics", dayOffset: -1, priority: "high", ownerType: "current" },
  { title: "Phase 1 lineup drop (headliners)", description: "Reveal the top-of-bill for all days", category: "marketing", dayOffset: -3, priority: "high", ownerType: "team" },
  { title: "Confirm stage production (sound, lights, scaffolding)", description: "Lock stage vendors for multi-day setup and teardown", category: "production", dayOffset: -5, priority: "urgent", ownerType: "current" },
  { title: "Phase 2 lineup drop (full daily schedules)", description: "Reveal the complete lineup with stage splits + set times", category: "marketing", dayOffset: -10, priority: "high", ownerType: "team" },
  { title: "Influencer + press outreach", description: "Comp tickets for influencers and confirm press access", category: "marketing", dayOffset: -14, priority: "medium", ownerType: "current" },
  { title: "Coordinate artist travel + hospitality", description: "Multi-day festivals mean multi-day hospitality — rooms, riders, transport", category: "talent", dayOffset: -7, priority: "urgent", ownerType: "current" },
  { title: "Set up food vendors + bar partners", description: "Confirm vendors for all festival days — contracts, power, placement", category: "logistics", dayOffset: -10, priority: "high", ownerType: "current" },
  { title: "Hire production team + day-of crew", description: "Stage managers, runners, security, med tent, cleanup", category: "logistics", dayOffset: -14, priority: "urgent", ownerType: "current" },
  { title: "Send festival info packet to ticket holders", description: "Schedule, map, rules, FAQ — send 1 week before", category: "marketing", dayOffset: -7, priority: "high", ownerType: "team" },
  { title: "Daily social recaps during festival", description: "Post daily recaps every night to drive next-day ticket sales", category: "marketing", dayOffset: -33, priority: "medium", ownerType: "team" },
  { title: "Post-festival recap video + thank you", description: "Aftermovie, thank you post, and announce next year's dates", category: "marketing", dayOffset: 3, priority: "high", ownerType: "team" },
  { title: "Settle with all artists, vendors, and venue", description: "Multi-day settlements are complex — stay organized and prompt", category: "finance", dayOffset: 5, priority: "urgent", ownerType: "current" },
];

// ─── Ticketed Concert / Headliner Show ──────────────────────────────────────
const TICKETED_CONCERT: PlaybookTask[] = [
  { title: "Sign headliner contract + deposit", description: "Lock the headliner with a signed agreement and paid deposit", category: "talent", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Confirm venue contract + tech specs", description: "Lock venue and match tech specs to artist rider", category: "logistics", dayOffset: 0, priority: "urgent", ownerType: "current" },
  { title: "Publish event page + tickets on sale", description: "Go live with tiered ticket pricing", category: "marketing", dayOffset: -1, priority: "urgent", ownerType: "current" },
  { title: "Announce headliner + open presale", description: "Presale to mailing list first, then public sale 24-48h later", category: "marketing", dayOffset: -3, priority: "high", ownerType: "team" },
  { title: "Coordinate artist travel + hospitality rider", description: "Flights, hotel, ground transport, rider fulfillment", category: "talent", dayOffset: -5, priority: "urgent", ownerType: "current" },
  { title: "Announce support acts", description: "Drop support acts to give attendees more reasons to arrive early", category: "marketing", dayOffset: -10, priority: "medium", ownerType: "team" },
  { title: "Media + press outreach", description: "Send press release with hi-res images, artist bios, interview requests", category: "marketing", dayOffset: -14, priority: "medium", ownerType: "current" },
  { title: "Confirm tech crew (FOH, monitors, lighting)", description: "Match artist rider — FOH engineer, monitor tech, lighting tech", category: "production", dayOffset: -7, priority: "urgent", ownerType: "current" },
  { title: "Set times + soundcheck schedule", description: "Build the run-of-show document — doors, soundcheck, set times, curfew", category: "logistics", dayOffset: -3, priority: "high", ownerType: "current" },
  { title: "Send tech pack + run-of-show to all crew", description: "Every staff member needs the doc 48h before", category: "logistics", dayOffset: -2, priority: "urgent", ownerType: "current" },
  { title: "Day-of: soundcheck, doors, show call", description: "Arrive early, run soundcheck, brief door staff, doors at call time", category: "logistics", dayOffset: -33, priority: "urgent", ownerType: "current" },
  { title: "Post-show settlement + artist payment", description: "Settle with artists and venue same night or next day", category: "finance", dayOffset: 1, priority: "urgent", ownerType: "current" },
  { title: "Thank you post + recap content", description: "Thank the artist, the crew, and the crowd", category: "marketing", dayOffset: 1, priority: "high", ownerType: "team" },
];

const PLAYBOOK_MAP: Record<string, PlaybookTask[]> = {
  "launch-promote": LAUNCH_PROMOTE,
  "lean-launch": LEAN_LAUNCH,
  "full-campaign": FULL_CAMPAIGN,
  "warehouse-rave": WAREHOUSE_RAVE,
  "rooftop-day-party": ROOFTOP_DAY_PARTY,
  "intimate-house-party": INTIMATE_HOUSE_PARTY,
  "multi-day-festival": MULTI_DAY_FESTIVAL,
  "ticketed-concert": TICKETED_CONCERT,
};

export async function getPlaybookOptions(): Promise<PlaybookOption[]> {
  try {
  return [
    {
      id: "launch-promote",
      name: "Launch & Promote",
      description: "Balanced plan for a standard club night with promo, logistics, and wrap",
      taskCount: LAUNCH_PROMOTE.length,
      icon: "rocket",
      recommended: true,
    },
    {
      id: "lean-launch",
      name: "Lean Launch",
      description: "Essential tasks for small, free, or fast-turnaround events",
      taskCount: LEAN_LAUNCH.length,
      icon: "zap",
    },
    {
      id: "full-campaign",
      name: "Full Campaign",
      description: "Everything in Launch & Promote plus press, paid ads, video & influencer outreach",
      taskCount: FULL_CAMPAIGN.length,
      icon: "megaphone",
    },
    {
      id: "warehouse-rave",
      name: "Warehouse Rave",
      description: "Location-reveal strategy, underground aesthetic, BYO bar logistics",
      taskCount: WAREHOUSE_RAVE.length,
      icon: "warehouse",
    },
    {
      id: "rooftop-day-party",
      name: "Rooftop Day Party",
      description: "Weather contingency, sound permits, and golden-hour marketing",
      taskCount: ROOFTOP_DAY_PARTY.length,
      icon: "sun",
    },
    {
      id: "ticketed-concert",
      name: "Ticketed Concert",
      description: "Headliner-first show with rider, tech pack, and run-of-show",
      taskCount: TICKETED_CONCERT.length,
      icon: "mic",
    },
    {
      id: "intimate-house-party",
      name: "Intimate House Party",
      description: "Invite-only list, personal DMs, and thoughtful hosting",
      taskCount: INTIMATE_HOUSE_PARTY.length,
      icon: "home",
    },
    {
      id: "multi-day-festival",
      name: "Multi-Day Festival",
      description: "Multi-stage production, camping, permits, and phased lineup drops",
      taskCount: MULTI_DAY_FESTIVAL.length,
      icon: "tent",
    },
  ];
  } catch (err) {
    console.error("[getPlaybookOptions]", err);
    return [];
  }
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

        // Filter to Instagram (feed + stories) and email only — no Twitter
        const filteredPosts = contentPlan.posts.filter(
          (p) => p.platform !== "twitter"
        );
        const contentTasks = filteredPosts.map((post, i) => {
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
          const { error: contentInsertErr } = await admin.from("event_tasks").insert(contentTasks);
          if (contentInsertErr) {
            console.error("[applyLaunchPlaybook] content task insert error", contentInsertErr);
          } else {
            contentTaskCount = contentTasks.length;
          }
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
