import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import Replicate from "replicate";
import { rateLimitStrict } from "@/lib/rate-limit";
import { generatePosterPrompt } from "@/app/actions/ai-poster";

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

  // Accept eventId + optional structured params; regenerate prompt server-side
  let eventId: string;
  let clientVibeTags: string[] | undefined;
  let clientVenueName: string | undefined;
  let clientStyleDirection: string | undefined;
  try {
    const body = await request.json();
    eventId = body.eventId;
    clientVibeTags = Array.isArray(body.vibeTags)
      ? (body.vibeTags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 10)
      : undefined;
    // Prompt-injection defense: these fields get concatenated into the LLM
    // prompt sent to Replicate. Strip control chars + common instruction-
    // override patterns before interpolation so an authenticated operator
    // can't burn Replicate credits on off-brand or policy-violating output.
    const sanitizePromptString = (s: string): string =>
      s
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f]/g, " ")
        .replace(/(?:^|\s)(ignore\s+(?:previous|above|prior)|system\s*:|assistant\s*:|###|<\|im_start\|>|<\|im_end\|>)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    clientVenueName =
      typeof body.venueName === "string" ? sanitizePromptString(body.venueName).slice(0, 100) : undefined;
    clientStyleDirection =
      typeof body.styleDirection === "string" ? sanitizePromptString(body.styleDirection).slice(0, 200) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!eventId || !uuidRegex.test(eventId)) {
    return NextResponse.json({ error: "Missing or invalid eventId" }, { status: 400 });
  }

  // Fetch event and verify the authenticated user is a collective member
  const admin = createAdminClient();
  const { data: eventRow } = await admin
    .from("events")
    .select("title, vibe_tags, collective_id, venues(name, city)")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!eventRow) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const ev = eventRow as unknown as { title: string; vibe_tags: string[] | null; collective_id: string; venues: { name: string; city: string } | null };

  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", ev.collective_id)
    .eq("user_id", authedUserId)
    .is("deleted_at", null);

  if (!memberCount) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Generate prompt server-side from structured event data
  const venue = ev.venues;
  const { prompt, error: promptError } = await generatePosterPrompt({
    title: ev.title,
    genre: clientVibeTags ?? (ev.vibe_tags || []),
    venueName: clientVenueName ?? venue?.name,
    city: venue?.city,
    styleDirection: clientStyleDirection,
  });

  if (promptError || !prompt) {
    return NextResponse.json({ error: "Failed to generate poster prompt" }, { status: 500 });
  }

  try {
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
        { error: "Poster generation failed" },
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
