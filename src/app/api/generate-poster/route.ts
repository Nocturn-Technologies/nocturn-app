import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

export async function POST(request: NextRequest) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Add REPLICATE_API_TOKEN to Vercel environment variables." },
      { status: 503 }
    );
  }

  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    // Flux 1.1 Pro — higher quality than schnell, better for poster art
    const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
      input: {
        prompt,
        aspect_ratio: "4:5",
        output_format: "webp",
        output_quality: 95,
        safety_tolerance: 5,
        prompt_upsampling: true, // Flux enhances the prompt internally
      },
    });

    // Flux Pro returns a single URL string (not array)
    const imageUrl = typeof output === "string"
      ? output
      : Array.isArray(output) && output[0]
        ? String(output[0])
        : null;

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

    return NextResponse.json(
      { error: `Poster generation failed: ${detail}` },
      { status: 500 }
    );
  }
}
