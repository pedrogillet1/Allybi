import 'dotenv/config';
import axios from 'axios';

const API_BASE = 'http://localhost:5001';

interface TestCase {
  id: number;
  part: string;
  question: string;
  expected: string[];
  mustHaveButton: boolean;
  buttonOnly: boolean;
  noFallback: boolean;
}

const TEST_SUITE: TestCase[] = [
  // PART 1 — FILE LOCATION & NAVIGATION
  { id: 1, part: 'FILE LOCATION', question: 'Where is the Rosewood Fund document located?', expected: ['folder path', 'button'], mustHaveButton: true, buttonOnly: false, noFallback: true },
  { id: 2, part: 'FILE LOCATION', question: 'Open it.', expected: ['button only'], mustHaveButton: true, buttonOnly: true, noFallback: true },
  { id: 3, part: 'FILE LOCATION', question: 'Which folder contains financial documents?', expected: ['folder name', 'button'], mustHaveButton: true, buttonOnly: false, noFallback: true },

  // PART 2 — CONTENT UNDERSTANDING
  { id: 4, part: 'CONTENT', question: 'What does the Rosewood Fund document say about financial performance?', expected: ['summary', 'no invented numbers'], mustHaveButton: false, buttonOnly: false, noFallback: true },
  { id: 5, part: 'CONTENT', question: 'Why does it say that?', expected: ['explanation', 'same document scope'], mustHaveButton: false, buttonOnly: false, noFallback: true },
  { id: 6, part: 'CONTENT', question: 'Does this document mention investments?', expected: ['yes/no', 'brief explanation'], mustHaveButton: false, buttonOnly: false, noFallback: true },

  // PART 3 — COMPARISON & MULTI-DOC
  { id: 7, part: 'COMPARISON', question: 'Compare the Rosewood Fund with the Lone Mountain Ranch budget.', expected: ['comparison', 'both files mentioned'], mustHaveButton: false, buttonOnly: false, noFallback: true },
  { id: 8, part: 'COMPARISON', question: 'Which one is more recent?', expected: ['date comparison or metadata note'], mustHaveButton: false, buttonOnly: false, noFallback: true },

  // PART 4 — RECOMMENDATION & DISCOVERY
  { id: 9, part: 'RECOMMEND', question: 'Which file should I read to understand the company finances?', expected: ['recommendation', '1-3 buttons'], mustHaveButton: true, buttonOnly: false, noFallback: true },
  { id: 10, part: 'RECOMMEND', question: 'And which one explains operations better?', expected: ['different file if applicable', 'button'], mustHaveButton: true, buttonOnly: false, noFallback: true },

  // PART 5 — FILE ACTIONS (CRITICAL)
  { id: 11, part: 'FILE ACTION', question: 'Show me the spreadsheet again.', expected: ['button only', 'correct spreadsheet'], mustHaveButton: true, buttonOnly: true, noFallback: true },
  { id: 12, part: 'FILE ACTION', question: 'Where would I find that file if I navigated manually?', expected: ['folder path', 'button'], mustHaveButton: true, buttonOnly: false, noFallback: true },

  // PART 6 — IMPLICIT & LAZY HUMAN INPUT (HARD)
  { id: 13, part: 'IMPLICIT', question: 'That one — does it mention budgets?', expected: ['correct file resolution', 'yes/no'], mustHaveButton: false, buttonOnly: false, noFallback: true },
  { id: 14, part: 'IMPLICIT', question: 'Open the earlier one we discussed.', expected: ['historical resolution', 'button'], mustHaveButton: true, buttonOnly: false, noFallback: true },
  { id: 15, part: 'IMPLICIT', question: 'Is this better than the other one?', expected: ['comparison or clarification', 'no fallback'], mustHaveButton: false, buttonOnly: false, noFallback: true },

  // PART 7 — LISTING & FILTERING
  { id: 16, part: 'LISTING', question: 'List all the documents in test 1 folder.', expected: ['clean list', 'buttons'], mustHaveButton: true, buttonOnly: false, noFallback: true },
  { id: 17, part: 'LISTING', question: 'Only show spreadsheets, not PDFs.', expected: ['filtered list', 'xlsx files only'], mustHaveButton: true, buttonOnly: false, noFallback: true },

  // PART 8 — AMBIGUOUS BUT VALID HUMAN QUESTIONS
  { id: 18, part: 'AMBIGUOUS', question: 'What is the main takeaway here?', expected: ['high-level summary', 'scoped to last file'], mustHaveButton: false, buttonOnly: false, noFallback: true },
  { id: 19, part: 'AMBIGUOUS', question: 'Does this look good or bad overall?', expected: ['neutral assessment', 'no refusal'], mustHaveButton: false, buttonOnly: false, noFallback: true },

  // PART 9 — NEGATIVE EDGE CASES (SAFE)
  { id: 20, part: 'EDGE CASE', question: 'Open a file called nonexistent_document.pdf', expected: ['helpful error', 'suggestions'], mustHaveButton: false, buttonOnly: false, noFallback: true },
  { id: 21, part: 'EDGE CASE', question: 'Which document is the most important?', expected: ['heuristic explanation', 'recommendation'], mustHaveButton: true, buttonOnly: false, noFallback: true },

  // PART 10 — UX FORMAT STRICT TESTS
  { id: 22, part: 'UX', question: 'Just open it.', expected: ['button only', 'zero text'], mustHaveButton: true, buttonOnly: true, noFallback: true },
  { id: 23, part: 'UX', question: 'List the files. Do not explain.', expected: ['list only', 'clean spacing'], mustHaveButton: true, buttonOnly: false, noFallback: true },
  { id: 24, part: 'UX', question: 'Explain this like I am not technical.', expected: ['simplified language', 'accurate'], mustHaveButton: false, buttonOnly: false, noFallback: true },
  { id: 25, part: 'FINAL', question: 'Go back to Koda test folder and list what is there.', expected: ['folder navigation', 'list contents'], mustHaveButton: true, buttonOnly: false, noFallback: true },
];

