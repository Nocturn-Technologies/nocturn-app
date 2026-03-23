import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "your_anthropic_api_key") return null;
  if (!_client) {
    _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function generateWithClaude(prompt: string, systemPrompt?: string): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.warn("[claude] No valid API key configured");
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
  } catch (error) {
    console.error("[claude] API error:", error);
    return null;
  }
}
