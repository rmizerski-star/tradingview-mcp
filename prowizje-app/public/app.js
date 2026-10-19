// Rejestr prowizji – interfejs (vanilla JS, bez budowania).
const CATS = ['rezerwacje', 'sniadania', 'obiadokolacje', 'upsell'];
const LABEL = { rezerwacje: 'Rezerwacje', sniadania: 'Śniadania', obiadokolacje: 'Obiadokolacje', upsell: 'Upsell' };
const STATUS = { pending: 'Oczekuje', approved: 'Zatwierdzona', rejected: 'Anulowana' };

const state = { user: null, settings: null, view: 'rejestr', cat: 'rezerwacje', users: [], filterUser: '', filterStatus: '' };
const $ = (s) => document.querySelector(s);
const pln = (n) => `${Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const isAdmin = () => state.user?.role === 'admin';
const month = () => $('#month').value;

// Budowanie elementów (textContent – dane z Excela nie są interpretowane jako HTML).
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast${err ? ' err' : ''}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), err ? 6000 : 3000);
}

async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.raw) { init.body = opts.raw; init.headers['Content-Type'] = 'application/octet-stream'; }
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(path, init);
  if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error('Sesja wygasła – zaloguj się ponownie.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd ${res.status}`);
  return data;
}

const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

function badges(e) {
  return [
    h('span', { class: `badge b-${e.status}` }, STATUS[e.status]),
    e.is_duplicate ? h('span', { class: 'badge b-warn', title: 'Ten nr rezerwacji występuje już w innym miesiącu lub u innego pracownika' }, 'POWIELONA') : null,
    e.is_cancellation ? h('span', { class: 'badge b-warn', title: 'Rachunek z wartością ujemną (anulacja) – sprawdź parę +/−' }, 'ANULACJA') : null,
  ];
}

// ---------- logowanie ----------
function showLogin() {
  state.user = null;
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    await api('/api/login', { method: 'POST', body: { login: f.get('login'), password: f.get('password') } });
    $('#login-error').textContent = '';
    ev.target.reset();
    await boot();
  } catch (e) { $('#login-error').textContent = e.message; }
});

$('#logout').addEventListener('click', safe(async () => { await api('/api/logout', { method: 'POST' }); showLogin(); }));
$('#month').addEventListener('change', () => render());

