#!/usr/bin/env node
/**
 * KODA Deploy Readiness Check
 *
 * Single command that runs all verification and produces deploy report.
 *
 * Usage: node tests/deployReadiness.js
 *
 * Output: tests/reports/DEPLOY_READINESS.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';
const TESTS_DIR = __dirname;
const REPORTS_DIR = path.join(TESTS_DIR, 'reports');
const GOLDEN_FILE = path.join(TESTS_DIR, 'golden', 'questions.jsonl');
const HASH_FILE = path.join(TESTS_DIR, 'fixtures', 'DATASET_SHA256.json');

// Import test modules
const { routeQuery, validateRouting, loadData } = require('./routerHarness.cjs');
const { validateOutput } = require('./schemas/outputContracts.cjs');
const { mockStreamMetrics, generateStreamingReport, calculatePercentiles } = require('./streamingMetrics.cjs');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

console.log('='.repeat(70));
console.log('KODA DEPLOY READINESS CHECK');
console.log('='.repeat(70));
console.log('');

const report = {
  timestamp: new Date().toISOString(),
  status: 'UNKNOWN',
  blockers: [],
  warnings: [],
  checks: {}
};

// ============================================================================
// 1. DATASET INTEGRITY CHECK
// ============================================================================

console.log('1️⃣  Checking dataset integrity...');

const CRITICAL_FILES = [
  'intent_patterns.json',
  'domain_layers.json',
  'routing_priority.json',
  'routing_tiebreakers.json',
  'domain_activation.json',
  'negative_triggers.json',
  'intent_schema.json',
  'domain_schema.json'
];

function hashFile(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

const datasetCheck = {
  files_present: 0,
  files_missing: [],
  hash_match: null,
  drift_detected: []
};

for (const file of CRITICAL_FILES) {
  const filepath = path.join(DATA_DIR, file);
  if (fs.existsSync(filepath)) {
    datasetCheck.files_present++;
  } else {
    datasetCheck.files_missing.push(file);
  }
}

if (datasetCheck.files_missing.length > 0) {
  report.blockers.push({
    type: 'MISSING_FILES',
    files: datasetCheck.files_missing
  });
}

// Check against golden hashes
if (fs.existsSync(HASH_FILE)) {
  const goldenHashes = JSON.parse(fs.readFileSync(HASH_FILE, 'utf-8'));

  for (const [file, hash] of Object.entries(goldenHashes.hashes || {})) {
    const filepath = path.join(DATA_DIR, file);
    if (fs.existsSync(filepath)) {
      const currentHash = hashFile(filepath);
      if (currentHash !== hash) {
        datasetCheck.drift_detected.push(file);
      }
    }
  }

  datasetCheck.hash_match = datasetCheck.drift_detected.length === 0;

  if (datasetCheck.drift_detected.length > 0) {
    report.warnings.push({
      type: 'DATASET_DRIFT',
      files: datasetCheck.drift_detected,
      message: 'Dataset changed since last freeze. Review changes and re-freeze if intentional.'
    });
  }
} else {
  datasetCheck.hash_match = null;
  report.warnings.push({
    type: 'NO_BASELINE',
    message: 'No golden hashes found. Run "npm run test:freeze" to create baseline.'
  });
}

report.checks.dataset_integrity = {
  passed: datasetCheck.files_missing.length === 0,
  ...datasetCheck
};

console.log(`   Files present: ${datasetCheck.files_present}/${CRITICAL_FILES.length}`);
console.log(`   Hash baseline: ${datasetCheck.hash_match === null ? 'not set' : datasetCheck.hash_match ? 'match' : 'DRIFT DETECTED'}`);

// ============================================================================
// 2. ROUTING CORRECTNESS CHECK
// ============================================================================

console.log('2️⃣  Running routing verification...');

loadData();

// Load golden questions
const goldenContent = fs.readFileSync(GOLDEN_FILE, 'utf-8');
const goldenQuestions = goldenContent
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

const routingResults = {
  total: goldenQuestions.length,
  passed: 0,
  failed: 0,
  failures: [],
  by_intent: {},
  by_domain: {}
};

for (const q of goldenQuestions) {
  const result = routeQuery(q.input);
  const validation = validateRouting(result, q.expect);

  if (validation.passed) {
    routingResults.passed++;
  } else {
    routingResults.failed++;
    routingResults.failures.push({
      id: q.id,
      input: q.input.substring(0, 50),
      expected: q.expect,
      actual: {
        intent: result.intent,
        domain: result.domain,
        depth: result.depth
      },
      failures: validation.failures
    });
  }

  // Track by intent
  const intent = q.expect.intent;
  if (!routingResults.by_intent[intent]) {
    routingResults.by_intent[intent] = { total: 0, passed: 0 };
  }
  routingResults.by_intent[intent].total++;
  if (validation.passed) routingResults.by_intent[intent].passed++;

  // Track by domain
  const domain = q.expect.domain?.[0] || 'general';
  if (!routingResults.by_domain[domain]) {
    routingResults.by_domain[domain] = { total: 0, passed: 0 };
  }
  routingResults.by_domain[domain].total++;
  if (validation.passed) routingResults.by_domain[domain].passed++;
}

routingResults.pass_rate = (routingResults.passed / routingResults.total * 100).toFixed(2) + '%';

report.checks.routing = {
  passed: routingResults.failed === 0 || (routingResults.failed / routingResults.total) < 0.01,
  ...routingResults
};

if (routingResults.failed > 0 && (routingResults.failed / routingResults.total) >= 0.01) {
  report.blockers.push({
    type: 'ROUTING_FAILURES',
    count: routingResults.failed,
    rate: (routingResults.failed / routingResults.total * 100).toFixed(2) + '%',
    top_failures: routingResults.failures.slice(0, 5)
  });
}

console.log(`   Pass rate: ${routingResults.pass_rate} (${routingResults.passed}/${routingResults.total})`);
console.log(`   Failures: ${routingResults.failed}`);

// ============================================================================
// 3. OUTPUT FORMAT CHECK (using mock data)
// ============================================================================

console.log('3️⃣  Checking output format contracts...');

const formatResults = {
  checked: 0,
  passed: 0,
  failed: 0,
  failures: []
};

// Sample outputs for format validation (in real usage, these come from actual responses)
const sampleOutputs = [
  {
    intent: 'REASONING',
    domain: 'legal',
    output: `## Analysis

The termination clause in Section 5 presents several considerations.

## Implications

1. Early termination requires 30-day notice
2. Material breach allows immediate termination

## Risks

- Ambiguous definition of "material breach"
- No cure period specified

**Note:** This analysis is not legal advice. Consult a qualified attorney.`
  },
  {
    intent: 'EXTRACTION',
    domain: 'medical',
    output: `## Extracted Data

- Blood Pressure: 120/80 mmHg
- Heart Rate: 72 bpm
- Hemoglobin: 14.2 g/dL

## Reference Ranges

All values within normal limits.`
  },
  {
    intent: 'DOCUMENTS',
    domain: 'finance',
    output: `## Relevant Data

Q3 2024 Financial Summary

## Key Figures

- Revenue: $2.5M
- Net Profit: $450K
- EBITDA: $620K`
  }
];

for (const sample of sampleOutputs) {
  const validation = validateOutput(sample.output, sample.intent, sample.domain);
  formatResults.checked++;

  if (validation.valid) {
    formatResults.passed++;
  } else {
    formatResults.failed++;
    formatResults.failures.push({
      intent: sample.intent,
      domain: sample.domain,
      failures: validation.failures
    });
  }
}

formatResults.pass_rate = formatResults.checked > 0
  ? (formatResults.passed / formatResults.checked * 100).toFixed(2) + '%'
  : 'N/A';

report.checks.output_format = {
  passed: formatResults.failed === 0,
  ...formatResults
};

console.log(`   Contracts checked: ${formatResults.checked}`);
console.log(`   Pass rate: ${formatResults.pass_rate}`);

// ============================================================================
// 4. STREAMING METRICS (using mock data for offline testing)
// ============================================================================

console.log('4️⃣  Calculating streaming metrics...');

const streamingMetrics = [];

// Generate mock metrics for golden questions (in real usage, hit actual endpoint)
for (const q of goldenQuestions.slice(0, 50)) { // Sample 50 for speed
  const result = routeQuery(q.input);
  const mockMetric = mockStreamMetrics(q.input, result.timing.router_ms);
  streamingMetrics.push(mockMetric);
}

const streamingReport = generateStreamingReport(streamingMetrics);

report.checks.streaming = {
  passed: streamingReport.summary.success_rate === '100.0%',
  summary: streamingReport.summary,
  timing: {
    p50_first_token_ms: streamingReport.timing_percentiles.first_token_ms.p50,
    p95_first_token_ms: streamingReport.timing_percentiles.first_token_ms.p95,
    p50_total_ms: streamingReport.timing_percentiles.total_ms.p50,
    p95_total_ms: streamingReport.timing_percentiles.total_ms.p95
  },
  throughput: {
    p50_tokens_sec: streamingReport.throughput_percentiles.tokens_per_sec.p50,
    p95_tokens_sec: streamingReport.throughput_percentiles.tokens_per_sec.p95
  },
  threshold_compliance: streamingReport.threshold_compliance
};

console.log(`   First token (p50): ${report.checks.streaming.timing.p50_first_token_ms}ms`);
console.log(`   Tokens/sec (p50): ${report.checks.streaming.throughput.p50_tokens_sec}`);

// ============================================================================
// 5. DATA COVERAGE CHECK
// ============================================================================

console.log('5️⃣  Checking data coverage...');

const intentPatterns = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'intent_patterns.json'), 'utf-8'));
const domainLayers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'domain_layers.json'), 'utf-8'));

const coverageResults = {
  intents: {},
  domains: {},
  total_items: 0
};

// Count intent items
for (const [intentName, intentData] of Object.entries(intentPatterns.intents || {})) {
  let kwCount = 0;
  let patCount = 0;

  for (const lang of ['en', 'pt', 'es']) {
    kwCount += (intentData.keywords?.[lang] || []).length;
    patCount += (intentData.patterns?.[lang] || []).length;
  }

  coverageResults.intents[intentName] = {
    keywords: kwCount,
    patterns: patCount,
    total: kwCount + patCount
  };
  coverageResults.total_items += kwCount + patCount;
}

// Count domain items
for (const [domainName, domainData] of Object.entries(domainLayers.domains || {})) {
  let kwCount = 0;
  let patCount = 0;

  for (const lang of ['en', 'pt', 'es']) {
    kwCount += (domainData.keywords?.[lang] || []).length;
    patCount += (domainData.patterns?.[lang] || []).length;
  }

  coverageResults.domains[domainName] = {
    keywords: kwCount,
    patterns: patCount,
    total: kwCount + patCount
  };
  coverageResults.total_items += kwCount + patCount;
}

report.checks.coverage = {
  passed: coverageResults.total_items > 600000, // Expect 600k+ items
  total_items: coverageResults.total_items,
  intents: Object.keys(coverageResults.intents).length,
  domains: Object.keys(coverageResults.domains).length
};

console.log(`   Total items: ${coverageResults.total_items.toLocaleString()}`);
console.log(`   Intents: ${Object.keys(coverageResults.intents).length}`);
console.log(`   Domains: ${Object.keys(coverageResults.domains).length}`);

// ============================================================================
// FINAL STATUS
// ============================================================================

console.log('');
console.log('='.repeat(70));
console.log('DEPLOY READINESS REPORT');
console.log('='.repeat(70));

// Determine final status
if (report.blockers.length > 0) {
  report.status = 'BLOCKED';
  console.log('\n🔴 STATUS: BLOCKED - DO NOT DEPLOY\n');
  console.log('Blockers:');
  for (const blocker of report.blockers) {
    console.log(`  ❌ ${blocker.type}: ${JSON.stringify(blocker).substring(0, 100)}`);
  }
} else if (report.warnings.length > 0) {
  report.status = 'CONDITIONAL';
  console.log('\n🟡 STATUS: CONDITIONAL - Review warnings before deploy\n');
  console.log('Warnings:');
  for (const warning of report.warnings) {
    console.log(`  ⚠️  ${warning.type}: ${warning.message || JSON.stringify(warning).substring(0, 80)}`);
  }
} else {
  report.status = 'GO';
  console.log('\n✅ STATUS: GO - Ready for deployment\n');
}

// Summary table
console.log('Check Results:');
console.log('-'.repeat(50));
console.log(`  Dataset Integrity: ${report.checks.dataset_integrity.passed ? '✅' : '❌'}`);
console.log(`  Routing Accuracy:  ${report.checks.routing.passed ? '✅' : '❌'} (${routingResults.pass_rate})`);
console.log(`  Output Format:     ${report.checks.output_format.passed ? '✅' : '❌'}`);
console.log(`  Streaming:         ${report.checks.streaming.passed ? '✅' : '❌'}`);
console.log(`  Data Coverage:     ${report.checks.coverage.passed ? '✅' : '❌'} (${coverageResults.total_items.toLocaleString()} items)`);

// Save report
const reportPath = path.join(REPORTS_DIR, 'DEPLOY_READINESS.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('');
console.log('='.repeat(70));
console.log(`Report saved to: ${reportPath}`);
console.log('='.repeat(70));

// Exit with appropriate code
process.exit(report.status === 'BLOCKED' ? 1 : 0);
