import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkbook } from '../lib/excel.js';
import { reservationsXlsx, mealsXlsx } from './fixtures.js';

test('lista rezerwacji: A, F, I, J; bez kwoty i nr rachunku', async () => {
  const buf = await reservationsXlsx([
    ['26/000001', 'Kowalski  Jan ', [2026, 10, 28], [2026, 10, 30]],
    ['26/000002', 'Nowak Anna', [2026, 9, 30], [2026, 10, 3]],
  ]);
  const r = await parseWorkbook(buf);
  assert.equal(r.t, 'rez');
  assert.deepEqual(r.rows.map(x => [x.resNo, x.guest, x.from, x.to, x.val]), [
    ['26/000001', 'Kowalski Jan', '2026-10-28', '2026-10-30', null],
    ['26/000002', 'Nowak Anna', '2026-09-30', '2026-10-03', null],
  ]);
});

test('śniadania: J, N, S, Y; wartości ujemne; puste S; pomija sumy i korekty', async () => {
  const buf = await mealsXlsx(505, [
    [[2026, 10, 12, 20, 49], '', 'E1112 ', '12/10-13/10', '26/032001 ', 240],
    [[2026, 10, 14, 2, 17], '', 'E670', '13/10-17/10', '26/032139', -240],
    [[2026, 10, 16, 21, 6], 'A110', 'Testowy Gość', '16/10-18/10', ' ', 408],
  ]);
  const r = await parseWorkbook(buf);
  assert.equal(r.t, 'sn');
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows.map(x => [x.d, x.guest, x.room, x.stay, x.bill, x.val]), [
    ['2026-10-12', 'E1112', '', '12/10-13/10', '26/032001', 240],
    ['2026-10-14', 'E670', '', '13/10-17/10', '26/032139', -240],
    ['2026-10-16', 'Testowy Gość', 'A110', '16/10-18/10', '', 408],
  ]);
});

test('obiadokolacje: identyczne wiersze dostają różne sygnatury', async () => {
  const row = [[2026, 10, 14, 0, 52], 'D543', 'Gość', '14/10-17/10', '26/032158', 360];
  const r = await parseWorkbook(await mealsXlsx(518, [row, row, row]));
  assert.equal(r.t, 'ko');
  assert.equal(new Set(r.rows.map(x => x.sig)).size, 3);
});

test('uszkodzony plik daje czytelny błąd', async () => {
  const r = await parseWorkbook(Buffer.from('to nie jest excel'));
  assert.match(r.error, /\.xlsx/);
});
