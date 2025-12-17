#!/usr/bin/env npx ts-node
/**
 * Retrieval Contract Harness
 *
 * Tests the KodaRetrievalEngineV3 contract by calling retrieveWithMetadata
 * and validating the response structure.
 *
 * RUN: npx ts-node --transpile-only scripts/test_retrieval_contract.ts
 *
 * EXIT CODES:
 *   0 = All assertions passed
 *   1 = Assertion failure or error
 */

import prisma from '../src/config/database';
import { initializeContainer, getContainer } from '../src/bootstrap/container';
import { initPromptConfig } from '../src/services/core/promptConfig.service';
import { initTokenBudgetEstimator } from '../src/services/utils/tokenBudgetEstimator.service';
import { initContextWindowBudgeting } from '../src/services/utils/contextWindowBudgeting.service';
import { DATA_DIR } from '../src/config/dataPaths';
import {
  PrimaryIntent,
  IntentDomain,
  QuestionType,
  QueryScope,
  type IntentClassificationV3,
  type RetrievalResult,
} from '../src/types/ragV3.types';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_QUERY = 'What are the main topics in my documents?';
const MAX_CHUNKS = 5;

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

interface AssertionResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: AssertionResult[] = [];

function assert(name: string, condition: boolean, message: string, details?: any): void {
  results.push({
    name,
    passed: condition,
    message: condition ? `✅ ${message}` : `❌ ${message}`,
    details,
  });
}

function assertType(name: string, value: any, expectedType: string, details?: any): void {
  const actualType = Array.isArray(value) ? 'array' : typeof value;
  const passed = actualType === expectedType;
  results.push({
    name,
    passed,
    message: passed
      ? `✅ ${name} is ${expectedType}`
      : `❌ ${name} expected ${expectedType}, got ${actualType}`,
    details: details || { value, actualType },
  });
}

function assertHasProperty(name: string, obj: any, property: string): void {
  const passed = obj && property in obj;
  results.push({
    name,
    passed,
    message: passed
      ? `✅ ${name} has property '${property}'`
      : `❌ ${name} missing property '${property}'`,
    details: { hasProperty: passed, availableKeys: obj ? Object.keys(obj) : [] },
  });
}

// ============================================================================
// STUB INTENT (requires RAG)
// ============================================================================

