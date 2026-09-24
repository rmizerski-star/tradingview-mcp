/**
 * gen_vp_analysis_card.mjs — generator kart HTML dla rutyny VP (Volume Profile ICT/SMC).
 * 580px dark theme, kompatybilny z piconem Telegram (1:1.91 → 1080px max).
 *
 * Użycie:
 *   node scripts/gen_vp_analysis_card.mjs config.json
 *   node scripts/gen_vp_analysis_card.mjs config.json outPath.html
 *
 * config.json = wyjście z vp_read_levels.mjs
 */

import fs from 'fs';

const LOGO_PATH = 'C:\\Users\\mietek\\tradingview-mcp\\src\\logo_b64.txt';
const FOOTER    = 'Trading Room Workshop \u2014 Wszelkie informacje i analizy finansowe maja charakter wylacznie edukacyjny lub informacyjny. Nie sa traktowane jako doradztwo ani rekomendacje inwestycyjne.';

function logoSrc() {
  try { return `data:image/jpeg;base64,${fs.readFileSync(LOGO_PATH, 'utf-8').trim()}`; } catch { return ''; }
}

function html(cfg) {
  const { symbol, session, dateStr, price, atr_h1, levels, range, bias, fibLevels, scenarios, warnings } = cfg;
  const logo = logoSrc();

  const CDH = levels.CDH ?? levels.VAH ?? null;
  const CDL = levels.CDL ?? levels.VAL ?? levels.CWL ?? null;
  const POC = levels.POC ?? null;
  const CWL = levels.CWL ?? null;
  const CWH = levels.CWH ?? null;

  // pasek poziomów VP
  const vpRows = [
    CDH  ? `<tr><td class="vl-k">CDH</td><td class="vl-v">${CDH}</td><td class="vl-n">Cumulative Day High</td></tr>` : '',
    POC  ? `<tr><td class="vl-k">POC</td><td class="vl-v poc">${POC}</td><td class="vl-n">Point of Control</td></tr>` : '',
    CDL  ? `<tr><td class="vl-k">CDL</td><td class="vl-v">${CDL}</td><td class="vl-n">Cumulative Day Low</td></tr>` : '',
    CWH  ? `<tr><td class="vl-k">CWH</td><td class="vl-v" style="color:#4caf7d">${CWH}</td><td class="vl-n">Cumulative Week High</td></tr>` : '',
    CWL  ? `<tr><td class="vl-k">CWL</td><td class="vl-v" style="color:#e05252">${CWL}</td><td class="vl-n">Cumulative Week Low</td></tr>` : '',
  ].filter(Boolean).join('');

  // Fibonacci tabela
  const fibRows = fibLevels.map(f => {
    const isOte = f.note.includes('OTE');
    return `<tr style="${isOte ? 'background:#0f1118;' : ''}">
      <td class="fb-l">${f.level}</td>
      <td class="fb-p">${f.price}</td>
      <td class="fb-n" style="${isOte ? 'color:#c9a84c;font-weight:800;' : ''}">${f.note}</td>
    </tr>`;
  }).join('');

  // Scenariusze
  const scenHtml = scenarios.map(sc => {
    const dir = sc.direction === 'SHORT'
      ? `<span style="color:#e05252;font-weight:900;">&#9660; SHORT</span>`
      : `<span style="color:#4caf7d;font-weight:900;">&#9650; LONG</span>`;
    const tpRows = sc.tps.map(tp =>
      `<div class="tp-row"><span class="tp-nm">${tp.name}</span><span class="tp-pr">${tp.price}</span><span class="tp-ds">${tp.desc}</span></div>`
    ).join('');
    return `
    <div class="sc-box" style="border-color:${sc.color}44; background:${sc.colorBg};">
      <div class="sc-head">
        <span class="sc-tag" style="background:${sc.color}22; color:${sc.color};">Scenariusz ${sc.tag}</span>
        ${dir}
        <span class="sc-rr" style="color:${sc.color};">R:R ${sc.rr}</span>
      </div>
      <div class="sc-desc">${sc.desc}</div>
      <div class="sc-grid">
        <div class="sg-col">
          <div class="sg-lbl">Entry</div><div class="sg-val">${sc.entry}</div>
          <div class="sg-lbl" style="margin-top:4px;">SL</div><div class="sg-val" style="color:#e05252;">${sc.sl}</div>
        </div>
        <div class="sg-col">
          ${tpRows}
        </div>
      </div>
      <div class="sc-trigger">Trigger: ${sc.trigger}</div>
      <div class="sc-fib">Fib: ${sc.fib} &nbsp;|&nbsp; R:R TP1 ${sc.rr1}</div>
    </div>`;
  }).join('');

  const warnHtml = warnings.length
    ? `<div class="warn-box">${warnings.map(w => `<div>&#9888; ${w}</div>`).join('')}</div>`
    : '';

  const rangeStr = range ? `${range} pkt` : '—';
  const biasColor = bias.color ?? '#888';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0d0d0f; color:#e8e8e8; font-family:'Segoe UI',Arial,sans-serif; width:580px; }
.hdr { background:linear-gradient(135deg,#060810,#0a0c18); padding:10px 14px 8px; border-bottom:2px solid #3a4a80; display:flex; align-items:center; gap:10px; }
.logo { width:36px; height:36px; border-radius:6px; object-fit:cover; }
.ht { font-size:13px; color:#7ab8f5; font-weight:900; letter-spacing:0.8px; text-transform:uppercase; }
.hs { font-size:8px; color:#334; margin-top:2px; }
/* bias bar */
.bias-bar { padding:8px 14px; border-bottom:1px solid #10121e; display:flex; align-items:center; gap:10px; }
.bias-lbl { font-size:14px; font-weight:900; }
.bias-info { font-size:8px; color:#445; }
.bias-range { margin-left:auto; font-size:9px; background:#090b14; border-radius:4px; padding:3px 8px; }
/* VP levels */
.section { padding:8px 14px 4px; border-bottom:1px solid #0d0f18; }
.sec-title { font-size:7px; font-weight:900; letter-spacing:1.4px; text-transform:uppercase; color:#2a3050; margin-bottom:4px; }
.vl-table { width:100%; border-collapse:collapse; }
.vl-table tr { border-bottom:1px solid #0a0c14; }
.vl-k { font-size:8px; font-weight:900; color:#445; padding:3px 0; width:40px; }
.vl-v { font-size:12px; font-weight:900; color:#c9a84c; padding:3px 8px; }
.vl-v.poc { color:#7ab8f5; }
.vl-n { font-size:7px; color:#334; }
/* Fibonacci */
.fb-table { width:100%; border-collapse:collapse; }
.fb-table tr { border-bottom:1px solid #0a0c14; }
.fb-l { font-size:8px; color:#445; padding:2px 0; width:44px; }
.fb-p { font-size:10px; font-weight:900; color:#e8e8e8; padding:2px 8px; }
.fb-n { font-size:7px; color:#445; }
/* Scenarios */
.scenarios { padding:8px 14px; }
.sc-box { border:1px solid; border-radius:6px; padding:10px 12px; margin-bottom:8px; }
.sc-head { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
.sc-tag { font-size:8px; font-weight:900; padding:2px 8px; border-radius:3px; text-transform:uppercase; letter-spacing:0.8px; }
.sc-rr { margin-left:auto; font-size:11px; font-weight:900; }
.sc-desc { font-size:9px; color:#aaa; margin-bottom:6px; }
.sc-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px; }
.sg-col { }
.sg-lbl { font-size:7px; color:#445; text-transform:uppercase; letter-spacing:0.8px; }
.sg-val { font-size:10px; font-weight:800; color:#e8e8e8; }
.tp-row { display:flex; gap:6px; align-items:baseline; margin-bottom:2px; }
.tp-nm { font-size:7px; color:#445; width:26px; flex-shrink:0; font-weight:800; }
.tp-pr { font-size:10px; font-weight:900; color:#4caf7d; }
.tp-ds { font-size:7px; color:#334; }
.sc-trigger { font-size:7px; color:#2a3050; border-top:1px solid #10121e; padding-top:4px; margin-top:4px; }
.sc-fib { font-size:7px; color:#334; margin-top:2px; }
/* warnings */
.warn-box { background:#100802; border:1px solid #c9a84c44; border-radius:4px; padding:8px 12px; margin:8px 14px; font-size:8px; color:#c9a84c; }
/* footer */
.footer { background:#070810; padding:4px 14px; border-top:1px solid #10121e; }
.footer p { font-size:6.5px; color:#252830; text-align:center; }
</style>
</head>
<body>
<div class="hdr">
  ${logo ? `<img class="logo" src="${logo}"/>` : ''}
  <div>
    <div class="ht">${symbol} \u2014 Vol Profile ${session}</div>
    <div class="hs">${dateStr}</div>
  </div>
</div>

<div class="bias-bar">
  <div>
    <div class="sec-title" style="margin:0 0 2px;">BIAS VP</div>
    <div class="bias-lbl" style="color:${biasColor};">${bias.label ?? bias.short}</div>
  </div>
  ${atr_h1 ? `<div class="bias-info">ATR H1: <strong style="color:#7ab8f5;">${atr_h1} pkt</strong></div>` : ''}
  <div class="bias-range">Zakres CDH\u2013CDL: <strong style="color:#c9a84c;">${rangeStr}</strong></div>
</div>

${vpRows ? `
<div class="section">
  <div class="sec-title">Poziomy VP \u2014 Liquidity Map</div>
  <table class="vl-table">${vpRows}</table>
</div>` : ''}

${fibRows ? `
<div class="section">
  <div class="sec-title">Fibonacci OTE (CDL \u2192 CDH)</div>
  <table class="fb-table">${fibRows}</table>
</div>` : ''}

${warnHtml}

<div class="scenarios">
  <div class="sec-title" style="margin-bottom:8px;">Scenariusze setupu</div>
  ${scenHtml || '<div style="font-size:9px;color:#445;padding:8px 0;">Brak scenariuszy \u2014 niewystarczajace dane VP</div>'}
</div>

<div class="footer">
  <p>${FOOTER}</p>
</div>
</body>
</html>`;
}

const [,, configPath, outArg] = process.argv;
if (!configPath) { process.stderr.write('Usage: gen_vp_analysis_card.mjs config.json [out.html]\n'); process.exit(1); }

const cfg     = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const outPath = outArg ?? configPath.replace(/\.json$/, '.html').replace('cards/', 'cards/card_vp_');
fs.writeFileSync(outPath, html(cfg), 'utf-8');
process.stdout.write(outPath + '\n');
