import { TYPES, TK, DEF_SET, r2, hasVal, normKey, entryNet, statusOf, summarize, parkShare, dupOf, stornoMatch } from './calc.js';

const ST_LABEL = { todo: 'Do uzupełnienia', pending: 'Oczekuje', ok: 'Zatwierdzona', x: 'Anulowana' };
const S = {
  me: null, settings: DEF_SET, users: [], entries: [], parking: {},
  period: '', tab: '', imp: null, fill: {}, editId: null, pkDraft: null, setDirty: false, stAll: false, listStale: false,
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const PLN = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const fm = v => PLN.format(r2(v || 0));
const fmD = d => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d || '');
const periodName = p => { const [y, m] = p.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }); };
const parseNum = v => { if (typeof v === 'number') return v; const s = String(v ?? '').replace(/\s| /g, '').replace(',', '.'); return s ? Number(s) : NaN; };
const numStr = v => (hasVal({ val: v }) ? String(v).replace('.', ',') : '');
const isAdmin = () => S.me?.role === 'admin';

let toastT;
function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.className = ''), err ? 6000 : 3000);
}

/* ---------- komunikacja z serwerem ---------- */
async function api(method, url, body, raw) {
  const opt = { method, headers: { 'x-requested-with': 'prowizje' }, credentials: 'same-origin' };
  if (raw) { opt.body = raw; opt.headers['content-type'] = 'application/octet-stream'; }
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['content-type'] = 'application/json'; }
  let r;
  try { r = await fetch(url, opt); } catch { throw new Error('Brak połączenia z serwerem. Sprawdź sieć i czy serwer jest uruchomiony.'); }
  let j = null;
  try { j = await r.json(); } catch { /* pusta odpowiedź */ }
  if (r.status === 401 && !url.endsWith('/login')) { S.me = null; showView('login'); throw new Error('Sesja wygasła. Zaloguj się ponownie.'); }
  if (!r.ok) throw new Error(j?.error || `Błąd serwera (${r.status}).`);
  return j;
}
async function load() {
  const st = await api('GET', '/api/state');
  S.me = st.me;
  S.settings = { ...DEF_SET, ...st.settings, rates: { ...DEF_SET.rates, ...(st.settings?.rates || {}) } };
  S.users = st.users || [];
  S.entries = st.entries || [];
  S.parking = st.parking || {};
}
// Pobiera świeże dane w tle (np. pozycje dodane przez innych na innych komputerach)
async function refresh() {
  try { await load(); renderData(); } catch { /* błąd sieci: zostają ostatnie dane */ }
}
async function act(fn, okMsg) {
  try {
    const r = await fn();
    await load();
    renderWho();
    renderData();
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    return r ?? true;
  } catch (e) { toast(e.message, true); return null; }
}

/* ---------- dane pomocnicze ---------- */
const myEntries = () => S.entries.filter(e => e.uid === S.me.id);
const ofPeriod = list => list.filter(e => e.period === S.period);
const sortEntries = list => [...list].sort((a, b) => (a.d || '').localeCompare(b.d || '') || a.ct - b.ct);
function userName(uid) { return S.users.find(u => u.id === uid)?.name || (uid === S.me.id ? S.me.name : 'Nieznany użytkownik'); }
// W zestawieniu: aktywni użytkownicy oraz każdy, kto ma pozycje w okresie
function teamIds() {
  const withEntries = new Set(ofPeriod(S.entries).map(e => e.uid));
  return S.users.filter(u => u.active || withEntries.has(u.id)).map(u => u.id)
    .filter(id => withEntries.has(id) || S.users.find(u => u.id === id)?.role !== 'admin')
    .sort((a, b) => userName(a).localeCompare(userName(b), 'pl'));
}

/* ---------- widoki ---------- */
function showView(v) {
  for (const id of ['boot', 'v-login', 'v-setup', 'app']) $(id).hidden = true;
  $(v === 'login' ? 'v-login' : v === 'setup' ? 'v-setup' : v === 'app' ? 'app' : 'boot').hidden = false;
  $('period-wrap').hidden = v !== 'app';
  if (v !== 'app') $('who').innerHTML = '';
  if (v === 'login') setTimeout(() => $('l-login').focus(), 0);
}
function renderWho() {
  $('who').innerHTML = `<b>${esc(S.me.name)}</b><span class="role">${isAdmin() ? 'Administrator' : 'Pracownik'}</span><button class="btn sm" id="logout" type="button">Wyloguj</button>`;
}
$('who').addEventListener('click', async e => {
  if (e.target.id !== 'logout') return;
  try { await api('POST', '/api/logout', {}); } catch { /* i tak wylogowujemy */ }
  S.me = null; S.imp = null;
  showView('login');
});

const MY_TABS = [['sum', 'Podsumowanie'], ['list', 'Pozycje'], ['add', 'Dodaj ręcznie'], ['imp', 'Import z Excela']];
const ADMIN_TABS = [['team', 'Zestawienie zespołu'], ['appr', 'Zatwierdzanie'], ['storno', 'Anulacje'], ['park', 'Parking'], ['users', 'Użytkownicy'], ['set', 'Ustawienia']];
function renderTabs() {
  const btn = ([id, label]) => `<button role="tab" data-tab="${id}" aria-selected="${S.tab === id}">${esc(label)}${id === 'appr' ? ' <span class="mono" id="appr-count"></span>' : ''}</button>`;
  let h = '';
  if (isAdmin()) h += '<span class="grp">Administrator</span>' + ADMIN_TABS.map(btn).join('') + '<span class="sep" aria-hidden="true"></span><span class="grp">Moje prowizje</span>';
  h += MY_TABS.map(btn).join('') + '<span class="sep" aria-hidden="true"></span>' + btn(['acct', 'Konto']);
  $('tabs').innerHTML = h;
}
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  S.tab = b.dataset.tab;
  if (S.tab === 'set') S.setDirty = false;
  renderAll();
  refresh();
});
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { S.tab = g.dataset.go; renderAll(); }
  if (e.target.closest('[data-go-todo]')) { $('lf-st').value = 'todo'; $('lf-type').value = ''; S.tab = 'list'; renderAll(); }
});

