"use server";

/**
 * AI Theme — upload an event flyer and extract a brand palette.
 *
 * Flow:
 *   1. Client sends FormData { eventId, file }
 *   2. We verify the user owns the event
 *   3. Upload the file to Supabase Storage (`event-assets` bucket)
 *   4. Get the public URL
 *   5. Call Claude vision to extract a color palette from the image
 *   6. Persist `flyer_url` + `metadata.theme` + `metadata.themeColor` on the event
 *   7. Return the public URL + palette so the UI can reflect it instantly
 *
 * The extracted theme has four colors (primary, secondary, accent, text) all
 * as hex strings. The primary color is mirrored into `metadata.themeColor`
 * because the public event page already reads that field to tint CTAs.
 */

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { verifyEventOwnership } from "@/lib/auth/ownership";
import { generateWithClaudeVision } from "@/lib/claude";
import { revalidatePath } from "next/cache";
import type { Json } from "@/lib/supabase/database.types";

export interface EventTheme {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  mood?: string;
}

interface UploadResult {
  error: string | null;
  flyerUrl: string | null;
  theme: EventTheme | null;
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const HEX_REGEX = /^#[0-9a-f]{6}$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_THEME: EventTheme = {
  primary: "#7B2FF7",
  secondary: "#9D5CFF",
  accent: "#E9DEFF",
  text: "#FFFFFF",
  mood: "neutral",
};

function sanitizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (HEX_REGEX.test(trimmed)) return trimmed.toUpperCase();
  // Expand short hex (#abc → #aabbcc)
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, a, b, c] = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i) ?? [];
    if (a && b && c) return `#${a}${a}${b}${b}${c}${c}`.toUpperCase();
  }
  return fallback;
}

function parseThemeJson(raw: string | null): EventTheme {
  if (!raw) return DEFAULT_THEME;
  try {
    // Claude may wrap the JSON in prose or ```json fences — extract the first object.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return DEFAULT_THEME;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      primary: sanitizeHex(parsed.primary, DEFAULT_THEME.primary),
      secondary: sanitizeHex(parsed.secondary, DEFAULT_THEME.secondary),
      accent: sanitizeHex(parsed.accent, DEFAULT_THEME.accent),
      text: sanitizeHex(parsed.text, DEFAULT_THEME.text),
      mood:
        typeof parsed.mood === "string" && parsed.mood.length <= 40
          ? parsed.mood.trim()
          : undefined,
    };
  } catch (err) {
    console.warn("[ai-theme] parseThemeJson failed:", err);
    return DEFAULT_THEME;
  }
}

// ai-theme callers need the event row (for its id / collective_id), not
// just a boolean. Delegate the membership + soft-delete check to the
// shared helper, then fetch the row once the gate passes.
async function verifyEventAccess(userId: string, eventId: string) {
  const ok = await verifyEventOwnership(userId, eventId);
  if (!ok) return null;
  const admin = createAdminClient();
  const { data: event, error: eventErr } = await admin
    .from("events")
    .select("id, collective_id")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (eventErr || !event) return null;
  return event;
}

/**
 * Upload an event flyer and extract an AI-generated theme.
 * Called from the design page when the operator picks a new flyer.
 */
export async function uploadFlyerAndExtractTheme(
  formData: FormData
): Promise<UploadResult> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "You must be logged in.", flyerUrl: null, theme: null };
    }

    const eventId = formData.get("eventId");
    const file = formData.get("file");

    if (typeof eventId !== "string" || !UUID_REGEX.test(eventId)) {
      return { error: "Invalid event ID", flyerUrl: null, theme: null };
    }
    if (!(file instanceof File)) {
      return { error: "No file provided", flyerUrl: null, theme: null };
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        error: "Only JPG, PNG, WEBP, or GIF images are supported.",
        flyerUrl: null,
        theme: null,
      };
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return {
        error: "Image must be between 1 byte and 10 MB.",
        flyerUrl: null,
        theme: null,
      };
    }

    const event = await verifyEventAccess(user.id, eventId);
    if (!event) {
      return {
        error: "You don't have permission to update this event.",
        flyerUrl: null,
        theme: null,
      };
    }

    const admin = createAdminClient();

    // ── 1. Upload to Supabase Storage ──
    const ext = (() => {
      switch (file.type) {
        case "image/jpeg":
          return "jpg";
        case "image/png":
          return "png";
        case "image/webp":
          return "webp";
        case "image/gif":
          return "gif";
        case "image/heic":
          return "heic";
        case "image/heif":
          return "heif";
        default:
          return "jpg";
      }
    })();
    const objectPath = `flyers/${eventId}-${Date.now()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error: uploadErr } = await admin.storage
      .from("event-assets")
      .upload(objectPath, bytes, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      console.error("[ai-theme] upload error:", uploadErr.message);
      return {
        error: "Failed to upload flyer. Please try again.",
        flyerUrl: null,
        theme: null,
      };
    }

    const { data: publicUrlData } = admin.storage
      .from("event-assets")
      .getPublicUrl(objectPath);
    const flyerUrl = publicUrlData.publicUrl;

    if (!flyerUrl || !/^https:\/\//i.test(flyerUrl)) {
      return {
        error: "Flyer uploaded but URL is invalid.",
        flyerUrl: null,
        theme: null,
      };
    }

    // ── 2. Ask Claude to extract a brand palette ──
    const prompt = `Analyze this event flyer and return a cohesive 4-color brand palette that matches its mood.

