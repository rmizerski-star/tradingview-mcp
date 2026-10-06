#!/usr/bin/env node
/**
 * mt5_send_vp_signal.mjs
 * Zapisuje sygnal VP do Common\Files\TRW_VP\signal.json
 * Czytany przez TRW_VP_EA.mq5 w MT5
 *
 * Uzycie:
 *   node scripts/mt5_send_vp_signal.mjs \
 *     --symbol XAUUSD \
 *     --direction SHORT \
 *     --entry_from 4176 --entry_to 4179 \
 *     --sl 4183 \
 *     --tp1 4164.71 --tp2 4156.11 --tp3 4144.44 \
 *     --comment "VP Sc.A SHORT CDH" \
 *     --expires_h 8
 *
 *  Lub import jako modul:
 *   import { sendVPSignal } from './scripts/mt5_send_vp_signal.mjs';
 *   await sendVPSignal({ symbol:'XAUUSD', direction:'SHORT', ... });
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Sciezka Common\Files terminala MT5 (Windows)
const MT5_COMMON = join(
  homedir(),
  'AppData', 'Roaming', 'MetaQuotes', 'Terminal', 'Common', 'Files'
);
const SIGNAL_FOLDER = join(MT5_COMMON, 'TRW_VP');
const SIGNAL_FILE   = join(SIGNAL_FOLDER, 'signal.json');
const DONE_FILE     = join(SIGNAL_FOLDER, 'done.json');

/**
 * Wyslij sygnal VP do MT5 EA
 * @param {object} opts
 * @param {string} opts.symbol       - symbol bazowy np. "XAUUSD"
 * @param {string} opts.direction    - "SHORT" lub "LONG"
 * @param {number} opts.entry_from   - dolna granica strefy entry
 * @param {number} opts.entry_to     - gorna granica strefy entry
 * @param {number} opts.sl           - Stop Loss
 * @param {number} opts.tp1          - Take Profit 1
 * @param {number} opts.tp2          - Take Profit 2 (0 = pomin)
 * @param {number} opts.tp3          - Take Profit 3 (0 = pomin)
 * @param {number} [opts.lot=0.01]   - lot na pozycje (EA otworzy 3x)
 * @param {string} [opts.comment=''] - krotki opis
 * @param {number} [opts.expires_h=6]- za ile godzin wygasa sygnal
 * @returns {{ ok: boolean, id: string, file: string }}
 */
export function sendVPSignal(opts = {}) {
  const {
    symbol     = 'XAUUSD',
    direction,
    entry_from,
    entry_to,
    sl,
    tp1,
    tp2        = 0,
    tp3        = 0,
    lot        = 0.01,
    comment    = '',
    expires_h  = 6,
  } = opts;

  // Walidacja
  if (!direction || !['SHORT','LONG'].includes(direction.toUpperCase()))
    throw new Error('direction musi byc SHORT lub LONG');
  if (!entry_from || !entry_to || !sl || !tp1)
    throw new Error('entry_from, entry_to, sl, tp1 sa wymagane');

  const dir = direction.toUpperCase();

  // Sprawdzenie kierunkowosci TP
  if (dir === 'SHORT') {
    if (tp1 >= entry_from) throw new Error(`SHORT: tp1 (${tp1}) musi byc < entry_from (${entry_from})`);
    if (sl  <= entry_to)   throw new Error(`SHORT: sl (${sl}) musi byc > entry_to (${entry_to})`);
  } else {
    if (tp1 <= entry_to)   throw new Error(`LONG: tp1 (${tp1}) musi byc > entry_to (${entry_to})`);
    if (sl  >= entry_from) throw new Error(`LONG: sl (${sl}) musi byc < entry_from (${entry_from})`);
  }

  const now      = new Date();
  const expires  = new Date(now.getTime() + expires_h * 3600_000);
  const id       = `VP_${dir}_${symbol}_${now.toISOString().replace(/[-:T]/g,'').slice(0,12)}`;

  const signal = {
    id,
    symbol,
    direction: dir,
    entry_from: +entry_from,
    entry_to:   +entry_to,
    sl:         +sl,
    tp1:        +tp1,
    tp2:        +tp2,
    tp3:        +tp3,
    lot:        +lot,
    comment,
    expires_utc: expires.toISOString(),
    sent_at:     now.toISOString(),
  };

  // Utorz folder jesli nie istnieje
  if (!existsSync(SIGNAL_FOLDER)) mkdirSync(SIGNAL_FOLDER, { recursive: true });

  writeFileSync(SIGNAL_FILE, JSON.stringify(signal, null, 2), 'utf8');

  console.log(`VP Signal zapisany: ${SIGNAL_FILE}`);
  console.log(`  ID:        ${id}`);
  console.log(`  ${dir} ${symbol} | Entry: ${entry_from}-${entry_to} | SL: ${sl}`);
  console.log(`  TP1: ${tp1} | TP2: ${tp2 || '-'} | TP3: ${tp3 || '-'}`);
  console.log(`  Wygasa: ${expires.toISOString()}`);

  return { ok: true, id, file: SIGNAL_FILE };
}

/**
 * Sprawdz czy EA potwierdził wykonanie sygnalu
 * @param {string} signalId - ID sygnalu do sprawdzenia
 * @returns {{ executed: boolean, status?: string, entry?: number }}
 */
export function checkVPDone(signalId) {
  try {
    if (!existsSync(DONE_FILE)) return { executed: false };
    const done = JSON.parse(readFileSync(DONE_FILE, 'utf8'));
    if (done.id !== signalId) return { executed: false };
    return {
      executed: true,
      status:   done.status,
      entry:    done.entry_executed,
      account:  done.account,
      time:     done.time,
    };
  } catch {
    return { executed: false };
  }
}

// ---- CLI -------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('mt5_send_vp_signal.mjs')) {
  const args = process.argv.slice(2);
  const get  = (key, def) => {
    const i = args.indexOf('--' + key);
    return i >= 0 ? args[i+1] : def;
  };

  try {
    const result = sendVPSignal({
      symbol:     get('symbol', 'XAUUSD'),
      direction:  get('direction'),
      entry_from: parseFloat(get('entry_from', 0)),
      entry_to:   parseFloat(get('entry_to', 0)),
      sl:         parseFloat(get('sl', 0)),
      tp1:        parseFloat(get('tp1', 0)),
      tp2:        parseFloat(get('tp2', 0)),
      tp3:        parseFloat(get('tp3', 0)),
      lot:        parseFloat(get('lot', 0.01)),
      comment:    get('comment', ''),
      expires_h:  parseFloat(get('expires_h', 6)),
    });
    console.log(`\nOK: ${result.id}`);

    // Czekaj maks 15s na potwierdzenie EA
    console.log('\nCzekam na potwierdzenie EA (maks 15s)...');
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const done = checkVPDone(result.id);
      if (done.executed) {
        console.log(`EA potwierdził: status=${done.status} entry=${done.entry} konto=${done.account}`);
        clearInterval(interval);
        process.exit(0);
      }
      if (attempts >= 15) {
        console.log('Brak potwierdzenia EA w 15s (EA moze byc wylaczony lub DryRun)');
        clearInterval(interval);
        process.exit(0);
      }
    }, 1000);
  } catch (e) {
    console.error('BLAD:', e.message);
    process.exit(1);
  }
}
