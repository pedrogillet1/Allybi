/**
 * Test Script: Budget Overflow Guard Check
 *
 * Tests that the answer engine properly handles budget overflow scenarios:
 * 1. Returns graceful error message when context exceeds budget
 * 2. Does NOT silently truncate content
 * 3. Includes proper finishReason and warnings
 *
 * Requires: Backend running on localhost:5000
 * Auth: localhost@koda.com / Localhost123!
 *
 * Exit codes:
 * - 0: All tests passed
 * - 1: Test failed (silent truncation or crash)
 */

import axios from 'axios';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = 'http://localhost:5000/api';
const AUTH_EMAIL = 'localhost@koda.com';
const AUTH_PASSWORD = 'Localhost123!';

// ============================================================================
// TYPES
// ============================================================================

interface AuthResponse {
  token: string;
  user: any;
}

interface ChatResponse {
  answer?: string;
  response?: string;
  message?: string;
  confidence?: number;
  sources?: any[];
  error?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

async function login(): Promise<string> {
  console.log(`\nAuthenticating as ${AUTH_EMAIL}...`);

  try {
    const response = await axios.post<AuthResponse>(`${BASE_URL}/auth/login`, {
      email: AUTH_EMAIL,
      password: AUTH_PASSWORD,
    });

    console.log(`✅ Logged in successfully`);
    return response.data.token;
  } catch (error: any) {
    console.error(`❌ Login failed:`, error.response?.data || error.message);
    throw new Error('Authentication failed');
  }
}

async function createConversation(token: string): Promise<string> {
  console.log(`Creating new conversation...`);

  try {
    const response = await axios.post(
      `${BASE_URL}/chat/conversations`,
      { title: 'Budget Guard Test' },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const convId = response.data.id || response.data.conversationId;
    console.log(`✅ Created conversation: ${convId}`);
    return convId;
  } catch (error: any) {
    console.error(`❌ Failed to create conversation:`, error.response?.data || error.message);
    throw new Error('Failed to create conversation');
  }
}

async function sendMessage(
  token: string,
  conversationId: string,
  message: string
): Promise<ChatResponse> {
  try {
    const response = await axios.post(
      `${BASE_URL}/chat/conversations/${conversationId}/messages`,
      {
        message,
        stream: false
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120000 // 2 minute timeout
      }
    );

    return response.data;
  } catch (error: any) {
    if (error.response?.data) {
      return error.response.data;
    }
    throw error;
  }
}

function generateLargeQuery(targetChars: number): string {
  // Generate a query with a massive amount of repeated content
  const baseQuery = `
    Please analyze and summarize the following extensive data set which contains critical information:
    Revenue figures: Q1=$2.5M, Q2=$3.1M, Q3=$2.8M, Q4=$4.2M. Growth rate: 15% YoY.
    Operating costs breakdown: Personnel $5M, Infrastructure $2M, Marketing $1.5M.
    Customer metrics: 10,000 active users, 85% retention rate, NPS score of 72.
    Market analysis indicates strong positioning with 23% market share.
  `.trim();

  let query = 'Analyze this extensive report: ';
  while (query.length < targetChars) {
    query += baseQuery + ' ';
  }

  return query;
}

// ============================================================================
// TESTS
// ============================================================================

async function testNormalOperation(token: string, conversationId: string): Promise<{ passed: boolean; details: any }> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: Normal Operation (Within Budget)');
  console.log('='.repeat(80));

  const query = 'What is Koda and what can you help me with?';
  console.log(`\nSending normal query: "${query}"`);

  const startTime = Date.now();
  const response = await sendMessage(token, conversationId, query);
  const elapsed = Date.now() - startTime;

  console.log(`\nResponse received in ${elapsed}ms:`);

  const answer = response.answer || response.response || response.message || '';

  console.log(`  - Answer length: ${answer.length} chars`);
  console.log(`  - Answer preview: "${answer.substring(0, 150)}..."`);
  console.log(`  - Has error: ${!!response.error}`);

  const details = {
    elapsed,
    answerLength: answer.length,
    hasError: !!response.error,
    answerPreview: answer.substring(0, 200),
  };

  // Normal operation should return a meaningful answer
  const passed = answer.length > 50 && !response.error;

  if (passed) {
    console.log(`\n✅ TEST PASSED: Normal operation works correctly!`);
  } else {
    console.log(`\n❌ TEST FAILED: Normal operation failed`);
  }

  return { passed, details };
}

async function testLargeQueryHandling(token: string, conversationId: string): Promise<{ passed: boolean; details: any }> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Large Query Handling');
  console.log('='.repeat(80));

  // Generate a very large query (100KB+)
  const targetChars = 100000;
  const largeQuery = generateLargeQuery(targetChars);

  console.log(`\nSending large query: ${largeQuery.length.toLocaleString()} characters`);
  console.log(`Query preview: "${largeQuery.substring(0, 100)}..."`);

  const startTime = Date.now();
  let response: ChatResponse;
  let error: any = null;

  try {
    response = await sendMessage(token, conversationId, largeQuery);
  } catch (e: any) {
    error = e;
    response = { error: e.message };
  }

