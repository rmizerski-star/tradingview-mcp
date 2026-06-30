---
name: batch-analysis
description: Parallel deep analysis on multiple symbols — scan filtering results then analyze top N candidates simultaneously using ICT/SMC framework. Use when you want fast multi-symbol deep dives with ranked confidence scores.
---

# Batch Analysis — Parallel Deep Dive

Perform simultaneous ICT/SMC deep analysis on multiple symbols (typically 3-5 top candidates from multi-symbol-scan). Each symbol analyzed in parallel using the chart-analysis workflow, results consolidated and ranked by confidence score.

## Workflow Overview

```
multi-symbol-scan (top 3-5)
        ↓
batch-analysis (parallel)
├─ Symbol #1 analysis ──────────┐
├─ Symbol #2 analysis ──────────├─ ALL PARALLEL (15 min total)
└─ Symbol #N analysis ──────────┘
        ↓
consolidated ranking + top setup ready to trade
```

**Key benefit:** 2.5x faster than sequential analysis (20 min vs 50 min for 3 symbols)

---

## Step 1: Input & Validation

Accept:
- **Symbols**: Array of 2-5 symbol strings (e.g., ["GBPUSD", "EURUSD", "USDJPY"])
- **Timeframe**: Single timeframe for all (e.g., "60" for H1)
- **Framework**: ICT/SMC (default, immutable)

Validate:
- All symbols must exist on TradingView
- Timeframe must be valid (1, 5, 15, 60, D, W, M)
- Max 5 symbols (parallel API rate limit consideration)

---

## Step 2: Parallel Execution

For each symbol **in parallel**:

```
Worker Process (per symbol):
1. chart_set_symbol → set to symbol
2. chart_set_timeframe → set to timeframe
3. data_get_ohlcv(count: 100) → read 100 bars
4. quote_get → get current price
5. data_get_pine_lines → read indicator levels
6. data_get_pine_labels → read indicator labels
7. Run ICT/SMC analysis:
   - Identify structure (HH/HL vs LH/LL)
   - Map liquidity (BSL/SSL/OB/FVG)
   - Generate bias + setup
   - Calculate confidence score (0-100%)
8. Return: { symbol, bias, setup, confidence, R:R, TP_targets }
```

