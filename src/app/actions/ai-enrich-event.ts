"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

export interface EnrichedEventContent {
  description: string;
  vibeTags: string[];
  dressCode: string | null;
  hostMessage: string | null;
  venueDescription: string | null;
  venueCapacity: number | null;
  venueAddress: string | null;
}

/**
 * After basic event info is collected, generate rich public page content.
 * Also enriches venue details from DB if the venue exists.
 */
export async function enrichEventContent(input: {
  title: string;
  date?: string;
  startTime?: string;
  venueName?: string;
  venueCity?: string;
  headlinerType?: string;
  collectiveName?: string;
  tiers?: Array<{ name: string; price: number }>;
}): Promise<EnrichedEventContent> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { description: "", vibeTags: [], dressCode: null, hostMessage: null, venueDescription: null, venueCapacity: null, venueAddress: null };

  const { success: rlOk } = await rateLimitStrict(`ai-enrich:${user.id}`, 10, 60_000);
  if (!rlOk) return { description: "", vibeTags: [], dressCode: null, hostMessage: null, venueDescription: null, venueCapacity: null, venueAddress: null };

  const admin = createAdminClient();

  // Step 1: Try to enrich venue from DB
  let venueDescription: string | null = null;
  let venueCapacity: number | null = null;
  let venueAddress: string | null = null;

  if (input.venueName) {
    const safeName = input.venueName
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const { data: venueRaw } = await admin
      .from("venues")
      .select("description, capacity, address, city, metadata")
      .ilike("name", `%${safeName}%`)
      .maybeSingle();
    const venue = venueRaw as { description: string | null; capacity: number | null; address: string | null; city: string | null; metadata: Record<string, unknown> | null } | null;

    if (venue) {
      venueDescription = venue.description ?? null;
      venueCapacity = venue.capacity ?? null;
      venueAddress = venue.address ?? null;
    }
  }

  // Step 2: Generate rich content with AI
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Fallback — generate basic content without AI
    return {
      description: `${input.title} — presented by ${input.collectiveName ?? "the crew"}. ${input.date ? `Join us on ${formatDate(input.date)}` : ""}${input.venueName ? ` at ${input.venueName}` : ""}. Tickets available now.`,
      vibeTags: guessVibeTags(input.title, input.headlinerType),
      dressCode: null,
      hostMessage: null,
      venueDescription,
      venueCapacity,
      venueAddress,
    };
  }

  try {
    const tierInfo = input.tiers?.map(t => `${t.name}: $${t.price}`).join(", ") ?? "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `You write event descriptions for a nightlife platform used by music collectives and promoters. Generate rich content for this event's public page.

Event: "${input.title}"
Date: ${input.date ?? "TBD"}
Time: ${input.startTime ?? "TBD"}
Venue: ${input.venueName ?? "TBD"} ${input.venueCity ? `in ${input.venueCity}` : ""}
${venueDescription ? `Venue info: ${venueDescription}` : ""}
Type: ${input.headlinerType ?? "local event"}
Collective: ${input.collectiveName ?? ""}
Tickets: ${tierInfo || "TBD"}

Return valid JSON:
{
  "description": "2-3 sentence event description that captures the vibe. Don't be generic — be specific to the event type, venue, and scene. Write like a promoter, not a corporate copywriter. No emojis.",
  "vibeTags": ["array of 3-5 vibe tags like 'underground', 'warehouse', 'intimate', 'high-energy', 'late-night', 'rooftop', 'afterhours', 'bass-heavy', 'groovy', 'dark', 'melodic', 'tropical', 'afro', etc."],
  "dressCode": "one-liner dress code suggestion or null if casual. e.g. 'All black' or 'Smart casual' or null",
  "hostMessage": "A short 1-sentence personal note from the collective to attendees. Write in first person plural (we). e.g. 'We've been waiting all year to bring this lineup together — don't sleep on it.'"
}`,
        }],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        description: result.description ?? "",
        vibeTags: result.vibeTags ?? guessVibeTags(input.title, input.headlinerType),
        dressCode: result.dressCode ?? null,
        hostMessage: result.hostMessage ?? null,
        venueDescription,
        venueCapacity,
        venueAddress,
      };
    }
  } catch (err) {
    console.error("AI enrichment failed:", err);
  }

  // Fallback
  return {
    description: `${input.title} — presented by ${input.collectiveName ?? "the crew"}. Tickets available now.`,
    vibeTags: guessVibeTags(input.title, input.headlinerType),
    dressCode: null,
    hostMessage: null,
    venueDescription,
    venueCapacity,
    venueAddress,
  };
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function guessVibeTags(title: string, headlinerType?: string): string[] {
  const lower = title.toLowerCase();
  const tags: string[] = [];

  if (lower.includes("warehouse") || lower.includes("rave")) tags.push("underground", "warehouse");
  if (lower.includes("rooftop") || lower.includes("patio")) tags.push("rooftop", "daytime");
  if (lower.includes("after") || lower.includes("late")) tags.push("late-night", "afterhours");
  if (lower.includes("house") || lower.includes("disco")) tags.push("groovy", "dance-floor");
  if (lower.includes("techno") || lower.includes("dark")) tags.push("dark", "bass-heavy");
  if (lower.includes("afro") || lower.includes("amapiano")) tags.push("afro", "tropical");

  if (headlinerType === "international") tags.push("international", "headliner");
  if (headlinerType === "local") tags.push("local", "community");

  if (tags.length === 0) tags.push("nightlife", "live-music", "good-vibes");

  return tags.slice(0, 5);
}
