# Jak Czytać Analizę VP i Wchodzić w Transakcje
*Praktyczny przewodnik tradera · ICT/SMC + Volume Profile · TRW 06.10.2026*

---

## ZASADA NADRZĘDNA

> **Nie handlujesz kartą. Handlujesz momentem, gdy cena SAMA potwierdza to, co karta przewidziała.**

Karta VP = mapa pola walki. Wejście w transakcję = dopiero gdy cena zrobi konkretną rzecz w konkretnym miejscu z konkretnym wolumenem.

---

## CZĘŚĆ 1: JAK CZYTAĆ KARTĘ VP (TOP→DOWN)

### 1. NAGŁÓWEK — pierwsza rzecz którą czytasz
```
CDH | NY HIGH | NY ZAKRES | CDL/NY LOW | VOL MAX | CENA TERAZ
```
Zadaj sobie pytania:
- Czy cena jest PRZY CDH czy przy CDL? (gdzie jesteś na mapie)
- Jaki był zasięg dnia? (mały <30pkt = konsolidacja, duży >60pkt = trend)
- Gdzie jest max vol? (to jest punkt decyzji instytucji)
- Cena teraz vs CDL: "+2,74" = nad CDL = potencjalne wsparcie

### 2. PASEK INFORMACYJNY — czytaj narrację jednym zdaniem
```
"NY DUMP –42,85pkt | CDL 4123,28 — 2. SWEEP PDL! 2x sweep = akumulacja!"
```
To jest TL;DR całej sesji. Jeśli napisane "2x sweep PDL = akumulacja" →
bias na LONG w następnej sesji (chyba że pojawi się nowy sygnał).

### 3. STATUS STREF — co przeżyło z poprzedniej sesji
```
🟢 AKTYWNA    → ten poziom NADAL ma zlecenia, szanuj go
🟡 CZĘŚCIOWO  → poziom testowany ale trzyma, może być słabszy
🔴 WYCZERPANA → poziom przepalony, nie licz na reakcję
🔵 WSPARCIE   → 2x test i 2x odbiło = akumulacja instytucjonalna
```
**Klucz:** wchodzisz TYLKO z poziomów 🟢 lub 🔵. Poziomy 🔴 ignorujesz.

### 4. VP HISTOGRAM — gdzie leżą zlecenia
Patrz na KLASTRY (grupy słupków o podobnej długości):

```
Długi słupek na HIGH  → dużo transakcji = dystrybucja (SELL)
Długi słupek na LOW   → dużo transakcji = akumulacja (BUY)
Cienko w środku       → FVG — cena przelatuje szybko, tu się nie zatrzymuje
POC (najdłuższy)      → magnes — cena wraca tu wielokrotnie
```

**Praktyczne:** jeśli POC jest powyżej ceny → magnes ciągnie w górę.
Jeśli POC jest poniżej ceny → magnes ciągnie w dół.

### 5. FIBONACCI — gdzie dokładnie wejść
```
Typ A (sweep-reversal):  entry przy 0.618–0.79 (OTE zone)
Typ B (kontynuacja):     entry przy 0.382–0.50
Typ B (breakout):        entry po zamknięciu świecy za poziomem + retest
```
**Pamiętaj:** Fibonacci rysowany od HIGH sesji do LOW sesji (lub NFP HIGH → LOW).
Cel minimalny = 1.000 (low sesji). Cel ekstremalny = 1.272 (Fib NFP).

### 6. CHRONOLOGIA — narracja "co zrobiły instytucje"
Czytaj od góry do dołu jak historię:
```
05:15 Judas DOWN: L=4124,74 vol 7197   ← fałszywy ruch w dół (sweep PDL)
09:15 London HIGH: H=4170,31 vol 10960 ← instytucje sprzedają na górze
15:00 MAX VOL: H=4135-4147 vol 24243!  ← DECYZJA: kupno przy low
16:15 CDL: L=4123,28 vol 13682         ← 2x sweep = definitywna akumulacja
```
Szukasz: **gdzie było NAJWIĘCEJ wolumenu** i **CO cena zrobiła PO tym barze**.

### 7. SCENARIUSZE — twój plan działania
```
Sc.A = preferowany (wyższe prawdopodobieństwo)
Sc.B = alternatywny (jeśli Sc.A się nie wykona)
Sc.C = obserwacja (brak jasnego sygnału)
```
Każdy scenariusz ma: Trigger → Entry → SL → TP1/TP2/TP3

---

## CZĘŚĆ 2: NA CZYM SIĘ OPIERAĆ (HIERARCHIA SYGNAŁÓW)

### Poziom 1 — MUST HAVE (bez tego nie ma wejścia)
1. **Cena przy kluczowym poziomie VP** (POC, VAH, VAL, CDH, CDL, PDL)
2. **Wolumen potwierdzający** (≥7k na XAU/USD = instytucjonalny)
3. **Struktura M15 zgodna** (BOS lub CHoCH w kierunku setupu)

