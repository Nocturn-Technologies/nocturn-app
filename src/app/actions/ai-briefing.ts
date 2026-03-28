"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateWithClaude } from "@/lib/claude";
import { getDashboardBriefingData } from "@/lib/ai-context";
import { createAdminClient } from "@/lib/supabase/config";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BriefingItem {
  emoji: string;
  text: string;
  priority: "urgent" | "high" | "normal";
  link: string;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

import { SYSTEM_PROMPTS } from "@/lib/ai-prompts";

const BRIEFING_SYSTEM_PROMPT = SYSTEM_PROMPTS.briefing;

// ─── Fallback (no AI) ──────────────────────────────────────────────────────

function generateFallbackBriefing(data: Awaited<ReturnType<typeof getDashboardBriefingData>>): BriefingItem[] {
  const items: BriefingItem[] = [];

  // Upcoming events within 3 days → urgent
  const soonEvents = data.upcoming.filter((e) => e.daysUntil <= 3);
  for (const event of soonEvents) {
    items.push({
      emoji: "🔥",
      text:
        event.daysUntil === 0
          ? `${event.title} is tonight — make sure everything is locked in.`
          : event.daysUntil === 1
            ? `${event.title} is tomorrow. Final prep time.`
            : `${event.title} is in ${event.daysUntil} days. Review your checklist.`,
      priority: "urgent",
      link: `/dashboard/events/${event.id}`,
    });
  }

  // Tickets sold today → normal
  if (data.ticketsSoldToday > 0) {
    items.push({
      emoji: "🎟️",
      text: `${data.ticketsSoldToday} ticket${data.ticketsSoldToday === 1 ? "" : "s"} sold today — $${data.revenueToday.toFixed(0)} in revenue.`,
      priority: "normal",
      link: "/dashboard/finance",
    });
  }

  // Open tasks → high
  if (data.openTasks > 0) {
    items.push({
      emoji: "📋",
      text: `You have ${data.openTasks} open task${data.openTasks === 1 ? "" : "s"} across your events.`,
      priority: "high",
      link: "/dashboard/events",
    });
  }

  // Pending settlements → high
  if (data.pendingSettlements.length > 0) {
    const total = data.pendingSettlements.reduce((s, p) => s + p.grossRevenue, 0);
    items.push({
      emoji: "💰",
      text: `${data.pendingSettlements.length} settlement${data.pendingSettlements.length === 1 ? "" : "s"} pending — $${total.toFixed(0)} to reconcile.`,
      priority: "high",
      link: "/dashboard/finance",
    });
  }

  // Draft events → normal
  if (data.drafts > 0) {
    items.push({
      emoji: "✏️",
      text: `${data.drafts} draft event${data.drafts === 1 ? "" : "s"} waiting to be published.`,
      priority: "normal",
      link: "/dashboard/events",
    });
  }

  return items;
}

// ─── Main Action ────────────────────────────────────────────────────────────

const BRIEFING_CACHE_HOURS = 4; // Only regenerate every 4 hours

export async function generateMorningBriefing(collectiveId: string): Promise<BriefingItem[]> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const sb = createAdminClient();

  // Check cache — avoid burning API calls on every dashboard load
  try {
    const { data: cachedRaw } = await sb
      .from("audit_logs")
      .select("new_data, created_at")
      .eq("table_name", "briefing_cache")
      .eq("record_id", collectiveId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cached = cachedRaw as { new_data: Record<string, unknown> | null; created_at: string } | null;

    if (cached?.created_at) {
      const ageMs = Date.now() - new Date(cached.created_at).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      if (ageHours < BRIEFING_CACHE_HOURS && cached.new_data?.items) {
        return cached.new_data.items as BriefingItem[];
      }
    }
  } catch {
    // Cache check failed — proceed to generate fresh
  }

  let data: Awaited<ReturnType<typeof getDashboardBriefingData>>;

  try {
    data = await getDashboardBriefingData(collectiveId);
  } catch (err) {
    console.error("Failed to fetch briefing data:", err);
    return []; // Safe fallback — dashboard renders without briefing
  }

  const prompt = `Here is today's data for this collective:

- Upcoming events: ${JSON.stringify(data.upcoming)}
- Tickets sold today: ${data.ticketsSoldToday}
- Revenue today: $${data.revenueToday.toFixed(2)}
- Open tasks: ${data.openTasks}
- Pending settlements: ${JSON.stringify(data.pendingSettlements)}
- Draft events: ${data.drafts}

Generate the morning briefing JSON array.`;

  let briefingItems: BriefingItem[];

  try {
    const result = await generateWithClaude(prompt, BRIEFING_SYSTEM_PROMPT);

    if (result) {
      const cleaned = result.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed: BriefingItem[] = JSON.parse(cleaned);

      if (Array.isArray(parsed) && parsed.length >= 1) {
        briefingItems = parsed.slice(0, 5);
      } else {
        briefingItems = generateFallbackBriefing(data);
      }
    } else {
      briefingItems = generateFallbackBriefing(data);
    }
  } catch {
    console.error("Failed to parse briefing JSON, using fallback");
    briefingItems = generateFallbackBriefing(data);
  }

  // Cache the result (non-blocking)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("audit_logs") as any).insert({
      table_name: "briefing_cache",
      record_id: collectiveId,
      action: "briefing_generated",
      new_data: { items: briefingItems },
    });
  } catch {
    // Cache write failed — non-critical
  }

  return briefingItems;
}
