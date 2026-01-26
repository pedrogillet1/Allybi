#!/usr/bin/env node
/**
 * Comprehensive 50-Query Test with Grading
 *
 * - Runs ALL queries in ONE conversation
 * - Grades each query with strict ChatGPT-feel rules
 * - Outputs detailed audit files
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CORPUS_FILE = process.env.CORPUS_FILE || path.join(__dirname, 'corpus_50_new_after_banks.jsonl');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTPUT_DIR = path.join(__dirname, `../../audit_output_mass/quality_50_new_after_banks_${timestamp}`);

// Grading thresholds
const PASS_RATE_THRESHOLD = 0.90;

async function runQuery(query, conversationId, language = 'en') {
  const start = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/rag/query/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Debug-Routing': 'true',  // Enable routing debug
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

    let fullAnswer = '';
    let streamedContent = '';
    let intent = '';
    let sources = [];
    let actualConversationId = conversationId;
    let metadata = {};
    let fileActions = null;
    let ttft = null;
    let firstChunkTime = null;

    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(5));

        if ((data.type === 'content' || data.type === 'token' || data.type === 'chunk') && data.content) {
          if (!firstChunkTime) {
            firstChunkTime = Date.now();
            ttft = firstChunkTime - start;
          }
          streamedContent += data.content;
        } else if (data.type === 'conversationId') {
          actualConversationId = data.conversationId;
        } else if (data.type === 'action' && data.actionType === 'file_action') {
          fileActions = data;
        } else if (data.type === 'done') {
          intent = data.intent || data.metadata?.intent || data.metadata?.detectedIntent || '';
          sources = data.sources || [];
          fullAnswer = data.fullAnswer || streamedContent;
          metadata = data.metadata || data;
        }
      } catch {}
    }

    return {
      answer: streamedContent,
      fullAnswer: fullAnswer || streamedContent,
      intent,
      sources,
      sourcesCount: sources.length,
      latencyMs: Date.now() - start,
      ttftMs: ttft,
      actualConversationId,
      metadata,
      fileActions,
    };
  } catch (error) {
    return {
      answer: '',
      fullAnswer: '',
      intent: '',
      sources: [],
      sourcesCount: 0,
      latencyMs: Date.now() - start,
      ttftMs: null,
      actualConversationId: conversationId,
      error: error.message,
    };
  }
}

async function loadCorpus(filePath) {
  const queries = [];
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

// === GRADING FUNCTIONS ===

function countBullets(text) {
  const bulletPatterns = [
    /^[\s]*[-•*]\s/gm,       // Markdown bullets
    /^[\s]*\d+\.\s/gm,       // Numbered list
    /^[\s]*[a-z]\)\s/gmi,    // Letter list
  ];

  let count = 0;
  for (const pattern of bulletPatterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function countSentences(text) {
  // Split on sentence-ending punctuation
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  return sentences.length;
}

function hasTable(text) {
  // Check for markdown table patterns
  return /\|.*\|.*\|/m.test(text) || /^\s*\|[-:]+\|/m.test(text);
}

function detectLanguage(text) {
  // Simple language detection
  const ptIndicators = ['não', 'são', 'está', 'você', 'também', 'porque', 'então', 'qual', 'como', 'para', 'mais'];
  const enIndicators = ['the', 'is', 'are', 'and', 'for', 'with', 'that', 'this', 'from', 'have'];

  const lowerText = text.toLowerCase();
  let ptScore = 0;
  let enScore = 0;

  for (const word of ptIndicators) {
    if (lowerText.includes(word)) ptScore++;
  }
  for (const word of enIndicators) {
    if (lowerText.includes(word)) enScore++;
  }

  if (ptScore > enScore + 2) return 'pt';
  if (enScore > ptScore + 2) return 'en';
  return 'mixed';
}

function gradeQuery(q, result) {
  const failures = [];
  let passed = true;

  const answer = result.fullAnswer || result.answer || '';
  const answerLower = answer.toLowerCase();

  // 1. Check for errors
  if (result.error) {
    failures.push(`ERROR: ${result.error}`);
    passed = false;
  }

  // 2. Check for empty/short answers (unless file action with buttons)
  if (answer.length < 20 && !result.fileActions) {
    failures.push('EMPTY_ANSWER: Response too short (<20 chars)');
    passed = false;
  }

  // 3. Intent routing check
  if (q.expected_intent) {
    const detectedIntent = result.intent?.toLowerCase() || '';

    // File actions should route to file_actions
    if (q.expected_intent === 'file_actions' && !detectedIntent.includes('file') && !result.fileActions) {
      // Allow if answer lists files
      if (!answerLower.includes('file') && !answerLower.includes('document') && !answerLower.includes('pdf')) {
        failures.push(`INTENT_MISMATCH: Expected file_actions, got ${result.intent}`);
        passed = false;
      }
    }

    // Document queries should not route to help
    if (q.expected_intent === 'documents' && detectedIntent.includes('help')) {
      failures.push(`INTENT_MISMATCH: Expected documents, got help`);
      passed = false;
    }
  }

  // 4. Language mismatch check
  const detectedLang = detectLanguage(answer);
  if (q.language === 'pt' && detectedLang === 'en' && answer.length > 50) {
    failures.push(`LANGUAGE_MISMATCH: PT query answered in EN`);
    passed = false;
  }
  if (q.language === 'en' && detectedLang === 'pt' && answer.length > 50) {
    failures.push(`LANGUAGE_MISMATCH: EN query answered in PT`);
    passed = false;
  }

  // 5. Formatting constraint checks
  if (q.expected_format) {
    if (q.expected_format === '5_bullets') {
      const bullets = countBullets(answer);
      if (bullets < 4 || bullets > 6) {
        failures.push(`FORMAT_VIOLATION: Expected 5 bullets, got ${bullets}`);
        passed = false;
      }
    }
    if (q.expected_format === '3_bullets') {
      const bullets = countBullets(answer);
      if (bullets < 2 || bullets > 4) {
        failures.push(`FORMAT_VIOLATION: Expected 3 bullets, got ${bullets}`);
        passed = false;
      }
    }
    if (q.expected_format === '2_sentences') {
      const sentences = countSentences(answer);
      if (sentences > 4) {
        failures.push(`FORMAT_VIOLATION: Expected 2 sentences, got ${sentences}`);
        passed = false;
      }
    }
    if (q.expected_format === '3_sentences') {
      const sentences = countSentences(answer);
      if (sentences > 5) {
        failures.push(`FORMAT_VIOLATION: Expected 3 sentences, got ${sentences}`);
        passed = false;
      }
    }
    if (q.expected_format === 'table') {
      if (!hasTable(answer)) {
        failures.push(`FORMAT_VIOLATION: Expected table format, none detected`);
        passed = false;
      }
    }
  }

  // 6. Pronoun follow-up check (for "it" queries)
  if (q.category === 'followup_pronoun') {
    // Should not treat "it" as a filename
    if (answerLower.includes("file named 'it'") ||
        answerLower.includes('file called it') ||
        answerLower.includes("couldn't find a file named")) {
      failures.push(`PRONOUN_FAILURE: Treated pronoun "it" as filename`);
      passed = false;
    }
  }

  // 7. Evidence alignment - document claims with no sources
  if (q.category && (q.category.includes('extraction') || q.category.includes('summary'))) {
    if (result.sourcesCount === 0 && answer.length > 100) {
      // Check if it's making document claims
      if (answerLower.includes('according to') ||
          answerLower.includes('the document') ||
          answerLower.includes('no documento')) {
        failures.push(`EVIDENCE_VIOLATION: Document claim with 0 sources`);
        // Don't fail - just warn
      }
    }
  }

  // 8. File listing UX - check for metadata leaks
  if (q.category === 'file_listing') {
    // Should not show internal IDs or raw metadata
    if (answer.includes('uuid') ||
        /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(answer)) {
      failures.push(`METADATA_LEAK: Internal UUIDs exposed in response`);
      passed = false;
    }
  }

  return {
    passed,
    failures,
    checks: {
      hasContent: answer.length >= 20,
      bulletCount: countBullets(answer),
      sentenceCount: countSentences(answer),
      hasTable: hasTable(answer),
      detectedLanguage: detectedLang,
      sourcesCount: result.sourcesCount,
    }
  };
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error('ERROR: AUTH_TOKEN environment variable required');
    console.error('Generate with: JWT_ACCESS_SECRET="..." node -e "..."');
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load corpus
  const queries = await loadCorpus(CORPUS_FILE);
  console.log(`Loaded ${queries.length} queries from corpus`);

  console.log('\n' + '═'.repeat(80));
  console.log('    COMPREHENSIVE 50-QUERY TEST - Single Conversation with Grading');
  console.log('═'.repeat(80));
  console.log(`Queries: ${queries.length}`);
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Corpus: ${CORPUS_FILE}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('');

  // Single conversation for ALL queries
  let conversationId = `comprehensive-${Date.now()}`;
  const results = [];
  const grades = [];
  let passed = 0;
  let failed = 0;

  // Category tracking
  const categoryResults = {};

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const turnIndex = i + 1;

    process.stdout.write(`[${String(turnIndex).padStart(2, '0')}/${queries.length}] ${q.id}: "${q.query.substring(0, 40)}..." `);

    const result = await runQuery(q.query, conversationId, q.language);

    // Update conversationId
    conversationId = result.actualConversationId;

    // Grade the result
    const grade = gradeQuery(q, result);

    const queryResult = {
      id: q.id,
      query: q.query,
      language: q.language,
      category: q.category,
      chain: q.chain,
      expected_intent: q.expected_intent,
      expected_format: q.expected_format,
      answer: result.fullAnswer || result.answer,
      intent: result.intent,
      sourcesCount: result.sourcesCount,
      latencyMs: result.latencyMs,
      ttftMs: result.ttftMs,
      conversationId,
      turnIndex,
      grade: grade,
      error: result.error,
    };

    results.push(queryResult);
    grades.push({ id: q.id, ...grade });

    // Track category stats
    if (!categoryResults[q.category]) {
      categoryResults[q.category] = { total: 0, passed: 0, failed: 0 };
    }
    categoryResults[q.category].total++;

    if (grade.passed) {
      passed++;
      categoryResults[q.category].passed++;
      console.log(`✅ ${result.latencyMs}ms [${result.intent || 'no-intent'}]`);
    } else {
      failed++;
      categoryResults[q.category].failed++;
      console.log(`❌ ${result.latencyMs}ms - ${grade.failures[0]}`);
    }

    // Delay between queries
    await new Promise(r => setTimeout(r, 400));
  }

  // === SUMMARY ===
  const passRate = (passed / queries.length);

  console.log('\n' + '═'.repeat(80));
  console.log('                         GRADING SUMMARY');
  console.log('═'.repeat(80));
  console.log(`\nOverall: ${passed}/${queries.length} passed (${(passRate * 100).toFixed(1)}%)\n`);

  console.log('By Category:');
  console.log('-'.repeat(60));
  for (const [cat, stats] of Object.entries(categoryResults).sort((a, b) => b[1].failed - a[1].failed)) {
    const rate = ((stats.passed / stats.total) * 100).toFixed(0);
    const status = stats.failed === 0 ? '✅' : '❌';
    console.log(`  ${status} ${cat.padEnd(20)} ${stats.passed}/${stats.total} (${rate}%)`);
  }

  // Failure analysis
  const failedResults = results.filter(r => !r.grade.passed);
  if (failedResults.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('Failed Queries:');
    for (const r of failedResults) {
      console.log(`  ${r.id}: ${r.grade.failures.join(', ')}`);
    }
  }

  // Calculate average latency
  const avgLatency = Math.round(results.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / results.length);

  // === WRITE OUTPUT FILES ===

  // 1. results.jsonl
  const resultsPath = path.join(OUTPUT_DIR, 'results.jsonl');
  fs.writeFileSync(resultsPath, results.map(r => JSON.stringify(r)).join('\n'));

  // 2. summary.json
  const summary = {
    timestamp: new Date().toISOString(),
    conversationId,
    totalQueries: queries.length,
    passed,
    failed,
    passRate: `${(passRate * 100).toFixed(1)}%`,
    passRateThreshold: `${(PASS_RATE_THRESHOLD * 100).toFixed(0)}%`,
    meetsThreshold: passRate >= PASS_RATE_THRESHOLD,
    avgLatencyMs: avgLatency,
    categoryResults,
    corpusFile: CORPUS_FILE,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  // 3. grade_report.json
  const gradeReport = {
    timestamp: new Date().toISOString(),
    totalQueries: queries.length,
    passed,
    failed,
    passRate: `${(passRate * 100).toFixed(1)}%`,
    failureBreakdown: {},
    queryGrades: grades,
  };

  // Count failure types
  for (const g of grades) {
    for (const f of g.failures) {
      const type = f.split(':')[0];
      gradeReport.failureBreakdown[type] = (gradeReport.failureBreakdown[type] || 0) + 1;
    }
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'grade_report.json'), JSON.stringify(gradeReport, null, 2));

  // 4. GRADE_REPORT.md
  const reportMd = `# Quality Test Grade Report

**Timestamp:** ${new Date().toISOString()}
**Conversation ID:** ${conversationId}

## Overall Results

| Metric | Value |
|--------|-------|
| Total Queries | ${queries.length} |
| Passed | ${passed} |
| Failed | ${failed} |
| Pass Rate | ${(passRate * 100).toFixed(1)}% |
| Threshold | ${(PASS_RATE_THRESHOLD * 100).toFixed(0)}% |
| Status | ${passRate >= PASS_RATE_THRESHOLD ? '✅ PASSED' : '❌ FAILED'} |
| Avg Latency | ${avgLatency}ms |

## Results by Category

| Category | Passed | Failed | Rate |
|----------|--------|--------|------|
${Object.entries(categoryResults)
  .sort((a, b) => b[1].failed - a[1].failed)
  .map(([cat, stats]) => `| ${cat} | ${stats.passed} | ${stats.failed} | ${((stats.passed / stats.total) * 100).toFixed(0)}% |`)
  .join('\n')}

## Failure Breakdown

${Object.entries(gradeReport.failureBreakdown).length > 0
  ? Object.entries(gradeReport.failureBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `- **${type}**: ${count} occurrences`)
    .join('\n')
  : 'No failures! 🎉'}

## Failed Queries Detail

${failedResults.length > 0
  ? failedResults.map(r => `### ${r.id}: ${r.query}
- **Category:** ${r.category}
- **Expected:** intent=${r.expected_intent || 'any'}, format=${r.expected_format || 'any'}
- **Got:** intent=${r.intent || 'none'}
- **Failures:** ${r.grade.failures.join('; ')}
- **Answer Preview:** ${(r.answer || '').substring(0, 200)}...
`).join('\n')
  : 'All queries passed! 🎉'}

## Next Steps to Reach 100%

${failedResults.length > 0
  ? `Based on the failures above:
1. ${gradeReport.failureBreakdown['INTENT_MISMATCH'] ? 'Fix intent routing for file_actions vs documents' : 'Intent routing OK'}
2. ${gradeReport.failureBreakdown['LANGUAGE_MISMATCH'] ? 'Fix language detection/response matching' : 'Language matching OK'}
3. ${gradeReport.failureBreakdown['FORMAT_VIOLATION'] ? 'Enforce formatting constraints (bullets, sentences, tables)' : 'Formatting OK'}
4. ${gradeReport.failureBreakdown['PRONOUN_FAILURE'] ? 'Fix pronoun resolution in follow-ups' : 'Pronoun resolution OK'}
5. ${gradeReport.failureBreakdown['EMPTY_ANSWER'] ? 'Ensure all queries get substantive responses' : 'Response coverage OK'}`
  : '✅ All checks passing! System ready for production.'}
`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'GRADE_REPORT.md'), reportMd);

  // 5. format_checks.json
  const formatChecks = results.map(r => ({
    id: r.id,
    expected_format: r.expected_format,
    actual: r.grade.checks,
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'format_checks.json'), JSON.stringify(formatChecks, null, 2));

  // 6. language_checks.json
  const languageChecks = results.map(r => ({
    id: r.id,
    query_language: r.language,
    detected_language: r.grade.checks.detectedLanguage,
    match: r.language === r.grade.checks.detectedLanguage || r.grade.checks.detectedLanguage === 'mixed',
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'language_checks.json'), JSON.stringify(languageChecks, null, 2));

  // Final output
  console.log('\n' + '═'.repeat(80));
  console.log('                         FINAL RESULT');
  console.log('═'.repeat(80));
  console.log(`\nPass Rate: ${(passRate * 100).toFixed(1)}%`);
  console.log(`Threshold: ${(PASS_RATE_THRESHOLD * 100).toFixed(0)}%`);
  console.log(`Status: ${passRate >= PASS_RATE_THRESHOLD ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`\nOutput: ${OUTPUT_DIR}`);
  console.log('');

  if (passRate < PASS_RATE_THRESHOLD) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