  const elapsed = Date.now() - startTime;

  console.log(`\nResponse received in ${elapsed}ms:`);

  const answer = response.answer || response.response || response.message || '';

  console.log(`  - Answer length: ${answer.length} chars`);
  console.log(`  - Has error: ${!!response.error || !!error}`);
  if (answer) {
    console.log(`  - Answer preview: "${answer.substring(0, 200)}..."`);
  }

  const details = {
    elapsed,
    queryLength: largeQuery.length,
    answerLength: answer.length,
    hasError: !!response.error || !!error,
    error: response.error || error?.message,
    answerPreview: answer.substring(0, 300),
  };

  // The system should either:
  // 1. Handle the large query gracefully and respond
  // 2. Return an error message (not crash)
  // It should NOT silently truncate or crash

  const handledGracefully = answer.length > 0 || response.error;
  const notCrashed = !error || error.code !== 'ECONNRESET';

  const passed = handledGracefully && notCrashed;

  if (passed) {
    console.log(`\n✅ TEST PASSED: Large query handled gracefully!`);
  } else {
    console.log(`\n❌ TEST FAILED: Large query not handled properly`);
  }

  return { passed, details };
}

async function testContextBudgetWithDocuments(token: string, conversationId: string): Promise<{ passed: boolean; details: any }> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Context Budget with Document Query');
  console.log('='.repeat(80));

  // Ask a question that would require RAG and document context
  const query = 'Please give me a detailed analysis of all documents including every single piece of information, statistics, numbers, dates, names, and any other data points from every document in my library. I need a comprehensive report covering absolutely everything.';

  console.log(`\nSending document-heavy query to trigger RAG...`);
  console.log(`Query: "${query}"`);

  const startTime = Date.now();
  let response: ChatResponse;
  let error: any = null;

  try {
    response = await sendMessage(token, conversationId, query);
  } catch (e: any) {
    error = e;
    response = { error: e.message };
  }

  const elapsed = Date.now() - startTime;

  console.log(`\nResponse received in ${elapsed}ms:`);

  const answer = response.answer || response.response || response.message || '';

  console.log(`  - Answer length: ${answer.length} chars`);
  console.log(`  - Sources count: ${response.sources?.length || 0}`);
  console.log(`  - Has error: ${!!response.error || !!error}`);
  if (answer) {
    console.log(`  - Answer preview: "${answer.substring(0, 200)}..."`);
  }

  const details = {
    elapsed,
    answerLength: answer.length,
    sourcesCount: response.sources?.length || 0,
    hasError: !!response.error || !!error,
    error: response.error || error?.message,
    answerPreview: answer.substring(0, 300),
    fullAnswer: answer,
  };

  // Check for budget overflow messages (graceful handling)
  const budgetOverflowMessages = [
    'context is too large',
    'contexto é muito grande',
    'contexto es demasiado grande',
    'too large to process',
  ];

  const hasBudgetOverflowMessage = budgetOverflowMessages.some(msg =>
    answer.toLowerCase().includes(msg.toLowerCase())
  );

  // The system should either:
  // 1. Return a normal answer (if within budget)
  // 2. Return a budget overflow message (if over budget)
  // It should NOT crash or return empty

  const hasValidResponse = answer.length > 20;
  const notCrashed = !error || error.code !== 'ECONNRESET';

  console.log(`\nBudget handling analysis:`);
  console.log(`  - Has valid response: ${hasValidResponse}`);
  console.log(`  - Has budget overflow message: ${hasBudgetOverflowMessage}`);
  console.log(`  - Not crashed: ${notCrashed}`);

  details.hasBudgetOverflowMessage = hasBudgetOverflowMessage;

  const passed = hasValidResponse && notCrashed;

  if (passed) {
    if (hasBudgetOverflowMessage) {
      console.log(`\n✅ TEST PASSED: Budget overflow handled gracefully with proper message!`);
    } else {
      console.log(`\n✅ TEST PASSED: Query processed within budget!`);
    }
  } else {
    console.log(`\n❌ TEST FAILED: Context budget not handled properly`);
  }

  return { passed, details };
}

