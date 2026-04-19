"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

/**
 * Strip HTML tags and control characters from AI-generated text.
 * Prevents XSS if the output is later rendered in email HTML or dashboard UI.
 */
function sanitizeAIText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars (keep \n, \r, \t)
    .trim();
}

// Generate a post-event recap email using Claude API
export async function generatePostEventEmail(eventId: string) {
  try {
  if (!eventId?.trim()) return { error: "Event ID is required", email: null };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", email: null };

  const { success: rlOk } = await rateLimitStrict(`ai-email:${user.id}`, 10, 60_000);
  if (!rlOk) return { error: "Too many requests. Please wait a moment.", email: null };

  const admin = createAdminClient();

  // Get event details
  const { data: eventRaw, error: eventError } = await admin
    .from("events")
    .select("*, venues(name, city), collectives(name, slug)")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  const event = eventRaw as { id: string; title: string; slug: string; starts_at: string; collective_id: string | null; collectives: { name: string; slug: string } | null; venues: { name: string; city: string } | null; [key: string]: unknown } | null;

  if (eventError) {
    console.error("[generatePostEventEmail] event lookup failed:", eventError);
    return { error: "Something went wrong", email: null };
  }
  if (!event) return { error: "Event not found", email: null };

  // Verify ownership — collective_id must be present; a null/missing value is not bypassed
  const colId = event.collective_id;
  if (!colId) return { error: "Not authorized", email: null };
  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", colId)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount) return { error: "Not authorized", email: null };

  // Get ticket stats
  const { count: ticketsSold } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"]);

  // Get lineup
  const { data: lineupRaw } = await admin
    .from("event_artists")
    .select("name")
    .eq("event_id", eventId);
  const lineup = lineupRaw as { name: string | null }[] | null;

  const artistNames = (lineup ?? []).map((l) => {
    return l.name ?? "";
  });

  const collective = event.collectives ?? { name: "Unknown", slug: "" };
  const venue = event.venues;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback template if no API key
    return {
      error: null,
      email: {
        subject: `Thank you for coming to ${event.title}! 🎉`,
        body: generateFallbackEmail(event.title, collective.name, artistNames, ticketsSold ?? 0, venue),
      },
    };
  }

  // Call Claude API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: "You are Promo, Nocturn's marketing agent. You help nightlife collectives create content that fills rooms. Write like a promoter — short sentences, punchy, no corporate jargon. Match the energy of the event. You say 'operators' not 'users', 'collectives' not 'teams'. Be confident, warm, and precise.",
        messages: [
          {
            role: "user",
            content: `Write a short, engaging post-event recap email for a nightlife event. Keep it under 200 words. Match the energy of the night — a warehouse techno event sounds different from a rooftop set. Include a genuine thank you, highlight what made the night special, and tease what's coming next.

Event: "${event.title}"
Collective: ${collective.name}
Venue: ${venue?.name ?? "TBA"}, ${venue?.city ?? ""}
Artists: ${artistNames.join(", ") || "Various artists"}
Tickets sold: ${ticketsSold ?? 0}

Return JSON with "subject" and "body" fields. The body should be plain text with line breaks. Sign off as ${collective.name}, not Nocturn.`,
          },
        ],
      }),
    });

    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Sanitize AI output: strip HTML tags and control characters
      const safeSubject = sanitizeAIText(parsed.subject ?? "");
      const safeBody = sanitizeAIText(parsed.body ?? "");
      return { error: null, email: { subject: safeSubject, body: safeBody } };
    }

    // Fallback if JSON parsing fails
    return {
      error: null,
      email: {
        subject: `Thank you for coming to ${event.title}! 🎉`,
        body: sanitizeAIText(text),
      },
    };
  } catch (_err: unknown) {
    // Return fallback template on error
    return {
      error: null,
      email: {
        subject: `Thank you for coming to ${event.title}! 🎉`,
        body: generateFallbackEmail(event.title, collective.name, artistNames, ticketsSold ?? 0, venue),
      },
    };
  }
  } catch (err) {
    console.error("[generatePostEventEmail]", err);
    return { error: "Something went wrong", email: null };
  }
}

