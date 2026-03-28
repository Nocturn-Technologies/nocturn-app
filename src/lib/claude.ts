import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "your_anthropic_api_key") {
    console.warn("[claude] ANTHROPIC_API_KEY not set or placeholder");
    return null;
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

/**
 * Generate a response with prompt caching.
 *
 * Prompt caching saves ~90% on input tokens for repeated system prompts.
 * The system prompt (brand voice + instructions) and data context are cached
 * separately so the large static instructions are reused across messages.
 *
 * @param prompt - User's message
 * @param systemPrompt - Optional system prompt (will be cached)
 * @param conversationHistory - Optional multi-turn message history
 */
export async function generateWithClaude(
  prompt: string,
  systemPrompt?: string,
  conversationHistory?: { role: "user" | "assistant"; content: string }[]
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const defaultSystem = "You are Nocturn AI, an assistant for nightlife promoters. Be concise, confident, and practical. Use nightlife terminology naturally.";
  const system = systemPrompt || defaultSystem;

  // Split system prompt into cacheable blocks:
  // Block 1: Base instructions (static, highly cacheable — same across all users)
  // Block 2: Data context (changes per user/session, cached for conversation duration)
  const dataSeparator = "--- OPERATOR'S DATA ---";
  const dataSeparator2 = "--- DATA ---";

  let systemBlocks: Anthropic.Messages.TextBlockParam[];

  const sepIndex = system.indexOf(dataSeparator) !== -1
    ? system.indexOf(dataSeparator)
    : system.indexOf(dataSeparator2);

  if (sepIndex !== -1) {
    // Split into instructions + data, cache both separately
    const instructions = system.slice(0, sepIndex).trim();
    const dataContext = system.slice(sepIndex).trim();
    systemBlocks = [
      { type: "text", text: instructions, cache_control: { type: "ephemeral" } },
      { type: "text", text: dataContext, cache_control: { type: "ephemeral" } },
    ];
  } else {
    // Single block — cache the whole thing
    systemBlocks = [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ];
  }

  // Build messages array with conversation history
  const messages: Anthropic.Messages.MessageParam[] = [];

  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add the current user message
  messages.push({ role: "user", content: prompt });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemBlocks,
      messages,
    });

    // Log cache performance for monitoring
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage = response.usage as any;
    if (usage?.cache_read_input_tokens || usage?.cache_creation_input_tokens) {
      console.info(
        `[claude] Cache: ${usage.cache_read_input_tokens ?? 0} read, ${usage.cache_creation_input_tokens ?? 0} created, ${usage.input_tokens ?? 0} uncached`
      );
    }

    return response.content[0].type === "text" ? response.content[0].text : null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[claude] API error:", msg);

    // If model not found, try haiku as fallback (also with caching)
    if (msg.includes("model") || msg.includes("not_found")) {
      try {
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemBlocks,
          messages,
        });
        return response.content[0].type === "text" ? response.content[0].text : null;
      } catch (fallbackError) {
        console.error("[claude] Fallback also failed:", fallbackError);
      }
    }
    return null;
  }
}
