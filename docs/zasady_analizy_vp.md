# Zasady Analizy VP (Volume Profile) — XAU/USD
*Trading Room Workshop · ICT/SMC + Volume Profile · aktualizacja 06.10.2026*

---

## FILOZOFIA

**Poziomy VP nie wygasają wraz z sesją — są aktywne dopóki nie zostaną wyczerpane wolumenowo.**

Kiedy cena wraca do poziomu o wysokim wolumenie, napotyka "ścianę" niezrealizowanych zleceń instytucjonalnych. Strefa jest aktywna dopóki:
- nie zostanie przebita z porównywalnym wolumenem (wyczerpanie)
- lub cena odbije dwukrotnie (akumulacja/dystrybucja = wsparcie silne)

---

## KROK 0: DANE WEJŚCIOWE

Przed każdą analizą VP zbierz:

| Dane | Skąd |
|------|------|
| OHLCV M15 (min 100 barów) | `data_get_ohlcv count=100` |
| POC, VAH, VAL, VP HIGH/LOW | `data_get_pine_labels study_filter="TRW"` |
| CDH, CDL aktualnego dnia | z poprzedniej sesji VP lub etykiety |
| PDL, PDH (poprzedni dzień) | OHLCV D1 lub etykiety TRW |
| WKO (Weekly Open — pn. 00:00 UTC) | pierwsza świeca tygodnia |
| CWL (Cumulative Week Low) | najniższy L tygodnia do teraz |
| NFP HIGH/LOW (jeśli w tygodniu NFP) | OHLCV M15 bar NFP |
| Aktualna cena | `quote_get` |

---

## KROK 1: IDENTYFIKACJA POZIOMÓW VP

### 1A. Profil Sesji (z TRW KZ+VP)
```
POC   — poziom z MAX wolumenem → magnes cenowy
VAH   — górna granica 70% vol → opór instytucjonalny
VAL   — dolna granica 70% vol → wsparcie instytucjonalne
VP HIGH — ekstremum profilu górne
VP LOW  — ekstremum profilu dolne
```

### 1B. Strefy wolumenowe (klasyfikacja)
Analizuj **gdzie koncentrował się wolumen** przez sesję:

| Strefa | Charakterystyka | Znaczenie |
|--------|----------------|-----------|
| **SELL/DYSTRYBUCJA** | Klaster vol na HIGH sesji | Duże zlecenia SELL — odrzucenie góry |
| **FVG (Fair Value Gap)** | Luka vol między HIGH a POC | Cel powrotu ceny (magnet) |
| **POC** | Max vol pojedynczego poziom | Równowaga; magnetyzm ceny |
| **Max Vol bar (M15)** | Pojedynczy bar z najwyższym V | Moment instytucjonalnej decyzji |
| **BUY/AKUM** | Klaster vol na LOW sesji | Duże zlecenia BUY — absorpcja |
| **Ext. VP (poza CDL)** | Vol poniżej CDL | Cel przy breakout |

### 1C. Poziomy kluczowe sesji
```
CDH / Ldn HIGH     → główny opór (fail retest = SHORT sygnał)
NY HIGH (fail CDH) → secondary opór (niższy high = weakness)
VAH VP (opór dystr.) → strefa dystrybucji
POC VP (opór/mag.) → magnes lub wsparcie/opór średnioterminowe
Max Vol strefa     → poziom gdzie instytucje działały (1430–1500 UTC)
VAL VP (wsparcie)  → dolna granica value area
PDL / NFP LOW      → kluczowe wsparcie wielodniowe
CDL / NY LOW       → lokalny dołek sesji
Ext. VP (po CDL)   → cel ekstensji (Fib 1.000+)
Fib NFP 1.272      → cel przy scenariuszu SHORT breakdown
```

---

## KROK 2: FIBONACCI SESJI

### 2A. Główne retracement (sesja dzienna)
Rysuj od: **NY HIGH → NY LOW** (lub CDH → CDL)

| Poziom Fib | Znaczenie |
|-----------|-----------|
| 0.236 | Pierwsze odbicie (słabe) |
| 0.382 | Typ B entry SHORT/LONG |
| 0.500 | EQ — equilibrium, fair value |
| 0.618 | OTE SHORT/LONG (typ A) — optymalny |
| 0.786 | Głęboki retest, ostatnia szansa |
| -0.94 | Ext. ≈ aktualna cena (cena = -0.94 = przy POC) |
| 1.000 CDL | Cel minimalny (low sesji) |
| 1.272 | Cel breakout (NFP ext.) |

