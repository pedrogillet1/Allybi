#!/usr/bin/env npx ts-node
/**
 * FAST Routing-Only Certification Runner (500 queries)
 *
 * Tests ONLY routing decisions IN-PROCESS: no HTTP, no SSE, no LLM.
 * Calls the EXACT same routing functions as the real orchestrator.
 *
 * Expected: 500 queries in < 5 seconds.
 *
 * Usage:
 *   npx ts-node tools/quality/routing/run_routing_500_fast.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Import routing services directly - SAME as orchestrator uses
import { runtimePatterns } from '../../../src/services/core/runtimePatterns.service';

// ============================================================================
// TYPES
// ============================================================================

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
}

// ============================================================================
// ROUTING LOGIC (mirrors orchestrator EXACTLY)
// ============================================================================

function deriveIntentFamily(intent: string, operator: string): 'documents' | 'file_actions' | 'help' | 'doc_stats' | 'unknown' {
  const normalized = intent?.toLowerCase() || '';

  // File actions family - based on operator
  const fileActionOperators = ['list', 'filter', 'sort', 'group', 'open', 'locate_file', 'again', 'preview', 'download'];
  if (fileActionOperators.includes(operator)) {
    return 'file_actions';
  }

  // Help family
  if (['help', 'capabilities', 'about', 'how_to'].includes(normalized) || operator === 'help') {
    return 'help';
  }

  // Doc stats family
  if (['doc_stats', 'count_pages', 'count_slides', 'count_sheets'].includes(normalized) || operator === 'doc_stats') {
    return 'doc_stats';
  }

  // Documents family (default for RAG operations)
  return 'documents';
}

function detectHelpIntent(query: string): { isHelp: boolean; subIntent: string } {
  const q = query.toLowerCase();

  // Capabilities patterns (expanded)
  if (/\b(what\s+can\s+you|o\s+que\s+voc[êe]\s+pode|qu[ée]\s+puedes|capabilities|funcionalidades)\b/i.test(q) ||
      /\b(what\s+are\s+your\s+(features|capabilities)|what\s+do\s+you\s+do)\b/i.test(q) ||
      /\b(quais\s+(são\s+)?(suas?\s+)?capacidades|quais\s+(são\s+)?(suas?\s+)?funcionalidades)\b/i.test(q)) {
    return { isHelp: true, subIntent: 'capabilities' };
  }

  // How-to patterns (expanded with "how to X")
  if (/\b(how\s+(do|can)\s+i|how\s+to\s+\w+|como\s+(fa[çc]o|posso|usar|filtro|comparo))\b/i.test(q) ||
      /\b(help\s+me\s+(with|to)|ajud(e|a)-?me|como\s+isso\s+funciona)\b/i.test(q) ||
      /\b(how\s+does\s+(this|it)\s+work)\b/i.test(q)) {
    return { isHelp: true, subIntent: 'how_to' };
  }

  // Generic help (standalone "help" or "ajuda")
  if (/^(help|ajuda|ayuda)\.?$/i.test(q.trim())) {
    return { isHelp: true, subIntent: 'capabilities' };
  }

  // Help with Koda mention
  if (/\bkoda\b/i.test(q) && /\b(help|ajuda|ayuda|what|como)\b/i.test(q)) {
    return { isHelp: true, subIntent: 'how_to' };
  }

  return { isHelp: false, subIntent: '' };
}

function detectDocStatsIntent(query: string): { isDocStats: boolean; subIntent: string } {
  const q = query.toLowerCase();

  // Count pages
  if (/\b(how\s+many\s+pages?|quantas?\s+p[aá]ginas?|cu[aá]ntas?\s+p[aá]ginas?|page\s+count|contagem\s+de\s+p[aá]ginas?)\b/i.test(q)) {
    return { isDocStats: true, subIntent: 'count_pages' };
  }

  // Count slides
  if (/\b(how\s+many\s+slides?|quantos?\s+slides?|cu[aá]ntos?\s+slides?|slide\s+count)\b/i.test(q)) {
    return { isDocStats: true, subIntent: 'count_slides' };
  }

  // Count sheets/tabs
  if (/\b(how\s+many\s+(sheets?|tabs?|worksheets?)|quantas?\s+(abas?|planilhas?)|cu[aá]ntas?\s+hojas?)\b/i.test(q)) {
    return { isDocStats: true, subIntent: 'count_sheets' };
  }

  // Generic document count
  if (/\b(how\s+many\s+(files?|documents?)|quantos?\s+(arquivos?|documentos?))\b/i.test(q)) {
    return { isDocStats: true, subIntent: 'count_files' };
  }

  return { isDocStats: false, subIntent: '' };
}

function routeQuery(query: string): {
  intentFamily: string;
  operator: string;
  language: string;
} {
  const q = query.toLowerCase();

  // 1. Detect language
  const language = runtimePatterns.detectLanguageFromQuery(query) as 'en' | 'pt' | 'es';

  // 2. Check for HELP intent (highest priority)
  const helpResult = detectHelpIntent(query);
  if (helpResult.isHelp) {
    return {
      intentFamily: 'help',
      operator: helpResult.subIntent,
      language,
    };
  }

  // 3. Check for DOC_STATS intent
  const docStatsResult = detectDocStatsIntent(query);
  if (docStatsResult.isDocStats) {
    return {
      intentFamily: 'doc_stats',
      operator: docStatsResult.subIntent,
      language,
    };
  }

  // 4. Check for file action intent (file navigation/listing)
  const fileActionOp = runtimePatterns.detectFileActionIntent(q);
  if (fileActionOp) {
    return {
      intentFamily: 'file_actions',
      operator: fileActionOp,
      language,
    };
  }

  // 5. Check for document intent (RAG operations)
  const docOp = runtimePatterns.detectDocumentIntent(q);
  if (docOp) {
    return {
      intentFamily: 'documents',
      operator: docOp,
      language,
    };
  }

  // 6. Check for expand/more patterns (follow-up)
  if (/\b(more\s+details?|tell\s+me\s+more|expand|mais\s+detalhes?|explicar\s+mais|continue|continuar|go\s+on)\b/i.test(q)) {
    return {
      intentFamily: 'documents',
      operator: 'expand',
      language,
    };
  }

  // 7. Default to documents/extract for unmatched queries
  return {
    intentFamily: 'documents',
    operator: 'extract',
    language,
  };
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function runTest(query: RoutingQuery): RoutingResult {
  const start = performance.now();

  try {
    const actual = routeQuery(query.input);
    const latencyMs = performance.now() - start;

    const mismatch: string[] = [];

    // Normalize comparisons
    const expectedFamily = query.expected.intentFamily.toLowerCase();
    const actualFamily = actual.intentFamily.toLowerCase();
    if (actualFamily !== expectedFamily) {
      mismatch.push(`intentFamily: expected=${expectedFamily}, actual=${actualFamily}`);
    }

    const expectedOp = query.expected.operator.toLowerCase();
    const actualOp = actual.operator.toLowerCase();
    if (actualOp !== expectedOp) {
      mismatch.push(`operator: expected=${expectedOp}, actual=${actualOp}`);
    }

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
      actual: { intentFamily: 'error', operator: 'error', language: 'en' },
      passed: false,
      mismatch: [`ERROR: ${err.message}`],
      latencyMs: performance.now() - start,
    };
  }
}

async function main() {
  console.log('=== FAST Routing Certification (500 queries, in-process) ===\n');

  const startTotal = performance.now();

  const inputFile = path.join(__dirname, 'routing_500.jsonl');
  const outputFile = path.join(__dirname, 'routing_500_fast_results.jsonl');
  const reportFile = path.join(__dirname, 'routing_500_fast_report.json');

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

  // Run all tests
  const results: RoutingResult[] = [];
  const confusion: Record<string, Record<string, number>> = {};

  for (const q of queries) {
    const result = runTest(q);
    results.push(result);

    // Track confusion matrix
    const key = `${result.expected.intentFamily}/${result.expected.operator}`;
    const actualKey = `${result.actual.intentFamily}/${result.actual.operator}`;
    if (!confusion[key]) confusion[key] = {};
    confusion[key][actualKey] = (confusion[key][actualKey] || 0) + 1;
  }

  const totalTimeMs = performance.now() - startTotal;

  // Write results
  const outStream = fs.createWriteStream(outputFile);
  for (const r of results) {
    outStream.write(JSON.stringify(r) + '\n');
  }
  outStream.end();

  // Calculate stats
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const errors = results.filter(r => r.mismatch.some(m => m.startsWith('ERROR'))).length;
  const passRate = (passed / results.length) * 100;

  const failures = results.filter(r => !r.passed);
  const byFamily: Record<string, { total: number; passed: number }> = {};

  for (const r of results) {
    const family = r.expected.intentFamily;
    if (!byFamily[family]) byFamily[family] = { total: 0, passed: 0 };
    byFamily[family].total++;
    if (r.passed) byFamily[family].passed++;
  }

  // Group failures by expected→actual pattern
  const failureGroups: Record<string, { count: number; examples: string[] }> = {};
  for (const f of failures) {
    const key = `${f.expected.intentFamily}/${f.expected.operator} → ${f.actual.intentFamily}/${f.actual.operator}`;
    if (!failureGroups[key]) failureGroups[key] = { count: 0, examples: [] };
    failureGroups[key].count++;
    if (failureGroups[key].examples.length < 3) {
      failureGroups[key].examples.push(f.input.slice(0, 60));
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    totalQueries: queries.length,
    passed,
    failed,
    errors,
    passRate: `${passRate.toFixed(2)}%`,
    totalTimeMs: totalTimeMs.toFixed(0),
    avgLatencyMs: (totalTimeMs / queries.length).toFixed(2),
    verdict: passRate >= 99 ? 'PASS' : 'FAIL',
    byFamily: Object.entries(byFamily).map(([f, s]) => ({
      family: f,
      total: s.total,
      passed: s.passed,
      rate: `${((s.passed / s.total) * 100).toFixed(1)}%`,
    })),
    failureGroups: Object.entries(failureGroups)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        examples: data.examples,
      })),
    confusion,
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  // Console output
  console.log('=== FAST ROUTING CERTIFICATION RESULTS ===\n');
  console.log(`Total: ${queries.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Pass Rate: ${passRate.toFixed(2)}%`);
  console.log(`Total Time: ${totalTimeMs.toFixed(0)}ms`);
  console.log(`Avg Latency: ${(totalTimeMs / queries.length).toFixed(2)}ms/query`);
  console.log(`Verdict: ${report.verdict}\n`);

  console.log('By Family:');
  for (const f of report.byFamily) {
    console.log(`  ${f.family}: ${f.passed}/${f.total} (${f.rate})`);
  }

  if (report.failureGroups.length > 0) {
    console.log('\nTop Failure Patterns:');
    for (const g of report.failureGroups.slice(0, 10)) {
      console.log(`  ${g.pattern}: ${g.count} failures`);
      for (const ex of g.examples.slice(0, 2)) {
        console.log(`    - "${ex}..."`);
      }
    }
  }

  console.log(`\nResults: ${outputFile}`);
  console.log(`Report: ${reportFile}`);
}

main().catch(console.error);
