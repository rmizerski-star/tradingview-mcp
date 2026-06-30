/**
 * BATCH-ANALYSIS: Confidence Scoring Algorithm
 *
 * Calculates confidence score (0-100%) for each analyzed symbol.
 *
 * Formula:
 * confidence = (structure_match × 0.3) +
 *              (indicator_confirmation × 0.4) +
 *              (risk_reward_quality × 0.2) +
 *              (confluence_count × 0.1)
 *
 * Thresholds:
 * - 70%+: ACTIONABLE (execute)
 * - 50-69%: CONDITIONAL (backup)
 * - <50%: WEAK (skip)
 */

/**
 * Main scoring function
 *
 * @param {Object} analysis - Structure analysis from analyzeStructure()
 * @returns {Object} { score: 0-100, level: 'HIGH'|'MODERATE'|'WEAK' }
 */
function scoreConfidence(analysis) {
  // 1. Structure Match Score (0.3 weight)
  const structureScore = scoreStructure(analysis);

  // 2. Indicator Confirmation Score (0.4 weight)
  const indicatorScore = scoreIndicators(analysis);

  // 3. Risk:Reward Quality Score (0.2 weight)
  const riskRewardScore = scoreRiskReward(analysis);

  // 4. Confluence Count Score (0.1 weight)
  const confluenceScore = scoreConfluence(analysis);

  // Calculate weighted total
  const totalScore = (structureScore * 0.3) +
                     (indicatorScore * 0.4) +
                     (riskRewardScore * 0.2) +
                     (confluenceScore * 0.1);

  // Determine confidence level
  const level = determineLevelEnum(totalScore);

  return {
    score: Math.round(totalScore),
    level: level,
    breakdown: {
      structure: Math.round(structureScore),
      indicators: Math.round(indicatorScore),
      risk_reward: Math.round(riskRewardScore),
      confluence: Math.round(confluenceScore)
    }
  };
}

/**
 * SCORE 1: Structure Match (0-100)
 *
 * Evaluates HH/HL (bullish) or LH/LL (bearish) structure
 * - Perfect structure: 95-100 points
 * - Clear structure: 70-90 points
 * - Weak structure: 40-70 points
 * - No structure: <40 points
 */
function scoreStructure(analysis) {
  const { hh_hl, lh_ll, direction } = analysis;

  // Perfect structure: Clear HH/HL or LH/LL
  if ((hh_hl && direction === 'LONG') || (lh_ll && direction === 'SHORT')) {
    return 95; // Excellent structure
  }

  // Weak structure
  if (direction === 'NEUTRAL') {
    return 30; // No clear direction
  }

  // Partial structure
  return 65; // Mixed signals
}

/**
 * SCORE 2: Indicator Confirmation (0-100)
 *
 * Evaluates alignment with SMC/DTC indicators
 * - Full confirmation (BOS + CHoCH + labels): 90-100 points
 * - Partial confirmation (2 signals): 70-85 points
 * - No confirmation: <50 points
 */
function scoreIndicators(analysis) {
  const { bos_choch, indicator_confirmation, pdh, pdl, pwh, pwl } = analysis;

  let score = 0;

  // BOS/CHoCH signals (strong)
  if (bos_choch) {
    score += 40;
  } else {
    score += 20;
  }

  // Indicator confirmation (PDH, PDL, PWH, PWL labels)
  if (indicator_confirmation) {
    score += 60; // All key labels present
  } else {
    score += 30; // Partial labels
  }

  // Specific level matches
  if (pdh || pdl || pwh || pwl) {
    score += 10; // At least one key level
  }

  return Math.min(score, 100);
}

/**
 * SCORE 3: Risk:Reward Quality (0-100)
 *
 * Evaluates potential profit vs risk
 * - R:R 1:8+ (excellent): 95-100 points
 * - R:R 1:5-1:7 (good): 80-90 points
 * - R:R 1:2-1:4 (acceptable): 60-75 points
 * - R:R <1:2 (poor): <50 points
 */
