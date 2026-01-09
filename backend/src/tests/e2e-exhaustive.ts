/**
 * KODA - FINAL EXHAUSTIVE TEST PLAN
 * Tests every path, fallback, and UX contract
 *
 * Run: npx ts-node src/tests/e2e-exhaustive.ts
 */

import axios from 'axios';

const API_BASE = 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

interface TestCase {
  num: number;
  query: string;
  section: string;
  lang: 'en' | 'pt';
  expectFileAction?: boolean;
  expectButton?: boolean;
}

const TESTS: TestCase[] = [
  // =====================================================
  // SECTION 1 - LONG MULTI-INTENT FILE QUESTIONS (EN)
  // =====================================================
  { num: 1, query: "Can you tell me which folder the Rosewood Fund document is in and open it for me?", section: "1-MULTI_INTENT", lang: 'en', expectFileAction: true, expectButton: true },
  { num: 2, query: "Which files talk about financial performance, and which one is the most recent?", section: "1-MULTI_INTENT", lang: 'en', expectButton: true },
  { num: 3, query: "From the files we discussed earlier, which one mentions taxes, and can you show me exactly where?", section: "1-MULTI_INTENT", lang: 'en', expectFileAction: true, expectButton: true },
  { num: 4, query: "List all the documents in the accounting folder that look like reports, not spreadsheets.", section: "1-MULTI_INTENT", lang: 'en' },

  // =====================================================
  // SECTION 2 - IMPLICIT FOLLOW-UPS (HARD MODE)
  // =====================================================
  { num: 5, query: "That one — does it mention revenue growth?", section: "2-IMPLICIT_FOLLOWUP", lang: 'en' },
  { num: 6, query: "Open the earlier one we talked about.", section: "2-IMPLICIT_FOLLOWUP", lang: 'en', expectFileAction: true, expectButton: true },
  { num: 7, query: "Is this file newer than the other financial document?", section: "2-IMPLICIT_FOLLOWUP", lang: 'en' },

  // =====================================================
  // SECTION 3 - FILE ACTIONS EMBEDDED IN QUESTIONS
  // =====================================================
  { num: 8, query: "If I wanted to see the spreadsheet again, where would I find it?", section: "3-EMBEDDED_ACTION", lang: 'en', expectFileAction: true },
  { num: 9, query: "Show me the file that talks about operating expenses.", section: "3-EMBEDDED_ACTION", lang: 'en', expectFileAction: true, expectButton: true },
  { num: 10, query: "Which document mentions budget?", section: "3-EMBEDDED_ACTION", lang: 'en', expectButton: true },

  // =====================================================
  // SECTION 4 - DOCUMENT QUESTIONS WITH FILE ACTION OUTPUT
  // =====================================================
  { num: 11, query: "Where exactly does this document say who the stakeholders are?", section: "4-DOC_WITH_ACTION", lang: 'en' },
  { num: 12, query: "Which file should I read if I want to understand the company's risks?", section: "4-DOC_WITH_ACTION", lang: 'en', expectButton: true },

  // =====================================================
  // SECTION 5 - AMBIGUOUS BUT VALID HUMAN QUESTIONS
  // =====================================================
  { num: 13, query: "Does this look good or bad overall?", section: "5-AMBIGUOUS_VALID", lang: 'en' },
  { num: 14, query: "Is this better than the other one?", section: "5-AMBIGUOUS_VALID", lang: 'en' },
  { num: 15, query: "What's the takeaway here?", section: "5-AMBIGUOUS_VALID", lang: 'en' },

  // =====================================================
  // SECTION 6 - RAPID CONTEXT SWITCHING
  // =====================================================
  { num: 16, query: "Open the Rosewood Fund document", section: "6-CONTEXT_SWITCH", lang: 'en', expectFileAction: true, expectButton: true },
  { num: 17, query: "What does it say about performance?", section: "6-CONTEXT_SWITCH", lang: 'en' },
  { num: 18, query: "Now open the Lone Mountain file", section: "6-CONTEXT_SWITCH", lang: 'en', expectFileAction: true, expectButton: true },
  { num: 19, query: "Where is that stored?", section: "6-CONTEXT_SWITCH", lang: 'en', expectFileAction: true },
  { num: 20, query: "Open the spreadsheet again", section: "6-CONTEXT_SWITCH", lang: 'en', expectFileAction: true, expectButton: true },

  // =====================================================
  // SECTION 7 - NEGATIVE & EDGE CASES
  // =====================================================
  { num: 21, query: "Open a file that doesn't exist", section: "7-EDGE_CASES", lang: 'en' },
  { num: 22, query: "Which document is the most important one?", section: "7-EDGE_CASES", lang: 'en' },

  // =====================================================
  // SECTION 8 - CHATGPT-STYLE TOLERANCE (LAZY HUMAN)
  // =====================================================
  { num: 23, query: "show it", section: "8-LAZY_HUMAN", lang: 'en', expectFileAction: true },
  { num: 24, query: "that doc again", section: "8-LAZY_HUMAN", lang: 'en', expectFileAction: true },
  { num: 25, query: "where was that file", section: "8-LAZY_HUMAN", lang: 'en', expectFileAction: true },

  // =====================================================
  // SECTION 9 - FORMAT & UX STRICT TESTS
  // =====================================================
  { num: 26, query: "Just open it.", section: "9-UX_STRICT", lang: 'en', expectFileAction: true, expectButton: true },
  { num: 27, query: "List my files", section: "9-UX_STRICT", lang: 'en' },
  { num: 28, query: "Explain this document simply", section: "9-UX_STRICT", lang: 'en' },

  // =====================================================
  // PORTUGUESE TESTS
  // =====================================================
  { num: 29, query: "Você pode me dizer em qual pasta está o documento Rosewood Fund e já abrir ele para mim?", section: "PT-1-MULTI_INTENT", lang: 'pt', expectFileAction: true, expectButton: true },
  { num: 30, query: "Quais arquivos falam sobre desempenho financeiro?", section: "PT-1-MULTI_INTENT", lang: 'pt', expectButton: true },
  { num: 31, query: "Esse aí — ele menciona crescimento de receita?", section: "PT-2-IMPLICIT_FOLLOWUP", lang: 'pt' },
  { num: 32, query: "Abra aquele que falamos antes.", section: "PT-2-IMPLICIT_FOLLOWUP", lang: 'pt', expectFileAction: true },
  { num: 33, query: "Se eu quisesse ver a planilha de novo, onde eu encontraria ela?", section: "PT-3-EMBEDDED_ACTION", lang: 'pt', expectFileAction: true },
  { num: 34, query: "Qual arquivo eu deveria ler para entender os riscos?", section: "PT-4-DOC_WITH_ACTION", lang: 'pt', expectButton: true },
  { num: 35, query: "No geral, isso parece bom ou ruim?", section: "PT-5-AMBIGUOUS_VALID", lang: 'pt' },
  { num: 36, query: "Abra o Lone Mountain", section: "PT-6-CONTEXT_SWITCH", lang: 'pt', expectFileAction: true, expectButton: true },
  { num: 37, query: "O que ele diz sobre receita?", section: "PT-6-CONTEXT_SWITCH", lang: 'pt' },
  { num: 38, query: "Abra um arquivo que não existe", section: "PT-7-EDGE_CASES", lang: 'pt' },
  { num: 39, query: "mostra ele", section: "PT-8-LAZY_HUMAN", lang: 'pt', expectFileAction: true },
  { num: 40, query: "aquele documento de novo", section: "PT-8-LAZY_HUMAN", lang: 'pt', expectFileAction: true },
  { num: 41, query: "onde estava aquele arquivo", section: "PT-8-LAZY_HUMAN", lang: 'pt', expectFileAction: true },
  { num: 42, query: "Só abre ele.", section: "PT-9-UX_STRICT", lang: 'pt', expectFileAction: true },
];

