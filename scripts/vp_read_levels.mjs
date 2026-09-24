/**
 * vp_read_levels.mjs — odczyt poziomów Volume Profile z Liquidity Map (TRW/Liquidity Swings)
 * i budowanie scenariuszy setupów ICT/SMC dla XAU/USD (lub innego symbolu).
 *
 * Algorytm:
 *   1. Czyta etykiety pine z study_filter="Liquidity" → CDH/CDL/CWL/POC/VAH/VAL
 *   2. Liczy zakres CDH–CDL i pozycję ceny w zakresie (bias VP)
 *   3. Wylicza Fibonacci OTE (0.382/0.5/0.618/0.786) z CDL→CDH
 *   4. Generuje max 3 scenariusze: SHORT od CDH-side, LONG od CDL-side, breakdown
 *   5. Wyjście: JSON config dla gen_vp_analysis_card.mjs na stdout
 *
 * Użycie:
 *   node scripts/vp_read_levels.mjs                  # domyślnie FX:XAUUSD, sesja=auto
 *   node scripts/vp_read_levels.mjs FX:XAUUSD Londyn
 */

import { connect, disconnect } from '../src/connection.js';
import { setSymbol, setTimeframe } from '../src/core/chart.js';
import { getPineLabels, getPineLines, getQuote, getOhlcv } from '../src/core/data.js';

const r2 = (v) => Math.round(v * 100) / 100;

