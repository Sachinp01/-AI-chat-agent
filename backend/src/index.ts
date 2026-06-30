import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "path";
import { runMigrations } from "./db";
import { chatRouter } from "./routes/chat";

runMigrations();

const app = express();

app.use(cors());
// Cap body size so a malicious/huge payload can't take the process down.
app.use(express.json({ limit: "200kb" }));

app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }));

app.use("/chat", chatRouter);

// Serve the static frontend if it's been built/copied alongside the backend
// (useful for single-service deploys). Harmless no-op otherwise.
const frontendDist = path.join(__dirname, "..", "public");
app.use(express.static(frontendDist));

// JSON 404 for unknown API routes (keeps error shape consistent for the UI).
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/chat") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "Not found." });
  }
  next();
});

// Catch-all error handler — last line of defense so a thrown error never
// crashes the process or leaks a stack trace to the client.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Spur chat agent backend listening on http://localhost:${PORT}`);
});

// Belt-and-suspenders: never let an unexpected promise rejection kill the
// server silently in production.
process.on("unhandledRejection", (reason: unknown) => {
  console.error("Unhandled promise rejection:", reason);
});
