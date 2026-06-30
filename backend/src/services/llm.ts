import { MessageRow } from "../db/conversations";
import { getStoreKnowledge } from "./knowledgeBase";

// Groq exposes an OpenAI-compatible chat completions API.
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const MAX_TOKENS = 500;
const MAX_HISTORY_MESSAGES = 12;

export class LlmConfigError extends Error {}
export class LlmRequestError extends Error {}

function buildSystemPrompt(): string {
  return `You are a helpful, friendly customer support agent for Northwind Goods, a small e-commerce store.

Answer customer questions clearly and concisely, in a warm but professional tone. Keep replies short (2-5 sentences) unless the question genuinely needs more detail.

Only use the store information provided below to answer policy/factual questions (shipping, returns, hours, payments, etc.). If something isn't covered by this information and you don't know the answer, say so honestly and suggest the customer email support@northwindgoods.example instead of guessing.

If the customer's message is unrelated to the store (e.g. general chit-chat, unrelated topics), you can respond briefly and naturally, but gently steer back to how you can help with their order or the store.

--- STORE INFORMATION ---
${getStoreKnowledge()}
--- END STORE INFORMATION ---`;
}

export async function generateReply(
  history: MessageRow[],
  userMessage: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new LlmConfigError("GROQ_API_KEY is not set in the environment.");
  }

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...trimmedHistory.map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text,
    })),
    { role: "user", content: userMessage },
  ];

  let response: Response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      }),
    });
  } catch (err) {
    throw new LlmRequestError(
      err instanceof Error ? err.message : "Network error calling Groq."
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new LlmConfigError("Invalid Groq API key.");
    }
    if (response.status === 429) {
      throw new LlmRequestError("Rate limited by Groq. Please try again shortly.");
    }
    if (response.status >= 500) {
      throw new LlmRequestError("Groq is temporarily unavailable.");
    }
    const errBody = await response.text();
    throw new LlmRequestError(`Groq request failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new LlmRequestError("Groq returned an empty response.");
  }
  return text;
}