Return ONLY a single JSON object with this exact shape (no prose, no markdown fences):
{
  "primary": "#RRGGBB",   // the dominant accent — used for CTAs and headlines
  "secondary": "#RRGGBB", // a supporting accent — used for borders and pills
  "accent": "#RRGGBB",    // a highlight — used sparingly for icons and glows
  "text": "#RRGGBB",      // a foreground color that reads well on dark #09090B background
  "mood": "short phrase describing the vibe, e.g. 'neon warehouse techno'"
}

Rules:
- All colors must be valid 6-digit hex codes (e.g. "#7B2FF7").
- The palette should feel cohesive and reflect the flyer's actual visual style.
- Prefer saturated, high-energy colors for nightlife events.
- "text" must have enough contrast to be readable on a near-black background.`;

    const rawTheme = await generateWithClaudeVision(prompt, [flyerUrl]);
    const theme = parseThemeJson(rawTheme);

    // ── 3. Persist flyer_url + theme on the event ──
    const { data: currentEvent } = await admin
      .from("events")
      .select("metadata")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();

    const existingMetadata = (currentEvent?.metadata ?? {}) as Record<string, unknown>;

    const newMetadata = {
      ...existingMetadata,
      theme: { ...theme },
      themeColor: theme.primary, // mirror into themeColor so public page picks it up
    };

    const { error: updateErr } = await admin
      .from("events")
      .update({
        flyer_url: flyerUrl,
        // Cast to satisfy the generated Json type — metadata is jsonb.
        metadata: newMetadata as unknown as { [key: string]: Json | undefined },
      })
      .eq("id", eventId)
      .is("deleted_at", null);

    if (updateErr) {
      console.error("[ai-theme] event update error:", updateErr.message);
      return {
        error: "Flyer uploaded, but failed to save to event.",
        flyerUrl,
        theme,
      };
    }

    // Revalidate design page + any public event routes
    revalidatePath(`/dashboard/events/${eventId}/design`);
    revalidatePath("/e/[slug]/[eventSlug]", "page");

    return { error: null, flyerUrl, theme };
  } catch (err) {
    console.error("[uploadFlyerAndExtractTheme] unexpected:", err);
    return {
      error: "Something went wrong uploading the flyer.",
      flyerUrl: null,
      theme: null,
    };
  }
}

/**
 * Remove a flyer from an event (clears flyer_url + theme metadata).
 * Does NOT delete the file from storage — keeps old flyers addressable.
 */
export async function clearEventFlyer(
  eventId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be logged in." };
    if (!UUID_REGEX.test(eventId)) return { error: "Invalid event ID" };

    const event = await verifyEventAccess(user.id, eventId);
    if (!event) return { error: "Not authorized" };

    const admin = createAdminClient();
    const { data: currentEvent } = await admin
      .from("events")
      .select("metadata")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();

    const existingMetadata = (currentEvent?.metadata ?? {}) as Record<string, unknown>;
    const newMetadata = { ...existingMetadata };
    delete newMetadata.theme;

    const { error } = await admin
      .from("events")
      .update({
        flyer_url: null,
        metadata: newMetadata as unknown as { [key: string]: Json | undefined },
      })
      .eq("id", eventId)
      .is("deleted_at", null);

    if (error) {
      console.error("[clearEventFlyer] update error:", error.message);
      return { error: "Failed to clear flyer" };
    }

    revalidatePath(`/dashboard/events/${eventId}/design`);
    revalidatePath("/e/[slug]/[eventSlug]", "page");
    return { error: null };
  } catch (err) {
    console.error("[clearEventFlyer] unexpected:", err);
    return { error: "Something went wrong" };
  }
}
