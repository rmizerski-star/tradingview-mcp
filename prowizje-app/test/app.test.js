import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { openDb } from '../lib/db.js';
import { commission, parkingShare } from '../lib/calc.js';
import { createApp } from '../server.js';

let server;
let base;

before(async () => {
  server = createApp(openDb(':memory:')).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, raw } = {}) => {
    const headers = { cookie };
    if (raw) headers['Content-Type'] = 'application/octet-stream';
    else if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
}

async function login(login, password) {
  const c = client();
  const r = await c('/api/login', { method: 'POST', body: { login, password } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return c;
}

// Pliki o układzie jak raporty z systemu hotelowego.
async function reservationsXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet');
  ws.getCell('G1').value = 'Lista rezerwacji';
  ws.getRow(7).values = { A: 'Nr rezerwacji', F: 'Zamawiający', I: 'Przyjazd', J: 'Wyjazd' };
  rows.forEach((r, i) => {
    const row = ws.getRow(8 + i);
    row.getCell('A').value = r[0];
    row.getCell('F').value = r[1];
    row.getCell('I').value = new Date(Date.UTC(2026, 9, r[2]));
    row.getCell('J').value = new Date(Date.UTC(2026, 9, r[3]));
  });
  ws.getCell(`A${8 + rows.length}`).value = 'RH2 1.4.500';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function mealsXlsx(title, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet');
  ws.getCell('G1').value = 'Księgowania wg kodów';
  ws.getCell('G3').value = 'Doby:01/10/2026 - 17/10/2026  Kod:505  Wg daty sprzedaży';
  ws.getRow(7).values = { A: 'Usługa / płatność', J: 'Nazwisko, opis', M: 'Pobyt', S: 'Nr rach./potw.', Z: 'Wartość' };
  ws.getCell('A9').value = title;
  rows.forEach((r, i) => {
    const row = ws.getRow(10 + i);
    row.getCell('A').value = new Date(Date.UTC(2026, 9, 12, 20, i));
    row.getCell('J').value = r[0];
    row.getCell('N').value = r[1];
    row.getCell('S').value = r[2];
    row.getCell('Y').value = r[3];
  });
  const end = 10 + rows.length;
  ws.getCell(`B${end}`).value = '*Korekta*';
  ws.getCell(`O${end + 1}`).value = 'Razem 505';
  ws.getCell(`Y${end + 1}`).value = 999;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('wyliczenie prowizji: 1% / 5% od kwoty netto (VAT 8%)', () => {
  assert.equal(commission(1080, 1, 8, 'divide'), 10);
  assert.equal(commission(1080, 5, 8, 'divide'), 50);
  assert.equal(commission(1000, 1, 8, 'subtract'), 9.2);
  assert.equal(commission(-240, 5, 8, 'divide'), -11.11);
  assert.equal(parkingShare(300, 3), 100);
  assert.equal(parkingShare(300, 0), 0);
});

test('pełny scenariusz: pracownicy, import, powielenie, anulacja, zatwierdzanie, parking, eksport', async () => {
  const adm = await login('admin', 'admin');
  for (const [l, n] of [['anna', 'Anna Nowak'], ['jan', 'Jan Kowalski']]) {
    const r = await adm('/api/users', { method: 'POST', body: { login: l, name: n, password: 'haslo123' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  // Administrator nie uczestniczy w parkingu w tym scenariuszu.
  await adm('/api/users/1', { method: 'PUT', body: { parking_share: false } });

  const anna = await login('anna', 'haslo123');
  const jan = await login('jan', 'haslo123');

  // Import rezerwacji – wartość i nr rachunku uzupełniane ręcznie.
  const resFile = await reservationsXlsx([['26/012803', 'Różyński Marek', 28, 30], ['26/013171', 'Rybak Benedykt', 1, 3]]);
  let p = await anna('/api/import/preview?kind=rezerwacje&month=2026-10', { method: 'POST', raw: resFile });
  assert.equal(p.status, 200);
  assert.equal(p.data.rows.length, 2);
  assert.equal(p.data.rows[0].stay_from, '2026-10-28');
  const rows = p.data.rows.map((r, i) => ({ ...r, value: i ? 2160 : 1080, bill_no: `R${i}` }));
  let c = await anna('/api/import/commit', { method: 'POST', body: { category: 'rezerwacje', month: '2026-10', rows } });
  assert.deepEqual([c.data.added, c.data.errors.length], [2, 0]);
  // Ponowny import tego samego pliku nie dubluje wpisów.
  c = await anna('/api/import/commit', { method: 'POST', body: { category: 'rezerwacje', month: '2026-10', rows } });
  assert.equal(c.data.added, 0);
  assert.equal(c.data.skipped.length, 2);

  // Ta sama rezerwacja w następnym miesiącu => powielona.
  p = await anna('/api/import/preview?kind=rezerwacje&month=2026-11', { method: 'POST', raw: resFile });
  assert.match(p.data.rows[0].duplicate_of, /2026-10/);
  c = await anna('/api/import/commit', { method: 'POST', body: { category: 'rezerwacje', month: '2026-11', rows: [rows[0]] } });
  assert.equal(c.data.added, 1);
  const nov = (await anna('/api/entries?month=2026-11')).data.entries;
  assert.equal(nov[0].is_duplicate, 1);
  const oct = (await anna('/api/entries?month=2026-10&category=rezerwacje')).data.entries;
  assert.ok(oct.every((e) => e.is_duplicate === 0));
  assert.equal(oct.find((e) => e.ref_no === '26/012803').commission, 10);

  // Śniadania: Jan ma rachunek dodatni, Anna anuluje go (wartość ujemna) => oba oznaczone jako anulacja.
  const janMeals = await mealsXlsx('505  Śniadanie dokupione w hotelu', [['E1112', '12/10-13/10', '26/032001 ', 240], ['A864', '16/10-17/10', ' ', 120]]);
  p = await jan('/api/import/preview?kind=sniadania', { method: 'POST', raw: janMeals });
  assert.equal(p.data.month, '2026-10');
  assert.equal(p.data.suggestedCategory, 'sniadania');
  assert.equal(p.data.rows.length, 2, 'wiersze Korekta/Razem pominięte');
  assert.equal(p.data.rows[1].bill_no, '');
  p.data.rows[1].bill_no = '26/032517';
  c = await jan('/api/import/commit', { method: 'POST', body: { category: 'sniadania', month: '2026-10', rows: p.data.rows } });
  assert.equal(c.data.added, 2);
  await anna('/api/entries', { method: 'POST', body: { category: 'sniadania', month: '2026-10', guest: 'E1112', bill_no: '26/032001', value: '-240' } });
  const meals = (await adm('/api/entries?month=2026-10&category=sniadania')).data.entries;
  assert.deepEqual(meals.filter((e) => e.bill_no === '26/032001').map((e) => e.is_cancellation), [1, 1]);
  assert.equal(meals.find((e) => e.bill_no === '26/032517').is_cancellation, 0);

  // Pracownik widzi tylko swoje wpisy i nie może zatwierdzać.
  assert.ok((await jan('/api/entries?month=2026-10')).data.entries.every((e) => e.user_name === 'Jan Kowalski'));
  assert.equal((await jan('/api/entries/decide', { method: 'POST', body: { ids: [1], status: 'approved' } })).status, 403);
  assert.equal((await jan('/api/parking/2026-10', { method: 'PUT', body: { amount: 100 } })).status, 403);

  // Admin zatwierdza wszystko poza anulowanym rachunkiem Jana i ujemnym Anny.
  const all = (await adm('/api/entries?month=2026-10')).data.entries;
  const cancelled = all.filter((e) => e.bill_no === '26/032001').map((e) => e.id);
  await adm('/api/entries/decide', { method: 'POST', body: { ids: all.map((e) => e.id).filter((id) => !cancelled.includes(id)), status: 'approved' } });
  await adm('/api/entries/decide', { method: 'POST', body: { ids: cancelled, status: 'rejected', admin_note: 'anulowany rachunek' } });
  // Zatwierdzonego wpisu pracownik nie edytuje.
  const approvedId = all.find((e) => e.status === 'pending' && !cancelled.includes(e.id)).id;
  assert.equal((await anna(`/api/entries/${approvedId}`, { method: 'PUT', body: { value: 1 } })).status, 403);

  // Parking 300 zł – dzielony na 2 pracowników (admin wyłączony z podziału).
  await adm('/api/parking/2026-10', { method: 'PUT', body: { amount: '300' } });
  const s = (await adm('/api/summary?month=2026-10')).data;
  const a = s.rows.find((r) => r.login === 'anna');
  const j = s.rows.find((r) => r.login === 'jan');
  assert.equal(s.parking.share, 150);
  assert.equal(a.cat.rezerwacje.commission, 30); // (1080 + 2160) / 1.08 × 1%
  assert.equal(a.cat.sniadania.commission, 0); // ujemny wpis anulowany
  assert.equal(j.cat.sniadania.commission, 5.56); // 120 / 1.08 × 5%
  assert.equal(a.total, 180);
  assert.equal(j.total, 155.56);
  assert.equal(s.rows.find((r) => r.login === 'admin').parking, 0);
  assert.equal(s.totals.total, 335.56);

  // Pracownik widzi tylko swoje podsumowanie.
  const own = (await jan('/api/summary?month=2026-10')).data;
  assert.equal(own.rows.length, 1);
  assert.equal(own.totals, null);

  // Eksport do Excela.
  const x = await adm('/api/export?month=2026-10');
  assert.equal(x.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(x.data);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Podsumowanie', 'Rezerwacje', 'Śniadania', 'Obiadokolacje', 'Upsell']);
  assert.equal((await jan('/api/export?month=2026-10')).status, 200);
});

test('ręczny wpis tej samej rezerwacji w tym samym miesiącu jest odrzucany', async () => {
  const adm = await login('admin', 'admin');
  const body = { category: 'rezerwacje', month: '2026-12', ref_no: '26/099999', guest: 'Test', value: 500 };
  assert.equal((await adm('/api/entries', { method: 'POST', body })).status, 200);
  assert.equal((await adm('/api/entries', { method: 'POST', body })).status, 409);
});
