"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { generateWithClaude } from "@/lib/claude";
import { getEventContext, getCollectiveContext } from "@/lib/ai-context";

import { SYSTEM_PROMPTS } from "@/lib/ai-prompts";

const SYSTEM_PROMPT_BASE = SYSTEM_PROMPTS.ops;

export async function generateChatResponse(
  channelId: string,
  userMessage: string,
  recentMessages?: { role: string; content: string }[]
): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Not authenticated";

  const sb = createAdminClient();
  let aiContent: string;

  try {
    // 1. Fetch channel to determine context type
    const { data: channelRaw, error: channelError } = await sb
      .from("channels")
      .select("id, event_id, collective_id")
      .eq("id", channelId)
      .maybeSingle();
    const channel = channelRaw as { id: string; event_id: string | null; collective_id: string | null } | null;

    if (channelError || !channel) {
      console.error("Failed to fetch channel:", channelError);
      aiContent = fallbackResponse(userMessage);
    } else {
      // 2. Fetch the appropriate context
      let contextData: string;
      if (channel.event_id) {
        contextData = await getEventContext(channel.event_id);
      } else if (channel.collective_id) {
        contextData = await getCollectiveContext(channel.collective_id);
      } else {
        contextData = "No event or collective data available for this channel.";
      }

      // 3. Build system prompt with real data
      const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n--- DATA ---\n${contextData}`;

      // 4. Build conversation history for prompt caching
      const history = (recentMessages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      // 5. Call Claude with prompt caching
      const aiResponse = await generateWithClaude(userMessage, systemPrompt, history);
      aiContent = aiResponse || fallbackResponse(userMessage);
    }
  } catch (error) {
    console.error("[ai-chat] Error:", error);
    aiContent = fallbackResponse(userMessage);
  }

  // 6. Insert AI response server-side using admin client (bypasses RLS)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("messages") as any).insert({
      channel_id: channelId,
      user_id: null,
      content: aiContent,
      type: "ai",
    });
  } catch (insertErr) {
    console.error("[ai-chat] Failed to insert AI message:", insertErr);
  }

  return aiContent;
}

function fallbackResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("ticket") || lower.includes("sales")) {
    return "I'm having trouble connecting to my data source right now. Check the event dashboard for the latest ticket numbers.";
  }
  if (lower.includes("lineup") || lower.includes("artist")) {
    return "I can't pull lineup data at the moment. Head to the event's Lineup tab for the latest artist details.";
  }
  if (lower.includes("revenue") || lower.includes("money") || lower.includes("finance")) {
    return "I'm unable to access financial data right now. Check the Finance tab for up-to-date revenue and settlement info.";
  }
  if (lower.includes("task") || lower.includes("todo")) {
    return "I can't load task data at the moment. Visit the event's Tasks tab to see what's open.";
  }

  return "I'm temporarily unable to access live data. Try again in a moment, or check the relevant dashboard tab directly.";
}
