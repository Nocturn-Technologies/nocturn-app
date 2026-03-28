"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateWithClaude } from "@/lib/claude";

// ─── Event Description ──────────────────────────────────────────────────────

export async function generateEventDescription(
  eventName: string,
  venue: string,
  date: string,
  genre: string
): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";

  const prompt = `Write a compelling event description for a nightlife event. Keep it under 150 words. Make it feel exclusive and exciting.

Event: "${eventName}"
Venue: ${venue}
Date: ${date}
Genre/vibe: ${genre}

Write ONLY the description text, no titles or headers.`;

  const result = await generateWithClaude(prompt);

  if (result) return result;

  // Fallback template
  return `Get ready for ${eventName} — an unforgettable night of ${genre.toLowerCase()} at ${venue}. Join us on ${date} for a curated experience featuring top-tier sound, immersive vibes, and a crowd that knows how to move. Limited capacity. Don't sleep on this one.`;
}

// ─── Promo / Instagram Caption ──────────────────────────────────────────────

export async function generatePromoCaption(
  eventName: string,
  venue: string,
  date: string,
  ticketPrice: string,
  genre: string
): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";

  const prompt = `Write an Instagram caption for a nightlife event promotion. Include 4-6 relevant hashtags at the end. Keep it punchy and hype — 2-3 short lines max before the hashtags. Use a moon emoji 🌙 somewhere.

Event: "${eventName}"
Venue: ${venue}
Date: ${date}
Tickets: ${ticketPrice}
Genre/vibe: ${genre}

Write ONLY the caption text with hashtags.`;

  const result = await generateWithClaude(prompt);

  if (result) return result;

  // Fallback template
  const cityTag = venue.toLowerCase().replace(/[^a-z0-9]/g, "");
  const genreTag = genre.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${eventName} 🌙\n${date} @ ${venue}\nTickets: ${ticketPrice}\n\n#nightlife #${genreTag} #${cityTag} #${eventName.toLowerCase().replace(/[^a-z0-9]/g, "")} #underground`;
}

// ─── Collective Bio ─────────────────────────────────────────────────────────

export async function generateEventBio(
  collectiveName: string,
  city: string
): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";

  const prompt = `Write a punchy 1-2 sentence bio for a nightlife collective. Max 120 characters. Make it sound cool and authentic to underground nightlife culture.

Collective name: "${collectiveName}"
City: ${city}

Write ONLY the bio text, nothing else.`;

  const result = await generateWithClaude(prompt);

  if (result) return result.slice(0, 150); // Safety trim

  // Fallback template
  return `${collectiveName} — curating unforgettable nights in ${city}.`;
}