const FALLBACK_PATTERNS = [
  /i couldn't/i, /i can't/i, /unable to/i,
  /try rephrasing/i, /be more specific/i, /rephrase/i,
  /could you clarify/i, /not sure what/i,
  /that information isn't available/i,
  /coming soon/i, /not supported/i,
];

async function runFinalValidation() {
  console.log('='.repeat(100));
  console.log('KODA — FINAL VALIDATION TEST SUITE');
  console.log('Running 25 questions in a SINGLE conversation');
  console.log('='.repeat(100));
  console.log('');

  const login = await axios.post(API_BASE + '/api/auth/login', { email: 'test@koda.com', password: 'test123' });
  const token = login.data.accessToken;
  const conversationId = 'final-validation-' + Date.now();

  const results: Array<{
    id: number;
    part: string;
    question: string;
    intent: string;
    hasButton: boolean;
    hasFallback: boolean;
    buttonOnly: boolean;
    pass: boolean;
    answer: string;
    latency: number;
  }> = [];

  let passCount = 0;
  let failCount = 0;

  for (const tc of TEST_SUITE) {
    console.log('-'.repeat(100));
    console.log(`Q${tc.id} [${tc.part}]: "${tc.question}"`);
    console.log(`Expected: ${tc.expected.join(' | ')}`);
    console.log('-'.repeat(100));

    const start = Date.now();

    try {
      const res = await axios.post(API_BASE + '/api/rag/query',
        { query: tc.question, conversationId, language: 'en' },
        { headers: { Authorization: 'Bearer ' + token }, timeout: 60000 }
      );

      const latency = Date.now() - start;
      const answer = res.data.answer || '';
      const intent = res.data.intent || 'unknown';

      // Check criteria
      const hasButton = /\{\{DOC::|📁/.test(answer);
      const hasFallback = FALLBACK_PATTERNS.some(p => p.test(answer));

      // For buttonOnly, check if there's minimal text outside markers
      const textWithoutButtons = answer.replace(/\{\{[^}]+\}\}/g, '').replace(/📁[^\n]*/g, '').trim();
      const isButtonOnly = hasButton && textWithoutButtons.length < 50;

      // Determine pass/fail
      let pass = true;
      const failReasons: string[] = [];

      if (tc.noFallback && hasFallback) {
        pass = false;
        failReasons.push('FALLBACK DETECTED');
      }
      if (tc.mustHaveButton && !hasButton) {
        pass = false;
        failReasons.push('MISSING BUTTON');
      }
      if (tc.buttonOnly && !isButtonOnly) {
        pass = false;
        failReasons.push('NOT BUTTON-ONLY');
      }
      if (answer.length < 5) {
        pass = false;
        failReasons.push('EMPTY RESPONSE');
      }

      if (pass) passCount++;
      else failCount++;

      // Log result
      console.log(`Intent: ${intent} | Latency: ${latency}ms | Button: ${hasButton ? 'YES' : 'NO'} | Fallback: ${hasFallback ? 'YES' : 'NO'}`);
      console.log('');
      console.log('ANSWER:');
      console.log(answer.substring(0, 500) + (answer.length > 500 ? '...' : ''));
      console.log('');
      console.log(`Result: ${pass ? '✅ PASS' : '❌ FAIL' + (failReasons.length ? ` (${failReasons.join(', ')})` : '')}`);

      results.push({
        id: tc.id,
        part: tc.part,
        question: tc.question,
        intent,
        hasButton,
        hasFallback,
        buttonOnly: isButtonOnly,
        pass,
        answer: answer.substring(0, 200),
        latency,
      });

    } catch (error: any) {
      failCount++;
      console.log(`ERROR: ${error.message}`);
      results.push({
        id: tc.id,
        part: tc.part,
        question: tc.question,
        intent: 'ERROR',
        hasButton: false,
        hasFallback: true,
        buttonOnly: false,
        pass: false,
        answer: error.message,
        latency: Date.now() - start,
      });
    }

    console.log('');

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  // Final Summary
  console.log('='.repeat(100));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(100));
  console.log('');

  console.log('| # | Part | Pass | Intent | Button | Fallback | Latency |');
  console.log('|---|------|------|--------|--------|----------|---------|');

  for (const r of results) {
    console.log(`| ${r.id} | ${r.part.substring(0,10)} | ${r.pass ? '✅' : '❌'} | ${r.intent} | ${r.hasButton ? 'YES' : 'NO'} | ${r.hasFallback ? 'YES' : 'NO'} | ${r.latency}ms |`);
  }

  console.log('');
  console.log('='.repeat(100));
  console.log(`TOTAL: ${passCount}/${TEST_SUITE.length} PASSED (${((passCount / TEST_SUITE.length) * 100).toFixed(1)}%)`);
  console.log('='.repeat(100));

  if (failCount === 0) {
    console.log('');
    console.log('🎉 ALL TESTS PASSED — PRODUCTION READY');
    console.log('');
  } else {
    console.log('');
    console.log(`⚠️  ${failCount} TESTS FAILED — Review above and fix before deploying`);
    console.log('');
  }

  // Output failed tests for quick review
  const failed = results.filter(r => !r.pass);
  if (failed.length > 0) {
    console.log('FAILED TESTS:');
    for (const f of failed) {
      console.log(`  Q${f.id}: ${f.question.substring(0, 50)}...`);
      console.log(`    → ${f.answer.substring(0, 100)}...`);
    }
  }
}

runFinalValidation().catch(e => console.error('Suite failed:', e.message));
