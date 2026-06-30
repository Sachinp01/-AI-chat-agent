import { Router, Request, Response } from "express";
import { getConversation, getMessages } from "../db/conversations";
import { handleIncomingMessage, ValidationError } from "../services/chatService";

export const chatRouter = Router();

/**
 * POST /chat/message
 * Body: { message: string, sessionId?: string }
 * Returns: { reply: string, sessionId: string }
 */
chatRouter.post("/message", async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body ?? {};
    const result = await handleIncomingMessage(message, sessionId);
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Unexpected error in POST /chat/message:", err);
    res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

/**
 * GET /chat/history/:sessionId
 * Returns the persisted message history for a conversation, so the
 * frontend can rehydrate the chat on page reload.
 */
chatRouter.get("/history/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required." });
  }

  const conversation = getConversation(sessionId);
  if (!conversation) {
    // Not an error — a fresh client just hasn't started a conversation yet.
    return res.json({ sessionId, messages: [] });
  }

  const messages = getMessages(sessionId).map((m) => ({
    id: m.id,
    sender: m.sender,
    text: m.text,
    createdAt: m.created_at,
  }));

  res.json({ sessionId, messages });
});