function renderAll() {
  renderWho();
  renderTabs();
  document.querySelectorAll('section.panel').forEach(s => (s.hidden = true));
  const p = $('p-' + S.tab);
  if (p) p.hidden = false;
  if (S.tab === 'add') prepAdd();
  if (S.tab === 'set') fillSettings();
  if (S.tab === 'park') fillPark();
  renderData();
}
function renderData() {
  if (!S.me) return;
  const pn = periodName(S.period);
  $('add-period').textContent = 'Okres: ' + pn;
  $('imp-period').textContent = 'Pozycje trafią do okresu: ' + pn;
  $('pk-period').textContent = pn;
  const c = $('appr-count');
  if (c) { const n = ofPeriod(S.entries).filter(e => statusOf(e) === 'pending').length; c.textContent = n ? `(${n})` : ''; }
  const t = S.tab;
  if (t === 'sum') renderSum();
  else if (t === 'list') renderList();
  else if (t === 'team') renderTeam();
  else if (t === 'appr') renderAppr();
  else if (t === 'storno') renderStorno();
  else if (t === 'park') renderPark();
  else if (t === 'users') renderUsers();
  else if (t === 'set' && !S.setDirty) fillSettings();
  else if (t === 'imp') renderImp();
}

/* ---------- elementy wspólne ---------- */
const chip = t => `<span class="chip"><i>${TYPES[t].code}</i>${TYPES[t].one}</span>`;
const stBadge = st => `<span class="st ${st}">${ST_LABEL[st]}</span>`;
const money = v => (typeof v === 'number' && isFinite(v) ? `<span class="${v < 0 ? 'neg' : ''}">${fm(v)}</span>` : '<span class="muted">—</span>');
const whenCell = e => (e.t === 'rez' ? `${fmD(e.from)} – ${fmD(e.to)}` : `${fmD(e.d)}${e.stay ? ` <span class="muted mono">${esc(e.stay)}</span>` : ''}`);
const guestCell = e => `${esc(e.guest)}${e.room ? ` <span class="muted mono">${esc(e.room)}</span>` : ''}${e.note ? `<div class="muted" style="font-size:12px;white-space:normal">${esc(e.note)}</div>` : ''}`;
function dupBadge(all, e) {
  const d = dupOf(all, e);
  if (!d) return '';
  const o = d[0], who = isAdmin() && o.uid !== e.uid ? ' · ' + esc(userName(o.uid)) : '';
  return ` <span class="st dup" title="Ten sam nr rezerwacji był już wprowadzony">Powielona · ${esc(o.period === e.period ? 'ten sam okres' : periodName(o.period))}${who}</span>`;
}
function sumTable(sm, park) {
  const f = v => `<td class="n">${fm(v)}</td>`;
  let rows = TK.map(t => {
    const o = sm.by[t];
    return `<tr><td>${chip(t)}</td><td class="n">${String(S.settings.rates[t] ?? 0).replace('.', ',')}%</td><td class="n">${o.okN}</td>${f(o.ok)}${f(o.prow)}${f(o.vat)}<td class="n"><b>${fm(o.net)}</b></td><td class="n muted">${o.pendN ? `${o.pendN} · ${fm(o.pendNet)}` : '—'}</td></tr>`;
  }).join('');
  rows += `<tr><td><span class="chip"><i>PRK</i>Parking</span></td><td class="n muted">podział</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n"><b>${fm(park)}</b></td><td class="n muted">—</td></tr>`;
  return `<div class="tbl"><table><thead><tr><th>Kategoria</th><th class="n">Stawka</th><th class="n">Zatw. poz.</th><th class="n">Suma wartości</th><th class="n">Prowizja</th><th class="n">VAT ${S.settings.vat}%</th><th class="n">Netto</th><th class="n">Oczekuje (netto)</th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><td>Razem</td><td></td><td class="n">${sm.tot.okN}</td><td></td><td class="n">${fm(sm.tot.prow)}</td><td class="n">${fm(sm.tot.vat)}</td><td class="n">${fm(sm.tot.net + park)}</td><td class="n">${sm.tot.pendN ? `${sm.tot.pendN} · ${fm(sm.tot.pendNet)}` : '—'}</td></tr></tfoot></table></div>`;
}

/* ---------- moje: podsumowanie ---------- */
function renderSum() {
  const list = ofPeriod(myEntries()), sm = summarize(S.settings, list), pk = S.parking[S.period], park = parkShare(pk, S.me.id);
  if (!list.length && !park) {
    $('sum-body').innerHTML = `<div class="empty"><b>Brak prowizji w okresie ${esc(periodName(S.period))}</b><span>Dodaj pozycję ręcznie albo zaimportuj raport z Excela (rezerwacje, śniadania, obiadokolacje).</span><div class="acts"><button class="btn pri" data-go="imp">Importuj z Excela</button><button class="btn" data-go="add">Dodaj ręcznie</button></div></div>`;
    return;
  }
  const vatTxt = S.settings.vatMode === 'divide' ? `wydzielany (÷ ${(1 + S.settings.vat / 100).toFixed(2).replace('.', ',')})` : 'odejmowany od prowizji';
  $('sum-body').innerHTML = `<div class="stack">
    <div class="tiles">
      <div class="tile hero"><span class="k">Do wypłaty · ${esc(periodName(S.period))}</span><span class="v">${fm(sm.tot.net + park)}</span><span class="s">Zatwierdzone prowizje netto ${fm(sm.tot.net)} + parking ${fm(park)}</span></div>
      <div class="tile"><span class="k">Oczekuje na zatwierdzenie</span><span class="v">${fm(sm.tot.pendNet)}</span><span class="s">${sm.tot.pendN} poz. · netto, jeśli zostaną zatwierdzone</span></div>
      <div class="tile"><span class="k">Pozycje</span><span class="v">${list.length}</span><span class="s">${sm.tot.okN} zatwierdzonych · ${sm.tot.xN} anulowanych</span></div>
    </div>
    ${sm.tot.todoN ? `<div class="banner"><span><b>${sm.tot.todoN} poz. czeka na kwotę</b> (i nr rachunku). Uzupełnij je po wystawieniu rachunku. Bez kwoty nie trafią do zatwierdzenia.</span><button class="btn pri sm" data-go-todo="1">Uzupełnij teraz</button></div>` : ''}
    ${sumTable(sm, park)}
    <p class="note">Prowizja = suma zatwierdzonych wartości × stawka; VAT ${S.settings.vat}% ${vatTxt}. Parking: ${pk?.amount ? `${fm(pk.amount)} ÷ ${pk.n} os${park ? '' : ' (nie bierzesz udziału w podziale)'}` : 'administrator nie wprowadził jeszcze kwoty'}.</p>
  </div>`;
}