const REPHRASE_PATTERNS = [
  /could you (please )?(rephrase|clarify|be more specific)/i,
  /please (rephrase|clarify|try again)/i,
  /I('m| am) not sure what you('re| are) asking/i,
  /can you (try|ask) (again|differently)/i,
  /I don't understand/i,
  /what (exactly )?do you mean/i,
  /poderia (reformular|esclarecer)/i,
  /não entendi/i,
  /pode (tentar|perguntar) (de novo|novamente)/i,
];

function isRephrase(text: string): boolean {
  return REPHRASE_PATTERNS.some(p => p.test(text));
}

interface TestResult {
  num: number;
  query: string;
  section: string;
  intent: string;
  fileAction?: string;
  fileCount: number;
  hasButton: boolean;
  isRephrase: boolean;
  ttft: number;
  totalTime: number;
  responsePreview: string;
  pass: boolean;
  failReason?: string;
}

async function login(): Promise<string> {
  try {
    const res = await axios.post(`${API_BASE}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    const token = res.data.accessToken || res.data.token;
    if (!token) {
      throw new Error('No token in response');
    }
    return token;
  } catch (error: any) {
    console.log(`   ⚠️ Login failed: ${error.message}`);
    throw error;
  }
}

async function sendMessage(
  token: string,
  conversationId: string,
  message: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ response: string; intent: string; fileAction?: string; files?: any[]; ttft: number; total: number }> {
  const start = Date.now();

  try {
    const res = await axios.post(
      `${API_BASE}/api/rag/query`,
      {
        query: message,
        conversationId,
        messages,
        streaming: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const ttft = Date.now() - start;
    const total = Date.now() - start;
    const data = res.data;

    const response = data.answer || data.response || data.message || '';
    const intent = data.intent || data.metadata?.primaryIntent || 'unknown';
    const fileAction = data.fileAction?.action;
    const files = data.fileAction?.files || [];

    return { response, intent, fileAction, files, ttft, total };
  } catch (error: any) {
    throw new Error(`API error: ${error.message}`);
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('  KODA V3 — FINAL EXHAUSTIVE TEST');
  console.log('='.repeat(80));
  console.log(`  API: ${API_BASE}`);
  console.log(`  Total tests: ${TESTS.length}`);
  console.log('='.repeat(80) + '\n');

  // Login
  console.log('🔐 Logging in...');
  const token = await login();
  console.log('✅ Logged in\n');

  const conversationId = 'exhaustive-' + Date.now();
  const results: TestResult[] = [];
  const messages: Array<{ role: string; content: string }> = [];
  let currentSection = '';

  for (const test of TESTS) {
    if (test.section !== currentSection) {
      currentSection = test.section;
      console.log('\n' + '-'.repeat(80));
      console.log(`  📂 ${currentSection}`);
      console.log('-'.repeat(80));
    }

    try {
      const { response, intent, fileAction, files, ttft, total } = await sendMessage(
        token,
        conversationId,
        test.query,
        messages
      );

      // Add to conversation history
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

      const result: TestResult = {
        num: test.num,
        query: test.query,
        section: test.section,
        intent,
        fileAction,
        fileCount: files?.length || 0,
        hasButton,
        isRephrase: rephraseDetected,
        ttft,
        totalTime: total,
        responsePreview: response.substring(0, 80).replace(/\n/g, ' '),
        pass,
        failReason,
      };

      results.push(result);

      const icon = pass ? '✅' : '❌';
      console.log(`${icon} Q${test.num}: "${test.query.substring(0, 50)}..."`);
      console.log(`   🧭 ${intent} | ⏱️ TTFT: ${ttft}ms | Total: ${total}ms`);
      if (fileAction) {
        console.log(`   🔘 ${fileAction} (${files?.length || 0} files)`);
      }
      if (!pass) {
        console.log(`   ⚠️  ${failReason}`);
      }
      console.log(`   📋 ${result.responsePreview}...`);

    } catch (error: any) {
      console.log(`❌ Q${test.num}: ERROR - ${error.message}`);
      results.push({
        num: test.num,
        query: test.query,
        section: test.section,
        intent: 'ERROR',
        fileCount: 0,
        hasButton: false,
        isRephrase: false,
        ttft: 0,
        totalTime: 0,
        responsePreview: error.message,
        pass: false,
        failReason: 'ERROR',
      });
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // FINAL REPORT
  console.log('\n' + '='.repeat(80));
  console.log('  📊 FINAL REPORT');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const rephrases = results.filter(r => r.isRephrase).length;
  const avgTTFT = Math.round(results.reduce((a, r) => a + r.ttft, 0) / results.length);
  const avgTotal = Math.round(results.reduce((a, r) => a + r.totalTime, 0) / results.length);

  console.log(`\n1️⃣  PASS/FAIL`);
  console.log(`   Passed: ${passed}/${results.length} (${((passed/results.length)*100).toFixed(1)}%)`);
  console.log(`   Failed: ${failed}`);

  console.log(`\n2️⃣  REPHRASE ERRORS (MUST BE ZERO)`);
  console.log(`   Rephrases: ${rephrases}`);
  if (rephrases > 0) {
    results.filter(r => r.isRephrase).forEach(r => {
      console.log(`   ❌ Q${r.num}: "${r.query.substring(0, 40)}..."`);
    });
  }

  console.log(`\n3️⃣  PERFORMANCE`);
  console.log(`   Avg TTFT: ${avgTTFT}ms`);
  console.log(`   Avg Total: ${avgTotal}ms`);

  console.log(`\n4️⃣  FILE ACTIONS`);
  console.log(`   Triggered: ${results.filter(r => r.fileAction).length}`);
  console.log(`   Buttons: ${results.filter(r => r.hasButton).length}`);

  console.log(`\n5️⃣  BY SECTION`);
  const sections = [...new Set(results.map(r => r.section))];
  for (const section of sections) {
    const sr = results.filter(r => r.section === section);
    const sp = sr.filter(r => r.pass).length;
    console.log(`   ${sp === sr.length ? '✅' : '⚠️'} ${section}: ${sp}/${sr.length}`);
  }

  if (failed > 0) {
    console.log(`\n6️⃣  FAILED`);
    results.filter(r => !r.pass).forEach(r => {
      console.log(`   ❌ Q${r.num} [${r.failReason}]: "${r.query.substring(0, 40)}..."`);
    });
  }

  console.log(`\n${'='.repeat(80)}`);
  if (failed === 0 && rephrases === 0) {
    console.log('  ✅ ALL TESTS PASSED — READY TO DEPLOY');
  } else if (rephrases > 0) {
    console.log('  ❌ REPHRASE ERRORS — FIX BEFORE DEPLOY');
  } else {
    console.log(`  ⚠️  ${failed} FAILURES — REVIEW BEFORE DEPLOY`);
  }
  console.log('='.repeat(80) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
