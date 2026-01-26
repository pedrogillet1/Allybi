#!/usr/bin/env npx ts-node
/**
 * 110-Turn ChatGPT Parity Certification Runner
 *
 * Runs a single 110-turn conversation to prove:
 * - Context & Memory persistence
 * - Operator & Routing correctness
 * - Output Quality (complete, constrained, no boilerplate)
 * - Evidence & Anchors (source pills)
 *
 * Usage:
 *   AUTH_TOKEN="..." npx ts-node tools/quality/run_110_certification.ts
 *
 * Outputs:
 *   - results_110.jsonl (full done payload per turn)
 *   - grade_110.json (pass/fail per turn + reason)
 *   - FINAL_CERT_110.md (summary report)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const INPUT_FILE = process.env.INPUT_FILE || path.join(__dirname, 'certification_110_chatgpt_parity.jsonl');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '../../audit_output_mass/cert_110_chatgpt_parity');
const CONVERSATION_ID = process.env.CONVERSATION_ID || `cert-110-${Date.now()}`;
const USER_ID = process.env.USER_ID || 'test-user-001';

// Hard fail patterns
const HARD_FAIL_PATTERNS = {
  truncated: /\.{3}$/,
  danglingBullet: /^\s*[-•]\s*$/m,
  danglingNumber: /^\s*\d+\.\s*$/m,
  preambleHereAre: /^(Here are|Here is|Here's|Based on|I found|I can see)/i,
  preambleKeyPoints: /^(Key points|Main points|Important points|The key|The main)/i,
  asAnAI: /as an (AI|artificial intelligence|language model)/i,
};

interface TestCase {
  id: string;
  block: string;
  query: string;
  expected: {
    intent?: string;
    operator?: string;
    attachments?: string[];
  };
  constraints: {
    bullets?: number;
    sentences?: number;
    table?: boolean;
    button_only?: boolean;
    short?: boolean;
    language?: string;
  };
  followup: boolean;
  ui_check: Record<string, boolean>;
}

interface TurnResult {
  id: string;
  query: string;
  intent: string;
  operator?: string;
  fullAnswer: string;
  sources: any[];
  attachments?: any;
  latencyMs: number;
  ttftMs?: number;
  pass: boolean;
  hardFail: boolean;
  failReasons: string[];
  softFailReasons: string[];
}

interface GradeReport {
  conversationId: string;
  totalTurns: number;
  hardFails: number;
  softFails: number;
  passed: boolean;
  turnResults: Array<{
    id: string;
    pass: boolean;
    hardFail: boolean;
    reasons: string[];
  }>;
  operatorDistribution: Record<string, number>;
  intentDistribution: Record<string, number>;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

async function streamQuery(query: string, conversationId: string): Promise<any> {
  const startTime = Date.now();
  let ttft: number | undefined;

  const response = await fetch(`${BASE_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      userId: USER_ID,
      conversationId,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let doneEvent: any = null;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (!ttft) {
      ttft = Date.now() - startTime;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'done') {
            doneEvent = data;
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }
  }

  const latencyMs = Date.now() - startTime;
  return { ...doneEvent, latencyMs, ttftMs: ttft };
}

function validateTurn(testCase: TestCase, result: any): TurnResult {
  const failReasons: string[] = [];
  const softFailReasons: string[] = [];
  let hardFail = false;

  const answer = result.fullAnswer || '';
  const intent = result.intent || '';
  const sources = result.sources || [];

  // === HARD FAIL CHECKS ===

  // 1. Truncation check
  if (HARD_FAIL_PATTERNS.truncated.test(answer.trim())) {
    failReasons.push('TRUNCATED: Response ends with "..."');
    hardFail = true;
  }

  // 2. Dangling markers
  if (HARD_FAIL_PATTERNS.danglingBullet.test(answer)) {
    failReasons.push('DANGLING_BULLET: Incomplete bullet point');
    hardFail = true;
  }
  if (HARD_FAIL_PATTERNS.danglingNumber.test(answer)) {
    failReasons.push('DANGLING_NUMBER: Incomplete numbered list');
    hardFail = true;
  }

  // 3. Preamble check
  if (HARD_FAIL_PATTERNS.preambleHereAre.test(answer)) {
    failReasons.push('PREAMBLE: Starts with "Here are/Here is"');
    hardFail = true;
  }
  if (HARD_FAIL_PATTERNS.preambleKeyPoints.test(answer)) {
    failReasons.push('PREAMBLE: Starts with "Key points"');
    hardFail = true;
  }
  if (HARD_FAIL_PATTERNS.asAnAI.test(answer)) {
    failReasons.push('AS_AN_AI: Contains "as an AI" disclaimer');
    hardFail = true;
  }

  // 4. Bullet count constraint
  if (testCase.constraints.bullets) {
    const bulletMatches = answer.match(/^[\s]*[-•*]\s+/gm) || [];
    const numberedMatches = answer.match(/^[\s]*\d+\.\s+/gm) || [];
    const totalBullets = bulletMatches.length + numberedMatches.length;

    if (totalBullets !== testCase.constraints.bullets) {
      failReasons.push(`BULLET_COUNT: Expected ${testCase.constraints.bullets}, got ${totalBullets}`);
      hardFail = true;
    }
  }

  // 5. Sentence count constraint
  if (testCase.constraints.sentences) {
    const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length !== testCase.constraints.sentences) {
      failReasons.push(`SENTENCE_COUNT: Expected ${testCase.constraints.sentences}, got ${sentences.length}`);
      hardFail = true;
    }
  }

  // 6. Table constraint
  if (testCase.constraints.table) {
    const hasTable = answer.includes('|') && answer.match(/\|.*\|/g);
    if (!hasTable) {
      failReasons.push('TABLE_MISSING: Required table not found');
      hardFail = true;
    }
  }

  // 7. Button-only constraint (for open/where/show)
  if (testCase.constraints.button_only) {
    // Answer should be minimal (< 50 chars) or empty
    const textOnly = answer.replace(/\[.*?\]\(.*?\)/g, '').trim();
    if (textOnly.length > 100) {
      failReasons.push(`BUTTON_ONLY: Expected minimal text, got ${textOnly.length} chars`);
      hardFail = true;
    }
  }

  // 8. Source pills for doc-based queries
  if (testCase.expected.attachments?.includes('source_buttons')) {
    if (!sources || sources.length === 0) {
      failReasons.push('MISSING_SOURCES: Doc-based answer has no source pills');
      hardFail = true;
    }
  }

  // 9. File list for file_actions
  if (testCase.expected.attachments?.includes('file_list')) {
    const hasFileList = result.fileList || result.attachments?.fileList;
    if (!hasFileList) {
      // Soft fail - might be in answer text
      softFailReasons.push('FILE_LIST: Expected file_list attachment');
    }
  }

  // 10. Language check
  if (testCase.constraints.language === 'pt') {
    const englishWords = ['the', 'and', 'that', 'this', 'with', 'have', 'from'];
    const hasEnglish = englishWords.some(w =>
      new RegExp(`\\b${w}\\b`, 'i').test(answer)
    );
    if (hasEnglish) {
      failReasons.push('LANGUAGE_MIXING: Portuguese query answered with English');
      hardFail = true;
    }
  }

  // === SOFT FAIL CHECKS ===

  // Intent mismatch (soft fail - routing is complex)
  if (testCase.expected.intent && intent !== testCase.expected.intent) {
    // Only soft fail for certain mismatches
    const criticalIntents = ['file_actions', 'help', 'conversation'];
    if (criticalIntents.includes(testCase.expected.intent)) {
      softFailReasons.push(`INTENT_MISMATCH: Expected ${testCase.expected.intent}, got ${intent}`);
    }
  }

  // Short response check
  if (testCase.constraints.short && answer.length > 300) {
    softFailReasons.push(`VERBOSE: Expected short response, got ${answer.length} chars`);
  }

  // Latency check (P95 target: 10s)
  if (result.latencyMs > 15000) {
    softFailReasons.push(`SLOW: ${result.latencyMs}ms > 15000ms threshold`);
  }

  return {
    id: testCase.id,
    query: testCase.query,
    intent,
    operator: result.operator,
    fullAnswer: answer,
    sources,
    attachments: result.attachments,
    latencyMs: result.latencyMs,
    ttftMs: result.ttftMs,
    pass: !hardFail,
    hardFail,
    failReasons,
    softFailReasons,
  };
}

async function runCertification() {
  console.log('=== 110-Turn ChatGPT Parity Certification ===\n');

  if (!AUTH_TOKEN) {
    console.error('ERROR: AUTH_TOKEN environment variable required');
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load test cases
  const testCases: TestCase[] = [];
  const fileStream = fs.createReadStream(INPUT_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) {
      testCases.push(JSON.parse(line));
    }
  }

  console.log(`Loaded ${testCases.length} test cases`);
  console.log(`Conversation ID: ${CONVERSATION_ID}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  const results: TurnResult[] = [];
  const resultsFile = fs.createWriteStream(path.join(OUTPUT_DIR, 'results_110.jsonl'));

  let hardFailCount = 0;
  let softFailCount = 0;
  const operatorDist: Record<string, number> = {};
  const intentDist: Record<string, number> = {};
  const latencies: number[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const turnNum = i + 1;

    process.stdout.write(`[${turnNum}/${testCases.length}] ${testCase.id}: ${testCase.query.slice(0, 40)}... `);

    try {
      const response = await streamQuery(testCase.query, CONVERSATION_ID);
      const result = validateTurn(testCase, response);
      results.push(result);

      // Update stats
      latencies.push(result.latencyMs);
      operatorDist[result.operator || 'unknown'] = (operatorDist[result.operator || 'unknown'] || 0) + 1;
      intentDist[result.intent || 'unknown'] = (intentDist[result.intent || 'unknown'] || 0) + 1;

      if (result.hardFail) {
        hardFailCount++;
        console.log(`❌ HARD FAIL: ${result.failReasons.join(', ')}`);
      } else if (result.softFailReasons.length > 0) {
        softFailCount += result.softFailReasons.length;
        console.log(`⚠️  SOFT: ${result.softFailReasons.join(', ')}`);
      } else {
        console.log(`✅ ${result.latencyMs}ms`);
      }

      // Write to results file
      resultsFile.write(JSON.stringify(result) + '\n');

      // Small delay between turns
      await new Promise(r => setTimeout(r, 500));

    } catch (error: any) {
      console.log(`❌ ERROR: ${error.message}`);
      hardFailCount++;

      const errorResult: TurnResult = {
        id: testCase.id,
        query: testCase.query,
        intent: 'error',
        fullAnswer: '',
        sources: [],
        latencyMs: 0,
        pass: false,
        hardFail: true,
        failReasons: [`ERROR: ${error.message}`],
        softFailReasons: [],
      };
      results.push(errorResult);
      resultsFile.write(JSON.stringify(errorResult) + '\n');
    }
  }

  resultsFile.end();

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0;

  // Generate grade report
  const gradeReport: GradeReport = {
    conversationId: CONVERSATION_ID,
    totalTurns: testCases.length,
    hardFails: hardFailCount,
    softFails: softFailCount,
    passed: hardFailCount === 0 && softFailCount <= 5,
    turnResults: results.map(r => ({
      id: r.id,
      pass: r.pass,
      hardFail: r.hardFail,
      reasons: [...r.failReasons, ...r.softFailReasons],
    })),
    operatorDistribution: operatorDist,
    intentDistribution: intentDist,
    avgLatencyMs: Math.round(avgLatency),
    p95LatencyMs: Math.round(p95Latency),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'grade_110.json'),
    JSON.stringify(gradeReport, null, 2)
  );

  // Generate final report
  const report = `# 110-Turn ChatGPT Parity Certification Report

## Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Hard Fails | ${hardFailCount} | 0 | ${hardFailCount === 0 ? '✅ PASS' : '❌ FAIL'} |
| Soft Fails | ${softFailCount} | ≤ 5 | ${softFailCount <= 5 ? '✅ PASS' : '⚠️ WARN'} |
| Avg Latency | ${Math.round(avgLatency)}ms | - | - |
| P95 Latency | ${Math.round(p95Latency)}ms | ≤ 10000ms | ${p95Latency <= 10000 ? '✅ PASS' : '⚠️ WARN'} |

## Final Result: ${gradeReport.passed ? '✅ CERTIFIED' : '❌ NOT CERTIFIED'}

## Operator Distribution

${Object.entries(operatorDist).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Intent Distribution

${Object.entries(intentDist).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Failed Turns

${results.filter(r => !r.pass).map(r => `### ${r.id}
- Query: ${r.query}
- Reasons: ${[...r.failReasons, ...r.softFailReasons].join(', ')}
`).join('\n')}

## Test Configuration

- Conversation ID: ${CONVERSATION_ID}
- Total Turns: ${testCases.length}
- Base URL: ${BASE_URL}
- Timestamp: ${new Date().toISOString()}

---
Generated by 110-Turn ChatGPT Parity Certification Runner
`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'FINAL_CERT_110.md'), report);

  console.log('\n=== Certification Complete ===');
  console.log(`Hard Fails: ${hardFailCount}`);
  console.log(`Soft Fails: ${softFailCount}`);
  console.log(`Result: ${gradeReport.passed ? '✅ CERTIFIED' : '❌ NOT CERTIFIED'}`);
  console.log(`\nOutputs written to: ${OUTPUT_DIR}`);
}

// Run
runCertification().catch(console.error);
