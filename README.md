# Spur Mini AI Live Chat Agent

A small AI support agent for a live chat widget, built for the Spur founding
engineer take-home. A customer chats with an AI agent that answers
questions about a fictional store (shipping, returns, support hours, etc.)
using a real LLM, with full conversation persistence.

## Stack

- **Backend:** Node.js + TypeScript, Express
- **Database:** SQLite, via Node's built-in `node:sqlite` module (no native
  build step — see "Design decisions" below)
- **Frontend:** Plain HTML/CSS/JS chat widget (no framework/build step
  needed — see note below)
- **LLM:** [Groq](https://groq.com) (free tier), using their OpenAI-compatible
  chat completions API with the `llama-3.3-70b-versatile` model

> **Note on LLM provider:** the brief suggested OpenAI/Anthropic as
> examples ("any major LLM provider"). I used Groq's free API instead — it's
> OpenAI-compatible, fast, and has a generous free tier, which made it a
> practical choice for this exercise. The integration is fully encapsulated
> in `services/llm.ts`, so swapping to OpenAI or Anthropic later is a
> contained change to that one file (see "Design decisions" below).

> **Note on frontend framework:** the brief suggested Svelte/React. I used
> a small vanilla JS widget instead, since the UI surface here is genuinely
> tiny (one chat panel, a handful of DOM updates) and a framework + build
> step would add ceremony without adding value. The `app.js` is structured
> so the same logic would map cleanly onto Svelte components if this grew
> (message list, input bar, typing indicator as separate concerns).

## Project structure

```
spur-chat-agent/
  backend/
    src/
      index.ts                # Express app entrypoint, middleware, error handling
      db/
        index.ts              # SQLite connection + migrations
        conversations.ts      # Data access layer (conversations & messages)
      routes/
        chat.ts                # POST /chat/message, GET /chat/history/:sessionId
      services/
        chatService.ts        # Orchestrates validation + persistence + LLM call
        llm.ts                 # Groq API wrapper (generateReply)
        knowledgeBase.ts       # Hardcoded FAQ/store info injected into the system prompt
  frontend/
    index.html
    style.css
    app.js                     # Chat widget logic (fetch calls, rendering, typing indicator)
```

## How to run it locally

### Prerequisites

- Node.js **22.5+** (required for the built-in `node:sqlite` module —
  check with `node -v`)
- A free Groq API key ([console.groq.com/keys](https://console.groq.com/keys))

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env and set GROQ_API_KEY=gsk_...
npm run dev
```

This starts the API on `http://localhost:4000`. On first boot it
automatically creates the SQLite database file and tables (no separate
migration step needed — `runMigrations()` runs idempotently on startup).

Verify it's up:

```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

### 2. Frontend

The frontend is static files, so any static server works:

```bash
cd frontend
python3 -m http.server 5173
# or: npx serve .
```

Open `http://localhost:5173` in a browser. The widget talks to
`http://localhost:4000` by default (see `API_BASE` at the top of `app.js`
— change it there, or set `window.API_BASE` before the script loads, if
your backend runs elsewhere).

### Environment variables (backend/.env)

| Variable        | Required | Description                                       |
| --------------- | -------- | ------------------------------------------------- |
| `GROQ_API_KEY`  | Yes      | Your free Groq API key                            |
| `PORT`          | No       | Backend port (default `4000`)                     |
| `DATABASE_PATH` | No       | SQLite file path (default `backend/data/chat.db`) |

No secrets are committed — `.env` is gitignored, and `.env.example` shows
the shape.

## API

### `POST /chat/message`

Request:

```json
{
  "message": "Do you ship to the USA?",
  "sessionId": "optional-existing-session-id"
}
```

Response:

```json
{ "reply": "We currently only ship within India...", "sessionId": "..." }
```

- If `sessionId` is omitted, a new conversation is created and its id is
  returned — the client should store it and send it on subsequent calls.
- Empty messages are rejected with `400`. Very long messages are
  silently truncated to 4000 characters rather than rejected.
- LLM/network failures never crash the request — they return `200` with a
  friendly `reply` explaining something went wrong (see "Error handling"
  below for why this is `200` and not `5xx`).

### `GET /chat/history/:sessionId`

Returns the full persisted transcript for a session, used to rehydrate
the widget on page reload. Returns an empty `messages` array (not a 404)
for an unknown session id, since "no history yet" isn't really an error
condition for a fresh client.

## Data model

```sql
conversations (id TEXT PK, created_at TEXT, channel TEXT)
messages (id TEXT PK, conversation_id TEXT FK, sender TEXT CHECK IN ('user','ai'), text TEXT, created_at TEXT)
```

Kept intentionally minimal for the exercise — no auth/user table, since
the brief explicitly doesn't require auth. `channel` defaults to
`web_widget` but exists so a WhatsApp/Instagram channel could write into
the same table later without a schema change.

## Design decisions worth calling out

- **`node:sqlite` instead of `better-sqlite3`.** Both have the same
  prepare/run/get/all shape, so swapping is trivial, but `better-sqlite3`
  needs a native compile step (node-gyp) that can fail in sandboxed/CI
  environments without internet access to download Node headers. Node
  22+ ships a built-in SQLite driver that needs zero native deps, which
  felt like the more robust choice for an exercise meant to "just run."
  All SQL lives behind `db/conversations.ts`, so swapping the driver (or
  moving to Postgres for a real multi-tenant deployment) only touches
  that one file.
- **Groq, called directly via `fetch` against its OpenAI-compatible
  endpoint**, instead of a heavier SDK. The whole integration lives in
  `services/llm.ts` behind a single `generateReply(history, userMessage)`
  function — it owns model choice, system prompt construction, token
  limits, and error normalization (401 → bad key, 429 → rate limited,
  5xx → provider down). The rest of the app never touches Groq directly,
  so swapping to OpenAI or Anthropic later means editing this one file
  only (both have very similar chat-completion shapes).
- **Errors from the LLM are turned into a normal-looking AI message,
  not an HTTP error.** A chat widget showing a raw "500 error" toast is a
  worse UX than the agent saying "I'm having trouble right now, please
  try again." The failure is still persisted to the transcript (as an AI
  message) so a reload shows what happened, and the real error is logged
  server-side for debugging.
- **History is capped at the last 12 messages** when building LLM
  context, to keep prompt size (and therefore cost/latency) bounded for
  long-running conversations. This is a deliberate trade-off — a very
  long conversation could in theory lose earlier context — documented
  here rather than silently happening.
- **FAQ knowledge is hardcoded** in `knowledgeBase.ts` and injected into
  the system prompt on every call. The brief allows either hardcoding or
  a DB table; I hardcoded it to keep scope tight, but `getStoreKnowledge()`
  is the single seam where this would become a DB read (+ Redis cache) for
  a real multi-merchant deployment.

## Trade-offs / If I had more time

- **Streaming responses.** Right now the reply comes back as one JSON
  blob; a real product would stream tokens so the agent's reply appears
  incrementally instead of all at once (Groq supports SSE streaming on
  the same endpoint).
- **Per-merchant knowledge base in the DB**, with a simple admin UI to
  edit it, instead of hardcoded text — this is the natural next step
  toward the real Spur product.
- **Rate limiting / abuse protection** on `/chat/message` (e.g. per-IP or
  per-session) — currently only body size is capped. This matters more
  with Groq's free tier, which has its own rate limits.
- **Svelte/React frontend** if the widget grew beyond a single page (e.g.
  multiple conversations, an agent handoff UI) — vanilla JS was a
  deliberate choice for this scope, not a long-term one.
- **Tests.** Given the timebox I leaned on manual/curl-based testing
  (documented via the smoke tests I ran during development); unit tests
  for `chatService.ts` validation/truncation logic and an integration
  test for the two routes would be the first things I'd add.
- **Postgres instead of SQLite** for a real deployment with concurrent
  writers — SQLite is genuinely fine for this exercise's scale but
  wouldn't be my choice for production multi-tenant traffic.

## Deployment notes

- Backend: deployable as-is to Render/Railway/Fly.io etc. — just set
  `GROQ_API_KEY` (and optionally `PORT`) as environment variables. Note
  the host needs Node 22.5+ for `node:sqlite` (e.g. add a `.node-version`
  file pinning a recent Node 22 release on Render).
- SQLite on most free hosting tiers (e.g. Render's free plan) lives on an
  ephemeral filesystem, so conversation history resets on redeploy/restart.
  Fine for this exercise; a real deployment would use Postgres or a
  persistent disk.
- Frontend: any static host (Vercel/Netlify/GitHub Pages) works — just
  point `API_BASE` in `app.js` at the deployed backend URL.