**Execution model:**
- Launch N workers simultaneously (one per symbol)
- Each completes independently
- Collect all results (don't wait for slowest)
- Proceed to consolidation

---

## Step 3: Consolidation & Ranking

When all workers complete:

1. **Aggregate results** into unified structure
2. **Sort by confidence descending** (highest first)
3. **Assign ranks** (1st, 2nd, 3rd)
4. **Flag**: Which setups are actionable (confidence ≥ 70%)
5. **Generate consolidated report**

Example output structure:
```json
{
  "scan_time_seconds": 15,
  "symbols_analyzed": 3,
  "results": [
    {
      "rank": 1,
      "symbol": "GBPUSD",
      "bias": "BULLISH",
      "direction": "LONG",
      "entry": "1.32601",
      "stop_loss": "1.31884",
      "tp1": "1.32731",
      "tp2": "1.36578",
      "tp3": "1.38688",
      "risk_reward": "1:8.6",
      "confidence": 85,
      "actionable": true
    },
    {
      "rank": 2,
      "symbol": "EURUSD",
      "bias": "BULLISH",
      "direction": "LONG",
      "confidence": 65,
      "actionable": true
    },
    {
      "rank": 3,
      "symbol": "USDJPY",
      "bias": "NEUTRAL",
      "confidence": 40,
      "actionable": false
    }
  ],
  "top_pick": {
    "symbol": "GBPUSD",
    "setup": "LONG at 1.32601, SL 1.31884, TP2 1.36578",
    "confidence": "85% HIGH",
    "recommendation": "EXECUTE"
  }
}
```

---

## Step 4: Report Generation

Output format:

### 📊 BATCH ANALYSIS REPORT

**Scan Time:** 20 minutes total (5 min scan + 15 min parallel analysis)  
**Symbols Analyzed:** 3  
**Timeframe:** H1  
**Framework:** ICT/SMC + SMC Confirmation

---

**🥇 RANK 1: GBPUSD** ✅ ACTIONABLE
- **Bias:** BULLISH → LONG
- **Entry:** 1.32601 (CDH)
- **Stop Loss:** 1.31884 (71 pips)
- **TP1:** 1.32731 (+14 pips, 1:0.2)
- **TP2:** 1.36578 (+398 pips, 1:5.6)
- **Confidence:** **85%** 🔥 HIGH
- **Recommendation:** ✅ EXECUTE THIS

---

**🥈 RANK 2: EURUSD** ⚠️ CONDITIONAL
- **Bias:** BULLISH → LONG
- **Confidence:** 65% MODERATE
- **Recommendation:** Backup pick

---

**🥉 RANK 3: USDJPY** ❌ SKIP
- **Bias:** NEUTRAL
- **Confidence:** 40% WEAK
- **Recommendation:** Skip this round

---

## Step 5: Integration Points

### Input from multi-symbol-scan
```
multi-symbol-scan output:
├─ Top 3 symbols (pre-filtered)
└─ Pass directly to batch-analysis
```

### Output to trading
```
batch-analysis output:
├─ Clear #1 pick (high confidence)
├─ Full entry/SL/TP setup
└─ Execute immediately
```

---

## Error Handling

- **Symbol not found:** Skip that symbol, analyze remaining
- **Timeframe not available:** Fallback to closest available
- **Indicator data missing:** Proceed with price structure only
- **Parallel timeout:** Return partial results (completed symbols only)
- **API rate limit:** Queue excess symbols (sequential) after parallel batch

---

## Performance Characteristics

### Time Breakdown (3 symbols, H1):

| Phase | Time |
|-------|------|
| Setup + validation | 1 min |
| Parallel execution | 15 min (all 3 at once) |
| Consolidation | 2 min |
| Report generation | 2 min |
| **TOTAL** | **20 min** |

vs Sequential (chart-analysis × 3):
- Symbol 1: 15 min
- Symbol 2: 15 min
- Symbol 3: 15 min
- **TOTAL: 50 min** ❌

**Speedup: 2.5x** ✅

---

## Scaling

| Symbols | Time | Speedup vs Sequential |
|---------|------|---|
| 1 | 10 min | Same as chart-analysis |
| 2 | 17 min | 1.8x faster |
| 3 | 20 min | 2.5x faster |
| 5 | 25 min | 3.0x faster |

---

## Technical Notes

### Parallel Implementation
- Use `Promise.all()` (Node.js) or similar for true parallelism
- Each worker is independent (no shared state)
- Timeout per worker: 20 seconds (fallback on slow)
- Collect results as they complete

### API Efficiency
- Each symbol makes 4-5 API calls (ohlcv, quote, pine_lines, pine_labels)
- 3 symbols = ~12 API calls in parallel (safe within TradingView CDP limits)
- 5 symbols = ~20 API calls (monitor for rate limits)

### Confidence Scoring Algorithm
```
confidence = 
  (structure_match × 0.3) +
  (indicator_confirmation × 0.4) +
  (risk_reward_quality × 0.2) +
  (confluence_count × 0.1)

Range: 0-100%
Actionable threshold: ≥ 70%
```

---

## Cleanup

After analysis:
- Clear all chart drawings (if added during analysis)
- Reset chart to initial symbol (if started mid-workflow)
- Log completion time + result stats

---

## Integration with Ecosystem

```
multi-symbol-scan
    ↓ (top 3-5)
batch-analysis ← NEW SKILL
    ↓ (ranked top 1)
TRADE
```

No changes to existing skills:
- chart-analysis stays as-is (single symbol deep dive)
- multi-symbol-scan stays as-is (quick screening)
- batch-analysis is NEW (parallel deep dives on filtered list)
