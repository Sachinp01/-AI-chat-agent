import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

// We use Node's built-in `node:sqlite` module (no native build step needed,
// which avoids node-gyp / prebuilt-binary issues across environments and
// deploy targets) instead of better-sqlite3. Swapping to better-sqlite3 or
// Postgres later is a small, localized change since all DB access goes
// through this file + db/conversations.ts.
const DB_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "data", "chat.db");

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      channel TEXT NOT NULL DEFAULT 'web_widget'
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  `);
}
