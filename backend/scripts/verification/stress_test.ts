/**
 * STRESS TEST — Diverse questions to validate routing robustness
 */

import { classifyIntent, computeDepth, requiresRAG, getMathOrchestrator, initializeServices } from './helpers';

interface TestQuery {
  query: string;
  expectedIntent: string;
  expectedDepth?: string;
  expectsRAG?: boolean;
  expectsMath?: boolean;
  category: string;
}

// Diverse test queries - different phrasings and edge cases
const STRESS_QUERIES: TestQuery[] = [
  // === CONVERSATION ===
  { query: 'good morning', expectedIntent: 'conversation', category: 'Conversation' },
  { query: 'how are you today?', expectedIntent: 'conversation', category: 'Conversation' },
  { query: 'nice to meet you', expectedIntent: 'conversation', category: 'Conversation' },
  { query: 'see you later', expectedIntent: 'conversation', category: 'Conversation' },

  // === HELP ===
  { query: 'what features do you have?', expectedIntent: 'help', category: 'Help' },
  { query: 'can you help me understand koda?', expectedIntent: 'help', category: 'Help' },
  { query: 'how do I get started?', expectedIntent: 'help', category: 'Help' },
  { query: 'show me how to use this tool', expectedIntent: 'help', category: 'Help' },

  // === DOCUMENTS ===
  { query: 'read page 5 of the report', expectedIntent: 'documents', category: 'Documents' },
  { query: 'what are the key points in this PDF?', expectedIntent: 'documents', category: 'Documents' },
  { query: 'find where it mentions the deadline', expectedIntent: 'documents', category: 'Documents' },
  { query: 'give me a summary of chapter 2', expectedIntent: 'documents', category: 'Documents' },

  // === EXTRACTION ===
  { query: 'pull all the email addresses from this', expectedIntent: 'extraction', category: 'Extraction' },
  { query: 'list every date mentioned', expectedIntent: 'extraction', category: 'Extraction' },
  { query: 'get the phone numbers from the document', expectedIntent: 'extraction', category: 'Extraction' },
  { query: 'extract company names from this text', expectedIntent: 'extraction', category: 'Extraction' },

  // === FINANCE ===
  { query: 'what was the quarterly revenue?', expectedIntent: 'finance', category: 'Finance' },
  { query: 'explain the cash flow statement', expectedIntent: 'finance', category: 'Finance' },
  { query: 'analyze the profit margin in this report', expectedIntent: 'finance', category: 'Finance' },
  { query: 'revenue for Q1 2024', expectedIntent: 'finance', category: 'Finance' },

  // === ACCOUNTING ===
  { query: 'explain the journal entry', expectedIntent: 'accounting', category: 'Accounting' },
  { query: 'accounts receivable balance', expectedIntent: 'accounting', category: 'Accounting' },
  { query: 'show the ledger entries', expectedIntent: 'accounting', category: 'Accounting' },
  { query: 'reconcile the bank statement', expectedIntent: 'accounting', category: 'Accounting' },

  // === LEGAL ===
  { query: 'what are the termination clauses?', expectedIntent: 'legal', category: 'Legal' },
  { query: 'find the liability section', expectedIntent: 'legal', category: 'Legal' },
  { query: 'explain the indemnification terms', expectedIntent: 'legal', category: 'Legal' },
  { query: 'summarize the NDA provisions', expectedIntent: 'legal', category: 'Legal' },

  // === MEDICAL ===
  { query: 'what are the patient symptoms?', expectedIntent: 'medical', category: 'Medical' },
  { query: 'explain the diagnosis', expectedIntent: 'medical', category: 'Medical' },
  { query: 'medication dosage information', expectedIntent: 'medical', category: 'Medical' },
  { query: 'lab test results for this patient', expectedIntent: 'medical', category: 'Medical' },

  // === ENGINEERING ===
  { query: 'what are the specifications?', expectedIntent: 'engineering', category: 'Engineering' },
  { query: 'tolerance value for this part', expectedIntent: 'engineering', category: 'Engineering' },
  { query: 'check the ISO standards', expectedIntent: 'engineering', category: 'Engineering' },
  { query: 'CAD drawing dimensions', expectedIntent: 'engineering', category: 'Engineering' },

  // === EXCEL ===
  { query: 'total row 10', expectedIntent: 'excel', category: 'Excel' },
  { query: 'average of column C', expectedIntent: 'excel', category: 'Excel' },
  { query: 'sort by date column', expectedIntent: 'excel', category: 'Excel' },
  { query: 'filter rows where amount > 1000', expectedIntent: 'excel', category: 'Excel' },

  // === REASONING ===
  { query: 'explain why this is important', expectedIntent: 'reasoning', category: 'Reasoning' },
  { query: 'explain the logic behind this', expectedIntent: 'reasoning', category: 'Reasoning' },
  { query: 'calculate 50 + 25', expectedIntent: 'reasoning', category: 'Reasoning' },
  { query: 'what is 100 divided by 4?', expectedIntent: 'reasoning', category: 'Reasoning' },

  // === MEMORY ===
  { query: 'remember that my name is John', expectedIntent: 'memory', category: 'Memory' },
  { query: 'do you recall what I told you?', expectedIntent: 'memory', category: 'Memory' },
  { query: 'forget my personal data', expectedIntent: 'memory', category: 'Memory' },
  { query: 'what did I ask you to remember?', expectedIntent: 'memory', category: 'Memory' },

  // === PREFERENCES ===
  { query: 'use bullet points from now on', expectedIntent: 'preferences', category: 'Preferences' },
  { query: 'always give me detailed answers', expectedIntent: 'preferences', category: 'Preferences' },
  { query: 'change my output format', expectedIntent: 'preferences', category: 'Preferences' },
  { query: 'update my settings', expectedIntent: 'preferences', category: 'Preferences' },

  // === ERROR ===
  { query: 'there is a bug', expectedIntent: 'error', category: 'Error' },
  { query: 'the system crashed', expectedIntent: 'error', category: 'Error' },
  { query: 'nothing is loading', expectedIntent: 'error', category: 'Error' },
  { query: 'I got an error message', expectedIntent: 'error', category: 'Error' },

  // === MATH (should trigger Python engine) ===
  { query: 'calculate the average of 10, 20, 30', expectedIntent: 'reasoning', expectsMath: true, category: 'Math' },
  { query: 'what is the ROI?', expectedIntent: 'finance', expectsMath: true, category: 'Math' },
  { query: 'compute the standard deviation', expectedIntent: 'reasoning', expectsMath: true, category: 'Math' },
  { query: 'sum column A', expectedIntent: 'excel', expectsMath: true, category: 'Math' },

  // === SCENARIO (D5 depth - forecast/simulate keywords) ===
  { query: 'simulate the impact of cost increase', expectedIntent: 'finance', expectedDepth: 'D5', category: 'Scenario' },
  { query: 'forecast revenue for next year', expectedIntent: 'finance', expectedDepth: 'D5', category: 'Scenario' },
  { query: 'what happens if revenue drops 20%', expectedIntent: 'finance', expectedDepth: 'D5', category: 'Scenario' },
  { query: 'project the profit margin growth', expectedIntent: 'finance', expectedDepth: 'D5', category: 'Scenario' },
];

