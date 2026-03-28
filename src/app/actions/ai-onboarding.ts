"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateWithClaude } from "@/lib/claude";
import { generateEventBio } from "@/app/actions/ai-generate";

export async function generateOnboardingSuggestions(name: string, city: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { bio: "", instagramCaption: "", welcomeMessage: "" };

  const fallback = {
    bio: `${name} — curating unforgettable nights in ${city}.`,
    instagramCaption: `Something new is coming to ${city}'s nightlife. ${name} has arrived. Stay tuned. 🌙\n\n#nightlife #${city.toLowerCase().replace(/\s+/g, "")} #${name.toLowerCase().replace(/\s+/g, "")}`,
    welcomeMessage: `Welcome to Nocturn, ${name}! Let's make some noise in ${city}. 🔊`,
  };

  // Use generateEventBio for the bio (shared with ai-generate)
  const bio = await generateEventBio(name, city);

  // Generate instagram caption + welcome message via Claude
  const captionPrompt = `Write a launch announcement Instagram caption for a new nightlife collective. 2-3 short lines, include 3-5 relevant hashtags for the city's nightlife scene. Use a moon emoji 🌙 somewhere.

Collective: "${name}"
City: ${city}

Write ONLY the caption text with hashtags, nothing else.`;

  const welcomePrompt = `Write a short energetic welcome message (1 sentence) from Nocturn AI to a new nightlife collective founder.

Collective: "${name}"
City: ${city}

Write ONLY the message, nothing else.`;

  const [caption, welcome] = await Promise.all([
    generateWithClaude(captionPrompt),
    generateWithClaude(welcomePrompt),
  ]);

  return {
    bio: bio || fallback.bio,
    instagramCaption: caption || fallback.instagramCaption,
    welcomeMessage: welcome || fallback.welcomeMessage,
  };
}
