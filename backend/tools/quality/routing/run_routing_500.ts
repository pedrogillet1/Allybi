#!/usr/bin/env npx ts-node
/**
 * Routing-Only Certification Runner (500 queries)
 * 
 * Tests ONLY routing decisions: intentFamily, operator, language
 * Does NOT test answer quality.
 * 
 * Usage:
 *   JWT_ACCESS_SECRET="..." npx ts-node tools/quality/routing/run_routing_500.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'k8mP2vXqL9nR4wYj6tF1hB3cZ5sA7uD0eG8iK2oM4qW6yT1xV3nJ5bH7fL9pU2rE';
const USER_ID = 'test-user-001';
const TIMEOUT_MS = 90_000;  // 90s to avoid timeouts on complex queries
const CONCURRENCY = 1;      // Sequential execution to prevent server overload
const MAX_RETRIES = 2;      // Retry transient errors
const RETRY_DELAY_MS = 1500; // Backoff between retries

interface RoutingQuery {
  id: string;
  input: string;
  expected: {
    intentFamily: string;
    operator: string;
    language: string;
    domain?: string;
  };
}

interface RoutingResult {
  id: string;
  input: string;
  expected: RoutingQuery['expected'];
  actual: {
    intentFamily: string;
    operator: string;
    language: string;
    domain?: string;
  };
  passed: boolean;
  mismatch: string[];
  latencyMs: number;
  error?: string;
}

function generateToken(): string {
  return jwt.sign(
    { userId: USER_ID, email: 'test@koda.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function queryRouting(
  query: string,
  conversationId: string,
  token: string
): Promise<{ intentFamily: string; operator: string; language: string; domain?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/api/rag/query/stream`, {
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
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);
          if (event.type === 'done') {
            return {
              intentFamily: event.intent || 'unknown',
              operator: event.operator || 'unknown',
              language: event.languageLocked || event.languageDetected || 'en',
              domain: event.domain,
            };
          }
        } catch {}
      }
    }

    throw new Error('No done event');
  } finally {
    clearTimeout(timeout);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queryWithRetry(
  query: string,
  convId: string,
  token: string,
  retries: number = MAX_RETRIES
): Promise<{ intentFamily: string; operator: string; language: string; domain?: string }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await queryRouting(query, convId, token);
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        // Exponential backoff: 500ms, 1500ms
        const delay = RETRY_DELAY_MS * (attempt + 1);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('All retries exhausted');
}

async function runTest(query: RoutingQuery, token: string, conversationId: string): Promise<RoutingResult> {
  const start = Date.now();

  try {
    const actual = await queryWithRetry(query.input, conversationId, token);
    const latencyMs = Date.now() - start;

    const mismatch: string[] = [];

    // Normalize intentFamily comparison
    const expectedFamily = query.expected.intentFamily.toLowerCase();
    const actualFamily = actual.intentFamily.toLowerCase();
    if (actualFamily !== expectedFamily) {
      mismatch.push(`intentFamily: expected=${expectedFamily}, actual=${actualFamily}`);
    }

    // Normalize operator comparison
    const expectedOp = query.expected.operator.toLowerCase();
    const actualOp = actual.operator.toLowerCase();
    if (actualOp !== expectedOp) {
      mismatch.push(`operator: expected=${expectedOp}, actual=${actualOp}`);
    }

    // Language check
    if (query.expected.language !== actual.language) {
      mismatch.push(`language: expected=${query.expected.language}, actual=${actual.language}`);
    }

    return {
      id: query.id,
      input: query.input,
      expected: query.expected,
      actual,
      passed: mismatch.length === 0,
      mismatch,
      latencyMs,
    };
  } catch (err: any) {
    return {
      id: query.id,
      input: query.input,
      expected: query.expected,
      actual: { intentFamily: 'error', operator: 'error', language: 'error' },
      passed: false,
      mismatch: ['API_ERROR'],
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

async function main() {
  console.log('=== Routing Certification (500 queries) ===\n');

  const inputFile = path.join(__dirname, 'routing_500.jsonl');
  const outputFile = path.join(__dirname, 'routing_500_results.jsonl');
  const reportFile = path.join(__dirname, 'routing_500_report.json');

  // Load queries
  const queries: RoutingQuery[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      queries.push(JSON.parse(line));
    }
  }

  console.log(`Loaded ${queries.length} queries\n`);

  const token = generateToken();
  const results: RoutingResult[] = [];
  const confusion: Record<string, Record<string, number>> = {};

  // SINGLE CONVERSATION: All queries share the same conversationId to simulate
  // a real user session with context maintained between messages
  const conversationId = `routing-session-${Date.now()}`;
  console.log(`Using single conversation: ${conversationId}\n`);

  // Process in batches
  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(q => runTest(q, token, conversationId))
    );
    results.push(...batchResults);

    // Track confusion matrix
    for (const r of batchResults) {
      const key = `${r.expected.intentFamily}/${r.expected.operator}`;
      const actualKey = `${r.actual.intentFamily}/${r.actual.operator}`;
      if (!confusion[key]) confusion[key] = {};
      confusion[key][actualKey] = (confusion[key][actualKey] || 0) + 1;
    }

    // Progress
    const done = Math.min(i + CONCURRENCY, queries.length);
    const passed = results.filter(r => r.passed).length;
    const rate = ((passed / results.length) * 100).toFixed(1);
    process.stdout.write(`\r[${done}/${queries.length}] Pass rate: ${rate}%`);
  }

  console.log('\n');

  // Write results
  const outStream = fs.createWriteStream(outputFile);
  for (const r of results) {
    outStream.write(JSON.stringify(r) + '\n');
  }
  outStream.end();

  // Calculate stats
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const errors = results.filter(r => r.error).length;
  const passRate = (passed / results.length) * 100;

  const failures = results.filter(r => !r.passed);
  const byFamily: Record<string, { total: number; passed: number }> = {};
  
  for (const r of results) {
    const family = r.expected.intentFamily;
    if (!byFamily[family]) byFamily[family] = { total: 0, passed: 0 };
    byFamily[family].total++;
    if (r.passed) byFamily[family].passed++;
  }

  const report = {
    timestamp: new Date().toISOString(),
    totalQueries: queries.length,
    passed,
    failed,
    errors,
    passRate: `${passRate.toFixed(2)}%`,
    verdict: passRate >= 99 ? 'PASS' : 'FAIL',
    byFamily: Object.entries(byFamily).map(([f, s]) => ({
      family: f,
      total: s.total,
      passed: s.passed,
      rate: `${((s.passed / s.total) * 100).toFixed(1)}%`,
    })),
    failures: failures.slice(0, 50).map(f => ({
      id: f.id,
      input: f.input.slice(0, 80),
      expected: `${f.expected.intentFamily}/${f.expected.operator}`,
      actual: `${f.actual.intentFamily}/${f.actual.operator}`,
      mismatch: f.mismatch,
    })),
    confusion,
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log('=== ROUTING CERTIFICATION RESULTS ===\n');
  console.log(`Total: ${queries.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Pass Rate: ${passRate.toFixed(2)}%`);
  console.log(`Verdict: ${report.verdict}\n`);

  console.log('By Family:');
  for (const f of report.byFamily) {
    console.log(`  ${f.family}: ${f.passed}/${f.total} (${f.rate})`);
  }

  if (failures.length > 0) {
    console.log('\nFirst 10 failures:');
    for (const f of failures.slice(0, 10)) {
      console.log(`  ${f.id}: "${f.input.slice(0, 50)}..."`);
      console.log(`    Expected: ${f.expected.intentFamily}/${f.expected.operator}`);
      console.log(`    Actual: ${f.actual.intentFamily}/${f.actual.operator}`);
    }
  }

  console.log(`\nResults: ${outputFile}`);
  console.log(`Report: ${reportFile}`);
}

main().catch(console.error);
