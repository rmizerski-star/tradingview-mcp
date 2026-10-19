// Rejestr prowizji – serwer HTTP (Express + SQLite).
import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb, getSettings, hashPassword, verifyPassword, refreshDuplicates, refreshCancellations } from './lib/db.js';
import { CATEGORIES, rateFor, commission, buildSummary } from './lib/calc.js';
import { parseReservations, parseMeals } from './lib/importer.js';
import { buildWorkbook } from './lib/export.js';

const here = dirname(fileURLToPath(import.meta.url));
const SESSION_DAYS = 14;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const fail = (status, message) => { throw new HttpError(status, message); };

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const publicUser = (u) => u && ({ id: u.id, login: u.login, name: u.name, role: u.role, parking_share: !!u.parking_share, active: !!u.active });

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // --- sesja ---
  app.use((req, _res, next) => {
    const token = parseCookies(req.headers.cookie).sid;
    if (token) {
      const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1')
        .get(token, Date.now());
      if (row) { req.user = row; req.token = token; }
    }
    next();
  });

  const auth = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Zaloguj się.')));
  const admin = (req, _res, next) => (req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Tylko administrator.')));
  const isAdmin = (req) => req.user.role === 'admin';

  app.post('/api/login', (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE login = ? AND active = 1').get(text(req.body?.login).toLowerCase());
    if (!u || !verifyPassword(req.body?.password ?? '', u.password)) fail(401, 'Nieprawidłowy login lub hasło.');
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions(token, user_id, expires_at) VALUES (?, ?, ?)').run(token, u.id, Date.now() + SESSION_DAYS * 864e5);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
    res.json({ user: publicUser(u) });
  });

  app.post('/api/logout', (req, res) => {
    if (req.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), settings: getSettings(db) }));

  app.post('/api/me/password', auth, (req, res) => {
    const { old_password: oldPass, new_password: newPass } = req.body || {};
    if (!verifyPassword(oldPass ?? '', req.user.password)) fail(400, 'Obecne hasło jest nieprawidłowe.');
    if (!newPass || String(newPass).length < 6) fail(400, 'Nowe hasło musi mieć co najmniej 6 znaków.');
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(newPass), req.user.id);
    res.json({ ok: true });
  });

  // --- ustawienia ---
  app.put('/api/settings', auth, admin, (req, res) => {
    const upd = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k === 'vat_method') {
        if (!['divide', 'subtract'].includes(v)) fail(400, 'Nieprawidłowa metoda VAT.');
        upd.run(v, k);
      } else if (/^rate_|^vat$/.test(k)) {
        const n = num(v);
        if (n === null || n < 0 || n > 100) fail(400, `Nieprawidłowa wartość: ${k}`);
        upd.run(String(n), k);
      }
    }
    res.json({ settings: getSettings(db) });
  });

  // --- użytkownicy ---
  app.get('/api/users', auth, (req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY role, name').all();
    res.json({ users: (isAdmin(req) ? users : users.filter((u) => u.id === req.user.id)).map(publicUser) });
  });

  app.post('/api/users', auth, admin, (req, res) => {
    const login = text(req.body?.login).toLowerCase();
    const name = text(req.body?.name);
    const password = String(req.body?.password ?? '');
    if (!/^[a-z0-9._-]{2,40}$/.test(login)) fail(400, 'Login: 2–40 znaków (litery, cyfry, . _ -).');
    if (!name) fail(400, 'Podaj imię i nazwisko.');
    if (password.length < 6) fail(400, 'Hasło musi mieć co najmniej 6 znaków.');
    if (db.prepare('SELECT 1 FROM users WHERE login = ?').get(login)) fail(409, 'Taki login już istnieje.');
    const role = req.body?.role === 'admin' ? 'admin' : 'employee';
    const share = req.body?.parking_share === undefined ? 1 : (req.body.parking_share ? 1 : 0);
    const r = db.prepare('INSERT INTO users(login, name, password, role, parking_share) VALUES (?, ?, ?, ?, ?)')
      .run(login, name, hashPassword(password), role, share);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)) });
  });

  app.put('/api/users/:id', auth, admin, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
    if (!u) fail(404, 'Nie znaleziono użytkownika.');
    const b = req.body || {};
    const name = b.name !== undefined ? text(b.name) : u.name;
    const role = b.role !== undefined ? (b.role === 'admin' ? 'admin' : 'employee') : u.role;
    const active = b.active !== undefined ? (b.active ? 1 : 0) : u.active;
    const share = b.parking_share !== undefined ? (b.parking_share ? 1 : 0) : u.parking_share;
    if (!name) fail(400, 'Podaj imię i nazwisko.');
    if (u.role === 'admin' && (role !== 'admin' || !active)) {
      const others = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?").get(u.id).n;
      if (!others) fail(400, 'Musi pozostać co najmniej jeden aktywny administrator.');
    }
    db.prepare('UPDATE users SET name = ?, role = ?, active = ?, parking_share = ? WHERE id = ?').run(name, role, active, share, u.id);
    if (b.password) {
      if (String(b.password).length < 6) fail(400, 'Hasło musi mieć co najmniej 6 znaków.');
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(b.password), u.id);
    }
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
  });

  // --- wpisy prowizji ---
  const entryById = (id) => db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(id));

  // Właściciel wpisu: pracownik zawsze wpisuje sobie; administrator może wskazać pracownika.
  function targetUser(req, userId) {
    if (!isAdmin(req) || !userId) return req.user.id;
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(userId));
    if (!u) fail(400, 'Nie znaleziono pracownika.');
    return u.id;
  }

  function normalize(category, b) {
    if (!CATEGORIES.includes(category)) fail(400, 'Nieznana tabela prowizji.');
    const e = {
      ref_no: text(b.ref_no),
      guest: text(b.guest),
      stay_from: text(b.stay_from) || null,
      stay_to: text(b.stay_to) || null,
      stay_text: text(b.stay_text),
      bill_no: text(b.bill_no),
      op_date: text(b.op_date) || null,
      value: num(b.value),
      note: text(b.note),
    };
    if (e.value === null) fail(400, 'Podaj wartość (kwotę brutto).');
    if (category === 'rezerwacje') {
      if (!e.ref_no) fail(400, 'Podaj numer rezerwacji.');
      if (e.value < 0) fail(400, 'Wartość rezerwacji nie może być ujemna.');
    } else if (!e.guest && !e.bill_no) {
      fail(400, 'Podaj nazwisko / apartament lub nr rachunku.');
    }
    return e;
  }

  function insertEntry({ userId, createdBy, category, month, e, source = 'manual', importKey = null }) {
    if (!MONTH.test(month)) fail(400, 'Nieprawidłowy miesiąc (RRRR-MM).');
    if (category === 'rezerwacje' && db.prepare("SELECT 1 FROM entries WHERE category = 'rezerwacje' AND ref_no = ? AND user_id = ? AND month = ? AND status <> 'rejected'").get(e.ref_no, userId, month)) {
      fail(409, `Rezerwacja ${e.ref_no} jest już wpisana w tym miesiącu.`);
    }
    const s = getSettings(db);
    const rate = rateFor(category, s);
    const r = db.prepare(`INSERT INTO entries(user_id, category, month, ref_no, guest, stay_from, stay_to, stay_text, bill_no, op_date, value,
        rate, vat, vat_method, commission, note, source, import_key, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, category, month, e.ref_no, e.guest, e.stay_from, e.stay_to, e.stay_text, e.bill_no, e.op_date, e.value,
        rate, s.vat, s.vat_method, commission(e.value, rate, s.vat, s.vat_method), e.note, source, importKey, createdBy);
    refreshDuplicates(db, category === 'rezerwacje' ? e.ref_no : null);
    refreshCancellations(db, category, e.bill_no);
    return Number(r.lastInsertRowid);
  }

  const listSql = `SELECT e.*, u.name AS user_name FROM entries e JOIN users u ON u.id = e.user_id`;

  app.get('/api/entries', auth, (req, res) => {
    const where = [];
    const args = [];
    const { month, category, status, user_id: userId } = req.query;
    if (month) { where.push('e.month = ?'); args.push(String(month)); }
    if (category) { where.push('e.category = ?'); args.push(String(category)); }
    if (status) { where.push('e.status = ?'); args.push(String(status)); }
    if (!isAdmin(req)) { where.push('e.user_id = ?'); args.push(req.user.id); }
    else if (userId) { where.push('e.user_id = ?'); args.push(Number(userId)); }
    const sql = `${listSql}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY e.category, u.name, COALESCE(e.op_date, e.stay_from, e.created_at), e.id`;
    res.json({ entries: db.prepare(sql).all(...args) });
  });

  app.post('/api/entries', auth, (req, res) => {
    const b = req.body || {};
    const id = insertEntry({
      userId: targetUser(req, b.user_id), createdBy: req.user.id, category: b.category, month: text(b.month), e: normalize(b.category, b),
    });
    res.json({ entry: entryById(id) });
  });

  app.put('/api/entries/:id', auth, (req, res) => {
    const old = entryById(req.params.id);
    if (!old) fail(404, 'Nie znaleziono wpisu.');
    if (!isAdmin(req) && (old.user_id !== req.user.id || old.status !== 'pending')) fail(403, 'Możesz edytować tylko własne, niezatwierdzone wpisy.');
    const e = normalize(old.category, { ...old, ...req.body });
    const month = req.body?.month ? text(req.body.month) : old.month;
    if (!MONTH.test(month)) fail(400, 'Nieprawidłowy miesiąc (RRRR-MM).');
    const comm = commission(e.value, old.rate, old.vat, old.vat_method);
    db.prepare(`UPDATE entries SET month = ?, ref_no = ?, guest = ?, stay_from = ?, stay_to = ?, stay_text = ?, bill_no = ?, value = ?, commission = ?, note = ?
      WHERE id = ?`).run(month, e.ref_no, e.guest, e.stay_from, e.stay_to, e.stay_text, e.bill_no, e.value, comm, e.note, old.id);
    for (const ref of new Set([old.ref_no, e.ref_no])) if (old.category === 'rezerwacje') refreshDuplicates(db, ref);
    for (const bill of new Set([old.bill_no, e.bill_no])) refreshCancellations(db, old.category, bill);
    res.json({ entry: entryById(old.id) });
  });

  app.delete('/api/entries/:id', auth, (req, res) => {
    const old = entryById(req.params.id);
    if (!old) fail(404, 'Nie znaleziono wpisu.');
    if (!isAdmin(req) && (old.user_id !== req.user.id || old.status !== 'pending')) fail(403, 'Możesz usuwać tylko własne, niezatwierdzone wpisy.');
    db.prepare('DELETE FROM entries WHERE id = ?').run(old.id);
    if (old.category === 'rezerwacje') refreshDuplicates(db, old.ref_no);
    refreshCancellations(db, old.category, old.bill_no);
    res.json({ ok: true });
  });

  // Zatwierdzenie / anulowanie (także zbiorcze) – tylko administrator.
  app.post('/api/entries/decide', auth, admin, (req, res) => {
    const ids = (req.body?.ids || []).map(Number).filter(Boolean);
    const status = req.body?.status;
    if (!['approved', 'rejected', 'pending'].includes(status)) fail(400, 'Nieprawidłowy status.');
    if (!ids.length) fail(400, 'Nie wybrano wpisów.');
    const upd = db.prepare("UPDATE entries SET status = ?, decided_by = ?, decided_at = datetime('now'), admin_note = COALESCE(?, admin_note) WHERE id = ?");
    const note = req.body?.admin_note ? text(req.body.admin_note) : null;
    for (const id of ids) upd.run(status, status === 'pending' ? null : req.user.id, note, id);
    res.json({ updated: ids.length });
  });

  // --- import z Excela ---
  // Krok 1: podgląd – plik wysyłany jako surowe body (application/octet-stream).
  app.post('/api/import/preview', auth, express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
    const kind = req.query.kind;
    if (!Buffer.isBuffer(req.body) || !req.body.length) fail(400, 'Brak pliku.');
    let parsed;
    try {
      parsed = kind === 'rezerwacje' ? await parseReservations(req.body) : await parseMeals(req.body);
    } catch (err) {
      fail(400, `Nie udało się odczytać pliku Excel: ${err.message}`);
    }
    const userId = targetUser(req, req.query.user_id);
    const month = MONTH.test(String(req.query.month)) ? String(req.query.month) : parsed.suggestedMonth;
    const category = kind === 'rezerwacje' ? 'rezerwacje' : (CATEGORIES.includes(kind) ? kind : parsed.suggestedCategory);
    for (const r of parsed.rows) {
      if (category === 'rezerwacje') {
        const prev = db.prepare("SELECT e.month, u.name FROM entries e JOIN users u ON u.id = e.user_id WHERE e.category = 'rezerwacje' AND e.ref_no = ? ORDER BY e.month LIMIT 1").get(r.ref_no);
        r.duplicate_of = prev ? `${prev.month} (${prev.name})` : null;
      } else if (category) {
        r.cancellation = r.value < 0 || !!(r.bill_no && db.prepare('SELECT 1 FROM entries WHERE category = ? AND bill_no = ? AND value < 0').get(category, r.bill_no));
      }
      const key = category === 'rezerwacje' ? `${month}|${r.ref_no}` : r.import_key;
      r.already_imported = !!(category && db.prepare('SELECT 1 FROM entries WHERE user_id = ? AND category = ? AND import_key = ?').get(userId, category, key));
    }
    res.json({ ...parsed, category, month });
  });

  // Krok 2: zapis wierszy (po uzupełnieniu wartości / nr rachunku w podglądzie).
  app.post('/api/import/commit', auth, (req, res) => {
    const { category, month, rows = [] } = req.body || {};
    if (!CATEGORIES.includes(category)) fail(400, 'Wybierz tabelę docelową.');
    if (!MONTH.test(String(month))) fail(400, 'Wybierz miesiąc rozliczenia.');
    const userId = targetUser(req, req.body.user_id);
    const result = { added: 0, skipped: [], errors: [] };
    db.exec('BEGIN');
    try {
      for (const r of rows) {
        const key = category === 'rezerwacje' ? `${month}|${text(r.ref_no)}` : text(r.import_key) || null;
        const label = r.ref_no || r.bill_no || r.guest || '?';
        if (key && db.prepare('SELECT 1 FROM entries WHERE user_id = ? AND category = ? AND import_key = ?').get(userId, category, key)) {
          result.skipped.push(`${label}: już zaimportowano`);
          continue;
        }
        try {
          insertEntry({ userId, createdBy: req.user.id, category, month, e: normalize(category, r), source: 'import', importKey: key });
          result.added++;
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          result.errors.push(`${label}: ${err.message}`);
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json(result);
  });

  // --- parking ---
  app.get('/api/parking/:month', auth, (req, res) => {
    res.json({ parking: db.prepare('SELECT * FROM parking WHERE month = ?').get(req.params.month) || { month: req.params.month, amount: 0 } });
  });

  app.put('/api/parking/:month', auth, admin, (req, res) => {
    if (!MONTH.test(req.params.month)) fail(400, 'Nieprawidłowy miesiąc.');
    const amount = num(req.body?.amount);
    if (amount === null || amount < 0) fail(400, 'Podaj kwotę prowizji za parking.');
    db.prepare('INSERT INTO parking(month, amount, note) VALUES (?, ?, ?) ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, note = excluded.note')
      .run(req.params.month, amount, text(req.body?.note));
    res.json({ ok: true });
  });

  // --- podsumowanie i eksport ---
  function summaryData(req, month) {
    if (!MONTH.test(String(month))) fail(400, 'Nieprawidłowy miesiąc.');
    const users = db.prepare('SELECT * FROM users ORDER BY name').all();
    const entries = db.prepare(`${listSql} WHERE e.month = ? ORDER BY e.category, u.name, COALESCE(e.op_date, e.stay_from), e.id`).all(month);
    const parking = db.prepare('SELECT amount FROM parking WHERE month = ?').get(month)?.amount || 0;
    const summary = buildSummary(users, entries, parking);
    if (isAdmin(req)) return { summary, entries };
    const own = summary.rows.filter((r) => r.user_id === req.user.id);
    return { summary: { rows: own, totals: null, parking: summary.parking }, entries: entries.filter((e) => e.user_id === req.user.id) };
  }

  app.get('/api/summary', auth, (req, res) => res.json(summaryData(req, req.query.month).summary));

  app.get('/api/export', auth, async (req, res) => {
    const month = String(req.query.month);
    const { summary, entries } = summaryData(req, month);
    if (!summary.totals) {
      const r = summary.rows[0];
      summary.totals = r ? { cat: r.cat, parking: r.parking, total: r.total, pending: r.pending } : null;
    }
    const buf = await buildWorkbook({ month, summary, entries, settings: getSettings(db) });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="prowizje-${month}.xlsx"`);
    res.send(Buffer.from(buf));
  });

  app.use(express.static(join(here, 'public')));

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Błąd serwera.' : err.message });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(process.env.DB_FILE || join(here, 'data', 'prowizje.db'));
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  createApp(db).listen(port, host, () => console.log(`Rejestr prowizji działa: http://localhost:${port}`));
}