function scoreRiskReward(analysis) {
  const { recent_high, recent_low, pdh, pdl, pwh, pwl } = analysis;

  // Calculate estimated R:R based on targets
  let target = 0;
  let risk = 0;

  if (analysis.direction === 'LONG') {
    // Entry at recent low
    const entry = recent_low;
    const sl = recent_low * 0.99; // 1% below
    target = pwh || recent_high * 1.05; // Target to PWH or higher
    risk = entry - sl;
  } else {
    // Entry at recent high
    const entry = recent_high;
    const sl = recent_high * 1.01; // 1% above
    target = pdl || recent_low * 0.95; // Target to PDL or lower
    risk = sl - entry;
  }

  const riskRewardRatio = Math.abs((target - entry) / risk);

  if (riskRewardRatio >= 8) return 95;
  if (riskRewardRatio >= 5) return 85;
  if (riskRewardRatio >= 3) return 70;
  if (riskRewardRatio >= 2) return 60;
  if (riskRewardRatio >= 1) return 40;
  return 20;
}

/**
 * SCORE 4: Confluence Count (0-100)
 *
 * Counts how many confluence factors present
 * - 5+ factors: 90-100 points (excellent)
 * - 3-4 factors: 70-85 points (good)
 * - 1-2 factors: 50-65 points (fair)
 * - 0 factors: <50 points (weak)
 *
 * Confluence factors:
 * 1. Structure match (HH/HL or LH/LL)
 * 2. BOS/CHoCH signals
 * 3. Indicator labels (PDH, PDL, PWH, PWL)
 * 4. Risk:Reward >1:3
 * 5. Price near key level
 */
function scoreConfluence(analysis) {
  let confluenceCount = 0;

  // Factor 1: Structure match
  if ((analysis.hh_hl && analysis.direction === 'LONG') ||
      (analysis.lh_ll && analysis.direction === 'SHORT')) {
    confluenceCount++;
  }

  // Factor 2: BOS/CHoCH signals
  if (analysis.bos_choch) {
    confluenceCount++;
  }

  // Factor 3: Indicator confirmation
  if (analysis.indicator_confirmation) {
    confluenceCount++;
  }

  // Factor 4: Price near key level
  if (analysis.pdh || analysis.pdl || analysis.pwh || analysis.pwl) {
    confluenceCount++;
  }

  // Factor 5: Recent action (high volume or strong move)
  // (Would require ohlcv data, simplified here)
  if (analysis.direction !== 'NEUTRAL') {
    confluenceCount++;
  }

  // Convert count to score (0-100)
  if (confluenceCount >= 5) return 100;
  if (confluenceCount === 4) return 85;
  if (confluenceCount === 3) return 70;
  if (confluenceCount === 2) return 50;
  if (confluenceCount === 1) return 30;
  return 10;
}

/**
 * Determine confidence level enum
 *
 * @param {number} score - Confidence score (0-100)
 * @returns {string} 'HIGH' | 'MODERATE' | 'WEAK'
 */
function determineLevelEnum(score) {
  if (score >= 70) return 'HIGH';
  if (score >= 50) return 'MODERATE';
  return 'WEAK';
}

/**
 * Example: Score breakdown output
 *
 * Input:
 * {
 *   direction: 'LONG',
 *   hh_hl: true,
 *   bos_choch: true,
 *   indicator_confirmation: true,
 *   pwh: 1.32731
 * }
 *
 * Output:
 * {
 *   score: 85,
 *   level: 'HIGH',
 *   breakdown: {
 *     structure: 95,
 *     indicators: 85,
 *     risk_reward: 70,
 *     confluence: 80
 *   }
 * }
 */

module.exports = { scoreConfidence };

// CLI test
if (require.main === module) {
  const testAnalysis = {
    direction: 'LONG',
    hh_hl: true,
    lh_ll: false,
    bos_choch: true,
    indicator_confirmation: true,
    pdh: 1.32601,
    pdl: 1.31884,
    pwh: 1.32731,
    pwl: 1.31402,
    recent_high: 1.32601,
    recent_low: 1.31884
  };

  const result = scoreConfidence(testAnalysis);
  console.log('Confidence Score Result:');
  console.log(JSON.stringify(result, null, 2));
}
