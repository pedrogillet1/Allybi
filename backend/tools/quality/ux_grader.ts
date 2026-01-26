/**
 * UX Grader - Definition of Done Checklist
 *
 * Grades Koda responses against the Definition of Done UX requirements.
 * Categories: Streaming, UI Contract, Routing, Follow-up, Finance, Formatting
 */

import * as fs from 'fs';
import * as readline from 'readline';

interface DoneEventPayload {
  requestId?: string;
  fullAnswer?: string;
  formatted?: string;
  citations?: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    chunkId?: string;
    snippet?: string;
  }>;
  sourceDocumentIds?: string[];
  intent?: string;
  confidence?: number;
  documentsUsed?: number;
  chunksReturned?: number;
  retrievalAdequate?: boolean;
  attachments?: any[];
  actions?: any[];
  referencedFileIds?: string[];
}

interface TestResult {
  id: string;
  query: string;
  intent?: string;
  fullAnswer?: string;
  answer?: string;  // Alternative field name
  sources?: any[];
  citations?: any[];
  error?: string;
  processingTime?: number;
  doneEvent?: DoneEventPayload;
}

interface GradeResult {
  testId: string;
  query: string;
  grades: Record<string, { pass: boolean; reason: string }>;
  overallScore: number;
  passCount: number;
  totalChecks: number;
}

// ============================================================================
// UX CHECKLIST DEFINITIONS (from Definition of Done)
// ============================================================================

