---
name: chart-analysis
description: Generate a full trading analysis report for the current TradingView chart. Use when the user asks for analysis, report, signals, market bias, key levels, or indicator readings.
---

# Chart Analysis Report

Run this workflow step by step. Do NOT skip steps.

## Step 1 — Current Price & Symbol

Use `quote_get` to get the current price, OHLC, and volume.

## Step 2 — Chart State

Use `chart_get_state` to get the symbol, timeframe, and list of all active indicators.

## Step 3 — Indicator Readings

Use `data_get_study_values` to get current numeric values from all visible indicators (RSI, MACD, EMAs, BBands, etc.).

## Step 4 — Key Price Levels

Use these tools to find drawn levels from custom Pine indicators:
- `data_get_pine_lines` → horizontal price levels (support/resistance)
- `data_get_pine_labels` → labeled levels (e.g. "PDH 24550", "Bias Long", "Settlement")
- `data_get_pine_boxes` → price zones (e.g. value areas, ranges)
- `data_get_pine_tables` → session stats, analytics dashboards

## Step 5 — Price Action Summary

Use `data_get_ohlcv` with `summary: true` to get compact stats (high, low, range, change%, avg volume, last 5 bars).

## Step 6 — Screenshot

Use `capture_screenshot` with `region: "chart"` for visual confirmation.

---

## Report Format

Output the report in this structure:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CHART ANALYSIS — {SYMBOL} | {TIMEFRAME}
📅 {DATE} {TIME}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PRICE
  Current : {price}
  Change  : {change%} today
  Volume  : {volume} (avg: {avg_volume})

📈 INDICATORS
  (list each indicator and its current value/signal)
  e.g.  RSI(14)    : 58.3 → neutral / leaning bullish
  e.g.  MACD       : bullish crossover, histogram rising
  e.g.  EMA 20/50  : price above both, bullish
  e.g.  BBands     : price near upper band, extended

🎯 KEY LEVELS
  Resistance : {level} — {label if available}
  Resistance : {level}
  ─── PRICE {current} ───
  Support    : {level}
  Support    : {level} — {label if available}

📦 ZONES
  (list any boxes/zones from pine_boxes)

🧭 BIAS
  Trend     : Bullish / Bearish / Neutral
  Structure : (describe based on EMAs, price action)
  Watch for : (key level to break, catalyst)

⚠️ RISKS / NOTES
  (anything notable: overbought, at key resistance, low volume, etc.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Rules

- Use only data from the tools — do NOT make up values
- If an indicator is not visible on chart, skip it
- If pine tools return empty, note "no custom levels detected"
- Keep bias section concise — 2-3 sentences max
- Always end with the screenshot path
