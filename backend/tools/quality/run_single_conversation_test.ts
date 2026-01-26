#!/usr/bin/env npx ts-node
/**
 * Single Conversation Test - All queries in ONE conversation
 *
 * Simulates real frontend behavior where all queries happen in the same conversation.
 * This properly tests follow-up context, topic expansion, and memory.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CORPUS_FILE = process.env.CORPUS_FILE || '/tmp/corpus_50_final.jsonl';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTPUT_DIR = path.join(__dirname, `../../audit_output_mass/single_conversation_${timestamp}`);

interface CorpusQuery {
  id: string;
  query: string;
  language: string;
}

interface QueryResult {
  id: string;
  query: string;
  language: string;
  answer: string;
  fullAnswer?: string;
  intent?: string;
  sources?: number;
  latencyMs: number;
  error?: string;
  conversationId: string;
  turnIndex: number;
  requestId?: string;
}

async function runQuery(
  query: string,
  conversationId: string,
  language: string = 'en'
): Promise<{
  answer: string;
  fullAnswer?: string;
  intent?: string;
  sources?: number;
  latencyMs: number;
  actualConversationId: string;
  requestId?: string;
}> {
  const start = Date.now();

  const response = await fetch(`${BASE_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      userId: 'test-user-001',
      conversationId,
      language,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split('\n').filter(l => l.startsWith('data:'));

  let fullAnswer = '';
  let streamedContent = '';
  let intent = '';
  let sources = 0;
  let actualConversationId = conversationId;
  let requestId: string | undefined;

  for (const line of lines) {
    try {
      const data = JSON.parse(line.slice(5));

      if (data.requestId) {
        requestId = data.requestId;
      }

      if (data.type === 'content' || data.type === 'token') {
        streamedContent += data.content || '';
      } else if (data.type === 'conversationId') {
        actualConversationId = data.conversationId;
      } else if (data.type === 'done') {
        intent = data.intent || '';
        sources = data.sources?.length || 0;
        fullAnswer = data.fullAnswer || streamedContent;
        if (data.requestId) requestId = data.requestId;
      }
    } catch {}
  }

  return {
    answer: streamedContent,
    fullAnswer,
    intent,
    sources,
    latencyMs: Date.now() - start,
    actualConversationId,
    requestId,
  };
}

async function loadCorpus(filePath: string): Promise<CorpusQuery[]> {
  const queries: CorpusQuery[] = [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      queries.push(JSON.parse(line));
    } catch {}
  }

  return queries;
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error('ERROR: AUTH_TOKEN environment variable required');
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load corpus
  const queries = await loadCorpus(CORPUS_FILE);
  console.log(`Loaded ${queries.length} queries from corpus`);

  // Sort by ID to ensure order
  queries.sort((a, b) => {
    const numA = parseInt(a.id.replace(/\D/g, ''), 10);
    const numB = parseInt(b.id.replace(/\D/g, ''), 10);
    return numA - numB;
  });

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('    SINGLE CONVERSATION TEST - All queries in ONE conversation');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`Queries: ${queries.length}`);
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('');

  // Start with a single conversation ID for ALL queries
  let conversationId = `single-conv-${Date.now()}`;
  const results: QueryResult[] = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const turnIndex = i + 1;

    try {
      const result = await runQuery(q.query, conversationId, q.language);

      // Update conversationId for subsequent queries (backend may assign one)
      conversationId = result.actualConversationId;

      const queryResult: QueryResult = {
        id: q.id,
        query: q.query,
        language: q.language,
        answer: result.answer,
        fullAnswer: result.fullAnswer,
        intent: result.intent,
        sources: result.sources,
        latencyMs: result.latencyMs,
        conversationId,
        turnIndex,
        requestId: result.requestId,
      };

      results.push(queryResult);

      // Simple pass/fail: has content and no error
      const hasContent = (result.fullAnswer || result.answer || '').length > 20;
      if (hasContent) {
        passed++;
        console.log(`[${turnIndex}/${queries.length}] ${q.id}: ${result.latencyMs}ms ✓`);
      } else {
        failed++;
        console.log(`[${turnIndex}/${queries.length}] ${q.id}: ${result.latencyMs}ms ✗ (no content)`);
      }

      // Small delay between queries to simulate real usage
      await new Promise(r => setTimeout(r, 300));

    } catch (err: any) {
      failed++;
      console.log(`[${turnIndex}/${queries.length}] ${q.id}: ERROR - ${err.message}`);

      results.push({
        id: q.id,
        query: q.query,
        language: q.language,
        answer: '',
        latencyMs: 0,
        error: err.message,
        conversationId,
        turnIndex,
      });
    }
  }

  // Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('                        RESULTS SUMMARY');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`Total queries: ${queries.length}`);
  console.log(`Passed: ${passed} (${((passed / queries.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);
  console.log(`Conversation ID: ${conversationId}`);

  // Calculate avg latency
  const successResults = results.filter(r => !r.error);
  const avgLatency = successResults.length > 0
    ? Math.round(successResults.reduce((sum, r) => sum + r.latencyMs, 0) / successResults.length)
    : 0;
  console.log(`Avg latency: ${avgLatency}ms`);

  // Write results
  const resultsPath = path.join(OUTPUT_DIR, 'results.jsonl');
  const resultsStream = fs.createWriteStream(resultsPath);
  for (const r of results) {
    resultsStream.write(JSON.stringify(r) + '\n');
  }
  resultsStream.end();

  // Write summary
  const summary = {
    timestamp: new Date().toISOString(),
    totalQueries: queries.length,
    passed,
    failed,
    passRate: ((passed / queries.length) * 100).toFixed(1) + '%',
    avgLatencyMs: avgLatency,
    conversationId,
    corpusFile: CORPUS_FILE,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\nResults written to: ${OUTPUT_DIR}`);

  if (passed / queries.length >= 0.9) {
    console.log('\n[PASSED] Pass rate >= 90%');
  } else {
    console.log('\n[FAILED] Pass rate < 90%');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
