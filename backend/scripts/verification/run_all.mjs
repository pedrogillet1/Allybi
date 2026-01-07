/**
 * Master Verification Runner
 *
 * Runs all verification tests and produces a consolidated report:
 * 1. Contract validation (schema compliance)
 * 2. Output hygiene (no internal leaks)
 * 3. Render validation (sources can render)
 * 4. Answer quality (structure, grounding)
 *
 * Usage: node scripts/verification/run_all.mjs
 *
 * Exit codes:
 *   0 = All tests pass
 *   1 = Some tests fail
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SCRIPTS_DIR = '/Users/pg/Desktop/koda-webapp/backend/scripts/verification';
const OUTPUT_DIR = '/tmp/verification';

// ============================================================================
// TEST SUITE CONFIGURATION
// ============================================================================

const TEST_SUITES = [
  {
    name: 'Contract Validation',
    script: 'contract_validation.mjs',
    description: 'Schema compliance - backend returns correct fields',
    critical: true, // Must pass for overall success
  },
  {
    name: 'Output Hygiene',
    script: 'output_hygiene.mjs',
    description: 'No internal code/service names leak to users',
    critical: true,
  },
  {
    name: 'Render Validation',
    script: 'render_sources_test.mjs',
    description: 'Sources can be rendered by frontend components',
    critical: true,
  },
  {
    name: 'Answer Quality',
    script: 'answer_quality.mjs',
    description: 'Structure, bolding, grounding checks',
    critical: false, // Quality issues don't block deployment
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function runScript(scriptPath) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn('node', [scriptPath], {
      cwd: '/Users/pg/Desktop/koda-webapp/backend',
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
        duration: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: err.message,
        duration: Date.now() - startTime,
      });
    });
  });
}

function loadResultsFile(filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filepath)) {
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// Main Runner
// ============================================================================

async function runAll() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           KODA BACKEND VERIFICATION SUITE                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  const startTime = Date.now();
  const results = [];

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Run each test suite
  for (const suite of TEST_SUITES) {
    console.log('┌' + '─'.repeat(60) + '┐');
    console.log(`│ ${suite.name.padEnd(58)} │`);
    console.log(`│ ${suite.description.padEnd(58)} │`);
    console.log('└' + '─'.repeat(60) + '┘');
    console.log();

    const scriptPath = path.join(SCRIPTS_DIR, suite.script);

    if (!fs.existsSync(scriptPath)) {
      console.log(`⚠️  Script not found: ${suite.script}`);
      results.push({
        ...suite,
        status: 'SKIPPED',
        error: 'Script not found',
      });
      continue;
    }

    const result = await runScript(scriptPath);

    const passed = result.exitCode === 0;
    console.log();
    console.log(`${passed ? '✅' : '❌'} ${suite.name}: ${passed ? 'PASSED' : 'FAILED'} (${formatDuration(result.duration)})`);
    console.log();

    results.push({
      name: suite.name,
      script: suite.script,
      critical: suite.critical,
      status: passed ? 'PASS' : 'FAIL',
      exitCode: result.exitCode,
      duration: result.duration,
    });
  }

  // Load detailed results from each test
  const detailedResults = {
    contract: loadResultsFile('contract_validation_results.json'),
    hygiene: loadResultsFile('hygiene_results.json'),
    render: loadResultsFile('render_results.json'),
    quality: loadResultsFile('quality_results.json'),
  };

  // Calculate summary statistics
  const totalDuration = Date.now() - startTime;
  const criticalPassed = results.filter(r => r.critical && r.status === 'PASS').length;
  const criticalTotal = results.filter(r => r.critical).length;
  const allPassed = results.filter(r => r.status === 'PASS').length;
  const allFailed = results.filter(r => r.status === 'FAIL').length;

  // Print summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    VERIFICATION SUMMARY                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    const critical = r.critical ? ' [CRITICAL]' : '';
    console.log(`${icon} ${r.name}${critical}: ${r.status}`);
  }

  console.log();
  console.log('─'.repeat(60));
  console.log(`Total time: ${formatDuration(totalDuration)}`);
  console.log(`Critical tests: ${criticalPassed}/${criticalTotal} passed`);
  console.log(`All tests: ${allPassed}/${results.length} passed`);
  console.log('─'.repeat(60));

  // Detailed metrics from each test
  if (detailedResults.contract) {
    const passed = detailedResults.contract.filter(r => r.status === 'PASS').length;
    console.log(`📋 Contract: ${passed}/${detailedResults.contract.length} queries passed`);
  }

  if (detailedResults.hygiene) {
    const clean = detailedResults.hygiene.filter(r => r.status === 'CLEAN').length;
    const violations = detailedResults.hygiene.reduce((sum, r) => sum + (r.violations?.length || 0), 0);
    console.log(`🧹 Hygiene: ${clean}/${detailedResults.hygiene.length} clean, ${violations} total violations`);
  }

  if (detailedResults.render) {
    const passed = detailedResults.render.filter(r => r.status === 'PASS').length;
    console.log(`🎨 Render: ${passed}/${detailedResults.render.length} queries can render`);
  }

  if (detailedResults.quality) {
    const avgScore = detailedResults.quality.reduce((sum, r) => sum + (r.score || 0), 0) / detailedResults.quality.length;
    console.log(`📊 Quality: Average score ${avgScore.toFixed(1)}/100`);
  }

  console.log('─'.repeat(60));

  // Save consolidated report
  const report = {
    timestamp: new Date().toISOString(),
    duration: totalDuration,
    suites: results,
    summary: {
      criticalPassed,
      criticalTotal,
      allPassed,
      allFailed,
    },
    details: detailedResults,
  };

  const reportPath = path.join(OUTPUT_DIR, 'verification_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📁 Full report saved to: ${reportPath}`);

  // Final verdict
  const allCriticalPassed = criticalPassed === criticalTotal;

  console.log();
  if (allCriticalPassed && allFailed === 0) {
    console.log('🎉 ALL TESTS PASSED - Backend is ready for deployment');
  } else if (allCriticalPassed) {
    console.log('⚠️  CRITICAL TESTS PASSED - Some non-critical tests failed');
    console.log('   Review quality issues before production deployment');
  } else {
    console.log('❌ CRITICAL TESTS FAILED - Backend is NOT ready for deployment');
    console.log('   Fix critical issues before proceeding');
  }

  // Exit code
  process.exit(allCriticalPassed ? 0 : 1);
}

runAll().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
