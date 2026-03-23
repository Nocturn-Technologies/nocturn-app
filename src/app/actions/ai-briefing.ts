"use server";

import { generateWithClaude } from "@/lib/claude";
import { getDashboardBriefingData } from "@/lib/ai-context";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BriefingItem {
  emoji: string;
  text: string;
  priority: "urgent" | "high" | "normal";
  link: string;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const BRIEFING_SYSTEM_PROMPT =
  "You are Nocturn AI briefing assistant. Generate a concise morning briefing for a nightlife promoter. Return EXACTLY a JSON array of 3-5 objects with {emoji, text, priority, link} where link is the relative URL path they should go to. Priority is 'urgent', 'high', or 'normal'. Use real numbers from the data. Be specific and actionable. No fluff.";

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

export async function generateMorningBriefing(collectiveId: string): Promise<BriefingItem[]> {
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

  try {
    const result = await generateWithClaude(prompt, BRIEFING_SYSTEM_PROMPT);

    if (result) {
      const cleaned = result.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed: BriefingItem[] = JSON.parse(cleaned);

      if (Array.isArray(parsed) && parsed.length >= 1) {
        return parsed.slice(0, 5);
      }
    }
  } catch {
    console.error("Failed to parse briefing JSON, using fallback");
  }

  return generateFallbackBriefing(data);
}
