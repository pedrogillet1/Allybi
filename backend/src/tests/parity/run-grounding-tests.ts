/**
 * File-Specific Grounding Test Runner
 *
 * Runs the 50 queries from file-specific-grounding-queries.json
 * and validates responses for document grounding quality.
 */

import fs from 'fs';
import path from 'path';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

interface Query {
  id: number;
  query: string;
  target_doc: string;
  expect: string;
  validation: string;
}

interface TestResult {
  id: number;
  query: string;
  target_doc: string;
  expect: string;
  passed: boolean;
  reason: string;
  response_preview: string;
  sources: string[];
  duration_ms: number;
}

// Load queries
const queriesPath = path.join(__dirname, 'file-specific-grounding-queries.json');
const queriesData = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
const queries: Query[] = queriesData.queries;

// Validation functions
function validateResponse(query: Query, response: any): { passed: boolean; reason: string } {
  const content = response.content || response.fullAnswer || response.formatted || '';
  const sources = response.sourceButtons?.buttons || response.sources || [];
  const sourceNames = sources.map((s: any) => s.title || s.filename || s.documentName || '');

  // Check if response is empty or error
  if (!content || content.length < 10) {
    return { passed: false, reason: 'Empty or too short response' };
  }

  // Check for "I don't have" / "I cannot" responses
  const noInfoPatterns = [
    /i don't have access/i,
    /i cannot find/i,
    /no documents? (found|available)/i,
    /unable to locate/i,
    /not found in your/i,
  ];

  for (const pattern of noInfoPatterns) {
    if (pattern.test(content)) {
      return { passed: false, reason: 'Response indicates no document access' };
    }
  }

  // Validate based on expect type
  switch (query.expect) {
    case 'exact_value':
      // Must contain a number (currency, percentage, count)
      const hasNumber = /\d+([.,]\d+)?/.test(content);
      if (!hasNumber) {
        return { passed: false, reason: 'No numeric value found in response' };
      }
      break;

    case 'exact_quote':
      // Must contain quotation marks or clear citation
      const hasQuote = /"[^"]{10,}"/.test(content) || /「[^」]+」/.test(content) || /: "[^"]+"/.test(content);
      if (!hasQuote) {
        return { passed: false, reason: 'No direct quote found (expected quoted text)' };
      }
      break;

    case 'value_with_location':
    case 'cell_reference':
      // Must contain number AND location reference (page, sheet, cell, section)
      const hasValue = /\d+([.,]\d+)?/.test(content);
      const hasLocation = /(page|sheet|tab|cell|row|column|section|linha|coluna|página|aba)/i.test(content);
      if (!hasValue) {
        return { passed: false, reason: 'No numeric value found' };
      }
      if (!hasLocation) {
        return { passed: false, reason: 'No location reference (page/sheet/cell) found' };
      }
      break;

    case 'exact_list':
    case 'structured_list':
    case 'ranked_list':
      // Must contain list markers or multiple items
      const hasList = /(\d+\.|[-•*]|\n-|\n\d+\.)/m.test(content);
      const hasMultipleItems = (content.match(/\n/g) || []).length >= 2;
      if (!hasList && !hasMultipleItems) {
        return { passed: false, reason: 'No list structure found' };
      }
      break;

    case 'exact_terms':
      // Must not be generic - should have specific terms
      const genericPatterns = [
        /generally|typically|usually|often|commonly/i,
        /in most cases|as a rule/i,
      ];
      for (const pattern of genericPatterns) {
        if (pattern.test(content) && content.length < 200) {
          return { passed: false, reason: 'Response appears generic, not document-specific' };
        }
      }
      break;

    case 'cross_document':
    case 'comparison':
    case 'structured_comparison':
      // Must reference multiple documents
      const docCount = new Set(sourceNames.map((n: string) => n.toLowerCase().split('.')[0])).size;
      if (docCount < 2 && sources.length < 2) {
        // Check if content mentions multiple docs
        const mentionsMultiple =
          (content.includes('Mezanino') || content.includes('mezanino')) &&
          (content.includes('LMR') || content.includes('Scrum') || content.includes('Capítulo'));
        if (!mentionsMultiple) {
          return { passed: false, reason: 'Cross-document query but only one document referenced' };
        }
      }
      break;

    case 'file_action':
      // Should have source buttons, minimal text
      if (sources.length === 0) {
        return { passed: false, reason: 'File action should have source buttons' };
      }
      break;

    case 'disambiguation':
    case 'correct_identification':
    case 'recommendation':
    case 'multi_doc_identification':
      // Must mention specific document name
      const mentionsDoc =
        /mezanino|guarda.?moveis|lmr|improvement|scrum|capítulo|capitulo/i.test(content);
      if (!mentionsDoc) {
        return { passed: false, reason: 'Should identify specific document(s)' };
      }
      break;

    case 'conditional_extraction':
      // Must either extract data OR explicitly state not found
      const hasData = /\d+|yes|no|sim|não|found|present|contains/i.test(content);
      const statesAbsence = /not (found|present|mentioned|included)|não (encontr|mencion)|does not (contain|include|have)/i.test(content);
      if (!hasData && !statesAbsence) {
        return { passed: false, reason: 'Should either extract data or state not found' };
      }
      break;

    default:
      // Basic validation: has content
      break;
  }

  // Check source attribution for document-specific queries
  if (query.target_doc !== 'disambiguation' &&
      query.target_doc !== 'cross_document' &&
      query.target_doc !== 'recommendation') {

    if (sources.length === 0) {
      // Might still be valid if response is informative
      // but flag as potential issue
      return { passed: true, reason: 'WARN: No source buttons attached' };
    }

    // Check if correct document is in sources
    const targetLower = query.target_doc.toLowerCase();
    const hasCorrectSource = sourceNames.some((name: string) => {
      const nameLower = name.toLowerCase();
      if (targetLower.includes('mezanino')) return nameLower.includes('mezanino') || nameLower.includes('guarda');
      if (targetLower.includes('lmr')) return nameLower.includes('lmr') || nameLower.includes('improvement');
      if (targetLower.includes('scrum') || targetLower.includes('capítulo')) return nameLower.includes('scrum') || nameLower.includes('capítulo') || nameLower.includes('capitulo');
      return false;
    });

    if (!hasCorrectSource && sources.length > 0) {
      return { passed: false, reason: `Wrong source: expected ${query.target_doc}, got ${sourceNames.join(', ')}` };
    }
  }

  return { passed: true, reason: 'OK' };
}

