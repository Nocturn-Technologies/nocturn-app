"use server";

import { revalidatePath } from "next/cache";
import OpenAI from "openai";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
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
    const fileSizeMB = buffer.length / (1024 * 1024);

    // Whisper has a 25MB limit. If file is larger, we need to handle it.
    // For now, if under 25MB, send directly. If over, compress or chunk.
    if (fileSizeMB > 24) {
      // For very large files, try sending anyway — Whisper may handle compressed webm well
      // If this fails, we'll need FFmpeg chunking (future enhancement)
      console.warn(`Large audio file: ${fileSizeMB.toFixed(1)}MB — attempting transcription`);
    }

    const file = new File([buffer], "recording.webm", { type: "audio/webm" });

    // Step 1: Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
    });

    const transcript = transcription.text;

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

    const analysis = await openai.chat.completions.create({
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
    });

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

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(choiceContent);
    } catch {
      console.error("[transcribeFromStorage] Failed to parse analysis JSON");
      parsed = {};
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

    if (!audioBase64 || audioBase64.length > 35_000_000) {
      return { error: "Audio file too large", transcript: "", summary: "", action_items: [], key_decisions: [] };
    }
    const buffer = Buffer.from(audioBase64, "base64");
    const file = new File([buffer], "recording.webm", { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
    });

    const transcript = transcription.text;

    if (!transcript || transcript.trim().length < 10) {
      return {
        error: null,
        transcript: transcript || "",
        summary: "Recording was too short or unclear to summarize.",
        action_items: [],
        key_decisions: [],
      };
    }

    const analysis = await openai.chat.completions.create({
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
    });

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

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(choiceContent);
    } catch {
      console.error("[transcribeAudio] Failed to parse analysis JSON");
      parsed = {};
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