const UX_CHECKS = {
  // Area 1: Streaming & Message Integrity
  'S1.1_requestId': {
    area: 'Streaming',
    description: 'Every SSE event includes requestId',
    check: (result: TestResult, done?: DoneEventPayload) => {
      // Check requestId in result or done event
      const hasRequestId = (result as any).requestId || done?.requestId;
      return hasRequestId ? { pass: true, reason: 'requestId present' } : { pass: false, reason: 'Missing requestId' };
    },
  },

  // Area 2: UI Contract
  'U2.1_no_sources_in_body': {
    area: 'UI Contract',
    description: 'Sources NEVER appear in message body as text',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const answer = result.fullAnswer || '';
      const sourcePatterns = [
        /Sources?:\s*\n/i,
        /References?:\s*\n/i,
        /\n\[?\d+\]?\.\s+[\w\s]+\.(pdf|docx|xlsx|pptx)/i,
        /Fontes?:\s*\n/i,
        /Referências?:\s*\n/i,
      ];
      const hasSourcesInBody = sourcePatterns.some(p => p.test(answer));
      return hasSourcesInBody
        ? { pass: false, reason: 'Sources appended to message body' }
        : { pass: true, reason: 'No sources in body' };
    },
  },

  'U2.5_no_metadata_leaks': {
    area: 'UI Contract',
    description: 'No metadata leaks (paths, sizes) unless requested',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const answer = result.fullAnswer || '';
      // Check for file paths (S3 keys, absolute paths)
      const pathPatterns = [
        /s3:\/\//i,
        /\/Users\//i,
        /C:\\Users\\/i,
        /uploads\/[a-f0-9-]+\//i,
        /documents\/[a-f0-9-]+\//i,
        /\.s3\.amazonaws\.com/i,
      ];
      const hasPathLeak = pathPatterns.some(p => p.test(answer));

      // Check for size mentions (unless query asks for size)
      const query = result.query.toLowerCase();
      const asksForSize = /size|tamanho|bytes|kb|mb/i.test(query);
      const sizePattern = /\d+(\.\d+)?\s*(bytes?|kb|mb|gb)/i;
      const hasSizeLeak = !asksForSize && sizePattern.test(answer);

      if (hasPathLeak) return { pass: false, reason: 'File path leaked' };
      if (hasSizeLeak) return { pass: false, reason: 'File size leaked without request' };
      return { pass: true, reason: 'No metadata leaks' };
    },
  },

  // Area 3: Routing Robustness
  'R3.2_content_not_file_actions': {
    area: 'Routing',
    description: '"what is/summarize" NEVER routes to file_actions',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const query = result.query.toLowerCase();
      const contentVerbs = /\b(what is|summarize|explain|describe|tell me about|o que é|resuma|explique)\b/i;
      const isContentQuery = contentVerbs.test(query);
      const isFileActionsIntent = result.intent === 'file_actions' || result.intent === 'FILE_ACTIONS';

      if (isContentQuery && isFileActionsIntent) {
        return { pass: false, reason: 'Content query routed to file_actions' };
      }
      return { pass: true, reason: 'Correct routing' };
    },
  },

  'R3.3_doc_stats_not_inventory': {
    area: 'Routing',
    description: '"pages/slides/sheets" questions NEVER return "48 documents"',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const query = result.query.toLowerCase();
      const docStatsKeywords = /\b(pages?|slides?|sheets?|páginas?|slides?|planilhas?)\b/i;
      const isDocStatsQuery = docStatsKeywords.test(query);
      const answer = result.fullAnswer || '';
      const inventoryPattern = /you have \d+ documents?|você tem \d+ documentos?/i;
      const hasInventoryResponse = inventoryPattern.test(answer);

      if (isDocStatsQuery && hasInventoryResponse) {
        return { pass: false, reason: 'Doc stats query got inventory response' };
      }
      return { pass: true, reason: 'Correct doc stats handling' };
    },
  },

  // Area 4: Follow-up & Memory
  'M4.1_pronoun_resolution': {
    area: 'Follow-up',
    description: '"it/that/isso" resolves correctly (no "not found")',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const query = result.query.toLowerCase();
      const pronounPatterns = /\b(it|that|this|isso|isto|deles|dela|dele)\b/i;
      const hasPronoun = pronounPatterns.test(query);
      const answer = result.fullAnswer || '';
      const notFoundPatterns = [
        /não consigo encontrar/i,
        /não encontrei/i,
        /i can't find/i,
        /not found/i,
        /couldn't find/i,
        /no (document|file) (named|called)/i,
      ];
      const hasNotFound = notFoundPatterns.some(p => p.test(answer));

      if (hasPronoun && hasNotFound) {
        return { pass: false, reason: 'Pronoun reference failed' };
      }
      return { pass: true, reason: 'Pronoun resolved or N/A' };
    },
  },

  // Area 6: Inventory/Filter
  'I6.2_no_path_blobs': {
    area: 'Inventory',
    description: 'No internal path blobs in file listings',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const answer = result.fullAnswer || '';
      // S3 key pattern: userId/documents/docId/filename
      const pathBlobPattern = /[a-f0-9-]{36}\/documents\/[a-f0-9-]{36}\//i;
      const hasPathBlob = pathBlobPattern.test(answer);

      return hasPathBlob
        ? { pass: false, reason: 'Internal path blob found' }
        : { pass: true, reason: 'No path blobs' };
    },
  },

  'I6.3_top10_with_see_all': {
    area: 'Inventory',
    description: 'Lists show top-10 with "see all" for more',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const query = result.query.toLowerCase();
      const isListQuery = /\b(list|show|what|quais|mostre)\b.*\b(files?|documents?|arquivos?|documentos?)\b/i.test(query);
      const answer = result.fullAnswer || '';

      // Count numbered items
      const numberedItems = answer.match(/^\s*\d+\./gm) || [];
      const bulletItems = answer.match(/^\s*[-•]\s/gm) || [];
      const itemCount = Math.max(numberedItems.length, bulletItems.length);

      // If more than 10 items shown without "see all" or truncation note
      const hasSeeAll = /see all|ver todos|more files|mais arquivos|\.\.\./i.test(answer);

      if (isListQuery && itemCount > 10 && !hasSeeAll) {
        return { pass: false, reason: `List shows ${itemCount} items without "see all"` };
      }
      return { pass: true, reason: 'List cap respected' };
    },
  },

  // Area 7: Finance/Spreadsheet
  'X7.1_month_in_finance_answer': {
    area: 'Finance',
    description: 'Finance answers include month/period context',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const query = result.query.toLowerCase();
      const financeKeywords = /\b(ebitda|revenue|profit|margin|expenses?|receita|lucro|margem|despesas)\b/i;
      const isFinanceQuery = financeKeywords.test(query);

      if (!isFinanceQuery) {
        return { pass: true, reason: 'Not a finance query' };
      }

      const answer = result.fullAnswer || '';
      const monthPatterns = [
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
        /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i,
        /\b(q1|q2|q3|q4)\b/i,
        /\b20\d{2}\b/,
        /\b(year|month|quarter|ano|mês|trimestre)\b/i,
      ];
      const hasPeriodContext = monthPatterns.some(p => p.test(answer));

      if (!hasPeriodContext) {
        return { pass: false, reason: 'Finance answer lacks period context' };
      }
      return { pass: true, reason: 'Period context present' };
    },
  },

  // Area 8: Formatting Enforcement
  'FE8.1_exact_count': {
    area: 'Formatting',
    description: '"list 5" returns exactly 5 items',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const query = result.query.toLowerCase();
      const countMatch = query.match(/\b(list|give me|show)\s+(\d+)\b|\b(\d+)\s+(pontos?|items?|bullets?)/i);

      if (!countMatch) {
        return { pass: true, reason: 'No count constraint' };
      }

      const expectedCount = parseInt(countMatch[2] || countMatch[3], 10);
      const answer = result.fullAnswer || '';

      // Count numbered items or bullets
      const numberedItems = answer.match(/^\s*\d+\./gm) || [];
      const bulletItems = answer.match(/^\s*[-•*]\s/gm) || [];
      const actualCount = Math.max(numberedItems.length, bulletItems.length);

      if (actualCount !== expectedCount) {
        return { pass: false, reason: `Expected ${expectedCount}, got ${actualCount}` };
      }
      return { pass: true, reason: `Correct count: ${actualCount}` };
    },
  },

  'FE8.4_no_mixed_markers': {
    area: 'Formatting',
    description: 'No mixed list markers (bullets + numbers)',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const answer = result.fullAnswer || '';
      const hasNumbered = /^\s*\d+\./m.test(answer);
      const hasBullets = /^\s*[-•*]\s/m.test(answer);

      // Check for both in the same list context (not separate sections)
      // This is a simplified check - could be more sophisticated
      const lines = answer.split('\n');
      let inList = false;
      let listType: 'numbered' | 'bullet' | null = null;
      let hasMixed = false;

      for (const line of lines) {
        const isNumbered = /^\s*\d+\./.test(line);
        const isBullet = /^\s*[-•*]\s/.test(line);

        if (isNumbered || isBullet) {
          const currentType = isNumbered ? 'numbered' : 'bullet';
          if (inList && listType && listType !== currentType) {
            hasMixed = true;
            break;
          }
          inList = true;
          listType = currentType;
        } else if (line.trim() === '') {
          // Empty line might reset list context
          // For now, keep tracking
        } else {
          // Non-list line in middle might be okay
        }
      }

      return hasMixed
        ? { pass: false, reason: 'Mixed list markers detected' }
        : { pass: true, reason: 'Consistent markers' };
    },
  },

  // General Quality
  'Q_no_blank_response': {
    area: 'Quality',
    description: 'Response is not blank',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const answer = result.fullAnswer || '';
      const isBlank = answer.trim().length < 10;

      return isBlank
        ? { pass: false, reason: 'Blank or near-blank response' }
        : { pass: true, reason: 'Has content' };
    },
  },

  'Q_no_error': {
    area: 'Quality',
    description: 'No error in response',
    check: (result: TestResult, done?: DoneEventPayload) => {
      if (result.error) {
        return { pass: false, reason: `Error: ${result.error}` };
      }
      return { pass: true, reason: 'No error' };
    },
  },

  'Q_reasonable_length': {
    area: 'Quality',
    description: 'Response length is reasonable (<5000 chars for simple queries)',
    check: (result: TestResult, done?: DoneEventPayload) => {
      const answer = result.fullAnswer || '';
      const query = result.query.toLowerCase();

      // Skip for summary/detail queries
      if (/summarize|explain in detail|full|completo/i.test(query)) {
        return { pass: true, reason: 'Detail query - length check skipped' };
      }

      if (answer.length > 5000) {
        return { pass: false, reason: `Response too long: ${answer.length} chars` };
      }
      return { pass: true, reason: 'Reasonable length' };
    },
  },
};

