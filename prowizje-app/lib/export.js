// Eksport podsumowania i wpisów do Excela.
import ExcelJS from 'exceljs';
import { CATEGORIES, CATEGORY_LABELS } from './calc.js';

const STATUS = { pending: 'Oczekuje', approved: 'Zatwierdzona', rejected: 'Anulowana' };
const MONEY = '#,##0.00 "zł"';

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
  row.alignment = { vertical: 'middle', wrapText: true };
}

export async function buildWorkbook({ month, summary, entries, settings }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rejestr prowizji';

  const ws = wb.addWorksheet('Podsumowanie');
  ws.addRow([`Podsumowanie prowizji – ${month}`]).font = { bold: true, size: 14 };
  ws.addRow([`Stawki: rezerwacje ${settings.rate_rezerwacje}%, śniadania ${settings.rate_sniadania}%, obiadokolacje ${settings.rate_obiadokolacje}%, upsell ${settings.rate_upsell}%, VAT ${settings.vat}% (prowizja liczona od kwoty netto). Uwzględniono tylko zatwierdzone wpisy.`]);
  ws.addRow([`Parking: ${summary.parking.amount.toFixed(2)} zł / ${summary.parking.participants} os. = ${summary.parking.share.toFixed(2)} zł na osobę`]);
  ws.addRow([]);
  const head = ['Pracownik'];
  for (const c of CATEGORIES) head.push(`${CATEGORY_LABELS[c]} – wartość`, `${CATEGORY_LABELS[c]} – prowizja`);
  head.push('Parking', 'RAZEM prowizja', 'Oczekujące (niezatwierdzone)');
  styleHeader(ws.addRow(head));
  for (const r of summary.rows) {
    const line = [r.name];
    for (const c of CATEGORIES) line.push(r.cat[c].value, r.cat[c].commission);
    line.push(r.parking, r.total, r.pending);
    ws.addRow(line);
  }
  const t = summary.totals;
  const totalLine = ['RAZEM'];
  for (const c of CATEGORIES) totalLine.push(t.cat[c].value, t.cat[c].commission);
  totalLine.push(t.parking, t.total, t.pending);
  ws.addRow(totalLine).font = { bold: true };
  ws.getColumn(1).width = 26;
  for (let i = 2; i <= head.length; i++) {
    ws.getColumn(i).width = 16;
    ws.getColumn(i).numFmt = MONEY;
  }

  for (const c of CATEGORIES) {
    const s = wb.addWorksheet(CATEGORY_LABELS[c]);
    const cols = c === 'rezerwacje'
      ? [['Pracownik', 22], ['Nr rezerwacji', 14], ['Gość', 26], ['Przyjazd', 12], ['Wyjazd', 12], ['Nr rachunku', 14]]
      : [['Pracownik', 22], ['Data', 18], ['Nazwisko / apartament / opis', 28], ['Pobyt', 14], ['Nr rachunku', 14]];
    cols.push(['Wartość', 14], ['Prowizja', 12], ['Status', 14], ['Uwagi', 30]);
    styleHeader(s.addRow(cols.map((x) => x[0])));
    cols.forEach((x, i) => { s.getColumn(i + 1).width = x[1]; });
    for (const e of entries.filter((x) => x.category === c)) {
      const flags = [e.is_duplicate ? 'POWIELONA' : '', e.is_cancellation ? 'ANULACJA' : '', e.note || '', e.admin_note ? `Admin: ${e.admin_note}` : '']
        .filter(Boolean).join('; ');
      const base = c === 'rezerwacje'
        ? [e.user_name, e.ref_no, e.guest, e.stay_from, e.stay_to, e.bill_no]
        : [e.user_name, e.op_date, e.guest, e.stay_text || [e.stay_from, e.stay_to].filter(Boolean).join(' – '), e.bill_no];
      const row = s.addRow([...base, e.value, e.commission, STATUS[e.status] || e.status, flags]);
      row.getCell(base.length + 1).numFmt = MONEY;
      row.getCell(base.length + 2).numFmt = MONEY;
      if (e.status === 'rejected') row.font = { strike: true, color: { argb: 'FF888888' } };
      else if (e.is_duplicate || e.is_cancellation) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    }
  }
  return wb.xlsx.writeBuffer();
}