/* ---------- moje: lista ---------- */
const canFill = (e, st) => (st === 'todo' || st === 'pending') && (!hasVal(e) || !normKey(e.bill));
function renderList() {
  const lb = $('list-body');
  if (lb.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { S.listStale = true; return; }
  S.listStale = false;
  const ft = $('lf-type').value, fs = $('lf-st').value, mine = myEntries();
  const rows = sortEntries(ofPeriod(mine)).map(e => ({ e, st: statusOf(e) })).filter(r => (!ft || r.e.t === ft) && (!fs || r.st === fs));
  if (!rows.length) { lb.innerHTML = `<div class="empty"><b>Brak pozycji</b><span>W okresie ${esc(periodName(S.period))} nie ma pozycji pasujących do filtrów.</span></div>`; return; }
  lb.innerHTML = `<div class="tbl"><table><thead><tr><th>Kategoria</th><th>Data / pobyt</th><th>Gość / opis</th><th>Nr rez.</th><th>Nr rachunku</th><th class="n">Wartość</th><th class="n">Prowizja netto</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map(({ e, st }) => {
    const id = esc(e.id), f = S.fill[e.id] || {};
    const valCells = canFill(e, st)
      ? `<td colspan="2"><div class="fill"><input class="bill" id="fb-${id}" value="${esc(f.bill ?? e.bill)}" placeholder="nr rachunku" aria-label="Nr rachunku"><input class="num" id="fv-${id}" value="${esc(f.val ?? numStr(e.val))}" inputmode="decimal" placeholder="kwota zł" aria-label="Wartość"><button class="btn sm pri" data-fill="${id}">Zapisz</button></div></td>`
      : `<td class="mono">${esc(e.bill) || '<span class="muted">—</span>'}</td><td class="n">${money(e.val)}</td>`;
    const acts = st === 'pending' || st === 'todo' ? `<div class="acts"><button class="btn sm" data-edit="${id}">Edytuj</button><button class="btn sm bad" data-del="${id}">Usuń</button></div>` : '';
    return `<tr><td>${chip(e.t)}</td><td>${whenCell(e)}</td><td class="wrap">${guestCell(e)}</td><td class="mono">${esc(e.resNo)}</td>${valCells}<td class="n">${hasVal(e) ? money(entryNet(S.settings, e)) : '<span class="muted">—</span>'}</td><td>${stBadge(st)}${dupBadge(mine, e)}</td><td>${acts}</td></tr>`;
  }).join('')}
  </tbody></table></div>`;
}
['lf-type', 'lf-st'].forEach(id => $(id).addEventListener('change', renderList));
$('list-body').addEventListener('input', e => {
  const m = e.target.id.match(/^f([bv])-(.+)$/);
  if (m) (S.fill[m[2]] ||= {})[m[1] === 'b' ? 'bill' : 'val'] = e.target.value;
});
$('list-body').addEventListener('focusout', () => setTimeout(() => { if (S.listStale && S.tab === 'list') renderList(); }, 250));
$('list-body').addEventListener('click', async e => {
  const fl = e.target.closest('[data-fill]'), ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (fl) {
    const id = fl.dataset.fill, bill = $('fb-' + id).value.trim(), raw = $('fv-' + id).value.trim(), v = parseNum(raw);
    if (raw && (!isFinite(v) || v === 0)) { toast('Wpisz poprawną kwotę, np. 2436,00.', true); return; }
    fl.disabled = true;
    document.activeElement?.blur();
    const ok = await act(() => api('PATCH', `/api/entries/${encodeURIComponent(id)}`, { bill, val: raw ? r2(v) : null }), raw ? 'Uzupełniono pozycję · trafi do zatwierdzenia' : 'Zapisano nr rachunku');
    if (ok) delete S.fill[id]; else fl.disabled = false;
    return;
  }
  if (ed) { S.editId = ed.dataset.edit; S.tab = 'add'; renderAll(); return; }
  if (del) {
    if (del.dataset.armed !== '1') {
      del.dataset.armed = '1'; del.textContent = 'Na pewno?';
      setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.textContent = 'Usuń'; } }, 3500);
      return;
    }
    await act(() => api('DELETE', `/api/entries/${encodeURIComponent(del.dataset.del)}`), 'Usunięto pozycję');
  }
});

/* ---------- moje: dodawanie ręczne ---------- */
function syncAddFields() {
  const t = $('a-t').value;
  document.querySelectorAll('#add-form [data-for]').forEach(el => (el.hidden = !el.dataset.for.split(' ').includes(t)));
  $('a-guest-l').textContent = t === 'rez' ? 'Imię i nazwisko gościa' : t === 'up' ? 'Gość / apartament' : 'Nazwisko lub apartament';
  $('a-note-l').textContent = t === 'up' ? 'Sprzedana usługa (np. późny wyjazd, SPA)' : 'Uwagi';
  $('a-hint').textContent = t === 'rez'
    ? 'Kwotę i nr rachunku możesz zostawić puste i uzupełnić po wystawieniu rachunku na koniec pobytu.'
    : 'Wartość ujemna oznacza anulację (storno) rachunku. Administrator łączy ją z dodatnią pozycją o tym samym numerze rachunku.';
}
$('a-t').addEventListener('change', syncAddFields);
function prepAdd() {
  const e = S.editId ? S.entries.find(x => x.id === S.editId) : null;
  if (S.editId && !e) S.editId = null;
  $('add-title').textContent = e ? 'Edytuj pozycję' : 'Dodaj prowizję ręcznie';
  $('a-save').textContent = e ? 'Zapisz zmiany' : 'Dodaj pozycję';
  $('a-cancel').hidden = !e;
  $('a-t').disabled = !!e;
  if (e) {
    $('a-t').value = e.t; $('a-d').value = e.d || ''; $('a-res').value = e.resNo || ''; $('a-guest').value = e.guest || ''; $('a-room').value = e.room || '';
    $('a-from').value = e.from || ''; $('a-to').value = e.to || ''; $('a-stay').value = e.stay || ''; $('a-bill').value = e.bill || '';
    $('a-val').value = numStr(e.val); $('a-note').value = e.note || '';
  }
  syncAddFields();
}
function resetAdd() { S.editId = null; $('add-form').reset(); prepAdd(); }
$('a-cancel').addEventListener('click', () => { resetAdd(); S.tab = 'list'; renderAll(); });
$('add-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const t = $('a-t').value, rawVal = $('a-val').value.trim(), val = parseNum(rawVal), g = id => $(id).value.trim();
  if (!(t === 'rez' && !rawVal) && (!isFinite(val) || val === 0)) {
    toast(t === 'rez' ? 'Wpisz poprawną kwotę albo zostaw pole puste i uzupełnij później.' : 'Wpisz wartość, np. 240,00 (ujemna dla anulacji).', true);
    $('a-val').focus();
    return;
  }
  if (t === 'rez' && !g('a-res') && !g('a-guest')) { toast('Podaj nr rezerwacji lub gościa.', true); return; }
  const e = { t, val: rawVal ? r2(val) : null, bill: g('a-bill'), guest: g('a-guest'), note: g('a-note'), resNo: g('a-res'), from: $('a-from').value, to: $('a-to').value, d: $('a-d').value, room: g('a-room'), stay: g('a-stay') };
  const editing = S.editId;
  const dd = !editing && t === 'rez' ? dupOf(myEntries(), { ...e, id: '', period: S.period, ct: Date.now() + 1e6 }) : null;
  $('a-save').disabled = true;
  const ok = await act(
    () => (editing ? api('PATCH', `/api/entries/${encodeURIComponent(editing)}`, e) : api('POST', '/api/entries', { period: S.period, entries: [{ ...e, src: 'man' }] })),
    dd ? `Dodano · uwaga: rezerwacja ${e.resNo} była już wprowadzona (${dd[0].period === S.period ? 'ten okres' : periodName(dd[0].period)}), oznaczona jako powielona` : editing ? 'Zapisano zmiany' : 'Dodano pozycję',
  );
  $('a-save').disabled = false;
  if (ok) { resetAdd(); if (editing) { S.tab = 'list'; renderAll(); } }
});