### Poziom 2 — POTWIERDZENIA (im więcej tym lepiej)
- Fib OTE w strefie (0.618–0.79 dla typ A)
- Poprzedni poziom VP 🟢 AKTYWNY lub 🔵 WSPARCIE
- ICT Pro cross-check (bias cascade zgodny)
- LuxAlgo SMC: Order Block lub FVG w tej samej strefie

### Poziom 3 — KONTEKST (dodatkowa pewność)
- Bias tygodniowy zgodny (np. NFP tydzień → bearish context)
- Max Vol bar tej sesji był w strefie (instytucje działały TUTAJ)
- 2x sweep tego samego poziomu (klasyczna ICT akumulacja/dystrybucja)

### CO IGNORUJESZ:
- ❌ Wskaźniki techniczne bez VP potwierdzenia (RSI, MACD solo)
- ❌ Poziomy ze "złamanych" stref 🔴 WYCZERPANA
- ❌ Entry po ruchu >30 pkt bez retestowania strefy (spóźniony)
- ❌ Setup gdy vol <3k na triggerze (brak instytucjonalnego potwierdzenia)
- ❌ Wejście gdy spread >3 pkt (przed NFP, rolowaniem)

---

## CZĘŚĆ 3: JAK WCHODZIĆ W TRANSAKCJE

### PROTOKÓŁ WEJŚCIA — 5 kroków

**Krok 1: LOKALIZACJA**
Gdzie jest cena względem mapy VP?
```
Przy CDH/VAH → szukaj setupu SHORT
Przy CDL/VAL/PDL → szukaj setupu LONG
Przy POC → czekaj na wybicie kierunkowe
W środku zakresu (bez vol) → Obserwacja, nie handluj
```

**Krok 2: OCZEKIWANIE NA TRIGGER**

NIE wchodzisz "bo cena jest blisko poziomu".
WCHODZISZ dopiero gdy pojawi się jeden z:

| Trigger | Co widzisz na M15 |
|---------|-------------------|
| **Pin bar** | Długi knot + małe ciało = odrzucenie poziomu |
| **Engulfing** | Świeca pochłania poprzednią (bycza lub niedźwiedzia) |
| **BOS** (Break of Structure) | M15 zamknięcie powyżej/poniżej ostatniego swingu |
| **CHoCH** | Pierwszy wyższy szczyt (LONG) lub niższy dołek (SHORT) |
| **Sweep + zamknięcie** | Cena fałszywie przebija poziom, wraca i zamyka po tej samej stronie |

**Krok 3: WOLUMEN TRIGGEROWY**
```
Vol triggera ≥ 1.5× average baru (np. avg 5k → trigger ≥ 7.5k)
Jeśli vol triggerowy = 3k na XAU = słaby sygnał → pomiń lub zmniejsz size
```

**Krok 4: WEJŚCIE**
```
Typ A (sweep-reversal):
  → Entry: pierwsza M15 po trigger barze (market order lub limit w 50% trigger bara)
  → LUB: limit order w strefie Fib 0.618–0.79 (czekasz na retest)

Typ B (breakout):
  → Entry: po zamknięciu M15 poniżej/powyżej poziomu + retest
  → Nie łap "w locie" — czekaj na retest przebitego poziomu

Obserwacja (Sc.C):
  → Brak wejścia. Czekasz do następnej sesji.
```

**Krok 5: SL I TP — zanim naciśniesz przycisk**
```
SL: ZA poziomu VP który dał sygnał
  → SHORT przy CDH: SL = CDH + 3–5 pkt (np. CDH 4170 → SL 4175)
  → LONG przy CDL: SL = CDL – 3–5 pkt (np. CDL 4123 → SL 4118)
  → NIE za świecą triggerową — za POZIOMEM (ważna różnica!)

TP1: najbliższy kluczowy poziom VP (POC, VAL/VAH)
TP2: CDL lub CDH sesji (główny cel)
TP3: Ext. VP lub Fib NFP 1.272 (cel przy breakout)

Minimalne R:R:
  Typ A → 1:2 (np. SL 10 pkt → TP2 ≥ 20 pkt)
  Typ B → 1:1.5
  Poniżej 1:1.5 → Obserwacja, nie setup
```

---

## CZĘŚĆ 4: TIMING SESJI — KIEDY HANDLUJESZ

### Okna wejść (UTC):
```
05:00–06:30   → Azja: Judas Sweep (wejście LONG jeśli sweep PDL z małym vol)
07:00–08:30   → Londyn OPEN: pierwsze 90 minut = najważniejsze (setup Judas END)
09:00–10:30   → London RUN: kontynuacja lub odwrócenie Judas
12:30–13:30   → NY PREP + NFP (w piątek 1. tyg. miesiąca — duże vol, NIE handluj w momencie)
13:30–15:00   → NY OPEN: najwyższy vol dnia, Max Vol bar, ostateczna decyzja
15:00–16:30   → NY CONTINUATION: kontynuacja lub kapitulacja
18:00–20:00   → NY CLOSE: zmniejszanie pozycji, konsolidacja
```