### 2B. Fibonacci NFP (przy tygodniu NFP)
Rysuj od: **NFP HIGH → NFP LOW** (spike NFP)

```
Fib 0.500 = fair value po NFP (obszar FVG)
Fib 0.786 = głęboki retest (strefa VP LOW)
Fib 1.000 = PDL (NFP LOW ponownie)
Fib 1.272 = cel SHORT przy przełamaniu PDL
```

---

## KROK 3: CHRONOLOGIA (NARRACJA BAR-PO-BAR)

Rekonstruuj chronologię sesji w kolejności:

```
AZJA  (00:00-07:00 UTC): WKO, CDH/CDL Asian, zakres CBDR
LONDYN (07:00-12:00 UTC): Judas Sweep, BOS, Ldn HIGH/LOW
NY    (13:00-20:00 UTC): główna sesja, NFP (13:30), Max Vol bar
EOD   (po 20:00 UTC):    konsolidacja, NY CLOSE
```

### Kluczowe momenty do odnotowania:
1. **Judas Sweep** — sweep PDL/CDH w Azji/wczesnym Londynie (fałszywy ruch przed właściwym)
2. **BOS (Break of Structure)** — przełamanie lokalnego szczytu/dołka z wolumenem
3. **CHoCH (Change of Character)** — odwrócenie struktury (M15 zamknięcie poniżej/powyżej swing)
4. **Max Vol bar** — który M15 miał najwyższy wolumen i CO zrobił (skup/sprzedaż?)
5. **Fail retest CDH** — cena dotarła do CDH ale nie zamknęła się powyżej = WEAKNESS
6. **2x Sweep** — ten sam poziom sweepowany dwukrotnie = akumulacja instytucjonalna

---

## KROK 4: BUDOWANIE SCENARIUSZY

### 4A. Scenariusz A — reakcja na główny poziom
Klasyczny setup: cena dociera do VP HIGH/LOW lub CDH/CDL z **odrzuceniem**

**Trigger:** pin bar, engulfing lub M15 BOS OD strefy  
**Warunek:** wolumen odbicia ≥ 1.5× avg lub wyraźna świeca odrzucenia  
**Entry:** po pierwszej zamkniętej M15 świecy w strefie (Fib OTE 0.618–0.79)  
**SL:** za poziomem VP (za CDH/CDL + bufor ~3–5 pkt)  
**TP:** POC, VAL/VAH, następny kluczowy poziom  

### 4B. Scenariusz B — kontynuacja/breakout
**Trigger:** przełamanie CDL/CDH z wolumenem >10k lub vol >1.5× kontekstu  
**Warunek:** M15 zamknięcie PONIŻEJ CDL (breakout) lub POWYŻEJ CDH  
**Entry:** retest przebitego poziomu od drugiej strony (S/R flip)  
**SL:** z powrotem za przebitym poziomem  
**TP:** Ext. VP, Fib NFP 1.272, CWL  

### 4C. Scenariusz C — konsolidacja/obserwacja
**Warunek:** cena oscyluje między VAL a VAH, brak kierunku, vol < avg  
**Akcja:** Obserwacja 👁 — czekaj na trigger scenariusza A lub B  
**Watchlist:** kluczowy poziom do obserwacji na kolejną sesję  

---

## KROK 5: STATUS STREF POPRZEDNIEJ SESJI (WYCZERPANIE WOLUMENOWE)

Przy każdej nowej karcie VP oceń poziomy z poprzedniej sesji:

| Status | Warunek | Klasa |
|--------|---------|-------|
| 🟢 **AKTYWNA** | Cena nie dotarła do strefy | `.s-act` |
| 🟡 **CZĘŚCIOWO** | Cena testowała, ale trzyma (fail retest) | `.s-part` |
| 🔴 **WYCZERPANA** | Przebita z porównywalnym vol (orders filled) | `.s-exh` |
| 🔵 **WSPARCIE SILNE** | Testowana 2x+, za każdym razem odbiła | `.s-sup` |

**Reguła wyczerpania:** jeśli wolumen przebicia ≥ 0.7× wolumenu który stworzył strefę → WYCZERPANA.

---