function nowUtcStr() {
  return new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function sessionFromHour(utcH) {
  if (utcH >= 0  && utcH < 6)  return 'Azja';
  if (utcH >= 6  && utcH < 12) return 'Londyn';
  if (utcH >= 12 && utcH < 21) return 'Nowy Jork';
  return 'Azja';
}

function fib(lo, hi, level) {
  return r2(hi - (hi - lo) * level);
}

// ─── Parsowanie etykiet pine ─────────────────────────────────────────────────

const LABEL_PATTERNS = [
  { re: /\bCDH\b/i,  key: 'CDH' },
  { re: /\bCDL\b/i,  key: 'CDL' },
  { re: /\bCWH\b/i,  key: 'CWH' },
  { re: /\bCWL\b/i,  key: 'CWL' },
  { re: /\bPOC\b/i,  key: 'POC' },
  { re: /\bVAH\b/i,  key: 'VAH' },
  { re: /\bVAL\b/i,  key: 'VAL' },
  { re: /\bMidnight\s*Open\b/i, key: 'MIDNIGHT' },
  { re: /\bAH\b/,    key: 'AH'  },
  { re: /\bAL\b/,    key: 'AL'  },
  { re: /\bNYH\b/,   key: 'NYH' },
  { re: /\bNYL\b/,   key: 'NYL' },
];

function parseLabels(studies) {
  const levels = {};
  const _x     = {};
  for (const study of (studies ?? [])) {
    for (const lbl of (study.labels ?? [])) {
      const text = lbl.text ?? '';
      const m = text.match(/(\d{3,6}\.?\d{0,4})/);
      if (!m) continue;
      const price = parseFloat(m[1]);
      if (isNaN(price) || price <= 0) continue;
      for (const pat of LABEL_PATTERNS) {
        if (pat.re.test(text)) {
          if (!levels[pat.key] || (lbl.x1 ?? 0) > (_x[pat.key] ?? 0)) {
            levels[pat.key] = price;
            _x[pat.key] = lbl.x1 ?? 0;
          }
          break;
        }
      }
    }
  }
  return levels;
}

function parseLines(studies) {
  const lines = [];
  for (const study of (studies ?? [])) {
    for (const ln of (study.lines ?? [])) {
      if (ln.price != null && isFinite(ln.price)) {
        lines.push({ price: r2(ln.price), label: ln.label ?? '' });
      }
    }
  }
  return lines.sort((a, b) => b.price - a.price);
}

// ─── Bias VP ─────────────────────────────────────────────────────────────────

function calcBias(lv, priceNow) {
  const top = lv.CDH ?? lv.VAH;
  const bot = lv.CDL ?? lv.VAL ?? lv.CWL;
  const poc = lv.POC;
  if (!top && !bot) return { label: 'BRAK DANYCH VP', color: '#888', short: 'N/A' };
  const range = top && bot ? top - bot : 0;
  const pos   = range > 0 ? (priceNow - bot) / range : 0.5;
  if (top && priceNow > top) return { label: 'LONG — powyżej CDH', color: '#4caf7d', short: 'LONG', pos };
  if (bot && priceNow < bot) return { label: 'SHORT — poniżej CDL', color: '#e05252', short: 'SHORT', pos };
  if (poc && priceNow > poc) return { label: 'LEKKI LONG — powyżej POC', color: '#4caf7d', short: 'LONG~', pos };
  if (poc && priceNow < poc) return { label: 'LEKKI SHORT — poniżej POC', color: '#e05252', short: 'SHORT~', pos };
  return { label: 'NEUTRALNY — w środku VA', color: '#c9a84c', short: 'NEUTRAL', pos };
}

// ─── Generowanie scenariuszy ──────────────────────────────────────────────────

function buildScenarios(lv, priceNow, atr) {
  const { CDH, CDL, CWL, CWH, POC, VAH, VAL } = lv;
  const top   = CDH ?? VAH;
  const bot   = CDL ?? VAL ?? CWL;
  if (!top || !bot) return [];
  const range = r2(top - bot);
  if (range <= 0) return [];

  const sl_buf   = atr ? r2(atr * 0.30) : r2(range * 0.12);
  const sl_tight = atr ? r2(atr * 0.15) : r2(range * 0.06);
  const scenarios = [];

  // ── A: SHORT od CDH / OTE Fib ──────────────────────────────────────────────
  const sEhi = r2(top - range * 0.08);
  const sElo = r2(fib(bot, top, 0.382));
  const sSL  = r2(top + sl_buf);
  const sTP1 = r2(POC ?? top - range * 0.50);
  const sTP2 = r2(bot + range * 0.08);
  const sTP3 = CWL ? r2(CWL - sl_tight) : r2(bot - range * 0.12);
  const sRisk = r2(sSL - sEhi);
  if (sEhi > sElo && sRisk > 0) {
    scenarios.push({
      tag: 'A', direction: 'SHORT', color: '#e05252', colorBg: '#1a0505',
      desc: `Rejekt od CDH ${top} — OTE Fib 0.618`,
      entry: `${sElo} – ${sEhi}`,
      sl: `${sSL}`,
      tps: [
        { name: 'TP1', price: `${sTP1}`, desc: POC ? `POC ${POC}` : 'mid-range' },
        { name: 'TP2', price: `${sTP2}`, desc: 'CDL +8%' },
        { name: 'TP3', price: `${sTP3}`, desc: CWL ? `CWL ${CWL}` : 'CDL ext.' },
      ],
      rr: `1:${r2((sEhi - sTP3) / sRisk).toFixed(1)}`,
      rr1: `1:${r2((sEhi - sTP1) / sRisk).toFixed(1)}`,
      fib: `0.618 = ${fib(bot, top, 0.618)}`,
      trigger: 'Judas sweep nad CDH + BOS M15 bearish od OTE',
    });
  }

  // ── B: LONG od CDL / OTE Fib ───────────────────────────────────────────────
  const lElo = r2(bot + range * 0.02);
  const lEhi = r2(fib(bot, top, 0.786));
  const lSL  = r2(bot - sl_buf);
  const lTP1 = r2(POC ?? bot + range * 0.50);
  const lTP2 = r2(top - range * 0.08);
  const lTP3 = CWH ? r2(CWH + sl_tight) : r2(top + range * 0.12);
  const lRisk = r2(lEhi - lSL);
  if (lElo < lEhi && lRisk > 0) {
    scenarios.push({
      tag: 'B', direction: 'LONG', color: '#4caf7d', colorBg: '#021205',
      desc: `Bounce od CDL ${bot} — OTE Fib 0.786`,
      entry: `${lElo} – ${lEhi}`,
      sl: `${lSL}`,
      tps: [
        { name: 'TP1', price: `${lTP1}`, desc: POC ? `POC ${POC}` : 'mid-range' },
        { name: 'TP2', price: `${lTP2}`, desc: 'CDH -8%' },
        { name: 'TP3', price: `${lTP3}`, desc: CWH ? `CWH ${CWH}` : 'CDH ext.' },
      ],
      rr: `1:${r2((lTP3 - lEhi) / lRisk).toFixed(1)}`,
      rr1: `1:${r2((lTP1 - lEhi) / lRisk).toFixed(1)}`,
      fib: `0.786 = ${fib(bot, top, 0.786)}`,
      trigger: 'Sweep poniżej CDL + BOS M15 bullish z OTE',
    });
  }

  // ── C: Breakdown poniżej CDL → CWL ────────────────────────────────────────
  if (CWL && CWL < bot && r2(bot - CWL) > sl_tight) {
    const bEhi = r2(bot - range * 0.02);
    const bElo = r2(bot - range * 0.07);
    const bSL  = r2(bot + sl_tight);
    const bTP1 = r2(bot - r2(bot - CWL) * 0.35);
    const bTP2 = r2(CWL + sl_tight);
    const bTP3 = r2(CWL - sl_tight);
    const bRisk = r2(bSL - bEhi);
    if (bRisk > 0) {
      scenarios.push({
        tag: 'C', direction: 'SHORT', color: '#c9a84c', colorBg: '#110e02',
        desc: `Breakdown poniżej CDL ${bot} → CWL ${CWL}`,
        entry: `${bElo} – ${bEhi}`,
        sl: `${bSL}`,
        tps: [
          { name: 'TP1', price: `${bTP1}`, desc: '35% do CWL' },
          { name: 'TP2', price: `${bTP2}`, desc: `CWL +buf ${CWL}` },
          { name: 'TP3', price: `${bTP3}`, desc: `CWL ext. ${CWL}` },
        ],
        rr: `1:${r2((bEhi - bTP3) / bRisk).toFixed(1)}`,
        rr1: `1:${r2((bEhi - bTP1) / bRisk).toFixed(1)}`,
        fib: `CWL ${CWL}`,
        trigger: 'Close M15 poniżej CDL + retest od dolu',
      });
    }
  }

  return scenarios;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args      = process.argv.slice(2);
  const symbol    = args[0] ?? 'FX:XAUUSD';
  const sessionArg = args[1];
  const utcH      = new Date().getUTCHours();
  const session   = sessionArg ?? sessionFromHour(utcH);
  const now       = new Date();
  const dateStr   = `${now.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${nowUtcStr().slice(11)} · Sesja ${session}`;

  await connect();
  try {
    await setSymbol({ symbol });
    await setTimeframe({ timeframe: '15' });
    await new Promise(r => setTimeout(r, 800));

    const quote = await getQuote({});
    const price = r2(quote.last ?? quote.close);

    // ATR H1
    await setTimeframe({ timeframe: '60' });
    await new Promise(r => setTimeout(r, 500));
    let atr = null;
    try {
      const h1r = await getOhlcv({ count: 20, summary: false });
      const bars = h1r.bars ?? [];
      if (bars.length >= 14) {
        const trs = [];
        for (let i = 1; i < bars.length; i++) {
          const b = bars[i], pc = bars[i - 1].close;
          trs.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
        }
        atr = r2(trs.slice(-14).reduce((s, v) => s + v, 0) / 14);
      }
    } catch { /* ignore */ }

    // OHLCV M15 summary
    await setTimeframe({ timeframe: '15' });
    await new Promise(r => setTimeout(r, 500));
    let ohlcvSummary = null;
    try {
      const sr = await getOhlcv({ count: 96, summary: true });
      ohlcvSummary = sr.summary ?? null;
    } catch { /* ignore */ }

    // Pine labels + lines z Liquidity Map
    let labStudies = [], lineStudies = [];
    try { const lr = await getPineLabels({ study_filter: 'Liquidity', max_labels: 80 }); labStudies = lr.studies ?? []; } catch { /* ignore */ }
    try { const llr = await getPineLines({ study_filter: 'Liquidity' }); lineStudies = llr.studies ?? []; } catch { /* ignore */ }

    const levels    = parseLabels(labStudies);
    const keyLines  = parseLines(lineStudies).slice(0, 8);
    const bias      = calcBias(levels, price);
    const scenarios = buildScenarios(levels, price, atr);

    const CDH   = levels.CDH ?? levels.VAH;
    const CDL   = levels.CDL ?? levels.VAL ?? levels.CWL;
    const range = CDH && CDL ? r2(CDH - CDL) : null;

    const fibLevels = CDH && CDL ? [
      { level: '0.236', price: r2(fib(CDL, CDH, 0.236)), note: '' },
      { level: '0.382', price: r2(fib(CDL, CDH, 0.382)), note: '' },
      { level: '0.500', price: r2(fib(CDL, CDH, 0.500)), note: 'EQ' },
      { level: '0.618', price: r2(fib(CDL, CDH, 0.618)), note: 'OTE Short' },
      { level: '0.786', price: r2(fib(CDL, CDH, 0.786)), note: 'OTE Long' },
    ] : [];

    const config = {
      symbol:   symbol.replace('FX:', '').replace('OANDA:', ''),
      symbolFull: symbol,
      session,
      dateStr,
      price,
      atr_h1:   atr,
      levels,
      keyLines,
      range,
      bias,
      fibLevels,
      scenarios,
      ohlcvSummary,
      warnings: labStudies.length === 0
        ? ['Brak etykiet Liquidity Map — wskaznik moze byc ukryty lub nie zaladowany']
        : [],
    };

    process.stdout.write(JSON.stringify(config, null, 2) + '\n');
  } finally {
    await disconnect();
  }
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
