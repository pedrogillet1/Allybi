/**
 * Routing Probe Suite Runner
 *
 * Validates that the bank-driven routing system correctly handles
 * all 200 test queries in the probe suite.
 *
 * Usage: npx ts-node --transpile-only src/tests/routing_probe_runner.ts
 */

import { OperatorResolver } from '../services/core/operatorResolver.service';
import * as fs from 'fs';
import * as path from 'path';

interface Probe {
  id: string;
  query: string;
  lang: 'en' | 'pt' | 'es';
  expectedOperator?: string;
  expectedIntent?: string;
  domain?: string;
  isFollowup?: boolean;
  negBlocker?: string;
  constraint?: string;
  scope?: string;
  note?: string;
}

interface ProbeSuite {
  _meta: {
    name: string;
    version: string;
    description: string;
  };
  probes: Probe[];
}

interface TestResult {
  id: string;
  query: string;
  passed: boolean;
  expectedOperator?: string;
  actualOperator: string;
  confidence: number;
  error?: string;
}

async function runProbesSuite(): Promise<void> {
  console.log('='.repeat(60));
  console.log('ROUTING PROBE SUITE RUNNER');
  console.log('='.repeat(60));
  console.log('');

  // Load probe suite
  const suitePath = path.join(__dirname, 'routing_probe_suite.json');
  const suite: ProbeSuite = JSON.parse(fs.readFileSync(suitePath, 'utf-8'));

  console.log(`Loaded: ${suite._meta.name} v${suite._meta.version}`);
  console.log(`Total probes: ${suite.probes.length}`);
  console.log('');

  // Initialize resolver
  const resolver = new OperatorResolver();

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Run each probe
  for (const probe of suite.probes) {
    // Skip empty queries
    if (!probe.query || !probe.query.trim()) {
      skipped++;
      continue;
    }

    try {
      const result = resolver.resolve(probe.query, probe.lang || 'en');

      const expectedOp = probe.expectedOperator;
      const actualOp = result.operator;

      // Check if operator matches (if expected operator is specified)
      const operatorMatch = !expectedOp || actualOp === expectedOp;

      // Check followup detection
      const followupMatch = probe.isFollowup === undefined || result.isFollowup === probe.isFollowup;

      const testPassed = operatorMatch && followupMatch;

      if (testPassed) {
        passed++;
        results.push({
          id: probe.id,
          query: probe.query,
          passed: true,
          expectedOperator: expectedOp,
          actualOperator: actualOp,
          confidence: result.confidence,
        });
      } else {
        failed++;
        results.push({
          id: probe.id,
          query: probe.query,
          passed: false,
          expectedOperator: expectedOp,
          actualOperator: actualOp,
          confidence: result.confidence,
          error: `Expected ${expectedOp || '(any)'}, got ${actualOp}`,
        });

        // Print failure details
        console.log(`FAIL: ${probe.id}`);
        console.log(`  Query: "${probe.query.substring(0, 50)}${probe.query.length > 50 ? '...' : ''}"`);
        console.log(`  Expected: ${expectedOp || '(any)'}`);
        console.log(`  Actual: ${actualOp} (conf: ${result.confidence.toFixed(2)})`);
        if (probe.note) console.log(`  Note: ${probe.note}`);
        console.log('');
      }
    } catch (err: any) {
      failed++;
      results.push({
        id: probe.id,
        query: probe.query,
        passed: false,
        actualOperator: 'error',
        confidence: 0,
        error: err.message,
      });
    }
  }

  // Print summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total: ${suite.probes.length}`);
  console.log(`Passed: ${passed} (${((passed / suite.probes.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed} (${((failed / suite.probes.length) * 100).toFixed(1)}%)`);
  console.log(`Skipped: ${skipped}`);
  console.log('');

  // Operator breakdown
  const operatorStats: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    const op = r.expectedOperator || 'unspecified';
    if (!operatorStats[op]) operatorStats[op] = { total: 0, passed: 0 };
    operatorStats[op].total++;
    if (r.passed) operatorStats[op].passed++;
  }

  console.log('Operator Accuracy:');
  for (const [op, stats] of Object.entries(operatorStats).sort((a, b) => a[0].localeCompare(b[0]))) {
    const pct = ((stats.passed / stats.total) * 100).toFixed(0);
    const status = stats.passed === stats.total ? '✓' : '✗';
    console.log(`  ${status} ${op}: ${stats.passed}/${stats.total} (${pct}%)`);
  }

  // Exit code
  const successRate = passed / (passed + failed);
  if (successRate < 0.95) {
    console.log('');
    console.log(`❌ FAILED: Success rate ${(successRate * 100).toFixed(1)}% is below 95% threshold`);
    process.exit(1);
  } else {
    console.log('');
    console.log(`✅ PASSED: Success rate ${(successRate * 100).toFixed(1)}%`);
    process.exit(0);
  }
}

runProbesSuite().catch(console.error);
