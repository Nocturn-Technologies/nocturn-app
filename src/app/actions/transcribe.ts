"use server";

import { revalidatePath } from "next/cache";
import OpenAI from "openai";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

// Explicit timeouts — the OpenAI SDK defaults to 10 minutes, which is
// longer than any Vercel lambda will live. Without these, a hung
// OpenAI request returns a cryptic "lambda timeout" instead of a
// friendly error the UI can surface and retry.
const WHISPER_TIMEOUT_MS = 60_000;   // 1 minute for ~25MB of audio
const GPT_TIMEOUT_MS = 30_000;       // 30 seconds for summarization
// Whisper's hard limit is 25MB. We cap slightly below to leave headroom
// for multipart/form overhead.
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: WHISPER_TIMEOUT_MS,
});

function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Pick a plausible filename extension for a given MIME so Whisper's
 * content sniffing works. Hardcoding `recording.webm` for an mp3 file
 * causes Whisper to fall back to slower paths.
 */
function filenameForMime(mime: string): string {
  switch (mime) {
    case "audio/webm": return "recording.webm";
    case "audio/ogg": return "recording.ogg";
    case "audio/mp4":
    case "audio/x-m4a": return "recording.m4a";
    case "audio/mpeg":
    case "audio/mp3": return "recording.mp3";
    case "audio/wav": return "recording.wav";
    default: return "recording.webm";
  }
}

/**
 * Transcribe audio from a Supabase Storage URL (for long recordings).
 * Downloads the file server-side, chunks if needed, transcribes with Whisper.
 */