/* ---------- moje: import Excela ---------- */
async function handleFile(file) {
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) { toast('Obsługiwany jest plik .xlsx. Zapisz raport jako .xlsx i spróbuj ponownie.', true); return; }
  $('imp-body').innerHTML = '<div class="empty"><b>Odczytywanie pliku…</b></div>';
  $('imp-body').dataset.ready = '';
  try {
    const res = await api('POST', `/api/import/parse?type=${encodeURIComponent($('im-type').value)}`, undefined, await file.arrayBuffer());
    if (!res.rows.length) { S.imp = null; renderImp(); toast('W pliku nie znaleziono pozycji do importu. Sprawdź rodzaj raportu.', true); return; }
    const mine = myEntries();
    const sigs = new Set(mine.filter(e => e.period === S.period && e.sig).map(e => e.sig));
    const prevBy = new Map();
    for (const e of mine) if (e.t === 'rez' && e.period < S.period) {
      const k = normKey(e.resNo);
      if (!prevBy.has(k)) prevBy.set(k, new Set());
      prevBy.get(k).add(e.period);
    }
    for (const r of res.rows) {
      r.dup = sigs.has(r.sig);
      const pv = res.t === 'rez' ? prevBy.get(normKey(r.resNo)) : null;
      r.prev = pv ? [...pv].sort().map(periodName).join(', ') : '';
      r.sel = !r.dup && !r.prev;
      r.val = numStr(r.val);
    }
    S.imp = { t: res.t, rows: res.rows, file: file.name };
    renderImp(true);
  } catch (e) { S.imp = null; renderImp(); toast(e.message, true); }
}
$('im-file').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
const drop = $('im-drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('on'); });
drop.addEventListener('dragleave', () => drop.classList.remove('on'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('on'); handleFile(e.dataTransfer.files[0]); });

function renderImp(force) {
  const box = $('imp-body'), I = S.imp;
  if (!I) { if (box.dataset.ready !== 'empty') { box.innerHTML = '<div class="empty"><b>Wczytaj raport z systemu hotelowego</b><span>Zobaczysz podgląd pozycji. Przed zapisem możesz uzupełnić wartości i numery rachunków.</span></div>'; box.dataset.ready = 'empty'; } return; }
  if (!force && box.dataset.ready === '1') { updImpCount(); return; }
  const isRez = I.t === 'rez';
  const head = isRez
    ? '<th></th><th>Nr rez.</th><th>Gość</th><th>Przyjazd</th><th>Wyjazd</th><th>Nr rachunku</th><th class="n">Wartość (zł)</th><th>Uwagi</th>'
    : '<th></th><th>Data</th><th>Nazwisko / app.</th><th>Pobyt</th><th>Nr rachunku</th><th class="n">Wartość (zł)</th><th>Uwagi</th>';
  const body = I.rows.map((r, i) => {
    const flags = [
      r.dup ? '<span class="st info">Już zaimportowana</span>' : '',
      r.prev ? `<span class="st dup">Powielona · ${esc(r.prev)}</span>` : '',
      parseNum(r.val) < 0 ? '<span class="st x">Storno (ujemna)</span>' : '',
      !isRez && !r.bill ? '<span class="st pending">Brak nr rachunku</span>' : '',
    ].join(' ');
    const sel = `<td><input type="checkbox" data-i="${i}" data-f="sel" ${r.sel ? 'checked' : ''} aria-label="Importuj wiersz ${i + 1}"></td>`;
    const bill = `<td><input class="bill" data-i="${i}" data-f="bill" value="${esc(r.bill)}" placeholder="nr rachunku" aria-label="Nr rachunku"></td>`;
    const val = `<td class="n"><input class="num" data-i="${i}" data-f="val" value="${esc(r.val)}" inputmode="decimal" placeholder="${isRez ? 'później' : '0,00'}" aria-label="Wartość"></td>`;
    return isRez
      ? `<tr>${sel}<td class="mono">${esc(r.resNo)}</td><td>${esc(r.guest)}</td><td>${fmD(r.from)}</td><td>${fmD(r.to)}</td>${bill}${val}<td>${flags}</td></tr>`
      : `<tr>${sel}<td>${fmD(r.d)}</td><td>${esc(r.guest)} <span class="muted mono">${esc(r.room)}</span></td><td class="mono">${esc(r.stay)}</td>${bill}${val}<td>${flags}</td></tr>`;
  }).join('');
  box.innerHTML = `<div class="card">
    <div class="row"><div class="grow-title stack-sm"><h3>${esc(TYPES[I.t].name)} · ${esc(I.file)}</h3><span class="muted" id="imp-count"></span></div>
    <button class="btn" id="imp-clear" type="button">Odrzuć</button><button class="btn pri" id="imp-save" type="button">Zapisz zaznaczone</button></div>
    <p class="note">${isRez ? 'Kwotę rezerwacji i nr rachunku możesz wpisać teraz albo później, po wystawieniu rachunku (zakładka Pozycje → „Do uzupełnienia”). Pozycja bez kwoty nie trafia do zatwierdzenia. Rezerwacje powielone z wcześniejszych miesięcy są odznaczone.' : 'Wartości ujemne to anulowane rachunki (storno). Administrator łączy je w pary z pozycją dodatnią.'}</p>
    <div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  box.dataset.ready = '1';
  updImpCount();
}
function updImpCount() {
  const I = S.imp, c = $('imp-count');
  if (!I || !c) return;
  const sel = I.rows.filter(r => r.sel), ok = sel.filter(r => isFinite(parseNum(r.val)) && parseNum(r.val) !== 0);
  const sum = ok.reduce((a, r) => a + parseNum(r.val), 0);
  c.textContent = `Zaznaczono ${sel.length} z ${I.rows.length} · z kwotą ${ok.length}${I.t === 'rez' && sel.length > ok.length ? ` · do uzupełnienia później ${sel.length - ok.length}` : ''} · suma ${fm(sum)}`;
}
$('imp-body').addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset.f || !S.imp) return;
  S.imp.rows[+el.dataset.i][el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  updImpCount();
});
$('imp-body').addEventListener('click', async e => {
  if (e.target.id === 'imp-clear') { S.imp = null; renderImp(); return; }
  if (e.target.id !== 'imp-save') return;
  const I = S.imp, out = [];
  let bad = 0;
  for (const r of I.rows) {
    if (!r.sel) continue;
    const raw = String(r.val ?? '').trim(), v = parseNum(raw);
    if (raw ? !isFinite(v) || v === 0 : I.t !== 'rez') { bad++; continue; }
    out.push({ t: I.t, val: raw ? r2(v) : null, bill: r.bill, guest: r.guest, resNo: r.resNo, from: r.from, to: r.to, d: r.d, room: r.room, stay: r.stay, sig: r.sig, src: 'xls' });
  }
  if (!out.length) { toast('Brak pozycji do zapisu. Zaznacz wiersze i sprawdź kwoty.', true); return; }
  e.target.disabled = true;
  const res = await act(() => api('POST', '/api/entries', { period: S.period, entries: out }),
    r => `Zapisano ${r.added} poz.${r.skipped + bad ? ` · pominięto ${r.skipped + bad} (błędna kwota lub duplikaty)` : ''}`);
  if (res) { S.imp = null; S.tab = 'list'; renderAll(); } else e.target.disabled = false;
});

/* ---------- administrator: zestawienie ---------- */
function renderTeam() {
  const ids = teamIds(), per = ofPeriod(S.entries), pk = S.parking[S.period];
  if (!ids.length) {
    $('team-body').innerHTML = '<div class="empty"><b>Nie ma jeszcze pracowników</b><span>Załóż konta w zakładce Użytkownicy i przekaż pracownikom login i hasło startowe.</span><button class="btn pri" data-go="users">Dodaj pracownika</button></div>';
    return;
  }
  const tot = { by: {}, net: 0, park: 0, pendN: 0, todoN: 0 };
  TK.forEach(t => (tot.by[t] = { ok: 0, prow: 0, vat: 0, net: 0 }));
  const rows = ids.map(uid => {
    const sm = summarize(S.settings, per.filter(e => e.uid === uid)), share = parkShare(pk, uid);
    TK.forEach(t => { const o = sm.by[t], b = tot.by[t]; b.ok += o.ok; b.prow += o.prow; b.vat += o.vat; b.net += o.net; });
    tot.net += sm.tot.net + share; tot.park += share; tot.pendN += sm.tot.pendN; tot.todoN += sm.tot.todoN;
    return `<tr><td><b>${esc(userName(uid))}</b>${uid === S.me.id ? ' <span class="muted">(Ty)</span>' : ''}</td>${TK.map(t => `<td class="n">${fm(sm.by[t].net)}</td>`).join('')}<td class="n">${fm(share)}</td><td class="n"><b>${fm(sm.tot.net + share)}</b></td>
      <td class="n">${sm.tot.pendN ? `<button class="btn sm" data-review="${esc(uid)}">${sm.tot.pendN} do zatw.</button>` : '<span class="muted">—</span>'}${sm.tot.todoN ? ` <span class="st todo">${sm.tot.todoN} bez kwoty</span>` : ''}</td></tr>`;
  }).join('');
  const all = TK.reduce((a, t) => ({ ok: a.ok + tot.by[t].ok, prow: a.prow + tot.by[t].prow, vat: a.vat + tot.by[t].vat, net: a.net + tot.by[t].net }), { ok: 0, prow: 0, vat: 0, net: 0 });
  $('team-body').innerHTML = `<div class="stack">
    <div class="tiles">
      <div class="tile hero"><span class="k">Łącznie do wypłaty · ${esc(periodName(S.period))}</span><span class="v">${fm(tot.net)}</span><span class="s">${ids.length} os. · tylko zatwierdzone + parking</span></div>
      <div class="tile"><span class="k">Wartość zatwierdzonych rezerwacji</span><span class="v">${fm(tot.by.rez.ok)}</span><span class="s">Prowizja ${S.settings.rates.rez}% → netto ${fm(tot.by.rez.net)}</span></div>
      <div class="tile"><span class="k">Do zatwierdzenia</span><span class="v">${tot.pendN}</span><span class="s">${tot.todoN ? `+ ${tot.todoN} poz. czeka na kwotę` : 'pozycji w tym okresie'}</span></div>
      <div class="tile"><span class="k">Parking</span><span class="v">${fm(pk?.amount || 0)}</span><span class="s">${pk?.n ? `podzielone na ${pk.n} os. · ${fm(pk.amount / pk.n)} / os.` : 'kwota nie wprowadzona'}</span></div>
    </div>
    <h2>Prowizje netto wg pracownika</h2>
    <div class="tbl"><table><thead><tr><th>Pracownik</th>${TK.map(t => `<th class="n">${TYPES[t].name}</th>`).join('')}<th class="n">Parking</th><th class="n">Razem netto</th><th class="n">Oczekuje</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td>Razem</td>${TK.map(t => `<td class="n">${fm(tot.by[t].net)}</td>`).join('')}<td class="n">${fm(tot.park)}</td><td class="n">${fm(tot.net)}</td><td class="n">${tot.pendN || '—'}</td></tr></tfoot></table></div>
    <h2>Kategorie łącznie</h2>
    <div class="tbl"><table><thead><tr><th>Kategoria</th><th class="n">Suma wartości</th><th class="n">Prowizja</th><th class="n">VAT ${S.settings.vat}%</th><th class="n">Netto</th></tr></thead><tbody>
    ${TK.map(t => `<tr><td>${chip(t)}</td><td class="n">${fm(tot.by[t].ok)}</td><td class="n">${fm(tot.by[t].prow)}</td><td class="n">${fm(tot.by[t].vat)}</td><td class="n"><b>${fm(tot.by[t].net)}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Razem</td><td class="n">${fm(all.ok)}</td><td class="n">${fm(all.prow)}</td><td class="n">${fm(all.vat)}</td><td class="n">${fm(all.net)}</td></tr></tfoot></table></div>
  </div>`;
}
$('team-body').addEventListener('click', e => {
  const b = e.target.closest('[data-review]');
  if (!b) return;
  S.tab = 'appr'; renderAll();
  $('af-emp').value = b.dataset.review; $('af-st').value = 'pending'; renderAppr();
});

/* ---------- administrator: zatwierdzanie ---------- */
function apprRows() {
  const fe = $('af-emp').value, ft = $('af-type').value, fs = $('af-st').value;
  return ofPeriod(S.entries).map(e => ({ e, st: statusOf(e) }))
    .filter(r => (!fe || r.e.uid === fe) && (!ft || r.e.t === ft) && (!fs || r.st === fs))
    .sort((a, b) => userName(a.e.uid).localeCompare(userName(b.e.uid), 'pl') || (a.e.d || '').localeCompare(b.e.d || '') || a.e.ct - b.e.ct);
}
function renderAppr() {
  const sel = $('af-emp'), cur = sel.value, ids = S.users.map(u => u.id).sort((a, b) => userName(a).localeCompare(userName(b), 'pl'));
  const opts = '<option value="">Wszyscy</option>' + ids.map(u => `<option value="${esc(u)}">${esc(userName(u))}</option>`).join('');
  if (sel.dataset.sig !== opts) { sel.innerHTML = opts; sel.dataset.sig = opts; sel.value = ids.includes(cur) ? cur : ''; }
  const rows = apprRows();
  $('af-bulk').disabled = !rows.some(r => r.st === 'pending');
  if (!rows.length) {
    $('appr-body').innerHTML = `<div class="empty"><b>Nic do pokazania</b><span>${$('af-st').value === 'pending' ? 'Wszystkie pozycje w tym okresie są rozpatrzone.' : 'Brak pozycji pasujących do filtrów.'}</span></div>`;
    return;
  }
  $('appr-body').innerHTML = `<div class="tbl"><table><thead><tr><th>Pracownik</th><th>Kategoria</th><th>Data / pobyt</th><th>Gość / opis</th><th>Nr rez.</th><th>Nr rachunku</th><th class="n">Wartość</th><th class="n">Netto</th><th>Status</th><th>Decyzja</th></tr></thead><tbody>
  ${rows.map(({ e, st }) => {
    const id = esc(e.id);
    const btns = [
      st === 'pending' ? `<button class="btn sm ok" data-dec="ok" data-id="${id}">Zatwierdź</button>` : '',
      st === 'pending' || st === 'todo' ? `<button class="btn sm bad" data-dec="x" data-id="${id}">Anuluj</button>` : '',
      st === 'ok' || st === 'x' ? `<button class="btn sm" data-dec="pending" data-id="${id}">Cofnij</button>` : '',
    ].join('');
    return `<tr><td>${esc(userName(e.uid))}</td><td>${chip(e.t)}</td><td>${whenCell(e)}</td><td class="wrap">${guestCell(e)}</td><td class="mono">${esc(e.resNo)}</td><td class="mono">${esc(e.bill) || '<span class="muted">—</span>'}</td><td class="n">${money(e.val)}</td><td class="n">${hasVal(e) ? money(entryNet(S.settings, e)) : '<span class="muted">—</span>'}</td>
    <td>${stBadge(st)}${dupBadge(S.entries, e)}${st === 'x' && e.reason === 'storno' ? ' <span class="st info">storno</span>' : ''}</td><td><div class="acts">${btns}</div></td></tr>`;
  }).join('')}
  </tbody></table></div>`;
}
['af-emp', 'af-type', 'af-st'].forEach(id => $(id).addEventListener('change', renderAppr));
$('appr-body').addEventListener('click', async e => {
  const b = e.target.closest('[data-dec]');
  if (!b) return;
  b.disabled = true;
  const s = b.dataset.dec;
  await act(() => api('POST', '/api/decide', { ids: [b.dataset.id], status: s, reason: s === 'x' ? 'admin' : '' }),
    s === 'ok' ? 'Zatwierdzono' : s === 'x' ? 'Anulowano' : 'Cofnięto decyzję');
});
$('af-bulk').addEventListener('click', async e => {
  const b = e.currentTarget;
  const list = apprRows().filter(r => r.st === 'pending' && r.e.val > 0 && !dupOf(S.entries, r.e));
  if (!list.length) { toast('Brak pozycji do zatwierdzenia zbiorczo. Powielone rezerwacje i pozycje ujemne (storno) rozpatrujesz pojedynczo.'); return; }
  if (b.dataset.armed !== '1') {
    b.dataset.armed = '1'; b.textContent = `Zatwierdzić ${list.length} poz.?`;
    setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Zatwierdź widoczne oczekujące'; }, 4000);
    return;
  }
  b.dataset.armed = ''; b.textContent = 'Zatwierdź widoczne oczekujące'; b.disabled = true;
  await act(() => api('POST', '/api/decide', { ids: list.map(r => r.e.id), status: 'ok' }), r => `Zatwierdzono ${r.changed} poz.`);
  b.disabled = false;
});

/* ---------- administrator: anulacje ---------- */
const sideHtml = e => `<div class="side"><span><b>${esc(userName(e.uid))}</b> · ${chip(e.t)}</span><span class="mono">${money(e.val)} · rach. ${esc(e.bill)}</span><span class="muted" style="font-size:12px">${fmD(e.d)} · ${esc(e.guest)}${e.period !== S.period ? ` · ${esc(periodName(e.period))}` : ''}</span></div>`;
let stornoData = { pairs: [], lone: [] };
function renderStorno() {
  const items = S.stAll ? S.entries : ofPeriod(S.entries), m = stornoMatch(items);
  stornoData = m;
  $('st-all').textContent = S.stAll ? 'Pokaż tylko bieżący okres' : 'Pokaż wszystkie okresy';
  let h = `<p class="muted">${S.stAll ? 'Wszystkie okresy' : 'Okres ' + esc(periodName(S.period))} · ${m.pairs.length} par do oznaczenia · ${m.lone.length} ujemnych bez pary</p>`;
  h += m.pairs.length
    ? `<div class="stack">${m.pairs.map(([n, p], k) => `<div class="pair">${sideHtml(n)}<span class="arr">⇄</span>${sideHtml(p)}<button class="btn bad" data-pair="${k}">Oznacz jako anulację</button></div>`).join('')}</div>`
    : '<div class="empty"><b>Brak par do oznaczenia</b><span>Nie znaleziono pozycji ujemnej z pasującą dodatnią (ten sam nr rachunku, kwota i kategoria).</span></div>';
  if (m.lone.length) {
    h += `<h3>Ujemne bez pary</h3><p class="note">Zatwierdzenie zmniejszy prowizję pracownika. Anulowanie wyłączy pozycję z rozliczenia.</p>
    <div class="tbl"><table><thead><tr><th>Pracownik</th><th>Kategoria</th><th>Data</th><th>Gość</th><th>Nr rachunku</th><th class="n">Wartość</th><th>Status</th><th></th></tr></thead><tbody>
    ${m.lone.map((e, k) => `<tr><td>${esc(userName(e.uid))}</td><td>${chip(e.t)}</td><td>${fmD(e.d)}</td><td>${esc(e.guest)}</td><td class="mono">${esc(e.bill) || '—'}</td><td class="n">${money(e.val)}</td><td>${stBadge(statusOf(e))}</td><td><div class="acts">${statusOf(e) === 'ok' ? '' : `<button class="btn sm ok" data-lone="ok" data-k="${k}">Zatwierdź</button>`}<button class="btn sm bad" data-lone="x" data-k="${k}">Anuluj</button></div></td></tr>`).join('')}</tbody></table></div>`;
  }
  $('storno-body').innerHTML = h;
}
$('st-all').addEventListener('click', () => { S.stAll = !S.stAll; renderStorno(); });
$('storno-body').addEventListener('click', async e => {
  const pb = e.target.closest('[data-pair]'), lb = e.target.closest('[data-lone]');
  if (pb) {
    pb.disabled = true;
    const pr = stornoData.pairs[+pb.dataset.pair];
    await act(() => api('POST', '/api/decide', { ids: pr.map(x => x.id), status: 'x', reason: 'storno' }), 'Oznaczono parę jako anulację');
  }
  if (lb) {
    lb.disabled = true;
    const it = stornoData.lone[+lb.dataset.k], s = lb.dataset.lone;
    await act(() => api('POST', '/api/decide', { ids: [it.id], status: s, reason: s === 'x' ? 'storno' : '' }), 'Zapisano decyzję');
  }
});

/* ---------- administrator: parking ---------- */
function pkSaved() {
  const p = S.parking[S.period];
  return p ? { amount: p.amount || 0, recipients: [...(p.recipients || [])] }
    : { amount: 0, recipients: S.users.filter(u => u.active && u.role !== 'admin').map(u => u.id) };
}
function fillPark() { if (!S.pkDraft) { const s = pkSaved(); $('pk-amount').value = s.amount ? numStr(s.amount) : ''; } }
function renderPark() {
  const d = S.pkDraft || pkSaved(), saved = S.parking[S.period];
  const ids = S.users.filter(u => u.active || d.recipients.includes(u.id)).map(u => u.id).sort((a, b) => userName(a).localeCompare(userName(b), 'pl'));
  if (!S.pkDraft && document.activeElement !== $('pk-amount')) fillPark();
  const amt = S.pkDraft ? parseNum($('pk-amount').value) || 0 : d.amount, n = d.recipients.length;
  $('pk-body').innerHTML = !ids.length ? '<p class="muted">Brak użytkowników. Dodaj pracowników w zakładce Użytkownicy.</p>'
    : `<h3>Uczestnicy podziału</h3><div class="chk">${ids.map(u => `<label><input type="checkbox" data-pk="${esc(u)}" ${d.recipients.includes(u) ? 'checked' : ''}> ${esc(userName(u))}${u === S.me.id ? ' (Ty)' : ''}</label>`).join('')}</div>
     <p class="mono">${fm(amt)} ÷ ${n} os. = <b>${fm(n ? amt / n : 0)}</b> na osobę</p>
     <p class="note">${saved ? `Zapisano: ${fm(saved.amount)} na ${saved.n} os.` : 'Kwota dla tego okresu nie jest jeszcze zapisana.'}${S.pkDraft ? ' · Masz niezapisane zmiany.' : ''}</p>`;
}
const pkDraftNow = () => (S.pkDraft ||= pkSaved());
$('pk-amount').addEventListener('input', () => { pkDraftNow(); renderPark(); });
$('pk-body').addEventListener('change', e => {
  const u = e.target.dataset.pk;
  if (!u) return;
  const d = pkDraftNow();
  d.recipients = d.recipients.filter(x => x !== u);
  if (e.target.checked) d.recipients.push(u);
  renderPark();
});
$('pk-save').addEventListener('click', async e => {
  const d = S.pkDraft || pkSaved(), amt = parseNum($('pk-amount').value || '0');
  if (!isFinite(amt) || amt < 0) { toast('Wpisz poprawną kwotę, np. 1200,00.', true); return; }
  if (amt > 0 && !d.recipients.length) { toast('Zaznacz co najmniej jedną osobę do podziału.', true); return; }
  const b = e.currentTarget;
  b.disabled = true;
  const ok = await act(() => api('PUT', `/api/parking/${S.period}`, { amount: r2(amt), recipients: d.recipients }), 'Zapisano parking');
  if (ok) { S.pkDraft = null; renderPark(); }
  b.disabled = false;
});

/* ---------- administrator: użytkownicy ---------- */
function renderUsers() {
  const box = $('users-body');
  if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const list = [...S.users].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pl'));
  box.innerHTML = `<div class="tbl"><table><thead><tr><th>Imię i nazwisko</th><th>Login</th><th>Rola</th><th>Status</th><th>Nowe hasło</th><th></th></tr></thead><tbody>
  ${list.map(u => {
    const id = esc(u.id), self = u.id === S.me.id;
    return `<tr><td><b>${esc(u.name)}</b>${self ? ' <span class="muted">(Ty)</span>' : ''}</td><td class="mono">${esc(u.login)}</td>
    <td>${self ? 'Administrator' : `<select data-role="${id}" aria-label="Rola"><option value="employee" ${u.role === 'employee' ? 'selected' : ''}>Pracownik</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option></select>`}</td>
    <td>${u.active ? '<span class="st ok">Aktywne</span>' : '<span class="st x">Zablokowane</span>'}</td>
    <td><div class="fill"><input id="np-${id}" type="text" placeholder="min. 6 znaków" autocomplete="off" aria-label="Nowe hasło"><button class="btn sm" data-pw="${id}">Ustaw</button></div></td>
    <td>${self ? '' : `<button class="btn sm ${u.active ? 'bad' : 'ok'}" data-active="${id}" data-val="${u.active ? '0' : '1'}">${u.active ? 'Zablokuj' : 'Odblokuj'}</button>`}</td></tr>`;
  }).join('')}</tbody></table></div>
  <p class="note">Zablokowane konto nie może się zalogować, a jego pozycje zostają w historii. Ustawienie nowego hasła wylogowuje użytkownika na wszystkich komputerach.</p>`;
}
$('u-form').addEventListener('submit', async e => {
  e.preventDefault();
  const body = { name: $('u-name').value, login: $('u-login').value, password: $('u-pass').value, role: $('u-role').value };
  const ok = await act(() => api('POST', '/api/users', body), u => `Utworzono konto ${u.login}`);
  if (ok) $('u-form').reset();
});
$('users-body').addEventListener('click', async e => {
  const pw = e.target.closest('[data-pw]'), ac = e.target.closest('[data-active]');
  if (pw) {
    const inp = $('np-' + pw.dataset.pw), v = inp.value;
    if (v.length < 6) { toast('Hasło musi mieć co najmniej 6 znaków.', true); inp.focus(); return; }
    inp.blur();
    await act(() => api('PATCH', `/api/users/${encodeURIComponent(pw.dataset.pw)}`, { password: v }), 'Ustawiono nowe hasło');
  }
  if (ac) await act(() => api('PATCH', `/api/users/${encodeURIComponent(ac.dataset.active)}`, { active: ac.dataset.val === '1' }), ac.dataset.val === '1' ? 'Odblokowano konto' : 'Zablokowano konto');
});
$('users-body').addEventListener('change', async e => {
  const id = e.target.dataset.role;
  if (id) await act(() => api('PATCH', `/api/users/${encodeURIComponent(id)}`, { role: e.target.value }), 'Zmieniono rolę');
});

/* ---------- administrator: ustawienia ---------- */
function fillSettings() {
  const s = S.settings, f = v => String(v).replace('.', ',');
  $('s-rez').value = f(s.rates.rez); $('s-sn').value = f(s.rates.sn); $('s-ko').value = f(s.rates.ko); $('s-up').value = f(s.rates.up); $('s-vat').value = f(s.vat);
  $(s.vatMode === 'divide' ? 'vm-divide' : 'vm-minus').checked = true;
}
$('p-set').addEventListener('input', () => (S.setDirty = true));
$('s-save').addEventListener('click', async e => {
  const g = id => parseNum($(id).value);
  const body = { rates: { rez: g('s-rez'), sn: g('s-sn'), ko: g('s-ko'), up: g('s-up') }, vat: g('s-vat'), vatMode: $('vm-divide').checked ? 'divide' : 'minus' };
  if ([...Object.values(body.rates), body.vat].some(v => !isFinite(v) || v < 0 || v > 100)) { toast('Stawki i VAT muszą być liczbami od 0 do 100.', true); return; }
  e.currentTarget.disabled = true;
  if (await act(() => api('PUT', '/api/settings', body), 'Zapisano ustawienia')) S.setDirty = false;
  e.currentTarget.disabled = false;
});

/* ---------- konto ---------- */
$('pw-form').addEventListener('submit', async e => {
  e.preventDefault();
  if ($('pw-new').value !== $('pw-new2').value) { toast('Nowe hasła nie są takie same.', true); return; }
  const ok = await act(() => api('POST', '/api/me/password', { current: $('pw-cur').value, next: $('pw-new').value }), 'Hasło zostało zmienione');
  if (ok) $('pw-form').reset();
});

/* ---------- logowanie i start ---------- */
function startApp() {
  S.tab = isAdmin() ? 'team' : 'sum';
  showView('app');
  renderAll();
}
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('POST', '/api/login', { login: $('l-login').value, password: $('l-pass').value });
    $('l-pass').value = '';
    await load();
    startApp();
  } catch (err) { toast(err.message, true); }
});
$('setup-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('POST', '/api/setup', { name: $('su-name').value, login: $('su-login').value, password: $('su-pass').value });
    await load();
    startApp();
    toast('Konto administratora utworzone. Dodaj pracowników w zakładce Użytkownicy.');
  } catch (err) { toast(err.message, true); }
});

const now = new Date();
S.period = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
$('period').value = S.period;
$('period').addEventListener('change', e => {
  if (!/^\d{4}-\d{2}$/.test(e.target.value)) return;
  S.period = e.target.value;
  S.pkDraft = null;
  if (S.tab === 'park') fillPark();
  renderData();
});

// Odświeżanie co 30 s, gdy nikt nic nie wpisuje (dane innych pracowników i decyzje administratora)
setInterval(() => {
  if (!S.me || document.hidden) return;
  const a = document.activeElement;
  if (a && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName)) return;
  refresh();
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) refresh(); });

(async function boot() {
  try {
    const st = await api('GET', '/api/status');
    if (st.setup) { showView('setup'); return; }
    await load();
    startApp();
  } catch {
    if (!S.me) showView('login');
  }
})();