// Generate a promo email for an upcoming event
export async function generatePromoEmail(eventId: string) {
  try {
    if (!eventId?.trim()) return { error: "Event ID is required", email: null };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", email: null };

    const { success: rlOk2 } = await rateLimitStrict(`ai-email:${user.id}`, 10, 60_000);
    if (!rlOk2) return { error: "Too many requests. Please wait a moment.", email: null };

    const admin = createAdminClient();

    const { data: eventRaw2, error: eventError2 } = await admin
      .from("events")
      .select("*, venues(name, city, address), collectives(name, slug)")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();
    const event = eventRaw2 as { id: string; title: string; slug: string; starts_at: string; collective_id?: string; collectives: { name: string; slug: string } | null; venues: { name: string; city: string; address: string } | null; [key: string]: unknown } | null;

    if (eventError2) {
      console.error("[generatePromoEmail] event lookup failed:", eventError2);
      return { error: "Something went wrong", email: null };
    }
    if (!event) return { error: "Event not found", email: null };

    // Verify ownership — collective_id must be present; a null/missing value is not bypassed
    const colId = event.collective_id;
    if (!colId) return { error: "Not authorized", email: null };
    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", colId)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount) return { error: "Not authorized", email: null };

    const { data: tiersRaw } = await admin
      .from("ticket_tiers")
      .select("name, price, capacity")
      .eq("event_id", eventId)
      .order("sort_order");
    const tiers = tiersRaw as { name: string; price: number; capacity: number }[] | null;

    const { data: lineupRaw2 } = await admin
      .from("event_artists")
      .select("name")
      .eq("event_id", eventId);
    const lineup = lineupRaw2 as { name: string | null }[] | null;

    const artistNames = (lineup ?? []).map((l) => {
      return l.name ?? "";
    });

    const collective = event.collectives ?? { name: "Unknown", slug: "" };
    const venue = event.venues;
    const eventDate = new Date(event.starts_at);

    const ticketInfo = (tiers ?? [])
      .map((t) => `${t.name}: $${Number(t.price).toFixed(2)}`)
      .join(", ");

    const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/e/${collective.slug}/${event.slug}`;

    return {
      error: null,
      email: {
        subject: `${event.title} — ${eventDate.toLocaleDateString("en", { month: "short", day: "numeric" })} 🎶`,
        body: `Hey there,

${collective.name} presents: ${event.title}

📅 ${eventDate.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
🕐 ${eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
📍 ${venue ? `${venue.name}, ${venue.city}` : "TBA"}

${artistNames.length > 0 ? `🎧 Lineup: ${artistNames.join(" · ")}\n` : ""}
🎟 Tickets: ${ticketInfo || "Coming soon"}

Get your tickets: ${ticketUrl}

See you on the dance floor!
— ${collective.name}`,
      },
    };
  } catch (err) {
    console.error("[generatePromoEmail]", err);
    return { error: "Something went wrong", email: null };
  }
}

function generateFallbackEmail(
  eventTitle: string,
  collectiveName: string,
  artists: string[],
  ticketsSold: number,
  venue: { name: string; city: string } | null
): string {
  return `Hey there,

What a night! Thank you for coming out to ${eventTitle}${venue ? ` at ${venue.name}` : ""}. ${ticketsSold > 0 ? `${ticketsSold} of you showed up and made it unforgettable.` : "You made it unforgettable."}

${artists.length > 0 ? `Big thanks to ${artists.join(", ")} for bringing the energy.` : "The energy was unreal."}

We're already planning the next one — stay tuned for details. Make sure you're following us so you don't miss the announcement.

Until next time,
${collectiveName}`;
}