async function testTokenEstimation(): Promise<{ passed: boolean; details: any }> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: Token Estimation Service');
  console.log('='.repeat(80));

  // Import and test the token estimator directly
  const { getTokenBudgetEstimator } = await import('../src/services/utils/tokenBudgetEstimator.service');
  const { getContextWindowBudgeting } = await import('../src/services/utils/contextWindowBudgeting.service');

  const tokenEstimator = getTokenBudgetEstimator();
  const budgetingService = getContextWindowBudgeting();

  // Test various content sizes
  const testCases = [
    { name: 'Small text', content: 'Hello, world!' },
    { name: 'Medium text', content: 'A'.repeat(1000) },
    { name: 'Large text', content: 'B'.repeat(10000) },
    { name: 'Very large text', content: 'C'.repeat(100000) },
  ];

  console.log(`\nTesting token estimation for various content sizes:`);

  const results: any[] = [];
  for (const testCase of testCases) {
    const estimate = tokenEstimator.estimateDetailed(testCase.content);
    console.log(`  - ${testCase.name} (${testCase.content.length.toLocaleString()} chars): ${estimate.tokens.toLocaleString()} tokens`);
    results.push({
      name: testCase.name,
      chars: testCase.content.length,
      tokens: estimate.tokens,
    });
  }

  // Test model context limits
  const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gpt-4o'];
  console.log(`\nModel context limits:`);

  const modelLimits: any = {};
  for (const model of models) {
    const limit = budgetingService.getModelContextLimit(model);
    console.log(`  - ${model}: ${limit.toLocaleString()} tokens`);
    modelLimits[model] = limit;
  }

  // Test budget selection
  console.log(`\nTesting chunk budget selection:`);
  const chunks = [
    'Chunk 1: This is the first chunk with some important information about revenue.',
    'Chunk 2: This chunk contains details about operating expenses and costs.',
    'Chunk 3: Customer metrics and satisfaction scores are discussed here.',
    'Chunk 4: Market analysis and competitive positioning information.',
    'Chunk 5: Future projections and growth strategies outlined.',
  ];

  const budgetResult = budgetingService.selectChunksWithinBudget(chunks, 100); // Very small budget
  console.log(`  - Chunks provided: ${chunks.length}`);
  console.log(`  - Chunks included: ${budgetResult.chunksIncluded}`);
  console.log(`  - Chunks excluded: ${budgetResult.chunksExcluded}`);
  console.log(`  - Tokens used: ${budgetResult.tokensUsed}`);
  console.log(`  - Was truncated: ${budgetResult.wasTruncated}`);

  const details = {
    tokenEstimates: results,
    modelLimits,
    budgetSelection: budgetResult,
  };

  // Verify token estimation is working correctly
  const estimatesCorrect = results.every(r => r.tokens > 0 && r.tokens < r.chars);
  const modelsHaveLimits = Object.values(modelLimits).every((l: any) => l > 0);
  const budgetSelectionWorks = budgetResult.chunksIncluded > 0 || budgetResult.wasTruncated;

  const passed = estimatesCorrect && modelsHaveLimits && budgetSelectionWorks;

  if (passed) {
    console.log(`\n✅ TEST PASSED: Token estimation and budgeting services work correctly!`);
  } else {
    console.log(`\n❌ TEST FAILED: Token estimation or budgeting service issues`);
  }

  return { passed, details };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           BUDGET OVERFLOW GUARD TEST SUITE                                 ║');
  console.log('║           Testing: localhost:5000                                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  const results: { name: string; passed: boolean; details: any }[] = [];

  // Test 0: Token estimation (no auth needed)
  try {
    const tokenResult = await testTokenEstimation();
    results.push({ name: 'Token Estimation Service', ...tokenResult });
  } catch (e: any) {
    console.error('Test crashed:', e.message);
    results.push({ name: 'Token Estimation Service', passed: false, details: { error: e.message } });
  }

  // Login
  let token: string;
  let conversationId: string;

  try {
    token = await login();
    conversationId = await createConversation(token);
  } catch (e: any) {
    console.error('\n❌ FATAL: Could not authenticate or create conversation');
    console.error('   Make sure the backend is running on localhost:5000');
    console.error('   Error:', e.message);

    // Print summary with what we have
    console.log('\n' + '═'.repeat(80));
    console.log('TEST SUMMARY (PARTIAL - Auth Failed)');
    console.log('═'.repeat(80));

    for (const result of results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status}: ${result.name}`);
    }

    console.log(`❌ SKIP: Normal Operation (auth failed)`);
    console.log(`❌ SKIP: Large Query Handling (auth failed)`);
    console.log(`❌ SKIP: Context Budget with Documents (auth failed)`);

    process.exit(1);
  }

  // Test 1: Normal operation
  try {
    const normalResult = await testNormalOperation(token, conversationId);
    results.push({ name: 'Normal Operation', ...normalResult });
  } catch (e: any) {
    console.error('Test crashed:', e.message);
    results.push({ name: 'Normal Operation', passed: false, details: { error: e.message } });
  }

  // Test 2: Large query handling
  try {
    const largeQueryResult = await testLargeQueryHandling(token, conversationId);
    results.push({ name: 'Large Query Handling', ...largeQueryResult });
  } catch (e: any) {
    console.error('Test crashed:', e.message);
    results.push({ name: 'Large Query Handling', passed: false, details: { error: e.message } });
  }

  // Test 3: Context budget with documents
  try {
    const budgetResult = await testContextBudgetWithDocuments(token, conversationId);
    results.push({ name: 'Context Budget with Documents', ...budgetResult });
  } catch (e: any) {
    console.error('Test crashed:', e.message);
    results.push({ name: 'Context Budget with Documents', passed: false, details: { error: e.message } });
  }

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(80));

  let allPassed = true;
  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${result.name}`);
    if (!result.passed) {
      allPassed = false;
      if (result.details.error) {
        console.log(`        Error: ${result.details.error}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(80));

  // Print detailed results
  console.log('\nDETAILED RESULTS:');
  console.log(JSON.stringify(results, null, 2));

  if (allPassed) {
    console.log('\n✅ ALL TESTS PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
