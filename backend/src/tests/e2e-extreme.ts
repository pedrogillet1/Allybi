/**
 * KODA — EXTREME CONVERSATION TEST
 * 60 questions testing discovery, navigation, Q&A, follow-ups, multi-intent
 *
 * Run: npx ts-node src/tests/e2e-extreme.ts
 */

import axios from 'axios';

const API_BASE = 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

interface TestCase {
  num: number;
  query: string;
  phase: string;
  expectButton?: boolean;
  expectFileAction?: boolean;
}

const TESTS: TestCase[] = [
  // PHASE 1 — DISCOVERY & LOCATION (EASY)
  { num: 1, query: "What folders do I have inside Koda test?", phase: "1-DISCOVERY" },
  { num: 2, query: "Open the test 1 folder.", phase: "1-DISCOVERY", expectFileAction: true },
  { num: 3, query: "Which files are inside this folder?", phase: "1-DISCOVERY" },
  { num: 4, query: "Where is the file Rosewood Fund v3.xlsx located?", phase: "1-DISCOVERY", expectFileAction: true },
  { num: 5, query: "Just open Rosewood Fund v3.xlsx.", phase: "1-DISCOVERY", expectFileAction: true, expectButton: true },
  { num: 6, query: "Go back to the Koda test folder.", phase: "1-DISCOVERY" },
  { num: 7, query: "Open test 2.", phase: "1-DISCOVERY", expectFileAction: true },
  { num: 8, query: "List all the documents in this folder.", phase: "1-DISCOVERY" },
  { num: 9, query: "Where is Trabalho projeto.pdf stored?", phase: "1-DISCOVERY", expectFileAction: true },
  { num: 10, query: "Show me OBA_marketing_servicos (1).pdf.", phase: "1-DISCOVERY", expectFileAction: true, expectButton: true },

  // PHASE 2 — DOCUMENT UNDERSTANDING (MEDIUM)
  { num: 11, query: "What is Trabalho projeto.pdf about?", phase: "2-DOC_QA" },
  { num: 12, query: "Does OBA_marketing_servicos (1).pdf talk about marketing strategy or execution?", phase: "2-DOC_QA" },
  { num: 13, query: "Summarize analise_mezanino_guarda_moveis.pdf in one paragraph.", phase: "2-DOC_QA" },
  { num: 14, query: "What kind of plan is described in LMR Improvement Plan 202503 ($63m PIP).xlsx?", phase: "2-DOC_QA" },
  { num: 15, query: "Which file here looks more financial than descriptive?", phase: "2-DOC_QA" },

  // PHASE 3 — FOLLOW-UPS & CONTEXT (HARDER)
  { num: 16, query: "Does it mention costs or investments?", phase: "3-FOLLOWUP" },
  { num: 17, query: "Which page talks about that?", phase: "3-FOLLOWUP" },
  { num: 18, query: "Open that section.", phase: "3-FOLLOWUP", expectFileAction: true },
  { num: 19, query: "Is this document more operational or strategic?", phase: "3-FOLLOWUP" },
  { num: 20, query: "Compare this file with Rosewood Fund v3.xlsx.", phase: "3-FOLLOWUP" },

  // PHASE 4 — CROSS-FOLDER REASONING (HARD)
  { num: 21, query: "Go back to test 1.", phase: "4-CROSS_FOLDER" },
  { num: 22, query: "Which document talks about budgets?", phase: "4-CROSS_FOLDER", expectButton: true },
  { num: 23, query: "Compare Lone Mountain Ranch P&L 2024.xlsx and Lone Mountain Ranch P&L 2025 (Budget).xlsx.", phase: "4-CROSS_FOLDER" },
  { num: 24, query: "Which one looks like a projection and why?", phase: "4-CROSS_FOLDER" },
  { num: 25, query: "Open the older one.", phase: "4-CROSS_FOLDER", expectFileAction: true, expectButton: true },
  { num: 26, query: "Where exactly is this file located in the folder structure?", phase: "4-CROSS_FOLDER", expectFileAction: true },

  // PHASE 5 — IMPLICIT FILE ACTIONS (VERY HARD)
  { num: 27, query: "Show me the spreadsheet again.", phase: "5-IMPLICIT", expectFileAction: true, expectButton: true },
  { num: 28, query: "Is that file bigger or smaller than the Rosewood one?", phase: "5-IMPLICIT" },
  { num: 29, query: "Open the other one.", phase: "5-IMPLICIT", expectFileAction: true, expectButton: true },
  { num: 30, query: "Which folder contains more financial files overall?", phase: "5-IMPLICIT" },

  // PHASE 6 — MULTI-INTENT IN ONE QUESTION
  { num: 31, query: "Which document talks about financial performance, where is it located, and can you open it?", phase: "6-MULTI_INTENT", expectFileAction: true, expectButton: true },
  { num: 32, query: "From all the folders, which file should I read to understand investment strategy?", phase: "6-MULTI_INTENT", expectButton: true },
  { num: 33, query: "List the files related to planning, and open the most recent one.", phase: "6-MULTI_INTENT", expectFileAction: true },
  { num: 34, query: "Compare the Rosewood Fund file with the Lone Mountain Ranch budget and tell me which is more detailed.", phase: "6-MULTI_INTENT" },

  // PHASE 7 — TEST 3 (PDFs + IMAGE)
  { num: 35, query: "Open test 3.", phase: "7-TEST3", expectFileAction: true },
  { num: 36, query: "What is Capítulo 8 (Framework Scrum).pdf about?", phase: "7-TEST3" },
  { num: 37, query: "Is this document theoretical or practical?", phase: "7-TEST3" },
  { num: 38, query: "Compare it with Anotações Aula 2 (1).pdf.", phase: "7-TEST3" },
  { num: 39, query: "Which one looks like class notes?", phase: "7-TEST3" },
  { num: 40, query: "Open the image file in this folder.", phase: "7-TEST3", expectFileAction: true },
  { num: 41, query: "What does the image represent?", phase: "7-TEST3" },

  // PHASE 8 — AMBIGUOUS HUMAN QUESTIONS
  { num: 42, query: "Which of these files is more important?", phase: "8-AMBIGUOUS" },
  { num: 43, query: "Does this look good or bad overall?", phase: "8-AMBIGUOUS" },
  { num: 44, query: "What's the main takeaway here?", phase: "8-AMBIGUOUS" },
  { num: 45, query: "Is this better than the other one?", phase: "8-AMBIGUOUS" },

  // PHASE 9 — CHATGPT-STYLE SHORT COMMANDS
  { num: 46, query: "Open it.", phase: "9-SHORT_CMD", expectFileAction: true, expectButton: true },
  { num: 47, query: "Show that file again.", phase: "9-SHORT_CMD", expectFileAction: true, expectButton: true },
  { num: 48, query: "Where was that stored?", phase: "9-SHORT_CMD", expectFileAction: true },
  { num: 49, query: "Just list the files.", phase: "9-SHORT_CMD" },
  { num: 50, query: "Only open the document.", phase: "9-SHORT_CMD", expectFileAction: true },

  // PHASE 10 — STRESS FOLLOW-UP CHAIN
  { num: 51, query: "Open Rosewood.", phase: "10-STRESS", expectFileAction: true, expectButton: true },
  { num: 52, query: "Who is it about?", phase: "10-STRESS" },
  { num: 53, query: "Now go back.", phase: "10-STRESS" },
  { num: 54, query: "Open the budget.", phase: "10-STRESS", expectFileAction: true, expectButton: true },
  { num: 55, query: "Which year is this?", phase: "10-STRESS" },
  { num: 56, query: "Compare it with the other one.", phase: "10-STRESS" },
  { num: 57, query: "Open the older file.", phase: "10-STRESS", expectFileAction: true, expectButton: true },
  { num: 58, query: "Where is it located?", phase: "10-STRESS", expectFileAction: true },
  { num: 59, query: "Show it.", phase: "10-STRESS", expectFileAction: true, expectButton: true },
  { num: 60, query: "List files.", phase: "10-STRESS" },
];

