import Database from "better-sqlite3";
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_COOKIE = "midweek_session";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith("#") || process.env[match[1]] !== undefined) return;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  });
}

const normalizeUsername = value => String(value || "").trim().toLocaleLowerCase("pt-BR");
const normalizeCongregationName = value => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
}

function verifyPassword(password, encodedHash) {
  try {
    const [algorithm, saltText, hashText] = String(encodedHash).split("$");
    if (algorithm !== "scrypt" || !saltText || !hashText) return false;
    const storedHash = Buffer.from(hashText, "base64");
    const candidate = crypto.scryptSync(password, Buffer.from(saltText, "base64"), storedHash.length);
    return storedHash.length === candidate.length && crypto.timingSafeEqual(storedHash, candidate);
  } catch {
    return false;
  }
}

const hashSessionToken = token => crypto.createHash("sha256").update(token).digest("hex");

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator === -1) return cookies;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function validateUsername(username) {
  const clean = String(username || "").trim();
  if (clean.length < 3 || clean.length > 50) return "O usuário deve ter entre 3 e 50 caracteres.";
  if (!/^[\p{L}\p{N}._-]+$/u.test(clean)) return "Use apenas letras, números, ponto, hífen ou sublinhado no usuário.";
  return null;
}

const validatePassword = password => typeof password === "string" && password.length >= 8
  ? null
  : "A senha deve ter pelo menos 8 caracteres.";

function validateCongregationName(name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  return !clean || clean.length > 100 ? "Informe um nome de congregação com até 100 caracteres." : null;
}

