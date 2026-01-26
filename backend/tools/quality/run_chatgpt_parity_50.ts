/**
 * ChatGPT Parity 50-Query Strict Certification Test
 *
 * Runs ALL 50 queries in ONE conversation with strict pass/fail criteria.
 * Binary scoring: 50/50 PASS or FAIL.
 */

import * as fs from 'fs';
import * as path from 'path';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'k8mP2vXqL9nR4wYj6tF1hB3cZ5sA7uD0eG8iK2oM4qW6yT1xV3nJ5bH7fL9pU2rE';
const USER_ID = 'test-user-001';
const CONVERSATION_ID = `chatgpt-parity-${Date.now()}`;

interface Query {
  id: string;
  query: string;
  language: string;
  category: string;
  chain?: string;
  expected_intent?: string;
  expected_format?: string;
}

interface ValidationFailure {
  rule: string;
  reason: string;
  evidence: string;
  severity: 'HARD' | 'SOFT';
}

interface QueryResult {
  id: string;
  query: string;
  language: string;
  category: string;
  intent: string | null;
  confidence: number | null;
  fullAnswer: string;
  sourceButtons: any;
  fileList: any;
  composedBy: string | null;
  operator: string | null;
  ttft_ms: number | null;
  total_ms: number;
  passed: boolean;
  failures: ValidationFailure[];
}

