import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "data", "voxenor.db");
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ──────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL DEFAULT '',
    plan            TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id    TEXT,
    stripe_subscription_id TEXT,
    subscription_status    TEXT DEFAULT 'none',
    subscription_current_period_end INTEGER,
    agreed_terms_at TEXT,
    agreed_privacy_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    source_language    TEXT NOT NULL DEFAULT 'auto',
    listener_language  TEXT NOT NULL DEFAULT 'en',
    audiobook_language TEXT NOT NULL DEFAULT 'pt-pt',
    selected_voice_id  TEXT NOT NULL DEFAULT 'storybook',
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS saved_words (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source          TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    source_language TEXT NOT NULL DEFAULT 'auto',
    target_language TEXT NOT NULL DEFAULT 'en',
    book_id         TEXT DEFAULT '',
    book_title      TEXT DEFAULT '',
    page_index      INTEGER DEFAULT 0,
    context         TEXT DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_saved_words_user ON saved_words(user_id);
`);

// ── Session management (30 days) ────────────────────────────

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export function createSession(userId) {
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expiresAt);
  return { id, expiresAt };
}

export function getSession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare(
    "SELECT s.id, s.user_id, s.expires_at, u.email, u.name, u.plan, u.stripe_customer_id, u.stripe_subscription_id, u.subscription_status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
  ).get(sessionId, Date.now());
  return row || null;
}

export function deleteSession(sessionId) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function deleteUserSessions(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function cleanExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

// ── User CRUD ───────────────────────────────────────────────

export function createUser({ email, passwordHash, name }) {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, name, agreed_terms_at, agreed_privacy_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))"
  ).run(id, email.trim().toLowerCase(), passwordHash, name.trim());
  db.prepare(
    "INSERT INTO user_preferences (user_id) VALUES (?)"
  ).run(id);
  return getUserById(id);
}

export function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) || null;
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

export function updateUser(id, fields) {
  const allowed = ["name", "plan", "stripe_customer_id", "stripe_subscription_id", "subscription_status", "subscription_current_period_end"];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function getUserByStripeCustomerId(customerId) {
  return db.prepare("SELECT * FROM users WHERE stripe_customer_id = ?").get(customerId) || null;
}

// ── User Preferences ────────────────────────────────────────

export function getUserPreferences(userId) {
  return db.prepare("SELECT * FROM user_preferences WHERE user_id = ?").get(userId) || null;
}

export function setUserPreferences(userId, prefs) {
  const allowed = ["source_language", "listener_language", "audiobook_language", "selected_voice_id"];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (key in prefs) {
      sets.push(`${key} = ?`);
      values.push(prefs[key]);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(userId);
  db.prepare(`UPDATE user_preferences SET ${sets.join(", ")} WHERE user_id = ?`).run(...values);
}

// ── Saved Words ─────────────────────────────────────────────

export function getSavedWords(userId) {
  return db.prepare("SELECT * FROM saved_words WHERE user_id = ? ORDER BY created_at DESC").all(userId);
}

export function addSavedWord(userId, word) {
  const id = word.id || crypto.randomUUID();
  db.prepare(
    `INSERT INTO saved_words (id, user_id, source, translated_text, source_language, target_language, book_id, book_title, page_index, context)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, word.source, word.translatedText, word.sourceLanguage || "auto", word.targetLanguage || "en", word.bookId || "", word.bookTitle || "", word.pageIndex || 0, word.context || "");
  return id;
}

export function deleteSavedWord(userId, wordId) {
  const info = db.prepare("DELETE FROM saved_words WHERE id = ? AND user_id = ?").run(wordId, userId);
  return info.changes > 0;
}

// ── Plan helpers ────────────────────────────────────────────

export function userHasPremium(user) {
  if (!user) return false;
  if (user.plan === "premium") return true;
  if (user.subscription_status === "active" || user.subscription_status === "trialing") return true;
  return false;
}

export function getUserBookCount(userId) {
  // Count library dirs belonging to this user (stored in user_books table or by convention)
  // For now we track via a simple mapping table
  const row = db.prepare("SELECT COUNT(*) as count FROM user_books WHERE user_id = ?").get(userId);
  return row?.count || 0;
}

// ── User-Book ownership ─────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS user_books (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, book_id)
  );
`);

export function linkBookToUser(userId, bookId) {
  db.prepare("INSERT OR IGNORE INTO user_books (user_id, book_id) VALUES (?, ?)").run(userId, bookId);
}

export function unlinkBookFromUser(userId, bookId) {
  db.prepare("DELETE FROM user_books WHERE user_id = ? AND book_id = ?").run(userId, bookId);
}

export function getUserBookIds(userId) {
  return db.prepare("SELECT book_id FROM user_books WHERE user_id = ?").all(userId).map(r => r.book_id);
}

export function isUserBook(userId, bookId) {
  return !!db.prepare("SELECT 1 FROM user_books WHERE user_id = ? AND book_id = ?").get(userId, bookId);
}

// ── Cleanup ─────────────────────────────────────────────────

// Periodically clean expired sessions (run every hour or so)
setInterval(() => cleanExpiredSessions(), 1000 * 60 * 60);

export default db;
