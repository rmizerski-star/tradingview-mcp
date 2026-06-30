---
name: chart-analysis
description: Analyze a chart — set up symbol/timeframe, add indicators, scroll to key dates, annotate, and screenshot. Use when the user wants technical analysis or chart review.
---

# ICT/SMC Price Action Analysis Workflow

Perform technical analysis using ICT (Inner Circle Trader) / SMC (Smart Money Concepts) framework based on pure price action — structure, liquidity, Fair Value Gaps, and Order Blocks. No indicators needed.

## Step 1: Set Up the Chart

1. `chart_set_symbol` — switch to the requested symbol
2. `chart_set_timeframe` — set the primary timeframe for analysis
3. `chart_get_visible_range` — check current visible range

## Step 2: Read Price Structure

1. `data_get_ohlcv` with `summary: false` and `count: 100` — get last 100 bars for structure analysis
2. `quote_get` — get current price
3. `symbol_info` — get symbol metadata (exchange, type, session)

Identify from price action:
- **Higher Highs / Higher Lows (HH/HL)** → Bullish structure
- **Lower Highs / Lower Lows (LH/LL)** → Bearish structure
- **Fair Value Gaps (FVG)** → Unfilled gaps in price (imbalances to hunt)
- **Order Blocks (OB)** → Strong price rejection zones
- **Liquidity Levels** → Previous swing highs/lows (potential sweep areas)

## Step 3: Read Custom Indicators (if available)

If custom Pine indicators are visible on chart, extract their levels:
- `data_get_pine_lines` — horizontal price levels (support, resistance, liquidity zones)
- `data_get_pine_labels` — text annotations with key prices (e.g., "BSL 52721", "SSL 51916")
- `data_get_pine_tables` — formatted analysis tables (bias cascades, liquidity maps)
- `data_get_study_values` — any numeric values from visible studies

**Note:** Custom indicators enhance analysis but are NOT required — price structure is primary source.

## Step 4: Navigate to Key Dates (if needed)

- `chart_scroll_to_date` — jump to a specific date of interest
- `chart_set_visible_range` — zoom to a specific date window for deeper analysis
- `chart_get_visible_range` — verify current visible timeframe

## Step 5: Annotate Key Levels

Use drawing tools to mark up the chart:
- `draw_shape` with `horizontal_line` for BSL (Buy Side Liquidity), SSL (Sell Side Liquidity), Order Blocks
- `draw_shape` with `trend_line` for structure breaks / trend channels
- `draw_shape` with `text` for annotations (FVG labels, phase markers)

## Step 6: Generate ICT/SMC Analysis Report

Structure your analysis using the Trading Room Workshop format:

### 🎯 BIAS CASCADE (Multi-Timeframe Structure)

Present bias for each timeframe with structure confirmation:

| Timeframe | Bias | Structure | Phase |
|-----------|------|-----------|-------|
| **H4** | BULLISH/BEARISH | HH+HL trend / BO / Impulse | PULLBACK / RANGING / CONSOLIDAT. |
| **H1** | BULLISH/BEARISH | BO confirmed / HH+HL / BOS | RANGING UP / DOWN |
| **M15** | BULLISH/BEARISH | HH+HL M15 / Impulsive | ACCUMULATION / CORRECTION |

**Bias reasoning:** Reference structure, breakers, recent breaks (BOS).

### 📊 MAPA PŁYNNOŚCI (Liquidity Map — BSL/SSL/OB/FVG)

#### Buy Side Liquidity (BSL — cele nabywające)
- Major ATH Swing High
- H4 Prior Swing High (KEY level)
- Bearish OB H4 (gdzie kupowali wcześniej)
- CDH / H1 High
- **Current Price** (now)

#### Sell Side Liquidity (SSL — cele sprzedające)
- H1 Bullish OB / gap open
- H4 Bullish OB (gdzie sprzedawali)
- SSL – H4 Swing Low
- Major H4 Low

#### Fair Value Gaps (FVG) — imbalances to hunt
- List unfilled gaps with prices

#### Order Blocks (OB) — rejection zones
- Mark by timeframe (H4 OB, H1 OB)

