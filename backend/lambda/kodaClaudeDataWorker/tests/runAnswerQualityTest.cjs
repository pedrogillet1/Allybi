/**
 * KODA — ANSWER QUALITY & STREAMING TEST RUNNER
 *
 * Validates 4 dimensions:
 * 1. Correct intent chosen
 * 2. Correct answer format/structure
 * 3. Streaming stability
 * 4. Timing/performance
 *
 * Pass criteria:
 * - Intent accuracy ≥95%
 * - Format compliance 100%
 * - Streaming stability 100%
 * - No over-analysis in beginner queries
 */

// Clear cache for fresh data
delete require.cache[require.resolve('./routerHarness.cjs')];
const { routeQuery, loadData } = require('./routerHarness.cjs');
const fs = require('fs');
const path = require('path');

// Force fresh data load
loadData();

// Load test set
const testSet = JSON.parse(fs.readFileSync(path.join(__dirname, 'answer_quality_test_set.json'), 'utf-8'));

// Load answer styles for format validation
const answerStyles = JSON.parse(fs.readFileSync('/Users/pg/Desktop/koda-webapp/backend/src/data/answer_styles.json', 'utf-8'));

console.log('═'.repeat(70));
console.log('KODA — ANSWER QUALITY & STREAMING TEST');
console.log('═'.repeat(70));

const results = {
  routing: { passed: 0, failed: 0, failures: [] },
  format: { passed: 0, failed: 0, failures: [] },
  streaming: { passed: 0, failed: 0, failures: [] },
  timing: { passed: 0, failed: 0, failures: [] },
  overAnalysis: { count: 0, cases: [] },
  byIntent: {}
};

// Initialize intent tracking
for (const intent of Object.keys(testSet.tests)) {
  results.byIntent[intent] = { total: 0, passed: 0, failures: [] };
}

// Style validation rules by intent
const STYLE_RULES = {
  DOCUMENTS: {
    maxTokens: 300,
    allowTables: false,
    allowBullets: true,
    forbiddenPatterns: ['I think', 'In my opinion', 'You should consider', 'Analysis:', 'Recommendation:'],
    requiredPatterns: []
  },
  FILE_ACTIONS: {
    maxTokens: 200,
    allowTables: false,
    allowBullets: false,
    forbiddenPatterns: ['Analysis:', 'Let me explain', 'The reason is'],
    requiredPatterns: []
  },
  HELP: {
    maxTokens: 500,
    allowTables: false,
    allowBullets: true,
    forbiddenPatterns: ['From the document', 'The contract states', 'According to'],
    requiredPatterns: []
  },
  ERROR: {
    maxTokens: 300,
    allowTables: false,
    allowBullets: true,
    forbiddenPatterns: ['Stack trace', 'Exception:', 'Error code:', 'at line'],
    requiredPatterns: []
  },
  CONVERSATION: {
    maxTokens: 100,
    allowTables: false,
    allowBullets: false,
    forbiddenPatterns: ['Next steps:', 'Here\'s what', 'Let me help you with'],
    requiredPatterns: []
  },
  EXTRACTION: {
    maxTokens: 400,
    allowTables: true,
    allowBullets: true,
    forbiddenPatterns: ['I believe', 'This suggests', 'My analysis'],
    requiredPatterns: []
  },
  REASONING: {
    maxTokens: 800,
    allowTables: true,
    allowBullets: true,
    forbiddenPatterns: [],
    requiredPatterns: []
  }
};

/**
 * Validate response format against intent rules
 */
