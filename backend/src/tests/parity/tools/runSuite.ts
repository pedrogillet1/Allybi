/**
 * Shared Suite Runner Utilities
 *
 * Common types and functions for all parity test suites.
 */

import fs from 'fs';
import path from 'path';

export interface SuiteResult {
  suite: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  timestamp: string;
  failures: Array<{
    id: string;
    reason: string;
    input: any;
    output?: any;
  }>;
}

export function writeReport(result: SuiteResult): void {
  const dir = path.join(process.cwd(), 'src/tests/parity/reports');
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `${result.suite}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));

  // Print summary
  const status = result.passRate >= 0.90 ? '✅' : result.passRate >= 0.80 ? '⚠️' : '❌';
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`${status} Suite: ${result.suite.toUpperCase()}`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`Total:  ${result.total}`);
  console.log(`Passed: ${result.passed}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Rate:   ${(result.passRate * 100).toFixed(1)}%`);

  if (result.failures.length > 0) {
    console.log(`\nTop failures:`);
    for (const f of result.failures.slice(0, 5)) {
      console.log(`  - [${f.id}] ${f.reason}`);
    }
  }

  console.log(`\nReport saved: ${file}`);
}

export function createResult(
  suite: string,
  total: number,
  passed: number,
  failures: SuiteResult['failures']
): SuiteResult {
  return {
    suite,
    total,
    passed,
    failed: total - passed,
    passRate: total > 0 ? passed / total : 0,
    timestamp: new Date().toISOString(),
    failures,
  };
}
