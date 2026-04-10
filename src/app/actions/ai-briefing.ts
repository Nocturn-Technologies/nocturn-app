"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateWithClaude } from "@/lib/claude";
import { getDashboardBriefingData } from "@/lib/ai-context";
import { createAdminClient } from "@/lib/supabase/config";
import { unstable_cache } from "next/cache";
import { rateLimitStrict } from "@/lib/rate-limit";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BriefingItem {
  emoji: string;
  text: string;
  priority: "urgent" | "high" | "normal";
  link: string;
}

// ─── Link Sanitization ──────────────────────────────────────────────────────

/**
 * Sanitizes an AI-generated link to prevent javascript:/data:/vbscript: XSS
 * and external open-redirects. Only allows safe relative paths under the app.
 * Returns null if the link is unsafe or invalid.
 */
function sanitizeBriefingLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  // Cap length to avoid pathological inputs
  if (trimmed.length > 500) return null;

  const lower = trimmed.toLowerCase();

  // Reject any scheme-like or protocol-relative prefixes
  if (lower.includes("://")) return null;
  if (lower.startsWith("//")) return null;
  if (lower.startsWith("javascript:")) return null;
  if (lower.startsWith("data:")) return null;
  if (lower.startsWith("vbscript:")) return null;
  // Reject backslashes which some browsers treat like '/'
  if (trimmed.includes("\\")) return null;
  // Reject encoded slashes to prevent bypass
  if (/%2f/i.test(trimmed) || /%5c/i.test(trimmed)) return null;

  // Only allow paths that are clearly relative to our app root
  if (trimmed.startsWith("/dashboard/") || trimmed === "/dashboard") return trimmed;
  if (trimmed.startsWith("/")) return trimmed;

  return null;
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

// ─── Cached Briefing Generator ──────────────────────────────────────────────

const BRIEFING_REVALIDATE_SECONDS = 4 * 60 * 60; // 4 hours

/**
 * The expensive part: fetch data + call Claude. Wrapped in unstable_cache
 * so Next.js caches the result per collective for 4 hours — no DB read
 * or AI call on subsequent dashboard loads within the TTL.
 */
const generateBriefingCached = unstable_cache(
  async (collectiveId: string): Promise<BriefingItem[]> => {
    let data: Awaited<ReturnType<typeof getDashboardBriefingData>>;

    try {
      data = await getDashboardBriefingData(collectiveId);
    } catch (err) {
      console.error("Failed to fetch briefing data:", err);
      return [];
    }

    const prompt = `Here is today's data for this collective:

- Upcoming events: ${JSON.stringify(data.upcoming)}
- Tickets sold today: ${data.ticketsSoldToday}
- Revenue today: $${data.revenueToday.toFixed(2)}
- Open tasks: ${data.openTasks}
- Pending settlements: ${JSON.stringify(data.pendingSettlements)}
- Draft events: ${data.drafts}

Generate the morning briefing JSON array.`;

    try {
      const result = await generateWithClaude(prompt, BRIEFING_SYSTEM_PROMPT);

      if (result) {
        const cleaned = result.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed: unknown = JSON.parse(cleaned);

        if (Array.isArray(parsed) && parsed.length >= 1) {
          // Sanitize every link field defensively — Claude's output is untrusted
          const sanitized: BriefingItem[] = parsed
            .slice(0, 5)
            .map((raw) => {
              const item = raw as Partial<BriefingItem>;
              const safeLink = sanitizeBriefingLink(item.link) ?? "/dashboard";
              return {
                emoji: typeof item.emoji === "string" ? item.emoji : "•",
                text: typeof item.text === "string" ? item.text : "",
                priority:
                  item.priority === "urgent" || item.priority === "high" || item.priority === "normal"
                    ? item.priority
                    : "normal",
                link: safeLink,
              };
            })
            .filter((item) => item.text.length > 0);

          if (sanitized.length >= 1) return sanitized;
        }
      }
    } catch {
      console.error("Failed to parse briefing JSON, using fallback");
    }

    return generateFallbackBriefing(data);
  },
  ["morning-briefing"],
  { revalidate: BRIEFING_REVALIDATE_SECONDS, tags: ["briefing"] }
);

// ─── Main Action ────────────────────────────────────────────────────────────

export async function generateMorningBriefing(collectiveId: string): Promise<BriefingItem[]> {
  try {
    if (!collectiveId?.trim()) return [];

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { success: rlOk } = await rateLimitStrict(`ai-briefing:${user.id}`, 5, 60_000);
    if (!rlOk) return [];

    const sb = createAdminClient();

    // Verify caller is a member of the supplied collective
    const { count, error: memberError } = await sb
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", collectiveId)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (memberError) {
      console.error("[generateMorningBriefing] membership check failed:", memberError);
      return [];
    }
    if (!count) return [];

    // Generate (or return cached) briefing — cached per collective for 4 hours
    return generateBriefingCached(collectiveId);
  } catch (err) {
    console.error("[generateMorningBriefing]", err);
    return [];
  }
}
