// Baza SQLite (wbudowany moduł node:sqlite – bez dodatkowych zależności natywnych).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DEFAULT_SETTINGS } from './calc.js';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(String(password), salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      login TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',      -- 'admin' | 'employee'
      parking_share INTEGER NOT NULL DEFAULT 1,  -- czy uczestniczy w podziale parkingu
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS parking (
      month TEXT PRIMARY KEY,                     -- 'YYYY-MM'
      amount REAL NOT NULL,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,                     -- rezerwacje | sniadania | obiadokolacje | upsell
      month TEXT NOT NULL,                        -- miesiąc rozliczenia 'YYYY-MM'
      ref_no TEXT,                                -- nr rezerwacji
      guest TEXT,                                 -- gość / nazwisko / apartament prywatny / opis
      stay_from TEXT,
      stay_to TEXT,
      stay_text TEXT,                             -- pobyt w formie tekstowej (np. '12/10-13/10')
      bill_no TEXT,                               -- nr rachunku
      op_date TEXT,                               -- data księgowania (z importu)
      value REAL NOT NULL,                        -- wartość brutto
      rate REAL NOT NULL,
      vat REAL NOT NULL,
      vat_method TEXT NOT NULL,
      commission REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
      is_duplicate INTEGER NOT NULL DEFAULT 0,    -- powielona rezerwacja
      is_cancellation INTEGER NOT NULL DEFAULT 0, -- anulacja rachunku (wartość ujemna / para +/-)
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual',      -- manual | import
      import_key TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_by INTEGER REFERENCES users(id),
      decided_at TEXT,
      admin_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_entries_month ON entries(month);
    CREATE INDEX IF NOT EXISTS idx_entries_ref ON entries(category, ref_no);
    CREATE INDEX IF NOT EXISTS idx_entries_bill ON entries(category, bill_no);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_import ON entries(user_id, category, import_key) WHERE import_key IS NOT NULL;
  `);

  const insSetting = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, String(v));

  const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  if (!admins) {
    const pass = process.env.ADMIN_PASSWORD || 'admin';
    db.prepare("INSERT INTO users(login, name, password, role, parking_share) VALUES ('admin', 'Administrator', ?, 'admin', 1)")
      .run(hashPassword(pass));
    if (file !== ':memory:') console.log(`Utworzono konto administratora: login "admin", hasło "${pass}" – zmień je po zalogowaniu.`);
  }
  return db;
}

export function getSettings(db) {
  const out = {};
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
    out[key] = key === 'vat_method' ? value : Number(value);
  }
  return out;
}

// Rezerwacja o tym samym numerze w innym miesiącu (lub u innego pracownika) => "powielona".
export function refreshDuplicates(db, refNo) {
  if (!refNo) return;
  const list = db.prepare("SELECT id, user_id, month FROM entries WHERE category = 'rezerwacje' AND ref_no = ? ORDER BY month, id").all(refNo);
  const upd = db.prepare('UPDATE entries SET is_duplicate = ? WHERE id = ?');
  list.forEach((e, i) => upd.run(i === 0 ? 0 : 1, e.id));
}

// Rachunek z wartością ujemną (anulacja) – oznaczamy wszystkie wpisy z tym nr rachunku w danej kategorii,
// również dodatnie u innego pracownika.
export function refreshCancellations(db, category, billNo) {
  if (category === 'rezerwacje') return;
  if (billNo) {
    const list = db.prepare('SELECT id, value FROM entries WHERE category = ? AND bill_no = ?').all(category, billNo);
    const hasNeg = list.some((e) => e.value < 0);
    db.prepare('UPDATE entries SET is_cancellation = ? WHERE category = ? AND bill_no = ?').run(hasNeg ? 1 : 0, category, billNo);
  }
  db.prepare('UPDATE entries SET is_cancellation = 1 WHERE category = ? AND value < 0').run(category);
}