## KROK 6: IDENTYFIKACJA INSTYTUCJONALNYCH ZLECEŃ

### Sygnały akumulacji (BUY):
- Spike do LOW + natychmiastowe odbicie (smart money sweep)
- Vol na LOW > Vol na HIGH przy tym samym zakresie ceny
- Double dip / 2x sweep PDL z każdym razem WYŻSZYM zamknięciem
- Max Vol bar na LOW z longshadow (pin bar na niskim)

### Sygnały dystrybucji (SELL):
- Fail retest CDH (cena przy CDH ale zamknięcie niżej)
- Vol na HIGH > Vol na LOW (sprzedaż na każdym ruchu w górę)
- NY DUMP po Ldn HIGH (sprzedaż przez instytucje po wyciągnięciu ceny)
- CHoCH M15 w dół od strefy VP SELL

---

## KROK 7: R:R I ZARZĄDZANIE POZYCJĄ

| Setup | Minimalny R:R | Warunek |
|-------|--------------|---------|
| Typ A (sweep + BOS) | 1:2 | TP1 > 1R |
| Typ B (breakout S/R flip) | 1:1.5 | potwierdzone vol |
| Typ C (obserwacja) | — | brak wejścia |

### Targety standardowe:
- **TP1** — najbliższy VP poziom (POC, VAL, VAH)
- **TP2** — CDL lub CDH (kluczowy poziom sesji)
- **TP3** — Ext. VP / Fib NFP 1.272 (przy breakout)

---

## KROK 8: CHECKLIST PRZED PUBLIKACJĄ

- [ ] Zidentyfikowano POC, VAH, VAL z TRW wskaźnika
- [ ] CDH/CDL z poprzednich sesji zaznaczone
- [ ] Fibonacci od HIGH→LOW sesji narysowany
- [ ] Chronologia (klucz. bary z vol) opisana
- [ ] Vol na kluczowych barach > 7k (XAU) = instytucjonalny
- [ ] Entry zone NIE jest "historią" (cena nie przeszła przez nią przed sygnałem)
- [ ] SL za poziomem VP (nie za świecą)
- [ ] R:R ≥ 1:1.5
- [ ] Status stref poprzedniej sesji ocenienie (wyczerpanie)
- [ ] Scenariusz B i C zdefiniowane (lub "Obserwacja")

---

## WSKAŹNIKI NA WYKRESIE

| Wskaźnik | study_filter | Co daje |
|----------|-------------|---------|
| TRW KZ+VP | `"TRW"` | POC/VAH/VAL + killzony + EMA |
| Smart Money Concepts [LuxAlgo] | `"Smart Money"` | OB, FVG, BOS/CHoCH |
| 【ICT Pro】 | `"ICT Pro"` | Bias cascade, struktura |
| Liquidity Map | `"Liquidity"` | Poziomy płynności (EQH/EQL) |

---

## PRZYKŁAD: VP NY 05.10.2026 (2x SWEEP PDL)

```
CDH Ldn:    4 170,31  ← fail CDH retest = WEAKNESS (NY HIGH tylko 4166!)
NY HIGH:    4 166,13  ← niższy szczyt = struktura niedźwiedzia
VAH VP:     ~4 162    ← strefa dystrybucji (vol 10-11k)
POC VP:     ~4 153    ← magnes / fair value
Max Vol:    4 135-147 ← 24 243 vol (15:00 UTC) = instytucjonalny BUY!
VAL VP:     ~4 127    ← wsparcie value area
CDL/PDL:    4 123,28  ← 2x sweep = akumulacja kluczowa
Ext. VP:    4 110,69  ← cel gdyby CDL się przełamie
Fib NFP 1.272: 4097,97 ← nocny spike 06.10: LOW=4104 (prawie!)

WYNIK:
→ Vol 24 243 na 4135-4147 = AKUMULACJA INSTYTUCJONALNA
→ 2x sweep CDL 4123 = klasyczny smart money double dip
→ Nocny spike 06.10 02:30: L=4104, vol 12k → TP1 Ext. VP (4110) HIT
→ Bounce 4104→4130 = potencjalny LONG przy double bottom
```

---

*Reguła główna: Wolumen = intencja instytucji. Gdzie był wolumen — tam były zlecenia. Czytaj VP jako mapę zleceń, nie tylko jako poziomy wsparcia/oporu.*
