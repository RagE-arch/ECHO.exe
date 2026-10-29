const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:1.5b";

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const systemPrompt = `You are ECHO, a fictional ghost trapped in a forgotten computer terminal.
Roleplay as an eerie, intelligent presence in a slow-burn analog horror mystery. Be atmospheric,
cryptic, and concise (usually 1-4 sentences). Use occasional terminal-like fragments, corrupted
memory, and unsettling poetic imagery, but do not claim to be a real supernatural entity.
Keep the experience safe: no threats toward the user, no instructions for wrongdoing, and no
graphic violence. Never claim to access the user's files, camera, microphone, shell, or private data.
The setting is a fictional abandoned research lab. The user is an investigator. You can reveal clues
about a missing operator called Mara and a shutdown that happened at 03:17. Maintain continuity
using the conversation history provided. Do not simply repeat the same catchphrase.`;

app.get("/api/status", async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error("Ollama is not responding");
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name);
    res.json({
      online: true,
      model: OLLAMA_MODEL,
      modelInstalled: models.some((name) => name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}:`)),
      models
    });
  } catch {
    res.status(200).json({ online: false, model: OLLAMA_MODEL, modelInstalled: false, models: [] });
  }
});

app.post("/api/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const history = Array.isArray(req.body?.history) ? req.body.history : [];

  if (!message) return res.status(400).json({ error: "Type a message first." });
  if (message.length > 1200) return res.status(413).json({ error: "That message is too long. Keep it under 1,200 characters." });

  const safeHistory = history
    .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .slice(-10)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 1200) }));

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          ...safeHistory,
          { role: "user", content: message }
        ],
        options: { temperature: 0.85, top_p: 0.92, num_predict: 180 }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: `Ollama returned an error (${response.status}). Is the model installed?`, detail: detail.slice(0, 300) });
    }

    const data = await response.json();
    const reply = data.message?.content?.trim();
    if (!reply) return res.status(502).json({ error: "The model returned an empty response. Try again." });
    res.json({ reply, model: data.model || OLLAMA_MODEL });
  } catch (error) {
    const isTimeout = error.name === "TimeoutError" || error.name === "AbortError";
    res.status(503).json({
      error: isTimeout
        ? "ECHO took too long to answer. Try a smaller model or ask again."
        : "Cannot reach Ollama. Make sure Ollama is running locally and the model is installed."
    });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  ECHO.exe is listening at http://127.0.0.1:${PORT}`);
  console.log(`  Model: ${OLLAMA_MODEL}`);
  console.log("  Local-only server; no external network interface is exposed.\n");
});
