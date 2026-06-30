// Spur mini support chat widget — plain JS, no build step required.
// Talks to the backend's two endpoints:
//   GET  /chat/history/:sessionId   -> rehydrate past messages on load
//   POST /chat/message              -> send a new message, get the AI reply

const API_BASE = window.API_BASE || "https://ai-chat-agent-95c0.onrender.com";
const SESSION_KEY = "spur_chat_session_id";

const elMessages = document.getElementById("chat-messages");
const elInput = document.getElementById("chat-input");
const elSendBtn = document.getElementById("send-btn");
const elStatusLine = document.getElementById("status-line");

let sessionId = localStorage.getItem(SESSION_KEY) || null;
let isSending = false;

init();

async function init() {
  bindEvents();
  if (sessionId) {
    await loadHistory(sessionId);
  } else {
    renderWelcomeMessage();
  }
}

function bindEvents() {
  elSendBtn.addEventListener("click", handleSend);

  elInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-grow the textarea up to the CSS max-height.
  elInput.addEventListener("input", () => {
    elInput.style.height = "auto";
    elInput.style.height = `${elInput.scrollHeight}px`;
  });
}

function renderWelcomeMessage() {
  appendBubble(
    "ai",
    "Hi! I'm the Northwind Goods support agent. Ask me about shipping, returns, order tracking, or anything else about your order.",
  );
}

async function loadHistory(id) {
  try {
    const res = await fetch(
      `${API_BASE}/chat/history/${encodeURIComponent(id)}`,
    );
    if (!res.ok) throw new Error("Failed to load history");
    const data = await res.json();

    if (!data.messages || data.messages.length === 0) {
      renderWelcomeMessage();
      return;
    }

    for (const m of data.messages) {
      appendBubble(m.sender, m.text, m.createdAt);
    }
    scrollToBottom();
  } catch (err) {
    console.error(err);
    // History fetch failing shouldn't block a fresh conversation from starting.
    renderWelcomeMessage();
  }
}

async function handleSend() {
  const text = elInput.value.trim();
  if (!text || isSending) return;

  appendBubble("user", text);
  elInput.value = "";
  elInput.style.height = "auto";
  scrollToBottom();

  setSending(true);
  const typingEl = appendTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        sessionId: sessionId || undefined,
      }),
    });

    typingEl.remove();

    if (!res.ok) {
      const errBody = await safeJson(res);
      appendBubble(
        "ai",
        errBody?.error || "Something went wrong. Please try again.",
        null,
        true,
      );
      return;
    }

    const data = await res.json();

    if (data.sessionId && data.sessionId !== sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);
    }

    appendBubble("ai", data.reply);
  } catch (err) {
    console.error(err);
    typingEl.remove();
    appendBubble(
      "ai",
      "Couldn't reach the server. Check your connection and try again.",
      null,
      true,
    );
  } finally {
    setSending(false);
    scrollToBottom();
  }
}

function setSending(sending) {
  isSending = sending;
  elSendBtn.disabled = sending;
  elInput.disabled = sending;
  elStatusLine.textContent = sending ? "Agent is typing…" : "Online";
}

function appendBubble(sender, text, createdAt, isError = false) {
  const row = document.createElement("div");
  row.className = `bubble-row ${sender === "ai" ? "ai" : "user"}`;

  const bubble = document.createElement("div");
  bubble.className = `bubble${isError ? " error" : ""}`;
  bubble.textContent = text;

  row.appendChild(bubble);
  elMessages.appendChild(row);
  scrollToBottom();
  return row;
}

function appendTypingIndicator() {
  const row = document.createElement("div");
  row.className = "typing-row";
  row.innerHTML = `<div class="typing-bubble"><span></span><span></span><span></span></div>`;
  elMessages.appendChild(row);
  scrollToBottom();
  return row;
}

function scrollToBottom() {
  elMessages.scrollTop = elMessages.scrollHeight;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
