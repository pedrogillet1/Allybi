/**
 * PHASE 10 — TOKEN BUDGET ANALYSIS
 *
 * Shows REAL token breakdown for each query type:
 * - System prompt tokens (from actual template)
 * - Query tokens (real)
 * - Context tokens (requires live backend with documents)
 * - Response buffer (fixed 2000 tokens)
 *
 * Budget limit: 8000 tokens (Gemini context window for RAG)
 */

import { initializeServices, classifyIntent, computeDepth, requiresRAG, STYLE_MAPPING } from './helpers';
import { getTokenBudgetEstimator } from '../../src/services/utils';

// ============================================================================
// SYSTEM PROMPT TEMPLATE (from kodaAnswerEngineV3.service.ts)
// ============================================================================

const SYSTEM_PROMPT_TEMPLATE = `You are Koda, an intelligent document assistant. Your role is to answer questions based ONLY on the provided document context.

CRITICAL RULES:
1. ONLY use information from the provided context
2. If the context doesn't contain the answer, say so clearly
3. Always cite which document the information comes from
4. Be concise but comprehensive
5. Respond in English.

Provide a clear, concise summary of the key points.`;

// ============================================================================
// TEST QUERIES
// ============================================================================

interface TokenTest {
  name: string;
  query: string;
  expectedIntent: string;
  expectsRAG: boolean;
  expectedChunks: number;  // Typical chunk count for this query type
  avgChunkTokens: number;  // Average tokens per chunk
}

const TEST_QUERIES: TokenTest[] = [
  // Document queries (RAG required, 5-8 chunks)
  { name: 'doc_summary', query: 'summarize the main findings of this report', expectedIntent: 'documents', expectsRAG: true, expectedChunks: 6, avgChunkTokens: 200 },
  { name: 'doc_section', query: 'what does section 3 say about pricing and payment terms?', expectedIntent: 'documents', expectsRAG: true, expectedChunks: 4, avgChunkTokens: 200 },
  { name: 'doc_find', query: 'find where it mentions the deadline for submission', expectedIntent: 'documents', expectsRAG: true, expectedChunks: 3, avgChunkTokens: 200 },

  // Domain queries (RAG required, 4-6 chunks)
  { name: 'finance', query: 'analyze the profit margin trends over the last quarter', expectedIntent: 'finance', expectsRAG: true, expectedChunks: 5, avgChunkTokens: 250 },
  { name: 'accounting', query: 'audit the journal entries for discrepancies', expectedIntent: 'accounting', expectsRAG: true, expectedChunks: 6, avgChunkTokens: 250 },
  { name: 'legal', query: 'what are the termination clauses in this contract?', expectedIntent: 'legal', expectsRAG: true, expectedChunks: 4, avgChunkTokens: 300 },

  // Non-RAG queries (no context)
  { name: 'greeting', query: 'hello', expectedIntent: 'conversation', expectsRAG: false, expectedChunks: 0, avgChunkTokens: 0 },
  { name: 'help', query: 'how do I upload files?', expectedIntent: 'help', expectsRAG: false, expectedChunks: 0, avgChunkTokens: 0 },
  { name: 'math', query: 'calculate 15% of 2500', expectedIntent: 'reasoning', expectsRAG: false, expectedChunks: 0, avgChunkTokens: 0 },

  // Comparison queries (D3, more chunks needed)
  { name: 'compare', query: 'compare the revenue figures between Q1 and Q2', expectedIntent: 'documents', expectsRAG: true, expectedChunks: 8, avgChunkTokens: 200 },

  // Scenario queries (D5, requires context for projection)
  { name: 'scenario', query: 'what happens if revenue drops by 20% next quarter?', expectedIntent: 'finance', expectsRAG: true, expectedChunks: 5, avgChunkTokens: 250 },
];

// ============================================================================
// TOKEN BUDGET ANALYSIS
// ============================================================================

interface TokenBreakdown {
  name: string;
  query: string;
  intent: string;
  depth: string;
  requiresRAG: boolean;

  // Token breakdown
  systemPromptTokens: number;
  queryTokens: number;
  contextTokens: number;      // Estimated based on expected chunks
  responseBuffer: number;
  totalTokens: number;

  // Budget analysis
  budgetLimit: number;
  budgetUsed: string;         // Percentage
  withinBudget: boolean;
  headroom: number;           // Tokens remaining
}