function initializeSchema(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS congregations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      is_initial INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS congregation_access (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      congregation_id INTEGER NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, congregation_id)
    );
    CREATE TABLE IF NOT EXISTS congregation_state (
      congregation_id INTEGER PRIMARY KEY REFERENCES congregations(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_access_congregation ON congregation_access(congregation_id);
  `);

  if (db.prepare("SELECT 1 FROM schema_migrations WHERE version = 1").get()) return;
  db.transaction(() => {
    const now = new Date().toISOString();
    let initial = db.prepare("SELECT id FROM congregations WHERE is_initial = 1").get();
    if (!initial) {
      const existing = db.prepare("SELECT id FROM congregations WHERE name_normalized = ?").get(normalizeCongregationName("Meaípe"));
      if (existing) {
        db.prepare("UPDATE congregations SET is_initial = 1, updated_at = ? WHERE id = ?").run(now, existing.id);
        initial = existing;
      } else {
        const result = db.prepare(`
          INSERT INTO congregations (name, name_normalized, active, is_initial, created_at, updated_at)
          VALUES (?, ?, 1, 1, ?, ?)
        `).run("Meaípe", normalizeCongregationName("Meaípe"), now, now);
        initial = { id: Number(result.lastInsertRowid) };
      }
    }
    const legacy = db.prepare("SELECT data, updated_at FROM app_state WHERE id = 'main'").get();
    const existingState = db.prepare("SELECT 1 FROM congregation_state WHERE congregation_id = ?").get(initial.id);
    if (legacy && !existingState) {
      db.prepare("INSERT INTO congregation_state (congregation_id, data, updated_at) VALUES (?, ?, ?)")
        .run(initial.id, legacy.data, legacy.updated_at);
    }
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(now);
  })();
}

function bootstrapAdmin(db, username, password) {
  const usernameError = validateUsername(username);
  const passwordError = validatePassword(password);
  if (usernameError || passwordError) throw new Error(`Credenciais administrativas inválidas: ${usernameError || passwordError}`);
  const cleanUsername = username.trim();
  const normalized = normalizeUsername(cleanUsername);
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM users WHERE username_normalized = ?").get(normalized);
  if (!existing) {
    db.prepare(`INSERT INTO users (username, username_normalized, password_hash, role, active, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 1, ?, ?)`)
      .run(cleanUsername, normalized, hashPassword(password), now, now);
    return;
  }
  const passwordChanged = !verifyPassword(password, existing.password_hash);
  db.prepare(`UPDATE users SET username = ?, role = 'admin', active = 1, password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(cleanUsername, passwordChanged ? hashPassword(password) : existing.password_hash, now, existing.id);
  if (passwordChanged) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
}

const toCongregation = row => ({ id: row.id, name: row.name, active: Boolean(row.active), isInitial: Boolean(row.is_initial) });
const toPublicUser = (row, congregationIds = []) => ({
  id: row.id,
  username: row.username,
  role: row.role,
  active: Boolean(row.active),
  congregationIds
});

export function createApplication({
  dbPath = path.join(__dirname, "data", "app.sqlite"),
  adminUsername = process.env.ADMIN_USERNAME,
  adminPassword = process.env.ADMIN_PASSWORD,
  isProduction = process.env.NODE_ENV === "production",
  distDir = path.join(__dirname, "dist")
} = {}) {
  if (!adminUsername || !adminPassword) throw new Error("Defina ADMIN_USERNAME e ADMIN_PASSWORD antes de iniciar a aplicação.");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  initializeSchema(db);
  bootstrapAdmin(db, adminUsername, adminPassword);
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  const cookieOptions = { httpOnly: true, sameSite: "strict", secure: isProduction, path: "/" };
  const clearSessionCookie = res => res.clearCookie(SESSION_COOKIE, cookieOptions);
  const getAccessibleCongregations = user => {
    const rows = user.role === "admin"
      ? db.prepare("SELECT * FROM congregations WHERE active = 1 ORDER BY name COLLATE NOCASE").all()
      : db.prepare(`SELECT c.* FROM congregations c JOIN congregation_access ca ON ca.congregation_id = c.id
          WHERE ca.user_id = ? AND c.active = 1 ORDER BY c.name COLLATE NOCASE`).all(user.id);
    return rows.map(toCongregation);
  };

  const authenticate = (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) { req.user = null; next(); return; }
    const now = new Date().toISOString();
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    const user = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).get(hashSessionToken(token), now);
    if (!user) clearSessionCookie(res);
    req.user = user || null;
    req.sessionToken = user ? token : null;
    next();
  };
  const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Autenticação necessária." });
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Autenticação necessária." });
    if (req.user.role !== "admin") return res.status(403).json({ error: "Acesso exclusivo do administrador." });
    next();
  };
  const requireCongregationAccess = (req, res, next) => {
    const id = Number(req.params.id);
    const congregation = Number.isInteger(id) ? db.prepare("SELECT * FROM congregations WHERE id = ?").get(id) : null;
    if (!congregation || !congregation.active) return res.status(404).json({ error: "Congregação não encontrada ou desativada." });
    if (req.user.role !== "admin" && !db.prepare("SELECT 1 FROM congregation_access WHERE user_id = ? AND congregation_id = ?").get(req.user.id, id)) {
      return res.status(403).json({ error: "Você não possui acesso a esta congregação." });
    }
    req.congregation = congregation;
    next();
  };

  app.use(authenticate);
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.post("/api/auth/login", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE username_normalized = ? AND active = 1").get(normalizeUsername(req.body?.username));
    if (!user || typeof req.body?.password !== "string" || !verifyPassword(req.body.password, user.password_hash)) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .run(hashSessionToken(token), user.id, new Date(now.getTime() + SESSION_DURATION_MS).toISOString(), now.toISOString());
    res.cookie(SESSION_COOKIE, token, cookieOptions);
    res.json({ user: toPublicUser(user), congregations: getAccessibleCongregations(user) });
  });
  app.get("/api/auth/me", requireAuth, (req, res) => res.json({
    user: toPublicUser(req.user), congregations: getAccessibleCongregations(req.user)
  }));
  app.post("/api/auth/logout", requireAuth, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(req.sessionToken));
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/congregations/:id/state", requireAuth, requireCongregationAccess, (req, res) => {
    const row = db.prepare("SELECT data, updated_at FROM congregation_state WHERE congregation_id = ?").get(req.congregation.id);
    if (!row) return res.json({ state: null, updatedAt: null, congregation: toCongregation(req.congregation) });
    try {
      res.json({ state: JSON.parse(row.data), updatedAt: row.updated_at, congregation: toCongregation(req.congregation) });
    } catch (error) {
      console.error("Failed to parse stored congregation state.", error);
      res.status(500).json({ error: "Os dados armazenados desta congregação são inválidos." });
    }
  });
  app.put("/api/congregations/:id/state", requireAuth, requireCongregationAccess, (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ error: "Era esperado um objeto JSON." });
    const updatedAt = new Date().toISOString();
    db.prepare(`INSERT INTO congregation_state (congregation_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(congregation_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(req.congregation.id, JSON.stringify(req.body), updatedAt);
    res.json({ ok: true, updatedAt });
  });

  app.get("/api/admin/congregations", requireAdmin, (req, res) => {
    const congregations = db.prepare("SELECT * FROM congregations ORDER BY active DESC, name COLLATE NOCASE").all();
    const accessRows = db.prepare("SELECT congregation_id, user_id FROM congregation_access").all();
    res.json({ congregations: congregations.map(row => ({
      ...toCongregation(row),
      userIds: accessRows.filter(access => access.congregation_id === row.id).map(access => access.user_id)
    })) });
  });
  app.post("/api/admin/congregations", requireAdmin, (req, res, next) => {
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    const error = validateCongregationName(name);
    if (error) return res.status(400).json({ error });
    const newUser = req.body?.newUser;
    if (newUser && (newUser.username || newUser.password)) {
      const userError = validateUsername(newUser.username) || validatePassword(newUser.password);
      if (userError) return res.status(400).json({ error: userError });
      if (db.prepare("SELECT 1 FROM users WHERE username_normalized = ?").get(normalizeUsername(newUser.username))) {
        return res.status(409).json({ error: "Este usuário já está cadastrado. Selecione-o na lista de acessos." });
      }
    }
    const userIds = Array.isArray(req.body?.userIds) ? [...new Set(req.body.userIds.map(Number).filter(Number.isInteger))] : [];
    try {
      const congregation = db.transaction(() => {
        const now = new Date().toISOString();
        const result = db.prepare(`INSERT INTO congregations (name, name_normalized, active, is_initial, created_at, updated_at)
          VALUES (?, ?, 1, 0, ?, ?)`).run(name, normalizeCongregationName(name), now, now);
        const id = Number(result.lastInsertRowid);
        const add = db.prepare(`INSERT OR IGNORE INTO congregation_access (user_id, congregation_id, created_at)
          SELECT id, ?, ? FROM users WHERE id = ? AND role = 'user'`);
        userIds.forEach(userId => add.run(id, now, userId));
        if (newUser && (newUser.username || newUser.password)) {
          const createdUser = db.prepare(`INSERT INTO users (username, username_normalized, password_hash, role, active, created_at, updated_at)
            VALUES (?, ?, ?, 'user', 1, ?, ?)`)
            .run(newUser.username.trim(), normalizeUsername(newUser.username), hashPassword(newUser.password), now, now);
          add.run(id, now, Number(createdUser.lastInsertRowid));
        }
        return db.prepare("SELECT * FROM congregations WHERE id = ?").get(id);
      })();
      res.status(201).json({ congregation: { ...toCongregation(congregation), userIds } });
    } catch (caught) {
      if (caught.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Já existe uma congregação com este nome." });
      next(caught);
    }
  });
  app.patch("/api/admin/congregations/:id", requireAdmin, (req, res, next) => {
    const id = Number(req.params.id);
    const current = db.prepare("SELECT * FROM congregations WHERE id = ?").get(id);
    if (!current) return res.status(404).json({ error: "Congregação não encontrada." });
    const name = req.body?.name === undefined ? current.name : String(req.body.name).trim().replace(/\s+/g, " ");
    const error = validateCongregationName(name);
    if (error) return res.status(400).json({ error });
    const active = req.body?.active === undefined ? current.active : (req.body.active ? 1 : 0);
    try {
      db.prepare("UPDATE congregations SET name = ?, name_normalized = ?, active = ?, updated_at = ? WHERE id = ?")
        .run(name, normalizeCongregationName(name), active, new Date().toISOString(), id);
      res.json({ congregation: toCongregation(db.prepare("SELECT * FROM congregations WHERE id = ?").get(id)) });
    } catch (caught) {
      if (caught.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Já existe uma congregação com este nome." });
      next(caught);
    }
  });
  app.put("/api/admin/congregations/:id/access", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare("SELECT 1 FROM congregations WHERE id = ?").get(id)) return res.status(404).json({ error: "Congregação não encontrada." });
    if (!Array.isArray(req.body?.userIds)) return res.status(400).json({ error: "Informe a lista de usuários." });
    const ids = [...new Set(req.body.userIds.map(Number).filter(Number.isInteger))];
    db.transaction(() => {
      db.prepare("DELETE FROM congregation_access WHERE congregation_id = ?").run(id);
      const now = new Date().toISOString();
      const add = db.prepare(`INSERT OR IGNORE INTO congregation_access (user_id, congregation_id, created_at)
        SELECT id, ?, ? FROM users WHERE id = ? AND role = 'user'`);
      ids.forEach(userId => add.run(id, now, userId));
    })();
    const savedIds = db.prepare("SELECT user_id FROM congregation_access WHERE congregation_id = ?").all(id).map(row => row.user_id);
    res.json({ ok: true, userIds: savedIds });
  });

  app.get("/api/admin/users", requireAdmin, (req, res) => {
    const users = db.prepare("SELECT * FROM users WHERE role = 'user' ORDER BY active DESC, username COLLATE NOCASE").all();
    const accessRows = db.prepare("SELECT user_id, congregation_id FROM congregation_access").all();
    res.json({ users: users.map(user => toPublicUser(user,
      accessRows.filter(access => access.user_id === user.id).map(access => access.congregation_id))) });
  });
  app.post("/api/admin/users", requireAdmin, (req, res, next) => {
    const username = String(req.body?.username || "").trim();
    const usernameError = validateUsername(username);
    const passwordError = validatePassword(req.body?.password);
    if (usernameError || passwordError) return res.status(400).json({ error: usernameError || passwordError });
    const ids = Array.isArray(req.body?.congregationIds) ? [...new Set(req.body.congregationIds.map(Number).filter(Number.isInteger))] : [];
    try {
      const user = db.transaction(() => {
        const now = new Date().toISOString();
        const result = db.prepare(`INSERT INTO users (username, username_normalized, password_hash, role, active, created_at, updated_at)
          VALUES (?, ?, ?, 'user', 1, ?, ?)`).run(username, normalizeUsername(username), hashPassword(req.body.password), now, now);
        const id = Number(result.lastInsertRowid);
        const add = db.prepare(`INSERT OR IGNORE INTO congregation_access (user_id, congregation_id, created_at)
          SELECT ?, id, ? FROM congregations WHERE id = ?`);
        ids.forEach(congregationId => add.run(id, now, congregationId));
        return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      })();
      res.status(201).json({ user: toPublicUser(user, ids) });
    } catch (caught) {
      if (caught.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Este usuário já está cadastrado." });
      next(caught);
    }
  });
  app.patch("/api/admin/users/:id", requireAdmin, (req, res, next) => {
    const id = Number(req.params.id);
    const current = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'user'").get(id);
    if (!current) return res.status(404).json({ error: "Usuário não encontrado." });
    const username = req.body?.username === undefined ? current.username : String(req.body.username).trim();
    const error = validateUsername(username);
    if (error) return res.status(400).json({ error });
    const active = req.body?.active === undefined ? current.active : (req.body.active ? 1 : 0);
    try {
      db.transaction(() => {
        db.prepare("UPDATE users SET username = ?, username_normalized = ?, active = ?, updated_at = ? WHERE id = ?")
          .run(username, normalizeUsername(username), active, new Date().toISOString(), id);
        if (!active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      })();
      res.json({ user: toPublicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
    } catch (caught) {
      if (caught.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Este usuário já está cadastrado." });
      next(caught);
    }
  });
  app.post("/api/admin/users/:id/password", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const error = validatePassword(req.body?.password);
    if (error) return res.status(400).json({ error });
    if (!db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'user'").get(id)) return res.status(404).json({ error: "Usuário não encontrado." });
    db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .run(hashPassword(req.body.password), new Date().toISOString(), id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    })();
    res.json({ ok: true });
  });
  app.put("/api/admin/users/:id/access", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'user'").get(id)) return res.status(404).json({ error: "Usuário não encontrado." });
    if (!Array.isArray(req.body?.congregationIds)) return res.status(400).json({ error: "Informe a lista de congregações." });
    const ids = [...new Set(req.body.congregationIds.map(Number).filter(Number.isInteger))];
    db.transaction(() => {
      db.prepare("DELETE FROM congregation_access WHERE user_id = ?").run(id);
      const now = new Date().toISOString();
      const add = db.prepare(`INSERT OR IGNORE INTO congregation_access (user_id, congregation_id, created_at)
        SELECT ?, id, ? FROM congregations WHERE id = ?`);
      ids.forEach(congregationId => add.run(id, now, congregationId));
    })();
    const savedIds = db.prepare("SELECT congregation_id FROM congregation_access WHERE user_id = ?").all(id).map(row => row.congregation_id);
    res.json({ ok: true, congregationIds: savedIds });
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint não encontrado." }));
  app.use(express.static(distDir));
  app.get(/.*/, (req, res) => res.sendFile("index.html", { root: distDir }));
  app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Erro interno do servidor." });
  });
  return { app, db, close: () => db.close() };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  loadLocalEnv(path.join(__dirname, ".env"));
  const PORT = process.env.PORT || 3000;
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
  const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "app.sqlite");
  const { app } = createApplication({ dbPath: DB_PATH });
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
  });
}
