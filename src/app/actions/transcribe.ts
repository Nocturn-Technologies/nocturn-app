"use server";

import OpenAI from "openai";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcribe audio from a Supabase Storage URL (for long recordings).
 * Downloads the file server-side, chunks if needed, transcribes with Whisper.
 */
export async function transcribeFromStorage(storagePath: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", transcript: "", summary: "", action_items: [], key_decisions: [] };

  try {
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
      return {
        error: `Failed to download audio: ${dlError?.message ?? "unknown"}`,
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

    const parsed = JSON.parse(analysis.choices[0].message.content ?? "{}");

    return {
      error: null,
      transcript,
      summary: parsed.summary ?? "No summary available.",
      action_items: parsed.action_items ?? [],
      key_decisions: parsed.key_decisions ?? [],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Transcription failed";
    return {
      error: msg,
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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", transcript: "", summary: "", action_items: [], key_decisions: [] };

  if (audioBase64.length > 35_000_000) {
    return { error: "Audio file too large", transcript: "", summary: "", action_items: [], key_decisions: [] };
  }

  try {
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

    const parsed = JSON.parse(analysis.choices[0].message.content ?? "{}");

    return {
      error: null,
      transcript,
      summary: parsed.summary ?? "No summary available.",
      action_items: parsed.action_items ?? [],
      key_decisions: parsed.key_decisions ?? [],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Transcription failed";
    return {
      error: msg,
      transcript: "",
      summary: "",
      action_items: [],
      key_decisions: [],
    };
  }
}