interface TestResult {
  query: string;
  category: string;
  expectedIntent: string;
  actualIntent: string;
  confidence: number;
  intentMatch: boolean;
  depthMatch: boolean | null;
  ragMatch: boolean | null;
  mathMatch: boolean | null;
}

async function runStressTest(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('STRESS TEST — DIVERSE QUESTION VALIDATION');
  console.log('='.repeat(70) + '\n');

  await initializeServices();
  const mathOrchestrator = getMathOrchestrator();

  const results: TestResult[] = [];
  const categoryResults: Record<string, { passed: number; total: number }> = {};

  for (const testQuery of STRESS_QUERIES) {
    try {
      const prediction = await classifyIntent(testQuery.query);
      const depthResult = computeDepth(prediction.primaryIntent, prediction.confidence, testQuery.query);
      const mathCheck = mathOrchestrator.requiresMathCalculation(testQuery.query);

      const intentMatch = prediction.primaryIntent === testQuery.expectedIntent;
      const depthMatch = testQuery.expectedDepth ? depthResult.depth === testQuery.expectedDepth : null;
      const mathMatch = testQuery.expectsMath !== undefined
        ? (mathCheck.requiresMath && mathCheck.confidence >= 0.25) === testQuery.expectsMath
        : null;

      const result: TestResult = {
        query: testQuery.query,
        category: testQuery.category,
        expectedIntent: testQuery.expectedIntent,
        actualIntent: prediction.primaryIntent,
        confidence: prediction.confidence,
        intentMatch,
        depthMatch,
        ragMatch: null,
        mathMatch,
      };

      results.push(result);

      // Track by category
      if (!categoryResults[testQuery.category]) {
        categoryResults[testQuery.category] = { passed: 0, total: 0 };
      }
      categoryResults[testQuery.category].total++;
      if (intentMatch && (depthMatch === null || depthMatch) && (mathMatch === null || mathMatch)) {
        categoryResults[testQuery.category].passed++;
      }

      const icon = intentMatch ? '✓' : '✗';
      const confStr = `${(prediction.confidence * 100).toFixed(0)}%`;

      if (!intentMatch) {
        console.log(`${icon} [${testQuery.category}] "${testQuery.query}"`);
        console.log(`    Expected: ${testQuery.expectedIntent}, Got: ${prediction.primaryIntent} (${confStr})`);
      }

    } catch (error: any) {
      console.log(`✗ [${testQuery.category}] "${testQuery.query}" — ERROR: ${error.message}`);
      results.push({
        query: testQuery.query,
        category: testQuery.category,
        expectedIntent: testQuery.expectedIntent,
        actualIntent: 'ERROR',
        confidence: 0,
        intentMatch: false,
        depthMatch: null,
        ragMatch: null,
        mathMatch: null,
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS BY CATEGORY');
  console.log('='.repeat(70) + '\n');

  let totalPassed = 0;
  let totalTests = 0;

  Object.entries(categoryResults).forEach(([category, stats]) => {
    const pct = ((stats.passed / stats.total) * 100).toFixed(0);
    const icon = stats.passed === stats.total ? '✓' : '✗';
    console.log(`${icon} ${category.padEnd(15)} ${stats.passed}/${stats.total} (${pct}%)`);
    totalPassed += stats.passed;
    totalTests += stats.total;
  });

  console.log('\n' + '-'.repeat(70));
  const overallPct = ((totalPassed / totalTests) * 100).toFixed(1);
  console.log(`\nOVERALL: ${totalPassed}/${totalTests} passed (${overallPct}%)`);

  // List failures
  const failures = results.filter(r => !r.intentMatch);
  if (failures.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('FAILURES');
    console.log('='.repeat(70) + '\n');

    failures.forEach(f => {
      console.log(`• "${f.query}"`);
      console.log(`  Expected: ${f.expectedIntent}, Got: ${f.actualIntent}`);
    });
  }

  if (totalPassed === totalTests) {
    console.log('\n✅ ALL STRESS TESTS PASSED!');
  } else {
    console.log(`\n❌ ${failures.length} TESTS FAILED`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

// Run
runStressTest().catch(err => {
  console.error('Stress test error:', err);
  process.exit(1);
});
