#!/usr/bin/env node
/**
 * Summarize Routing Failures
 *
 * Analyzes failure dump files from runRoutingMass.ts and provides
 * actionable insights for fixing routing issues.
 *
 * Usage:
 *   node src/tests/tools/summarizeRoutingFailures.js <failure_file.json>
 *   node src/tests/tools/summarizeRoutingFailures.js --latest
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../parity/reports');

function findLatestFailureFile() {
  if (!fs.existsSync(REPORTS_DIR)) {
    console.error('Reports directory not found:', REPORTS_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('routing_failures_') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('No failure dump files found. Run with --dumpFailures first.');
    process.exit(1);
  }

  return path.join(REPORTS_DIR, files[0]);
}

function analyzeFailures(data) {
  const { summary, byFamily, clusters, failures } = data;

  console.log('\n' + '='.repeat(70));
  console.log('ROUTING FAILURE ANALYSIS');
  console.log('='.repeat(70));
  console.log(`\nReport timestamp: ${data.timestamp}`);
  console.log(`Total queries: ${summary.total}`);
  console.log(`Family accuracy: ${(summary.familyAccuracy * 100).toFixed(1)}%`);
  console.log(`Total mismatches: ${summary.familyMismatches}`);

  // Family breakdown
  console.log('\n' + '-'.repeat(40));
  console.log('ACCURACY BY FAMILY');
  console.log('-'.repeat(40));

  const families = Object.entries(byFamily)
    .sort((a, b) => a[1].rate - b[1].rate);

  for (const [family, stats] of families) {
    const bar = '█'.repeat(Math.floor(stats.rate * 20)) + '░'.repeat(20 - Math.floor(stats.rate * 20));
    const status = stats.rate >= 0.90 ? '✅' : stats.rate >= 0.80 ? '⚠️' : '❌';
    console.log(`${family.padEnd(15)} ${bar} ${(stats.rate * 100).toFixed(1)}% ${status}`);
  }

  // Cluster analysis - most impactful
  console.log('\n' + '-'.repeat(40));
  console.log('TOP FAILURE PATTERNS (by impact)');
  console.log('-'.repeat(40));

  const allPatterns = [];
  for (const [transition, patterns] of Object.entries(clusters)) {
    for (const p of patterns) {
      allPatterns.push({
        transition,
        pattern: p.pattern,
        count: p.count,
        examples: p.examples,
      });
    }
  }

  allPatterns.sort((a, b) => b.count - a.count);

  for (const p of allPatterns.slice(0, 15)) {
    console.log(`\n[${p.transition}] ${p.pattern}: ${p.count} failures`);
    console.log(`  Example: "${p.examples[0]?.substring(0, 70)}..."`);
    console.log(`  Action: ${suggestFix(p.pattern, p.transition)}`);
  }

  // Actionable recommendations
  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDED FIXES (prioritized)');
  console.log('='.repeat(70));

  const recommendations = generateRecommendations(allPatterns, byFamily);
  for (let i = 0; i < Math.min(recommendations.length, 10); i++) {
    console.log(`\n${i + 1}. ${recommendations[i]}`);
  }

  console.log('\n' + '='.repeat(70));
}

function suggestFix(pattern, transition) {
  const fixes = {
    'help_me_understand': 'Add to block_help_when_content bank with document context patterns',
    'getting_started': 'Add to primary_help with high priority (95+)',
    'appreciated': 'Add standalone pattern to primary_conversation with high priority',
    'thanks_bye': 'Ensure patterns in primary_conversation have priority 90+',
    'filename_reference': 'Add filename extension regex to content_guard bank',
    'open_show_list': 'Add patterns to primary_file_actions or not_content_guard',
    'summarize': 'Ensure summarize verbs route to documents via content_guard',
    'compare': 'Add multi-doc signals to routingOverlays multiDocSignals',
    'what_is_how_many': 'Check doc_stats patterns in routing_patterns.en.json',
    'explain': 'Add explain patterns to content_guard bank',
    'pull_up_bring': 'Add pull up/bring up to primary_file_actions',
  };

  return fixes[pattern] || 'Review pattern banks for this transition';
}

function generateRecommendations(patterns, byFamily) {
  const recs = [];

  // Find worst performing families
  const worstFamily = Object.entries(byFamily)
    .sort((a, b) => a[1].rate - b[1].rate)[0];

  if (worstFamily && worstFamily[1].rate < 0.85) {
    recs.push(`PRIORITY: Focus on ${worstFamily[0]} family (${(worstFamily[1].rate * 100).toFixed(1)}% accuracy)`);
  }

  // Pattern-specific recommendations
  const patternCounts = {};
  for (const p of patterns) {
    patternCounts[p.pattern] = (patternCounts[p.pattern] || 0) + p.count;
  }

  const sortedPatterns = Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1]);

  for (const [pattern, count] of sortedPatterns.slice(0, 5)) {
    if (count >= 5) {
      recs.push(`Fix "${pattern}" pattern (${count} failures): ${suggestFix(pattern, '')}`);
    }
  }

  // Transition-specific recommendations
  const transitionCounts = {};
  for (const p of patterns) {
    transitionCounts[p.transition] = (transitionCounts[p.transition] || 0) + p.count;
  }

  const sortedTransitions = Object.entries(transitionCounts)
    .sort((a, b) => b[1] - a[1]);

  for (const [transition, count] of sortedTransitions.slice(0, 3)) {
    if (count >= 10) {
      const [from, to] = transition.split('_to_');
      recs.push(`Block ${from}→${to} transition: Add patterns to not_${to} or primary_${from} banks`);
    }
  }

  return recs;
}

// Main
function main() {
  const args = process.argv.slice(2);

  let filepath;
  if (args.includes('--latest')) {
    filepath = findLatestFailureFile();
    console.log(`Using latest failure file: ${path.basename(filepath)}`);
  } else if (args.length > 0 && !args[0].startsWith('-')) {
    filepath = args[0];
    if (!fs.existsSync(filepath)) {
      console.error('File not found:', filepath);
      process.exit(1);
    }
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node summarizeRoutingFailures.js [options] [file]

Options:
  --latest    Use the most recent failure dump file
  --help, -h  Show this help message

Arguments:
  file        Path to a routing_failures_*.json file

Examples:
  node summarizeRoutingFailures.js --latest
  node summarizeRoutingFailures.js routing_failures_2026-01-21.json
`);
    process.exit(0);
  } else {
    filepath = findLatestFailureFile();
    console.log(`Using latest failure file: ${path.basename(filepath)}`);
  }

  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    analyzeFailures(data);
  } catch (err) {
    console.error('Error reading file:', err.message);
    process.exit(1);
  }
}

main();