// ============================================================================
// GRADING FUNCTIONS
// ============================================================================

function gradeResult(result: TestResult, done?: DoneEventPayload): GradeResult {
  // Normalize: use fullAnswer from doneEvent if available, else answer field
  if (!result.fullAnswer && result.doneEvent?.fullAnswer) {
    result.fullAnswer = result.doneEvent.fullAnswer;
  }
  if (!result.fullAnswer && result.answer) {
    result.fullAnswer = result.answer;
  }

  const grades: Record<string, { pass: boolean; reason: string }> = {};
  let passCount = 0;
  let totalChecks = 0;

  for (const [checkId, checkDef] of Object.entries(UX_CHECKS)) {
    const gradeResult = checkDef.check(result, done || result.doneEvent);
    grades[checkId] = gradeResult;
    totalChecks++;
    if (gradeResult.pass) passCount++;
  }

  return {
    testId: result.id,
    query: result.query,
    grades,
    overallScore: totalChecks > 0 ? passCount / totalChecks : 0,
    passCount,
    totalChecks,
  };
}

async function gradeResultsFile(filePath: string): Promise<void> {
  const results: GradeResult[] = [];
  const areaScores: Record<string, { pass: number; total: number }> = {};

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const result = JSON.parse(line) as TestResult;
      const graded = gradeResult(result);
      results.push(graded);

      // Aggregate by area
      for (const [checkId, grade] of Object.entries(graded.grades)) {
        const area = (UX_CHECKS as any)[checkId]?.area || 'Unknown';
        if (!areaScores[area]) {
          areaScores[area] = { pass: 0, total: 0 };
        }
        areaScores[area].total++;
        if (grade.pass) areaScores[area].pass++;
      }
    } catch (e) {
      console.error('Failed to parse line:', e);
    }
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('              UX GRADING REPORT - Definition of Done');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Overall
  const totalPass = results.reduce((acc, r) => acc + r.passCount, 0);
  const totalChecks = results.reduce((acc, r) => acc + r.totalChecks, 0);
  const overallPct = totalChecks > 0 ? ((totalPass / totalChecks) * 100).toFixed(1) : '0.0';
  console.log(`OVERALL: ${totalPass}/${totalChecks} checks passed (${overallPct}%)\n`);

  // By area
  console.log('BY AREA:');
  console.log('─────────────────────────────────────────────────────────────────');
  for (const [area, scores] of Object.entries(areaScores).sort((a, b) => a[0].localeCompare(b[0]))) {
    const pct = scores.total > 0 ? ((scores.pass / scores.total) * 100).toFixed(1) : '0.0';
    const status = scores.pass === scores.total ? '✓' : '✗';
    console.log(`  ${status} ${area.padEnd(15)}: ${scores.pass}/${scores.total} (${pct}%)`);
  }

  // Failures
  const failures = results.filter(r => r.overallScore < 1);
  if (failures.length > 0) {
    console.log('\n\nFAILURES:');
    console.log('─────────────────────────────────────────────────────────────────');

    for (const failure of failures.slice(0, 20)) {
      console.log(`\n  ${failure.testId}: "${failure.query.substring(0, 50)}..."`);
      for (const [checkId, grade] of Object.entries(failure.grades)) {
        if (!grade.pass) {
          console.log(`    ✗ ${checkId}: ${grade.reason}`);
        }
      }
    }
  }

  // Write detailed report
  const reportPath = filePath.replace(/\.\w+$/, '_ux_grades.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n\nDetailed report written to: ${reportPath}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node tools/quality/ux_grader.ts <results.jsonl>');
    console.log('\nGrades Koda responses against Definition of Done UX requirements.');
    process.exit(1);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  await gradeResultsFile(filePath);
}

main().catch(console.error);
