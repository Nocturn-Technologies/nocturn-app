"use server";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { generateWithClaude } from "@/lib/claude";
import { getEventContext, getCollectiveContext } from "@/lib/ai-context";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const SYSTEM_PROMPT_BASE =
  "You are Nocturn AI, an operations copilot for nightlife promoters. You have access to real event data shown below. Answer questions using SPECIFIC numbers from the data. Be concise (2-3 sentences max), confident, and actionable. If asked something you don't have data for, say so honestly. Never make up numbers.";

export async function generateChatResponse(
  channelId: string,
  userMessage: string,
  recentMessages?: { role: string; content: string }[]
): Promise<string> {
  const sb = admin();
  let aiContent: string;

  try {
    // 1. Fetch channel to determine context type
    const { data: channel, error: channelError } = await sb
      .from("channels")
      .select("id, event_id, collective_id")
      .eq("id", channelId)
      .maybeSingle();

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

      // 4. Build the full prompt including conversation history
      let prompt = "";
      if (recentMessages && recentMessages.length > 0) {
        const history = recentMessages
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n");
        prompt = `Recent conversation:\n${history}\n\nUser: ${userMessage}`;
      } else {
        prompt = userMessage;
      }

      // 5. Call Claude
      const aiResponse = await generateWithClaude(prompt, systemPrompt);
      aiContent = aiResponse || fallbackResponse(userMessage);
    }
  } catch (error) {
    console.error("[ai-chat] Error:", error);
    aiContent = fallbackResponse(userMessage);
  }

  // 6. Insert AI response server-side using admin client (bypasses RLS)
  try {
    await sb.from("messages").insert({
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
