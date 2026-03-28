"use server";

import { createAdminClient } from "@/lib/supabase/config";
import { generateWithClaude } from "@/lib/claude";

const SYSTEM_PROMPT = `You are Nocturn's AI assistant for music collectives and promoters. You have access to the user's real data. Answer questions concisely and actionably. Use their actual numbers. If they ask you to do something you can't (like send an email), tell them which page to go to. Keep responses under 3 sentences unless they ask for detail.

You say "operators" not "users," "collectives" not "teams." You're calm, direct, and never waste words.

Navigation help:
- Settlements & payouts → Money page (Finance section)
- Create an event → Ops → "New Event"
- Email attendees → Promo page
- View audience → Reach page
- Team chat → Chat page
- Tasks → Inside each event's Tasks tab
- Settings & Stripe connect → Settings page`;

export async function askNocturn(
  question: string,
  collectiveId: string,
  history?: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  if (!question.trim()) {
    return "Ask me anything about your events, revenue, audience, or how to use Nocturn.";
  }

  const sb = createAdminClient();

  try {
    // Query relevant data in parallel
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      upcomingRes,
      recentRes,
      monthTicketsRes,
      audienceRes,
      tasksRes,
      collectiveRes,
    ] = await Promise.all([
      // Upcoming events
      sb
        .from("events")
        .select("title, starts_at, status, ticket_tiers(name, price, capacity), tickets(id, status)")
        .eq("collective_id", collectiveId)
        .in("status", ["published", "draft"])
        .gte("starts_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(5),

      // Recent completed events
      sb
        .from("events")
        .select("title, starts_at, status, tickets(id, status, price_paid)")
        .eq("collective_id", collectiveId)
        .eq("status", "completed")
        .order("starts_at", { ascending: false })
        .limit(5),

      // Tickets sold this month (for revenue)
      sb
        .from("tickets")
        .select("price_paid, status, created_at, events!inner(collective_id)")
        .eq("events.collective_id", collectiveId)
        .in("status", ["paid", "checked_in"])
        .gte("created_at", monthStart),

      // Audience stats — email is in metadata jsonb, not a column
      sb
        .from("tickets")
        .select("metadata, status, events!inner(collective_id)")
        .eq("events.collective_id", collectiveId)
        .in("status", ["paid", "checked_in"]),

      // Open tasks
      sb
        .from("event_tasks")
        .select("title, status, events!inner(collective_id, title)")
        .eq("events.collective_id", collectiveId)
        .neq("status", "done")
        .limit(10),

      // Collective name
      sb
        .from("collectives")
        .select("name")
        .eq("id", collectiveId)
        .maybeSingle(),
    ]);

    // Build context string — cast Supabase results (no generated DB types)
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const contextLines: string[] = [];
    const collectiveName = (collectiveRes.data as any)?.name || "Your collective";
    contextLines.push(`Collective: ${collectiveName}`);
    contextLines.push("");

    // Upcoming events
    const upcoming = (upcomingRes.data || []) as any[];
    if (upcoming.length > 0) {
      contextLines.push("UPCOMING EVENTS:");
      for (const e of upcoming) {
        const tiers = (e.ticket_tiers as unknown as { name: string; price: number; capacity: number }[]) || [];
        const tickets = (e.tickets as unknown as { id: string; status: string }[]) || [];
        const sold = tickets.filter((t) => ["paid", "checked_in"].includes(t.status)).length;
        const totalCap = tiers.reduce((s, t) => s + (t.capacity || 0), 0);
        const date = e.starts_at
          ? new Date(e.starts_at).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
          : "TBD";
        contextLines.push(`  ${e.title} — ${date} | ${sold}/${totalCap} tickets sold (${e.status})`);
      }
      contextLines.push("");
    }

    // Recent completed events
    const recent = (recentRes.data || []) as any[];
    if (recent.length > 0) {
      contextLines.push("RECENT COMPLETED EVENTS:");
      for (const e of recent) {
        const tickets = (e.tickets as unknown as { id: string; status: string; price_paid: number }[]) || [];
        const paid = tickets.filter((t) => ["paid", "checked_in"].includes(t.status));
        const revenue = paid.reduce((s, t) => s + Number(t.price_paid || 0), 0);
        const date = e.starts_at
          ? new Date(e.starts_at).toLocaleDateString("en", { month: "short", day: "numeric" })
          : "";
        contextLines.push(`  ${e.title} (${date}) — $${revenue.toFixed(0)} revenue, ${paid.length} attendees`);
      }
      contextLines.push("");
    }

    // Monthly revenue
    const monthTickets = (monthTicketsRes.data || []) as any[];
    const monthRevenue = monthTickets.reduce((s, t) => s + Number(t.price_paid || 0), 0);
    contextLines.push(`THIS MONTH: $${monthRevenue.toFixed(0)} revenue from ${monthTickets.length} tickets`);
    contextLines.push("");

    // Audience stats — email stored in metadata jsonb
    const allTickets = (audienceRes.data || []) as any[];
    const getEmail = (t: { metadata?: Record<string, unknown> | null }) =>
      (t.metadata?.email as string) ?? (t.metadata?.customer_email as string) ?? null;
    const uniqueEmails = new Set(allTickets.map(getEmail).filter(Boolean));
    const emailCounts: Record<string, number> = {};
    for (const t of allTickets) {
      const email = getEmail(t);
      if (email) {
        emailCounts[email] = (emailCounts[email] || 0) + 1;
      }
    }
    const repeatCount = Object.values(emailCounts).filter((c) => c > 1).length;
    const repeatRate = uniqueEmails.size > 0 ? Math.round((repeatCount / uniqueEmails.size) * 100) : 0;
    contextLines.push(`AUDIENCE: ${uniqueEmails.size} unique attendees, ${repeatRate}% repeat rate`);
    contextLines.push("");

    // Open tasks
    const openTasks = (tasksRes.data || []) as any[];
    if (openTasks.length > 0) {
      contextLines.push("OPEN ACTION ITEMS:");
      for (const t of openTasks) {
        const eventTitle = (t.events as unknown as { title: string })?.title || "";
        contextLines.push(`  • ${t.title} (${eventTitle})`);
      }
    } else {
      contextLines.push("No open action items.");
    }

    const dataContext = contextLines.join("\n");
    const fullSystem = `${SYSTEM_PROMPT}\n\n--- OPERATOR'S DATA ---\n${dataContext}`;

    // Build prompt with history
    let prompt = "";
    if (history && history.length > 0) {
      const historyText = history
        .map((m) => `${m.role === "user" ? "Operator" : "Nocturn"}: ${m.content}`)
        .join("\n");
      prompt = `Recent conversation:\n${historyText}\n\nOperator: ${question}`;
    } else {
      prompt = question;
    }

    const response = await generateWithClaude(prompt, fullSystem);
    return response || fallbackResponse(question);
  } catch (error) {
    console.error("[ask-nocturn] Error:", error);
    return fallbackResponse(question);
  }
}

function fallbackResponse(question: string): string {
  const lower = question.toLowerCase();

  if (lower.includes("ticket") || lower.includes("sales")) {
    return "I'm having trouble pulling data right now. Check your event page for the latest ticket numbers.";
  }
  if (lower.includes("revenue") || lower.includes("money") || lower.includes("finance")) {
    return "Can't load financial data at the moment. Head to Money for up-to-date numbers.";
  }
  if (lower.includes("settlement") || lower.includes("payout")) {
    return "Go to Money → click on the event to see settlement details.";
  }
  if (lower.includes("audience") || lower.includes("attendee")) {
    return "Check the Reach page for your full audience breakdown.";
  }
  if (lower.includes("event") || lower.includes("show")) {
    return "Head to Ops to see all your events and create new ones.";
  }

  return "I'm temporarily unable to access live data. Try again in a moment, or navigate to the relevant page directly.";
}
