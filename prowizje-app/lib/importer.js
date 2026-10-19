// Import raportów z systemu hotelowego (xlsx).
//
// Rezerwacje ("Lista rezerwacji"):
//   A = nr rezerwacji, F = imię i nazwisko gościa (zamawiający), I = przyjazd, J = wyjazd.
//   Wartość rezerwacji i nr rachunku uzupełnia się ręcznie w podglądzie importu.
//
// Śniadania / obiadokolacje ("Księgowania wg kodów"):
//   A = data księgowania, J = nazwisko lub apartament prywatny, N = pobyt, S = nr rachunku, Y = wartość.
//   Brak nr rachunku => do uzupełnienia ręcznie. Wartości ujemne = anulacja.
import ExcelJS from 'exceljs';

function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
  }
  return v;
}

const str = (v) => {
  const x = cellValue(v);
  if (x === null) return '';
  if (x instanceof Date) return isoDate(x);
  return String(x).replace(/_x000D_/g, '').replace(/\s+/g, ' ').trim();
};

function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function isoDateTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${isoDate(d)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// "28/10/2026" lub obiekt Date -> '2026-10-28'
function toDate(v) {
  const x = cellValue(v);
  if (x instanceof Date) return isoDate(x);
  if (typeof x === 'number') return isoDate(new Date(Math.round((x - 25569) * 86400000)));
  const m = String(x ?? '').trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function toNumber(v) {
  const x = cellValue(v);
  if (typeof x === 'number') return x;
  if (x === null || x instanceof Date) return null;
  const s = String(x).replace(/\s/g, '').replace(',', '.');
  return s !== '' && !Number.isNaN(Number(s)) ? Number(s) : null;
}

async function loadSheet(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Plik nie zawiera arkusza.');
  return ws;
}

function headerText(ws) {
  const parts = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 8); r++) {
    ws.getRow(r).eachCell((c) => parts.push(str(c.value)));
  }
  return parts.join(' ');
}

const RES_NO = /^\d{2}\/\d{3,}$/;

export async function parseReservations(buffer) {
  const ws = await loadSheet(buffer);
  const rows = [];
  ws.eachRow((row) => {
    const refNo = str(row.getCell('A').value);
    if (!RES_NO.test(refNo)) return;
    rows.push({
      ref_no: refNo,
      guest: str(row.getCell('F').value),
      stay_from: toDate(row.getCell('I').value),
      stay_to: toDate(row.getCell('J').value),
      bill_no: '',
      value: null,
      import_key: refNo,
    });
  });
  return { rows, suggestedMonth: null };
}

export async function parseMeals(buffer) {
  const ws = await loadSheet(buffer);
  const header = headerText(ws);
  let suggestedCategory = null;
  const rows = [];
  const seen = new Map();
  ws.eachRow((row) => {
    const opDate = cellValue(row.getCell('A').value);
    const value = toNumber(row.getCell('Y').value);
    if (!(opDate instanceof Date) || value === null) return; // nagłówki, "Razem", "*Korekta*" itp.
    const r = {
      op_date: isoDateTime(opDate),
      guest: str(row.getCell('J').value),
      room: str(row.getCell('F').value),
      stay_text: str(row.getCell('N').value),
      bill_no: str(row.getCell('S').value),
      value,
    };
    // Klucz importu – pozwala bezpiecznie zaimportować ten sam plik ponownie (bez dublowania).
    const base = [r.op_date, r.bill_no, r.guest, r.stay_text, r.value].join('|');
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    r.import_key = `${base}|${n}`;
    rows.push(r);
  });
  // Kategoria z linii "505 Śniadanie ..." / "518 Obiadokolacja ...", miesiąc z "Doby:01/10/2026 - ..."
  ws.eachRow((row) => {
    const t = str(row.getCell('A').value);
    if (/^\d+\s+śniadan/i.test(t)) suggestedCategory = 'sniadania';
    else if (/^\d+\s+obiadokolac/i.test(t)) suggestedCategory = 'obiadokolacje';
  });
  const m = header.match(/Doby:\s*\d{1,2}\/(\d{1,2})\/(\d{4})/);
  const suggestedMonth = m ? `${m[2]}-${m[1].padStart(2, '0')}` : null;
  return { rows, suggestedMonth, suggestedCategory };
}
