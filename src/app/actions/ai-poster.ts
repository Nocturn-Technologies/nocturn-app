"use server";

import { generateWithClaude } from "@/lib/claude";

const POSTER_SYSTEM_PROMPT = `You are an expert nightlife event poster designer. Given event details, generate a detailed image generation prompt for creating a stunning event poster/flyer.

RULES:
- The image should be a POSTER/FLYER design, not a photo
- Include specific visual elements: typography style, color palette, mood, composition
- Always include dark/moody nightlife aesthetics unless the event vibe suggests otherwise
- Reference specific art styles (e.g. "neo-noir", "vaporwave", "brutalist typography")
- Include lighting effects (neon, laser, spotlight, strobe)
- Do NOT include any readable text in the image — text will be overlaid later
- Keep the prompt under 200 words
- Make it visually striking and Instagram-worthy

Return ONLY the image prompt, nothing else. No quotes, no explanation.`;

export async function generatePosterPrompt(eventData: {
  title: string;
  genre: string[];
  venueName?: string;
  city?: string;
  styleDirection?: string;
}): Promise<{ prompt: string; error: string | null }> {
  const userPrompt = `Generate an image prompt for an event poster:

Event: "${eventData.title}"
Genre/Vibe: ${eventData.genre.length > 0 ? eventData.genre.join(", ") : "Electronic / Nightlife"}
${eventData.venueName ? `Venue: ${eventData.venueName}` : ""}
${eventData.city ? `City: ${eventData.city}` : ""}
${eventData.styleDirection ? `Style direction from the promoter: "${eventData.styleDirection}"` : ""}

Create the image generation prompt.`;

  const result = await generateWithClaude(userPrompt, POSTER_SYSTEM_PROMPT);

  if (!result) {
    // Fallback prompt when Claude is unavailable
    const genre = eventData.genre[0] || "electronic";
    return {
      prompt: `Dark moody nightlife event poster, ${genre} music aesthetic, neon purple and deep blue lighting, abstract geometric shapes, laser beams cutting through smoke, sleek minimalist composition, no text, cinematic atmosphere, high contrast, Instagram-worthy design, 4K quality`,
      error: null,
    };
  }

  return { prompt: result.trim(), error: null };
}