async function boot() {
  try {
    const me = await api('/api/me');
    state.user = me.user;
    state.settings = me.settings;
  } catch { showLogin(); return; }
  state.users = (await api('/api/users')).users;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#who').textContent = `${state.user.name}${isAdmin() ? ' (administrator)' : ''}`;
  if (!$('#month').value) {
    const d = new Date();
    $('#month').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  render();
}

function nav() {
  const items = [['rejestr', 'Rejestr prowizji'], ['import', 'Import z Excela'], ['podsumowanie', 'Podsumowanie']];
  if (isAdmin()) items.push(['pracownicy', 'Pracownicy'], ['ustawienia', 'Ustawienia']);
  items.push(['konto', 'Moje konto']);
  $('#nav').replaceChildren(...items.map(([k, l]) => h('a', {
    href: '#', class: state.view === k ? 'active' : '', onclick: (e) => { e.preventDefault(); state.view = k; render(); },
  }, l)));
}

async function render() {
  nav();
  const v = $('#view');
  v.replaceChildren(h('p', { class: 'muted' }, 'Ładowanie…'));
  try {
    const fn = { rejestr: viewRegister, import: viewImport, podsumowanie: viewSummary, pracownicy: viewUsers, ustawienia: viewSettings, konto: viewAccount }[state.view];
    v.replaceChildren(...[await fn()].flat());
  } catch (e) { v.replaceChildren(h('p', { class: 'error' }, e.message)); }
}

function employeeSelect(value, onchange, withAll = false) {
  return h('label', {}, 'Pracownik',
    h('select', { onchange: (e) => onchange(e.target.value) },
      withAll ? h('option', { value: '' }, '— wszyscy —') : null,
      state.users.filter((u) => u.active).map((u) => h('option', { value: u.id, selected: String(u.id) === String(value) || null }, u.name))));
}

// ---------- rejestr (4 tabele) ----------
function entryForm(cat, onSaved) {
  const f = {};
  const inp = (name, label, attrs = {}) => h('label', {}, label, f[name] = h('input', { name, ...attrs }));
  let owner = state.user.id;
  const fields = cat === 'rezerwacje'
    ? [inp('ref_no', 'Nr rezerwacji', { placeholder: '26/012803', required: true }), inp('guest', 'Imię i nazwisko gościa'),
      inp('stay_from', 'Przyjazd', { type: 'date' }), inp('stay_to', 'Wyjazd', { type: 'date' }), inp('bill_no', 'Nr rachunku'),
      inp('value', 'Wartość rezerwacji (brutto)', { inputmode: 'decimal', required: true })]
    : [inp('guest', cat === 'upsell' ? 'Gość / opis usługi' : 'Nazwisko lub apartament prywatny'),
      inp('stay_text', 'Pobyt', { placeholder: '12/10-13/10' }), inp('bill_no', 'Nr rachunku'),
      inp('value', 'Wartość (brutto, ujemna = anulacja)', { inputmode: 'decimal', required: true })];
  const form = h('form', { class: 'card', onsubmit: safe(async (ev) => {
    ev.preventDefault();
    const body = { category: cat, month: month(), user_id: owner };
    for (const [k, el] of Object.entries(f)) body[k] = el.value;
    await api('/api/entries', { method: 'POST', body });
    form.reset();
    toast('Dodano wpis – oczekuje na zatwierdzenie.');
    onSaved();
  }) },
  h('h2', {}, `Dodaj ręcznie – ${LABEL[cat]} (miesiąc ${month()})`),
  h('div', { class: 'row' }, isAdmin() ? employeeSelect(owner, (v) => { owner = v; }) : null, fields, inp('note', 'Uwagi'), h('button', { type: 'submit' }, 'Dodaj')));
  return form;
}

async function viewRegister() {
  const cat = state.cat;
  const q = new URLSearchParams({ month: month(), category: cat });
  if (state.filterUser) q.set('user_id', state.filterUser);
  if (state.filterStatus) q.set('status', state.filterStatus);
  const { entries } = await api(`/api/entries?${q}`);
  const selected = new Set();

  const tabs = h('div', { class: 'tabs' }, CATS.map((c) => h('button', { class: c === cat ? 'active' : '', onclick: () => { state.cat = c; render(); } }, LABEL[c])));
  const filters = h('div', { class: 'row', style: 'margin-bottom:10px' },
    isAdmin() ? employeeSelect(state.filterUser, (v) => { state.filterUser = v; render(); }, true) : null,
    h('label', {}, 'Status', h('select', { onchange: (e) => { state.filterStatus = e.target.value; render(); } },
      h('option', { value: '' }, '— wszystkie —'),
      Object.entries(STATUS).map(([k, l]) => h('option', { value: k, selected: state.filterStatus === k || null }, l)))));

  const decide = (status) => safe(async () => {
    if (!selected.size) return toast('Zaznacz wpisy.', true);
    await api('/api/entries/decide', { method: 'POST', body: { ids: [...selected], status } });
    toast(status === 'approved' ? 'Zatwierdzono.' : status === 'rejected' ? 'Anulowano.' : 'Przywrócono do oczekujących.');
    render();
  });
  const adminBar = isAdmin() ? h('div', { class: 'row', style: 'margin-bottom:10px' },
    h('button', { class: 'ok', onclick: decide('approved') }, 'Zatwierdź zaznaczone'),
    h('button', { class: 'bad', onclick: decide('rejected') }, 'Anuluj zaznaczone'),
    h('button', { class: 'ghost', onclick: decide('pending') }, 'Cofnij do oczekujących')) : null;

  const res = cat === 'rezerwacje';
  const head = [isAdmin() ? h('input', { type: 'checkbox', onchange: (e) => {
    document.querySelectorAll('input.sel').forEach((c) => { c.checked = e.target.checked; c.dispatchEvent(new Event('change')); });
  } }) : '', isAdmin() ? 'Pracownik' : null,
  ...(res ? ['Nr rezerwacji', 'Gość', 'Przyjazd', 'Wyjazd', 'Nr rachunku'] : ['Data', 'Nazwisko / opis', 'Pobyt', 'Nr rachunku']),
  'Wartość', 'Prowizja', 'Status', 'Uwagi', ''].filter((x) => x !== null);

  const editable = (e) => isAdmin() || (e.user_id === state.user.id && e.status === 'pending');
  const rows = entries.map((e) => {
    const cells = res ? [e.ref_no, e.guest, e.stay_from, e.stay_to] : [e.op_date || '', e.guest, e.stay_text || [e.stay_from, e.stay_to].filter(Boolean).join(' – ')];
    const bill = h('input', { value: e.bill_no || '', placeholder: 'nr rachunku', disabled: !editable(e) || null });
    const val = h('input', { value: e.value, inputmode: 'decimal', disabled: !editable(e) || null, class: 'num' });
    const save = safe(async () => {
      await api(`/api/entries/${e.id}`, { method: 'PUT', body: { bill_no: bill.value, value: val.value } });
      toast('Zapisano.');
      render();
    });
    return h('tr', { class: e.status === 'rejected' ? 'rejected' : (e.is_duplicate || e.is_cancellation ? 'flagged' : '') },
      isAdmin() ? h('td', {}, h('input', { type: 'checkbox', class: 'sel', onchange: (ev) => (ev.target.checked ? selected.add(e.id) : selected.delete(e.id)) })) : h('td'),
      isAdmin() ? h('td', {}, e.user_name) : null,
      cells.map((c) => h('td', {}, c ?? '')),
      h('td', {}, bill), h('td', { class: 'num' }, val),
      h('td', { class: 'num' }, pln(e.commission)),
      h('td', {}, badges(e)),
      h('td', { class: 'muted' }, [e.note, e.admin_note && `Admin: ${e.admin_note}`].filter(Boolean).join(' · ')),
      h('td', {}, editable(e) ? [h('button', { class: 'small', onclick: save }, 'Zapisz'), ' ',
        h('button', { class: 'small bad', onclick: safe(async () => {
          if (!confirm('Usunąć wpis?')) return;
          await api(`/api/entries/${e.id}`, { method: 'DELETE' });
          render();
        }) }, 'Usuń')] : ''));
  });
  const live = entries.filter((e) => e.status !== 'rejected');
  const sum = (list, k) => list.reduce((s, e) => s + e[k], 0);
  const appr = entries.filter((e) => e.status === 'approved');
  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat' }, 'Wartość (bez wpisów anulowanych przez admina)', h('b', {}, pln(sum(live, 'value')))),
    h('div', { class: 'stat' }, 'Prowizja zatwierdzona', h('b', {}, pln(sum(appr, 'commission')))),
    h('div', { class: 'stat' }, 'Prowizja oczekująca', h('b', {}, pln(sum(entries.filter((e) => e.status === 'pending'), 'commission')))),
    h('div', { class: 'stat' }, 'Stawka', h('b', {}, `${state.settings[`rate_${cat}`]}% od netto (VAT ${state.settings.vat}%)`)));

  return [tabs, entryForm(cat, render), h('div', { class: 'card' }, h('h2', {}, `${LABEL[cat]} – ${month()}`), stats, filters, adminBar,
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: head.length, class: 'muted' }, 'Brak wpisów w tym miesiącu.'))))))];
}

