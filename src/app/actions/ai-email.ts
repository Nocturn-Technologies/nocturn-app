"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Generate a post-event recap email using Claude API
export async function generatePostEventEmail(eventId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", email: null };

  const admin = createAdminClient();

  // Get event details
  const { data: event } = await admin
    .from("events")
    .select("*, venues(name, city), collectives(name, slug)")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", email: null };

  // Get ticket stats
  const { count: ticketsSold } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"]);

  // Get lineup
  const { data: lineup } = await admin
    .from("event_artists")
    .select("artists(name)")
    .eq("event_id", eventId)
    .eq("status", "confirmed");

  const artistNames = (lineup ?? []).map((l) => {
    const a = l.artists as unknown as { name: string };
    return a.name;
  });

  const collective = event.collectives as unknown as { name: string; slug: string };
  const venue = event.venues as unknown as { name: string; city: string } | null;

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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
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

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { error: null, email: parsed };
    }

    // Fallback if JSON parsing fails
    return {
      error: null,
      email: {
        subject: `Thank you for coming to ${event.title}! 🎉`,
        body: text,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    // Return fallback template on error
    return {
      error: null,
      email: {
        subject: `Thank you for coming to ${event.title}! 🎉`,
        body: generateFallbackEmail(event.title, collective.name, artistNames, ticketsSold ?? 0, venue),
      },
    };
  }
}

// Generate a promo email for an upcoming event
export async function generatePromoEmail(eventId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", email: null };

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("*, venues(name, city, address), collectives(name, slug)")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", email: null };

  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("name, price, capacity")
    .eq("event_id", eventId)
    .order("sort_order");

  const { data: lineup } = await admin
    .from("event_artists")
    .select("artists(name)")
    .eq("event_id", eventId)
    .eq("status", "confirmed");

  const artistNames = (lineup ?? []).map((l) => {
    const a = l.artists as unknown as { name: string };
    return a.name;
  });

  const collective = event.collectives as unknown as { name: string; slug: string };
  const venue = event.venues as unknown as { name: string; city: string; address: string } | null;
  const eventDate = new Date(event.starts_at);

  const ticketInfo = (tiers ?? [])
    .map((t) => `${t.name}: $${Number(t.price).toFixed(2)}`)
    .join(", ");

  const ticketUrl = `https://nocturn-app-navy.vercel.app/e/${collective.slug}/${event.slug}`;

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
