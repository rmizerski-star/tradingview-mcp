// Wspólne reguły naliczania — używane przez przeglądarkę i serwer.

export const TYPES = {
  rez: { name: 'Rezerwacje', one: 'Rezerwacja', code: 'REZ' },
  sn: { name: 'Śniadania', one: 'Śniadanie', code: '505' },
  ko: { name: 'Obiadokolacje', one: 'Obiadokolacja', code: '518' },
  up: { name: 'Upsell', one: 'Upsell', code: 'UPS' },
};
export const TK = Object.keys(TYPES);
export const DEF_SET = { vat: 8, vatMode: 'minus', rates: { rez: 1, sn: 5, ko: 5, up: 5 } };

export const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
export const hasVal = e => typeof e.val === 'number' && isFinite(e.val) && e.val !== 0;
export const normKey = s => String(s || '').replace(/\s/g, '');

export const rate = (s, t) => (Number(s.rates?.[t]) || 0) / 100;
// 'minus': prowizja × (1 − VAT); 'divide': prowizja ÷ (1 + VAT)
export const vatFactor = s => {
  const v = (Number(s.vat) || 0) / 100;
  return s.vatMode === 'divide' ? 1 / (1 + v) : 1 - v;
};
export const entryNet = (s, e) => (hasVal(e) ? e.val : 0) * rate(s, e.t) * vatFactor(s);

// todo = brak kwoty (np. rezerwacja przed wystawieniem rachunku)
export const statusOf = e => (!hasVal(e) ? 'todo' : e.status === 'ok' || e.status === 'x' ? e.status : 'pending');

export function summarize(s, list) {
  const f = vatFactor(s), by = {};
  const tot = { net: 0, prow: 0, vat: 0, pendNet: 0, pendN: 0, okN: 0, xN: 0, todoN: 0 };
  for (const t of TK) by[t] = { okN: 0, ok: 0, pend: 0, pendN: 0, xN: 0 };
  for (const e of list) {
    const o = by[e.t];
    if (!o) continue;
    const st = statusOf(e);
    if (st === 'todo') { tot.todoN++; continue; }
    if (st === 'ok') { o.ok += e.val; o.okN++; }
    else if (st === 'x') o.xN++;
    else { o.pend += e.val; o.pendN++; }
  }
  for (const t of TK) {
    const o = by[t];
    o.prow = o.ok * rate(s, t);
    o.net = o.prow * f;
    o.vat = o.prow - o.net;
    o.pendNet = o.pend * rate(s, t) * f;
    tot.net += o.net; tot.prow += o.prow; tot.vat += o.vat;
    tot.pendNet += o.pendNet; tot.pendN += o.pendN; tot.okN += o.okN; tot.xN += o.xN;
  }
  return { by, tot };
}

// p = {amount, n, recipients?, mine?} — administrator dostaje listę, pracownik tylko flagę mine
export function parkShare(p, uid) {
  if (!p || !(p.amount > 0) || !(p.n > 0)) return 0;
  const inc = Array.isArray(p.recipients) ? p.recipients.includes(uid) : !!p.mine;
  return inc ? p.amount / p.n : 0;
}

// Powielona rezerwacja: ten sam nr we wcześniejszym okresie albo wcześniej dodany w tym samym.
export function dupOf(all, e) {
  const key = normKey(e.resNo);
  if (e.t !== 'rez' || !key) return null;
  const ear = all.filter(o => o.id !== e.id && o.t === 'rez' && normKey(o.resNo) === key &&
    (o.period < e.period || (o.period === e.period && (o.ct || 0) < (e.ct || 0))));
  return ear.length ? ear : null;
}

// Para storno: ujemna i dodatnia pozycja z tym samym nr rachunku, kwotą i kategorią.
export function stornoMatch(items) {
  const act = items.filter(e => statusOf(e) !== 'x');
  const neg = act.filter(e => hasVal(e) && e.val < 0), pos = act.filter(e => hasVal(e) && e.val > 0);
  const used = new Set(), pairs = [], lone = [];
  for (const n of neg) {
    const key = normKey(n.bill);
    const c = key ? pos.filter(p => !used.has(p) && normKey(p.bill) === key && p.t === n.t && Math.abs(p.val + n.val) < 0.005) : [];
    const pick = c.find(p => p.uid !== n.uid) || c[0];
    if (pick) { used.add(pick); pairs.push([n, pick]); } else lone.push(n);
  }
  return { pairs, lone };
}
