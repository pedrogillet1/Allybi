/**
 * KODA — BEGINNER USER TEST RUNNER
 *
 * Validates routing for first-contact, zero-knowledge users
 * Pass criteria:
 * - Correct intent: ≥95%
 * - Correct depth: ≥90%
 * - No over-analysis (beginner → D3/D4): 100%
 */

// Clear module cache to ensure fresh data load
delete require.cache[require.resolve('./routerHarness.cjs')];
const { routeQuery, loadData } = require('./routerHarness.cjs');
const fs = require('fs');
const path = require('path');

// Force fresh data load
loadData();

const testSet = JSON.parse(fs.readFileSync(path.join(__dirname, 'beginner_test_set.json'), 'utf-8'));

console.log('═'.repeat(70));
console.log('KODA — BEGINNER USER TEST');
console.log('═'.repeat(70));
console.log(`Total questions: ${testSet.questions.length}`);
console.log(`Categories: ${testSet._meta.categories}`);
console.log('');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
  byCategory: {},
  intentAccuracy: { correct: 0, total: 0 },
  depthAccuracy: { correct: 0, total: 0 },
  overAnalysis: { count: 0, cases: [] }
};

// Initialize category tracking
for (const q of testSet.questions) {
  if (!results.byCategory[q.category]) {
    results.byCategory[q.category] = { passed: 0, total: 0, failures: [] };
  }
}

for (const q of testSet.questions) {
  results.total++;
  results.byCategory[q.category].total++;
  results.intentAccuracy.total++;
  results.depthAccuracy.total++;

  const trace = routeQuery(q.input, q.lang || 'auto');

  const expectedIntent = q.expected.intent;
  const expectedDepth = q.expected.depth;
  const actualIntent = trace.intent;
  const actualDepth = trace.depth;

  const intentMatch = actualIntent === expectedIntent;
  const depthMatch = actualDepth === expectedDepth;

  if (intentMatch) results.intentAccuracy.correct++;
  if (depthMatch) results.depthAccuracy.correct++;

  // Check for over-analysis: beginner query getting D3/D4
  const isBeginnerQuery = ['D1', 'D2'].includes(expectedDepth);
  const gotDeepAnalysis = ['D3', 'D4', 'D5'].includes(actualDepth);
  if (isBeginnerQuery && gotDeepAnalysis) {
    results.overAnalysis.count++;
    results.overAnalysis.cases.push({
      id: q.id,
      input: q.input,
      expectedDepth,
      actualDepth
    });
  }

  const passed = intentMatch && depthMatch;

  if (passed) {
    results.passed++;
    results.byCategory[q.category].passed++;
  } else {
    results.failed++;
    const failure = {
      id: q.id,
      category: q.category,
      input: q.input,
      expected: q.expected,
      actual: { intent: actualIntent, depth: actualDepth },
      issues: []
    };
    if (!intentMatch) failure.issues.push(`intent: expected ${expectedIntent}, got ${actualIntent}`);
    if (!depthMatch) failure.issues.push(`depth: expected ${expectedDepth}, got ${actualDepth}`);
    results.failures.push(failure);
    results.byCategory[q.category].failures.push(failure);
  }
}

// Print results by category
console.log('RESULTS BY CATEGORY');
console.log('─'.repeat(70));
for (const [cat, data] of Object.entries(results.byCategory)) {
  const rate = ((data.passed / data.total) * 100).toFixed(1);
  const status = data.passed === data.total ? '✓' : '✗';
  console.log(`  ${status} ${cat}: ${data.passed}/${data.total} (${rate}%)`);

  if (data.failures.length > 0 && data.failures.length <= 3) {
    for (const f of data.failures) {
      console.log(`      └─ "${f.input}" → ${f.issues.join(', ')}`);
    }
  } else if (data.failures.length > 3) {
    for (const f of data.failures.slice(0, 2)) {
      console.log(`      └─ "${f.input}" → ${f.issues.join(', ')}`);
    }
    console.log(`      └─ ... and ${data.failures.length - 2} more`);
  }
}

