import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Replicate from "replicate";
import { rateLimitStrict } from "@/lib/rate-limit";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// Extract URL from whatever Replicate returns (string, array, FileOutput, etc.)
function extractUrl(output: unknown): string | null {
  if (!output) return null;

  // Direct string URL
  if (typeof output === "string" && output.startsWith("http")) return output;

  // Array of URLs (flux-schnell format)
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = extractUrl(item);
      if (url) return url;
    }
    return null;
  }

  // FileOutput object with .url() method or url property
  if (typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.url === "function") {
      const result = (obj.url as () => string)();
      if (typeof result === "string") return result;
    }
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.href === "string") return obj.href;

    // Try toString
    const str = String(output);
    if (str.startsWith("http")) return str;
  }

  return null;
}

export async function POST(request: NextRequest) {
  // Auth check
  let authedUserId: string;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    authedUserId = user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 poster generations per user per minute
  const { success: rateLimitOk } = await rateLimitStrict(`generate-poster:${authedUserId}`, 10, 60_000);
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Image generation service not configured" },
      { status: 503 }
    );
  }

  try {
    const { prompt } = await request.json();
    if (typeof prompt !== "string" || prompt.length > 2000) {
      return NextResponse.json({ error: "Invalid or too-long prompt (max 2000 chars)" }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
    let imageUrl: string | null = null;

    // Try Flux Pro first
    try {
      const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
        input: {
          prompt,
          aspect_ratio: "4:5",
          output_format: "webp",
          output_quality: 95,
          safety_tolerance: 5,
          prompt_upsampling: true,
        },
      });

      // Debug output type removed — use error logs only
      imageUrl = extractUrl(output);
    } catch (proErr) {
      console.error("[generate-poster] Flux Pro failed, trying schnell:", proErr);
    }

    // Fallback to Flux Schnell (faster, more reliable)
    if (!imageUrl) {
      try {
        const output = await replicate.run("black-forest-labs/flux-schnell", {
          input: {
            prompt,
            num_outputs: 1,
            aspect_ratio: "4:5",
            output_format: "webp",
            output_quality: 90,
          },
        });

        // Debug output type removed — use error logs only
        imageUrl = extractUrl(output);
      } catch (schnellErr) {
        console.error("[generate-poster] Flux Schnell also failed:", schnellErr);
      }
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Image generation failed. Check your Replicate API token and billing." },
        { status: 500 }
      );
    }

    return NextResponse.json({ imageUrl, prompt });
  } catch (error: unknown) {
    const err = error as { message?: string; error?: { message?: string } };
    const detail = err?.error?.message || err?.message || "Unknown error";
    console.error("[generate-poster] Error:", detail);

    return NextResponse.json(
      { error: "Poster generation failed. Please try again." },
      { status: 500 }
    );
  }
}
