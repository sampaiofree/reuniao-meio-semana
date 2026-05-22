import Database from "better-sqlite3";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "app.sqlite");
const STATE_ID = "main";

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const getState = db.prepare("SELECT data, updated_at FROM app_state WHERE id = ?");
const deleteState = db.prepare("DELETE FROM app_state WHERE id = ?");
const saveState = db.prepare(`
  INSERT INTO app_state (id, data, updated_at)
  VALUES (@id, @data, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const row = getState.get(STATE_ID);
  if (!row) {
    res.json({ state: null, updatedAt: null });
    return;
  }

  try {
    res.json({ state: JSON.parse(row.data), updatedAt: row.updated_at });
  } catch (error) {
    console.error("Failed to parse stored app state.", error);
    res.status(500).json({ error: "Stored state is invalid." });
  }
});

app.put("/api/state", (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "Expected JSON object body." });
    return;
  }

  const updatedAt = new Date().toISOString();
  saveState.run({
    id: STATE_ID,
    data: JSON.stringify(req.body),
    updated_at: updatedAt
  });

  res.json({ ok: true, updatedAt });
});

app.delete("/api/state", (req, res) => {
  deleteState.run(STATE_ID);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "dist")));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});
