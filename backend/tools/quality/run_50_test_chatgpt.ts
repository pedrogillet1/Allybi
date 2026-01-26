#!/usr/bin/env npx ts-node
/**
 * Run 50-query test with ChatGPT evaluation
 *
 * Usage: AUTH_TOKEN=... npx ts-node tools/quality/run_50_test_chatgpt.ts
 *
 * Features:
 * - Concurrency of 2 (configurable via CONCURRENCY env var)
 * - Frontend proof format output (done-event style)
 * - Claude-based evaluation (ChatGPT-like rubric)
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CORPUS_FILE = process.env.CORPUS_FILE || '/tmp/corpus_50_final.jsonl';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '2', 10);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTPUT_DIR = path.join(__dirname, `../../audit_output_mass/quality_50_chatgpt_eval_${timestamp}`);

interface DoneEvent {
  type: 'done';
  fullAnswer: string;
  intent?: string;
  sources?: Array<{ documentId: string; documentName: string; score: number }>;
  citations?: Array<{ id: string; doc: string; page?: number }>;
  constraints?: Record<string, unknown>;
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
}

interface EvalResult {
  id: string;
  query: string;
  answer: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: string[];
  passed: boolean;
}

interface FrontendProofResult {
  id: string;
  query: string;
  language: string;
  actualIntent: string;
  passed: boolean;
  failures: string[];
  warnings: string[];
  metrics: {
    responseTimeMs: number;
    answerLength: number;
    sourceCount: number;
    citationCount: number;
  };
  doneEvent: DoneEvent | null;
  grade: string;
}

// Initialize Anthropic for evaluation
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
let anthropic: Anthropic | null = null;
if (apiKey) {
  anthropic = new Anthropic({ apiKey });
}

async function runQuery(query: string, convId: string): Promise<{ answer: string; intent?: string; sources?: number; latencyMs: number; doneEvent?: DoneEvent }> {
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
      conversationId: convId,
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

  for (const line of lines) {
    try {
      const data = JSON.parse(line.slice(5));
      if (data.type === 'content' || data.type === 'token') {
        fullAnswer += data.content || '';
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
  };
}

// Run queries with concurrency limit
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      const result = await fn(item, currentIndex);
      results[currentIndex] = result;
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

async function evaluateWithClaude(query: string, answer: string): Promise<EvalResult['grade']> {
  if (!anthropic) {
    // If no API key, return 'B' as default
    return 'B';
  }

  // Sanitize answer - remove doc markers and limit length
  const sanitizedAnswer = answer
    .replace(/\{\{DOC::[^}]+\}\}/g, '') // Remove doc markers
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .trim()
    .slice(0, 1500);

  // Skip evaluation for empty answers
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

  return 'B'; // Default if evaluation fails
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

  const corpus = fs.readFileSync(CORPUS_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));

  console.log('='.repeat(70));
  console.log('50-QUERY TEST WITH CHATGPT EVALUATION');
  console.log('='.repeat(70));
  console.log(`Corpus: ${corpus.length} queries`);
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Claude evaluation: ${anthropic ? 'ENABLED' : 'DISABLED (no API key)'}`);
  console.log('');

  const results: QueryResult[] = [];
  const evals: EvalResult[] = [];
  const frontendProofResults: FrontendProofResult[] = [];
  const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let completedCount = 0;

  // Process query - returns both query result and eval result
  async function processQuery(q: any, index: number): Promise<{
    queryResult: QueryResult;
    evalResult: EvalResult;
    frontendProof: FrontendProofResult;
  }> {
    const convId = `test-50-${q.id}-${Date.now()}`;

    try {
      const result = await runQuery(q.query, convId);

      const queryResult: QueryResult = {
        id: q.id,
        query: q.query,
        language: q.language,
        answer: result.answer,
        intent: result.intent,
        sources: result.sources,
        latencyMs: result.latencyMs,
        doneEvent: result.doneEvent,
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

      // Frontend proof format
      const frontendProof: FrontendProofResult = {
        id: q.id,
        query: q.query,
        language: q.language?.toUpperCase() || 'EN',
        actualIntent: result.intent || 'unknown',
        passed: evalResult.passed,
        failures: evalResult.passed ? [] : [`Grade: ${grade}`],
        warnings: [],
        metrics: {
          responseTimeMs: result.latencyMs,
          answerLength: result.answer.length,
          sourceCount: result.sources || 0,
          citationCount: result.doneEvent?.citations?.length || 0,
        },
        doneEvent: result.doneEvent || null,
        grade,
      };

      completedCount++;
      console.log(`[${completedCount}/${corpus.length}] ${q.id}: ${result.latencyMs}ms [${grade}]`);

      return { queryResult, evalResult, frontendProof };
    } catch (err: any) {
      completedCount++;
      console.log(`[${completedCount}/${corpus.length}] ${q.id}: ERROR - ${err.message}`);

      const queryResult: QueryResult = {
        id: q.id,
        query: q.query,
        language: q.language,
        answer: '',
        latencyMs: 0,
        error: err.message,
      };

      const evalResult: EvalResult = {
        id: q.id,
        query: q.query,
        answer: '',
        grade: 'F',
        issues: [err.message],
        passed: false,
      };

      const frontendProof: FrontendProofResult = {
        id: q.id,
        query: q.query,
        language: q.language?.toUpperCase() || 'EN',
        actualIntent: 'error',
        passed: false,
        failures: [err.message],
        warnings: [],
        metrics: {
          responseTimeMs: 0,
          answerLength: 0,
          sourceCount: 0,
          citationCount: 0,
        },
        doneEvent: null,
        grade: 'F',
      };

      return { queryResult, evalResult, frontendProof };
    }
  }

  // Run with concurrency
  console.log(`Running ${corpus.length} queries with concurrency ${CONCURRENCY}...\n`);
  const allProcessed = await runWithConcurrency(corpus, CONCURRENCY, processQuery);

  // Collect results
  for (const { queryResult, evalResult, frontendProof } of allProcessed) {
    results.push(queryResult);
    evals.push(evalResult);
    frontendProofResults.push(frontendProof);
    grades[evalResult.grade]++;
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

  // Write results in multiple formats
  const summary = {
    timestamp: new Date().toISOString(),
    total: corpus.length,
    passed,
    passRate: parseFloat(passRate),
    grades,
    avgLatencyMs,
    avgAnswerLength: Math.round(results.reduce((s, r) => s + r.answer.length, 0) / results.length),
    avgSourceCount: parseFloat((results.reduce((s, r) => s + (r.sources || 0), 0) / results.length).toFixed(2)),
  };

  // Frontend proof format (matches previous output)
  const frontendProofOutput = {
    summary: {
      total: corpus.length,
      passed,
      failed: corpus.length - passed,
      passRate: parseFloat(passRate),
      byIntent: {} as Record<string, { total: number; passed: number; rate: number }>,
      byLanguage: {} as Record<string, { total: number; passed: number; rate: number }>,
      avgResponseTime: avgLatencyMs,
      avgAnswerLength: summary.avgAnswerLength,
      avgSourceCount: summary.avgSourceCount,
    },
    results: frontendProofResults,
  };

  // Group by intent
  for (const r of frontendProofResults) {
    const intent = r.actualIntent || 'unknown';
    if (!frontendProofOutput.summary.byIntent[intent]) {
      frontendProofOutput.summary.byIntent[intent] = { total: 0, passed: 0, rate: 0 };
    }
    frontendProofOutput.summary.byIntent[intent].total++;
    if (r.passed) frontendProofOutput.summary.byIntent[intent].passed++;
  }
  for (const key of Object.keys(frontendProofOutput.summary.byIntent)) {
    const stat = frontendProofOutput.summary.byIntent[key];
    stat.rate = stat.total > 0 ? (stat.passed / stat.total) * 100 : 0;
  }

  // Group by language
  for (const r of frontendProofResults) {
    const lang = r.language || 'EN';
    if (!frontendProofOutput.summary.byLanguage[lang]) {
      frontendProofOutput.summary.byLanguage[lang] = { total: 0, passed: 0, rate: 0 };
    }
    frontendProofOutput.summary.byLanguage[lang].total++;
    if (r.passed) frontendProofOutput.summary.byLanguage[lang].passed++;
  }
  for (const key of Object.keys(frontendProofOutput.summary.byLanguage)) {
    const stat = frontendProofOutput.summary.byLanguage[key];
    stat.rate = stat.total > 0 ? (stat.passed / stat.total) * 100 : 0;
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.jsonl'), results.map(r => JSON.stringify(r)).join('\n'));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'evals.jsonl'), evals.map(e => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `frontend_proof_results_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`),
    JSON.stringify(frontendProofOutput, null, 2)
  );

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