// ---------- import ----------
async function viewImport() {
  let kind = 'rezerwacje';
  let owner = state.user.id;
  const out = h('div');
  const file = h('input', { type: 'file', accept: '.xlsx' });
  const kindSel = h('select', { onchange: (e) => { kind = e.target.value; } },
    h('option', { value: 'rezerwacje' }, 'Rezerwacje (lista rezerwacji)'),
    h('option', { value: 'sniadania' }, 'Śniadania (księgowania wg kodów)'),
    h('option', { value: 'obiadokolacje' }, 'Obiadokolacje (księgowania wg kodów)'),
    h('option', { value: 'upsell' }, 'Upsell (format jak księgowania wg kodów)'));

  const preview = safe(async () => {
    if (!file.files[0]) return toast('Wybierz plik .xlsx', true);
    const q = new URLSearchParams({ kind, month: month(), user_id: owner });
    const data = await api(`/api/import/preview?${q}`, { method: 'POST', raw: await file.files[0].arrayBuffer() });
    if (data.suggestedCategory && data.suggestedCategory !== kind && kind !== 'rezerwacje' && kind !== 'upsell') {
      toast(`Uwaga: plik wygląda na raport „${LABEL[data.suggestedCategory]}”, a wybrano „${LABEL[kind]}”.`, true);
    }
    out.replaceChildren(importPreview(kind, owner, data));
  });

  return [h('div', { class: 'card' }, h('h2', {}, 'Import z Excela'),
    h('p', { class: 'muted' }, 'Rezerwacje: A = nr rezerwacji, F = gość, I/J = pobyt; wartość rezerwacji i nr rachunku uzupełniasz w podglądzie. ',
      'Śniadania / obiadokolacje: J = nazwisko lub apartament prywatny, N = pobyt, S = nr rachunku (jeśli brak – wpisz ręcznie), Y = wartość.'),
    h('div', { class: 'row' }, h('label', {}, 'Rodzaj raportu', kindSel), isAdmin() ? employeeSelect(owner, (v) => { owner = v; }) : null,
      h('label', {}, 'Plik', file), h('button', { onclick: preview }, 'Wczytaj podgląd'))), out];
}

