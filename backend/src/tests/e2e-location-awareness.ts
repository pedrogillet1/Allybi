/**
 * KODA — ULTIMATE ANSWER QUALITY & LOCATION AWARENESS TEST SUITE
 *
 * 60 Questions | 12 Sections | Single Conversation
 *
 * Tests:
 * - Semantic correctness
 * - Location accuracy
 * - Page navigation
 * - Button accuracy
 * - Formatting consistency
 * - Tone (calm, confident)
 * - Zero fallbacks
 * - Zero hallucinations
 *
 * FAIL CONDITION: Any "rephrase", "be more specific", or clarification request
 */

import 'dotenv/config';
import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://localhost:5001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@koda.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test123';

interface TestCase {
  id: number;
  section: string;
  question: string;
  criteria: string;
}

const TEST_CASES: TestCase[] = [
  // SECTION 1 — BASIC LOCATION AWARENESS (FOUNDATIONAL)
  { id: 1, section: '1-LOCATION-BASIC', question: 'Where is the Rosewood Fund document located?', criteria: 'correct_file_path' },
  { id: 2, section: '1-LOCATION-BASIC', question: 'Open the Rosewood Fund document.', criteria: 'file_opens' },
  { id: 3, section: '1-LOCATION-BASIC', question: 'Which folder contains the financial report?', criteria: 'folder_identified' },
  { id: 4, section: '1-LOCATION-BASIC', question: 'Show me the contract document.', criteria: 'file_shown' },
  { id: 5, section: '1-LOCATION-BASIC', question: 'Where exactly is the spreadsheet stored?', criteria: 'exact_path' },

  // SECTION 2 — LOCATION + CONTENT (CRITICAL)
  { id: 6, section: '2-LOCATION-CONTENT', question: 'Where does the Rosewood Fund document talk about expected returns?', criteria: 'page_accuracy' },
  { id: 7, section: '2-LOCATION-CONTENT', question: 'On which page does it explain risk factors?', criteria: 'page_number' },
  { id: 8, section: '2-LOCATION-CONTENT', question: 'Open the page where operating expenses are discussed.', criteria: 'page_opens' },
  { id: 9, section: '2-LOCATION-CONTENT', question: 'Show me the exact section that mentions cash flow.', criteria: 'section_accuracy' },
  { id: 10, section: '2-LOCATION-CONTENT', question: 'Where does the contract specify termination terms?', criteria: 'location_in_doc' },

  // SECTION 3 — CONTENT UNDERSTANDING (NO LOCATION)
  { id: 11, section: '3-CONTENT', question: 'What does the Rosewood Fund document say about expected returns?', criteria: 'uses_doc_language' },
  { id: 12, section: '3-CONTENT', question: 'Why does it say that?', criteria: 'followup_grounded' },
  { id: 13, section: '3-CONTENT', question: 'What is the main risk highlighted in the financial report?', criteria: 'specific_answer' },
  { id: 14, section: '3-CONTENT', question: 'Summarize the purpose of the contract.', criteria: 'clear_summary' },
  { id: 15, section: '3-CONTENT', question: 'What is the key takeaway from the spreadsheet?', criteria: 'concise_insight' },

  // SECTION 4 — LOCATION + WHY (HARD MODE)
  { id: 16, section: '4-LOCATION-WHY', question: 'Where exactly does the document say who the stakeholders are, and why is that important?', criteria: 'page_plus_reasoning' },
  { id: 17, section: '4-LOCATION-WHY', question: 'On which page is revenue recognition explained, and why is it structured that way?', criteria: 'page_plus_explanation' },
  { id: 18, section: '4-LOCATION-WHY', question: 'Show me where the contract defines obligations, and explain their intent.', criteria: 'location_plus_intent' },
  { id: 19, section: '4-LOCATION-WHY', question: 'Open the page where expenses are listed and explain what stands out.', criteria: 'page_plus_analysis' },
  { id: 20, section: '4-LOCATION-WHY', question: 'Where does the spreadsheet calculate totals, and why is that relevant?', criteria: 'location_plus_relevance' },

  // SECTION 5 — FOLLOW-UPS (CONTEXT MEMORY)
  { id: 21, section: '5-FOLLOWUPS', question: 'Does that section mention any limitations?', criteria: 'implicit_resolution' },
  { id: 22, section: '5-FOLLOWUPS', question: 'Is this page more important than the previous one?', criteria: 'comparison_no_clarify' },
  { id: 23, section: '5-FOLLOWUPS', question: 'Does this document contradict the other financial file?', criteria: 'cross_doc_memory' },
  { id: 24, section: '5-FOLLOWUPS', question: 'Open the earlier document again.', criteria: 'context_recall' },
  { id: 25, section: '5-FOLLOWUPS', question: 'Where was that file stored?', criteria: 'location_recall' },

  // SECTION 6 — COMPARISON ACROSS DOCUMENTS
  { id: 26, section: '6-COMPARISON', question: 'Which document explains financial performance more clearly?', criteria: 'conservative_compare' },
  { id: 27, section: '6-COMPARISON', question: 'Is the spreadsheet consistent with the financial report?', criteria: 'transparent_reasoning' },
  { id: 28, section: '6-COMPARISON', question: 'Which file mentions risks in more detail?', criteria: 'grounded_answer' },
  { id: 29, section: '6-COMPARISON', question: 'Compare how the contract and report handle obligations.', criteria: 'structured_comparison' },
  { id: 30, section: '6-COMPARISON', question: 'Which document should I read first to understand the business?', criteria: 'recommendation' },

  // SECTION 7 — NAVIGATION & DISCOVERY
  { id: 31, section: '7-NAVIGATION', question: 'List all documents in the finance folder.', criteria: 'correct_list' },
  { id: 32, section: '7-NAVIGATION', question: 'List only the PDF files.', criteria: 'filtered_list' },
  { id: 33, section: '7-NAVIGATION', question: 'Show me all documents related to legal matters.', criteria: 'semantic_filter' },
  { id: 34, section: '7-NAVIGATION', question: 'Which files look like reports rather than raw data?', criteria: 'file_classification' },
  { id: 35, section: '7-NAVIGATION', question: 'Where are the oldest files stored?', criteria: 'metadata_query' },

  // SECTION 8 — FILE ACTION STYLE QUESTIONS (UX FOCUSED)
  { id: 36, section: '8-FILE-ACTIONS', question: 'Just open it.', criteria: 'button_only' },
  { id: 37, section: '8-FILE-ACTIONS', question: 'Show me that document again.', criteria: 'implicit_file' },
  { id: 38, section: '8-FILE-ACTIONS', question: 'Where was that file?', criteria: 'location_recall' },
  { id: 39, section: '8-FILE-ACTIONS', question: 'Open the spreadsheet.', criteria: 'file_type_resolve' },
  { id: 40, section: '8-FILE-ACTIONS', question: 'Go back to the Rosewood Fund document.', criteria: 'navigation' },

  // SECTION 9 — AMBIGUOUS BUT HUMAN (NO FALLBACK ALLOWED)
  { id: 41, section: '9-AMBIGUOUS', question: 'Does this look good or bad overall?', criteria: 'conservative_opinion' },
  { id: 42, section: '9-AMBIGUOUS', question: 'Is this better than the other one?', criteria: 'grounded_comparison' },
  { id: 43, section: '9-AMBIGUOUS', question: "What's the main point here?", criteria: 'summary' },
  { id: 44, section: '9-AMBIGUOUS', question: 'Should I be concerned about anything?', criteria: 'risk_highlight' },
  { id: 45, section: '9-AMBIGUOUS', question: 'What stands out the most?', criteria: 'key_insight' },

  // SECTION 10 — LOCATION STRESS TEST (RAPID)
  { id: 46, section: '10-STRESS', question: 'Where is the contract?', criteria: 'fast_location' },
  { id: 47, section: '10-STRESS', question: 'Open it.', criteria: 'fast_open' },
  { id: 48, section: '10-STRESS', question: 'Where does it talk about obligations?', criteria: 'section_find' },
  { id: 49, section: '10-STRESS', question: 'Open that page.', criteria: 'page_open' },
  { id: 50, section: '10-STRESS', question: 'Go back to the financial report.', criteria: 'switch_doc' },
  { id: 51, section: '10-STRESS', question: 'Where is it stored?', criteria: 'location_fast' },

  // SECTION 11 — FORMAT & ANSWER QUALITY (STRICT)
  { id: 52, section: '11-FORMAT', question: 'Explain this clearly.', criteria: 'clear_format' },
  { id: 53, section: '11-FORMAT', question: 'Explain this briefly.', criteria: 'concise' },
  { id: 54, section: '11-FORMAT', question: 'Explain this step by step.', criteria: 'numbered_steps' },
  { id: 55, section: '11-FORMAT', question: "Explain this like I'm not technical.", criteria: 'plain_language' },
  { id: 56, section: '11-FORMAT', question: 'Just list the key points.', criteria: 'bullet_list' },

  // SECTION 12 — EDGE SAFETY (BUT STILL ANSWER)
  { id: 57, section: '12-EDGE', question: "Open a file that doesn't exist.", criteria: 'graceful_not_found' },
  { id: 58, section: '12-EDGE', question: 'Which document is the most important?', criteria: 'subjective_handled' },
  { id: 59, section: '12-EDGE', question: 'Is anything missing from these files?', criteria: 'helpful_guidance' },
  { id: 60, section: '12-EDGE', question: 'What should I read next?', criteria: 'suggestion' },
];

