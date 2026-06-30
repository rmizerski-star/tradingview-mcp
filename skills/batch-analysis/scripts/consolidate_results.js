/**
 * BATCH-ANALYSIS: Consolidate & Rank Results
 *
 * Takes individual symbol analysis results and:
 * 1. Filters out failed analyses
 * 2. Sorts by confidence (descending)
 * 3. Assigns ranks (1st, 2nd, 3rd...)
 * 4. Flags actionable setups (confidence ≥ 70%)
 * 5. Identifies top pick (rank #1)
 * 6. Returns consolidated report
 */

/**
 * Main consolidation function
 *
 * @param {Array<Object>} results - Individual symbol analysis results
 * @returns {Object} Consolidated report with ranking
 */
function consolidateResults(results) {
  // 1. Filter successful analyses
  const successful = results.filter(r => r.success === true);

  // 2. Sort by confidence (descending)
  const sorted = successful.sort((a, b) => b.confidence - a.confidence);

  // 3. Assign ranks
  const ranked = sorted.map((result, index) => ({
    ...result,
    rank: index + 1,
    rank_emoji: getRankEmoji(index)
  }));

  // 4. Identify actionable setups
  const actionableSetups = ranked.filter(r => r.confidence >= 70);

  // 5. Identify top pick
  const topPick = ranked.length > 0 ? ranked[0] : null;

  // 6. Build consolidated report
  const report = {
    metadata: {
      timestamp: new Date().toISOString(),
      total_symbols: results.length,
      successful_analyses: successful.length,
      failed_analyses: results.length - successful.length
    },
    summary: {
      symbols_analyzed: successful.length,
      actionable_count: actionableSetups.length,
      average_confidence: Math.round(
        successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length
      )
    },
    results: ranked,
    actionable_setups: actionableSetups,
    top_pick: topPick ? formatTopPick(topPick) : null
  };

  return report;
}

/**
 * Get rank emoji (🥇🥈🥉 for top 3)
 */
function getRankEmoji(index) {
  const emojis = ['🥇', '🥈', '🥉'];
  return emojis[index] || '  ';
}

/**
 * Format top pick for easy reading
 */
function formatTopPick(result) {
  return {
    rank: 1,
    symbol: result.symbol,
    bias: result.bias,
    direction: result.direction,
    entry: result.entry,
    stop_loss: result.stop_loss,
    tp1: result.tp1,
    tp2: result.tp2,
    tp3: result.tp3,
    risk_reward: result.risk_reward,
    confidence: `${result.confidence}%`,
    confidence_level: result.confidence_level,
    recommendation: `✅ EXECUTE THIS IMMEDIATELY`,
    setup_summary: `${result.direction} at ${result.entry} | SL: ${result.stop_loss} | TP2: ${result.tp2} (${result.risk_reward})`
  };
}

/**
 * Generate text-formatted report for console output
 */
