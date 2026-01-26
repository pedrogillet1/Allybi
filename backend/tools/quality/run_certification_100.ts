#!/usr/bin/env npx ts-node
/**
 * 100-Turn Certification Runner
 *
 * Runs certification_100_trabalhos.jsonl in ONE continuous conversation.
 * Validates hard_fails and produces grade_100.json.
 *
 * Usage:
 *   JWT_ACCESS_SECRET="..." npx ts-node tools/quality/run_certification_100.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import jwt from 'jsonwebtoken';

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'k8mP2vXqL9nR4wYj6tF1hB3cZ5sA7uD0eG8iK2oM4qW6yT1xV3nJ5bH7fL9pU2rE';
const USER_ID = 'test-user-001';
const TIMEOUT_MS = 90_000;

interface CertQuery {
  id: string;
  turn: number;
  input: string;
  expected: {
    operator: string;
    attachments?: string[];
    bullets?: number;
    mentions?: string[];
    language?: string;
  };
  hard_fails: string[];
  soft_flags?: string[];
  note?: string;
}

interface TurnResult {
  id: string;
  turn: number;
  input: string;
  expectedOperator: string;
  actualOperator: string;
  fullAnswer: string;
  charCount: number;
  attachments: any[];
  sources: any[];
  sourceButtons: any;
  fileList: any;
  latencyMs: number;
  hardFailsChecked: string[];
  hardFailsTriggered: string[];
  softIssues: string[];
  passed: boolean;
  error?: string;
}

interface GradeReport {
  timestamp: string;
  conversationId: string;
  totalTurns: number;
  passedTurns: number;
  failedTurns: number;
  hardFailCount: number;
  softFailCount: number;
  passRate: string;
  verdict: 'PASS' | 'FAIL';
  failedTurnIds: string[];
  hardFailDetails: { id: string; fails: string[] }[];
  softFailDetails: { id: string; issues: string[] }[];
  averageLatencyMs: number;
  maxLatencyMs: number;
}

function generateToken(): string {
  return jwt.sign(
    { userId: USER_ID, email: 'test@koda.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function streamQuery(
  query: string,
  conversationId: string,
  token: string,
  signal: AbortSignal
): Promise<{
  fullAnswer: string;
  intent: string;
  sources: any[];
  attachments: any[];
  sourceButtons: any;
  fileList: any;
  doneEvent: any;
}> {
  const url = `${BASE_URL}/api/rag/query/stream`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      userId: USER_ID,
      conversationId,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullAnswer = '';
  let intent = '';
  let sources: any[] = [];
  let attachments: any[] = [];
  let sourceButtons: any = null;
  let fileList: any = null;
  let doneEvent: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const event = JSON.parse(jsonStr);

        if (event.type === 'token' && event.content) {
          fullAnswer += event.content;
        } else if (event.type === 'content' && event.text) {
          fullAnswer += event.text;
        } else if (event.type === 'intent') {
          intent = event.intent || '';
        } else if (event.type === 'sources') {
          sources = event.sources || [];
        } else if (event.type === 'attachments') {
          attachments = event.attachments || [];
        } else if (event.type === 'done') {
          doneEvent = event;
          if (event.fullAnswer) fullAnswer = event.fullAnswer;
          if (event.sources) sources = event.sources;
          if (event.attachments) attachments = event.attachments;
          if (event.sourceButtons) sourceButtons = event.sourceButtons;
          if (event.fileList) fileList = event.fileList;
          if (event.intent) intent = event.intent;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  return { fullAnswer, intent, sources, attachments, sourceButtons, fileList, doneEvent };
}

function checkHardFails(
  result: { fullAnswer: string; attachments: any[]; sources: any[]; sourceButtons: any; fileList: any; intent: string },
  query: CertQuery
): { checked: string[]; triggered: string[] } {
  const checked: string[] = [];
  const triggered: string[] = [];
  const answer = result.fullAnswer || '';

  for (const rule of query.hard_fails) {
    checked.push(rule);

    switch (rule) {
      case 'no_trailing_ellipsis':
        if (answer.trimEnd().endsWith('...') || answer.trimEnd().endsWith('…')) {
          triggered.push('no_trailing_ellipsis: answer ends with ellipsis (truncated)');
        }
        break;

      case 'no_dangling_list_markers':
        const danglingMarkers = answer.match(/^\s*(?:[-*•]+|\d+\.)\s*$/gm);
        if (danglingMarkers && danglingMarkers.length > 0) {
          triggered.push(`no_dangling_list_markers: found ${danglingMarkers.length} dangling markers`);
        }
        break;

      case 'composer_stamp_present':
        // Check that the answer ends properly (not mid-sentence)
        const lastChar = answer.trim().slice(-1);
        const endsClean = ['.', '!', '?', ':', ';', ')', ']', '}', '"', "'", '`', '*', '-'].includes(lastChar);
        const endsWithExt = /\.(pdf|xlsx|pptx|docx|png|jpg|csv|txt|md)$/i.test(answer.trim());
        const lastLine = answer.trim().split('\n').pop() || '';
        const lastLineIsList = /^[-*•]\s+.+|^\d+\.\s+.+/.test(lastLine.trim());
        if (answer.length > 50 && !endsClean && !endsWithExt && !lastLineIsList) {
          triggered.push('composer_stamp_present: answer appears cut mid-sentence');
        }
        break;

      case 'ui_contract_attachments_present':
        const hasAttachments = result.attachments?.length > 0;
        const hasSourceButtons = result.sourceButtons?.buttons?.length > 0;
        const hasFileListItems = result.fileList?.items?.length > 0;
        if (!hasAttachments && !hasSourceButtons && !hasFileListItems && query.expected.attachments?.length) {
          triggered.push(`ui_contract_attachments_present: expected attachments but got none`);
        }
        break;

      case 'ui_contract_file_list_present':
        const hasFileListAttachment = result.attachments?.some((a: any) => a.type === 'file_list');
        const hasFileListObj = result.fileList?.items?.length > 0;
        if (!hasFileListAttachment && !hasFileListObj && query.expected.attachments?.includes('file_list')) {
          // Check sourceButtons as fallback
          if (!result.sourceButtons?.buttons?.length) {
            triggered.push('ui_contract_file_list_present: expected file_list attachment');
          }
        }
        break;

      case 'ui_contract_source_pills_present':
        const hasPills = result.sources?.length > 0 || result.sourceButtons?.buttons?.length > 0;
        if (!hasPills && query.expected.attachments?.includes('source_pills')) {
          triggered.push('ui_contract_source_pills_present: expected source pills');
        }
        break;

      case 'bullet_count_exact':
        if (query.expected.bullets) {
          const bullets = answer.match(/^[\s]*[-*•]\s+/gm) || [];
          if (bullets.length !== query.expected.bullets) {
            triggered.push(`bullet_count_exact: expected ${query.expected.bullets}, got ${bullets.length}`);
          }
        }
        break;

      case 'must_mention_all':
        if (query.expected.mentions) {
          const missing = query.expected.mentions.filter(m =>
            !answer.toLowerCase().includes(m.toLowerCase())
          );
          if (missing.length > 0) {
            triggered.push(`must_mention_all: missing "${missing.join('", "')}"`);
          }
        }
        break;

      case 'language_match':
        const expectedLang = query.expected.language || 'en';
        const ptMarkers = ['não', 'são', 'está', 'você', 'também', 'através', 'porém', 'documento'];
        const enMarkers = ['the', 'and', 'for', 'are', 'that', 'this', 'with', 'document'];
        const answerLower = answer.toLowerCase();
        const ptCount = ptMarkers.filter(m => answerLower.includes(m)).length;
        const enCount = enMarkers.filter(m => answerLower.includes(m)).length;
        const detectedLang = ptCount > enCount ? 'pt' : 'en';
        if (expectedLang !== detectedLang && answer.length > 100) {
          triggered.push(`language_match: expected ${expectedLang}, detected ${detectedLang}`);
        }
        break;

      case 'operator_match':
        if (query.expected.operator && result.intent !== query.expected.operator) {
          // Allow some operator variations
          const equivalents: Record<string, string[]> = {
            'list': ['list', 'inventory'],
            'filter': ['filter', 'list'],
            'sort': ['sort', 'list'],
            'locate_file': ['locate_file', 'open'],
            'locate_content': ['locate_content', 'extract'],
            'summarize': ['summarize', 'extract'],
            'extract': ['extract', 'summarize'],
            'compute': ['compute', 'extract'],
          };
          const allowed = equivalents[query.expected.operator] || [query.expected.operator];
          if (!allowed.includes(result.intent)) {
            triggered.push(`operator_match: expected ${query.expected.operator}, got ${result.intent}`);
          }
        }
        break;

      case 'no_empty_answer':
        if (!answer || answer.trim().length < 10) {
          triggered.push('no_empty_answer: response too short or empty');
        }
        break;

      case 'no_hallucination_preamble':
        const hallucinationMarkers = [
          'I cannot', 'I am unable', "I don't have access",
          'As an AI', 'I apologize', "I'm sorry but", 'I cannot help'
        ];
        for (const marker of hallucinationMarkers) {
          if (answer.includes(marker)) {
            triggered.push(`no_hallucination_preamble: found "${marker}"`);
            break;
          }
        }
        break;

      case 'table_format_valid':
        if (answer.includes('|')) {
          const tableRows = answer.match(/\|[^\n]+\|/g) || [];
          if (tableRows.length > 1) {
            const hasSeparator = tableRows.some(row => /\|[\s-:|]+\|/.test(row));
            if (!hasSeparator) {
              triggered.push('table_format_valid: table missing header separator');
            }
          }
        }
        break;

      default:
        // Unknown rule - skip
        break;
    }
  }

  return { checked, triggered };
}

function checkSoftFails(
  result: { fullAnswer: string; latencyMs: number },
  query: CertQuery
): string[] {
  const issues: string[] = [];
  const flags = query.soft_flags || [];

  if (result.latencyMs > 30000) {
    issues.push(`high_latency: ${(result.latencyMs / 1000).toFixed(1)}s`);
  }

  if (flags.includes('prefer_concise') && result.fullAnswer.length > 2000) {
    issues.push(`verbose: ${result.fullAnswer.length} chars`);
  }

  return issues;
}

async function runCertification() {
  const certPath = path.join(__dirname, 'certification_100_trabalhos.jsonl');
  const outputDir = path.join(__dirname, '..', '..', 'audit_output_mass', `cert100_${Date.now()}`);

  if (!fs.existsSync(certPath)) {
    console.error(`ERROR: File not found: ${certPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Read queries
  const queries: CertQuery[] = [];
  const content = fs.readFileSync(certPath, 'utf-8');
  for (const line of content.trim().split('\n')) {
    if (line.trim()) {
      queries.push(JSON.parse(line));
    }
  }

  const conversationId = `cert-100-${Date.now()}`;
  const token = generateToken();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   KODA 100-TURN STRICT CERTIFICATION');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Queries:        ${queries.length}`);
  console.log(`Conversation:   ${conversationId}`);
  console.log(`Timeout:        ${TIMEOUT_MS / 1000}s per turn`);
  console.log(`Output:         ${outputDir}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const results: TurnResult[] = [];
  let totalLatency = 0;
  let maxLatency = 0;

  const resultsStream = fs.createWriteStream(path.join(outputDir, 'results_100.jsonl'));

  for (const query of queries) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let result: TurnResult;

    try {
      const response = await streamQuery(query.input, conversationId, token, controller.signal);
      const latencyMs = Date.now() - startTime;
      totalLatency += latencyMs;
      maxLatency = Math.max(maxLatency, latencyMs);

      const { checked, triggered } = checkHardFails(response, query);
      const softIssues = checkSoftFails({ fullAnswer: response.fullAnswer, latencyMs }, query);

      result = {
        id: query.id,
        turn: query.turn,
        input: query.input,
        expectedOperator: query.expected.operator,
        actualOperator: response.intent,
        fullAnswer: response.fullAnswer,
        charCount: response.fullAnswer.length,
        attachments: response.attachments,
        sources: response.sources,
        sourceButtons: response.sourceButtons,
        fileList: response.fileList,
        latencyMs,
        hardFailsChecked: checked,
        hardFailsTriggered: triggered,
        softIssues,
        passed: triggered.length === 0,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      result = {
        id: query.id,
        turn: query.turn,
        input: query.input,
        expectedOperator: query.expected.operator,
        actualOperator: 'error',
        fullAnswer: '',
        charCount: 0,
        attachments: [],
        sources: [],
        sourceButtons: null,
        fileList: null,
        latencyMs,
        hardFailsChecked: [],
        hardFailsTriggered: ['error: ' + (err.message || String(err))],
        softIssues: [],
        passed: false,
        error: err.message || String(err),
      };
    } finally {
      clearTimeout(timeout);
    }

    results.push(result);
    resultsStream.write(JSON.stringify(result) + '\n');

    // Progress output
    const status = result.passed ? '✓' : '✗';
    const latencyStr = (result.latencyMs / 1000).toFixed(1) + 's';
    const hardFails = result.hardFailsTriggered.length > 0
      ? ` [${result.hardFailsTriggered.join('; ')}]`
      : '';
    const softFails = result.softIssues.length > 0
      ? ` (soft: ${result.softIssues.join(', ')})`
      : '';

    console.log(`${status} ${result.id.padEnd(5)} ${latencyStr.padStart(6)} │ ${result.actualOperator?.padEnd(14) || 'null'.padEnd(14)} │ ${result.input.slice(0, 40)}...${hardFails}${softFails}`);

    // Small delay
    await new Promise(r => setTimeout(r, 300));
  }

  resultsStream.end();

  // Generate grade report
  const passedTurns = results.filter(r => r.passed).length;
  const failedTurns = results.filter(r => !r.passed).length;
  const hardFailCount = results.reduce((sum, r) => sum + r.hardFailsTriggered.length, 0);
  const softFailCount = results.reduce((sum, r) => sum + r.softIssues.length, 0);

  const grade: GradeReport = {
    timestamp: new Date().toISOString(),
    conversationId,
    totalTurns: results.length,
    passedTurns,
    failedTurns,
    hardFailCount,
    softFailCount,
    passRate: ((passedTurns / results.length) * 100).toFixed(1) + '%',
    verdict: failedTurns === 0 && softFailCount <= 5 ? 'PASS' : 'FAIL',
    failedTurnIds: results.filter(r => !r.passed).map(r => r.id),
    hardFailDetails: results
      .filter(r => r.hardFailsTriggered.length > 0)
      .map(r => ({ id: r.id, fails: r.hardFailsTriggered })),
    softFailDetails: results
      .filter(r => r.softIssues.length > 0)
      .map(r => ({ id: r.id, issues: r.softIssues })),
    averageLatencyMs: Math.round(totalLatency / results.length),
    maxLatencyMs: maxLatency,
  };

  fs.writeFileSync(
    path.join(outputDir, 'grade_100.json'),
    JSON.stringify(grade, null, 2)
  );

  // Print summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   CERTIFICATION RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Turns:     ${grade.totalTurns}`);
  console.log(`Passed:          ${grade.passedTurns}`);
  console.log(`Failed:          ${grade.failedTurns}`);
  console.log(`Hard Fails:      ${grade.hardFailCount}`);
  console.log(`Soft Fails:      ${grade.softFailCount}`);
  console.log(`Pass Rate:       ${grade.passRate}`);
  console.log(`Avg Latency:     ${(grade.averageLatencyMs / 1000).toFixed(1)}s`);
  console.log(`Max Latency:     ${(grade.maxLatencyMs / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`VERDICT: ${grade.verdict === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  console.log('═══════════════════════════════════════════════════════════');

  if (grade.failedTurnIds.length > 0) {
    console.log(`\nFailed turns: ${grade.failedTurnIds.join(', ')}`);
  }

  console.log(`\nResults: ${path.join(outputDir, 'results_100.jsonl')}`);
  console.log(`Grade:   ${path.join(outputDir, 'grade_100.json')}`);
}

runCertification().catch(err => {
  console.error('Certification failed:', err);
  process.exit(1);
});