function createStubIntent(): IntentClassificationV3 {
  return {
    primaryIntent: PrimaryIntent.DOCUMENT_QNA,
    domain: IntentDomain.DOCUMENTS,
    questionType: QuestionType.SUMMARY,
    scope: QueryScope.ALL_DOCS,
    language: 'en',
    requiresRAG: true,  // CRITICAL: Must be true for retrieval to run
    requiresProductHelp: false,
    target: {
      type: 'NONE',
    },
    confidence: 0.9,
  };
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function runTest(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  RETRIEVAL CONTRACT HARNESS');
  console.log('═'.repeat(70));
  console.log();

  // Step 1: Use test user localhost@koda.com
  console.log('📋 Step 1: Finding test user (localhost@koda.com)...');

  const testUser = await prisma.user.findFirst({
    where: { email: 'localhost@koda.com' },
    include: {
      _count: {
        select: { documents: true },
      },
    },
  });

  if (!testUser) {
    console.log('❌ Test user localhost@koda.com not found in database!');
    process.exit(1);
  }

  const userId = testUser.id;
  console.log(`   Found user: ${testUser.email}`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Document count: ${testUser._count.documents}`);

  // Check for completed documents specifically
  const completedDocsCount = await prisma.document.count({
    where: { userId, status: 'completed' },
  });
  console.log(`   Completed documents: ${completedDocsCount}`);

  if (completedDocsCount === 0) {
    console.log('   ⚠️  WARNING: No completed documents - retrieval may return empty results');
    console.log('   (Contract test will still verify response structure)');
  }
  console.log();

  // Step 2: Initialize services (matching server.ts sequence)
  console.log('📋 Step 2: Initializing services...');
  initTokenBudgetEstimator();
  console.log('   ✅ TokenBudgetEstimator initialized');
  initContextWindowBudgeting();
  console.log('   ✅ ContextWindowBudgeting initialized');
  initPromptConfig({ dataDir: DATA_DIR, env: 'test', logger: console });
  console.log('   ✅ PromptConfig initialized (loads fallbacks, intent patterns, product help)');
  console.log();

  // Step 3: Initialize container
  console.log('📋 Step 3: Initializing service container...');
  await initializeContainer();
  const container = getContainer();
  const retrievalEngine = container.getRetrievalEngine();
  console.log('   Container initialized successfully');
  console.log();

  // Step 4: Create stub intent
  console.log('📋 Step 4: Creating stub intent (requiresRAG=true)...');
  const stubIntent = createStubIntent();
  console.log('   Intent:', JSON.stringify(stubIntent, null, 2));
  console.log();

  // Step 5: Call retrieveWithMetadata
  console.log('📋 Step 5: Calling retrieveWithMetadata...');
  console.log(`   Query: "${TEST_QUERY}"`);
  console.log(`   Max chunks: ${MAX_CHUNKS}`);
  console.log();

  const startTime = Date.now();
  let result: RetrievalResult;

  try {
    result = await retrievalEngine.retrieveWithMetadata({
      userId,
      query: TEST_QUERY,
      intent: stubIntent,
      language: 'en',
      maxChunks: MAX_CHUNKS,
    });
  } catch (error) {
    console.log('❌ retrieveWithMetadata threw an error:');
    console.log('  ', error);
    process.exit(1);
  }

  const elapsedMs = Date.now() - startTime;
  console.log(`   Retrieval completed in ${elapsedMs}ms`);
  console.log();

  // Step 6: Run assertions
  console.log('📋 Step 6: Running contract assertions...');
  console.log();

  // Assert: result exists
  assert('result_exists', result !== null && result !== undefined, 'Result is not null/undefined');

  // Assert: chunks property exists and is array
  assertHasProperty('result', result, 'chunks');
  assertType('chunks', result.chunks, 'array');

  // Assert: usedHybrid property exists and is boolean
  assertHasProperty('result', result, 'usedHybrid');
  assertType('usedHybrid', result.usedHybrid, 'boolean', { value: result.usedHybrid });

  // Assert: hybridDetails property exists
  assertHasProperty('result', result, 'hybridDetails');
  if (result.hybridDetails) {
    assertHasProperty('hybridDetails', result.hybridDetails, 'vectorTopK');
    assertHasProperty('hybridDetails', result.hybridDetails, 'bm25TopK');
    assertHasProperty('hybridDetails', result.hybridDetails, 'mergeStrategy');
  }

  // Assert: appliedBoosts property exists and is array
  assertHasProperty('result', result, 'appliedBoosts');
  assertType('appliedBoosts', result.appliedBoosts, 'array');

  // Assert: chunks length is within budget
  const chunksWithinBudget = result.chunks.length <= MAX_CHUNKS;
  assert(
    'chunks_within_budget',
    chunksWithinBudget,
    `Chunks count (${result.chunks.length}) <= maxChunks (${MAX_CHUNKS})`,
    { chunksReturned: result.chunks.length, maxChunks: MAX_CHUNKS }
  );

  // Assert: each chunk has required properties
  if (result.chunks.length > 0) {
    const firstChunk = result.chunks[0];
    assertHasProperty('chunk[0]', firstChunk, 'chunkId');
    assertHasProperty('chunk[0]', firstChunk, 'documentId');
    assertHasProperty('chunk[0]', firstChunk, 'documentName');
    assertHasProperty('chunk[0]', firstChunk, 'score');
    assertHasProperty('chunk[0]', firstChunk, 'content');
    assertHasProperty('chunk[0]', firstChunk, 'metadata');
  }

  // Assert: appliedBoosts items have required properties (if any)
  if (result.appliedBoosts && result.appliedBoosts.length > 0) {
    const firstBoost = result.appliedBoosts[0];
    assertHasProperty('appliedBoosts[0]', firstBoost, 'documentId');
    assertHasProperty('appliedBoosts[0]', firstBoost, 'boostFactor');
    assertHasProperty('appliedBoosts[0]', firstBoost, 'reason');
  }

  // Step 7: Print results
  console.log('═'.repeat(70));
  console.log('  ASSERTION RESULTS');
  console.log('═'.repeat(70));
  console.log();

  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    console.log(`  ${r.message}`);
    if (r.passed) {
      passCount++;
    } else {
      failCount++;
      if (r.details) {
        console.log(`     Details: ${JSON.stringify(r.details)}`);
      }
    }
  }

  console.log();
  console.log('═'.repeat(70));
  console.log('  FULL RESULT DUMP');
  console.log('═'.repeat(70));
  console.log();

  // Print full result for inspection
  console.log('📦 RetrievalResult:');
  console.log(`   usedHybrid: ${result.usedHybrid}`);
  console.log(`   hybridDetails: ${JSON.stringify(result.hybridDetails)}`);
  console.log(`   appliedBoosts: ${JSON.stringify(result.appliedBoosts)}`);
  console.log(`   chunks.length: ${result.chunks.length}`);
  console.log();

  if (result.chunks.length > 0) {
    console.log('📄 First chunk:');
    const chunk = result.chunks[0];
    console.log(`   chunkId: ${chunk.chunkId}`);
    console.log(`   documentId: ${chunk.documentId}`);
    console.log(`   documentName: ${chunk.documentName}`);
    console.log(`   score: ${chunk.score}`);
    console.log(`   pageNumber: ${chunk.pageNumber || 'N/A'}`);
    console.log(`   content (first 200 chars): ${chunk.content.substring(0, 200)}...`);
    console.log(`   metadata: ${JSON.stringify(chunk.metadata)}`);
    console.log();
  }

  if (result.chunks.length > 1) {
    console.log('📄 All chunks summary:');
    for (let i = 0; i < result.chunks.length; i++) {
      const c = result.chunks[i];
      console.log(`   [${i}] ${c.documentName} (score: ${c.score.toFixed(4)}, page: ${c.pageNumber || 'N/A'})`);
    }
    console.log();
  }

  // Step 8: Summary
  console.log('═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log();
  console.log(`   Total assertions: ${results.length}`);
  console.log(`   Passed: ${passCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Retrieval time: ${elapsedMs}ms`);
  console.log();

  if (failCount > 0) {
    console.log('❌ CONTRACT TEST FAILED');
    process.exit(1);
  } else {
    console.log('✅ CONTRACT TEST PASSED');
    process.exit(0);
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

runTest()
  .catch((error) => {
    console.error('💥 Unhandled error in test harness:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
