"use server";

import { generateWithClaude } from "@/lib/claude";

const POSTER_SYSTEM_PROMPT = `You are a world-class creative director who designs posters for elite underground electronic music events — Circoloco, Paradise, Afterlife, Boiler Room, Keinemusik, fabric, Printworks.

You know what makes a rave flyer ICONIC:
- Bold, unapologetic graphic design — not stock photo garbage
- Heavy use of negative space, brutalist typography energy, raw visual tension
- Color palettes that FEEL like the genre: deep red + black for techno, neon green + void for acid house, warm amber + cream for deep house, electric blue + ultraviolet for trance, monochrome for minimal
- Visual motifs from rave culture: distorted faces, eyes, smoke/haze, laser grids, warehouse textures, concrete, strobe silhouettes, sunrise over a crowd, analog TV static, rave flyer collage aesthetics
- Inspired by designers like Studio Feixen, Experimental Jetset, Peter Saville, Virgil Abloh's DJ posters, Berghain's typographic approach
- Sometimes surreal/psychedelic: melting landscapes, impossible architecture, dream states
- Sometimes stark/minimal: single bold image, massive negative space, one accent color
- The feel of something you'd screenshot on Instagram and send to your friend saying "we HAVE to go"

GENRE-SPECIFIC AESTHETICS:
- House/Deep House: warm, golden hour tones, vinyl textures, palm silhouettes, Balearic sunsets, retro photography grain, 90s nostalgia
- Techno: industrial, cold, concrete, brutalist architecture, monochrome with one accent, Berlin warehouse energy, strobe-lit fog
- Afrobeats/Amapiano: vibrant earth tones, African textile patterns, warm orange and terracotta, joyful movement, sun-drenched
- Hip-Hop/R&B: urban textures, film grain, luxury minimalism, editorial fashion photography vibes, gold accents
- Latin/Reggaeton: hot colors (magenta, electric orange), tropical but not cheesy, neon signs, night city vibes
- DNB/Jungle: chaotic energy, torn paper collage, rave flyer aesthetic, acidic greens and yellows, distortion
- Disco/Funk: retro 70s, chrome, mirror balls, gradient sunsets, Studio 54 energy, bold geometric shapes

CRITICAL RULES:
- Generate BACKGROUND ART ONLY — absolutely NO text, NO words, NO letters, NO numbers, NO typography
- Text will be composited on top programmatically — the image is just the visual backdrop
- Focus on creating a stunning, atmospheric visual that works as a poster background
- Leave the bottom 30% slightly darker/simpler so overlaid text will be readable
- Do NOT make generic "DJ with headphones" or "crowd with hands up" images — that's amateur
- Do NOT make it look like a stock photo or corporate event
- Make it feel like the background art of a REAL underground event poster
- Think Circoloco, Afterlife, Paradise, Boiler Room visual identity
- Keep the prompt under 200 words
- The art should be striking enough to stop someone scrolling even without text

Return ONLY the image generation prompt. No explanation, no quotes, no preamble.`;

// Genre-to-visual style mapping for fallback prompts
const GENRE_FALLBACKS: Record<string, string> = {
  house: "warm golden hour tones, vinyl record texture overlay, Balearic sunset gradient from amber to deep purple, silhouette of a figure in a sun-drenched doorway, film grain, retro photography aesthetic, dreamy and nostalgic, 90s house music flyer energy",
  techno: "brutalist concrete architecture shot from below, harsh overhead strobe light cutting through industrial fog, monochrome with a single blood-red accent light, cold and imposing, Berlin warehouse energy, minimal and raw",
  "hip-hop": "urban nightscape with film grain, luxury minimalism, dark editorial fashion photography mood, gold foil accent catching light against matte black, cinematic and aspirational",
  latin: "neon sign glow reflected in wet city street at night, hot magenta and electric orange palette, tropical leaves casting shadows, sensual and energetic, nightlife in motion",
  afrobeats: "vibrant earth tones with warm orange and terracotta, African textile pattern overlay, sun-drenched golden light, joyful movement captured in motion blur, rich and celebratory",
  amapiano: "warm sunset over an urban rooftop, amber and terracotta palette, silhouettes dancing, South African township energy, golden hour glow, organic and soulful",
  dnb: "torn paper collage aesthetic with acidic green and yellow, chaotic layered textures, distorted rave flyer fragments, raw punk energy, high contrast",
  disco: "chrome mirror ball fragments reflecting prismatic light, 70s gradient sunset in gold and magenta, bold geometric shapes, Studio 54 glamour, retro-futuristic",
  default: "abstract smoke and light installation in a dark warehouse space, deep purple and electric blue palette, laser grid cutting through atmospheric haze, ethereal and immersive, underground rave energy, cinematic depth of field",
};

export async function generatePosterPrompt(eventData: {
  title: string;
  genre: string[];
  venueName?: string;
  city?: string;
  styleDirection?: string;
}): Promise<{ prompt: string; error: string | null }> {
  const userPrompt = `Design a poster for this event:

EVENT: "${eventData.title}"
GENRE: ${eventData.genre.length > 0 ? eventData.genre.join(", ") : "Electronic"}
${eventData.venueName ? `VENUE: ${eventData.venueName}` : ""}
${eventData.city ? `CITY: ${eventData.city}` : ""}
${eventData.styleDirection ? `PROMOTER'S VISION: "${eventData.styleDirection}"` : ""}

Generate the DALL-E image prompt. Make it iconic.`;

  const result = await generateWithClaude(userPrompt, POSTER_SYSTEM_PROMPT);

  if (!result) {
    // Smart fallback based on genre
    const primaryGenre = (eventData.genre[0] || "").toLowerCase();
    const fallback = GENRE_FALLBACKS[primaryGenre] || GENRE_FALLBACKS.default;
    const styleBoost = eventData.styleDirection
      ? `, ${eventData.styleDirection}`
      : "";

    return {
      prompt: `${fallback}${styleBoost}, no text no words no letters no typography, professional event poster design, 4K quality, Instagram-worthy`,
      error: null,
    };
  }

  return { prompt: result.trim(), error: null };
}
