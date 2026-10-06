# TRW VP EA — Instrukcja instalacji

## 1. Skopiuj plik EA

Skopiuj `TRW_VP_EA.mq5` do folderu EA w MT5:
```
C:\Users\<user>\AppData\Roaming\MetaQuotes\Terminal\<ID>\MQL5\Experts\TRW\
```

Lub otwórz w MT5: **File → Open Data Folder → MQL5 → Experts**

## 2. Skompiluj

W MT5 MetaEditor (`F4`) → otwórz `TRW_VP_EA.mq5` → kompiluj (`F7`).

## 3. Przeciągnij na wykres

Przeciągnij `TRW_VP_EA` na wykres **XAUUSD M15** (lub dowolny).

**Ustawienia:**
| Parametr | Wartość | Opis |
|---|---|---|
| InpSignalFolder | `TRW_VP` | Folder w Common\Files |
| InpPollSeconds | `3` | Co 3s sprawdza plik |
| InpLotPerPos | `0.01` | Lot na pozycję (3×0.01 = 0.03 łącznie) |
| InpMagic | `770003` | Unikalny magic number |
| InpMoveSLtoBE | `true` | Przesuń SL na BE po TP1 |
| InpDryRun | `false` | `true` = tylko loguj, nie handluj |

## 4. Wyślij sygnał z Claude

Po analizie VP Claude automatycznie wywołuje:

```bash
node scripts/mt5_send_vp_signal.mjs \
  --symbol XAUUSD \
  --direction SHORT \
  --entry_from 4176 --entry_to 4179 \
  --sl 4183 \
  --tp1 4164.71 --tp2 4156.11 --tp3 4144.44 \
  --comment "VP Sc.A SHORT CDH 06.10.2026" \
  --expires_h 8
```

Plik trafia do:
```
C:\Users\<user>\AppData\Roaming\MetaQuotes\Terminal\Common\Files\TRW_VP\signal.json
```

EA odczytuje go w ciągu 3 sekund i otwiera 3 pozycje:
- **Pozycja 1** (SELL_LIMIT @ ~4178) → SL 4183, TP 4164.71
- **Pozycja 2** (SELL_LIMIT @ ~4178) → SL 4183, TP 4156.11
- **Pozycja 3** (SELL_LIMIT @ ~4178) → SL 4183, TP 4144.44

## 5. Mechanizm zarządzania

```
Sygnał →  3 pozycje otwarte
     TP1 zamknięty → SL pozostałych 2 przesuwa się na cenę wejścia (BE)
     TP2 zamknięty → trailing co 100 pkt na pozycji TP3
     TP3 zamknięty → koniec
```

## 6. Potwierdzenie wykonania

EA zapisuje wynik do `Common\Files\TRW_VP\done.json`:
```json
{"id":"VP_SHORT_XAUUSD_202610061230","status":"OPENED","entry_executed":4178.00,"account":125761314,"time":"2026.10.06 12:31:00"}
```

Node.js sprawdza ten plik i loguje potwierdzenie.

## Uwagi

- EA działa na **koncie DEMO** (konto 125761314)
- Magic number `770003` — nie koliduje z istniejącymi EA (770001/770002)
- Jeśli cena jest już w strefie entry → wejście **rynkowe** (nie pending)
- Jeśli cena już za strefą (po TP1 stronie) → sygnal **pominięty**
