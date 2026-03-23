import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Image generation is not configured. Add OPENAI_API_KEY to environment variables." },
      { status: 503 }
    );
  }

  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1792", // Portrait for posters
      quality: "standard",
    });

    const imageUrl = response.data?.[0]?.url;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "No image generated. Try a different prompt." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageUrl,
      prompt,
    });
  } catch (error: unknown) {
    // Extract detailed OpenAI error
    const err = error as { status?: number; message?: string; error?: { message?: string } };
    const detail = err?.error?.message || err?.message || "Unknown error";
    console.error("[generate-poster] Error:", JSON.stringify({ status: err?.status, detail }));

    // Return the actual error so we can debug
    if (detail.includes("billing") || detail.includes("quota") || detail.includes("insufficient")) {
      return NextResponse.json(
        { error: "OpenAI billing issue — add credits at platform.openai.com/settings/billing" },
        { status: 402 }
      );
    }

    if (detail.includes("content_policy") || detail.includes("safety")) {
      return NextResponse.json(
        { error: "The prompt was flagged by content policy. Try a different style direction." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: `Poster generation failed: ${detail}` },
      { status: 500 }
    );
  }
}