async function createConversation(): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const response = await fetch(`${API_BASE}/api/chat/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Grounding Test' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.id || data.conversationId;
}

async function sendQuery(query: string, conversationId: string): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const response = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: query,
      text: query,
      message: query,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  // Handle SSE streaming response
  const text = await response.text();

  // Parse SSE events to get final response
  const lines = text.split('\n');
  let finalData: any = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'done' || data.event === 'done') {
          finalData = data;
        } else if (data.fullAnswer || data.content || data.formatted) {
          finalData = { ...finalData, ...data };
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }

  return finalData || { content: text };
}

async function runTests(startFrom = 1, limit = 50): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  FILE-SPECIFIC GROUNDING TEST RUNNER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`API: ${API_BASE}`);
  console.log(`Running queries ${startFrom} to ${Math.min(startFrom + limit - 1, queries.length)}`);
  console.log('');

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  // Create conversation first
  let conversationId: string;
  try {
    console.log('Creating conversation...');
    conversationId = await createConversation();
    console.log(`Conversation created: ${conversationId}`);
    console.log('');
  } catch (error: any) {
    console.error('Failed to create conversation:', error.message);
    process.exit(1);
  }

  const queriesToRun = queries.slice(startFrom - 1, startFrom - 1 + limit);

  for (const query of queriesToRun) {
    const startTime = Date.now();

    process.stdout.write(`[${query.id.toString().padStart(2, '0')}] ${query.query.slice(0, 60)}... `);

    try {
      const response = await sendQuery(query.query, conversationId);
      const duration = Date.now() - startTime;

      const validation = validateResponse(query, response);
      const sources = (response.sourceButtons?.buttons || response.sources || [])
        .map((s: any) => s.title || s.filename || s.documentName || 'unknown');

      const result: TestResult = {
        id: query.id,
        query: query.query,
        target_doc: query.target_doc,
        expect: query.expect,
        passed: validation.passed,
        reason: validation.reason,
        response_preview: (response.content || response.fullAnswer || '').slice(0, 200),
        sources,
        duration_ms: duration,
      };

      results.push(result);

      if (validation.passed) {
        if (validation.reason.startsWith('WARN:')) {
          console.log(`⚠️  ${validation.reason} (${duration}ms)`);
          warnings++;
        } else {
          console.log(`✅ (${duration}ms)`);
        }
        passed++;
      } else {
        console.log(`❌ ${validation.reason}`);
        failed++;
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`💥 Error: ${error.message}`);

      results.push({
        id: query.id,
        query: query.query,
        target_doc: query.target_doc,
        expect: query.expect,
        passed: false,
        reason: `Error: ${error.message}`,
        response_preview: '',
        sources: [],
        duration_ms: duration,
      });

      failed++;
    }

    // Small delay between queries to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✅ Passed:   ${passed}`);
  console.log(`❌ Failed:   ${failed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`📊 Total:    ${results.length}`);
  console.log(`📈 Pass Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log('');

  // Failed tests detail
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('FAILURES:');
    console.log('─────────────────────────────────────────────────────────────────');
    for (const f of failures) {
      console.log(`[${f.id}] ${f.query.slice(0, 50)}...`);
      console.log(`    Expected: ${f.expect}`);
      console.log(`    Reason: ${f.reason}`);
      console.log(`    Sources: ${f.sources.join(', ') || 'none'}`);
      console.log('');
    }
  }

  // Save results to file
  const outputPath = path.join(__dirname, 'grounding-test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { passed, failed, warnings, total: results.length },
    results,
  }, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

// Run
const startFrom = parseInt(process.argv[2] || '1', 10);
const limit = parseInt(process.argv[3] || '50', 10);

runTests(startFrom, limit).catch(console.error);
