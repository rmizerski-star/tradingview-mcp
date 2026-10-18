// Odczyt raportów z systemu hotelowego (.xlsx).
// Rezerwacje: A nr rezerwacji, F gość, I przyjazd, J wyjazd.
// Śniadania (kod 505) / obiadokolacje (kod 518): A data księgowania, F pokój, J nazwisko/app., N pobyt, S nr rachunku, Y wartość.
import ExcelJS from 'exceljs';

const COL = { A: 1, F: 6, I: 9, J: 10, N: 14, S: 19, Y: 25 };
const pad = n => String(n).padStart(2, '0');
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();

function plain(v) {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return plain(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v ?? null;
}

// exceljs zwraca daty jako Date w UTC (numer seryjny Excela traktowany jako UTC)
function toYmd(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  }
  return '';
}

function toNum(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\s| /g, '').replace(',', '.');
  return s ? Number(s) : NaN;
}

export function detectType(ws) {
  let hdr = -1, t = 'auto';
  const last = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= last; r++) {
    for (let c = 1; c <= 31; c++) {
      const v = String(plain(ws.getRow(r).getCell(c).value) ?? '');
      if (c === 1 && v.trim() === 'Nr rezerwacji') hdr = r;
      if (t === 'auto') {
        if (/Lista rezerwacji/i.test(v)) t = 'rez';
        else if (/Kod:\s*505|Śniadani/i.test(v)) t = 'sn';
        else if (/Kod:\s*518|Obiadokolacj/i.test(v)) t = 'ko';
      }
    }
  }
  if (t === 'auto' && hdr > 0) t = 'rez';
  return { t, hdr };
}

export function parseWorksheet(ws, forced = 'auto') {
  const det = detectType(ws);
  const t = forced && forced !== 'auto' ? forced : det.t;
  if (t === 'auto') return { error: 'Nie rozpoznano rodzaju raportu. Wybierz go ręcznie i wczytaj plik ponownie.' };
  const rows = [], seen = {};
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r), cell = c => plain(row.getCell(c).value);
    if (t === 'rez') {
      if (det.hdr > 0 && r <= det.hdr) continue;
      const a = clean(cell(COL.A)), from = toYmd(cell(COL.I)), to = toYmd(cell(COL.J));
      if (!a || !from || !/\d/.test(a)) continue;
      rows.push({ resNo: a, guest: clean(cell(COL.F)), from, to, bill: '', val: null, sig: `rez|${a}` });
    } else {
      const a = cell(COL.A), y = toNum(cell(COL.Y));
      if (!(a instanceof Date) || !isFinite(y) || y === 0) continue;
      const bill = clean(cell(COL.S));
      const base = `${t}|${a.getTime()}|${bill}|${y}`;
      seen[base] = (seen[base] || 0) + 1;
      rows.push({
        d: toYmd(a), guest: clean(cell(COL.J)), room: clean(cell(COL.F)), stay: clean(cell(COL.N)),
        bill, val: y, sig: `${base}|${seen[base]}`,
      });
    }
  }
  return { t, rows };
}

export async function parseWorkbook(buffer, forced = 'auto') {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { error: 'Nie udało się odczytać pliku. Obsługiwany jest format .xlsx — zapisz raport jako .xlsx i spróbuj ponownie.' };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { error: 'Plik nie zawiera arkusza.' };
  return parseWorksheet(ws, forced);
}
