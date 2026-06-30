// DTC 1.3.6 PRO — Signal Monitor → Telegram
// Sprawdza nowe sygnaly co 60 sekund i wysyla na Telegram

import { evaluate } from './src/connection.js';
import https from 'https';

const BOT_TOKEN  = 'TOKEN_USUNIETY__czytaj_z__~/.claude/telegram_token.txt';
const CHAT_IDS   = ['6933991606', '-1003969670552'];
const INTERVAL   = 60 * 1000; // 60 sekund

let lastSignalKey = null;

// ─── Telegram ────────────────────────────────────────────────────────────────
function sendTelegram(text) {
  const promises = CHAT_IDS.map(chatId => new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  }));
  return Promise.all(promises);
}

// ─── Czytaj dane z wykresu przez CDP ─────────────────────────────────────────
async function readChartSignal() {
  const js = `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      var chart = api._chartWidget;
      var sources = chart.model().model().dataSources();
      var labels = [], lines = [];

      for (var si = 0; si < sources.length; si++) {
        var s = sources[si];
        if (!s.metaInfo) continue;
        try {
          var meta = s.metaInfo();
          var name = meta.description || meta.shortDescription || '';
          if (name.indexOf('DTC1.3PRO') === -1 && name.indexOf('DTC 1.3.6 PRO') === -1) continue;
          var g = s._graphics;
          if (!g || !g._primitivesCollection) continue;
          var pc = g._primitivesCollection;

          // Etykiety
          try {
            var lc = pc.dwglabels && pc.dwglabels.get('labels') && pc.dwglabels.get('labels').get(false);
            if (lc && lc._primitivesDataById) {
              lc._primitivesDataById.forEach(function(v) {
                try {
                  var txt = v._source.text ? v._source.text() : '';
                  var px  = v._source.price ? v._source.price() : 0;
                  if (txt) labels.push({ text: txt, price: px });
                } catch(e) {}
              });
            }
          } catch(e) {}

          // Linie
          try {
            var dl = pc.dwglines && pc.dwglines.get('lines') && pc.dwglines.get('lines').get(false);
            if (dl && dl._primitivesDataById) {
              dl._primitivesDataById.forEach(function(v) {
                try {
                  var px = v._source.price ? v._source.price() : 0;
                  if (px) lines.push(px);
                } catch(e) {}
              });
            }
          } catch(e) {}
        } catch(e) {}
      }

      return JSON.stringify({
        symbol: api.symbol(),
        resolution: api.resolution(),
        labels: labels,
        lines: lines
      });
    } catch(e) {
      return JSON.stringify({ error: e.message });
    }
  })()`;

  const raw = await evaluate(js);
  return JSON.parse(raw);
}

// ─── Format timeframe ─────────────────────────────────────────────────────────
function fmtTF(r) {
  return r === '1' ? '1m' : r === '5' ? '5m' : r === '15' ? '15m' :
         r === '30' ? '30m' : r === '60' ? '1H' : r === '240' ? '4H' :
         r === 'D' ? 'D' : r === 'W' ? 'W' : r + 'm';
}

// ─── Główna pętla ────────────────────────────────────────────────────────────
async function checkAndSend() {
  try {
    const data = await readChartSignal();

    if (data.error) {
      console.log('[Monitor]', new Date().toLocaleTimeString('pl-PL'), 'Brak połączenia:', data.error);
      return;
    }

    const labels  = data.labels || [];
    const entryLb = labels.find(l => l.text.startsWith('Entry '));
    if (!entryLb) {
      console.log('[Monitor]', new Date().toLocaleTimeString('pl-PL'), 'Brak aktywnego sygnału');
      return;
    }

    // Klucz sygnału = cena wejścia — zmiana oznacza nowy sygnał
    const signalKey = String(entryLb.price);
    if (signalKey === lastSignalKey) {
      console.log('[Monitor]', new Date().toLocaleTimeString('pl-PL'), 'Ten sam sygnał — pomijam');
      return;
    }
    lastSignalKey = signalKey;

    // Parsuj dane
    const slLb   = labels.find(l => l.text.startsWith('Stop '));
    const tpLbs  = labels.filter(l =>
      l.text.startsWith('TP') ||
      l.text.startsWith('PDH') || l.text.startsWith('PDL') ||
      l.text.startsWith('PWH') || l.text.startsWith('PWL')
    );

    const entryPx = entryLb.price;
    const slPx    = slLb ? slLb.price : null;
    const isLong  = slPx !== null ? slPx < entryPx : true;
    const dir     = isLong ? '🟢 BUY' : '🔴 SELL';

    // Quality z tekstu etykiety
    const qMatch  = entryLb.text.match(/Quality:\s*(.+)/);
    const quality = qMatch ? qMatch[1].trim() : '—';

    // Sortuj TP (od najbliższego)
    const sortedTP = tpLbs.sort((a, b) =>
      isLong ? a.price - b.price : b.price - a.price
    );

    // Buduj wiadomość
    const tf = fmtTF(data.resolution);
    const now = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });

    let msg = `🎯 <b>DTC 1.3.6 PRO — Nowy Sygnał</b>\n\n`;
    msg += `<b>${dir}</b>  |  ${data.symbol}  |  ${tf}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📍 <b>Entry:</b>  <code>${entryPx}</code>\n`;
    if (slPx) msg += `🛑 <b>Stop:</b>   <code>${slPx}</code>\n`;
    msg += `⭐ <b>Quality:</b> ${quality}\n`;

    if (sortedTP.length > 0) {
      msg += `\n🎯 <b>Take Profit:</b>\n`;
      for (const tp of sortedTP) {
        const lines = tp.text.split('\n');
        const name  = lines[0].split('  ')[0];
        const px    = lines[0].split('  ')[1] || tp.price;
        const info  = lines[1] || '';
        msg += `  <b>${name}</b>  <code>${px}</code>  ${info}\n`;
      }
    }

    msg += `\n⏰ ${now}`;

    await sendTelegram(msg);
    console.log('[Monitor]', new Date().toLocaleTimeString('pl-PL'), '✅ Sygnał wysłany:', dir, entryPx);

  } catch (err) {
    console.log('[Monitor]', new Date().toLocaleTimeString('pl-PL'), '❌ Błąd:', err.message);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  DTC 1.3.6 PRO — Signal Monitor');
  console.log('  Sprawdzanie co 60 sekund');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    await sendTelegram('🤖 <b>DTC Monitor uruchomiony</b>\nMonitoruję sygnały DTC 1.3.6 PRO co 60s.\n\nSygnał BUY/SELL pojawi się tutaj automatycznie.');
    console.log('[Monitor] Wiadomość startowa wysłana na Telegram ✅');
  } catch (e) {
    console.log('[Monitor] Błąd wysyłania startowego:', e.message);
  }

  await checkAndSend();
  setInterval(checkAndSend, INTERVAL);
}

main().catch(err => {
  console.error('[Monitor] Krytyczny błąd:', err);
  process.exit(1);
});