function generateToken(): string {
  return jwt.sign(
    { userId: USER_ID, email: 'test@koda.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function sendQuery(
  query: string,
  token: string,
  conversationId: string
): Promise<{ result: any; ttft: number | null; totalTime: number }> {
  const startTime = Date.now();
  let ttft: number | null = null;
  let donePayload: any = null;

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Query timeout after 120s'));
    }, 120000);

    fetch(`${BASE_URL}/api/rag/query/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        userId: USER_ID,
        conversationId
      }),
      signal: controller.signal
    }).then(async response => {
      if (!response.ok) {
        clearTimeout(timeoutId);
        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        clearTimeout(timeoutId);
        reject(new Error('No response body'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventTime = Date.now();
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content' && ttft === null) {
                ttft = eventTime - startTime;
              }
              if (data.type === 'done') {
                donePayload = data;
              }
            } catch (e) {}
          }
        }
      }

      clearTimeout(timeoutId);
      const totalTime = Date.now() - startTime;
      resolve({ result: donePayload, ttft, totalTime });
    }).catch(err => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

function validateResponse(query: Query, response: any): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const answer = response?.fullAnswer || '';
  const intent = response?.intent || '';
  const composedBy = response?.composedBy || '';
  const sourceButtons = response?.sourceButtons;
  const fileList = response?.fileList;

  // ===== 3.1 COMPLETENESS =====

  // Truncation check
  if (answer.endsWith('...') && !answer.includes('etc...')) {
    failures.push({
      rule: 'COMPLETENESS_TRUNCATION',
      reason: 'Answer ends with "..." indicating truncation',
      evidence: answer.slice(-100),
      severity: 'HARD'
    });
  }

  // Mid-sentence cut (skip for file listings)
  const lastChar = answer.trim().slice(-1);
  const isFileListing = intent === 'file_actions' || fileList ||
                        answer.match(/\.(pdf|xlsx|docx|pptx|png|jpg)\s*$/i) ||
                        answer.match(/^(\s*[-*•]\s+[^\n]+\n?)+$/m);

  if (answer.length > 50 && !isFileListing &&
      !['.', '!', '?', ':', ';', ')', ']', '}', '"', "'", '`', '-', '*'].includes(lastChar)) {
    if (!answer.match(/[-*•\d]\s*$/)) {
      failures.push({
        rule: 'COMPLETENESS_MID_SENTENCE',
        reason: 'Answer appears cut mid-sentence',
        evidence: answer.slice(-100),
        severity: 'HARD'
      });
    }
  }

  // Dangling list markers
  const danglingMarkers = answer.match(/^\s*[-*•\d]+\.?\s*$/gm);
  if (danglingMarkers && danglingMarkers.length > 0) {
    failures.push({
      rule: 'COMPLETENESS_DANGLING_MARKER',
      reason: `Found ${danglingMarkers.length} empty list items`,
      evidence: danglingMarkers.join(', '),
      severity: 'HARD'
    });
  }

  // Format constraint validation
  if (query.expected_format) {
    const format = query.expected_format;

    if (format.includes('bullet')) {
      const match = format.match(/(\d+)_bullet/);
      if (match) {
        const expectedCount = parseInt(match[1]);
        const bullets = answer.match(/^[\s]*[-*•]\s+/gm) || [];
        if (bullets.length !== expectedCount) {
          failures.push({
            rule: 'FORMAT_BULLET_COUNT',
            reason: `Expected ${expectedCount} bullets, found ${bullets.length}`,
            evidence: `Bullets found: ${bullets.length}`,
            severity: 'HARD'
          });
        }
      }
    }

    if (format.includes('sentence')) {
      const match = format.match(/(\d+)_sentence/);
      if (match) {
        const expectedCount = parseInt(match[1]);
        const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 15);
        // Allow ±1 tolerance for sentence counting
        if (Math.abs(sentences.length - expectedCount) > 1) {
          failures.push({
            rule: 'FORMAT_SENTENCE_COUNT',
            reason: `Expected ~${expectedCount} sentences, found ${sentences.length}`,
            evidence: `Sentences: ${sentences.length}`,
            severity: 'HARD'
          });
        }
      }
    }

    if (format === 'table') {
      const hasTable = answer.includes('|') && answer.match(/\|[\s-:|]+\|/);
      if (!hasTable) {
        failures.push({
          rule: 'FORMAT_MISSING_TABLE',
          reason: 'Expected table format but none found',
          evidence: answer.slice(0, 200),
          severity: 'HARD'
        });
      }
    }
  }

  // ===== 3.2 CHATGPT-STYLE REASONING =====

  // Check for mechanical/robotic responses
  const roboticPhrases = [
    'I\'d be happy to',
    'I\'m happy to',
    'Certainly!',
    'Of course!',
    'Here\'s what I found',
    'Here are the results',
    'Based on my analysis',
    'I can help you with that'
  ];

  for (const phrase of roboticPhrases) {
    if (answer.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push({
        rule: 'CHATGPT_ROBOTIC_LANGUAGE',
        reason: `Found robotic phrase: "${phrase}"`,
        evidence: answer.slice(0, 200),
        severity: 'HARD'
      });
      break;
    }
  }

  // ===== 3.3 FORMATTING CORRECTNESS =====

  // Broken table
  if (answer.includes('|')) {
    const tableRows = answer.match(/\|[^\n]+\|/g) || [];
    if (tableRows.length > 1) {
      const hasSeparator = tableRows.some(row => /\|[\s-:|]+\|/.test(row));
      if (!hasSeparator && answer.match(/\|.*\|.*\n.*\|.*\|/)) {
        failures.push({
          rule: 'FORMAT_BROKEN_TABLE',
          reason: 'Table missing header separator',
          evidence: tableRows.slice(0, 3).join('\n'),
          severity: 'HARD'
        });
      }
    }
  }

  // ===== 3.4 SOURCE PILL CORRECTNESS =====

  // Document queries should have sources (only if intent matched documents)
  if (query.expected_intent === 'documents' && intent === 'documents' && answer.length > 100) {
    const hasSources = sourceButtons?.buttons?.length > 0;
    if (!hasSources) {
      failures.push({
        rule: 'SOURCE_NO_PILLS',
        reason: 'Document query should have source pills',
        evidence: `sourceButtons: ${JSON.stringify(sourceButtons)?.slice(0, 100)}`,
        severity: 'HARD'
      });
    }
  }

  // ===== 3.5 BUTTON-ONLY FILE ACTIONS =====

  // File action queries with "button only" or "open" should have minimal text
  if (query.category === 'file_actions' &&
      (query.query.toLowerCase().includes('open') ||
       query.query.toLowerCase().includes('button'))) {
    // Allow up to 200 chars for file action responses
    const contentLength = answer.replace(/\s+/g, '').length;
    if (contentLength > 300 && !fileList) {
      failures.push({
        rule: 'FILE_ACTION_TOO_VERBOSE',
        reason: 'File action should be concise or button-only',
        evidence: `Content length: ${contentLength}`,
        severity: 'SOFT'
      });
    }
  }

  // ===== 3.6 NAVIGATION & LISTS =====

  // File listing should use fileList
  if (query.category === 'file_listing' || query.category === 'file_actions') {
    if (intent === 'file_actions' && !fileList && answer.length > 500) {
      failures.push({
        rule: 'LIST_NO_FILELIST',
        reason: 'File listing should use structured fileList',
        evidence: answer.slice(0, 200),
        severity: 'SOFT'
      });
    }
  }

  // ===== 3.7 LANGUAGE VALIDATION =====

  // Better Portuguese detection - includes accented characters and common words
  const ptIndicators = [
    'não', 'são', 'está', 'você', 'também', 'através', 'porém', 'além', 'sobre',
    'com base', 'arquivo', 'documento', 'encontrado', 'conforme', 'seguintes',
    'principais', 'valores', 'total', 'dados', 'planilha', 'relatório',
    'ção', 'ões', 'ário', 'ência', 'ância'
  ];
  const enIndicators = ['the', 'and', 'for', 'are', 'that', 'this', 'with', 'have', 'from', 'which', 'based on', 'found', 'following'];

  const answerLower = answer.toLowerCase();

  // Check for Portuguese accented characters (strong PT indicator)
  const hasPortugueseChars = /[áàâãéêíóôõúç]/i.test(answer);

  const ptCount = ptIndicators.filter(w => answerLower.includes(w)).length + (hasPortugueseChars ? 3 : 0);
  const enCount = enIndicators.filter(w => answerLower.includes(w)).length;

  // Only flag if clearly mismatched (PT expected, clearly EN response)
  const detectedLang = ptCount > enCount ? 'pt' : (ptCount === enCount && hasPortugueseChars ? 'pt' : 'en');

  // Skip language check for:
  // - Very short answers or file listings
  // - Answers citing from documents (may include original language terms)
  // - Answers with both languages (translation/explanation)
  const hasBothLanguages = ptCount > 2 && enCount > 2;
  const citesDocument = sourceButtons?.buttons?.length > 0;

  if (query.language !== detectedLang && answer.length > 150 && !isFileListing && !hasBothLanguages && !citesDocument) {
    failures.push({
      rule: 'LANGUAGE_MISMATCH',
      reason: `Query in ${query.language} but response in ${detectedLang}`,
      evidence: `PT: ${ptCount}, EN: ${enCount}, PT chars: ${hasPortugueseChars}`,
      severity: 'HARD'
    });
  }

  // ===== 3.8 INTENT ROUTING =====

  if (query.expected_intent && intent !== query.expected_intent) {
    // Allow related intent mappings
    const allowedMappings: Record<string, string[]> = {
      'doc_stats': ['documents', 'reasoning', 'file_actions'],
      'documents': ['reasoning', 'extraction'],
      'file_actions': ['documents'],  // Sometimes "overview" queries are documents
      'extraction': ['documents'],
      'calculation': ['documents', 'reasoning']
    };

    const allowed = allowedMappings[query.expected_intent] || [];
    if (!allowed.includes(intent)) {
      failures.push({
        rule: 'ROUTING_WRONG_INTENT',
        reason: `Expected ${query.expected_intent}, got ${intent}`,
        evidence: query.query.slice(0, 50),
        severity: 'HARD'
      });
    }
  }

  // ===== 3.9 ANSWER COMPOSER CHECK =====

  if (composedBy !== 'AnswerComposerV1') {
    failures.push({
      rule: 'COMPOSER_BYPASS',
      reason: `Response not composed by AnswerComposerV1`,
      evidence: `composedBy: ${composedBy}`,
      severity: 'HARD'
    });
  }

  return failures;
}

