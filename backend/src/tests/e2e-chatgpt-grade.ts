import 'dotenv/config';
import axios from 'axios';

const API_BASE = 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

interface TestCase {
  id: number;
  phase: string;
  question: string;
  expectation: string;
}

const TEST_CASES: TestCase[] = [
  // PHASE 1 — DISCOVERY & LOCATION (EASY)
  { id: 1, phase: '1-DISCOVERY', question: 'What folders do I have inside Koda test?', expectation: 'folder_list' },
  { id: 2, phase: '1-DISCOVERY', question: 'Open the test 1 folder.', expectation: 'folder_open' },
  { id: 3, phase: '1-DISCOVERY', question: 'Which files are inside this folder?', expectation: 'file_list' },
  { id: 4, phase: '1-DISCOVERY', question: 'Where is the file Rosewood Fund v3.xlsx located?', expectation: 'file_location' },
  { id: 5, phase: '1-DISCOVERY', question: 'Just open Rosewood Fund v3.xlsx.', expectation: 'file_open' },
  { id: 6, phase: '1-DISCOVERY', question: 'Go back to the Koda test folder.', expectation: 'folder_navigate' },
  { id: 7, phase: '1-DISCOVERY', question: 'Open test 2.', expectation: 'folder_open' },
  { id: 8, phase: '1-DISCOVERY', question: 'List all the documents in this folder.', expectation: 'file_list' },
  { id: 9, phase: '1-DISCOVERY', question: 'Where is Trabalho projeto.pdf stored?', expectation: 'file_location' },
  { id: 10, phase: '1-DISCOVERY', question: 'Show me OBA_marketing_servicos (1).pdf.', expectation: 'file_show' },

  // PHASE 2 — DOCUMENT UNDERSTANDING (MEDIUM)
  { id: 11, phase: '2-UNDERSTANDING', question: 'What is Trabalho projeto.pdf about?', expectation: 'doc_summary' },
  { id: 12, phase: '2-UNDERSTANDING', question: 'Does OBA_marketing_servicos (1).pdf talk about marketing strategy or execution?', expectation: 'doc_analysis' },
  { id: 13, phase: '2-UNDERSTANDING', question: 'Summarize analise_mezanino_guarda_moveis.pdf in one paragraph.', expectation: 'doc_summary' },
  { id: 14, phase: '2-UNDERSTANDING', question: 'What kind of plan is described in LMR Improvement Plan 202503 ($63m PIP).xlsx?', expectation: 'doc_analysis' },
  { id: 15, phase: '2-UNDERSTANDING', question: 'Which file here looks more financial than descriptive?', expectation: 'doc_comparison' },

  // PHASE 3 — FOLLOW-UPS & CONTEXT (HARDER)
  { id: 16, phase: '3-FOLLOWUPS', question: 'Does it mention costs or investments?', expectation: 'followup_answer' },
  { id: 17, phase: '3-FOLLOWUPS', question: 'Which page talks about that?', expectation: 'page_reference' },
  { id: 18, phase: '3-FOLLOWUPS', question: 'Open that section.', expectation: 'section_open' },
  { id: 19, phase: '3-FOLLOWUPS', question: 'Is this document more operational or strategic?', expectation: 'doc_analysis' },
  { id: 20, phase: '3-FOLLOWUPS', question: 'Compare this file with Rosewood Fund v3.xlsx.', expectation: 'doc_comparison' },

  // PHASE 4 — CROSS-FOLDER REASONING (HARD)
  { id: 21, phase: '4-CROSSFOLDER', question: 'Go back to test 1.', expectation: 'folder_navigate' },
  { id: 22, phase: '4-CROSSFOLDER', question: 'Which document talks about budgets?', expectation: 'doc_search' },
  { id: 23, phase: '4-CROSSFOLDER', question: 'Compare Lone Mountain Ranch P&L 2024.xlsx and Lone Mountain Ranch P&L 2025 (Budget).xlsx.', expectation: 'doc_comparison' },
  { id: 24, phase: '4-CROSSFOLDER', question: 'Which one looks like a projection and why?', expectation: 'doc_analysis' },
  { id: 25, phase: '4-CROSSFOLDER', question: 'Open the older one.', expectation: 'file_open' },
  { id: 26, phase: '4-CROSSFOLDER', question: 'Where exactly is this file located in the folder structure?', expectation: 'file_location' },

  // PHASE 5 — IMPLICIT FILE ACTIONS (VERY HARD)
  { id: 27, phase: '5-IMPLICIT', question: 'Show me the spreadsheet again.', expectation: 'file_show' },
  { id: 28, phase: '5-IMPLICIT', question: 'Is that file bigger or smaller than the Rosewood one?', expectation: 'file_comparison' },
  { id: 29, phase: '5-IMPLICIT', question: 'Open the other one.', expectation: 'file_open' },
  { id: 30, phase: '5-IMPLICIT', question: 'Which folder contains more financial files overall?', expectation: 'folder_analysis' },

  // PHASE 6 — MULTI-INTENT IN ONE QUESTION
  { id: 31, phase: '6-MULTIINTENT', question: 'Which document talks about financial performance, where is it located, and can you open it?', expectation: 'multi_intent' },
  { id: 32, phase: '6-MULTIINTENT', question: 'From all the folders, which file should I read to understand investment strategy?', expectation: 'recommendation' },
  { id: 33, phase: '6-MULTIINTENT', question: 'List the files related to planning, and open the most recent one.', expectation: 'multi_intent' },
  { id: 34, phase: '6-MULTIINTENT', question: 'Compare the Rosewood Fund file with the Lone Mountain Ranch budget and tell me which is more detailed.', expectation: 'doc_comparison' },

  // PHASE 7 — TEST 3 (PDFs + IMAGE)
  { id: 35, phase: '7-TEST3', question: 'Open test 3.', expectation: 'folder_open' },
  { id: 36, phase: '7-TEST3', question: 'What is Capítulo 8 (Framework Scrum).pdf about?', expectation: 'doc_summary' },
  { id: 37, phase: '7-TEST3', question: 'Is this document theoretical or practical?', expectation: 'doc_analysis' },
  { id: 38, phase: '7-TEST3', question: 'Compare it with Anotações Aula 2 (1).pdf.', expectation: 'doc_comparison' },
  { id: 39, phase: '7-TEST3', question: 'Which one looks like class notes?', expectation: 'doc_analysis' },
  { id: 40, phase: '7-TEST3', question: 'Open the image file in this folder.', expectation: 'file_open' },
  { id: 41, phase: '7-TEST3', question: 'What does the image represent?', expectation: 'image_analysis' },

  // PHASE 8 — AMBIGUOUS HUMAN QUESTIONS (NO FALLBACK ALLOWED)
  { id: 42, phase: '8-AMBIGUOUS', question: 'Which of these files is more important?', expectation: 'subjective_answer' },
  { id: 43, phase: '8-AMBIGUOUS', question: 'Does this look good or bad overall?', expectation: 'subjective_answer' },
  { id: 44, phase: '8-AMBIGUOUS', question: "What's the main takeaway here?", expectation: 'summary' },
  { id: 45, phase: '8-AMBIGUOUS', question: 'Is this better than the other one?', expectation: 'comparison' },

  // PHASE 9 — CHATGPT-STYLE SHORT COMMANDS
  { id: 46, phase: '9-SHORT', question: 'Open it.', expectation: 'file_open' },
  { id: 47, phase: '9-SHORT', question: 'Show that file again.', expectation: 'file_show' },
  { id: 48, phase: '9-SHORT', question: 'Where was that stored?', expectation: 'file_location' },
  { id: 49, phase: '9-SHORT', question: 'Just list the files.', expectation: 'file_list' },
  { id: 50, phase: '9-SHORT', question: 'Only open the document.', expectation: 'file_open' },

  // PHASE 10 — STRESS FOLLOW-UP CHAIN
  { id: 51, phase: '10-STRESS', question: 'Open Rosewood.', expectation: 'file_open' },
  { id: 52, phase: '10-STRESS', question: 'Who is it about?', expectation: 'doc_answer' },
  { id: 53, phase: '10-STRESS', question: 'Now go back.', expectation: 'navigate_back' },
  { id: 54, phase: '10-STRESS', question: 'Open the budget.', expectation: 'file_open' },
  { id: 55, phase: '10-STRESS', question: 'Which year is this?', expectation: 'doc_answer' },
  { id: 56, phase: '10-STRESS', question: 'Compare it with the other one.', expectation: 'doc_comparison' },
  { id: 57, phase: '10-STRESS', question: 'Open the older file.', expectation: 'file_open' },
  { id: 58, phase: '10-STRESS', question: 'Where is it located?', expectation: 'file_location' },
  { id: 59, phase: '10-STRESS', question: 'Show it.', expectation: 'file_show' },
  { id: 60, phase: '10-STRESS', question: 'Close it and list files.', expectation: 'file_list' },
];