function importPreview(kind, owner, data) {
  const res = kind === 'rezerwacje';
  const imMonth = h('input', { type: 'month', value: data.month || month() });
  const rows = data.rows.map((r) => ({ ...r, include: !r.already_imported }));
  const trs = rows.map((r) => {
    const bill = h('input', { value: r.bill_no || '', placeholder: 'nr rachunku', oninput: (e) => { r.bill_no = e.target.value; } });
    const val = h('input', { value: r.value ?? '', placeholder: res ? 'wartość' : '', inputmode: 'decimal', oninput: (e) => { r.value = e.target.value; } });
    const flags = [
      r.already_imported ? h('span', { class: 'badge b-rejected' }, 'JUŻ ZAIMPORTOWANO') : null,
      r.duplicate_of ? h('span', { class: 'badge b-warn', title: `Pierwszy raz: ${r.duplicate_of}` }, `POWIELONA (${r.duplicate_of})`) : null,
      r.cancellation ? h('span', { class: 'badge b-warn' }, 'ANULACJA') : null,
    ];
    return h('tr', { class: r.duplicate_of || r.cancellation ? 'flagged' : '' },
      h('td', {}, h('input', { type: 'checkbox', checked: r.include, onchange: (e) => { r.include = e.target.checked; } })),
      res ? [h('td', {}, r.ref_no), h('td', {}, r.guest), h('td', {}, r.stay_from || ''), h('td', {}, r.stay_to || '')]
        : [h('td', {}, r.op_date), h('td', {}, r.guest), h('td', {}, r.stay_text)],
      h('td', {}, bill), h('td', { class: 'num' }, val), h('td', {}, flags));
  });
  const head = ['', ...(res ? ['Nr rezerwacji', 'Gość', 'Przyjazd', 'Wyjazd'] : ['Data', 'Nazwisko / opis', 'Pobyt']), 'Nr rachunku', 'Wartość', 'Oznaczenia'];
  const commit = safe(async () => {
    const chosen = rows.filter((r) => r.include);
    if (!chosen.length) return toast('Nie zaznaczono wierszy.', true);
    const missing = chosen.filter((r) => r.value === null || r.value === '');
    if (missing.length) return toast(`Uzupełnij wartość w ${missing.length} wierszach (lub odznacz je).`, true);
    const result = await api('/api/import/commit', { method: 'POST', body: { category: kind, month: imMonth.value, user_id: owner, rows: chosen } });
    const msg = [`Dodano: ${result.added}`, result.skipped.length && `Pominięto: ${result.skipped.length}`, ...result.errors].filter(Boolean).join('\n');
    toast(msg, result.errors.length > 0);
    if (result.added) { state.view = 'rejestr'; state.cat = kind; $('#month').value = imMonth.value; render(); }
  });
  return h('div', { class: 'card' },
    h('h2', {}, `Podgląd importu – ${LABEL[kind]} (${rows.length} wierszy)`),
    h('div', { class: 'row', style: 'margin-bottom:10px' }, h('label', {}, 'Miesiąc rozliczenia', imMonth), h('button', { class: 'ok', onclick: commit }, 'Importuj zaznaczone')),
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, trs))));
}