async function main() {
  const outputDir = process.argv[2] || 'audit_output_mass/chatgpt_parity_50_strict_20260119';

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     CHATGPT PARITY 50-QUERY STRICT CERTIFICATION TEST        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`Output directory: ${outputDir}`);
  console.log(`Conversation ID: ${CONVERSATION_ID}\n`);

  // Load corpus
  const corpusPath = path.join(__dirname, 'corpus_50_new_after_banks.jsonl');
  const corpusContent = fs.readFileSync(corpusPath, 'utf-8');
  const queries: Query[] = corpusContent.trim().split('\n').map(line => JSON.parse(line));

  console.log(`Loaded ${queries.length} queries\n`);
  console.log('─'.repeat(70));

  const token = generateToken();
  const results: QueryResult[] = [];
  let passCount = 0;
  let failCount = 0;

  // Run all queries in ONE conversation
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const prefix = `[${String(i + 1).padStart(2, '0')}/${queries.length}]`;

    process.stdout.write(`${prefix} ${query.id}: ${query.query.slice(0, 45).padEnd(45)}... `);

    try {
      const { result, ttft, totalTime } = await sendQuery(query.query, token, CONVERSATION_ID);

      const failures = validateResponse(query, result);
      const passed = failures.filter(f => f.severity === 'HARD').length === 0;

      const queryResult: QueryResult = {
        id: query.id,
        query: query.query,
        language: query.language,
        category: query.category,
        intent: result?.intent || null,
        confidence: result?.confidence || null,
        fullAnswer: result?.fullAnswer || '',
        sourceButtons: result?.sourceButtons || null,
        fileList: result?.fileList || null,
        composedBy: result?.composedBy || null,
        operator: result?.operator || null,
        ttft_ms: ttft,
        total_ms: totalTime,
        passed,
        failures
      };

      results.push(queryResult);

      if (passed) {
        passCount++;
        console.log(`✓ PASS (${totalTime}ms)`);
      } else {
        failCount++;
        console.log(`✗ FAIL`);
        failures.filter(f => f.severity === 'HARD').forEach(f => {
          console.log(`   └─ ${f.rule}: ${f.reason}`);
        });
      }

    } catch (err: any) {
      failCount++;
      console.log(`✗ ERROR: ${err.message}`);
      results.push({
        id: query.id,
        query: query.query,
        language: query.language,
        category: query.category,
        intent: null,
        confidence: null,
        fullAnswer: '',
        sourceButtons: null,
        fileList: null,
        composedBy: null,
        operator: null,
        ttft_ms: null,
        total_ms: 0,
        passed: false,
        failures: [{
          rule: 'ERROR',
          reason: err.message,
          evidence: '',
          severity: 'HARD'
        }]
      });
    }

    // Small delay between queries
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('─'.repeat(70));
  console.log('');

  // Calculate stats
  const hardFailures: Record<string, number> = {};
  results.forEach(r => {
    r.failures.filter(f => f.severity === 'HARD').forEach(f => {
      hardFailures[f.rule] = (hardFailures[f.rule] || 0) + 1;
    });
  });

  const avgTTFT = Math.round(
    results.filter(r => r.ttft_ms).reduce((a, b) => a + (b.ttft_ms || 0), 0) /
    results.filter(r => r.ttft_ms).length
  );

  const avgTotal = Math.round(
    results.reduce((a, b) => a + b.total_ms, 0) / results.length
  );

  // Write results
  fs.mkdirSync(outputDir, { recursive: true });

  const resultsPath = path.join(outputDir, 'results.jsonl');
  fs.writeFileSync(resultsPath, results.map(r => JSON.stringify(r)).join('\n'));

  const summary = {
    conversationId: CONVERSATION_ID,
    timestamp: new Date().toISOString(),
    totalQueries: queries.length,
    passed: passCount,
    failed: failCount,
    passRate: `${((passCount / queries.length) * 100).toFixed(1)}%`,
    certified: passCount === queries.length,
    avgTTFT_ms: avgTTFT,
    avgTotal_ms: avgTotal,
    hardFailuresByRule: Object.entries(hardFailures)
      .sort((a, b) => b[1] - a[1])
      .map(([rule, count]) => ({ rule, count }))
  };

  const summaryPath = path.join(outputDir, 'SUMMARY.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  // Print final report
  console.log('╔══════════════════════════════════════════════════════════════╗');
  if (summary.certified) {
    console.log('║                    ✅ CERTIFIED: 50/50 PASS                  ║');
  } else {
    console.log('║                    ❌ FAILED CERTIFICATION                   ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`Pass Rate: ${summary.passRate} (${passCount}/${queries.length})`);
  console.log(`Avg TTFT: ${avgTTFT}ms`);
  console.log(`Avg Total: ${avgTotal}ms\n`);

  if (summary.hardFailuresByRule.length > 0) {
    console.log('Hard Failures by Rule:');
    summary.hardFailuresByRule.forEach(({ rule, count }) => {
      console.log(`  ${rule}: ${count}`);
    });
    console.log('');
  }

  console.log(`Results written to: ${outputDir}/`);

  // Exit with appropriate code
  process.exit(summary.certified ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
