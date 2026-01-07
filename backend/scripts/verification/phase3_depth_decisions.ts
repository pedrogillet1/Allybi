/**
 * PHASE 3 — DEPTH DECISION VERIFICATION (D1–D5)
 * Verify depth level varies correctly based on query complexity
 */

import { classifyIntent, getDomainService, computeDepth } from './helpers';

interface TestCase {
  query: string;
  expectedDepth: string;
  description?: string;
}

interface TestResult {
  query: string;
  intent: string;
  confidence: number;
  domain: string | null;
  expectedDepth: string;
  actualDepth: string;
  reason: string;
  passed: boolean;
}

// Test cases - aligned with computeDepth logic
const TEST_CASES: TestCase[] = [
  // D1 - Conversation, help, memory, preferences
  { query: 'hello', expectedDepth: 'D1', description: 'Greeting → conversation → D1' },
  { query: 'how do I upload?', expectedDepth: 'D1', description: 'Help question → D1' },
  { query: 'remember this', expectedDepth: 'D1', description: 'Memory → D1' },

  // D2 - Documents, extraction
  { query: 'summarize this document', expectedDepth: 'D2', description: 'Document summary → D2' },
  { query: 'what does section 3 say?', expectedDepth: 'D2', description: 'Document lookup → D2' },
  { query: 'extract all dates from this', expectedDepth: 'D2', description: 'Extraction → D2' },

  // D3 - Domain-specific OR comparison keywords
  { query: 'explain the revenue recognition policy', expectedDepth: 'D3', description: 'Finance domain → D3' },
  { query: 'compare this year vs last year', expectedDepth: 'D3', description: 'Comparison keyword → D3' },
  { query: 'what is the profit margin?', expectedDepth: 'D3', description: 'Finance domain → D3' },

  // D4 - Validation keywords
  { query: 'validate this balance sheet', expectedDepth: 'D4', description: 'Validate keyword → D4' },
  { query: 'verify the calculations', expectedDepth: 'D4', description: 'Verify keyword → D4' },
  { query: 'audit the financial statements', expectedDepth: 'D4', description: 'Audit keyword → D4' },

  // D5 - Scenario keywords
  { query: 'what happens if revenue drops 20%', expectedDepth: 'D5', description: 'What happens if → D5' },
  { query: 'simulate the impact of cost increase', expectedDepth: 'D5', description: 'Simulate → D5' },
  { query: 'forecast next quarter if trends continue', expectedDepth: 'D5', description: 'Forecast → D5' },
];

async function runDepthDecisionTests(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 3 — DEPTH DECISION VERIFICATION');
  console.log('='.repeat(60) + '\n');

  const domainService = getDomainService();
  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    try {
      // Classify intent
      const prediction = await classifyIntent(testCase.query);

      // Get domain
      const domainContext = domainService.getDomainContext(prediction.primaryIntent);
      const domain = domainContext.isDomainSpecific ? domainContext.domain || null : null;

      // Compute depth
      const { depth, reason } = computeDepth(
        prediction.primaryIntent,
        prediction.confidence,
        testCase.query
      );

      const result: TestResult = {
        query: testCase.query,
        intent: prediction.primaryIntent,
        confidence: prediction.confidence,
        domain,
        expectedDepth: testCase.expectedDepth,
        actualDepth: depth,
        reason,
        passed: depth === testCase.expectedDepth,
      };

      results.push(result);

      const icon = result.passed ? '✓' : '✗';
      console.log(`${icon} "${testCase.query}"`);
      console.log(`    Intent: ${result.intent} (${(result.confidence * 100).toFixed(0)}%)`);
      console.log(`    Domain: ${result.domain || 'none'}`);
      console.log(`    Expected depth: ${testCase.expectedDepth}`);
      console.log(`    Actual depth: ${depth}`);
      console.log(`    Reason: ${reason}`);
      if (!result.passed) {
        console.log(`    MISMATCH!`);
      }
      console.log('');

    } catch (error: any) {
      console.log(`✗ "${testCase.query}" — ERROR: ${error.message}`);
      results.push({
        query: testCase.query,
        intent: 'ERROR',
        confidence: 0,
        domain: null,
        expectedDepth: testCase.expectedDepth,
        actualDepth: 'ERROR',
        reason: error.message,
        passed: false,
      });
    }
  }

  // Summary
  console.log('-'.repeat(60));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed}/${results.length} passed (${failed} failed)`);

  if (failed > 0) {
    console.log('\n❌ DEPTH DECISION FAILED');
    console.log('\nFailed cases:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - "${r.query}": expected ${r.expectedDepth}, got ${r.actualDepth}`);
      console.log(`    Reason: ${r.reason}`);
    });
    process.exit(1);
  }

  console.log('\n✅ All depth decision tests passed');

  // Check if depth is constant (bad sign)
  const depths = results.map(r => r.actualDepth);
  const uniqueDepths = Array.from(new Set(depths));

  console.log('\nDepth distribution:');
  uniqueDepths.forEach(depth => {
    const count = depths.filter(d => d === depth).length;
    console.log(`  ${depth}: ${count}`);
  });

  if (uniqueDepths.length === 1) {
    console.log('\n⚠️  WARNING: Depth is constant — may indicate depth logic is not varying correctly');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run
runDepthDecisionTests().catch(err => {
  console.error('Depth decision test error:', err);
  process.exit(1);
});