// ---------- podsumowanie ----------
async function viewSummary() {
  const s = await api(`/api/summary?month=${month()}`);
  const parts = [];
  if (isAdmin()) {
    const { parking } = await api(`/api/parking/${month()}`);
    const amount = h('input', { value: parking.amount || '', inputmode: 'decimal', placeholder: '0,00' });
    parts.push(h('div', { class: 'card' }, h('h2', {}, `Prowizja za parking – ${month()}`),
      h('p', { class: 'muted' }, `Kwota dzielona równo na pracowników uczestniczących w podziale (${s.parking.participants} os., ustawienie w zakładce Pracownicy) – niezależnie od tego, czy mają inne prowizje.`),
      h('div', { class: 'row' }, h('label', {}, 'Kwota (zł)', amount), h('button', { onclick: safe(async () => {
        await api(`/api/parking/${month()}`, { method: 'PUT', body: { amount: amount.value } });
        toast('Zapisano kwotę parkingu.');
        render();
      }) }, 'Zapisz'), h('span', { class: 'muted' }, `Na osobę: ${pln(s.parking.share)}`))));
  }
  const head = ['Pracownik', ...CATS.flatMap((c) => [`${LABEL[c]} wartość`, `${LABEL[c]} prowizja`]), 'Parking', 'RAZEM', 'Oczekujące'];
  const line = (name, r, cls) => h('tr', { class: cls }, h('td', {}, name),
    CATS.flatMap((c) => [h('td', { class: 'num' }, pln(r.cat[c].value)), h('td', { class: 'num' }, pln(r.cat[c].commission))]),
    h('td', { class: 'num' }, pln(r.parking)), h('td', { class: 'num' }, h('b', {}, pln(r.total))),
    h('td', { class: 'num muted' }, r.pending_count === undefined ? pln(r.pending) : `${pln(r.pending)} (${r.pending_count})`));
  const body = s.rows.map((r) => line(r.name, r));
  if (s.totals) body.push(line('RAZEM', s.totals, 'total'));
  parts.push(h('div', { class: 'card' },
    h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' },
      h('h2', { style: 'margin:0' }, `${isAdmin() ? 'Podsumowanie wszystkich pracowników' : 'Moje podsumowanie'} – ${month()}`),
      h('a', { href: `/api/export?month=${month()}` }, h('button', {}, 'Eksport do Excela'))),
    h('p', { class: 'muted' }, 'Prowizje liczone tylko z zatwierdzonych wpisów; kolumna „Oczekujące” pokazuje wpisy czekające na decyzję administratora.'),
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, head.map((x) => h('th', { class: x === 'Pracownik' ? '' : 'num' }, x)))), h('tbody', {}, body)))));
  return parts;
}

