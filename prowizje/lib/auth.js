import crypto from 'node:crypto';

const KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, user) {
  if (!user?.salt || !user?.hash) return false;
  const a = crypto.scryptSync(String(password), user.salt, KEYLEN);
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const newToken = () => crypto.randomBytes(32).toString('hex');
export const newId = () => crypto.randomBytes(9).toString('base64url');

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Blokada po 5 nieudanych logowaniach na 5 minut (per IP + login).
export function createLoginLimiter({ max = 5, lockMs = 5 * 60 * 1000 } = {}) {
  const fails = new Map();
  return {
    blocked(key) {
      const f = fails.get(key);
      if (!f) return false;
      if (f.until && f.until > Date.now()) return true;
      if (f.until) fails.delete(key);
      return false;
    },
    fail(key) {
      const f = fails.get(key) || { n: 0, until: 0 };
      f.n++;
      if (f.n >= max) { f.until = Date.now() + lockMs; f.n = 0; }
      fails.set(key, f);
    },
    ok(key) { fails.delete(key); },
  };
}
