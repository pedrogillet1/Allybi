/**
 * ChatGPT Parity Test Runner
 *
 * Runs the 5 conversation test suites and validates:
 * - Answer structure (intro + body + conclusion)
 * - No robotic openers/closers
 * - Tables/bullets render correctly
 * - Sources as attachments (not in body)
 * - Active file chip / scope lock
 * - "Not found" discipline
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/chat';
const USER_ID = 'test-user-001';

// Test configuration
interface TestConfig {
  name: string;
  prompts: string[];
  validations: Array<{
    promptIndex: number;
    checks: Array<{
      type: 'has_intro' | 'has_conclusion' | 'has_bullets' | 'has_table' | 'no_sources_in_body' | 'has_source_buttons' | 'says_not_found' | 'no_robotic' | 'has_active_doc';
      description: string;
    }>;
  }>;
}

// Validation helpers
function hasIntro(text: string): boolean {
  // First sentence should be short and set context
  const firstSentence = text.split(/[.!?]/)[0]?.trim();
  return !!firstSentence && firstSentence.length > 10 && firstSentence.length < 200;
}

function hasConclusion(text: string): boolean {
  // Last sentence should wrap up
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
  const lastSentence = sentences[sentences.length - 1]?.trim();
  return !!lastSentence && lastSentence.length > 10;
}

function hasBullets(text: string): boolean {
  return /^[-•*]\s+.+$/m.test(text) || /^\d+\.\s+.+$/m.test(text);
}

function hasTable(text: string): boolean {
  return /\|.+\|/.test(text) && /\|[-:]+\|/.test(text);
}

function noSourcesInBody(text: string): boolean {
  // Should not have "Sources:" or numbered source list in body
  return !/^Sources?:/mi.test(text) && !/^\d+\.\s+https?:/m.test(text);
}

function noRoboticOpeners(text: string): boolean {
  const roboticPatterns = [
    /^(Certainly|Of course|Absolutely|Sure thing|I'd be happy to)/i,
    /^(Based on (the|your) (document|file|data))/i,
    /^(According to the (document|file|information))/i,
    /^(Let me (help|assist|explain))/i,
  ];
  return !roboticPatterns.some(p => p.test(text));
}

function saysNotFound(text: string): boolean {
  return /not found|não encontr|no encuentr/i.test(text);
}

// Run a single conversation
async function runConversation(config: TestConfig): Promise<{ passed: number; failed: number; details: string[] }> {
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    // Create conversation
    const convRes = await axios.post(`${BASE_URL}/conversations`, {}, {
      headers: { 'X-Dev-Auth': '1' }
    });
    const conversationId = convRes.data.id;
    details.push(`✅ Created conversation: ${conversationId}`);

    // Run each prompt
    for (let i = 0; i < config.prompts.length; i++) {
      const prompt = config.prompts[i];
      details.push(`\n--- Prompt ${i + 1}: "${prompt.substring(0, 60)}..."`);

      try {
        // Send message (non-streaming for simpler testing)
        const msgRes = await axios.post(
          `${BASE_URL}/conversations/${conversationId}/messages`,
          { text: prompt, query: prompt },
          { headers: { 'X-Dev-Auth': '1' }, timeout: 60000 }
        );

        const answer = msgRes.data.content || msgRes.data.formatted || msgRes.data.answer || '';
        const sourceButtons = msgRes.data.sourceButtons;
        const activeDocRef = msgRes.data.activeDocRef;

        details.push(`   Answer length: ${answer.length} chars`);
        if (sourceButtons?.buttons?.length > 0) {
          details.push(`   Source buttons: ${sourceButtons.buttons.length}`);
        }
        if (activeDocRef) {
          details.push(`   Active doc: ${activeDocRef.filename} (${activeDocRef.lockType})`);
        }

        // Run validations for this prompt
        const validationsForPrompt = config.validations.find(v => v.promptIndex === i);
        if (validationsForPrompt) {
          for (const check of validationsForPrompt.checks) {
            let checkPassed = false;
            switch (check.type) {
              case 'has_intro': checkPassed = hasIntro(answer); break;
              case 'has_conclusion': checkPassed = hasConclusion(answer); break;
              case 'has_bullets': checkPassed = hasBullets(answer); break;
              case 'has_table': checkPassed = hasTable(answer); break;
              case 'no_sources_in_body': checkPassed = noSourcesInBody(answer); break;
              case 'has_source_buttons': checkPassed = !!sourceButtons?.buttons?.length; break;
              case 'says_not_found': checkPassed = saysNotFound(answer); break;
              case 'no_robotic': checkPassed = noRoboticOpeners(answer); break;
              case 'has_active_doc': checkPassed = !!activeDocRef; break;
            }

            if (checkPassed) {
              passed++;
              details.push(`   ✅ ${check.description}`);
            } else {
              failed++;
              details.push(`   ❌ ${check.description}`);
              details.push(`      Answer preview: "${answer.substring(0, 150)}..."`);
            }
          }
        }

      } catch (err: any) {
        details.push(`   ❌ Error: ${err.message}`);
        failed++;
      }
    }

  } catch (err: any) {
    details.push(`❌ Conversation failed: ${err.message}`);
    failed++;
  }

  return { passed, failed, details };
}

// Test suite definitions
const CONVERSATION_1_MEZANINO: TestConfig = {
  name: 'Conversation 1 - Mezanino Financial Memo',
  prompts: [
    'Hey — can you remind me what this mezzanine proposal is about? I don\'t remember the details.',
    'Which file in my library talks about expanding with a mezzanine and payback?',
    'Open the one that looks like a financial analysis about mezzanine expansion.',
    'Cool. Give me a 5-bullet summary I could forward to a partner.',
    'What\'s the total investment? One sentence, no extra fluff.',
    'Make a table with: investimento total, receita mensal adicional, lucro líquido mensal adicional, tempo de retorno.',
    'List the top 3 risks the document itself mentions. If it doesn\'t mention risks, say \'not found in this file\' — don\'t invent.',
  ],
  validations: [
    { promptIndex: 1, checks: [
      { type: 'has_source_buttons', description: 'Returns doc discovery list' },
    ]},
    { promptIndex: 3, checks: [
      { type: 'has_intro', description: 'Summary has intro' },
      { type: 'has_bullets', description: 'Summary has bullets' },
      { type: 'has_conclusion', description: 'Summary has conclusion' },
      { type: 'no_robotic', description: 'No robotic opener' },
    ]},
    { promptIndex: 5, checks: [
      { type: 'has_table', description: 'Table renders cleanly' },
      { type: 'no_sources_in_body', description: 'Sources not in body' },
    ]},
    { promptIndex: 6, checks: [
      { type: 'says_not_found', description: 'Says not found if risks not present' },
    ]},
  ],
};

const CONVERSATION_3_GUARDA_BENS: TestConfig = {
  name: 'Conversation 3 - Guarda Bens Self Storage',
  prompts: [
    'Hey — which presentation in my library is about Guarda Bens Self Storage and process problems?',
    'Open that presentation and keep it active.',
    'Give me a 5-bullet summary of the presentation, like an executive recap.',
    'Now list the slide headings / major sections in order.',
    'What exact problem statement does it identify? Explain in 2–3 sentences.',
    'Make a table with: problem, impacts, and who is affected (if stated).',
  ],
  validations: [
    { promptIndex: 0, checks: [
      { type: 'has_source_buttons', description: 'Returns doc discovery' },
    ]},
    { promptIndex: 2, checks: [
      { type: 'has_intro', description: 'Summary has intro' },
      { type: 'has_bullets', description: 'Summary has bullets' },
      { type: 'no_robotic', description: 'No robotic opener' },
    ]},
    { promptIndex: 3, checks: [
      { type: 'has_bullets', description: 'Lists sections' },
    ]},
    { promptIndex: 5, checks: [
      { type: 'has_table', description: 'Table formatting is clean' },
      { type: 'no_sources_in_body', description: 'Sources as buttons' },
    ]},
  ],
};

const CONVERSATION_5_LMR: TestConfig = {
  name: 'Conversation 5 - Lone Mountain Ranch P&L',
  prompts: [
    'I uploaded a budget P&L workbook for Lone Mountain Ranch. Which file is it?',
    'Open it and keep it active.',
    'List the sheet names.',
    'Give me a short overview: what does this workbook contain?',
    'Make a table: Revenue, Total Expenses, GOP, NOI (or not found).',
    'Do you see quarters (Q1/Q2/Q3/Q4) anywhere? If not, say not found.',
  ],
  validations: [
    { promptIndex: 0, checks: [
      { type: 'has_source_buttons', description: 'Finds LMR workbook' },
    ]},
    { promptIndex: 2, checks: [
      { type: 'has_bullets', description: 'Lists sheet names' },
    ]},
    { promptIndex: 4, checks: [
      { type: 'has_table', description: 'Financial table renders' },
    ]},
    { promptIndex: 5, checks: [
      { type: 'says_not_found', description: 'Correctly says not found if no quarters' },
    ]},
  ],
};

// Main runner
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ChatGPT PARITY TEST RUNNER');
  console.log('═══════════════════════════════════════════════════════════\n');

  const tests = [CONVERSATION_1_MEZANINO, CONVERSATION_3_GUARDA_BENS, CONVERSATION_5_LMR];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const test of tests) {
    console.log(`\n▶ ${test.name}`);
    console.log('─'.repeat(60));

    const result = await runConversation(test);
    totalPassed += result.passed;
    totalFailed += result.failed;

    for (const line of result.details) {
      console.log(line);
    }

    console.log(`\n   Result: ${result.passed} passed, ${result.failed} failed`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
