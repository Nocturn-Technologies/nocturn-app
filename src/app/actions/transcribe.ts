"use server";

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(audioBase64: string, mimeType: string) {
  try {
    // Convert base64 to buffer
    const buffer = Buffer.from(audioBase64, "base64");
    const file = new File([buffer], "recording.webm", { type: mimeType });

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
