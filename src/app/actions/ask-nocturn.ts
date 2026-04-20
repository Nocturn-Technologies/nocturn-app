"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { generateWithClaude } from "@/lib/claude";
import { rateLimitStrict } from "@/lib/rate-limit";

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
  try {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Not authenticated";

  if (!collectiveId?.trim()) return "Collective ID is required.";
  if (!question?.trim()) {
    return "Ask me anything about your events, revenue, audience, or how to use Nocturn.";
  }

  // Rate limit: 15 questions per minute per user
  const { success: rlOk } = await rateLimitStrict(`ask-nocturn:${user.id}`, 15, 60_000);
  if (!rlOk) return "You're asking too fast. Please wait a moment.";

  const sb = createAdminClient();

  // Verify user belongs to this collective
  const { count: memberCount, error: memberError } = await sb
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (memberError) {
    console.error("[ask-nocturn] membership check error:", memberError.message);
    return fallbackResponse(question);
  }

  if (!memberCount || memberCount === 0) {
    return "You don't have access to this collective's data.";
  }
    // Query relevant data in parallel
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      upcomingRes,
      recentRes,
      monthOrdersRes,
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

      // Recent completed events — revenue comes from orders, not tickets.price_paid
      sb
        .from("events")
        .select("id, title, starts_at, status, tickets(id, status), orders(total, status)")
        .eq("collective_id", collectiveId)
        .eq("status", "completed")
        .order("starts_at", { ascending: false })
        .limit(5),

      // Orders paid this month (for revenue)
      sb
        .from("orders")
        .select("total, created_at, events!inner(collective_id)")
        .eq("events.collective_id", collectiveId)
        .eq("status", "paid")
        .gte("created_at", monthStart),

      // Audience stats — unique attendees via attendee_profiles
      sb
        .from("attendee_profiles")
        .select("id, email")
        .eq("collective_id", collectiveId),

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

    // Build context string
    const contextLines: string[] = [];
    const collectiveName = collectiveRes.data?.name || "Your collective";
    contextLines.push(`Collective: ${collectiveName}`);
    contextLines.push("");

    // Upcoming events
    const upcoming = upcomingRes.data || [];
    if (upcoming.length > 0) {
      contextLines.push("UPCOMING EVENTS:");
      for (const e of upcoming) {
        const tiers = (e.ticket_tiers as unknown as { name: string; price: number; capacity: number }[]) || [];
        const tickets = (e.tickets as unknown as { id: string; status: string }[]) || [];
        const sold = tickets.filter((t) => ["paid", "checked_in"].includes(t.status)).length;
        const totalCap = tiers.reduce((s, t) => s + (t.capacity || 0), 0);
        const date = e.starts_at
          ? new Date(e.starts_at).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
          : "Date TBA";
        contextLines.push(`  ${e.title} — ${date} | ${sold}/${totalCap} tickets sold (${e.status})`);
      }
      contextLines.push("");
    }

    // Recent completed events — revenue from orders
    const recent = recentRes.data || [];
    if (recent.length > 0) {
      contextLines.push("RECENT COMPLETED EVENTS:");
      for (const e of recent) {
        const tickets = (e.tickets as unknown as { id: string; status: string }[]) || [];
        const paid = tickets.filter((t) => ["paid", "checked_in"].includes(t.status));
        const eventOrders = (e.orders as unknown as { total: number; status: string }[]) || [];
        const revenue = eventOrders
          .filter((o) => o.status === "paid")
          .reduce((s, o) => s + Number(o.total || 0), 0);
        const date = e.starts_at
          ? new Date(e.starts_at).toLocaleDateString("en", { month: "short", day: "numeric" })
          : "";
        contextLines.push(`  ${e.title} (${date}) — $${revenue.toFixed(0)} revenue, ${paid.length} attendees`);
      }
      contextLines.push("");
    }

    // Monthly revenue from orders
    const monthOrders = monthOrdersRes.data || [];
    const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    contextLines.push(`THIS MONTH: $${monthRevenue.toFixed(0)} revenue from ${monthOrders.length} orders`);
    contextLines.push("");

    // Audience stats from attendee_profiles
    const audienceProfiles = audienceRes.data || [];
    const uniqueCount = audienceProfiles.length;
    const emailCounts: Record<string, number> = {};
    for (const ap of audienceProfiles as { id: string; email: string | null }[]) {
      if (ap.email) {
        emailCounts[ap.email] = (emailCounts[ap.email] || 0) + 1;
      }
    }
    const repeatCount = Object.values(emailCounts).filter((c) => c > 1).length;
    const repeatRate = uniqueCount > 0 ? Math.round((repeatCount / uniqueCount) * 100) : 0;
    contextLines.push(`AUDIENCE: ${uniqueCount} unique attendees, ${repeatRate}% repeat rate`);
    contextLines.push("");

    // Open tasks
    const openTasks = tasksRes.data || [];
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

    // Pass conversation history as structured messages for proper prompt caching
    const response = await generateWithClaude(question, fullSystem, history);
    return response || fallbackResponse(question);
  } catch (err) {
    console.error("[ask-nocturn] Error:", err);
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