### 💡 PRIMARY SETUP (LONG / SHORT)

Structure the trade setup:

**Setup Direction:** LONG / SHORT (with trigger: H1 OB + Fib 0.500 pullback / etc.)

- **Entry:** Price level or confluence (e.g., "51 916–52 010 | H1 OB + Fib 0.500")
- **Stop Loss:** Price and pips risk (e.g., "51 795 | ~120 pips")
- **Take Profit Levels:**
  - TP1: CDH / Bearish OB (e.g., "52 180" | −63% | −3h)
  - TP2: H4 BSL Swing High (e.g., "52 308–52 365" | −48% | −5h)
  - TP3: Major BSL ATH (e.g., "52 721" | −25% | −1d)

- **Risk:Reward Ratios:**
  - TP1: 1 : 1.44
  - TP2: 1 : 2.20
  - TP3: 1 : 4.00

- **Entry Confluence:** List what confirms this setup (structure break, FVG test, OB rejection, liquidity sweep, etc.)

### 🎲 SCENARIUSZE (A/B/C)

| Scenario | Condition | Target | Status |
|----------|-----------|--------|--------|
| **A (PRIMARY)** | Utrzymania → LONG bias do H4 + H1 bullish | 63% → 25% + TP targets | Primary |
| **B (PULLBACK)** | Cofnięcie do H1 OB, raczej confluence do tej samej KW | Confidencer do H1 OB 916–010 | Same confluence |
| **C (SHORT)** | Wybicie poniżej Bearish OB 180–293 → SHORT −51 647 | −51 299 (Major H4 Low) | 12% |

### 🔵 SMC + LIQUIDITY MAP CONFIRMATION

Cross-check your price action analysis with indicator signals:

**From Pine Indicators (SMC + Liquidity Map, DTC PRO + ICT):**
- **Key BSL Levels** (from indicator): List specific prices with labels (e.g., "BSL 52721", "CDH 4083.82")
- **Key SSL Levels** (from indicator): List specific prices (e.g., "SSL 51916", "PDL 3982.95")
- **CHoCH & BOS Signals**: Where are the structure breaks? (e.g., "CHoCH at 4536.82", "BOS at 4482.62")
- **Order Blocks (OB)**: Which OBs are active? (e.g., "H4 OB 4050.47−3982.95", "H1 OB 4047.18−4026.12")
- **DTC PRO Setup** (if visible): Entry, SL, TP from indicator

**Confluence Check:**
- ✅ Does your PRIMARY SETUP align with indicator Entry/SL/TP?
- ✅ Are your BSL/SSL zones confirmed by indicator levels?
- ✅ Do indicator CHoCH/BOS signals match your structure interpretation?
- ✅ Is there disagreement? If so, which has priority? (Usually indicator signals are strong confirmation)

**Outcome:** If indicator confirms your analysis → HIGH CONFIDENCE. If indicator disagrees → re-examine structure or use indicator as secondary signal.

### 📐 Fib Levels & Confluence

- Key retracement levels (50%, 61.8%, 38.2%) related to structure
- Extension targets (127.2%, 161.8%)
- Mark entry zones based on confluence (e.g., "Fib 0.500 + OB + prior resistance")

## Step 7: Capture & Verify

1. `capture_screenshot` — screenshot the annotated chart showing structure, liquidity levels, and setup
2. Verify all key levels are visible (BSL, SSL, OB, FVG)
3. Confirm structure interpretation matches the visual chart

## Error Handling

- **Symbol not found:** Verify the correct ticker (e.g., "OANDA:XAUUSD" for gold, "ES1!" for S&P 500 futures, "EURUSD" for forex)
- **No OHLCV data:** Some symbols/timeframes may have limited history. Try a shorter-term timeframe or check the exchange hours
- **Structure unclear:** If the last 100 bars don't show clear HH/HL or LH/LL, extend count to 200 or scroll back to find the impulse move
- **Custom indicators missing:** If no Pine indicators are visible, analysis is based on pure price structure only — this is valid

## Cleanup

If you added drawings (`draw_shape`) for annotations, optionally remove them:
- `draw_clear` to remove all temporary drawings
- Or leave them for visual reference before next analysis
