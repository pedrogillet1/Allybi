/**
 * Strict Certification Suite Runner
 *
 * Runs all queries in ONE conversation, sequentially, capturing full SSE streams.
 * Validates responses with strict rules.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import jwt from 'jsonwebtoken';

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'k8mP2vXqL9nR4wYj6tF1hB3cZ5sA7uD0eG8iK2oM4qW6yT1xV3nJ5bH7fL9pU2rE';
const USER_ID = 'test-user-001';
const AUDIT_DIR = process.argv[2] || 'audit_output_mass/strict_certification_20260117T153349';
const CONVERSATION_ID = process.argv[3] || `strict-cert-${Date.now()}`;
const FAILFAST = process.env.FAILFAST === '1' || process.argv.includes('--failfast');

interface CorpusQuery {
  id: string;
  query: string;
  lang: string;
  category: string;
  constraints: Record<string, any>;
  chain: string | null;
}

interface SSEEvent {
  queryId: string;
  timestamp: number;
  type: string;
  data: any;
}

interface QueryResult {
  id: string;
  query: string;
  lang: string;
  category: string;
  constraints: Record<string, any>;
  chain: string | null;
  conversationId: string;
  ttft_ms: number | null;
  total_ms: number;
  intent: string | null;
  confidence: number | null;
  fullAnswer: string;
  formatted: string;
  sourceButtons: any;
  fileList: any;  // For inventory list responses
  sources: any[];
  attachments: any[];
  documentsUsed: number;
  wasTruncated: boolean;
  error: string | null;
}

interface ValidationResult {
  queryId: string;
  passed: boolean;
  failures: ValidationFailure[];
}

interface ValidationFailure {
  rule: string;
  reason: string;
  evidence: string;
  severity: 'hard' | 'soft';
}

// Generate auth token
function generateToken(): string {
  return jwt.sign(
    { userId: USER_ID, email: 'test@koda.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Load corpus
function loadCorpus(auditDir: string): CorpusQuery[] {
  const corpusPath = path.join(auditDir, 'corpus.jsonl');
  const content = fs.readFileSync(corpusPath, 'utf-8');
  return content.trim().split('\n').map(line => JSON.parse(line));
}

// Send SSE query and collect all events
async function sendQuery(
  query: string,
  token: string,
  conversationId: string
): Promise<{ events: SSEEvent[], result: any, ttft: number | null, totalTime: number }> {
  const startTime = Date.now();
  let ttft: number | null = null;
  const events: SSEEvent[] = [];
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
        'Content-Type': 'application/json',
        'x-koda-debug-routing': '1'
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
              events.push({
                queryId: '',
                timestamp: eventTime,
                type: data.type,
                data
              });

              if (data.type === 'content' && ttft === null) {
                ttft = eventTime - startTime;
              }

              if (data.type === 'done') {
                donePayload = data;
              }
            } catch (e) {
              // Skip non-JSON lines
            }
          }
        }
      }

      clearTimeout(timeoutId);
      const totalTime = Date.now() - startTime;
      resolve({ events, result: donePayload, ttft, totalTime });
    }).catch(err => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

// Validate a single query result
function validateResult(query: CorpusQuery, result: QueryResult): ValidationResult {
  const failures: ValidationFailure[] = [];
  const constraints = query.constraints;
  const answer = result.fullAnswer || '';
  const formatted = result.formatted || answer;

  // 3.1 COMPLETENESS VALIDATION

  // Check for truncation
  if (answer.endsWith('...') && !answer.endsWith('etc...')) {
    failures.push({
      rule: 'COMPLETENESS_TRUNCATION',
      reason: 'Answer ends with "..." indicating truncation',
      evidence: answer.slice(-120),
      severity: 'hard'
    });
  }

  // Check for mid-sentence cut (skip for button_only where answer is minimal)
  const lastChar = answer.trim().slice(-1);
  if (answer.length > 50 && !['.', '!', '?', ':', ';', ')', ']', '}', '"', "'", '`', '*'].includes(lastChar)) {
    // Allow if it's a list item (last line starts with - * • or number), table, or ends with file extension
    const endsWithFileExt = /\.(pdf|xlsx|pptx|docx|png|jpg|jpeg|md|txt|csv|json)$/i.test(answer.trim());
    const lines = answer.trim().split('\n');
    const lastLine = lines[lines.length - 1]?.trim() || '';
    const lastLineIsListItem = /^[-*•]\s+.+|^\d+\.\s+.+/.test(lastLine);
    // Allow folder paths like "trabalhos / work / folder / 1" - digits/words after slash
    const endsWithFolderPath = /\/\s*[\w\d]+\**$/.test(answer.trim());
    if (!lastLineIsListItem && !endsWithFileExt && !endsWithFolderPath && !constraints.button_only) {
      failures.push({
        rule: 'COMPLETENESS_MID_SENTENCE',
        reason: 'Answer appears cut mid-sentence',
        evidence: answer.slice(-120),
        severity: 'hard'
      });
    }
  }

  // Check for dangling list markers (but NOT pure numbers which are valid count responses)
  // Dangling markers: "1." "- " "• " but NOT "48" (valid count)
  const danglingMarkers = answer.match(/^\s*(?:[-*•]+|\d+\.)\s*$/gm);
  if (danglingMarkers && danglingMarkers.length > 0) {
    failures.push({
      rule: 'COMPLETENESS_DANGLING_MARKER',
      reason: `Found ${danglingMarkers.length} dangling list markers`,
      evidence: danglingMarkers.join(', '),
      severity: 'hard'
    });
  }

  // Check for broken table markup
  if (constraints.expect_table || answer.includes('|')) {
    const tableRows = answer.match(/\|[^\n]+\|/g) || [];
    if (tableRows.length > 0) {
      // Check for header separator
      const hasSeparator = tableRows.some(row => /\|[\s-:|]+\|/.test(row));
      if (tableRows.length > 1 && !hasSeparator) {
        failures.push({
          rule: 'COMPLETENESS_BROKEN_TABLE',
          reason: 'Table missing header separator row (|---|)',
          evidence: tableRows.slice(0, 3).join('\n'),
          severity: 'hard'
        });
      }
    } else if (constraints.expect_table) {
      failures.push({
        rule: 'COMPLETENESS_MISSING_TABLE',
        reason: 'Expected table format but none found',
        evidence: answer.slice(0, 200),
        severity: 'hard'
      });
    }
  }

  // Check exact bullet count
  if (constraints.exact_bullets) {
    const bullets = answer.match(/^[\s]*[-*•]\s+/gm) || [];
    if (bullets.length !== constraints.exact_bullets) {
      failures.push({
        rule: 'COMPLETENESS_BULLET_COUNT',
        reason: `Expected exactly ${constraints.exact_bullets} bullets, found ${bullets.length}`,
        evidence: `Found bullets: ${bullets.length}`,
        severity: 'hard'
      });
    }
  }

  // Check exact numbered items count
  if (constraints.exact_numbered_items) {
    const numbered = answer.match(/^[\s]*\d+\.\s+/gm) || [];
    if (numbered.length !== constraints.exact_numbered_items) {
      failures.push({
        rule: 'COMPLETENESS_NUMBERED_COUNT',
        reason: `Expected exactly ${constraints.exact_numbered_items} numbered items, found ${numbered.length}`,
        evidence: `Found numbered items: ${numbered.length}`,
        severity: 'hard'
      });
    }
  }

  // Check exact sentence count
  if (constraints.exact_sentences) {
    // Count sentences by periods followed by space or end
    const sentences = answer.split(/[.!?]+\s+/).filter(s => s.trim().length > 10);
    if (sentences.length !== constraints.exact_sentences) {
      failures.push({
        rule: 'COMPLETENESS_SENTENCE_COUNT',
        reason: `Expected exactly ${constraints.exact_sentences} sentences, found ~${sentences.length}`,
        evidence: `Approximate sentence count: ${sentences.length}`,
        severity: 'hard'
      });
    }
  }

  // Check exact paragraph count
  if (constraints.exact_paragraphs) {
    const paragraphs = answer.split(/\n\n+/).filter(p => p.trim().length > 20);
    if (paragraphs.length !== constraints.exact_paragraphs) {
      failures.push({
        rule: 'COMPLETENESS_PARAGRAPH_COUNT',
        reason: `Expected exactly ${constraints.exact_paragraphs} paragraphs, found ${paragraphs.length}`,
        evidence: `Found paragraphs: ${paragraphs.length}`,
        severity: 'hard'
      });
    }
  }

  // Check button-only constraint
  if (constraints.button_only) {
    const contentLength = answer.replace(/\s+/g, '').length;
    if (contentLength > 100) {  // Allow small preambles
      failures.push({
        rule: 'COMPLETENESS_BUTTON_ONLY',
        reason: 'File action response should be button-only but has content',
        evidence: answer.slice(0, 200),
        severity: 'hard'
      });
    }
  }

  // 3.2 MISSING INFORMATION VALIDATION

  // Check if answer addresses the query type
  if (constraints.must_contain) {
    const searchTerm = constraints.must_contain.toLowerCase();
    if (!answer.toLowerCase().includes(searchTerm)) {
      failures.push({
        rule: 'MISSING_INFO_REQUIRED_TERM',
        reason: `Answer must contain "${constraints.must_contain}"`,
        evidence: answer.slice(0, 200),
        severity: 'hard'
      });
    }
  }

  if (constraints.must_contain_number) {
    const hasNumber = /\d+([.,]\d+)?/.test(answer);
    if (!hasNumber) {
      failures.push({
        rule: 'MISSING_INFO_NUMBER',
        reason: 'Finance query requires numeric answer but none found',
        evidence: answer.slice(0, 200),
        severity: 'hard'
      });
    }
  }

  if (constraints.must_list_docs) {
    // Check if answer lists documents (via content or sourceButtons/fileList)
    const listsDocuments = answer.toLowerCase().includes('document') ||
                          answer.includes('.pdf') ||
                          answer.includes('.xlsx') ||
                          answer.includes('.pptx') ||
                          answer.includes('.docx') ||
                          result.sourceButtons?.buttons?.length > 0 ||
                          result.fileList?.items?.length > 0;
    if (!listsDocuments) {
      failures.push({
        rule: 'MISSING_INFO_DOC_LIST',
        reason: 'Locator query should list specific documents',
        evidence: answer.slice(0, 200),
        severity: 'hard'
      });
    }
  }

  // 3.3 HALLUCINATION / DRIFT VALIDATION

  // Check that doc-grounded answers have sources
  if (constraints.expect_intent === 'documents' && !constraints.button_only) {
    const hasSources = result.sourceButtons?.buttons?.length > 0 ||
                       result.sources?.length > 0 ||
                       result.documentsUsed > 0;
    if (!hasSources && answer.length > 100) {
      failures.push({
        rule: 'DRIFT_NO_SOURCES',
        reason: 'Document query answered without source references',
        evidence: `sourceButtons: ${result.sourceButtons?.buttons?.length || 0}, sources: ${result.sources?.length || 0}`,
        severity: 'hard'
      });
    }
  }

  // Check for correct document type citation
  if (constraints.must_cite) {
    const extension = constraints.must_cite.toLowerCase();
    const buttons = result.sourceButtons?.buttons || [];
    const hasCitation = buttons.some((btn: any) =>
      btn.title?.toLowerCase().includes(extension) ||
      btn.mimeType?.includes(extension === 'xlsx' ? 'spreadsheet' : extension)
    );
    if (!hasCitation) {
      failures.push({
        rule: 'DRIFT_WRONG_DOC_TYPE',
        reason: `Expected citation from ${extension} document but none found`,
        evidence: `Buttons: ${buttons.map((b: any) => b.title).join(', ').slice(0, 100)}`,
        severity: 'hard'
      });
    }
  }

  // 3.4 LANGUAGE VALIDATION
  // Skip language check for inventory category - file names are language-neutral
  const isInventoryCategory = query.category === 'inventory';

  // Check if answer is mostly file names (list items with file extensions)
  const lines = answer.trim().split('\n').filter((l: string) => l.trim());
  const fileNameLines = lines.filter((l: string) => /\.(pdf|xlsx|docx|pptx|png|jpg|csv)(\s|$)/i.test(l));
  const isMostlyFileNames = lines.length > 0 && fileNameLines.length >= lines.length * 0.7;

  if (!isInventoryCategory && !isMostlyFileNames) {
    // Detect language of response
    const ptIndicators = ['não', 'são', 'está', 'você', 'também', 'através', 'porém', 'além', 'sobre', 'principais'];
    const enIndicators = ['the', 'and', 'for', 'are', 'that', 'this', 'with', 'have', 'from', 'about'];

    const answerLower = answer.toLowerCase();
    const ptCount = ptIndicators.filter(w => answerLower.includes(w)).length;
    const enCount = enIndicators.filter(w => answerLower.includes(w)).length;

    const detectedLang = ptCount > enCount ? 'pt' : 'en';

    if (query.lang !== detectedLang && answer.length > 50) {
      failures.push({
        rule: 'LANGUAGE_MISMATCH',
        reason: `Query in ${query.lang} but response appears to be ${detectedLang}`,
        evidence: `PT indicators: ${ptCount}, EN indicators: ${enCount}`,
        severity: 'hard'
      });
    }
  }

  // 3.5 UI CONTRACT VALIDATION

  // Check intent routing
  if (constraints.expect_intent && result.intent !== constraints.expect_intent) {
    failures.push({
      rule: 'ROUTING_WRONG_INTENT',
      reason: `Expected intent "${constraints.expect_intent}" but got "${result.intent}"`,
      evidence: `Query: ${query.query.slice(0, 50)}`,
      severity: 'hard'
    });
  }

  // Check sourceButtons or fileList or attachments for inventory/file actions
  if (constraints.expect_sourceButtons) {
    const hasButtons = result.sourceButtons?.buttons?.length > 0;
    const hasFileList = result.fileList?.items?.length > 0;
    const hasAttachments = result.attachments?.length > 0;
    if (!hasButtons && !hasFileList && !hasAttachments) {
      failures.push({
        rule: 'UI_NO_SOURCE_BUTTONS',
        reason: 'Expected sourceButtons, fileList, or attachments but none found',
        evidence: `sourceButtons: ${result.sourceButtons?.buttons?.length || 0}, fileList: ${result.fileList?.items?.length || 0}, attachments: ${result.attachments?.length || 0}`,
        severity: 'hard'
      });
    }
  }

  // Check seeAll for inventory (sourceButtons.seeAll or fileList.seeAllLabel)
  if (constraints.expect_seeAll) {
    const hasSeeAll = result.sourceButtons?.seeAll || result.fileList?.seeAllLabel;
    if (!hasSeeAll) {
      failures.push({
        rule: 'UI_NO_SEE_ALL',
        reason: 'Expected seeAll chip but not found',
        evidence: `sourceButtons.seeAll: ${result.sourceButtons?.seeAll || null}, fileList.seeAllLabel: ${result.fileList?.seeAllLabel || null}`,
        severity: 'hard'
      });
    }
  }

  // Check minimum button count (or file list items for inventory, or attachments for locate)
  if (constraints.min_buttons) {
    const buttonCount = result.sourceButtons?.buttons?.length || 0;
    const fileListCount = result.fileList?.items?.length || 0;
    const attachmentsCount = result.attachments?.length || 0;
    const totalCount = Math.max(buttonCount, fileListCount, attachmentsCount);
    if (totalCount < constraints.min_buttons) {
      failures.push({
        rule: 'UI_INSUFFICIENT_BUTTONS',
        reason: `Expected at least ${constraints.min_buttons} buttons/files but got ${totalCount}`,
        evidence: `sourceButtons: ${buttonCount}, fileList: ${fileListCount}, attachments: ${attachmentsCount}`,
        severity: 'hard'
      });
    }
  }

  return {
    queryId: query.id,
    passed: failures.length === 0,
    failures
  };
}

// Main runner
async function main() {
  console.log('=== Strict Certification Suite ===');
  console.log(`Audit directory: ${AUDIT_DIR}`);
  console.log(`Conversation ID: ${CONVERSATION_ID}`);
  console.log('');

  const token = generateToken();
  const corpus = loadCorpus(AUDIT_DIR);
  console.log(`Loaded ${corpus.length} queries from corpus`);

  const allEvents: SSEEvent[] = [];
  const results: QueryResult[] = [];
  const validations: ValidationResult[] = [];

  // Run all queries sequentially in one conversation
  for (let i = 0; i < corpus.length; i++) {
    const query = corpus[i];
    console.log(`[${i + 1}/${corpus.length}] ${query.id}: ${query.query.slice(0, 50)}...`);

    try {
      const { events, result, ttft, totalTime } = await sendQuery(
        query.query,
        token,
        CONVERSATION_ID
      );

      // Add query ID to events
      events.forEach(e => e.queryId = query.id);
      allEvents.push(...events);

      // Build result object
      const queryResult: QueryResult = {
        id: query.id,
        query: query.query,
        lang: query.lang,
        category: query.category,
        constraints: query.constraints,
        chain: query.chain,
        conversationId: CONVERSATION_ID,
        ttft_ms: ttft,
        total_ms: totalTime,
        intent: result?.intent || null,
        confidence: result?.confidence || null,
        fullAnswer: result?.fullAnswer || '',
        formatted: result?.formatted || '',
        sourceButtons: result?.sourceButtons || null,
        fileList: result?.fileList || null,
        sources: result?.sources || [],
        attachments: result?.attachments || [],
        documentsUsed: result?.documentsUsed || 0,
        wasTruncated: result?.wasTruncated || false,
        error: null
      };

      results.push(queryResult);

      // Validate
      const validation = validateResult(query, queryResult);
      validations.push(validation);

      const status = validation.passed ? '✓' : `✗ (${validation.failures.length} failures)`;
      console.log(`   ${status} | Intent: ${queryResult.intent} | TTFT: ${ttft}ms | Total: ${totalTime}ms`);

      if (!validation.passed) {
        validation.failures.forEach(f => {
          console.log(`   ↳ ${f.rule}: ${f.reason}`);
        });
        // FAILFAST: Stop on first hard failure
        if (FAILFAST && validation.failures.some(f => f.severity === 'hard')) {
          console.log('\n⛔ FAILFAST: Stopping on first hard failure');
          break;
        }
      }

    } catch (err: any) {
      console.log(`   ✗ ERROR: ${err.message}`);
      results.push({
        id: query.id,
        query: query.query,
        lang: query.lang,
        category: query.category,
        constraints: query.constraints,
        chain: query.chain,
        conversationId: CONVERSATION_ID,
        ttft_ms: null,
        total_ms: 0,
        intent: null,
        confidence: null,
        fullAnswer: '',
        formatted: '',
        sourceButtons: null,
        fileList: null,
        sources: [],
        attachments: [],
        documentsUsed: 0,
        wasTruncated: false,
        error: err.message
      });
      validations.push({
        queryId: query.id,
        passed: false,
        failures: [{
          rule: 'ERROR',
          reason: err.message,
          evidence: '',
          severity: 'hard'
        }]
      });
    }

    // Small delay between queries to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  // Write output files
  console.log('\n=== Writing output files ===');

  // SSE raw events
  const eventsPath = path.join(AUDIT_DIR, 'sse_raw_events.jsonl');
  fs.writeFileSync(eventsPath, allEvents.map(e => JSON.stringify(e)).join('\n'));
  console.log(`Wrote ${allEvents.length} events to sse_raw_events.jsonl`);

  // Results
  const resultsPath = path.join(AUDIT_DIR, 'results.jsonl');
  fs.writeFileSync(resultsPath, results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`Wrote ${results.length} results to results.jsonl`);

  // Validation results
  const validationPath = path.join(AUDIT_DIR, 'validation_results.jsonl');
  fs.writeFileSync(validationPath, validations.map(v => JSON.stringify(v)).join('\n'));
  console.log(`Wrote ${validations.length} validations to validation_results.jsonl`);

  // Summary
  const passed = validations.filter(v => v.passed).length;
  const failed = validations.filter(v => !v.passed).length;
  const failuresByRule: Record<string, number> = {};

  validations.forEach(v => {
    v.failures.forEach(f => {
      failuresByRule[f.rule] = (failuresByRule[f.rule] || 0) + 1;
    });
  });

  const summary = {
    conversationId: CONVERSATION_ID,
    timestamp: new Date().toISOString(),
    totalQueries: corpus.length,
    passed,
    failed,
    passRate: `${((passed / corpus.length) * 100).toFixed(1)}%`,
    failuresByRule: Object.entries(failuresByRule)
      .sort((a, b) => b[1] - a[1])
      .map(([rule, count]) => ({ rule, count })),
    avgTTFT_ms: Math.round(results.filter(r => r.ttft_ms !== null).reduce((a, b) => a + (b.ttft_ms || 0), 0) / results.filter(r => r.ttft_ms !== null).length),
    avgTotal_ms: Math.round(results.reduce((a, b) => a + b.total_ms, 0) / results.length)
  };

  const summaryPath = path.join(AUDIT_DIR, 'SUMMARY.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log('Wrote SUMMARY.json');

  console.log('\n=== Summary ===');
  console.log(`Pass rate: ${summary.passRate} (${passed}/${corpus.length})`);
  console.log('Top failure categories:');
  summary.failuresByRule.slice(0, 10).forEach(f => {
    console.log(`  ${f.rule}: ${f.count}`);
  });

  return { summary, results, validations };
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