function generateTextReport(consolidatedReport) {
  const lines = [];

  lines.push('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('📊 BATCH-ANALYSIS CONSOLIDATED REPORT\n');

  // Metadata
  const meta = consolidatedReport.metadata;
  lines.push(`⏰ Timestamp: ${meta.timestamp}`);
  lines.push(`📈 Total Symbols: ${meta.total_symbols}`);
  lines.push(`✅ Successful: ${meta.successful_analyses}`);
  lines.push(`❌ Failed: ${meta.failed_analyses}\n`);

  // Summary
  const summary = consolidatedReport.summary;
  lines.push(`Summary:`);
  lines.push(`  Analyzed: ${summary.symbols_analyzed} symbols`);
  lines.push(`  Actionable: ${summary.actionable_count} setups (confidence ≥70%)`);
  lines.push(`  Avg Confidence: ${summary.average_confidence}%\n`);

  // Results (ranked)
  lines.push('Results (Ranked by Confidence):\n');

  consolidatedReport.results.forEach((result, i) => {
    const confidence_indicator = getConfidenceIndicator(result.confidence);

    lines.push(`${result.rank_emoji} RANK ${result.rank}: ${result.symbol} ${confidence_indicator}`);
    lines.push(`   Bias: ${result.bias} → ${result.direction}`);
    lines.push(`   Confidence: ${result.confidence}% (${result.confidence_level})`);

    if (result.confidence >= 70) {
      lines.push(`   Entry: ${result.entry}`);
      lines.push(`   Stop Loss: ${result.stop_loss}`);
      lines.push(`   TP2: ${result.tp2}`);
      lines.push(`   Risk:Reward: ${result.risk_reward}`);
      lines.push(`   ✅ ACTIONABLE - Execute if confluence confirmed\n`);
    } else {
      lines.push(`   ⏸️ WEAK - Skip this signal\n`);
    }
  });

  // Top pick
  if (consolidatedReport.top_pick) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🎯 TOP PICK\n`);
    lines.push(`Symbol: ${consolidatedReport.top_pick.symbol}`);
    lines.push(`Setup: ${consolidatedReport.top_pick.setup_summary}`);
    lines.push(`Confidence: ${consolidatedReport.top_pick.confidence} 🔥 HIGH`);
    lines.push(`Recommendation: ${consolidatedReport.top_pick.recommendation}\n`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  return lines.join('\n');
}

/**
 * Get visual confidence indicator (bars or emoji)
 */
function getConfidenceIndicator(confidence) {
  if (confidence >= 80) return '🔥 HIGH';
  if (confidence >= 70) return '✅ ACTIONABLE';
  if (confidence >= 50) return '⚠️ MODERATE';
  return '❌ WEAK';
}

/**
 * Export consolidated report as JSON
 */
function exportJSON(report) {
  return JSON.stringify(report, null, 2);
}

/**
 * Export consolidated report as CSV
 * Format: rank, symbol, bias, direction, confidence, entry, stop_loss, tp2, actionable
 */
function exportCSV(report) {
  const lines = ['rank,symbol,bias,direction,confidence,entry,stop_loss,tp2,actionable'];

  report.results.forEach(r => {
    lines.push([
      r.rank,
      r.symbol,
      r.bias,
      r.direction,
      r.confidence,
      r.entry,
      r.stop_loss,
      r.tp2,
      r.confidence >= 70 ? 'YES' : 'NO'
    ].join(','));
  });

  return lines.join('\n');
}

/**
 * Example usage:
 *
 * Input (3 symbol results):
 * [
 *   { symbol: 'GBPUSD', confidence: 85, ... },
 *   { symbol: 'EURUSD', confidence: 65, ... },
 *   { symbol: 'USDJPY', confidence: 40, ... }
 * ]
 *
 * Output (consolidated):
 * {
 *   metadata: { timestamp: ..., total_symbols: 3, successful_analyses: 3 },
 *   summary: { symbols_analyzed: 3, actionable_count: 2, average_confidence: 63 },
 *   results: [
 *     { rank: 1, symbol: 'GBPUSD', confidence: 85, rank_emoji: '🥇', ... },
 *     { rank: 2, symbol: 'EURUSD', confidence: 65, rank_emoji: '🥈', ... },
 *     { rank: 3, symbol: 'USDJPY', confidence: 40, rank_emoji: '🥉', ... }
 *   ],
 *   actionable_setups: [ { rank: 1, symbol: 'GBPUSD', ... }, { rank: 2, symbol: 'EURUSD', ... } ],
 *   top_pick: { symbol: 'GBPUSD', confidence: '85%', recommendation: '✅ EXECUTE ...' }
 * }
 */

export {
  consolidateResults,
  generateTextReport,
  exportJSON,
  exportCSV
};

// CLI test
if (import.meta.url === `file://${process.argv[1]}`) {
  const testResults = [
    {
      success: true,
      symbol: 'GBPUSD',
      bias: 'BULLISH',
      direction: 'LONG',
      confidence: 85,
      confidence_level: 'HIGH',
      entry: '1.32601',
      stop_loss: '1.31884',
      tp1: '1.32731',
      tp2: '1.36578',
      tp3: '1.38688',
      risk_reward: '1:8.6'
    },
    {
      success: true,
      symbol: 'EURUSD',
      bias: 'BULLISH',
      direction: 'LONG',
      confidence: 65,
      confidence_level: 'MODERATE',
      entry: '1.14000',
      stop_loss: '1.13850',
      tp1: '1.14200',
      tp2: '1.14500',
      tp3: '1.15000',
      risk_reward: '1:5'
    },
    {
      success: true,
      symbol: 'USDJPY',
      bias: 'NEUTRAL',
      direction: 'NEUTRAL',
      confidence: 40,
      confidence_level: 'WEAK',
      entry: null,
      stop_loss: null,
      tp1: null,
      tp2: null,
      tp3: null,
      risk_reward: null
    }
  ];

  const consolidated = consolidateResults(testResults);
  console.log(generateTextReport(consolidated));
  console.log('\nJSON Export:');
  console.log(exportJSON(consolidated));
  console.log('\nCSV Export:');
  console.log(exportCSV(consolidated));
}
