import { v4 as uuidv4 } from "uuid";
import { db } from "./index";

export type Sender = "user" | "ai";

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender: Sender;
  text: string;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  created_at: string;
  channel: string;
}

/**
 * Thin data-access layer around SQLite. Kept as plain functions (no class/
 * repository ceremony) since the surface area is small, but it's the only
 * place in the app that touches `db` directly — routes/services never run
 * raw SQL themselves.
 */

export function getOrCreateConversation(sessionId?: string): ConversationRow {
  if (sessionId) {
    const existing = db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(sessionId) as unknown as ConversationRow | undefined;
    if (existing) return existing;
  }

  const id = sessionId && sessionId.trim() ? sessionId : uuidv4();
  db.prepare("INSERT INTO conversations (id) VALUES (?)").run(id);
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as unknown as ConversationRow;
}

export function getConversation(sessionId: string): ConversationRow | undefined {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(sessionId) as unknown as
    | ConversationRow
    | undefined;
}

export function addMessage(conversationId: string, sender: Sender, text: string): MessageRow {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO messages (id, conversation_id, sender, text) VALUES (?, ?, ?, ?)"
  ).run(id, conversationId, sender, text);
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as MessageRow;
}

export function getMessages(conversationId: string, limit = 100): MessageRow[] {
  return db
    .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`)
    .all(conversationId, limit) as unknown as MessageRow[];
}

/** Most recent N messages, used as LLM context (cheaper + keeps prompts bounded). */
export function getRecentMessages(conversationId: string, limit = 12): MessageRow[] {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(conversationId, limit) as unknown as MessageRow[];
  return rows.reverse();
}
