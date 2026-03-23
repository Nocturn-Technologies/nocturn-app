import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

export async function POST(request: NextRequest) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Image generation is not configured. Add REPLICATE_API_TOKEN to environment variables." },
      { status: 503 }
    );
  }

  try {
    const { prompt, aspectRatio } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    // Use Flux Schnell for fast generation (~2-4 seconds)
    const output = await replicate.run("black-forest-labs/flux-schnell", {
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: aspectRatio || "3:4", // Portrait for posters
        output_format: "webp",
        output_quality: 90,
      },
    });

    // Flux returns an array of URLs
    const images = output as string[];

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: "No image generated. Try a different prompt." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageUrl: images[0],
      prompt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-poster] Error:", message);
    return NextResponse.json(
      { error: "Failed to generate poster. Please try again." },
      { status: 500 }
    );
  }
}
