import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { openDb } from '../lib/db.js';
import { mealsXlsx } from './fixtures.js';

let server, base, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prowizje-'));
  server = createApp(openDb(dir)).listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  return async (method, url, body, raw) => {
    const headers = { 'x-requested-with': 'prowizje' };
    if (cookie) headers.cookie = cookie;
    if (raw) headers['content-type'] = 'application/octet-stream';
    else if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(base + url, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}

test('pełny przebieg: administrator, pracownicy, import, uzupełnienie, zatwierdzenie, parking', async () => {
  const adm = client(), anna = client(), piotr = client();

  assert.equal((await adm('GET', '/api/status')).body.setup, true);
  assert.equal((await adm('POST', '/api/setup', { name: 'Admin', login: 'admin', password: 'tajne123' })).status, 200);
  assert.equal((await anna('POST', '/api/setup', { name: 'X', login: 'x', password: 'tajne123' })).status, 409);

  const a = await adm('POST', '/api/users', { name: 'Anna Test', login: 'Anna', password: 'haslo1' });
  assert.equal(a.body.login, 'anna');
  const p = await adm('POST', '/api/users', { name: 'Piotr Test', login: 'piotr', password: 'haslo2' });
  assert.equal((await adm('POST', '/api/users', { name: 'Dup', login: 'anna', password: 'haslo1' })).status, 400);

  assert.equal((await anna('POST', '/api/login', { login: 'anna', password: 'zle' })).status, 401);
  assert.equal((await anna('POST', '/api/login', { login: 'ANNA', password: 'haslo1' })).status, 200);
  await piotr('POST', '/api/login', { login: 'piotr', password: 'haslo2' });

  // Import rezerwacji bez kwoty, potem uzupełnienie
  const add = await anna('POST', '/api/entries', { period: '2026-10', entries: [
    { t: 'rez', resNo: '26/000001', guest: 'Gość A', from: '2026-10-28', to: '2026-10-30', val: null, sig: 'rez|26/000001', src: 'xls' },
    { t: 'rez', resNo: '26/000001', guest: 'Gość A', sig: 'rez|26/000001', src: 'xls' },
  ] });
  assert.deepEqual([add.body.added, add.body.skipped], [1, 1]);
  const rezId = add.body.ids[0];
  assert.equal((await adm('POST', '/api/decide', { ids: [rezId], status: 'ok' })).body.changed, 0, 'bez kwoty nie da się zatwierdzić');
  assert.equal((await anna('PATCH', `/api/entries/${rezId}`, { bill: '26/031000', val: 10000 })).status, 200);

  // Import śniadań z pliku
  const buf = await mealsXlsx(505, [[[2026, 10, 14, 2, 17], '', 'E670', '13/10-17/10', '26/032139', -240]]);
  const parsed = (await piotr('POST', '/api/import/parse', undefined, buf)).body;
  assert.equal(parsed.t, 'sn');
  await piotr('POST', '/api/entries', { period: '2026-10', entries: parsed.rows.map(r => ({ ...r, t: 'sn', src: 'xls' })) });
  await anna('POST', '/api/entries', { period: '2026-10', entries: [{ t: 'sn', d: '2026-10-13', guest: 'E670', bill: '26/032139', val: 240 }] });

  // Uprawnienia pracownika
  const annaState = (await anna('GET', '/api/state')).body;
  assert.equal(annaState.entries.length, 2, 'pracownik widzi tylko swoje pozycje');
  assert.equal(annaState.users.length, 0);
  assert.equal((await anna('POST', '/api/decide', { ids: [rezId], status: 'ok' })).status, 403);
  assert.equal((await anna('PUT', '/api/settings', { rates: { rez: 50, sn: 50, ko: 50, up: 50 }, vat: 0 })).status, 403);
  assert.equal((await anna('POST', '/api/users', { name: 'H', login: 'h', password: 'haslo12' })).status, 403);
  const piotrEntry = (await piotr('GET', '/api/state')).body.entries[0].id;
  assert.equal((await anna('PATCH', `/api/entries/${piotrEntry}`, { val: 1 })).status, 404, 'nie można edytować cudzej pozycji');

  // Zatwierdzenie i blokada edycji po zatwierdzeniu
  assert.equal((await adm('POST', '/api/decide', { ids: [rezId], status: 'ok' })).body.changed, 1);
  assert.equal((await anna('PATCH', `/api/entries/${rezId}`, { val: 1 })).status, 409);
  assert.equal((await anna('DELETE', `/api/entries/${rezId}`)).status, 409);

  // Parking
  assert.equal((await adm('PUT', '/api/parking/2026-10', { amount: 600, recipients: [a.body.id, p.body.id] })).status, 200);
  const pk = (await anna('GET', '/api/state')).body.parking['2026-10'];
  assert.deepEqual(pk, { amount: 600, n: 2, mine: true });

  // Ochrona CSRF: brak nagłówka = odmowa
  const r = await fetch(base + '/api/logout', { method: 'POST' });
  assert.equal(r.status, 403);

  // Blokada konta wylogowuje
  await adm('PATCH', `/api/users/${p.body.id}`, { active: false });
  assert.equal((await piotr('GET', '/api/state')).status, 401);
  assert.equal((await adm('PATCH', `/api/users/${(await adm('GET', '/api/state')).body.me.id}`, { active: false })).status, 400);

  // Zmiana hasła
  assert.equal((await anna('POST', '/api/me/password', { current: 'haslo1', next: 'nowehaslo' })).status, 200);
  assert.equal((await client()('POST', '/api/login', { login: 'anna', password: 'nowehaslo' })).status, 200);

  // Dane przetrwały ponowne otwarcie bazy
  const again = openDb(dir).data;
  assert.equal(again.entries.length, 3);
  assert.equal(again.users.length, 3);
});
