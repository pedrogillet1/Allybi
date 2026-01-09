/**
 * KODA BACKEND WIRING VERIFICATION SUITE
 * Run: node scripts/verification/backend_wiring_verification.mjs
 */

const BASE_URL = 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// Test cases
const TEST_CASES = [
  // PHASE A: INTENT VERIFICATION
  { id: 'A1.1', phase: 'A-Intent', query: 'hello', expected: { intent: 'conversation', maxChunks: 0 } },
  { id: 'A1.2', phase: 'A-Intent', query: 'thanks', expected: { intent: 'conversation', maxChunks: 0 } },
  { id: 'A1.3', phase: 'A-Intent', query: 'good morning', expected: { intent: 'conversation', maxChunks: 0 } },
  { id: 'A2.1', phase: 'A-Intent', query: 'how do i upload files?', expected: { intent: 'help', maxChunks: 0 } },
  { id: 'A2.2', phase: 'A-Intent', query: 'where do i see my documents?', expected: { intent: 'help', maxChunks: 0 } },
  { id: 'A3.1', phase: 'A-Intent', query: 'what does the document say about Lone Mountain Ranch?', expected: { intents: ['documents', 'finance'], minChunks: 1 } },

  // PHASE B: RAG QUALITY
  { id: 'B1.1', phase: 'B-RAG', query: 'what is Lone Mountain Ranch?', expected: { intents: ['documents', 'finance'], minChunks: 5 } },
  { id: 'B1.2', phase: 'B-RAG', query: 'what services does Lone Mountain Ranch offer?', expected: { intents: ['documents', 'finance'], minChunks: 5 } },

  // PHASE C: MATH/AGGREGATION
  { id: 'C1.1', phase: 'C-Math', query: 'what is the total revenue for Lone Mountain Ranch in 2024?', expected: { intents: ['finance', 'documents'], minChunks: 1, answerContains: ['$', 'total'] } },
  { id: 'C2.1', phase: 'C-Math', query: 'what is the total revenue for 2022?', expected: { intents: ['finance', 'documents'] } },
  { id: 'C3.1', phase: 'C-Math', query: 'what was the highest revenue source?', expected: { intents: ['finance', 'documents'] } },

  // PHASE D: ANSWER STYLE
  { id: 'D1.1', phase: 'D-Style', query: 'summarize the LMR improvement plan', expected: { intents: ['documents', 'engineering', 'finance'], minChunks: 5 } },

  // PHASE F: EDGE TESTS
  { id: 'F1.1', phase: 'F-Edge', query: 'what is the CEO salary?', expected: { intents: ['documents', 'finance'], answerContains: ["couldn't find", "not contain", "no information", "does not", "not found"] } },
  { id: 'F2.1', phase: 'F-Edge', query: 'summarize everything', expected: { intents: ['documents', 'reasoning'] } },
  { id: 'F3.1', phase: 'F-Edge', query: 'what about revenue?', expected: { intents: ['finance', 'documents', 'ambiguous'] } },
];

async function login() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  const data = await response.json();
  return data.accessToken;
}

async function createConversation(token) {
  const response = await fetch(`${BASE_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ title: 'Wiring Verification' }),
  });
  if (!response.ok) throw new Error(`Failed to create conversation: ${response.status}`);
  const data = await response.json();
  return data.id;
}

async function runQuery(token, conversationId, query) {
  const startTime = Date.now();
  const response = await fetch(`${BASE_URL}/api/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query, conversationId, language: 'en' }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Query failed: ${response.status} - ${error}`);
  }
  const data = await response.json();
  return {
    answer: data.answer,
    intent: data.metadata?.primaryIntent || 'unknown',
    confidence: data.metadata?.confidence || 0,
    chunksUsed: data.metadata?.documentsUsed || 0,
    processingTime: Date.now() - startTime,
  };
}

function evaluateTest(testCase, result) {
  const failures = [];
  const answer = result.answer.toLowerCase();

  // Check intent
  if (testCase.expected.intent) {
    if (!result.intent.toLowerCase().includes(testCase.expected.intent.toLowerCase())) {
      failures.push(`Intent: expected "${testCase.expected.intent}", got "${result.intent}"`);
    }
  }
  if (testCase.expected.intents) {
    const matched = testCase.expected.intents.some(i => result.intent.toLowerCase().includes(i.toLowerCase()));
    if (!matched) {
      failures.push(`Intent: expected one of [${testCase.expected.intents.join(', ')}], got "${result.intent}"`);
    }
  }

  // Check chunks
  if (testCase.expected.maxChunks !== undefined && result.chunksUsed > testCase.expected.maxChunks) {
    failures.push(`Chunks: expected <= ${testCase.expected.maxChunks}, got ${result.chunksUsed}`);
  }
  if (testCase.expected.minChunks !== undefined && result.chunksUsed < testCase.expected.minChunks) {
    failures.push(`Chunks: expected >= ${testCase.expected.minChunks}, got ${result.chunksUsed}`);
  }

  // Check answer contains
  if (testCase.expected.answerContains) {
    const found = testCase.expected.answerContains.some(term => answer.includes(term.toLowerCase()));
    if (!found) {
      failures.push(`Answer missing one of: [${testCase.expected.answerContains.join(', ')}]`);
    }
  }

  return { passed: failures.length === 0, failures };
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('KODA BACKEND WIRING VERIFICATION SUITE');
  console.log('='.repeat(80) + '\n');

  try {
    console.log('Authenticating...');
    const token = await login();
    console.log('Logged in\n');

    const conversationId = await createConversation(token);
    console.log(`Conversation: ${conversationId}\n`);

    const results = [];
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
          const evaluation = evaluateTest(testCase, queryResult);
          results.push({ ...testCase, ...evaluation, actual: queryResult });

          if (evaluation.passed) {
            console.log('\x1b[32mPASS\x1b[0m');
          } else {
            console.log('\x1b[31mFAIL\x1b[0m');
            evaluation.failures.forEach(f => console.log(`       \x1b[31m-> ${f}\x1b[0m`));
          }
          console.log(`       Intent: ${queryResult.intent} | Chunks: ${queryResult.chunksUsed} | Time: ${queryResult.processingTime}ms`);

        } catch (error) {
          console.log('\x1b[31mERROR\x1b[0m');
          console.log(`       -> ${error.message}`);
          results.push({ ...testCase, passed: false, failures: [error.message] });
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

    console.log('By Phase:');
    for (const phase of phases) {
      const phaseResults = results.filter(r => r.phase === phase);
      const phasePassed = phaseResults.filter(r => r.passed).length;
      const phaseTotal = phaseResults.length;
      const status = phasePassed === phaseTotal ? '\x1b[32mOK\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(`  ${phase}: ${phasePassed}/${phaseTotal} ${status}`);
    }

    if (failed > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('FAILED TESTS:');
      console.log('-'.repeat(80) + '\n');
      for (const result of results.filter(r => !r.passed)) {
        console.log(`[${result.id}] ${result.query}`);
        result.failures.forEach(f => console.log(`  \x1b[31m- ${f}\x1b[0m`));
        if (result.actual) {
          console.log(`  Actual: intent=${result.actual.intent}, chunks=${result.actual.chunksUsed}`);
        }
        console.log('');
      }
    }

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

  } catch (error) {
    console.error(`\nFATAL ERROR: ${error.message}`);
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.log('\nBackend server is not running. Start with: npm run dev');
    }
    process.exit(1);
  }
}

main();