const REPHRASE_PATTERNS = [
  /could you (please )?(rephrase|clarify|be more specific)/i,
  /please (rephrase|clarify|try again)/i,
  /I('m| am) not sure what you('re| are) asking/i,
  /can you (try|ask) (again|differently)/i,
  /what (exactly )?do you mean/i,
  /please provide more/i,
];

function isRephrase(text: string): boolean {
  return REPHRASE_PATTERNS.some(p => p.test(text));
}

interface TestResult {
  num: number;
  query: string;
  phase: string;
  intent: string;
  fileAction?: string;
  fileCount: number;
  hasButton: boolean;
  isRephrase: boolean;
  ttft: number;
  responsePreview: string;
  pass: boolean;
  failReason?: string;
}

async function login(): Promise<string> {
  const res = await axios.post(`${API_BASE}/api/auth/login`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  return res.data.accessToken || res.data.token;
}

async function sendMessage(
  token: string,
  conversationId: string,
  query: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ response: string; intent: string; fileAction?: string; files?: any[]; ttft: number }> {
  const start = Date.now();

  const res = await axios.post(
    `${API_BASE}/api/rag/query`,
    { query, conversationId, messages, streaming: false },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 60000 }
  );

  const data = res.data;
  return {
    response: data.answer || data.response || '',
    intent: data.intent || data.metadata?.primaryIntent || 'unknown',
    fileAction: data.fileAction?.action,
    files: data.fileAction?.files || [],
    ttft: Date.now() - start,
  };
}