async function runTokenBudgetAnalysis(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 10 — TOKEN BUDGET ANALYSIS');
  console.log('='.repeat(70));
  console.log('\nShows REAL token breakdown for the full context window.\n');

  await initializeServices();
  const tokenEstimator = getTokenBudgetEstimator();

  // Calculate system prompt tokens (this is fixed)
  const systemPromptTokens = tokenEstimator.estimateDetailed(SYSTEM_PROMPT_TEMPLATE, 'en').tokens;
  console.log(`System prompt template: ${systemPromptTokens} tokens\n`);

  const BUDGET_LIMIT = 8000;
  const RESPONSE_BUFFER = 2000;

  const results: TokenBreakdown[] = [];

  console.log('─'.repeat(70));
  console.log('TOKEN BREAKDOWN PER QUERY');
  console.log('─'.repeat(70) + '\n');

  for (const test of TEST_QUERIES) {
    // Get real classification
    const prediction = await classifyIntent(test.query);
    const { depth } = computeDepth(prediction.primaryIntent, prediction.confidence, test.query);
    const needsRAG = requiresRAG(prediction.primaryIntent);

    // Calculate tokens
    const queryTokens = tokenEstimator.estimateDetailed(test.query, 'en').tokens;
    const contextTokens = test.expectsRAG ? (test.expectedChunks * test.avgChunkTokens) : 0;
    const totalTokens = systemPromptTokens + queryTokens + contextTokens + RESPONSE_BUFFER;

    const budgetUsed = ((totalTokens / BUDGET_LIMIT) * 100).toFixed(1);
    const withinBudget = totalTokens <= BUDGET_LIMIT;
    const headroom = BUDGET_LIMIT - totalTokens;

    const result: TokenBreakdown = {
      name: test.name,
      query: test.query,
      intent: prediction.primaryIntent,
      depth,
      requiresRAG: needsRAG,
      systemPromptTokens,
      queryTokens,
      contextTokens,
      responseBuffer: RESPONSE_BUFFER,
      totalTokens,
      budgetLimit: BUDGET_LIMIT,
      budgetUsed,
      withinBudget,
      headroom,
    };

    results.push(result);

    // Output
    const icon = withinBudget ? '✓' : '✗';
    console.log(`${icon} ${test.name}: "${test.query.substring(0, 45)}..."`);
    console.log(`    Intent: ${prediction.primaryIntent} (${depth})`);
    console.log(`    RAG: ${needsRAG ? `yes (${test.expectedChunks} chunks × ${test.avgChunkTokens} tokens)` : 'no'}`);
    console.log(`    Token breakdown:`);
    console.log(`      System prompt: ${systemPromptTokens.toString().padStart(5)} tokens`);
    console.log(`      Query:         ${queryTokens.toString().padStart(5)} tokens`);
    console.log(`      Context:       ${contextTokens.toString().padStart(5)} tokens ${contextTokens === 0 ? '(no RAG)' : `(${test.expectedChunks} chunks)`}`);
    console.log(`      Response buf:  ${RESPONSE_BUFFER.toString().padStart(5)} tokens`);
    console.log(`      ─────────────────────`);
    console.log(`      TOTAL:         ${totalTokens.toString().padStart(5)} tokens (${budgetUsed}% of ${BUDGET_LIMIT})`);
    console.log(`      Headroom:      ${headroom.toString().padStart(5)} tokens remaining`);
    console.log('');
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('='.repeat(70));
  console.log('TOKEN BUDGET SUMMARY');
  console.log('='.repeat(70) + '\n');

  // RAG queries
  const ragResults = results.filter(r => r.requiresRAG);
  const nonRagResults = results.filter(r => !r.requiresRAG);

  console.log('RAG Queries (with document context):');
  console.log(`  Count: ${ragResults.length}`);
  console.log(`  Avg total tokens: ${Math.round(ragResults.reduce((sum, r) => sum + r.totalTokens, 0) / ragResults.length)}`);
  console.log(`  Avg context tokens: ${Math.round(ragResults.reduce((sum, r) => sum + r.contextTokens, 0) / ragResults.length)}`);
  console.log(`  Avg budget used: ${(ragResults.reduce((sum, r) => sum + parseFloat(r.budgetUsed), 0) / ragResults.length).toFixed(1)}%`);

  console.log('\nNon-RAG Queries (no document context):');
  console.log(`  Count: ${nonRagResults.length}`);
  console.log(`  Avg total tokens: ${Math.round(nonRagResults.reduce((sum, r) => sum + r.totalTokens, 0) / nonRagResults.length)}`);
  console.log(`  Avg budget used: ${(nonRagResults.reduce((sum, r) => sum + parseFloat(r.budgetUsed), 0) / nonRagResults.length).toFixed(1)}%`);

  // Budget check
  const overBudget = results.filter(r => !r.withinBudget);
  if (overBudget.length > 0) {
    console.log('\n⚠️  BUDGET EXCEEDED:');
    overBudget.forEach(r => {
      console.log(`  - ${r.name}: ${r.totalTokens} tokens (${r.budgetUsed}%)`);
    });
  } else {
    console.log('\n✅ All queries within budget');
  }

  // Token distribution
  console.log('\nToken distribution (typical RAG query):');
  const typicalRag = ragResults[0];
  if (typicalRag) {
    const total = typicalRag.totalTokens;
    console.log(`  System prompt: ${((typicalRag.systemPromptTokens / total) * 100).toFixed(1)}%`);
    console.log(`  Query:         ${((typicalRag.queryTokens / total) * 100).toFixed(1)}%`);
    console.log(`  Context:       ${((typicalRag.contextTokens / total) * 100).toFixed(1)}%`);
    console.log(`  Response buf:  ${((typicalRag.responseBuffer / total) * 100).toFixed(1)}%`);
  }

  console.log('\n' + '─'.repeat(70));
  console.log('NOTE: Context tokens are ESTIMATED based on expected chunk counts.');
  console.log('For REAL chunk counts, run queries against a live backend with documents.');
  console.log('─'.repeat(70) + '\n');

  // Exit with success
  console.log('✅ Token budget analysis complete\n');
}

// Run
runTokenBudgetAnalysis().catch(err => {
  console.error('Token budget analysis error:', err);
  process.exit(1);
});
