const ExcelJS = require('exceljs');
const path = require('path');

async function createTradingJournal() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TradingView MCP';
  wb.created = new Date();

  // ─── Colors & styles ────────────────────────────────────────────────────────
  const DARK_BG    = 'FF1A1A2E';
  const MID_BG     = 'FF16213E';
  const ACCENT     = 'FF0F3460';
  const GOLD       = 'FFE94560';
  const HEADER_FG  = 'FFFFFFFF';
  const LABEL_FG   = 'FFADB5BD';
  const INPUT_FG   = 'FFFFFFFF';
  const GREEN_FG   = 'FF52B788';
  const RED_FG     = 'FFEF233C';
  const YELLOW_FG  = 'FFFFD60A';
  const BORDER_CLR = 'FF2D3561';

  const headerFont  = { name: 'Arial', bold: true, size: 11, color: { argb: HEADER_FG } };
  const labelFont   = { name: 'Arial', size: 10, color: { argb: LABEL_FG } };
  const inputFont   = { name: 'Arial', size: 10, color: { argb: INPUT_FG } };
  const titleFont   = { name: 'Arial', bold: true, size: 14, color: { argb: GOLD } };
  const subFont     = { name: 'Arial', bold: true, size: 11, color: { argb: YELLOW_FG } };

  const thinBorder = {
    top:    { style: 'thin', color: { argb: BORDER_CLR } },
    left:   { style: 'thin', color: { argb: BORDER_CLR } },
    bottom: { style: 'thin', color: { argb: BORDER_CLR } },
    right:  { style: 'thin', color: { argb: BORDER_CLR } },
  };

  const center = { horizontal: 'center', vertical: 'middle' };
  const left   = { horizontal: 'left',   vertical: 'middle' };

  function bg(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }

  function styleRow(sheet, row, fillArgb, font, alignment) {
    row.eachCell({ includeEmpty: true }, cell => {
      if (fillArgb) cell.fill = bg(fillArgb);
      if (font)     cell.font = font;
      if (alignment) cell.alignment = alignment;
      cell.border = thinBorder;
    });
  }

  // ─── Sheet 1: DZIENNIK ──────────────────────────────────────────────────────
  const ws = wb.addWorksheet('📋 Dziennik', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }],
    properties: { tabColor: { argb: GOLD } },
  });

  ws.views = [{ showGridLines: false }];

  // Column widths
  const colDefs = [
    { key: 'nr',        width: 5  },
    { key: 'data',      width: 12 },
    { key: 'godz',      width: 8  },
    { key: 'instr',     width: 12 },
    { key: 'dir',       width: 8  },
    { key: 'tf',        width: 8  },
    { key: 'setup',     width: 18 },
    { key: 'entry',     width: 10 },
    { key: 'sl',        width: 10 },
    { key: 'tp',        width: 10 },
    { key: 'exit',      width: 10 },
    { key: 'size',      width: 8  },
    { key: 'risk_pct',  width: 8  },
    { key: 'rr_plan',   width: 8  },
    { key: 'rr_real',   width: 8  },
    { key: 'pnl_r',     width: 8  },
    { key: 'pnl_usd',   width: 10 },
    { key: 'plan_ok',   width: 9  },
    { key: 'emocje',    width: 14 },
    { key: 'uwagi',     width: 30 },
  ];
  ws.columns = colDefs;

  // Row 1: title banner
  ws.mergeCells('A1:T1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '📊  DZIENNIK TRADERA';
  titleCell.font = { name: 'Arial', bold: true, size: 16, color: { argb: GOLD } };
  titleCell.fill = bg(DARK_BG);
  titleCell.alignment = center;
  titleCell.border = thinBorder;
  ws.getRow(1).height = 30;

  // Row 2: section labels
  const sectionLabels = [
    ['A2:C2', 'ID / DATA'],
    ['D2:F2', 'INSTRUMENT'],
    ['G2:G2', 'SETUP'],
    ['H2:K2', 'CENY'],
    ['L2:N2', 'ZARZĄDZANIE RYZYKIEM'],
    ['O2:Q2', 'WYNIK'],
    ['R2:T2', 'PSYCHOLOGIA'],
  ];
  sectionLabels.forEach(([range, label]) => {
    ws.mergeCells(range);
    const c = ws.getCell(range.split(':')[0]);
    c.value = label;
    c.font = { name: 'Arial', bold: true, size: 9, color: { argb: YELLOW_FG } };
    c.fill = bg(ACCENT);
    c.alignment = center;
    c.border = thinBorder;
  });
  ws.getRow(2).height = 18;

  // Row 3: column headers
  const headers = [
    'Nr', 'Data', 'Godz.', 'Instrument', 'Kier.', 'TF',
    'Setup', 'Entry', 'Stop Loss', 'Take Profit', 'Exit',
    'Rozmiar', 'Ryzyko%', 'R:R plan', 'R:R real',
    'Wynik R', 'Wynik $', 'Plan?', 'Emocje', 'Uwagi',
  ];
  const hRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = bg(MID_BG);
    cell.alignment = center;
    cell.border = thinBorder;
  });
  hRow.height = 22;

  // Rows 4–53: 50 data rows
  for (let r = 4; r <= 53; r++) {
    const row = ws.getRow(r);
    const fillColor = r % 2 === 0 ? 'FF1E1E32' : 'FF22223A';

    // Nr (formula)
    row.getCell(1).value = { formula: `=ROW()-3` };
    row.getCell(1).font = { name: 'Arial', size: 9, color: { argb: LABEL_FG } };
    row.getCell(1).alignment = center;

    // Wynik R = (Exit - Entry) / (Entry - SL) * direction
    // Simplified: user fills H,I,K; formula in P
    const rExitCol  = 'K';
    const rEntryCol = 'H';
    const rSLCol    = 'I';
    const rTPCol    = 'J';

    row.getCell(14).value = { formula: `=IFERROR(IF(${rTPCol}${r}<>"",ABS((${rTPCol}${r}-${rEntryCol}${r})/(${rEntryCol}${r}-${rSLCol}${r})),"-"),"-")` };
    row.getCell(15).value = { formula: `=IFERROR(IF(${rExitCol}${r}<>"",ABS((${rExitCol}${r}-${rEntryCol}${r})/(${rEntryCol}${r}-${rSLCol}${r})),"-"),"-")` };
    row.getCell(16).value = { formula: `=IFERROR(IF(${rExitCol}${r}<>"",IF(E${r}="LONG",(${rExitCol}${r}-${rEntryCol}${r})/(${rEntryCol}${r}-${rSLCol}${r}),(${rEntryCol}${r}-${rExitCol}${r})/(${rSLCol}${r}-${rEntryCol}${r})),"-"),"-")` };

    // Color: Wynik R
    const pnlCell = row.getCell(16);
    // Conditional formatting added separately below

    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c);
      cell.fill = bg(fillColor);
      if (!cell.font || !cell.font.name) cell.font = inputFont;
      if (!cell.alignment || !cell.alignment.horizontal) cell.alignment = center;
      cell.border = thinBorder;
    }
    // Uwagi — left align
    row.getCell(20).alignment = left;
    row.height = 20;
  }

  // Conditional formatting for Wynik R column (P = col 16)
  ws.addConditionalFormatting({
    ref: 'P4:P53',
    rules: [
      { type: 'cellIs', operator: 'greaterThan', formulae: [0], priority: 1,
        style: { font: { color: { argb: GREEN_FG } }, fill: bg('1A52B788') } },
      { type: 'cellIs', operator: 'lessThan', formulae: [0], priority: 2,
        style: { font: { color: { argb: RED_FG } }, fill: bg('1AEF233C') } },
    ],
  });

  // Conditional formatting for Kier. column (E = col 5)
  ws.addConditionalFormatting({
    ref: 'E4:E53',
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'LONG', priority: 1,
        style: { font: { color: { argb: GREEN_FG }, bold: true } } },
      { type: 'containsText', operator: 'containsText', text: 'SHORT', priority: 2,
        style: { font: { color: { argb: RED_FG }, bold: true } } },
    ],
  });

  // Data validation: Kierunek
  ws.dataValidations.add('E4:E53', {
    type: 'list', allowBlank: true, formulae: ['"LONG,SHORT"'],
    showDropDown: false,
  });
  // TF
  ws.dataValidations.add('F4:F53', {
    type: 'list', allowBlank: true, formulae: ['"M1,M5,M15,M30,H1,H4,D1,W1"'],
  });
  // Plan OK
  ws.dataValidations.add('R4:R53', {
    type: 'list', allowBlank: true, formulae: ['"✅ Tak,❌ Nie,⚠️ Częściowo"'],
  });
  // Emocje
  ws.dataValidations.add('S4:S53', {
    type: 'list', allowBlank: true,
    formulae: ['"😊 Neutralne,😰 Stres,😤 Frustracja,🤑 FOMO,😌 Spokój,😴 Znudzenie"'],
  });

  // ─── Sheet 2: STATYSTYKI ──────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('📈 Statystyki', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: GREEN_FG } },
  });
  ws2.columns = [
    { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];

  // Title
  ws2.mergeCells('A1:E1');
  const st = ws2.getCell('A1');
  st.value = '📈  STATYSTYKI KONTA';
  st.font = titleFont;
  st.fill = bg(DARK_BG);
  st.alignment = center;
  st.border = thinBorder;
  ws2.getRow(1).height = 30;

  // Stats definitions: [label, formula pulling from Dziennik sheet]
  const stats = [
    ['Liczba transakcji',       `=COUNTA('📋 Dziennik'!B4:B53)`],
    ['Transakcje LONG',         `=COUNTIF('📋 Dziennik'!E4:E53,"LONG")`],
    ['Transakcje SHORT',        `=COUNTIF('📋 Dziennik'!E4:E53,"SHORT")`],
    ['Zyskowne (R > 0)',        `=COUNTIF('📋 Dziennik'!P4:P53,">0")`],
    ['Stratne (R < 0)',         `=COUNTIF('📋 Dziennik'!P4:P53,"<0")`],
    ['Win Rate',                `=IFERROR(COUNTIF('📋 Dziennik'!P4:P53,">0")/COUNTA('📋 Dziennik'!B4:B53),0)`],
    ['Średni zysk (R)',         `=IFERROR(AVERAGEIF('📋 Dziennik'!P4:P53,">0",'📋 Dziennik'!P4:P53),0)`],
    ['Średnia strata (R)',      `=IFERROR(AVERAGEIF('📋 Dziennik'!P4:P53,"<0",'📋 Dziennik'!P4:P53),0)`],
    ['Expectancy (R)',          `=IFERROR((COUNTIF('📋 Dziennik'!P4:P53,">0")/COUNTA('📋 Dziennik'!B4:B53))*AVERAGEIF('📋 Dziennik'!P4:P53,">0",'📋 Dziennik'!P4:P53)+(COUNTIF('📋 Dziennik'!P4:P53,"<0")/COUNTA('📋 Dziennik'!B4:B53))*AVERAGEIF('📋 Dziennik'!P4:P53,"<0",'📋 Dziennik'!P4:P53),0)`],
    ['Łączny wynik (R)',        `=IFERROR(SUMIF('📋 Dziennik'!P4:P53,"<>-",'📋 Dziennik'!P4:P53),0)`],
    ['Łączny wynik ($)',        `=IFERROR(SUM('📋 Dziennik'!Q4:Q53),0)`],
    ['Najlepszy trade (R)',     `=IFERROR(MAX('📋 Dziennik'!P4:P53),0)`],
    ['Najgorszy trade (R)',     `=IFERROR(MIN('📋 Dziennik'!P4:P53),0)`],
    ['Plan respektowany (%)',   `=IFERROR(COUNTIF('📋 Dziennik'!R4:R53,"✅ Tak")/COUNTA('📋 Dziennik'!B4:B53),0)`],
  ];

  const formatMap = {
    'Win Rate': '0.0%',
    'Plan respektowany (%)': '0.0%',
    'Łączny wynik ($)': '#,##0.00 "$"',
    'Najlepszy trade (R)': '0.00',
    'Najgorszy trade (R)': '0.00',
    'Łączny wynik (R)': '0.00',
    'Expectancy (R)': '0.00',
    'Średni zysk (R)': '0.00',
    'Średnia strata (R)': '0.00',
  };

  // Header row
  const sh = ws2.getRow(2);
  ['Metryka', 'Wartość'].forEach((h, i) => {
    const c = sh.getCell(i + 1);
    c.value = h;
    c.font = headerFont;
    c.fill = bg(MID_BG);
    c.alignment = center;
    c.border = thinBorder;
  });
  sh.height = 22;

  stats.forEach(([label, formula], idx) => {
    const row = ws2.getRow(idx + 3);
    row.height = 22;

    const lCell = row.getCell(1);
    lCell.value = label;
    lCell.font = labelFont;
    lCell.fill = bg(idx % 2 === 0 ? 'FF1E1E32' : 'FF22223A');
    lCell.alignment = left;
    lCell.border = thinBorder;

    const vCell = row.getCell(2);
    vCell.value = { formula };
    vCell.font = { name: 'Arial', bold: true, size: 11, color: { argb: YELLOW_FG } };
    vCell.fill = bg(idx % 2 === 0 ? 'FF1E1E32' : 'FF22223A');
    vCell.alignment = center;
    vCell.border = thinBorder;
    if (formatMap[label]) vCell.numFmt = formatMap[label];
  });

  // ─── Sheet 3: TYGODNIK ─────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('📅 Tygodnik', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: YELLOW_FG } },
  });
  ws3.columns = [
    { width: 14 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 12 }, { width: 12 }, { width: 35 },
  ];

  ws3.mergeCells('A1:G1');
  const wt = ws3.getCell('A1');
  wt.value = '📅  PODSUMOWANIE TYGODNIOWE';
  wt.font = titleFont;
  wt.fill = bg(DARK_BG);
  wt.alignment = center;
  wt.border = thinBorder;
  ws3.getRow(1).height = 30;

  const wHeaders = ['Tydzień', 'Trades', 'Win Rate', 'Wynik R', 'Wynik $', 'Plan OK%', 'Wnioski i korekty'];
  const wh = ws3.getRow(2);
  wHeaders.forEach((h, i) => {
    const c = wh.getCell(i + 1);
    c.value = h;
    c.font = headerFont;
    c.fill = bg(MID_BG);
    c.alignment = center;
    c.border = thinBorder;
  });
  wh.height = 22;

  for (let r = 3; r <= 54; r++) {
    const row = ws3.getRow(r);
    const fill = r % 2 === 0 ? 'FF1E1E32' : 'FF22223A';
    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.fill = bg(fill);
      cell.font = inputFont;
      cell.alignment = c === 7 ? left : center;
      cell.border = thinBorder;
      if (c === 3) cell.numFmt = '0.0%';
      if (c === 4) cell.numFmt = '0.00';
      if (c === 5) cell.numFmt = '#,##0.00';
      if (c === 6) cell.numFmt = '0.0%';
    }
    row.height = 20;
  }

  // ─── Sheet 4: SETUP NOTES ─────────────────────────────────────────────────
  const ws4 = wb.addWorksheet('📝 Setupy', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: ACCENT.replace('FF', '') } },
  });
  ws4.columns = [
    { width: 20 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 12 }, { width: 40 },
  ];

  ws4.mergeCells('A1:G1');
  const sp = ws4.getCell('A1');
  sp.value = '📝  ANALIZA SETUPÓW';
  sp.font = titleFont;
  sp.fill = bg(DARK_BG);
  sp.alignment = center;
  sp.border = thinBorder;
  ws4.getRow(1).height = 30;

  const sHeaders = ['Nazwa setupu', 'Trades', 'Wygrane', 'Win Rate', 'Avg R', 'Expectancy', 'Opis / zasady'];
  const shr = ws4.getRow(2);
  sHeaders.forEach((h, i) => {
    const c = shr.getCell(i + 1);
    c.value = h;
    c.font = headerFont;
    c.fill = bg(MID_BG);
    c.alignment = center;
    c.border = thinBorder;
  });
  shr.height = 22;

  const setupNames = [
    'Breakout z konsolidacji',
    'Powrót do OB (Order Block)',
    'Odbicie od S/R',
    'FVG Fill',
    'Trend continuation',
    'Reversal na FRL',
    'Scalp na liquidity sweep',
    'Inne',
  ];

  setupNames.forEach((name, idx) => {
    const row = ws4.getRow(idx + 3);
    const fill = idx % 2 === 0 ? 'FF1E1E32' : 'FF22223A';
    row.height = 22;

    const nameCell = row.getCell(1);
    nameCell.value = name;
    nameCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: YELLOW_FG } };
    nameCell.fill = bg(fill);
    nameCell.alignment = left;
    nameCell.border = thinBorder;

    // Count formula referencing Dziennik G column
    row.getCell(2).value = { formula: `=COUNTIF('📋 Dziennik'!G4:G53,A${idx + 3})` };
    row.getCell(3).value = { formula: `=COUNTIFS('📋 Dziennik'!G4:G53,A${idx + 3},'📋 Dziennik'!P4:P53,">0")` };
    row.getCell(4).value = { formula: `=IFERROR(C${idx + 3}/B${idx + 3},0)` };
    row.getCell(5).value = { formula: `=IFERROR(AVERAGEIFS('📋 Dziennik'!P4:P53,'📋 Dziennik'!G4:G53,A${idx + 3}),0)` };
    row.getCell(6).value = { formula: `=IFERROR(D${idx + 3}*E${idx + 3}+(1-D${idx + 3})*AVERAGEIFS('📋 Dziennik'!P4:P53,'📋 Dziennik'!G4:G53,A${idx + 3},'📋 Dziennik'!P4:P53,"<0"),0)` };

    for (let c = 2; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.fill = bg(fill);
      cell.font = c === 1 ? undefined : inputFont;
      cell.alignment = c === 7 ? left : center;
      cell.border = thinBorder;
      if (c === 4) cell.numFmt = '0.0%';
      if (c === 5 || c === 6) cell.numFmt = '0.00';
    }
  });

  // ─── Save ──────────────────────────────────────────────────────────────────
  const outPath = path.join('C:\\Users\\mietek\\tradingview-mcp', 'Dziennik_Tradera.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log('Saved:', outPath);
}

createTradingJournal().catch(console.error);
