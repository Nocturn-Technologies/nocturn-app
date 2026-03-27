import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log("[claude] API key check:", key ? "set" : "NOT SET");
  if (!key || key === "your_anthropic_api_key") {
    console.warn("[claude] ANTHROPIC_API_KEY not set or placeholder");
    return null;
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

export async function generateWithClaude(prompt: string, systemPrompt?: string): Promise<string | null> {
  const client = getClient();
  if (!client) {
    return null;
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt || "You are Nocturn AI, an assistant for nightlife promoters. Be concise, confident, and practical. Use nightlife terminology naturally.",
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0].type === 'text' ? response.content[0].text : null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[claude] API error:", msg);
    // If it's a model not found error, try haiku as fallback
    if (msg.includes("model") || msg.includes("not_found")) {
      try {
        if (!client) {
          console.error("[claude] Client not initialized");
          return null;
        }
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemPrompt || "You are Nocturn AI, an assistant for nightlife promoters. Be concise, confident, and practical.",
          messages: [{ role: "user", content: prompt }],
        });
        return response.content[0].type === 'text' ? response.content[0].text : null;
      } catch (fallbackError) {
        console.error("[claude] Fallback also failed:", fallbackError);
      }
    }
    return null;
  }
}
