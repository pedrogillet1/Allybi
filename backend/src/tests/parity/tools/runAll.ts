/**
 * Run All Parity Suites
 *
 * Executes all parity test suites sequentially.
 * Reports are saved to src/tests/parity/reports/
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const SUITES = ['followup', 'formatting', 'grounding', 'completeness'];

async function runAll() {
  console.log('═'.repeat(60));
  console.log('RUNNING ALL PARITY TEST SUITES');
  console.log('═'.repeat(60));
  console.log('');

  const results: Array<{ suite: string; passed: boolean; rate: number }> = [];

  for (const suite of SUITES) {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Running: ${suite}`);
    console.log('─'.repeat(40));

    try {
      execSync(`npx ts-node src/tests/parity/suites/${suite}.suite.ts`, {
        cwd: process.cwd(),
        stdio: 'inherit',
      });

      // Read report
      const reportPath = path.join(process.cwd(), 'src/tests/parity/reports', `${suite}.json`);
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        results.push({
          suite,
          passed: report.passRate >= 0.90,
          rate: report.passRate,
        });
      }
    } catch (err) {
      console.error(`Suite ${suite} failed to run`);
      results.push({ suite, passed: false, rate: 0 });
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('PARITY TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log('');

  console.log('┌────────────────┬──────────┬─────────┐');
  console.log('│ Suite          │ Rate     │ Status  │');
  console.log('├────────────────┼──────────┼─────────┤');

  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(
      `│ ${r.suite.padEnd(14)} │ ${(r.rate * 100).toFixed(1).padStart(6)}%  │ ${status.padEnd(7)} │`
    );
  }

  console.log('└────────────────┴──────────┴─────────┘');

  const allPassed = results.every((r) => r.passed);
  console.log('');
  console.log(allPassed ? '✅ All suites passed!' : '❌ Some suites need attention.');
  console.log('═'.repeat(60));
}

runAll().catch(console.error);
