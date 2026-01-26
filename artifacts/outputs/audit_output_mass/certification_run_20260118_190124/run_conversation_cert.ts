/**
 * Koda Certification Test Runner
 *
 * Runs all queries in ONE conversation via SSE stream.
 * Grades from done event payload only.
 *
 * Usage:
 *   AUTH_TOKEN="..." TS_NODE_TRANSPILE_ONLY=true npx ts-node run_conversation_cert.ts --corpus=corpus_preflight_10.jsonl --output=results_preflight.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// ============================================================================
// TYPES
// ============================================================================

interface CorpusQuery {
  id: string;
  block?: string;
  turn?: number;
  query: string;
  expectedIntent: string;
  requiredFields: string[];
  passCriteria: Record<string, any>;
  context?: string;
  note?: string;
}

interface DoneEvent {
  type: 'done';
  fullAnswer?: string;
  formatted?: string;
  intent?: string;
  confidence?: number;
  operator?: string;
  templateId?: string;
  languageDetected?: string;
  languageLocked?: string;
  composedBy?: string;
  docScope?: string;
  anchorTypes?: string[];
  attachmentsTypes?: string[];
  truncationRepairApplied?: boolean;
  fileList?: { items?: any[] };
  sourceButtons?: { buttons?: any[] };
  attachments?: any[];
  constraints?: { buttonsOnly?: boolean };
  [key: string]: any;
}

interface QueryResult {
  id: string;
  query: string;
  pass: boolean;
  hardFail: boolean;
  failReasons: string[];
  checks: {
    instrumentation: { pass: boolean; missing: string[] };
    outputContract: { pass: boolean; violations: string[] };
    wordingQuality: { pass: boolean; issues: string[] };
    languageLock: { pass: boolean; expected: string; actual: string };
  };
  donePayload: DoneEvent | null;
  responseTimeMs: number;
}

// ============================================================================
// CONFIG
// ============================================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const USER_ID = 'test-user-001';

if (!AUTH_TOKEN) {
  console.error('ERROR: AUTH_TOKEN environment variable required');
  process.exit(1);
}

// ============================================================================
// SSE QUERY FUNCTION
// ============================================================================

async function sendQuery(
  query: string,
  conversationId: string
): Promise<{ done: DoneEvent | null; responseTimeMs: number }> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const url = new URL('/api/rag/query/stream', BASE_URL);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const body = JSON.stringify({
      query,
      userId: USER_ID,
      conversationId,
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Accept': 'text/event-stream',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = httpModule.request(options, (res) => {
      let buffer = '';
      let doneEvent: DoneEvent | null = null;

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const event = JSON.parse(jsonStr);
                if (event.type === 'done') {
                  doneEvent = event;
                }
              } catch (e) {
                // Ignore parse errors for partial chunks
              }
            }
          }
        }
      });

      res.on('end', () => {
        // Check remaining buffer
        if (buffer.startsWith('data: ')) {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === 'done') {
                doneEvent = event;
              }
            } catch (e) {
              // Ignore
            }
          }
        }

        const responseTimeMs = Date.now() - startTime;
        resolve({ done: doneEvent, responseTimeMs });
      });

      res.on('error', reject);
    });

    req.on('error', reject);

    // Set 90 second timeout (macOS-safe, no external timeout command)
    req.setTimeout(90000, () => {
      req.destroy();
      reject(new Error('Request timeout (90s)'));
    });

    req.write(body);
    req.end();
  });
}

// ============================================================================
// VALIDATORS
// ============================================================================

function checkHardFail(done: DoneEvent | null): { fail: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!done) {
    return { fail: true, reasons: ['No done event received'] };
  }

  if (!done.composedBy) {
    reasons.push('Missing composedBy stamp');
  }

  if (!done.operator) {
    reasons.push('Missing operator');
  }

  if (!done.languageLocked) {
    reasons.push('Missing languageLocked');
  }

  const hasContent = (done.fullAnswer && done.fullAnswer.length > 5) ||
    done.fileList?.buttons?.length ||
    done.attachments?.length;

  if (!hasContent) {
    reasons.push('Empty response (no content, fileList, or attachments)');
  }

  // Check for dangling markers
  if (done.fullAnswer) {
    if (/\{\{DOC::[^}]*$/.test(done.fullAnswer)) {
      reasons.push('Dangling DOC marker');
    }
    const boldCount = (done.fullAnswer.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      reasons.push('Unclosed bold marker');
    }
  }

  return { fail: reasons.length > 0, reasons };
}

function checkInstrumentation(done: DoneEvent, requiredFields: string[]): { pass: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of requiredFields) {
    if (done[field] === undefined || done[field] === null) {
      missing.push(field);
    }
  }

  return { pass: missing.length === 0, missing };
}

function checkOutputContract(done: DoneEvent, criteria: Record<string, any>): { pass: boolean; violations: string[] } {
  const violations: string[] = [];

  if (criteria.hasFileList && !done.fileList?.items?.length) {
    violations.push('Expected fileList but none present');
  }

  if (criteria.buttonsOnly) {
    const hasButtons = done.attachments?.length || done.fileList?.items?.length;
    if (!hasButtons) {
      violations.push('Expected buttons but none present');
    }
  }

  if (criteria.operator && done.operator !== criteria.operator) {
    violations.push(`Expected operator=${criteria.operator}, got ${done.operator}`);
  }

  if (criteria.docScope && done.docScope !== criteria.docScope) {
    violations.push(`Expected docScope=${criteria.docScope}, got ${done.docScope}`);
  }

  if (criteria.anchorTypesContains && !done.anchorTypes?.includes(criteria.anchorTypesContains)) {
    violations.push(`Expected anchorTypes to contain ${criteria.anchorTypesContains}`);
  }

  return { pass: violations.length === 0, violations };
}

function checkWordingQuality(done: DoneEvent, criteria: Record<string, any>): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  const answer = done.fullAnswer || '';

  // Check preamble
  const preamblePatterns = [
    /^based on/i, /^according to/i, /^i found/i,
    /^here is/i, /^here are/i, /^aqui está/i, /^com base/i
  ];
  for (const pattern of preamblePatterns) {
    if (pattern.test(answer.trim())) {
      issues.push(`Preamble detected: ${pattern.source}`);
      break;
    }
  }

  // Check bullet count
  if (criteria.bulletCountExact) {
    const bulletPatterns = /^[\s]*[-•*]\s|^[\s]*\d+\.\s/gm;
    const bullets = (answer.match(bulletPatterns) || []).length;
    if (bullets !== criteria.bulletCountExact) {
      issues.push(`Bullet count: ${bullets} (expected ${criteria.bulletCountExact})`);
    }
  }

  return { pass: issues.length === 0, issues };
}

function checkLanguageLock(done: DoneEvent, criteria: Record<string, any>): { pass: boolean; expected: string; actual: string } {
  const expected = criteria.languageLocked || 'en';
  const actual = done.languageLocked || 'unknown';

  let pass = actual === expected;

  // Also check detected if specified
  if (criteria.languageDetected && done.languageDetected !== criteria.languageDetected) {
    pass = false;
  }

  return { pass, expected, actual };
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

async function runCertification(corpusPath: string, outputPath: string): Promise<void> {
  console.log('='.repeat(70));
  console.log('KODA CERTIFICATION TEST RUNNER');
  console.log('='.repeat(70));
  console.log(`Corpus: ${corpusPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`User: ${USER_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('='.repeat(70));

  // Load corpus
  const corpusContent = fs.readFileSync(corpusPath, 'utf-8');
  const queries: CorpusQuery[] = corpusContent
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  console.log(`Loaded ${queries.length} queries`);

  // Single conversation for all queries
  const conversationId = `cert-${Date.now()}`;
  console.log(`Conversation ID: ${conversationId}`);
  console.log('-'.repeat(70));

  const results: QueryResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const query of queries) {
    console.log(`\n[${query.id}] ${query.query.substring(0, 50)}...`);

    try {
      const { done, responseTimeMs } = await sendQuery(query.query, conversationId);

      // Run all checks
      const hardFailCheck = checkHardFail(done);
      const instrumentation = done ? checkInstrumentation(done, query.requiredFields) : { pass: false, missing: query.requiredFields };
      const outputContract = done ? checkOutputContract(done, query.passCriteria) : { pass: false, violations: ['No done event'] };
      const wordingQuality = done ? checkWordingQuality(done, query.passCriteria) : { pass: false, issues: ['No done event'] };
      const languageLock = done ? checkLanguageLock(done, query.passCriteria) : { pass: false, expected: 'en', actual: 'unknown' };

      const allFailReasons = [
        ...hardFailCheck.reasons,
        ...instrumentation.missing.map(f => `Missing field: ${f}`),
        ...outputContract.violations,
        ...wordingQuality.issues,
        ...(languageLock.pass ? [] : [`Language mismatch: expected ${languageLock.expected}, got ${languageLock.actual}`])
      ];

      const pass = !hardFailCheck.fail && instrumentation.pass && outputContract.pass && wordingQuality.pass && languageLock.pass;

      const result: QueryResult = {
        id: query.id,
        query: query.query,
        pass,
        hardFail: hardFailCheck.fail,
        failReasons: allFailReasons,
        checks: {
          instrumentation,
          outputContract,
          wordingQuality,
          languageLock,
        },
        donePayload: done,
        responseTimeMs,
      };

      results.push(result);

      if (pass) {
        passed++;
        console.log(`  ✓ PASS (${responseTimeMs}ms) - operator: ${done?.operator}, lang: ${done?.languageLocked}`);
      } else {
        failed++;
        console.log(`  ✗ FAIL (${responseTimeMs}ms)`);
        for (const reason of allFailReasons.slice(0, 3)) {
          console.log(`    - ${reason}`);
        }
      }

      // Small delay between queries to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (error: any) {
      console.log(`  ✗ ERROR: ${error.message}`);
      results.push({
        id: query.id,
        query: query.query,
        pass: false,
        hardFail: true,
        failReasons: [`Error: ${error.message}`],
        checks: {
          instrumentation: { pass: false, missing: query.requiredFields },
          outputContract: { pass: false, violations: ['Error during query'] },
          wordingQuality: { pass: false, issues: ['Error during query'] },
          languageLock: { pass: false, expected: 'en', actual: 'error' },
        },
        donePayload: null,
        responseTimeMs: 0,
      });
      failed++;
    }
  }

  // Write results
  const resultsContent = results.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(outputPath, resultsContent);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total: ${queries.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  const passRate = ((passed / queries.length) * 100).toFixed(1);
  console.log(`Pass Rate: ${passRate}%`);

  const threshold = queries.length <= 10 ? 100 : 95;
  const overallPass = parseFloat(passRate) >= threshold;
  console.log(`\nResult: ${overallPass ? 'PASS' : 'FAIL'} (threshold: ${threshold}%)`);
  console.log('='.repeat(70));

  // Write summary to separate file
  const summaryPath = outputPath.replace('.jsonl', '_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    conversationId,
    corpus: path.basename(corpusPath),
    total: queries.length,
    passed,
    failed,
    passRate: parseFloat(passRate),
    threshold,
    result: overallPass ? 'PASS' : 'FAIL',
    failedQueries: results.filter(r => !r.pass).map(r => ({
      id: r.id,
      query: r.query,
      reasons: r.failReasons,
    })),
  }, null, 2));

  console.log(`\nResults written to: ${outputPath}`);
  console.log(`Summary written to: ${summaryPath}`);
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);
let corpusPath = '';
let outputPath = '';

for (const arg of args) {
  if (arg.startsWith('--corpus=')) {
    corpusPath = arg.split('=')[1];
  } else if (arg.startsWith('--output=')) {
    outputPath = arg.split('=')[1];
  }
}

if (!corpusPath) {
  console.error('Usage: npx ts-node run_conversation_cert.ts --corpus=<file> --output=<file>');
  process.exit(1);
}

// Default output path
if (!outputPath) {
  outputPath = corpusPath.replace('.jsonl', '_results.jsonl');
}

// Resolve paths
const scriptDir = __dirname;
if (!path.isAbsolute(corpusPath)) {
  corpusPath = path.join(scriptDir, corpusPath);
}
if (!path.isAbsolute(outputPath)) {
  outputPath = path.join(scriptDir, outputPath);
}

runCertification(corpusPath, outputPath).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
