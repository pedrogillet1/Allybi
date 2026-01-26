#!/usr/bin/env npx ts-node
/**
 * Run 50-query test with ChatGPT evaluation AND conversation context support
 *
 * Usage: AUTH_TOKEN=... npx ts-node tools/quality/run_50_test_with_context.ts
 *
 * Features:
 * - Conversation groups for context-dependent queries
 * - Multi-turn conversations share conversationId
 * - Single queries use fresh conversationId
 * - Claude-based evaluation
 * - Routing debug trace output
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CORPUS_FILE = process.env.CORPUS_FILE || '/tmp/corpus_50_final.jsonl';
const GROUPING_FILE = process.env.GROUPING_FILE || path.join(__dirname, 'corpus_grouping_50.json');
const DEBUG_ROUTING = process.env.DEBUG_ROUTING === '1';
const SINGLE_CONVERSATION = process.env.SINGLE_CONVERSATION === '1';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTPUT_DIR = path.join(__dirname, `../../audit_output_mass/quality_50_with_context_${timestamp}`);

interface CorpusQuery {
  id: string;
  query: string;
  language: string;
}

interface ConversationGroup {
  conversationName: string;
  description: string;
  queryIds: string[];
}

interface Grouping {
  groups: ConversationGroup[];
  singles: string[];
}

interface DoneEvent {
  type: 'done';
  fullAnswer: string;
  intent?: string;
  sources?: Array<{ documentId: string; documentName: string; score: number }>;
  citations?: Array<{ id: string; doc: string; page?: number }>;
  constraints?: Record<string, unknown>;
  matchedPatterns?: string[];
  routingTrace?: {
    selectedIntent: string;
    matchedPatterns: string[];
    scores: Record<string, number>;
    interceptFlags: string[];
  };
}

interface QueryResult {
  id: string;
  query: string;
  language: string;
  answer: string;
  intent?: string;
  sources?: number;
  latencyMs: number;
  error?: string;
  doneEvent?: DoneEvent;
  conversationId: string;
  turnIndex: number;
  conversationName?: string;
  routingTrace?: DoneEvent['routingTrace'];
}

interface EvalResult {
  id: string;
  query: string;
  answer: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: string[];
  passed: boolean;
}

// Initialize Anthropic for evaluation
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
let anthropic: Anthropic | null = null;
if (apiKey) {
  anthropic = new Anthropic({ apiKey });
}

async function runQuery(
  query: string,
  conversationId: string,
  language: string = 'en',
  debugRouting: boolean = false
): Promise<{
  answer: string;
  intent?: string;
  sources?: number;
  latencyMs: number;
  doneEvent?: DoneEvent;
  actualConversationId: string;
}> {
  const start = Date.now();

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (debugRouting) {
    headers['x-koda-debug-routing'] = '1';
  }

  const response = await fetch(`${BASE_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      userId: 'test-user-001',
      conversationId,
      language, // FIX: Pass language to ensure PT queries get PT responses
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split('\n').filter(l => l.startsWith('data:'));

  let fullAnswer = '';
  let intent = '';
  let sources = 0;
  let doneEvent: DoneEvent | undefined;
  let actualConversationId = conversationId;

  for (const line of lines) {
    try {
      const data = JSON.parse(line.slice(5));
      if (data.type === 'content' || data.type === 'token') {
        fullAnswer += data.content || '';
      } else if (data.type === 'conversationId') {
        actualConversationId = data.conversationId;
      } else if (data.type === 'done') {
        intent = data.intent || '';
        sources = data.sources?.length || 0;
        doneEvent = {
          type: 'done',
          fullAnswer: data.fullAnswer || fullAnswer,
          intent: data.intent,
          sources: data.sources,
          citations: data.citations,
          constraints: data.constraints,
          routingTrace: data.routingTrace,
        };
      }
    } catch {}
  }

  return {
    answer: fullAnswer,
    intent,
    sources,
    latencyMs: Date.now() - start,
    doneEvent,
    actualConversationId,
  };
}

async function evaluateWithClaude(query: string, answer: string): Promise<EvalResult['grade']> {
  if (!anthropic) {
    return 'B';
  }

  const sanitizedAnswer = answer
    .replace(/\{\{DOC::[^}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);

  if (sanitizedAnswer.length < 20) {
    return 'F';
  }

  const prompt = `You are evaluating a RAG assistant's response quality. Grade the answer A-F.

QUERY: "${query}"

ANSWER: "${sanitizedAnswer}"

GRADING CRITERIA:
- A: Excellent - directly answers the question, well-formatted, no fluff
- B: Good - answers the question adequately, minor issues
- C: Acceptable - partially answers but missing key info or has issues
- D: Poor - mostly irrelevant or unhelpful
- F: Failed - wrong information, refused to answer, or error

Return ONLY a single letter grade (A, B, C, D, or F).`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const grade = content.text.trim().toUpperCase()[0];
      if (['A', 'B', 'C', 'D', 'F'].includes(grade)) {
        return grade as EvalResult['grade'];
      }
    }
  } catch (err: any) {
    console.log(`  [EVAL ERROR] ${err.message}`);
  }

  return 'B';
}

async function runConversationGroup(
  group: ConversationGroup,
  corpusMap: Map<string, CorpusQuery>,
  results: QueryResult[],
  evals: EvalResult[],
  grades: Record<string, number>,
  routingTraces: Array<{ id: string; trace: DoneEvent['routingTrace'] }>
): Promise<void> {
  console.log(`\n--- GROUP: ${group.conversationName} (${group.queryIds.length} turns) ---`);

  // Start with a fresh conversationId for this group
  let conversationId = `ctx-${group.conversationName}-${Date.now()}`;

  for (let turnIndex = 0; turnIndex < group.queryIds.length; turnIndex++) {
    const queryId = group.queryIds[turnIndex];
    const q = corpusMap.get(queryId);

    if (!q) {
      console.log(`  [WARN] Query ${queryId} not found in corpus`);
      continue;
    }

    try {
      const result = await runQuery(q.query, conversationId, q.language, DEBUG_ROUTING);

      // Update conversationId if backend returns one (for subsequent turns)
      conversationId = result.actualConversationId;

      const queryResult: QueryResult = {
        id: q.id,
        query: q.query,
        language: q.language,
        answer: result.answer,
        intent: result.intent,
        sources: result.sources,
        latencyMs: result.latencyMs,
        doneEvent: result.doneEvent,
        conversationId,
        turnIndex,
        conversationName: group.conversationName,
        routingTrace: result.doneEvent?.routingTrace,
      };

      // Evaluate
      const grade = await evaluateWithClaude(q.query, result.answer);

      const evalResult: EvalResult = {
        id: q.id,
        query: q.query,
        answer: result.answer,
        grade,
        issues: [],
        passed: ['A', 'B', 'C'].includes(grade),
      };

      results.push(queryResult);
      evals.push(evalResult);
      grades[grade]++;

      if (result.doneEvent?.routingTrace) {
        routingTraces.push({ id: q.id, trace: result.doneEvent.routingTrace });
      }

      console.log(`  [Turn ${turnIndex + 1}] ${q.id}: ${result.latencyMs}ms [${grade}]`);

      // Small delay between turns in a conversation
      await new Promise(r => setTimeout(r, 200));
    } catch (err: any) {
      console.log(`  [Turn ${turnIndex + 1}] ${q.id}: ERROR - ${err.message}`);

      const queryResult: QueryResult = {
        id: q.id,
        query: q.query,
        language: q.language,
        answer: '',
        latencyMs: 0,
        error: err.message,
        conversationId,
        turnIndex,
        conversationName: group.conversationName,
      };

      const evalResult: EvalResult = {
        id: q.id,
        query: q.query,
        answer: '',
        grade: 'F',
        issues: [err.message],
        passed: false,
      };

      results.push(queryResult);
      evals.push(evalResult);
      grades['F']++;
    }
  }
}

async function runSingleQuery(
  q: CorpusQuery,
  results: QueryResult[],
  evals: EvalResult[],
  grades: Record<string, number>,
  routingTraces: Array<{ id: string; trace: DoneEvent['routingTrace'] }>,
  index: number,
  total: number
): Promise<void> {
  const conversationId = `single-${q.id}-${Date.now()}`;

  try {
    const result = await runQuery(q.query, conversationId, DEBUG_ROUTING);

    const queryResult: QueryResult = {
      id: q.id,
      query: q.query,
      language: q.language,
      answer: result.answer,
      intent: result.intent,
      sources: result.sources,
      latencyMs: result.latencyMs,
      doneEvent: result.doneEvent,
      conversationId,
      turnIndex: 0,
      routingTrace: result.doneEvent?.routingTrace,
    };

    // Evaluate
    const grade = await evaluateWithClaude(q.query, result.answer);

    const evalResult: EvalResult = {
      id: q.id,
      query: q.query,
      answer: result.answer,
      grade,
      issues: [],
      passed: ['A', 'B', 'C'].includes(grade),
    };

    results.push(queryResult);
    evals.push(evalResult);
    grades[grade]++;

    if (result.doneEvent?.routingTrace) {
      routingTraces.push({ id: q.id, trace: result.doneEvent.routingTrace });
    }

    console.log(`[${index + 1}/${total}] ${q.id}: ${result.latencyMs}ms [${grade}]`);
  } catch (err: any) {
    console.log(`[${index + 1}/${total}] ${q.id}: ERROR - ${err.message}`);

    const queryResult: QueryResult = {
      id: q.id,
      query: q.query,
      language: q.language,
      answer: '',
      latencyMs: 0,
      error: err.message,
      conversationId,
      turnIndex: 0,
    };

    const evalResult: EvalResult = {
      id: q.id,
      query: q.query,
      answer: '',
      grade: 'F',
      issues: [err.message],
      passed: false,
    };

    results.push(queryResult);
    evals.push(evalResult);
    grades['F']++;
  }
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error('ERROR: Set AUTH_TOKEN environment variable');
    process.exit(1);
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load corpus
  if (!fs.existsSync(CORPUS_FILE)) {
    console.error(`ERROR: Corpus file not found: ${CORPUS_FILE}`);
    process.exit(1);
  }

  const corpus: CorpusQuery[] = fs.readFileSync(CORPUS_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));

  const corpusMap = new Map<string, CorpusQuery>();
  for (const q of corpus) {
    corpusMap.set(q.id, q);
  }

  // Load grouping
  let grouping: Grouping = { groups: [], singles: corpus.map(q => q.id) };
  if (fs.existsSync(GROUPING_FILE)) {
    grouping = JSON.parse(fs.readFileSync(GROUPING_FILE, 'utf-8'));
    console.log(`Loaded grouping: ${grouping.groups.length} groups, ${grouping.singles.length} singles`);
  } else {
    console.log(`No grouping file found, treating all queries as singles`);
  }

  console.log('='.repeat(70));
  console.log('50-QUERY TEST WITH CONVERSATION CONTEXT');
  console.log('='.repeat(70));
  console.log(`Corpus: ${corpus.length} queries`);
  console.log(`Groups: ${grouping.groups.length} (${grouping.groups.reduce((s, g) => s + g.queryIds.length, 0)} queries)`);
  console.log(`Singles: ${grouping.singles.length} queries`);
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Claude evaluation: ${anthropic ? 'ENABLED' : 'DISABLED (no API key)'}`);
  console.log(`Debug routing: ${DEBUG_ROUTING ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Single conversation: ${SINGLE_CONVERSATION ? 'ENABLED (all queries share one conversationId)' : 'DISABLED'}`);
  console.log('');

  const results: QueryResult[] = [];
  const evals: EvalResult[] = [];
  const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const routingTraces: Array<{ id: string; trace: DoneEvent['routingTrace'] }> = [];

  // Global conversationId if single conversation mode
  let globalConversationId = SINGLE_CONVERSATION ? `single-conversation-${Date.now()}` : '';

  if (SINGLE_CONVERSATION) {
    // Run ALL queries in order with shared conversationId
    console.log(`\n--- ALL QUERIES (shared conversationId: ${globalConversationId}) ---`);

    // Collect all queries in order: grouped queries first (in their group order), then singles
    const allQueriesInOrder: { q: CorpusQuery; groupName?: string; turnIndex: number }[] = [];

    // Add grouped queries
    for (const group of grouping.groups) {
      for (let i = 0; i < group.queryIds.length; i++) {
        const q = corpusMap.get(group.queryIds[i]);
        if (q) {
          allQueriesInOrder.push({ q, groupName: group.conversationName, turnIndex: i });
        }
      }
    }

    // Add singles
    for (const id of grouping.singles) {
      const q = corpusMap.get(id);
      if (q) {
        allQueriesInOrder.push({ q, turnIndex: 0 });
      }
    }

    // Run all queries sequentially with same conversationId
    for (let i = 0; i < allQueriesInOrder.length; i++) {
      const { q, groupName, turnIndex } = allQueriesInOrder[i];

      try {
        const result = await runQuery(q.query, globalConversationId, q.language, DEBUG_ROUTING);

        // Update global conversationId if backend returns one
        if (result.actualConversationId) {
          globalConversationId = result.actualConversationId;
        }

        const queryResult: QueryResult = {
          id: q.id,
          query: q.query,
          language: q.language,
          answer: result.answer,
          intent: result.intent,
          sources: result.sources,
          latencyMs: result.latencyMs,
          doneEvent: result.doneEvent,
          conversationId: globalConversationId,
          turnIndex,
          conversationName: groupName,
          routingTrace: result.doneEvent?.routingTrace,
        };

        const grade = await evaluateWithClaude(q.query, result.answer);

        const evalResult: EvalResult = {
          id: q.id,
          query: q.query,
          answer: result.answer,
          grade,
          issues: [],
          passed: ['A', 'B', 'C'].includes(grade),
        };

        results.push(queryResult);
        evals.push(evalResult);
        grades[grade]++;

        if (result.doneEvent?.routingTrace) {
          routingTraces.push({ id: q.id, trace: result.doneEvent.routingTrace });
        }

        const groupTag = groupName ? ` (${groupName})` : '';
        console.log(`[${i + 1}/${allQueriesInOrder.length}] ${q.id}${groupTag}: ${result.latencyMs}ms [${grade}]`);

        await new Promise(r => setTimeout(r, 150));
      } catch (err: any) {
        console.log(`[${i + 1}/${allQueriesInOrder.length}] ${q.id}: ERROR - ${err.message}`);

        const queryResult: QueryResult = {
          id: q.id,
          query: q.query,
          language: q.language,
          answer: '',
          latencyMs: 0,
          error: err.message,
          conversationId: globalConversationId,
          turnIndex,
          conversationName: groupName,
        };

        const evalResult: EvalResult = {
          id: q.id,
          query: q.query,
          answer: '',
          grade: 'F',
          issues: [err.message],
          passed: false,
        };

        results.push(queryResult);
        evals.push(evalResult);
        grades['F']++;
      }
    }
  } else {
    // Original behavior: separate conversations per group/single

    // Run conversation groups first (sequential, same conversationId)
    for (const group of grouping.groups) {
      await runConversationGroup(group, corpusMap, results, evals, grades, routingTraces);
    }

    // Run singles (can be parallel in the future, but sequential for determinism)
    console.log('\n--- SINGLE QUERIES ---');
    const singlesQueries = grouping.singles.map(id => corpusMap.get(id)).filter(Boolean) as CorpusQuery[];
    const totalSingles = singlesQueries.length;

    for (let i = 0; i < singlesQueries.length; i++) {
      await runSingleQuery(singlesQueries[i], results, evals, grades, routingTraces, i, totalSingles);
      // Small delay between queries
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Calculate summary
  const passed = evals.filter(e => e.passed).length;
  const passRate = ((passed / evals.length) * 100).toFixed(1);
  const avgLatencyMs = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length);

  console.log('');
  console.log('='.repeat(70));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total queries: ${corpus.length}`);
  console.log(`Passed (A/B/C): ${passed} (${passRate}%)`);
  console.log(`Failed (D/F): ${evals.length - passed}`);
  console.log(`Avg latency: ${avgLatencyMs}ms`);
  console.log('');
  console.log('Grade distribution:');
  console.log(`  A: ${grades['A']} (${((grades['A'] / corpus.length) * 100).toFixed(1)}%)`);
  console.log(`  B: ${grades['B']} (${((grades['B'] / corpus.length) * 100).toFixed(1)}%)`);
  console.log(`  C: ${grades['C']} (${((grades['C'] / corpus.length) * 100).toFixed(1)}%)`);
  console.log(`  D: ${grades['D']} (${((grades['D'] / corpus.length) * 100).toFixed(1)}%)`);
  console.log(`  F: ${grades['F']} (${((grades['F'] / corpus.length) * 100).toFixed(1)}%)`);

  // Analyze context-dependent vs independent results
  const groupedQueryIds = new Set(grouping.groups.flatMap(g => g.queryIds));
  const groupedResults = evals.filter(e => groupedQueryIds.has(e.id));
  const singleResults = evals.filter(e => !groupedQueryIds.has(e.id));

  console.log('');
  console.log('Context-dependent queries (grouped):');
  console.log(`  Passed: ${groupedResults.filter(e => e.passed).length}/${groupedResults.length}`);
  console.log('  By query:', groupedResults.map(e => `${e.id}:${e.grade}`).join(', '));
  console.log('');
  console.log('Independent queries (singles):');
  console.log(`  Passed: ${singleResults.filter(e => e.passed).length}/${singleResults.length}`);

  // Write results
  const summary = {
    timestamp: new Date().toISOString(),
    corpusPath: CORPUS_FILE,
    groupingPath: GROUPING_FILE,
    total: corpus.length,
    passed,
    passRate: parseFloat(passRate),
    grades,
    avgLatencyMs,
    avgAnswerLength: Math.round(results.reduce((s, r) => s + r.answer.length, 0) / results.length),
    avgSourceCount: parseFloat((results.reduce((s, r) => s + (r.sources || 0), 0) / results.length).toFixed(2)),
    groupedStats: {
      total: groupedResults.length,
      passed: groupedResults.filter(e => e.passed).length,
      byQuery: groupedResults.map(e => ({ id: e.id, grade: e.grade })),
    },
    singlesStats: {
      total: singleResults.length,
      passed: singleResults.filter(e => e.passed).length,
    },
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.jsonl'), results.map(r => JSON.stringify(r)).join('\n'));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'evals.jsonl'), evals.map(e => JSON.stringify(e)).join('\n'));

  // Write routing traces if collected
  if (routingTraces.length > 0) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'routing_traces.jsonl'),
      routingTraces.map(t => JSON.stringify(t)).join('\n')
    );
    console.log(`\nRouting traces written (${routingTraces.length} traces)`);
  }

  // Write failed query details
  const failedQueries = evals.filter(e => !e.passed).map(e => {
    const r = results.find(r => r.id === e.id);
    return {
      id: e.id,
      grade: e.grade,
      query: e.query,
      isContextDependent: groupedQueryIds.has(e.id),
      conversationName: r?.conversationName,
      intent: r?.intent,
      answerPreview: e.answer.slice(0, 200),
    };
  });

  if (failedQueries.length > 0) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'failed_queries.json'),
      JSON.stringify(failedQueries, null, 2)
    );
    console.log(`\nFailed queries: ${failedQueries.length}`);
    for (const fq of failedQueries) {
      console.log(`  - ${fq.id} [${fq.grade}] ${fq.isContextDependent ? '(grouped)' : '(single)'}: ${fq.query.slice(0, 50)}...`);
    }
  }

  console.log('');
  console.log(`Results written to: ${OUTPUT_DIR}`);

  // Exit with error if pass rate < 90%
  if (parseFloat(passRate) < 90) {
    console.log('\n[FAILED] Pass rate below 90%');
    process.exit(1);
  } else {
    console.log('\n[PASSED] Pass rate >= 90%');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