export async function transcribeFromStorage(storagePath: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", transcript: "", summary: "", action_items: [], key_decisions: [] };

    // Rate limit: 5 transcriptions per hour per user (Whisper + GPT are expensive)
    const { success: rlOk } = await rateLimitStrict(`transcribe:${user.id}`, 5, 3_600_000);
    if (!rlOk) return { error: "Rate limit exceeded. Max 5 transcriptions per hour.", transcript: "", summary: "", action_items: [], key_decisions: [] };

    // Validate storagePath — no path traversal
    if (!storagePath?.trim()) return { error: "Storage path is required", transcript: "", summary: "", action_items: [], key_decisions: [] };
    if (storagePath.includes("..") || storagePath.includes("\0")) {
      return { error: "Invalid storage path", transcript: "", summary: "", action_items: [], key_decisions: [] };
    }

    const admin = createAdminClient();

    // Verify ownership: the recording must belong to the authenticated user
    const { data: recording } = await admin
      .from("recordings")
      .select("user_id")
      .eq("storage_path", storagePath)
      .maybeSingle();

    if (!recording || recording.user_id !== user.id) {
      return { error: "Not authorized", transcript: "", summary: "", action_items: [], key_decisions: [] };
    }

    // Download the audio file from Supabase Storage
    const { data: fileData, error: dlError } = await admin.storage
      .from("recordings")
      .download(storagePath);

    if (dlError || !fileData) {
      console.error("[transcribeFromStorage]", dlError);
      return {
        error: "Failed to download audio file",
        transcript: "",
        summary: "",
        action_items: [],
        key_decisions: [],
      };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Hard fail if the file is over Whisper's limit. Previously this was
    // a warn-and-try, which always ended in a 413 from OpenAI AND burned
    // a rate-limit slot (5/hour). Friendly error instead.
    if (buffer.length > WHISPER_MAX_BYTES) {
      const mb = (buffer.length / (1024 * 1024)).toFixed(1);
      return {
        error: `Recording is ${mb}MB — too large for transcription (max 24MB). Try splitting it up.`,
        transcript: "",
        summary: "",
        action_items: [],
        key_decisions: [],
      };
    }

    // Assume webm because that's what the recorder always emits.
    // transcribeFromStorage is called for recordings we wrote ourselves.
    const file = new File([buffer], "recording.webm", { type: "audio/webm" });

    // Step 1: Transcribe with Whisper (granular error so callers can
    // distinguish transcription failure from analysis failure).
    let transcript: string;
    try {
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "en",
      });
      transcript = transcription.text;
    } catch (whisperErr) {
      console.error("[transcribeFromStorage] Whisper failed:", whisperErr);
      return {
        error: "Transcription failed. Please try again.",
        transcript: "",
        summary: "",
        action_items: [],
        key_decisions: [],
      };
    }

    if (!transcript || transcript.trim().length < 10) {
      return {
        error: null,
        transcript: transcript || "",
        summary: "Recording was too short or unclear to summarize.",
        action_items: [],
        key_decisions: [],
      };
    }

    // Step 2: Extract summary, action items, key decisions with GPT
    // For long transcripts, truncate to avoid token limits
    const maxChars = 30000; // ~7500 tokens
    const truncatedTranscript =
      transcript.length > maxChars
        ? transcript.slice(0, maxChars) + "\n\n[... transcript truncated for analysis ...]"
        : transcript;

    // Step 2: Analysis via GPT — wrap in its own try so we can still
    // return the transcript even if summarization fails.
    let parsed: Record<string, unknown> = {};
    try {
      const analysis = await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an AI assistant for music promoters and event collectives. Analyze the following call transcript and extract:
1. A concise summary (2-3 sentences)
2. Action items (format: "Task — Person — Deadline")
3. Key decisions made

Return valid JSON with this exact structure:
{
  "summary": "string",
  "action_items": ["string"],
  "key_decisions": ["string"]
}

If the transcript is casual conversation with no clear action items or decisions, still provide a summary but return empty arrays for action_items and key_decisions.`,
            },
            {
              role: "user",
              content: truncatedTranscript,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        },
        { timeout: GPT_TIMEOUT_MS }
      );

      const choiceContent = analysis.choices?.[0]?.message?.content;
      if (!choiceContent) {
        return {
          error: null,
          transcript,
          summary: "Analysis could not be generated.",
          action_items: [],
          key_decisions: [],
        };
      }

      try {
        parsed = JSON.parse(choiceContent);
      } catch {
        console.error("[transcribeFromStorage] Failed to parse analysis JSON");
        parsed = {};
      }
    } catch (gptErr) {
      console.error("[transcribeFromStorage] GPT analysis failed:", gptErr);
      // Transcript is still usable on its own — return it with an
      // explanatory summary so the user isn't left empty-handed.
      return {
        error: null,
        transcript,
        summary: "Transcript captured, but AI summary failed. You can still read the transcript.",
        action_items: [],
        key_decisions: [],
      };
    }

    revalidatePath("/dashboard/record");

    return {
      error: null,
      transcript,
      summary: stripHtmlTags((parsed.summary as string) ?? "No summary available."),
      action_items: ((parsed.action_items as string[]) ?? []).map((item: string) => stripHtmlTags(item)),
      key_decisions: ((parsed.key_decisions as string[]) ?? []).map((item: string) => stripHtmlTags(item)),
    };
  } catch (err: unknown) {
    console.error("[transcribeFromStorage]", err);
    return {
      error: "Something went wrong",
      transcript: "",
      summary: "",
      action_items: [],
      key_decisions: [],
    };
  }
}

/**
 * Original base64 transcription — kept for short recordings (< 5 min).
 * For longer recordings, use transcribeFromStorage instead.
 */
export async function transcribeAudio(audioBase64: string, mimeType: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", transcript: "", summary: "", action_items: [], key_decisions: [] };

    // Rate limit: 5 transcriptions per hour per user
    const { success: rlOk } = await rateLimitStrict(`transcribe:${user.id}`, 5, 3_600_000);
    if (!rlOk) return { error: "Rate limit exceeded. Max 5 transcriptions per hour.", transcript: "", summary: "", action_items: [], key_decisions: [] };

    // Validate mimeType against allowlist
    const allowedMimeTypes = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp3"];
    if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
      return { error: "Unsupported audio format", transcript: "", summary: "", action_items: [], key_decisions: [] };
    }

    // Cap on the raw base64 string length. Base64 is ~1.33× the decoded
    // byte size, so 35MB of base64 ≈ 26MB of audio — slightly over
    // Whisper's 25MB limit, so we also check the decoded length below.
    if (!audioBase64 || audioBase64.length > 35_000_000) {
      return { error: "Audio file too large", transcript: "", summary: "", action_items: [], key_decisions: [] };
    }
    const buffer = Buffer.from(audioBase64, "base64");
    if (buffer.length > WHISPER_MAX_BYTES) {
      const mb = (buffer.length / (1024 * 1024)).toFixed(1);
      return {
        error: `Recording is ${mb}MB — too large for transcription (max 24MB).`,
        transcript: "",
        summary: "",
        action_items: [],
        key_decisions: [],
      };
    }
    // Filename extension matches mimeType so Whisper's content sniffing
    // doesn't guess wrong for mp3 / m4a / wav uploads.
    const file = new File([buffer], filenameForMime(mimeType), { type: mimeType });

    // Step 1: Whisper — distinguish this failure from the GPT step below.
    let transcript: string;
    try {
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "en",
      });
      transcript = transcription.text;
    } catch (whisperErr) {
      console.error("[transcribeAudio] Whisper failed:", whisperErr);
      return {
        error: "Transcription failed. Please try again.",
        transcript: "",
        summary: "",
        action_items: [],
        key_decisions: [],
      };
    }

    if (!transcript || transcript.trim().length < 10) {
      return {
        error: null,
        transcript: transcript || "",
        summary: "Recording was too short or unclear to summarize.",
        action_items: [],
        key_decisions: [],
      };
    }

    // Step 2: GPT analysis — isolated try so we return the raw transcript
    // even if summarization fails.
    let parsed: Record<string, unknown> = {};
    try {
      const analysis = await openai.chat.completions.create(
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an AI assistant for music promoters and event collectives. Analyze the following call transcript and extract:
1. A concise summary (2-3 sentences)
2. Action items (format: "Task — Person — Deadline")
3. Key decisions made

Return valid JSON with this exact structure:
{
  "summary": "string",
  "action_items": ["string"],
  "key_decisions": ["string"]
}

If the transcript is casual conversation with no clear action items or decisions, still provide a summary but return empty arrays for action_items and key_decisions.`,
            },
            {
              role: "user",
              content: transcript,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        },
        { timeout: GPT_TIMEOUT_MS }
      );

      const choiceContent = analysis.choices?.[0]?.message?.content;
      if (!choiceContent) {
        return {
          error: null,
          transcript,
          summary: "Analysis could not be generated.",
          action_items: [],
          key_decisions: [],
        };
      }

      try {
        parsed = JSON.parse(choiceContent);
      } catch {
        console.error("[transcribeAudio] Failed to parse analysis JSON");
        parsed = {};
      }
    } catch (gptErr) {
      console.error("[transcribeAudio] GPT analysis failed:", gptErr);
      return {
        error: null,
        transcript,
        summary: "Transcript captured, but AI summary failed. You can still read the transcript.",
        action_items: [],
        key_decisions: [],
      };
    }

    revalidatePath("/dashboard/record");

    return {
      error: null,
      transcript,
      summary: stripHtmlTags((parsed.summary as string) ?? "No summary available."),
      action_items: ((parsed.action_items as string[]) ?? []).map((item: string) => stripHtmlTags(item)),
      key_decisions: ((parsed.key_decisions as string[]) ?? []).map((item: string) => stripHtmlTags(item)),
    };
  } catch (err: unknown) {
    console.error("[transcribeAudio]", err);
    return {
      error: "Something went wrong",
      transcript: "",
      summary: "",
      action_items: [],
      key_decisions: [],
    };
  }
}
