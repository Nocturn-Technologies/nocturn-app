"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { generateWithClaude } from "@/lib/claude";
import { getCollectiveContext } from "@/lib/ai-context";
import { rateLimitStrict } from "@/lib/rate-limit";

import { SYSTEM_PROMPTS } from "@/lib/ai-prompts";

/** Pick the right agent based on channel name and message content */
function pickAgent(channelName: string, message: string): string {
  const name = channelName.toLowerCase();
  const msg = message.toLowerCase();

  // Channel name takes priority
  if (name.includes("money") || name.includes("finance") || name.includes("settlement")) return SYSTEM_PROMPTS.money;
  if (name.includes("promo") || name.includes("marketing") || name.includes("flyer")) return SYSTEM_PROMPTS.promo;

  // Fall back to message content heuristics
  if (msg.includes("revenue") || msg.includes("settlement") || msg.includes("payout") || msg.includes("budget") || msg.includes("bar minimum") || msg.includes("break-even") || msg.includes("profit")) return SYSTEM_PROMPTS.money;
  if (msg.includes("flyer") || msg.includes("caption") || msg.includes("email campaign") || msg.includes("instagram") || msg.includes("social")) return SYSTEM_PROMPTS.promo;

  return SYSTEM_PROMPTS.ops;
}

export async function generateChatResponse(
  channelId: string,
  userMessage: string,
  recentMessages?: { role: string; content: string }[]
): Promise<{ content: string; messageId: string | null }> {
  try {
  if (!channelId?.trim()) return { content: "Channel ID is required", messageId: null };
  if (!userMessage?.trim()) return { content: "Message is required", messageId: null };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { content: "Not authenticated", messageId: null };

  // Rate limit: 20 AI chat messages per minute per user
  const { success: rlOk } = await rateLimitStrict(`ai-chat:${user.id}`, 20, 60_000);
  if (!rlOk) return { content: "You're sending messages too fast. Please slow down.", messageId: null };

  const sb = createAdminClient();
  let aiContent: string = fallbackResponse(userMessage);

  try {
    // 1. Fetch channel to determine context type + agent
    const { data: channelRaw, error: channelError } = await sb
      .from("channels")
      .select("id, collective_id, name")
      .eq("id", channelId)
      .maybeSingle();
    const channel = channelRaw as { id: string; collective_id: string | null; name: string } | null;

    if (channelError || !channel) {
      console.error("Failed to fetch channel:", channelError);
      aiContent = fallbackResponse(userMessage);
    } else {
      // Verify user is a member of this channel's collective
      if (channel.collective_id) {
        const { count: memberCount } = await sb
          .from("collective_members")
          .select("*", { count: "exact", head: true })
          .eq("collective_id", channel.collective_id)
          .eq("user_id", user.id)
          .is("deleted_at", null);

        if (!memberCount || memberCount === 0) {
          return { content: "You don't have access to this channel.", messageId: null };
        }
      }

      // 2. Fetch the appropriate context (channels are now collective-scoped only)
      let contextData: string;
      if (channel.collective_id) {
        contextData = await getCollectiveContext(channel.collective_id);
      } else {
        contextData = "No collective data available for this channel.";
      }

      // 3. Build system prompt with the right agent + real data
      const agentPrompt = pickAgent(channel.name || "", userMessage);
      const systemPrompt = `${agentPrompt}\n\n--- DATA ---\n${contextData}`;

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
  let messageId: string | null = null;
  try {
    const { data: insertedMsg } = await sb.from("messages").insert({
      channel_id: channelId,
      user_id: "00000000-0000-0000-0000-000000000000",
      content: aiContent,
    }).select("id").maybeSingle();
    if (insertedMsg) messageId = insertedMsg.id;
  } catch (insertErr: unknown) {
    console.error("[ai-chat] Failed to insert AI message:", insertErr);
  }

  return { content: aiContent, messageId };
  } catch (err) {
    console.error("[generateChatResponse]", err);
    return { content: "Something went wrong", messageId: null };
  }
}

/**
 * Add an expense from chat context.
 * NOTE: Channels are no longer linked to events directly. This function
 * now returns a user-facing error directing operators to the event page.
 * Kept for API compatibility — callers should use addExpense() directly.
 */
export async function addExpenseFromChat(
  _channelId: string,
  _description: string,
  _amount: number,
  _category: string = "other"
): Promise<{ error: string | null; success: boolean }> {
  return {
    error: "Expenses can no longer be added from chat. Please add expenses from the event's Finance tab.",
    success: false,
  };
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