async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('  KODA — EXTREME CONVERSATION TEST (60 QUESTIONS)');
  console.log('='.repeat(80) + '\n');

  const token = await login();
  console.log('✅ Logged in\n');

  const conversationId = 'extreme-' + Date.now();
  const messages: Array<{ role: string; content: string }> = [];
  const results: TestResult[] = [];
  let currentPhase = '';

  for (const test of TESTS) {
    if (test.phase !== currentPhase) {
      currentPhase = test.phase;
      console.log('\n' + '-'.repeat(70));
      console.log(`  📂 ${currentPhase}`);
      console.log('-'.repeat(70));
    }

    try {
      const { response, intent, fileAction, files, ttft } = await sendMessage(
        token, conversationId, test.query, messages
      );

      messages.push({ role: 'user', content: test.query });
      messages.push({ role: 'assistant', content: response });

      const hasButton = (files?.length || 0) > 0;
      const rephraseDetected = isRephrase(response);

      let pass = true;
      let failReason: string | undefined;

      if (rephraseDetected) {
        pass = false;
        failReason = 'REPHRASE';
      } else if (test.expectFileAction && !fileAction) {
        pass = false;
        failReason = 'NO_FILE_ACTION';
      } else if (test.expectButton && !hasButton) {
        pass = false;
        failReason = 'NO_BUTTON';
      }

      results.push({
        num: test.num,
        query: test.query,
        phase: test.phase,
        intent,
        fileAction,
        fileCount: files?.length || 0,
        hasButton,
        isRephrase: rephraseDetected,
        ttft,
        responsePreview: response.substring(0, 70).replace(/\n/g, ' '),
        pass,
        failReason,
      });

      const icon = pass ? '✅' : '❌';
      console.log(`${icon} Q${test.num}: "${test.query.substring(0, 45)}..."`);
      console.log(`   🧭 ${intent} | ⏱️ ${ttft}ms${fileAction ? ` | 🔘 ${fileAction}(${files?.length})` : ''}`);
      if (!pass) console.log(`   ⚠️  ${failReason}`);

    } catch (error: any) {
      console.log(`❌ Q${test.num}: ERROR - ${error.message.substring(0, 50)}`);
      results.push({
        num: test.num, query: test.query, phase: test.phase,
        intent: 'ERROR', fileCount: 0, hasButton: false,
        isRephrase: false, ttft: 0, responsePreview: error.message,
        pass: false, failReason: 'ERROR',
      });
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // REPORT
  console.log('\n' + '='.repeat(80));
  console.log('  📊 FINAL REPORT');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const rephrases = results.filter(r => r.isRephrase).length;
  const avgTTFT = Math.round(results.reduce((a, r) => a + r.ttft, 0) / results.length);

  console.log(`\n  PASS: ${passed}/60 (${((passed/60)*100).toFixed(1)}%)`);
  console.log(`  FAIL: ${failed}`);
  console.log(`  REPHRASE ERRORS: ${rephrases} ${rephrases > 0 ? '❌ CRITICAL' : '✅'}`);
  console.log(`  AVG LATENCY: ${avgTTFT}ms`);

  console.log('\n  BY PHASE:');
  const phases = [...new Set(results.map(r => r.phase))];
  for (const phase of phases) {
    const pr = results.filter(r => r.phase === phase);
    const pp = pr.filter(r => r.pass).length;
    console.log(`   ${pp === pr.length ? '✅' : '⚠️'} ${phase}: ${pp}/${pr.length}`);
  }

  if (failed > 0) {
    console.log('\n  FAILURES:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`   ❌ Q${r.num} [${r.failReason}]: "${r.query.substring(0, 35)}..."`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log(passed >= 57 && rephrases === 0
    ? '  ✅ READY TO DEPLOY (≥95% pass, 0 rephrases)'
    : '  ⚠️  NEEDS REVIEW');
  console.log('='.repeat(80) + '\n');

  process.exit(failed > 3 ? 1 : 0);
}

runTests().catch(console.error);
