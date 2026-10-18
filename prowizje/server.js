import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.js';
import { hashPassword, verifyPassword, newToken, newId, parseCookies, createLoginLimiter } from './lib/auth.js';
import { parseWorkbook } from './lib/excel.js';
import { TYPES, DEF_SET, r2, hasVal } from './public/calc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_MS = 7 * 24 * 3600 * 1000;
const PERIOD_RE = /^\d{4}-\d{2}$/;
const LOGIN_RE = /^[a-z0-9._-]{2,32}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = msg => new HttpError(400, msg);

const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const ymd = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');

// Normalizuje pozycję z formularza lub importu; rzuca 400 przy błędnych danych.
export function cleanEntry(inp) {
  const t = inp.t;
  if (!TYPES[t]) throw bad('Nieznana kategoria.');
  let val = inp.val === null || inp.val === undefined || inp.val === '' ? null : Number(inp.val);
  if (val !== null && (!isFinite(val) || val === 0 || Math.abs(val) > 1e8)) throw bad('Nieprawidłowa kwota.');
  if (val !== null) val = r2(val);
  if (val === null && t !== 'rez') throw bad('Podaj kwotę.');
  const isRez = t === 'rez';
  const e = {
    t, val,
    bill: str(inp.bill, 40), guest: str(inp.guest, 80), note: str(inp.note, 140),
    resNo: isRez ? str(inp.resNo, 30) : '',
    from: isRez ? ymd(inp.from) : '', to: isRez ? ymd(inp.to) : '',
    d: isRez ? ymd(inp.from) : ymd(inp.d),
    room: isRez ? '' : str(inp.room, 20), stay: isRez ? '' : str(inp.stay, 30),
  };
  if (isRez && !e.resNo && !e.guest) throw bad('Podaj nr rezerwacji lub gościa.');
  return e;
}

const publicUser = u => ({ id: u.id, login: u.login, name: u.name, role: u.role, active: u.active });