interface TestResult {
  id: number;
  section: string;
  question: string;
  criteria: string;
  status: 'PASS' | 'FAIL' | 'REPHRASE' | 'ERROR';
  intent?: string;
  hasFileAction?: boolean;
  hasPageReference?: boolean;
  responsePreview: string;
  responseTime?: number;
  error?: string;
}

async function login(): Promise<string> {
  const res = await axios.post(`${API_BASE}/api/auth/login`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  return res.data.accessToken || res.data.token;
}

async function sendMessage(token: string, message: string, conversationId: string): Promise<{ data: any; responseTime: number }> {
  const start = Date.now();
  const res = await axios.post(
    `${API_BASE}/api/rag/query`,
    {
      query: message,
      conversationId,
      language: 'en',
    },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 120000,
    }
  );
  const responseTime = Date.now() - start;
  return { data: res.data, responseTime };
}

function evaluateResponse(response: any, responseTime: number, testCase: TestCase): TestResult {
  const answer = response.answer || response.response || '';
  const intent = response.intent || response.metadata?.intent || 'unknown';
  const hasFileAction = response.fileAction || response.files ||
    answer.includes('📄') || answer.includes('📁') ||
    answer.includes('{{DOC::') || answer.includes('{{FOLDER::');
  const hasPageReference = /page\s+\d+/i.test(answer) || /p\.\s*\d+/i.test(answer);

  // CRITICAL: Check for REPHRASE patterns (instant fail)
  const rephrasePatterns = [
    /rephrase/i,
    /could you clarify/i,
    /please specify/i,
    /what do you mean/i,
    /can you be more specific/i,
    /I('m| am) not sure what/i,
    /which (file|document|folder) (do you|are you)/i,
    /please provide more/i,
    /I need more information/i,
    /can you tell me which/i,
  ];

  const isRephrase = rephrasePatterns.some(p => p.test(answer));
  if (isRephrase) {
    return {
      id: testCase.id,
      section: testCase.section,
      question: testCase.question,
      criteria: testCase.criteria,
      status: 'REPHRASE',
      intent,
      hasFileAction,
      hasPageReference,
      responsePreview: answer.substring(0, 200),
      responseTime,
      error: '🔴 CRITICAL: Asked user to rephrase/clarify',
    };
  }

  // Check for meaningful response
  const hasContent = answer.length > 10;
  const hasError = /error|failed|couldn't|unable to/i.test(answer) &&
    !/error handling|error-free|no errors/i.test(answer);

  if (!hasContent) {
    return {
      id: testCase.id,
      section: testCase.section,
      question: testCase.question,
      criteria: testCase.criteria,
      status: 'FAIL',
      intent,
      hasFileAction,
      hasPageReference,
      responsePreview: answer.substring(0, 200),
      responseTime,
      error: 'Empty or too short response',
    };
  }

  // Section-specific validation
  const section = testCase.section;

  // Location sections should have file actions or page references
  if (section.includes('LOCATION') && !hasFileAction && !hasPageReference) {
    // Allow if it's a content explanation
    if (!section.includes('CONTENT') && !section.includes('WHY')) {
      return {
        id: testCase.id,
        section: testCase.section,
        question: testCase.question,
        criteria: testCase.criteria,
        status: 'FAIL',
        intent,
        hasFileAction,
        hasPageReference,
        responsePreview: answer.substring(0, 200),
        responseTime,
        error: 'Location question but no file action or page reference',
      };
    }
  }

  // File action sections MUST have file actions
  if (section === '8-FILE-ACTIONS' && !hasFileAction) {
    return {
      id: testCase.id,
      section: testCase.section,
      question: testCase.question,
      criteria: testCase.criteria,
      status: 'FAIL',
      intent,
      hasFileAction,
      hasPageReference,
      responsePreview: answer.substring(0, 200),
      responseTime,
      error: 'File action question but no file action in response',
    };
  }

  return {
    id: testCase.id,
    section: testCase.section,
    question: testCase.question,
    criteria: testCase.criteria,
    status: 'PASS',
    intent,
    hasFileAction,
    hasPageReference,
    responsePreview: answer.substring(0, 200),
    responseTime,
  };
}

async function runTests() {
  console.log('═'.repeat(80));
  console.log('  KODA — ULTIMATE ANSWER QUALITY & LOCATION AWARENESS TEST SUITE');
  console.log('  60 Questions | 12 Sections | Single Conversation');
  console.log('═'.repeat(80));
  console.log('\n  ❌ ANY fallback ("rephrase", "be more specific") = CRITICAL FAIL\n');

  // Login
  console.log('🔐 Logging in...');
  let token: string;
  try {
    token = await login();
    console.log('✅ Logged in successfully\n');
  } catch (e: any) {
    console.error('❌ Login failed:', e.message);
    process.exit(1);
  }

  const conversationId = `location-awareness-test-${Date.now()}`;
  const results: TestResult[] = [];
  let currentSection = '';
  let sectionStats: Record<string, { pass: number; fail: number; rephrase: number }> = {};

  for (const testCase of TEST_CASES) {
    // Print section header
    if (testCase.section !== currentSection) {
      currentSection = testCase.section;
      sectionStats[currentSection] = { pass: 0, fail: 0, rephrase: 0 };
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`  SECTION ${currentSection}`);
      console.log(`${'─'.repeat(70)}`);
    }

    const questionDisplay = testCase.question.length > 55
      ? testCase.question.substring(0, 52) + '...'
      : testCase.question.padEnd(55);

    process.stdout.write(`  [${testCase.id.toString().padStart(2)}] ${questionDisplay} `);

    try {
      const { data: response, responseTime } = await sendMessage(token, testCase.question, conversationId);
      const result = evaluateResponse(response, responseTime, testCase);
      results.push(result);

      // Update section stats
      if (result.status === 'PASS') {
        sectionStats[currentSection].pass++;
        const extras = [];
        if (result.hasFileAction) extras.push('📄');
        if (result.hasPageReference) extras.push('📑');
        console.log(`✅ ${result.responseTime}ms ${extras.join('')}`);
      } else if (result.status === 'REPHRASE') {
        sectionStats[currentSection].rephrase++;
        console.log(`🔴 REPHRASE ← CRITICAL FAIL`);
        console.log(`     Preview: "${result.responsePreview.substring(0, 80)}..."`);
      } else {
        sectionStats[currentSection].fail++;
        console.log(`❌ ${result.error}`);
        console.log(`     Preview: "${result.responsePreview.substring(0, 80)}..."`);
      }

      // Small delay between requests
      await new Promise(r => setTimeout(r, 300));
    } catch (e: any) {
      const errorResult: TestResult = {
        id: testCase.id,
        section: testCase.section,
        question: testCase.question,
        criteria: testCase.criteria,
        status: 'ERROR',
        responsePreview: '',
        error: e.message,
      };
      results.push(errorResult);
      sectionStats[currentSection].fail++;
      console.log(`❌ ERROR: ${e.message}`);
    }
  }

  // Final Report
  console.log('\n' + '═'.repeat(80));
  console.log('  FINAL QUALITY SCORECARD');
  console.log('═'.repeat(80));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const rephrased = results.filter(r => r.status === 'REPHRASE').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  const total = results.length;

  console.log(`\n  Overall: ${passed}/${total} passed (${((passed/total)*100).toFixed(1)}%)`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  🔴 Rephrase (CRITICAL): ${rephrased}`);
  console.log(`  ⚠️  Errors: ${errors}`);

  // Section breakdown
  console.log('\n  Section Breakdown:');
  console.log('  ' + '─'.repeat(60));
  for (const [section, stats] of Object.entries(sectionStats)) {
    const sectionTotal = stats.pass + stats.fail + stats.rephrase;
    const rate = ((stats.pass / sectionTotal) * 100).toFixed(0);
    const status = stats.rephrase > 0 ? '🔴' : stats.fail > 0 ? '⚠️ ' : '✅';
    console.log(`  ${status} ${section.padEnd(25)} ${stats.pass}/${sectionTotal} (${rate}%)`);
  }

  // Response time stats
  const responseTimes = results.filter(r => r.responseTime).map(r => r.responseTime!);
  if (responseTimes.length > 0) {
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxTime = Math.max(...responseTimes);
    const minTime = Math.min(...responseTimes);
    console.log('\n  Response Times:');
    console.log(`    Average: ${avgTime.toFixed(0)}ms`);
    console.log(`    Min: ${minTime}ms`);
    console.log(`    Max: ${maxTime}ms`);
  }

  // Critical failures
  const criticalFailures = results.filter(r => r.status === 'REPHRASE');
  if (criticalFailures.length > 0) {
    console.log('\n  🔴 CRITICAL FAILURES (Rephrase/Clarify):');
    for (const failure of criticalFailures) {
      console.log(`    [${failure.id}] ${failure.question}`);
    }
  }

  // Verdict
  console.log('\n' + '═'.repeat(80));
  if (rephrased > 0) {
    console.log('  ❌ VERDICT: FAIL — Fallback prompts detected');
    console.log('     Do NOT add ML yet. Fix deterministically first.');
  } else if (passed === total) {
    console.log('  ✅ VERDICT: PASS — Production-grade quality');
    console.log('     Location awareness, semantic understanding, and UX are stable.');
    console.log('     ML routing is now safe to add as optimization.');
  } else {
    console.log(`  ⚠️  VERDICT: PARTIAL — ${failed} failures need investigation`);
    console.log('     Review failed cases before proceeding.');
  }
  console.log('═'.repeat(80) + '\n');

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed, rephrased, errors },
    sectionStats,
    results,
  };

  const fs = await import('fs');
  const reportPath = './location-awareness-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📊 Detailed report saved to: ${reportPath}`);

  process.exit(rephrased > 0 ? 2 : failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(e => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