// ---------- pracownicy (admin) ----------
async function viewUsers() {
  state.users = (await api('/api/users')).users;
  const f = {};
  const inp = (n, l, a = {}) => h('label', {}, l, f[n] = h('input', { name: n, ...a }));
  const add = h('form', { class: 'card', onsubmit: safe(async (ev) => {
    ev.preventDefault();
    await api('/api/users', { method: 'POST', body: { login: f.login.value, name: f.name.value, password: f.password.value, role: f.role.value, parking_share: f.share.checked } });
    toast('Dodano pracownika.');
    render();
  }) }, h('h2', {}, 'Dodaj pracownika'),
  h('div', { class: 'row' }, inp('name', 'Imię i nazwisko', { required: true }), inp('login', 'Login', { required: true }),
    inp('password', 'Hasło (min. 6 znaków)', { type: 'text', required: true }),
    h('label', {}, 'Rola', f.role = h('select', {}, h('option', { value: 'employee' }, 'Pracownik'), h('option', { value: 'admin' }, 'Administrator'))),
    h('label', {}, 'Udział w parkingu', f.share = h('input', { type: 'checkbox', checked: true })),
    h('button', { type: 'submit' }, 'Dodaj')));

  const rows = state.users.map((u) => {
    const upd = (body) => safe(async () => { await api(`/api/users/${u.id}`, { method: 'PUT', body }); toast('Zapisano.'); render(); });
    return h('tr', { class: u.active ? '' : 'rejected' }, h('td', {}, u.name), h('td', {}, u.login),
      h('td', {}, h('select', { onchange: (e) => upd({ role: e.target.value })() },
        h('option', { value: 'employee', selected: u.role === 'employee' || null }, 'Pracownik'),
        h('option', { value: 'admin', selected: u.role === 'admin' || null }, 'Administrator'))),
      h('td', {}, h('input', { type: 'checkbox', checked: u.parking_share, onchange: (e) => upd({ parking_share: e.target.checked })() })),
      h('td', {}, h('input', { type: 'checkbox', checked: u.active, onchange: (e) => upd({ active: e.target.checked })() })),
      h('td', {}, h('button', { class: 'small ghost', onclick: () => {
        const p = prompt(`Nowe hasło dla ${u.name} (min. 6 znaków):`);
        if (p) upd({ password: p })();
      } }, 'Zmień hasło')));
  });
  return [add, h('div', { class: 'card' }, h('h2', {}, 'Pracownicy'), h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Imię i nazwisko', 'Login', 'Rola', 'Udział w parkingu', 'Aktywny', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows))))];
}

// ---------- ustawienia (admin) ----------
async function viewSettings() {
  const s = state.settings;
  const f = {};
  const inp = (k, l) => h('label', {}, l, f[k] = h('input', { value: s[k], inputmode: 'decimal' }));
  const method = h('select', {}, h('option', { value: 'divide', selected: s.vat_method === 'divide' || null }, 'netto = brutto / (1 + VAT)  — kwota zawiera VAT'),
    h('option', { value: 'subtract', selected: s.vat_method === 'subtract' || null }, 'netto = brutto × (1 − VAT)'));
  const example = 1000;
  const net = s.vat_method === 'subtract' ? example * (1 - s.vat / 100) : example / (1 + s.vat / 100);
  return h('form', { class: 'card', onsubmit: safe(async (ev) => {
    ev.preventDefault();
    const body = { vat_method: method.value };
    for (const [k, el] of Object.entries(f)) body[k] = el.value;
    state.settings = (await api('/api/settings', { method: 'PUT', body })).settings;
    toast('Zapisano ustawienia (dotyczą nowo dodawanych wpisów).');
    render();
  }) }, h('h2', {}, 'Stawki prowizji'),
  h('div', { class: 'row' }, inp('rate_rezerwacje', 'Rezerwacje %'), inp('rate_sniadania', 'Śniadania %'), inp('rate_obiadokolacje', 'Obiadokolacje %'),
    inp('rate_upsell', 'Upsell %'), inp('vat', 'VAT %'), h('label', {}, 'Sposób odliczenia VAT', method), h('button', { type: 'submit' }, 'Zapisz')),
  h('p', { class: 'muted' }, `Przykład: rezerwacja ${pln(example)} brutto → netto ${pln(net)} → prowizja ${s.rate_rezerwacje}% = ${pln(net * s.rate_rezerwacje / 100)}. `,
    'Zmiana stawek nie przelicza wpisów już dodanych (każdy wpis zapamiętuje stawkę z chwili dodania).'));
}

// ---------- konto ----------
function viewAccount() {
  const oldP = h('input', { type: 'password', autocomplete: 'current-password' });
  const newP = h('input', { type: 'password', autocomplete: 'new-password' });
  return h('form', { class: 'card', onsubmit: safe(async (ev) => {
    ev.preventDefault();
    await api('/api/me/password', { method: 'POST', body: { old_password: oldP.value, new_password: newP.value } });
    ev.target.reset();
    toast('Hasło zmienione.');
  }) }, h('h2', {}, `Moje konto – ${state.user.name} (${state.user.login})`),
  h('div', { class: 'row' }, h('label', {}, 'Obecne hasło', oldP), h('label', {}, 'Nowe hasło (min. 6 znaków)', newP), h('button', { type: 'submit' }, 'Zmień hasło')));
}

boot();
