import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEF_SET, summarize, entryNet, statusOf, parkShare, dupOf, stornoMatch } from '../public/calc.js';

const e = (o) => ({ id: Math.random().toString(36), uid: 'u1', period: '2026-10', status: 'pending', ct: 1, ...o });

test('prowizja od rezerwacji: 1% minus 8% VAT', () => {
  assert.equal(entryNet(DEF_SET, e({ t: 'rez', val: 10000 })).toFixed(2), '92.00');
  assert.equal(entryNet({ ...DEF_SET, vatMode: 'divide' }, e({ t: 'rez', val: 10000 })).toFixed(2), '92.59');
});

test('śniadania, obiadokolacje, upsell: 5% minus 8% VAT', () => {
  for (const t of ['sn', 'ko', 'up']) assert.equal(entryNet(DEF_SET, e({ t, val: 1000 })).toFixed(2), '46.00');
});

test('podsumowanie liczy tylko zatwierdzone, osobno oczekujące i bez kwoty', () => {
  const sm = summarize(DEF_SET, [
    e({ t: 'rez', val: 2000, status: 'ok' }),
    e({ t: 'rez', val: 1000 }),
    e({ t: 'rez', val: null }),
    e({ t: 'sn', val: 240, status: 'ok' }),
    e({ t: 'sn', val: 240, status: 'x' }),
  ]);
  assert.equal(sm.by.rez.ok, 2000);
  assert.equal(sm.by.rez.net.toFixed(2), '18.40');
  assert.equal(sm.by.sn.net.toFixed(2), '11.04');
  assert.equal(sm.tot.pendN, 1);
  assert.equal(sm.tot.todoN, 1);
  assert.equal(sm.tot.xN, 1);
});

test('status: brak kwoty = do uzupełnienia, nawet po decyzji', () => {
  assert.equal(statusOf(e({ val: null })), 'todo');
  assert.equal(statusOf(e({ val: 10, status: 'ok' })), 'ok');
});

test('parking dzielony po równo na uczestników', () => {
  assert.equal(parkShare({ amount: 900, n: 3, recipients: ['a', 'b', 'c'] }, 'b'), 300);
  assert.equal(parkShare({ amount: 900, n: 3, recipients: ['a', 'b', 'c'] }, 'x'), 0);
  assert.equal(parkShare({ amount: 900, n: 3, mine: true }, 'x'), 300);
});

test('rezerwacja z tym samym nr w następnym miesiącu jest powielona', () => {
  const oct = e({ t: 'rez', resNo: '26/012803', period: '2026-10' });
  const nov = e({ t: 'rez', resNo: '26/012803 ', period: '2026-11' });
  assert.equal(dupOf([oct, nov], oct), null);
  assert.equal(dupOf([oct, nov], nov)[0], oct);
});

test('storno: ujemna u jednej osoby łączy się z dodatnią u innej', () => {
  const neg = e({ uid: 'x', t: 'sn', val: -240, bill: '26/032139' });
  const posSame = e({ uid: 'x', t: 'sn', val: 240, bill: '26/032139' });
  const posOther = e({ uid: 'y', t: 'sn', val: 240, bill: '26/032139 ' });
  const m = stornoMatch([neg, posSame, posOther]);
  assert.equal(m.pairs.length, 1);
  assert.equal(m.pairs[0][1], posOther);
  assert.equal(m.lone.length, 0);
});