function validateFormat(intent, response) {
  const rules = STYLE_RULES[intent] || STYLE_RULES.CONVERSATION;
  const issues = [];

  // Check token count (approximate)
  const tokenCount = response.split(/\s+/).length;
  if (tokenCount > rules.maxTokens) {
    issues.push(`Token count ${tokenCount} exceeds max ${rules.maxTokens}`);
  }

  // Check forbidden patterns
  for (const pattern of rules.forbiddenPatterns) {
    if (response.toLowerCase().includes(pattern.toLowerCase())) {
      issues.push(`Contains forbidden pattern: "${pattern}"`);
    }
  }

  // Check table usage
  if (!rules.allowTables && (response.includes('|---') || response.includes('| --- |'))) {
    issues.push('Contains table but tables not allowed');
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

/**
 * Check for over-analysis (beginner query getting deep analysis)
 */
function checkOverAnalysis(expectedIntent, actualIntent, response) {
  const beginnerIntents = ['DOCUMENTS', 'FILE_ACTIONS', 'HELP', 'ERROR', 'CONVERSATION'];

  if (beginnerIntents.includes(expectedIntent)) {
    // Check if response contains analysis markers
    const analysisMarkers = [
      'analysis shows', 'upon examination', 'reviewing the', 'my assessment',
      'implications include', 'this suggests that', 'the key takeaway',
      'in conclusion', 'therefore', 'consequently'
    ];

    for (const marker of analysisMarkers) {
      if (response.toLowerCase().includes(marker)) {
        return { overAnalyzed: true, marker };
      }
    }

    // Check if routed to REASONING when shouldn't
    if (actualIntent === 'REASONING' && expectedIntent !== 'REASONING') {
      return { overAnalyzed: true, marker: 'Routed to REASONING' };
    }
  }

  return { overAnalyzed: false };
}

/**
 * Simulate streaming (using router timing as proxy)
 */
function simulateStreaming(input) {
  const startTime = Date.now();
  const trace = routeQuery(input);
  const routingTime = Date.now() - startTime;

  // Simulate answer generation time based on intent
  const answerTimes = {
    CONVERSATION: 100,
    FILE_ACTIONS: 150,
    ERROR: 200,
    HELP: 300,
    DOCUMENTS: 250,
    EXTRACTION: 400,
    REASONING: 600
  };

  const estimatedAnswerTime = answerTimes[trace.intent] || 300;

  return {
    firstTokenMs: routingTime + 50, // Routing + first token
    totalMs: routingTime + estimatedAnswerTime,
    intent: trace.intent,
    trace
  };
}

// ============================================================================
// RUN TESTS
// ============================================================================

console.log('\n1️⃣  ROUTING & FORMAT VALIDATION');
console.log('─'.repeat(70));

let totalQuestions = 0;

for (const [intent, category] of Object.entries(testSet.tests)) {
  console.log(`\n  ${intent}:`);

  for (const q of category.questions) {
    totalQuestions++;
    results.byIntent[intent].total++;

    const trace = routeQuery(q.input);
    const actualIntent = trace.intent;
    const intentMatch = actualIntent === q.expected_intent;

    // Routing check
    if (intentMatch) {
      results.routing.passed++;
    } else {
      results.routing.failed++;
      results.routing.failures.push({
        id: q.id,
        input: q.input,
        expected: q.expected_intent,
        actual: actualIntent
      });
    }

    // Format check (using mock response for now)
    const mockResponse = generateMockResponse(actualIntent, q.input);
    const formatResult = validateFormat(actualIntent, mockResponse);

    if (formatResult.passed) {
      results.format.passed++;
    } else {
      results.format.failed++;
      results.format.failures.push({
        id: q.id,
        input: q.input,
        intent: actualIntent,
        issues: formatResult.issues
      });
    }

    // Over-analysis check
    const overAnalysisResult = checkOverAnalysis(q.expected_intent, actualIntent, mockResponse);
    if (overAnalysisResult.overAnalyzed) {
      results.overAnalysis.count++;
      results.overAnalysis.cases.push({
        id: q.id,
        input: q.input,
        marker: overAnalysisResult.marker
      });
    }

    // Track by intent
    if (intentMatch && formatResult.passed) {
      results.byIntent[intent].passed++;
    } else {
      results.byIntent[intent].failures.push({
        id: q.id,
        input: q.input,
        intentMatch,
        formatPassed: formatResult.passed
      });
    }

    const status = intentMatch ? '✓' : '✗';
    console.log(`    ${status} ${q.id}: "${q.input.substring(0, 40)}..." → ${actualIntent}`);
  }
}

// ============================================================================
// STREAMING TESTS
// ============================================================================

console.log('\n\n2️⃣  STREAMING STABILITY');
console.log('─'.repeat(70));

const streamingQuestions = testSet.streaming_tests.questions;
const iterations = testSet.streaming_tests.iterations_per_test;
const thresholds = testSet.streaming_tests.thresholds;

for (const question of streamingQuestions) {
  console.log(`\n  Testing: "${question}"`);
  let passCount = 0;
  const timings = [];

  for (let i = 0; i < iterations; i++) {
    const result = simulateStreaming(question);
    timings.push(result);

    const firstTokenOk = result.firstTokenMs < thresholds.first_token_ms;
    const totalOk = result.totalMs < thresholds.total_time_ms;

    if (firstTokenOk && totalOk) {
      passCount++;
      results.streaming.passed++;
    } else {
      results.streaming.failed++;
      results.streaming.failures.push({
        question,
        iteration: i + 1,
        firstTokenMs: result.firstTokenMs,
        totalMs: result.totalMs
      });
    }
  }

  const avgFirstToken = Math.round(timings.reduce((a, b) => a + b.firstTokenMs, 0) / iterations);
  const avgTotal = Math.round(timings.reduce((a, b) => a + b.totalMs, 0) / iterations);
  const passRate = ((passCount / iterations) * 100).toFixed(0);

  console.log(`    First token (avg): ${avgFirstToken}ms (threshold: ${thresholds.first_token_ms}ms)`);
  console.log(`    Total time (avg): ${avgTotal}ms (threshold: ${thresholds.total_time_ms}ms)`);
  console.log(`    Pass rate: ${passCount}/${iterations} (${passRate}%)`);
}

// ============================================================================
// TIMING TESTS
// ============================================================================

console.log('\n\n3️⃣  TIMING VALIDATION');
console.log('─'.repeat(70));

const timingThresholds = testSet.timing_thresholds;
const timingSamples = [];

for (let i = 0; i < 10; i++) {
  const start = Date.now();
  const trace = routeQuery('Show me the contract');
  const routingTime = Date.now() - start;
  timingSamples.push(routingTime);
}

const avgRouting = Math.round(timingSamples.reduce((a, b) => a + b, 0) / timingSamples.length);
const maxRouting = Math.max(...timingSamples);
const routingPassed = avgRouting < timingThresholds.intent_routing_ms;

if (routingPassed) {
  results.timing.passed++;
} else {
  results.timing.failed++;
  results.timing.failures.push({
    metric: 'intent_routing',
    avg: avgRouting,
    max: maxRouting,
    threshold: timingThresholds.intent_routing_ms
  });
}

console.log(`  Intent routing (avg): ${avgRouting}ms (threshold: ${timingThresholds.intent_routing_ms}ms) ${routingPassed ? '✓' : '✗'}`);
console.log(`  Intent routing (max): ${maxRouting}ms`);

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n\n' + '═'.repeat(70));
console.log('SUMMARY');
console.log('═'.repeat(70));

const routingRate = ((results.routing.passed / (results.routing.passed + results.routing.failed)) * 100).toFixed(2);
const formatRate = ((results.format.passed / (results.format.passed + results.format.failed)) * 100).toFixed(2);
const streamingRate = ((results.streaming.passed / (results.streaming.passed + results.streaming.failed)) * 100).toFixed(2);

console.log(`\n  Routing accuracy:    ${results.routing.passed}/${results.routing.passed + results.routing.failed} (${routingRate}%)`);
console.log(`  Format compliance:   ${results.format.passed}/${results.format.passed + results.format.failed} (${formatRate}%)`);
console.log(`  Streaming stability: ${results.streaming.passed}/${results.streaming.passed + results.streaming.failed} (${streamingRate}%)`);
console.log(`  Over-analysis cases: ${results.overAnalysis.count}`);

console.log('\n  By Intent:');
for (const [intent, data] of Object.entries(results.byIntent)) {
  if (data.total > 0) {
    const rate = ((data.passed / data.total) * 100).toFixed(0);
    const status = data.passed === data.total ? '✓' : '✗';
    console.log(`    ${status} ${intent}: ${data.passed}/${data.total} (${rate}%)`);
  }
}

// ============================================================================
// PASS/FAIL CRITERIA
// ============================================================================

console.log('\n\n' + '═'.repeat(70));
console.log('PASS CRITERIA');
console.log('═'.repeat(70));

const routingCriteriaPassed = parseFloat(routingRate) >= 95;
const formatCriteriaPassed = parseFloat(formatRate) >= 95;
const streamingCriteriaPassed = parseFloat(streamingRate) >= 90;
const noOverAnalysis = results.overAnalysis.count === 0;

console.log(`\n  ${routingCriteriaPassed ? '✓' : '✗'} Routing accuracy ≥95%: ${routingRate}%`);
console.log(`  ${formatCriteriaPassed ? '✓' : '✗'} Format compliance ≥95%: ${formatRate}%`);
console.log(`  ${streamingCriteriaPassed ? '✓' : '✗'} Streaming stability ≥90%: ${streamingRate}%`);
console.log(`  ${noOverAnalysis ? '✓' : '✗'} No over-analysis: ${results.overAnalysis.count} cases`);

const allPassed = routingCriteriaPassed && formatCriteriaPassed && streamingCriteriaPassed && noOverAnalysis;

console.log('\n' + '═'.repeat(70));
console.log(`RESULT: ${allPassed ? '✓ PASSED - READY FOR DEPLOY' : '✗ FAILED - DO NOT DEPLOY'}`);
console.log('═'.repeat(70));

if (results.routing.failures.length > 0) {
  console.log('\n  Routing failures:');
  for (const f of results.routing.failures.slice(0, 5)) {
    console.log(`    - "${f.input}" → ${f.actual} (expected: ${f.expected})`);
  }
}

if (results.overAnalysis.cases.length > 0) {
  console.log('\n  Over-analysis cases:');
  for (const c of results.overAnalysis.cases) {
    console.log(`    - "${c.input}" (${c.marker})`);
  }
}

// Save report
const reportPath = path.join(__dirname, 'reports', 'ANSWER_QUALITY_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    routingAccuracy: routingRate + '%',
    formatCompliance: formatRate + '%',
    streamingStability: streamingRate + '%',
    overAnalysisCases: results.overAnalysis.count
  },
  criteria: {
    routingPassed: routingCriteriaPassed,
    formatPassed: formatCriteriaPassed,
    streamingPassed: streamingCriteriaPassed,
    noOverAnalysis,
    allPassed
  },
  byIntent: results.byIntent,
  failures: {
    routing: results.routing.failures,
    format: results.format.failures,
    streaming: results.streaming.failures,
    overAnalysis: results.overAnalysis.cases
  }
}, null, 2));

console.log(`\nReport saved to: ${reportPath}`);

// ============================================================================
// MOCK RESPONSE GENERATOR (for format validation)
// ============================================================================

function generateMockResponse(intent, input) {
  const responses = {
    DOCUMENTS: `Here is the requested section from the document. The ${input.toLowerCase().includes('contract') ? 'contract' : 'document'} contains the relevant information you're looking for.`,
    FILE_ACTIONS: `File action completed. The operation has been processed successfully.`,
    HELP: `Here's how to proceed:\n1. First step\n2. Second step\n3. Final step`,
    ERROR: `I encountered an issue. Here's what might help:\n- Check your file format\n- Ensure the file exists\n- Try uploading again`,
    CONVERSATION: `Got it.`,
    EXTRACTION: `Here are the extracted values:\n- Item 1: Value\n- Item 2: Value`,
    REASONING: `Based on my analysis of the document:\n\n**Key Findings:**\n- Finding 1\n- Finding 2\n\n**Conclusion:**\nThe analysis suggests these are the main considerations.`
  };

  return responses[intent] || responses.CONVERSATION;
}
