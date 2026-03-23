import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import OpenAI from "openai";

// Try Replicate first (Flux — better for artistic/rave posters), fall back to OpenAI
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: NextRequest) {
  if (!REPLICATE_API_TOKEN && !OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Image generation not configured. Add REPLICATE_API_TOKEN or OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    let imageUrl: string | null = null;

    // Try Replicate Flux first
    if (REPLICATE_API_TOKEN) {
      try {
        const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
        const output = await replicate.run("black-forest-labs/flux-schnell", {
          input: {
            prompt,
            num_outputs: 1,
            aspect_ratio: "4:5", // Instagram portrait
            output_format: "webp",
            output_quality: 90,
          },
        });
        const images = output as string[];
        if (images?.[0]) imageUrl = images[0];
      } catch (err) {
        console.error("[generate-poster] Replicate error, falling back to OpenAI:", err);
      }
    }

    // Fallback to OpenAI DALL-E
    if (!imageUrl && OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1792",
        quality: "standard",
      });
      imageUrl = response.data?.[0]?.url ?? null;
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: "No image generated. Try a different style direction." },
        { status: 500 }
      );
    }

    return NextResponse.json({ imageUrl, prompt });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string; error?: { message?: string } };
    const detail = err?.error?.message || err?.message || "Unknown error";
    console.error("[generate-poster] Error:", detail);

    if (detail.includes("billing") || detail.includes("quota") || detail.includes("insufficient")) {
      return NextResponse.json(
        { error: "API billing issue — add credits to your account" },
        { status: 402 }
      );
    }

    return NextResponse.json(
      { error: `Poster generation failed: ${detail}` },
      { status: 500 }
    );
  }
}