export function createApp(db, { secureCookie = false } = {}) {
  const D = db.data;
  if (!D.settings) D.settings = structuredClone(DEF_SET);
  const limiter = createLoginLimiter();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
  app.use('/api', express.json({ limit: '2mb' }));

  // Ochrona przed CSRF: zapytania zmieniające dane muszą mieć nagłówek, którego obca strona nie wyśle bez CORS.
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.get('x-requested-with') !== 'prowizje') return next(new HttpError(403, 'Zabronione.'));
    next();
  });

  function startSession(res, user) {
    const now = Date.now();
    for (const [k, s] of Object.entries(D.sessions)) if (s.exp < now) delete D.sessions[k];
    const token = newToken();
    D.sessions[token] = { uid: user.id, exp: now + SESSION_MS };
    db.save();
    res.set('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secureCookie ? '; Secure' : ''}`);
  }

  function auth(req, res, next) {
    const token = parseCookies(req.headers.cookie).sid;
    const s = token && D.sessions[token];
    const user = s && s.exp > Date.now() && D.users.find(u => u.id === s.uid && u.active);
    if (!user) return next(new HttpError(401, 'Zaloguj się.'));
    req.user = user;
    req.token = token;
    next();
  }
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : next(new HttpError(403, 'Tylko administrator.')));

  /* ---- konto ---- */
  app.get('/api/status', (req, res) => res.json({ setup: D.users.length === 0 }));

  app.post('/api/setup', (req, res) => {
    if (D.users.length) throw new HttpError(409, 'Administrator już istnieje.');
    const user = makeUser({ ...req.body, role: 'admin' });
    D.users.push(user);
    startSession(res, user);
    res.json({ ok: true });
  });

  app.post('/api/login', (req, res) => {
    const login = str(req.body?.login, 32).toLowerCase();
    const key = `${req.ip}|${login}`;
    if (limiter.blocked(key)) throw new HttpError(429, 'Zbyt wiele prób. Spróbuj ponownie za 5 minut.');
    const user = D.users.find(u => u.login === login && u.active);
    if (!user || !verifyPassword(req.body?.password ?? '', user)) {
      limiter.fail(key);
      throw new HttpError(401, 'Nieprawidłowy login lub hasło.');
    }
    limiter.ok(key);
    startSession(res, user);
    res.json({ ok: true });
  });

  app.post('/api/logout', auth, (req, res) => {
    delete D.sessions[req.token];
    db.save();
    res.set('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.post('/api/me/password', auth, (req, res) => {
    if (!verifyPassword(req.body?.current ?? '', req.user)) throw bad('Obecne hasło jest nieprawidłowe.');
    setPassword(req.user, req.body?.next);
    for (const [k, s] of Object.entries(D.sessions)) if (s.uid === req.user.id && k !== req.token) delete D.sessions[k];
    db.save();
    res.json({ ok: true });
  });

  /* ---- dane ---- */
  app.get('/api/state', auth, (req, res) => {
    const me = req.user, isAdmin = me.role === 'admin';
    const parking = {};
    for (const [p, v] of Object.entries(D.parking)) {
      const n = v.recipients.length;
      parking[p] = isAdmin ? { amount: v.amount, n, recipients: v.recipients } : { amount: v.amount, n, mine: v.recipients.includes(me.id) };
    }
    res.json({
      me: publicUser(me),
      settings: D.settings,
      users: isAdmin ? D.users.map(publicUser) : [],
      entries: isAdmin ? D.entries : D.entries.filter(e => e.uid === me.id),
      parking,
    });
  });

  app.post('/api/entries', auth, (req, res) => {
    const period = req.body?.period, list = req.body?.entries;
    if (!PERIOD_RE.test(period || '')) throw bad('Nieprawidłowy okres.');
    if (!Array.isArray(list) || !list.length || list.length > 500) throw bad('Brak pozycji do zapisu.');
    const sigs = new Set(D.entries.filter(e => e.uid === req.user.id && e.period === period && e.sig).map(e => e.sig));
    const created = [];
    let skipped = 0;
    const now = Date.now();
    list.forEach((inp, i) => {
      const sig = str(inp.sig, 200);
      if (sig && sigs.has(sig)) { skipped++; return; }
      const e = cleanEntry(inp);
      created.push({ id: newId(), uid: req.user.id, period, ...e, src: inp.src === 'xls' ? 'xls' : 'man', sig, ct: now + i, status: 'pending' });
      if (sig) sigs.add(sig);
    });
    D.entries.push(...created);
    db.save();
    res.json({ added: created.length, skipped, ids: created.map(e => e.id) });
  });

  function ownPending(req) {
    const e = D.entries.find(x => x.id === req.params.id);
    if (!e || e.uid !== req.user.id) throw new HttpError(404, 'Nie znaleziono pozycji.');
    if (e.status !== 'pending') throw new HttpError(409, 'Pozycja jest już rozpatrzona. Poproś administratora o cofnięcie decyzji.');
    return e;
  }

  app.patch('/api/entries/:id', auth, (req, res) => {
    const e = ownPending(req);
    Object.assign(e, cleanEntry({ ...e, ...req.body, t: req.body?.t ?? e.t }), { upd: Date.now() });
    db.save();
    res.json({ ok: true });
  });

  app.delete('/api/entries/:id', auth, (req, res) => {
    const e = ownPending(req);
    D.entries.splice(D.entries.indexOf(e), 1);
    db.save();
    res.json({ ok: true });
  });

  app.post('/api/decide', auth, admin, (req, res) => {
    const { ids, status, reason } = req.body || {};
    if (!['ok', 'x', 'pending'].includes(status) || !Array.isArray(ids)) throw bad('Nieprawidłowa decyzja.');
    let n = 0;
    for (const id of ids) {
      const e = D.entries.find(x => x.id === id);
      if (!e) continue;
      if (status === 'ok' && !hasVal(e)) continue;
      e.status = status;
      e.reason = status === 'x' ? str(reason, 20) : '';
      e.decidedAt = Date.now();
      e.decidedBy = req.user.id;
      n++;
    }
    db.save();
    res.json({ changed: n });
  });

  app.post('/api/import/parse', auth, express.raw({ type: 'application/octet-stream', limit: '15mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('Brak pliku.');
    const type = ['auto', 'rez', 'sn', 'ko'].includes(req.query.type) ? req.query.type : 'auto';
    const out = await parseWorkbook(req.body, type);
    if (out.error) throw bad(out.error);
    res.json(out);
  });

  /* ---- administrator ---- */
  app.put('/api/parking/:period', auth, admin, (req, res) => {
    const p = req.params.period;
    if (!PERIOD_RE.test(p)) throw bad('Nieprawidłowy okres.');
    const amount = Number(req.body?.amount);
    if (!isFinite(amount) || amount < 0) throw bad('Nieprawidłowa kwota.');
    const ids = new Set(D.users.map(u => u.id));
    const recipients = [...new Set((req.body?.recipients || []).filter(id => ids.has(id)))];
    if (amount > 0 && !recipients.length) throw bad('Zaznacz co najmniej jedną osobę.');
    D.parking[p] = { amount: r2(amount), recipients, at: Date.now() };
    db.save();
    res.json({ ok: true });
  });

  app.put('/api/settings', auth, admin, (req, res) => {
    const b = req.body || {}, rates = {};
    for (const t of Object.keys(TYPES)) {
      const v = Number(b.rates?.[t]);
      if (!isFinite(v) || v < 0 || v > 100) throw bad('Stawki muszą być liczbami od 0 do 100.');
      rates[t] = v;
    }
    const vat = Number(b.vat);
    if (!isFinite(vat) || vat < 0 || vat > 100) throw bad('VAT musi być liczbą od 0 do 100.');
    D.settings = { rates, vat, vatMode: b.vatMode === 'divide' ? 'divide' : 'minus' };
    db.save();
    res.json({ ok: true });
  });

  function setPassword(user, pw) {
    if (typeof pw !== 'string' || pw.length < 6) throw bad('Hasło musi mieć co najmniej 6 znaków.');
    Object.assign(user, hashPassword(pw));
  }

  function makeUser(b) {
    const login = str(b.login, 32).toLowerCase();
    if (!LOGIN_RE.test(login)) throw bad('Login: 2–32 znaki, małe litery, cyfry, kropka, myślnik lub podkreślenie.');
    if (D.users.some(u => u.login === login)) throw bad('Taki login już istnieje.');
    const name = str(b.name, 60);
    if (!name) throw bad('Podaj imię i nazwisko.');
    const user = { id: newId(), login, name, role: b.role === 'admin' ? 'admin' : 'employee', active: true, created: Date.now() };
    setPassword(user, b.password);
    return user;
  }

  app.post('/api/users', auth, admin, (req, res) => {
    const user = makeUser(req.body || {});
    D.users.push(user);
    db.save();
    res.json(publicUser(user));
  });

  app.patch('/api/users/:id', auth, admin, (req, res) => {
    const u = D.users.find(x => x.id === req.params.id);
    if (!u) throw new HttpError(404, 'Nie znaleziono użytkownika.');
    const b = req.body || {};
    const nextRole = b.role === undefined ? u.role : b.role === 'admin' ? 'admin' : 'employee';
    const nextActive = b.active === undefined ? u.active : !!b.active;
    if (u.id === req.user.id && (!nextActive || nextRole !== 'admin')) throw bad('Nie możesz odebrać uprawnień ani zablokować własnego konta.');
    if (b.name !== undefined) { const n = str(b.name, 60); if (!n) throw bad('Podaj imię i nazwisko.'); u.name = n; }
    if (b.password !== undefined) setPassword(u, b.password);
    u.role = nextRole;
    u.active = nextActive;
    if (!u.active || b.password !== undefined) for (const [k, s] of Object.entries(D.sessions)) if (s.uid === u.id) delete D.sessions[k];
    db.save();
    res.json(publicUser(u));
  });

  app.use('/api', (req, res, next) => next(new HttpError(404, 'Nie znaleziono.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Błąd serwera. Spróbuj ponownie.' : err.message });
  });
  return app;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  const db = openDb(process.env.DATA_DIR || path.join(__dirname, 'data'));
  createApp(db, { secureCookie: process.env.COOKIE_SECURE === '1' }).listen(PORT, HOST, () => {
    console.log('Rejestr prowizji działa.');
    console.log(`  Na tym komputerze:  http://localhost:${PORT}`);
    for (const ip of lanAddresses()) console.log(`  W sieci lokalnej:   http://${ip}:${PORT}`);
    console.log(`  Dane: ${db.file}`);
  });
}
