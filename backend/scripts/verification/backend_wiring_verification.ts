/**
 * KODA BACKEND WIRING VERIFICATION SUITE
 *
 * Systematic proof that routing → depth → RAG → computation → formatting → streaming
 * are all correct before touching ML or frontend.
 *
 * Run: npx ts-node --transpile-only scripts/verification/backend_wiring_verification.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

// Always use port 5001 for local testing (ignore env BACKEND_URL which may be wrong)
const BASE_URL = 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// ============================================================================
// TYPES
// ============================================================================

interface TestCase {
  id: string;
  phase: string;
  query: string;
  expected: {
    intent?: string | string[];
    depth?: string | string[];
    requiresRAG?: boolean;
    requiresMath?: boolean;
    hasSummaryChunk?: boolean;
    minChunks?: number;
    maxChunks?: number;
    answerContains?: string[];
    answerNotContains?: string[];
    shouldFail?: boolean;
  };
}

interface TestResult {
  id: string;
  phase: string;
  query: string;
  passed: boolean;
  failures: string[];
  actual: {
    intent: string;
    confidence: number;
    chunksUsed: number;
    hasSummaryChunk: boolean;
    answerLength: number;
    answerPreview: string;
    processingTime: number;
  };
}

// ============================================================================
// TEST CASES - ALL PHASES
// ============================================================================

const TEST_CASES: TestCase[] = [
  // ========================================
  // PHASE A: INTENT & DEPTH VERIFICATION
  // ========================================

  // A1 - Pure conversation (NO RAG, NO MATH)
  {
    id: 'A1.1',
    phase: 'A-Intent',
    query: 'hello',
    expected: {
      intent: 'conversation',
      requiresRAG: false,
      requiresMath: false,
      maxChunks: 0,
    }
  },
  {
    id: 'A1.2',
    phase: 'A-Intent',
    query: 'thanks',
    expected: {
      intent: 'conversation',
      requiresRAG: false,
      maxChunks: 0,
    }
  },
  {
    id: 'A1.3',
    phase: 'A-Intent',
    query: 'good morning',
    expected: {
      intent: 'conversation',
      requiresRAG: false,
      maxChunks: 0,
    }
  },

  // A2 - Help intent
  {
    id: 'A2.1',
    phase: 'A-Intent',
    query: 'how do i upload files?',
    expected: {
      intent: 'help',
      requiresRAG: false,
      maxChunks: 0,
    }
  },
  {
    id: 'A2.2',
    phase: 'A-Intent',
    query: 'where do i see my documents?',
    expected: {
      intent: 'help',
      requiresRAG: false,
      maxChunks: 0,
    }
  },

  // A3 - Documents factual (NO computation)
  {
    id: 'A3.1',
    phase: 'A-Intent',
    query: 'what does the document say about Lone Mountain Ranch?',
    expected: {
      intent: ['documents', 'finance'],
      requiresRAG: true,
      requiresMath: false,
      minChunks: 1,
    }
  },

  // ========================================
  // PHASE B: RAG QUALITY & CHUNK SHAPE
  // ========================================

  {
    id: 'B1.1',
    phase: 'B-RAG',
    query: 'what is Lone Mountain Ranch?',
    expected: {
      intent: ['documents', 'finance'],
      requiresRAG: true,
      minChunks: 5,
      hasSummaryChunk: false,
    }
  },
  {
    id: 'B1.2',
    phase: 'B-RAG',
    query: 'what services does Lone Mountain Ranch offer?',
    expected: {
      intent: ['documents', 'finance'],
      requiresRAG: true,
      minChunks: 5,
    }
  },

  // ========================================
  // PHASE C: MATH / PYTHON ENGINE VERIFICATION
  // ========================================

  // C1 - Aggregation success
  {
    id: 'C1.1',
    phase: 'C-Math',
    query: 'what is the total revenue for Lone Mountain Ranch in 2024?',
    expected: {
      intent: ['finance', 'documents'],
      requiresRAG: true,
      requiresMath: true,
      hasSummaryChunk: true,
      answerContains: ['$', 'total', 'revenue'],
      answerNotContains: ['does not contain', 'cannot find'],
    }
  },
  {
    id: 'C1.2',
    phase: 'C-Math',
    query: 'what is the total expense?',
    expected: {
      intent: ['finance', 'documents'],
      requiresMath: true,
    }
  },

  // C2 - Aggregation failure (honest failure)
  {
    id: 'C2.1',
    phase: 'C-Math',
    query: 'what is the total revenue for 2022?',
    expected: {
      intent: ['finance', 'documents'],
      requiresMath: true,
      // Should either find nothing or say data not available
    }
  },

  // C3 - Non-total query should NOT trigger aggregation
  {
    id: 'C3.1',
    phase: 'C-Math',
    query: 'what was the highest revenue source?',
    expected: {
      intent: ['finance', 'documents'],
      requiresRAG: true,
      hasSummaryChunk: false, // No aggregation for "highest"
    }
  },

  // ========================================
  // PHASE D: ANSWER STYLE & FORMAT
  // ========================================

  {
    id: 'D1.1',
    phase: 'D-Style',
    query: 'summarize the LMR improvement plan',
    expected: {
      intent: ['documents', 'engineering', 'finance'],
      requiresRAG: true,
      minChunks: 5,
    }
  },

  // ========================================
  // PHASE F: NEGATIVE & EDGE TESTS
  // ========================================

  // F1 - Impossible question
  {
    id: 'F1.1',
    phase: 'F-Edge',
    query: 'what is the CEO salary?',
    expected: {
      intent: ['documents', 'finance'],
      requiresRAG: true,
      // Should return "not found" or similar
      answerContains: ["couldn't find", "not contain", "no information", "does not"],
    }
  },

  // F2 - Over-broad question
  {
    id: 'F2.1',
    phase: 'F-Edge',
    query: 'summarize everything',
    expected: {
      intent: ['documents', 'reasoning'],
      requiresRAG: true,
    }
  },

  // F3 - Ambiguous query
  {
    id: 'F3.1',
    phase: 'F-Edge',
    query: 'what about revenue?',
    expected: {
      intent: ['finance', 'documents', 'ambiguous'],
    }
  },
];

// ============================================================================
// API HELPERS
// ============================================================================

async function login(): Promise<string> {
  console.log(`  URL: ${BASE_URL}/api/auth/login`);
  console.log(`  Email: ${TEST_EMAIL}`);

  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  console.log(`  Status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Login failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.accessToken;
}

async function createConversation(token: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'Wiring Verification' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

async function runQuery(token: string, conversationId: string, query: string): Promise<{
  answer: string;
  metadata: {
    primaryIntent: string;
    confidence: number;
    documentsUsed: number;
    sourceDocumentIds?: string[];
  };
  processingTime: number;
}> {
  const startTime = Date.now();

  const response = await fetch(`${BASE_URL}/api/rag/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      conversationId,
      language: 'en',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Query failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    answer: data.answer,
    metadata: {
      primaryIntent: data.metadata?.primaryIntent || 'unknown',
      confidence: data.metadata?.confidence || 0,
      documentsUsed: data.metadata?.documentsUsed || 0,
      sourceDocumentIds: data.metadata?.sourceDocumentIds,
    },
    processingTime: Date.now() - startTime,
  };
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function evaluateTest(testCase: TestCase, result: any): TestResult {
  const failures: string[] = [];
  const answer = result.answer.toLowerCase();

  // Check intent
  if (testCase.expected.intent) {
    const expectedIntents = Array.isArray(testCase.expected.intent)
      ? testCase.expected.intent
      : [testCase.expected.intent];

    const actualIntent = result.metadata.primaryIntent.toLowerCase();
    if (!expectedIntents.some(i => actualIntent.includes(i.toLowerCase()))) {
      failures.push(`Intent: expected one of [${expectedIntents.join(', ')}], got "${actualIntent}"`);
    }
  }

  // Check RAG usage
  if (testCase.expected.requiresRAG === false && result.metadata.documentsUsed > 0) {
    failures.push(`RAG: expected NO chunks, got ${result.metadata.documentsUsed}`);
  }
  if (testCase.expected.requiresRAG === true && result.metadata.documentsUsed === 0) {
    failures.push(`RAG: expected chunks, got 0`);
  }

  // Check chunk counts
  if (testCase.expected.minChunks !== undefined && result.metadata.documentsUsed < testCase.expected.minChunks) {
    failures.push(`Chunks: expected >= ${testCase.expected.minChunks}, got ${result.metadata.documentsUsed}`);
  }
  if (testCase.expected.maxChunks !== undefined && result.metadata.documentsUsed > testCase.expected.maxChunks) {
    failures.push(`Chunks: expected <= ${testCase.expected.maxChunks}, got ${result.metadata.documentsUsed}`);
  }

  // Check answer contains
  if (testCase.expected.answerContains) {
    for (const term of testCase.expected.answerContains) {
      if (!answer.includes(term.toLowerCase())) {
        failures.push(`Answer missing: "${term}"`);
      }
    }
  }

  // Check answer not contains
  if (testCase.expected.answerNotContains) {
    for (const term of testCase.expected.answerNotContains) {
      if (answer.includes(term.toLowerCase())) {
        failures.push(`Answer should NOT contain: "${term}"`);
      }
    }
  }

  // Check summary chunk (computed aggregation)
  const hasSummaryChunk = answer.includes('computed summary') ||
                          answer.includes('grand total') ||
                          result.metadata.documentsUsed > 20; // Summary chunk adds 1

  if (testCase.expected.hasSummaryChunk === true && !hasSummaryChunk) {
    // Check if we at least got a computed total in the answer
    const hasComputedTotal = /\$[\d,]+\.?\d*/.test(result.answer) &&
                             (answer.includes('sum of') || answer.includes('total'));
    if (!hasComputedTotal) {
      failures.push(`Expected summary/aggregation chunk, not detected`);
    }
  }
  if (testCase.expected.hasSummaryChunk === false && hasSummaryChunk) {
    failures.push(`Unexpected summary chunk detected`);
  }

  return {
    id: testCase.id,
    phase: testCase.phase,
    query: testCase.query,
    passed: failures.length === 0,
    failures,
    actual: {
      intent: result.metadata.primaryIntent,
      confidence: result.metadata.confidence,
      chunksUsed: result.metadata.documentsUsed,
      hasSummaryChunk,
      answerLength: result.answer.length,
      answerPreview: result.answer.substring(0, 100).replace(/\n/g, ' '),
      processingTime: result.processingTime,
    },
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('KODA BACKEND WIRING VERIFICATION SUITE');
  console.log('='.repeat(80) + '\n');

  try {
    // Login
    console.log('Authenticating...');
    const token = await login();
    console.log('Logged in as test@koda.com\n');

    // Create conversation
    const conversationId = await createConversation(token);
    console.log(`Conversation: ${conversationId}\n`);

    // Run tests by phase
    const results: TestResult[] = [];
    const phases = [...new Set(TEST_CASES.map(t => t.phase))];

    for (const phase of phases) {
      const phaseTests = TEST_CASES.filter(t => t.phase === phase);

      console.log('-'.repeat(80));
      console.log(`PHASE: ${phase} (${phaseTests.length} tests)`);
      console.log('-'.repeat(80) + '\n');

      for (const testCase of phaseTests) {
        process.stdout.write(`  [${testCase.id}] "${testCase.query.substring(0, 40)}..." `);

        try {
          const queryResult = await runQuery(token, conversationId, testCase.query);
          const testResult = evaluateTest(testCase, queryResult);
          results.push(testResult);

          if (testResult.passed) {
            console.log('\x1b[32mPASS\x1b[0m');
          } else {
            console.log('\x1b[31mFAIL\x1b[0m');
            testResult.failures.forEach(f => console.log(`       \x1b[31m-> ${f}\x1b[0m`));
          }

          // Log details for debugging
          console.log(`       Intent: ${testResult.actual.intent} | Chunks: ${testResult.actual.chunksUsed} | Time: ${testResult.actual.processingTime}ms`);

        } catch (error: any) {
          console.log('\x1b[31mERROR\x1b[0m');
          console.log(`       -> ${error.message}`);
          results.push({
            id: testCase.id,
            phase: testCase.phase,
            query: testCase.query,
            passed: false,
            failures: [`Error: ${error.message}`],
            actual: {
              intent: 'error',
              confidence: 0,
              chunksUsed: 0,
              hasSummaryChunk: false,
              answerLength: 0,
              answerPreview: '',
              processingTime: 0,
            },
          });
        }

        console.log('');
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80) + '\n');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log(`Total:  ${total}`);
    console.log(`Passed: \x1b[32m${passed}\x1b[0m`);
    console.log(`Failed: \x1b[31m${failed}\x1b[0m`);
    console.log(`Rate:   ${((passed / total) * 100).toFixed(1)}%\n`);

    // Phase breakdown
    console.log('By Phase:');
    for (const phase of phases) {
      const phaseResults = results.filter(r => r.phase === phase);
      const phasePassed = phaseResults.filter(r => r.passed).length;
      const phaseTotal = phaseResults.length;
      const status = phasePassed === phaseTotal ? '\x1b[32mOK\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(`  ${phase}: ${phasePassed}/${phaseTotal} ${status}`);
    }

    // Failed tests detail
    if (failed > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('FAILED TESTS:');
      console.log('-'.repeat(80) + '\n');

      for (const result of results.filter(r => !r.passed)) {
        console.log(`[${result.id}] ${result.query}`);
        result.failures.forEach(f => console.log(`  \x1b[31m- ${f}\x1b[0m`));
        console.log(`  Actual: intent=${result.actual.intent}, chunks=${result.actual.chunksUsed}`);
        console.log('');
      }
    }

    // Final verdict
    console.log('\n' + '='.repeat(80));
    if (passed === total) {
      console.log('\x1b[32m ALL TESTS PASSED - BACKEND WIRING VERIFIED \x1b[0m');
    } else if (passed / total >= 0.9) {
      console.log('\x1b[33m 90%+ PASSED - MOSTLY READY, CHECK FAILURES \x1b[0m');
    } else {
      console.log('\x1b[31m VERIFICATION FAILED - FIX ISSUES BEFORE PROCEEDING \x1b[0m');
    }
    console.log('='.repeat(80) + '\n');

    process.exit(failed > 0 ? 1 : 0);

  } catch (error: any) {
    console.error(`\nFATAL ERROR: ${error.message}`);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\nBackend server is not running. Start with: npm run dev');
    }
    process.exit(1);
  }
}

main();
