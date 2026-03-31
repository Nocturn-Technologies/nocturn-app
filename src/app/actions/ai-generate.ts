"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateWithClaude } from "@/lib/claude";

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