### Kiedy NIE wchodzisz:
- ❌ 30 min przed i 30 min po NFP/FOMC/CPI (vol ekstremalny, spread szeroki)
- ❌ Niedziela 22:00–23:00 UTC (market open, spread szeroki, małe vol)
- ❌ Piątek po 19:00 UTC (weekend roll, liquidity niska)
- ❌ Gdy cena >50 pkt od najbliższego poziomu VP (zbyt daleko od mapy)

---

## CZĘŚĆ 5: ZARZĄDZANIE POZYCJĄ

### Po wejściu:
```
TP1 osiągnięty → zamknij 100% pozycji (reguła E2: TP1 = pełne zamknięcie)
                  LUB przesuń SL na breakeven i trzymaj do TP2

SL zagrożony:
  → Jeśli vol wzrasta w kierunku SL = zamknij ręcznie (instytucje działają przeciw)
  → Jeśli vol niski przy SL = wait (może być spike, nie trend)

Nie wychodzisz tylko dlatego że:
  → Cena się cofa o 5–10 pkt (to normalny retest)
  → "Czujesz" że coś jest nie tak (trzymaj się planu)
Wychodzisz gdy:
  → M15 zamknięcie ZA SL
  → Pojawia się CHoCH W PRZECIWNYM KIERUNKU z wolumenem >10k
```

### Reguła "spóźniony":
```
Jeśli cena już pokonała TP1 zanim zdążyłeś wejść → NIE GONISZ.
Czekasz na:
  - retest poprzedniego poziomu (S/R flip)
  - lub kolejną sesję z nową mapą VP
```

---

## CZĘŚĆ 6: PRZYKŁAD CZYTANIA KARTY — VP NY 05.10.2026

```
NAGŁÓWEK:
CDH 4170,31 | NY HIGH 4166,13 (fail! -4,18 od CDH) | ZAKRES -42,85 pkt | CDL 4123,28

CZYTASZ: Cena próbowała CDH ale nie dała rady (-4 pkt fail) = SŁABOŚĆ.
         CDL przy 4123 = 2x sweep PDL = akumulacja instytucjonalna.
         ZAKRES = -42,85 pkt = duży ruch w dół = trend dzienny BEARISH.

STATUS STREF (Londyn):
VAH 4199 🟢 AKTYWNA    → nie testowana, zlecenia still there
CDH 4170 🟡 CZĘŚCIOWO  → NY failed retest o 4,18 pkt
FVG 4150-4165 🔴 WYCZERPANA → przebita vol 14-24k
PDL 4125 🔵 WSPARCIE   → 2x sweep, 2x odbiło

CZYTASZ: Mapa oporu: 4162-4170 (VAH+CDH) = strefa SELL aktywna.
         4123-4125 = strefa kupna instytucjonalnego (2x test = akumulacja).

SCENARIUSZ A: CDL trzyma → LONG do TP3 4149
  Trigger: M15 pin bar nad 4123 + vol ≥8k
  Entry:   4124–4128 (market lub limit)
  SL:      4118 (za CDL)
  TP1:     4133 (Max Vol strefa) R:R 1:1
  TP2:     4140 (Val VP) R:R 1:3
  TP3:     4149 (POC VP) R:R 1:5

SCENARIUSZ B: CDL przebit → SHORT do 4097
  Trigger: M15 zamknięcie PONIŻEJ 4123 vol >10k
  Entry:   4118–4123 (retest od dołu)
  SL:      4128
  TP1:     4110 (Ext VP) R:R 1:1,3
  TP2:     4097 (Fib NFP 1.272) R:R 1:2,6

CO SIĘ STAŁO (06.10 02:30 UTC):
  → L=4104, vol 12 379 → CDL 4123 przebite!
  → Sc.B SHORT triggerowane, TP1 (4110) HIT ✅
  → Bounce 4104→4130 = TP2 (4097) PRAWIE (6 pkt brakło)
```

---

## ŚCIĄGAWKA — 3 PYTANIA PRZED KAŻDYM WEJŚCIEM

```
1. GDZIE?
   "Czy cena jest przy kluczowym poziomie VP (🟢 lub 🔵)?"
   NIE → czekaj

2. CO ZROBIŁA ŚWIECA?
   "Czy jest trigger (pin/engulfing/BOS) z wolumenem ≥1.5× avg?"
   NIE → czekaj

3. JAKI R:R?
   "Czy TP2 jest ≥ 2× SL?"
   NIE → Obserwacja, nie setup
```

**Jeśli na wszystkie 3 odpowiedź = TAK → wchodzisz.**
**Jeśli choć jedno = NIE → czekasz na następną okazję.**

---

*Pamiętaj: Najlepszy trader czeka więcej niż handluje. Cierpliwość to przewaga.*
*Trading Room Workshop · tylko edukacja · nie doradztwo inwestycyjne*