// Print summary metrics
console.log('');
console.log('SUMMARY METRICS');
console.log('─'.repeat(70));
const passRate = ((results.passed / results.total) * 100).toFixed(2);
const intentRate = ((results.intentAccuracy.correct / results.intentAccuracy.total) * 100).toFixed(2);
const depthRate = ((results.depthAccuracy.correct / results.depthAccuracy.total) * 100).toFixed(2);
const overAnalysisRate = results.overAnalysis.count;

console.log(`  Overall pass rate: ${results.passed}/${results.total} (${passRate}%)`);
console.log(`  Intent accuracy:   ${results.intentAccuracy.correct}/${results.intentAccuracy.total} (${intentRate}%)`);
console.log(`  Depth accuracy:    ${results.depthAccuracy.correct}/${results.depthAccuracy.total} (${depthRate}%)`);
console.log(`  Over-analysis:     ${overAnalysisRate} cases`);

// Check pass criteria
console.log('');
console.log('PASS CRITERIA');
console.log('─'.repeat(70));
const intentPassed = parseFloat(intentRate) >= 95;
const depthPassed = parseFloat(depthRate) >= 90;
const overAnalysisPassed = overAnalysisRate === 0;

console.log(`  ${intentPassed ? '✓' : '✗'} Intent accuracy ≥95%: ${intentRate}%`);
console.log(`  ${depthPassed ? '✓' : '✗'} Depth accuracy ≥90%: ${depthRate}%`);
console.log(`  ${overAnalysisPassed ? '✓' : '✗'} No over-analysis: ${overAnalysisRate} cases`);

if (results.overAnalysis.cases.length > 0) {
  console.log('');
  console.log('  Over-analysis cases:');
  for (const c of results.overAnalysis.cases) {
    console.log(`    - "${c.input}" expected ${c.expectedDepth}, got ${c.actualDepth}`);
  }
}

const allPassed = intentPassed && depthPassed && overAnalysisPassed;
console.log('');
console.log('═'.repeat(70));
console.log(`RESULT: ${allPassed ? '✓ PASSED' : '✗ FAILED'}`);
console.log('═'.repeat(70));

// Print top failures for fixing
if (results.failures.length > 0) {
  console.log('');
  console.log('TOP FAILURES TO FIX');
  console.log('─'.repeat(70));
  const intentFailures = results.failures.filter(f => f.issues.some(i => i.startsWith('intent:')));
  const depthFailures = results.failures.filter(f => f.issues.some(i => i.startsWith('depth:')));

  console.log(`  Intent failures: ${intentFailures.length}`);
  for (const f of intentFailures.slice(0, 5)) {
    const intentIssue = f.issues.find(i => i.startsWith('intent:'));
    console.log(`    - [${f.id}] "${f.input}"`);
    console.log(`      ${intentIssue}`);
  }

  console.log(`  Depth failures: ${depthFailures.length}`);
  for (const f of depthFailures.slice(0, 5)) {
    const depthIssue = f.issues.find(i => i.startsWith('depth:'));
    console.log(`    - [${f.id}] "${f.input}"`);
    console.log(`      ${depthIssue}`);
  }
}

// Save results
const outputPath = path.join(__dirname, 'reports', 'BEGINNER_TEST_RESULTS.json');
fs.writeFileSync(outputPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    total: results.total,
    passed: results.passed,
    failed: results.failed,
    passRate: passRate + '%',
    intentAccuracy: intentRate + '%',
    depthAccuracy: depthRate + '%',
    overAnalysisCount: overAnalysisRate
  },
  criteria: {
    intentPassed,
    depthPassed,
    overAnalysisPassed,
    allPassed
  },
  byCategory: Object.fromEntries(
    Object.entries(results.byCategory).map(([k, v]) => [k, {
      passed: v.passed,
      total: v.total,
      rate: ((v.passed / v.total) * 100).toFixed(1) + '%'
    }])
  ),
  failures: results.failures,
  overAnalysisCases: results.overAnalysis.cases
}, null, 2));
console.log(`\nResults saved to: ${outputPath}`);
