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

  // Validate and sanitize prompt length
  if (prompt.length > 10000) {
    prompt = prompt.slice(0, 10000);
  }

  // Validate and sanitize conversation history
  if (conversationHistory) {
    conversationHistory = conversationHistory
      .filter((msg) => msg.role === "user" || msg.role === "assistant")
      .slice(-20)
      .map((msg) => ({
        role: msg.role,
        content: msg.content.length > 5000 ? msg.content.slice(0, 5000) : msg.content,
      }));
  }

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemBlocks,
      messages,
    }, { signal: controller.signal as AbortSignal });

    clearTimeout(timeout);

    // Log cache performance for monitoring
    const usage = response.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    if (usage?.cache_read_input_tokens || usage?.cache_creation_input_tokens) {
      console.info(
        `[claude] Cache: ${usage.cache_read_input_tokens ?? 0} read, ${usage.cache_creation_input_tokens ?? 0} created, ${usage.input_tokens ?? 0} uncached`
      );
    }

    if (!response.content || response.content.length === 0) return null;
    return response.content[0].type === "text" ? response.content[0].text : null;
  } catch (error: unknown) {
    clearTimeout(timeout);
    const msg = error instanceof Error ? error.message : String(error);

    if (error instanceof Error && error.name === "AbortError") {
      console.error("[claude] API call timed out after 30s");
      return null;
    }

    console.error("[claude] API error:", msg);

    // If model not found, try haiku as fallback (also with caching)
    if (msg.includes("model_not_found") || msg.includes("not_found_error") || msg.includes("Could not resolve the model")) {
      const fallbackController = new AbortController();
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 30000);
      try {
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemBlocks,
          messages,
        }, { signal: fallbackController.signal as AbortSignal });
        clearTimeout(fallbackTimeout);
        if (!response.content || response.content.length === 0) return null;
        return response.content[0].type === "text" ? response.content[0].text : null;
      } catch (fallbackError) {
        clearTimeout(fallbackTimeout);
        console.error("[claude] Fallback also failed:", fallbackError);
      }
    }
    return null;
  }
}