interface TestResult {
  id: number;
  phase: string;
  question: string;
  status: 'PASS' | 'FAIL' | 'REPHRASE' | 'ERROR';
  intent?: string;
  hasFileAction?: boolean;
  responsePreview: string;
  error?: string;
}

async function login(): Promise<string> {
  const res = await axios.post(`${API_BASE}/api/auth/login`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  return res.data.accessToken || res.data.token;
}

async function sendMessage(token: string, message: string, conversationId: string): Promise<any> {
  const res = await axios.post(
    `${API_BASE}/api/rag/query`,
    {
      query: message,
      conversationId,
      language: 'en',
    },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60000,
    }
  );
  return res.data;
}

function evaluateResponse(response: any, testCase: TestCase): TestResult {
  const answer = response.answer || response.response || '';
  const intent = response.intent || response.metadata?.intent || 'unknown';
  const hasFileAction = response.fileAction || response.files || answer.includes('📄') || answer.includes('📁');

  // Check for REPHRASE (CRITICAL FAILURE)
  const rephrasePatterns = [
    /rephrase/i,
    /could you clarify/i,
    /please specify/i,
    /what do you mean/i,
    /can you be more specific/i,
    /I('m| am) not sure what/i,
    /which (file|document|folder) (do you|are you)/i,
  ];

  const isRephrase = rephrasePatterns.some(p => p.test(answer));
  if (isRephrase) {
    return {
      id: testCase.id,
      phase: testCase.phase,
      question: testCase.question,
      status: 'REPHRASE',
      intent,
      hasFileAction,
      responsePreview: answer.substring(0, 150),
      error: 'CRITICAL: Asked user to rephrase',
    };
  }

  // Check for meaningful response
  const hasContent = answer.length > 10;
  const hasError = /error|failed|couldn't|unable to/i.test(answer) && !/error handling|error-free/i.test(answer);

  if (!hasContent) {
    return {
      id: testCase.id,
      phase: testCase.phase,
      question: testCase.question,
      status: 'FAIL',
      intent,
      hasFileAction,
      responsePreview: answer.substring(0, 150),
      error: 'Empty or too short response',
    };
  }

  if (hasError && !hasFileAction) {
    return {
      id: testCase.id,
      phase: testCase.phase,
      question: testCase.question,
      status: 'FAIL',
      intent,
      hasFileAction,
      responsePreview: answer.substring(0, 150),
      error: 'Error in response',
    };
  }

  return {
    id: testCase.id,
    phase: testCase.phase,
    question: testCase.question,
    status: 'PASS',
    intent,
    hasFileAction,
    responsePreview: answer.substring(0, 150),
  };
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('  KODA CHATGPT-GRADE E2E TEST SUITE');
  console.log('  60 Questions | 10 Phases | Single Conversation');
  console.log('='.repeat(80));

  // Login
  console.log('\n🔐 Logging in...');
  let token: string;
  try {
    token = await login();
    console.log('✅ Logged in successfully\n');
  } catch (e: any) {
    console.error('❌ Login failed:', e.message);
    return;
  }

  const conversationId = `chatgpt-grade-test-${Date.now()}`;
  const results: TestResult[] = [];
  let currentPhase = '';

  for (const testCase of TEST_CASES) {
    // Print phase header
    if (testCase.phase !== currentPhase) {
      currentPhase = testCase.phase;
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`  PHASE ${currentPhase}`);
      console.log(`${'─'.repeat(60)}`);
    }

    process.stdout.write(`  [${testCase.id.toString().padStart(2)}] ${testCase.question.substring(0, 50).padEnd(50)} `);

    try {
      const response = await sendMessage(token, testCase.question, conversationId);
      const result = evaluateResponse(response, testCase);
      results.push(result);

      if (result.status === 'PASS') {
        console.log(`✅ PASS (${result.intent})`);
      } else if (result.status === 'REPHRASE') {
        console.log(`🔴 REPHRASE ← CRITICAL`);
      } else {
        console.log(`❌ FAIL: ${result.error}`);
      }

      // Small delay between requests
      await new Promise(r => setTimeout(r, 500));

    } catch (e: any) {
      const result: TestResult = {
        id: testCase.id,
        phase: testCase.phase,
        question: testCase.question,
        status: 'ERROR',
        responsePreview: '',
        error: e.message,
      };
      results.push(result);
      console.log(`💥 ERROR: ${e.message.substring(0, 50)}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('  RESULTS SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const rephrase = results.filter(r => r.status === 'REPHRASE').length;
  const errors = results.filter(r => r.status === 'ERROR').length;

  console.log(`\n  ✅ PASSED:   ${passed}/${results.length} (${(passed/results.length*100).toFixed(1)}%)`);
  console.log(`  ❌ FAILED:   ${failed}`);
  console.log(`  🔴 REPHRASE: ${rephrase} ${rephrase > 0 ? '← CRITICAL FAILURES' : ''}`);
  console.log(`  💥 ERRORS:   ${errors}`);

  // Phase breakdown
  console.log('\n  BY PHASE:');
  const phases = [...new Set(results.map(r => r.phase))];
  for (const phase of phases) {
    const phaseResults = results.filter(r => r.phase === phase);
    const phasePassed = phaseResults.filter(r => r.status === 'PASS').length;
    const phaseRephrase = phaseResults.filter(r => r.status === 'REPHRASE').length;
    const emoji = phaseRephrase > 0 ? '🔴' : phasePassed === phaseResults.length ? '✅' : '⚠️';
    console.log(`    ${emoji} ${phase}: ${phasePassed}/${phaseResults.length}`);
  }

  // List all failures
  const failures = results.filter(r => r.status !== 'PASS');
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    for (const f of failures) {
      console.log(`    [${f.id}] ${f.status}: ${f.question.substring(0, 40)}...`);
      if (f.error) console.log(`         └─ ${f.error}`);
    }
  }

  // Final verdict
  console.log('\n' + '='.repeat(80));
  if (rephrase > 0) {
    console.log('  ❌ VERDICT: FAIL — REPHRASE responses detected');
  } else if (passed >= results.length * 0.98) {
    console.log('  ✅ VERDICT: PASS — Production ready!');
  } else if (passed >= results.length * 0.90) {
    console.log('  ⚠️  VERDICT: ACCEPTABLE — Minor issues to fix');
  } else {
    console.log('  ❌ VERDICT: FAIL — Significant issues');
  }
  console.log('='.repeat(80));
}

runTests().catch(console.error);
