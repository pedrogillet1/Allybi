/**
 * PHASE 5 — RAG GATING VERIFICATION
 * Verify RAG is invoked only when appropriate for the intent
 */

import { classifyIntent, requiresRAG } from './helpers';

interface TestCase {
  query: string;
  expectedIntent: string;
  expectsRAG: boolean;
  description?: string;
}

interface TestResult {
  query: string;
  intent: string;
  confidence: number;
  expectsRAG: boolean;
  actualRAG: boolean;
  passed: boolean;
}

// Test cases - aligned with current routing and RAG logic
const TEST_CASES: TestCase[] = [
  // RAG Expected = YES (document and domain-specific intents)
  { query: 'summarize this document', expectedIntent: 'documents', expectsRAG: true, description: 'Document summary' },
  { query: 'what does the contract say about liability?', expectedIntent: 'legal', expectsRAG: true, description: 'Legal query' },
  { query: 'explain the profit margin in this report', expectedIntent: 'finance', expectsRAG: true, description: 'Finance query' },
  { query: 'explain the journal entry', expectedIntent: 'accounting', expectsRAG: true, description: 'Accounting query' },
  { query: 'what are the specifications?', expectedIntent: 'engineering', expectsRAG: true, description: 'Engineering query' },
  { query: 'patient diagnosis from the report', expectedIntent: 'medical', expectsRAG: true, description: 'Medical query' },
  { query: 'extract table from page 2', expectedIntent: 'documents', expectsRAG: true, description: 'Page reference → documents → RAG' },

  // RAG Expected = NO (non-document intents)
  { query: 'pull the table from this PDF', expectedIntent: 'extraction', expectsRAG: false, description: 'Extraction' },
  { query: 'hello', expectedIntent: 'conversation', expectsRAG: false, description: 'Conversation' },
  { query: 'remember this', expectedIntent: 'memory', expectsRAG: false, description: 'Memory' },
  { query: 'set my preference to brief answers', expectedIntent: 'preferences', expectsRAG: false, description: 'Preferences' },
  { query: 'something is broken', expectedIntent: 'error', expectsRAG: false, description: 'Error' },
  { query: 'how do I upload?', expectedIntent: 'help', expectsRAG: false, description: 'Help' },
  { query: 'sum column A', expectedIntent: 'excel', expectsRAG: false, description: 'Spreadsheet op' },
];

async function runRAGInvocationTests(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 5 — RAG GATING VERIFICATION');
  console.log('='.repeat(60) + '\n');

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    try {
      // Classify intent
      const prediction = await classifyIntent(testCase.query);

      // Determine if RAG would be invoked
      const actualRAG = requiresRAG(prediction.primaryIntent);

      const result: TestResult = {
        query: testCase.query,
        intent: prediction.primaryIntent,
        confidence: prediction.confidence,
        expectsRAG: testCase.expectsRAG,
        actualRAG,
        passed: actualRAG === testCase.expectsRAG,
      };

      results.push(result);

      const icon = result.passed ? '✓' : '✗';
      console.log(`${icon} "${testCase.query}"`);
      console.log(`    Intent: ${result.intent}`);
      console.log(`    Expected RAG: ${testCase.expectsRAG}`);
      console.log(`    Actual RAG: ${actualRAG}`);
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
        expectsRAG: testCase.expectsRAG,
        actualRAG: false,
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
    console.log('\n❌ RAG GATING FAILED');
    console.log('\nFailed cases:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - "${r.query}": expected RAG=${r.expectsRAG}, got RAG=${r.actualRAG}`);
    });

    // Critical: RAG fired for extraction/memory
    const unnecessaryRAG = results.filter(r =>
      !r.expectsRAG && r.actualRAG
    );

    if (unnecessaryRAG.length > 0) {
      console.log('\n⚠️  CRITICAL: RAG firing for non-document intents!');
    }

    process.exit(1);
  }

  console.log('\n✅ All RAG gating tests passed');

  // RAG invocation summary
  const ragYes = results.filter(r => r.actualRAG).length;
  const ragNo = results.filter(r => !r.actualRAG).length;

  console.log('\nRAG invocation summary:');
  console.log(`  RAG required: ${ragYes}`);
  console.log(`  RAG not required: ${ragNo}`);

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run
runRAGInvocationTests().catch(err => {
  console.error('RAG invocation test error:', err);
  process.exit(1);
});
