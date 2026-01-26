#!/usr/bin/env ts-node
/**
 * Routing Mass Test Runner
 *
 * Usage:
 *   npx ts-node src/tests/tools/runRoutingMass.ts --n=1500
 *   npx ts-node src/tests/tools/runRoutingMass.ts --n=5000 --verbose
 *   npx ts-node src/tests/tools/runRoutingMass.ts --n=5000 --dumpFailures
 */

import { generateBatch, GeneratedQuery } from '../generators/queryGenerator';
import { router } from '../../services/core/router.service';
import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_AVAILABLE_DOCS = [
  { id: '1', filename: 'financial_report.pdf' },
  { id: '2', filename: 'project_plan.docx' },
  { id: '3', filename: 'budget_2024.xlsx' },
  { id: '4', filename: 'presentation.pptx' },
];

interface FailureRecord {
  expected: string;
  actual: string;
  queries: string[];
}

interface ClusterResult {
  pattern: string;
  count: number;
  examples: string[];
}

interface AnalysisResults {
  total: number;
  familyMismatches: number;
  familyAccuracy: number;
  byFamily: Record<string, { correct: number; total: number; rate: number }>;
  failures: Record<string, FailureRecord>;
  operatorFailures: Record<string, string[]>;
  scopeFailures: Record<string, string[]>;
  allFailedQueries: Array<{
    query: string;
    expected: { family: string; operator?: string; scope?: string };
    actual: { family: string; operator?: string; scope?: string };
  }>;
  clusters: Record<string, ClusterResult[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function runAnalysis(count: number, verbose: boolean): Promise<AnalysisResults> {
  console.log(`\nGenerating ${count} queries...`);
  const queries = generateBatch({ count });

  const failures: Record<string, FailureRecord> = {};
  const operatorFailures: Record<string, string[]> = {};
  const scopeFailures: Record<string, string[]> = {};
  const byFamily: Record<string, { correct: number; total: number; rate: number }> = {};
  const allFailedQueries: AnalysisResults['allFailedQueries'] = [];

  let totalChecked = 0;
  let familyMismatches = 0;

  console.log(`Running routing tests...`);
  const startTime = Date.now();

  for (const q of queries) {
    const result = await router.route({
      text: q.query,
      userId: 'mass-test',
      hasDocuments: true,
      availableDocs: MOCK_AVAILABLE_DOCS,
    });
    totalChecked++;

    const expectedFamily = q.expected.intentFamily;
    const actualFamily = result.intentFamily;

    // Track by family
    if (!byFamily[expectedFamily]) {
      byFamily[expectedFamily] = { correct: 0, total: 0, rate: 0 };
    }
    byFamily[expectedFamily].total++;

    if (expectedFamily === actualFamily) {
      byFamily[expectedFamily].correct++;
    } else {
      familyMismatches++;
      const key = `${expectedFamily}_to_${actualFamily}`;
      if (!failures[key]) {
        failures[key] = { expected: expectedFamily, actual: actualFamily, queries: [] };
      }
      if (failures[key].queries.length < 10) {
        failures[key].queries.push(q.query);
      }

      // Store all failures for dump
      allFailedQueries.push({
        query: q.query,
        expected: { family: expectedFamily, operator: q.expected.operator, scope: q.expected.scopeMode },
        actual: { family: actualFamily, operator: result.operator, scope: result.docScope?.mode },
      });
    }

    // Check operator if same family (documents)
    if (expectedFamily === actualFamily && expectedFamily === 'documents') {
      const expectedOp = q.expected.operator;
      const actualOp = result.operator;
      if (expectedOp && actualOp && expectedOp !== actualOp) {
        const key = `${expectedOp}_to_${actualOp}`;
        if (!operatorFailures[key]) operatorFailures[key] = [];
        if (operatorFailures[key].length < 5) {
          operatorFailures[key].push(q.query);
        }
      }
    }

    // Check scope for documents
    if (expectedFamily === 'documents') {
      const expectedScope = q.expected.scopeMode;
      let actualScope = 'none';
      if (result.docScope?.mode === 'single_doc') actualScope = 'single';
      else if (result.docScope?.mode === 'multi_doc') actualScope = 'multi';
      else if (result.docScope?.mode === 'workspace') actualScope = 'all';

      if (expectedScope !== actualScope && expectedScope !== 'none') {
        const key = `${expectedScope}_to_${actualScope}`;
        if (!scopeFailures[key]) scopeFailures[key] = [];
        if (scopeFailures[key].length < 5) {
          scopeFailures[key].push(q.query);
        }
      }
    }

    // Progress indicator
    if (totalChecked % 500 === 0) {
      process.stdout.write(`  ${totalChecked}/${count} processed\r`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);

  // Calculate rates
  for (const family of Object.keys(byFamily)) {
    byFamily[family].rate = byFamily[family].correct / byFamily[family].total;
  }

  // Cluster analysis
  const clusters = clusterFailures(allFailedQueries);

  return {
    total: totalChecked,
    familyMismatches,
    familyAccuracy: (totalChecked - familyMismatches) / totalChecked,
    byFamily,
    failures,
    operatorFailures,
    scopeFailures,
    allFailedQueries,
    clusters,
  };
}

/**
 * Cluster failures by common patterns
 */
function clusterFailures(failures: AnalysisResults['allFailedQueries']): Record<string, ClusterResult[]> {
  const clusters: Record<string, ClusterResult[]> = {};

  // Pattern detectors
  const patternDetectors = [
    { name: 'help_me_understand', regex: /\bhelp\s+me\s+understand\b/i },
    { name: 'getting_started', regex: /\bgetting\s+started\b/i },
    { name: 'appreciated', regex: /\bappreciated\b/i },
    { name: 'thanks_bye', regex: /\b(thanks?|thank\s+you|bye|goodbye)\b/i },
    { name: 'filename_reference', regex: /\S+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/i },
    { name: 'open_show_list', regex: /\b(open|show|display|list)\s+(me\s+)?(all\s+)?(my\s+)?(the\s+)?(files?|documents?|pdfs?)\b/i },
    { name: 'summarize', regex: /\bsummar(y|ize|ise)\b/i },
    { name: 'compare', regex: /\b(compare|comparison|versus|vs\.?)\b/i },
    { name: 'what_is_how_many', regex: /\b(what\s+is|how\s+many|how\s+long)\b/i },
    { name: 'explain', regex: /\bexplain\b/i },
    { name: 'pull_up_bring', regex: /\b(pull\s+up|bring\s+up|load|fetch)\b/i },
  ];

  for (const failure of failures) {
    const key = `${failure.expected.family}_to_${failure.actual.family}`;
    if (!clusters[key]) clusters[key] = [];

    // Check which patterns match
    for (const detector of patternDetectors) {
      if (detector.regex.test(failure.query)) {
        const existing = clusters[key].find(c => c.pattern === detector.name);
        if (existing) {
          existing.count++;
          if (existing.examples.length < 5) {
            existing.examples.push(failure.query);
          }
        } else {
          clusters[key].push({
            pattern: detector.name,
            count: 1,
            examples: [failure.query],
          });
        }
      }
    }
  }

  // Sort clusters by count
  for (const key of Object.keys(clusters)) {
    clusters[key].sort((a, b) => b.count - a.count);
  }

  return clusters;
}

function printResults(results: AnalysisResults, verbose: boolean): void {
  console.log('\n' + '═'.repeat(60));
  console.log('ROUTING MASS TEST RESULTS');
  console.log('═'.repeat(60));

  console.log(`\nTotal queries: ${results.total}`);
  console.log(`Family accuracy: ${(results.familyAccuracy * 100).toFixed(1)}%`);
  console.log(`Family mismatches: ${results.familyMismatches}`);

  // By family breakdown
  console.log('\n┌─────────────────┬─────────┬─────────┬──────────┐');
  console.log('│ Family          │ Correct │ Total   │ Accuracy │');
  console.log('├─────────────────┼─────────┼─────────┼──────────┤');

  const families = ['documents', 'file_actions', 'conversation', 'help', 'doc_stats'];
  for (const family of families) {
    const data = results.byFamily[family];
    if (data) {
      const acc = (data.rate * 100).toFixed(1).padStart(5);
      const status = data.rate >= 0.85 ? '✅' : data.rate >= 0.70 ? '⚠️' : '❌';
      console.log(`│ ${family.padEnd(15)} │ ${String(data.correct).padStart(7)} │ ${String(data.total).padStart(7)} │ ${acc}% ${status} │`);
    }
  }
  console.log('└─────────────────┴─────────┴─────────┴──────────┘');

  // Top family misroutes
  const sortedFailures = Object.entries(results.failures)
    .sort((a, b) => b[1].queries.length - a[1].queries.length);

  if (sortedFailures.length > 0) {
    console.log('\n─── TOP FAMILY MISROUTES ───\n');
    for (const [key, data] of sortedFailures.slice(0, 10)) {
      console.log(`[${data.expected}] → [${data.actual}] (${data.queries.length} examples)`);
      if (verbose) {
        for (const q of data.queries.slice(0, 4)) {
          console.log(`  • "${q.substring(0, 70)}${q.length > 70 ? '...' : ''}"`);
        }
      } else {
        console.log(`  • "${data.queries[0]?.substring(0, 60)}..."`);
      }
      console.log('');
    }
  }

  // Operator mismatches
  const sortedOps = Object.entries(results.operatorFailures)
    .sort((a, b) => b[1].length - a[1].length);

  if (sortedOps.length > 0) {
    console.log('─── OPERATOR MISMATCHES (within documents) ───\n');
    for (const [key, queries] of sortedOps.slice(0, 8)) {
      console.log(`${key} (${queries.length} examples)`);
      if (verbose) {
        for (const q of queries.slice(0, 3)) {
          console.log(`  • "${q.substring(0, 65)}${q.length > 65 ? '...' : ''}"`);
        }
      }
      console.log('');
    }
  }

  // Scope mismatches
  const sortedScopes = Object.entries(results.scopeFailures)
    .sort((a, b) => b[1].length - a[1].length);

  if (sortedScopes.length > 0) {
    console.log('─── SCOPE MISMATCHES ───\n');
    for (const [key, queries] of sortedScopes.slice(0, 6)) {
      console.log(`${key} (${queries.length} examples)`);
      if (verbose) {
        for (const q of queries.slice(0, 3)) {
          console.log(`  • "${q.substring(0, 65)}${q.length > 65 ? '...' : ''}"`);
        }
      }
      console.log('');
    }
  }

  // Cluster analysis
  if (Object.keys(results.clusters).length > 0) {
    console.log('─── FAILURE CLUSTERS ───\n');
    for (const [key, patterns] of Object.entries(results.clusters)) {
      if (patterns.length > 0) {
        console.log(`[${key}]`);
        for (const p of patterns.slice(0, 5)) {
          console.log(`  • ${p.pattern}: ${p.count} occurrences`);
          if (verbose && p.examples.length > 0) {
            console.log(`    "${p.examples[0].substring(0, 60)}..."`);
          }
        }
        console.log('');
      }
    }
  }

  // Summary
  console.log('═'.repeat(60));
  const overallPass = results.familyAccuracy >= 0.90;
  console.log(`Overall: ${overallPass ? '✅ PASS' : '❌ FAIL'} (target: 90%+)`);
  console.log('═'.repeat(60));
}

function dumpFailuresToFile(results: AnalysisResults): string {
  const outputDir = path.join(process.cwd(), 'src/tests/parity/reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `routing_failures_${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  const dump = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      familyAccuracy: results.familyAccuracy,
      familyMismatches: results.familyMismatches,
    },
    byFamily: results.byFamily,
    clusters: results.clusters,
    failures: results.allFailedQueries,
  };

  fs.writeFileSync(filepath, JSON.stringify(dump, null, 2));
  return filepath;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  let count = 1500;
  let verbose = false;
  let dumpFailures = false;

  for (const arg of args) {
    if (arg.startsWith('--n=')) {
      count = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--dumpFailures' || arg === '--dump') {
      dumpFailures = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npx ts-node src/tests/tools/runRoutingMass.ts [options]

Options:
  --n=<number>      Number of queries to generate (default: 1500)
  --verbose, -v     Show more example queries for each failure
  --dumpFailures    Save all failures to JSON file in src/tests/parity/reports/
  --help, -h        Show this help message

Examples:
  npx ts-node src/tests/tools/runRoutingMass.ts --n=1500
  npx ts-node src/tests/tools/runRoutingMass.ts --n=5000 --verbose
  npx ts-node src/tests/tools/runRoutingMass.ts --n=5000 --dumpFailures
`);
      process.exit(0);
    }
  }

  try {
    const results = await runAnalysis(count, verbose);
    printResults(results, verbose);

    if (dumpFailures && results.allFailedQueries.length > 0) {
      const filepath = dumpFailuresToFile(results);
      console.log(`\n📁 Failures dumped to: ${filepath}`);
      console.log(`   Total failed queries: ${results.allFailedQueries.length}`);
    }
  } catch (err) {
    console.error('Error running analysis:', err);
    process.exit(1);
  }
}

main();
