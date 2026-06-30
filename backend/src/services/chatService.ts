import {
  addMessage,
  getOrCreateConversation,
  getRecentMessages,
} from "../db/conversations";
import { generateReply, LlmConfigError, LlmRequestError } from "./llm";

export const MAX_MESSAGE_LENGTH = 4000;

export class ValidationError extends Error {}

export interface ChatResult {
  reply: string;
  sessionId: string;
}

/**
 * Validates input, persists the user message, asks the LLM for a reply
 * (with conversation history as context), persists the reply, and returns
 * both. This is the single place that ties storage + LLM together so
 * routes stay thin and future channels (WhatsApp, IG) can reuse it.
 */
export async function handleIncomingMessage(
  rawMessage: unknown,
  rawSessionId: unknown
): Promise<ChatResult> {
  if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
    throw new ValidationError("Message must be a non-empty string.");
  }
  if (rawSessionId !== undefined && typeof rawSessionId !== "string") {
    throw new ValidationError("sessionId must be a string if provided.");
  }

  // Truncate very long messages rather than rejecting outright — keeps the
  // UX forgiving while bounding LLM cost/latency.
  let message = rawMessage.trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH);
  }

  const conversation = getOrCreateConversation(rawSessionId);

  // History BEFORE this message, used as context for the LLM call.
  const history = getRecentMessages(conversation.id);

  addMessage(conversation.id, "user", message);

  let replyText: string;
  try {
    replyText = await generateReply(history, message);
  } catch (err) {
    // Surface a clean, user-facing message while still persisting that the
    // turn happened, so a reload shows what was attempted. We don't store
    // the raw error — just a friendly note — to keep the transcript clean.
    const friendly =
      err instanceof LlmConfigError
        ? "Our support agent is temporarily misconfigured. Please try again later."
        : err instanceof LlmRequestError
        ? "Sorry, I'm having trouble reaching our support agent right now. Please try again in a moment."
        : "Something went wrong generating a reply. Please try again.";

    addMessage(conversation.id, "ai", friendly);
    return { reply: friendly, sessionId: conversation.id };
  }

  addMessage(conversation.id, "ai", replyText);
  return { reply: replyText, sessionId: conversation.id };
}
