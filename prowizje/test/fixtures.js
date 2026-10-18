// Syntetyczne raporty o układzie kolumn jak w systemie hotelowym (bez prawdziwych danych gości).
import ExcelJS from 'exceljs';

const utc = (y, m, d, h = 0, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi));

export async function reservationsXlsx(rows) {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Sheet');
  ws.getCell('A1').value = 'Hotel testowy';
  ws.getCell('G1').value = 'Lista rezerwacji';
  const h = ws.getRow(7);
  h.getCell(1).value = 'Nr rezerwacji'; h.getCell(6).value = 'Zamawiający'; h.getCell(9).value = 'Przyjazd'; h.getCell(10).value = 'Wyjazd';
  rows.forEach(([nr, guest, from, to], i) => {
    const r = ws.getRow(8 + i);
    r.getCell(1).value = nr; r.getCell(6).value = guest;
    r.getCell(9).value = utc(...from); r.getCell(10).value = utc(...to);
    r.getCell(9).numFmt = r.getCell(10).numFmt = 'dd/mm/yyyy';
  });
  ws.getRow(8 + rows.length).getCell(1).value = 'RH2 1.4.500';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function mealsXlsx(code, rows) {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Sheet');
  ws.getCell('A1').value = 'Hotel testowy';
  ws.getCell('G1').value = 'Księgowania wg kodów';
  ws.getCell('G3').value = `Doby:01/10/2026 - 17/10/2026  Kod:${code}  Wg daty sprzedaży`;
  ws.getRow(7).getCell(1).value = 'Usługa / płatność';
  ws.getRow(10).getCell(1).value = code === 505 ? '505  Śniadanie dokupione w hotelu' : '518  Obiadokolacja dokupiona w hotelu';
  rows.forEach(([when, room, name, stay, bill, val], i) => {
    const r = ws.getRow(11 + i);
    r.getCell(1).value = utc(...when); r.getCell(1).numFmt = 'dd/mm/yyyy hh:mm';
    r.getCell(4).value = 'XX';
    if (room) r.getCell(6).value = room;
    r.getCell(10).value = name; r.getCell(14).value = stay; r.getCell(19).value = bill; r.getCell(25).value = val;
  });
  const sum = ws.getRow(12 + rows.length);
  sum.getCell(15).value = `Razem ${code}`;
  sum.getCell(25).value = rows.reduce((a, r) => a + r[5], 0);
  ws.getRow(14 + rows.length).getCell(2).value = '*Korekta*';
  return Buffer.from(await wb.xlsx.writeBuffer());
}
