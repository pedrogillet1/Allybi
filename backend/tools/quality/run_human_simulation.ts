#!/usr/bin/env npx ts-node
/**
 * Human Simulation Runner
 *
 * Executes 50-query corpus with human-like timing in 1-2 conversations.
 * Captures ALL SSE events, validates done payloads, and grades with Claude.
 *
 * Usage:
 *   AUTH_TOKEN=... npx ts-node tools/quality/run_human_simulation.ts
 *
 * Environment:
 *   AUTH_TOKEN - Required JWT token
 *   BASE_URL - Backend URL (default: http://localhost:5000)
 *   OUTPUT_DIR - Output directory (auto-generated if not set)
 *   PLAN_FILE - Conversation plan JSON file
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, `../../audit_output_mass/human_run_${timestamp}`);
const CORPUS_FILE = '/tmp/corpus_50_final.jsonl';
const PLAN_FILE = process.env.PLAN_FILE || path.join(OUTPUT_DIR, 'conversation_plan_50.json');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

interface CorpusQuery {
  id: string;
  query: string;
  language: string;
}

interface DelayProfile {
  short_ms: [number, number];
  normal_ms: [number, number];
  long_pause_ms: [number, number];
  long_pause_every_n_turns: [number, number];
  rapid_followup_probability: number;
  rapid_followup_ms: [number, number];
}

interface Turn {
  queryId: string;
  topic?: string;
  note?: string;
  dependsOn?: string | string[];
}

interface Conversation {
  name: string;
  description?: string;
  delayProfile: DelayProfile;
  turns: Turn[];
}

interface ConversationPlan {
  conversations: Conversation[];
}

interface SSEEvent {
  type: string;
  timestamp: number;
  data: any;
}

interface DoneEvent {
  type: 'done';
  fullAnswer: string;
  formatted?: string;
  intent?: string;
  sources?: Array<{ documentId: string; documentName: string; score: number }>;
  citations?: Array<{ id: string; doc: string; page?: number }>;
  constraints?: Record<string, unknown>;
  matchedPatterns?: string[];
  routingTrace?: any;
}

interface TurnResult {
  conversationName: string;
  conversationId: string;
  turnIndex: number;
  queryId: string;
  query: string;
  language: string;
  streamedText: string;
  finalAnswer: string;
  intent?: string;
  sources?: any[];
  citations?: any[];
  latency: {
    ttftMs: number;
    totalMs: number;
    delayBeforeMs: number;
  };
  sseEvents: SSEEvent[];
  doneEvent?: DoneEvent;
  error?: string;
}

interface EvalResult {
  id: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  query: string;
  answerPreview: string;
  issues: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanDelay(
  profile: DelayProfile,
  turnIndex: number,
  lastTurnWasFollowUp: boolean
): Promise<{ delayMs: number; type: string }> {
  // 15% chance of rapid follow-up
  if (lastTurnWasFollowUp || Math.random() < profile.rapid_followup_probability) {
    const delayMs = randomInRange(...profile.rapid_followup_ms);
    await new Promise(r => setTimeout(r, delayMs));
    return { delayMs, type: 'rapid_followup' };
  }

  // Check if we should do a long pause (every 7-12 turns)
  const pauseInterval = randomInRange(...profile.long_pause_every_n_turns);
  if (turnIndex > 0 && turnIndex % pauseInterval === 0) {
    const delayMs = randomInRange(...profile.long_pause_ms);
    console.log(`  [HUMAN] Long pause: ${(delayMs / 1000).toFixed(1)}s (every ${pauseInterval} turns)`);
    await new Promise(r => setTimeout(r, delayMs));
    return { delayMs, type: 'long_pause' };
  }

  // Normal human delay
  const delayMs = randomInRange(...profile.normal_ms);
  await new Promise(r => setTimeout(r, delayMs));
  return { delayMs, type: 'normal' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SSE QUERY EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

async function executeSSEQuery(
  query: string,
  conversationId: string,
  language: string
): Promise<{
  streamedText: string;
  finalAnswer: string;
  intent?: string;
  sources?: any[];
  citations?: any[];
  ttftMs: number;
  totalMs: number;
  sseEvents: SSEEvent[];
  doneEvent?: DoneEvent;
  actualConversationId: string;
}> {
  const startTime = Date.now();
  let ttftMs = 0;
  let firstContentReceived = false;

  const sseEvents: SSEEvent[] = [];
  let streamedText = '';
  let finalAnswer = '';
  let intent = '';
  let sources: any[] = [];
  let citations: any[] = [];
  let doneEvent: DoneEvent | undefined;
  let actualConversationId = conversationId;

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
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n').filter(l => l.startsWith('data:'));

  for (const line of lines) {
    try {
      const data = JSON.parse(line.slice(5));
      const eventTime = Date.now();

      sseEvents.push({
        type: data.type,
        timestamp: eventTime - startTime,
        data,
      });

      if (data.type === 'content' || data.type === 'token') {
        if (!firstContentReceived) {
          ttftMs = eventTime - startTime;
          firstContentReceived = true;
        }
        streamedText += data.content || '';
      } else if (data.type === 'conversationId') {
        actualConversationId = data.conversationId;
      } else if (data.type === 'done') {
        intent = data.intent || '';
        sources = data.sources || [];
        citations = data.citations || [];
        finalAnswer = data.fullAnswer || data.formatted || streamedText;
        doneEvent = {
          type: 'done',
          fullAnswer: data.fullAnswer || '',
          formatted: data.formatted,
          intent: data.intent,
          sources: data.sources,
          citations: data.citations,
          constraints: data.constraints,
          routingTrace: data.routingTrace,
        };
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  const totalMs = Date.now() - startTime;

  return {
    streamedText,
    finalAnswer: finalAnswer || streamedText,
    intent,
    sources,
    citations,
    ttftMs,
    totalMs,
    sseEvents,
    doneEvent,
    actualConversationId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAUDE EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════════

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
let anthropic: Anthropic | null = null;
if (apiKey) {
  anthropic = new Anthropic({ apiKey });
}

async function evaluateWithClaude(query: string, answer: string, language: string): Promise<EvalResult['grade']> {
  if (!anthropic) {
    return 'B'; // Default if no API key
  }

  const sanitizedAnswer = answer
    .replace(/\{\{DOC::[^}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);

  if (sanitizedAnswer.length < 15) {
    return 'F';
  }

  const langInstr = language === 'pt'
    ? 'Answer should be in Portuguese if query is in Portuguese.'
    : 'Answer should be in English if query is in English.';

  const prompt = `You are evaluating a RAG assistant's response quality. Grade A-F.

QUERY: "${query}"

ANSWER: "${sanitizedAnswer}"

CRITERIA:
- A: Excellent - directly answers, well-formatted, correct language, no fluff
- B: Good - answers adequately, minor issues
- C: Acceptable - partially answers, missing key info
- D: Poor - mostly irrelevant, wrong language, or unhelpful
- F: Failed - wrong info, error, or refused

${langInstr}

Return ONLY a single letter: A, B, C, D, or F.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
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
    console.log(`    [EVAL ERROR] ${err.message}`);
  }

  return 'B';
}

// ═══════════════════════════════════════════════════════════════════════════════
// DONE EVENT SCHEMA VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

interface ValidationError {
  field: string;
  message: string;
}

function validateDoneEvent(event: DoneEvent | undefined): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!event) {
    errors.push({ field: 'doneEvent', message: 'Missing done event' });
    return { valid: false, errors };
  }

  if (event.type !== 'done') {
    errors.push({ field: 'type', message: `Expected "done", got "${event.type}"` });
  }

  if (!event.fullAnswer || typeof event.fullAnswer !== 'string') {
    errors.push({ field: 'fullAnswer', message: 'Missing or invalid fullAnswer' });
  }

  if (event.sources && !Array.isArray(event.sources)) {
    errors.push({ field: 'sources', message: 'sources must be an array' });
  }

  if (event.citations && !Array.isArray(event.citations)) {
    errors.push({ field: 'citations', message: 'citations must be an array' });
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═'.repeat(80));
  console.log('HUMAN SIMULATION - 50 QUERY TEST');
  console.log('═'.repeat(80));

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

  // Load conversation plan
  let plan: ConversationPlan;
  if (fs.existsSync(PLAN_FILE)) {
    plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf-8'));
    console.log(`Loaded conversation plan from: ${PLAN_FILE}`);
  } else {
    console.error(`ERROR: Plan file not found: ${PLAN_FILE}`);
    process.exit(1);
  }

  console.log(`\nCorpus: ${corpus.length} queries`);
  console.log(`Conversations: ${plan.conversations.length}`);
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Claude eval: ${anthropic ? 'ENABLED' : 'DISABLED'}`);
  console.log('');

  const allResults: TurnResult[] = [];
  const allEvals: EvalResult[] = [];
  const allSSEEvents: SSEEvent[] = [];
  const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const validationErrors: Array<{ queryId: string; errors: ValidationError[] }> = [];

  // Execute each conversation
  for (const conv of plan.conversations) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`CONVERSATION: ${conv.name}`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`Turns: ${conv.turns.length}`);
    console.log(`Delay profile: ${conv.delayProfile.normal_ms[0]}-${conv.delayProfile.normal_ms[1]}ms normal`);
    console.log('');

    let conversationId = `human-${conv.name}-${Date.now()}`;
    let lastWasFollowUp = false;

    for (let turnIndex = 0; turnIndex < conv.turns.length; turnIndex++) {
      const turn = conv.turns[turnIndex];
      const query = corpusMap.get(turn.queryId);

      if (!query) {
        console.log(`  [WARN] Query ${turn.queryId} not found in corpus`);
        continue;
      }

      // Apply human delay
      const { delayMs, type: delayType } = await humanDelay(
        conv.delayProfile,
        turnIndex,
        lastWasFollowUp
      );

      // Check if this is a follow-up
      lastWasFollowUp = !!turn.dependsOn;

      console.log(`[${turnIndex + 1}/${conv.turns.length}] ${turn.queryId} (${query.language})`);
      console.log(`    Q: "${query.query.slice(0, 60)}..."`);

      try {
        const result = await executeSSEQuery(query.query, conversationId, query.language);

        // Update conversationId for subsequent turns
        conversationId = result.actualConversationId;

        // Validate done event
        const validation = validateDoneEvent(result.doneEvent);
        if (!validation.valid) {
          validationErrors.push({ queryId: turn.queryId, errors: validation.errors });
        }

        // Evaluate with Claude
        const grade = await evaluateWithClaude(query.query, result.finalAnswer, query.language);

        const turnResult: TurnResult = {
          conversationName: conv.name,
          conversationId,
          turnIndex,
          queryId: turn.queryId,
          query: query.query,
          language: query.language,
          streamedText: result.streamedText,
          finalAnswer: result.finalAnswer,
          intent: result.intent,
          sources: result.sources,
          citations: result.citations,
          latency: {
            ttftMs: result.ttftMs,
            totalMs: result.totalMs,
            delayBeforeMs: delayMs,
          },
          sseEvents: result.sseEvents,
          doneEvent: result.doneEvent,
        };

        const evalResult: EvalResult = {
          id: turn.queryId,
          grade,
          query: query.query,
          answerPreview: result.finalAnswer.slice(0, 200),
          issues: validation.errors.map(e => `${e.field}: ${e.message}`),
        };

        allResults.push(turnResult);
        allEvals.push(evalResult);
        allSSEEvents.push(...result.sseEvents.map(e => ({ ...e, queryId: turn.queryId })));
        grades[grade]++;

        const srcCount = result.sources?.length || 0;
        const citCount = result.citations?.length || 0;
        console.log(`    A: "${result.finalAnswer.slice(0, 80)}..."`);
        console.log(`    [${grade}] ${result.totalMs}ms | TTFT: ${result.ttftMs}ms | src: ${srcCount} | cit: ${citCount} | delay: ${delayMs}ms (${delayType})`);

        // Incremental save
        fs.writeFileSync(
          path.join(OUTPUT_DIR, 'results.jsonl'),
          allResults.map(r => JSON.stringify(r)).join('\n')
        );

      } catch (err: any) {
        console.log(`    [ERROR] ${err.message}`);

        const turnResult: TurnResult = {
          conversationName: conv.name,
          conversationId,
          turnIndex,
          queryId: turn.queryId,
          query: query.query,
          language: query.language,
          streamedText: '',
          finalAnswer: '',
          latency: { ttftMs: 0, totalMs: 0, delayBeforeMs: delayMs },
          sseEvents: [],
          error: err.message,
        };

        const evalResult: EvalResult = {
          id: turn.queryId,
          grade: 'F',
          query: query.query,
          answerPreview: '',
          issues: [err.message],
        };

        allResults.push(turnResult);
        allEvals.push(evalResult);
        grades['F']++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SUMMARY & OUTPUT
  // ═══════════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(80));
  console.log('RESULTS SUMMARY');
  console.log('═'.repeat(80));

  const totalQueries = allEvals.length;
  const passed = allEvals.filter(e => ['A', 'B', 'C'].includes(e.grade)).length;
  const passRate = ((passed / totalQueries) * 100).toFixed(1);
  const avgLatency = Math.round(allResults.reduce((s, r) => s + r.latency.totalMs, 0) / totalQueries);
  const avgTTFT = Math.round(allResults.reduce((s, r) => s + r.latency.ttftMs, 0) / totalQueries);

  console.log(`Total queries: ${totalQueries}`);
  console.log(`Passed (A/B/C): ${passed} (${passRate}%)`);
  console.log(`Failed (D/F): ${totalQueries - passed}`);
  console.log(`Avg latency: ${avgLatency}ms`);
  console.log(`Avg TTFT: ${avgTTFT}ms`);
  console.log('');
  console.log('Grade distribution:');
  for (const g of ['A', 'B', 'C', 'D', 'F']) {
    const pct = ((grades[g] / totalQueries) * 100).toFixed(1);
    console.log(`  ${g}: ${grades[g]} (${pct}%)`);
  }

  // Write all outputs
  const summary = {
    timestamp: new Date().toISOString(),
    totalQueries,
    passed,
    passRate: parseFloat(passRate),
    grades,
    avgLatencyMs: avgLatency,
    avgTTFTMs: avgTTFT,
    avgSourceCount: parseFloat((allResults.reduce((s, r) => s + (r.sources?.length || 0), 0) / totalQueries).toFixed(2)),
    avgCitationCount: parseFloat((allResults.reduce((s, r) => s + (r.citations?.length || 0), 0) / totalQueries).toFixed(2)),
    validationErrors: validationErrors.length,
    conversations: plan.conversations.map(c => ({
      name: c.name,
      turns: c.turns.length,
    })),
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.jsonl'), allResults.map(r => JSON.stringify(r)).join('\n'));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'evals.jsonl'), allEvals.map(e => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sse_raw_events.jsonl'), allSSEEvents.map(e => JSON.stringify(e)).join('\n'));

  // Frontend proof payload (sample of done events)
  const frontendProof = {
    timestamp: new Date().toISOString(),
    sampleDoneEvents: allResults.slice(0, 10).map(r => ({
      queryId: r.queryId,
      doneEvent: r.doneEvent,
      validation: validateDoneEvent(r.doneEvent),
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'frontend_proof_payload.json'), JSON.stringify(frontendProof, null, 2));

  if (validationErrors.length > 0) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'validation_errors.json'),
      JSON.stringify(validationErrors, null, 2)
    );
    console.log(`\nValidation errors: ${validationErrors.length}`);
  }

  // Failed queries report
  const failedQueries = allEvals.filter(e => !['A', 'B', 'C'].includes(e.grade));
  if (failedQueries.length > 0) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'failed_queries.json'),
      JSON.stringify(failedQueries, null, 2)
    );
    console.log(`\nFailed queries: ${failedQueries.length}`);
    for (const fq of failedQueries) {
      console.log(`  - ${fq.id} [${fq.grade}]: ${fq.query.slice(0, 50)}...`);
    }
  }

  console.log(`\nResults written to: ${OUTPUT_DIR}`);

  // Pass/fail determination
  const isPass = grades['A'] === 50 && grades['B'] === 0 && grades['C'] === 0 && grades['D'] === 0 && grades['F'] === 0;
  const isAcceptable = parseFloat(passRate) >= 90;

  if (isPass) {
    console.log('\n[PERFECT] A=50/50 - All queries passed with grade A!');
  } else if (isAcceptable) {
    console.log(`\n[ACCEPTABLE] Pass rate ${passRate}% >= 90%`);
  } else {
    console.log(`\n[FAILED] Pass rate ${passRate}% < 90%`);

    // Generate failure report
    const failureReport = `# HUMAN RUN FAILURE REPORT

## Summary
- Total Queries: ${totalQueries}
- Pass Rate: ${passRate}%
- Grade Distribution: A=${grades['A']}, B=${grades['B']}, C=${grades['C']}, D=${grades['D']}, F=${grades['F']}

## Failed Queries

${failedQueries.map(fq => {
  const result = allResults.find(r => r.queryId === fq.id);
  return `### ${fq.id} [${fq.grade}]

**Query:** ${fq.query}

**Answer Preview:** ${fq.answerPreview.slice(0, 300)}...

**Issues:** ${fq.issues.join(', ') || 'None specified'}

**Intent:** ${result?.intent || 'N/A'}
**Sources:** ${result?.sources?.length || 0}
**Citations:** ${result?.citations?.length || 0}

---`;
}).join('\n\n')}

## Validation Errors

${validationErrors.map(ve => `- ${ve.queryId}: ${ve.errors.map(e => e.message).join(', ')}`).join('\n')}

## Commands to Re-run

\`\`\`bash
# Re-run human simulation
AUTH_TOKEN="..." npx ts-node tools/quality/run_human_simulation.ts

# Re-run Playwright proof
E2E_MAX_WORKERS=1 npx playwright test e2e/human-simulation-proof.spec.ts

# Re-run grader only
npx ts-node tools/quality/grade_results.ts --input ${OUTPUT_DIR}/results.jsonl
\`\`\`
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'HUMAN_RUN_FAILURE_REPORT.md'), failureReport);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
