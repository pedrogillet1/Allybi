/**
 * PHASE 1 — INTENT ROUTING VALIDATION (NO ML)
 * Verify intent classification is correct for known queries
 */

import { classifyIntent } from './helpers';

interface TestCase {
  query: string;
  expectedIntent: string;
  description?: string;
}

interface TestResult {
  query: string;
  expectedIntent: string;
  actualIntent: string;
  confidence: number;
  source: string;
  passed: boolean;
  secondaryIntents?: string[];
}

// Test cases - aligned with current routing patterns
const TEST_CASES: TestCase[] = [
  // Conversation
  { query: 'hello', expectedIntent: 'conversation', description: 'Simple greeting' },
  { query: 'thanks', expectedIntent: 'conversation', description: 'Thank you' },
  { query: 'hi there', expectedIntent: 'conversation', description: 'Greeting variant' },
  { query: 'goodbye', expectedIntent: 'conversation', description: 'Farewell' },

  // Help
  { query: 'how do I upload files?', expectedIntent: 'help', description: 'Product help' },
  { query: 'what can you do?', expectedIntent: 'help', description: 'Capabilities' },
  { query: 'how does koda work?', expectedIntent: 'help', description: 'How-to (product specific)' },

  // Documents
  { query: 'summarize this document', expectedIntent: 'documents', description: 'Document summary' },
  { query: 'what is in this file?', expectedIntent: 'documents', description: 'Document content' },
  { query: 'find section about revenue', expectedIntent: 'documents', description: 'Document navigation' },
  { query: 'extract the values from page 2', expectedIntent: 'documents', description: 'Page reference → documents' },
  { query: 'compare Q1 vs Q2', expectedIntent: 'documents', description: 'Document comparison' },

  // Extraction
  { query: 'pull the table from this PDF', expectedIntent: 'extraction', description: 'Table extraction' },
  { query: 'get the numbers from the spreadsheet', expectedIntent: 'extraction', description: 'Number extraction' },
  { query: 'extract all dates from this', expectedIntent: 'extraction', description: 'Data extraction' },

  // Memory
  { query: 'remember this preference', expectedIntent: 'memory', description: 'Memory storage' },
  { query: 'forget what I told you', expectedIntent: 'memory', description: 'Memory deletion' },
  { query: 'what did I ask you to remember?', expectedIntent: 'memory', description: 'Memory recall' },

  // Preferences
  { query: 'always answer briefly', expectedIntent: 'preferences', description: 'Preference setting' },
  { query: 'change my settings', expectedIntent: 'preferences', description: 'Settings change' },

  // Error
  { query: 'something broke', expectedIntent: 'error', description: 'Error report' },
  { query: 'this is not working', expectedIntent: 'error', description: 'Issue report' },

  // Finance (domain-specific)
  { query: 'why did revenue decrease?', expectedIntent: 'finance', description: 'Finance analysis' },
  { query: 'explain the profit margin', expectedIntent: 'finance', description: 'Finance explanation' },

  // Reasoning
  { query: 'explain why this is important', expectedIntent: 'reasoning', description: 'Why explanation' },
  { query: 'explain the logic behind this', expectedIntent: 'reasoning', description: 'Explanation request' },

  // Excel (spreadsheet operations)
  { query: 'sum column A', expectedIntent: 'excel', description: 'Spreadsheet sum' },
  { query: 'add up the values in row 5', expectedIntent: 'excel', description: 'Spreadsheet row calculation' },
];

async function runIntentRoutingTests(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 1 — INTENT ROUTING VALIDATION');
  console.log('='.repeat(60) + '\n');

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    try {
      const prediction = await classifyIntent(testCase.query);

      const result: TestResult = {
        query: testCase.query,
        expectedIntent: testCase.expectedIntent,
        actualIntent: prediction.primaryIntent,
        confidence: prediction.confidence,
        source: 'runtime',
        passed: prediction.primaryIntent === testCase.expectedIntent,
        secondaryIntents: prediction.secondaryIntents?.map(s => s.name) || [],
      };

      results.push(result);

      const icon = result.passed ? '✓' : '✗';
      const confStr = (result.confidence * 100).toFixed(0) + '%';
      console.log(`${icon} "${testCase.query}"`);
      console.log(`    Expected: ${testCase.expectedIntent}`);
      console.log(`    Actual:   ${result.actualIntent} (${confStr})`);
      if (!result.passed) {
        console.log(`    MISMATCH!`);
      }
      console.log('');

    } catch (error: any) {
      console.log(`✗ "${testCase.query}" — ERROR: ${error.message}`);
      results.push({
        query: testCase.query,
        expectedIntent: testCase.expectedIntent,
        actualIntent: 'ERROR',
        confidence: 0,
        source: 'error',
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
    console.log('\n❌ INTENT ROUTING FAILED');
    console.log('\nFailed cases:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - "${r.query}": expected ${r.expectedIntent}, got ${r.actualIntent}`);
    });

    // Check for critical failures
    const criticalFailures = results.filter(r =>
      !r.passed &&
      r.expectedIntent === 'conversation' &&
      ['documents', 'extraction'].includes(r.actualIntent)
    );

    if (criticalFailures.length > 0) {
      console.log('\n⚠️  CRITICAL: Conversation queries routing to documents/extraction!');
    }

    process.exit(1);
  }

  console.log('\n✅ All intent routing tests passed');

  // Confidence analysis
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  const constantConfidence = results.every(r => Math.abs(r.confidence - results[0].confidence) < 0.01);

  console.log(`\nConfidence analysis:`);
  console.log(`  Average: ${(avgConfidence * 100).toFixed(1)}%`);
  console.log(`  Min: ${(Math.min(...results.map(r => r.confidence)) * 100).toFixed(1)}%`);
  console.log(`  Max: ${(Math.max(...results.map(r => r.confidence)) * 100).toFixed(1)}%`);

  if (constantConfidence) {
    console.log('\n⚠️  WARNING: Confidence scores are constant — may indicate pattern matching issue');
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Output JSON for programmatic use
  console.log('JSON Results:');
  console.log(JSON.stringify(results.slice(0, 5), null, 2));
}

// Run
runIntentRoutingTests().catch(err => {
  console.error('Intent routing test error:', err);
  process.exit(1);
});
