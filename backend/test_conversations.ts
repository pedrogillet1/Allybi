/**
 * ChatGPT-parity conversation test runner
 * Tests 4 conversations × 15 prompts each = 60 total prompts
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000/api/chat';
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Dev-Auth': '1',
};

interface TestResult {
  prompt: string;
  response: string;
  passed: boolean;
  issues: string[];
}

interface ConversationResult {
  name: string;
  results: TestResult[];
  passCount: number;
  failCount: number;
}

// Quality checks
function checkResponse(response: string, prompt: string): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for truncated numbers (asterisks)
  if (/\$[\d.,]+\s*\*+/.test(response) || /R\$[\d.,]+\s*\*+/.test(response)) {
    issues.push('TRUNCATED_NUMBER_ASTERISK');
  }

  // Check for truncated currency (trailing comma)
  if (/\$[\d.,]+,\s*$/.test(response) || /R\$[\d.,]+,\s*$/.test(response)) {
    issues.push('TRUNCATED_CURRENCY');
  }

  // Check for broken bullets (• • or nested weird bullets)
  if (/•\s*•/.test(response) || /^\s*•\s*•/m.test(response)) {
    issues.push('BROKEN_BULLET_NESTING');
  }

  // Check for "Here are the key points:" followed by bullets (should be stripped)
  if (/Here are the key points:\s*\n\s*[-•]/i.test(response)) {
    issues.push('REDUNDANT_KEY_POINTS_LEADIN');
  }

  // Check for black bar table rows (--- without proper structure)
  if (/^\s*-{3,}\s*$/m.test(response) && !/\|/.test(response)) {
    issues.push('BROKEN_TABLE_SEPARATOR');
  }

  // Check for JSON in response (should never happen)
  if (/^\s*```json/m.test(response) || /^\s*\{\s*"/.test(response)) {
    issues.push('JSON_IN_RESPONSE');
  }

  // Check for wrong doc when explicit file was mentioned
  // (This is a heuristic - check if response mentions different files)

  return { passed: issues.length === 0, issues };
}

async function createConversation(): Promise<string> {
  const res = await fetch(`${BASE_URL}/conversations`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ title: 'Test Conversation' }),
  });
  const data = await res.json() as { id: string };
  return data.id;
}

async function sendMessage(conversationId: string, query: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query }),
  });

  const text = await res.text();

  // Parse SSE events to extract the full response
  const lines = text.split('\n');
  let fullResponse = '';
  let activeDocRef: any = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'text_delta' && data.text) {
          fullResponse += data.text;
        }
        if (data.type === 'done' && data.activeDocRef) {
          activeDocRef = data.activeDocRef;
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }

  return fullResponse;
}

async function runConversation(name: string, prompts: string[]): Promise<ConversationResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`CONVERSATION: ${name}`);
  console.log('='.repeat(60));

  const conversationId = await createConversation();
  const results: TestResult[] = [];
  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    console.log(`\n[${i + 1}/${prompts.length}] ${prompt.slice(0, 60)}...`);

    try {
      const response = await sendMessage(conversationId, prompt);
      const { passed, issues } = checkResponse(response, prompt);

      if (passed) {
        passCount++;
        console.log(`  ✓ PASS`);
      } else {
        failCount++;
        console.log(`  ✗ FAIL: ${issues.join(', ')}`);
      }

      // Print first 200 chars of response
      const preview = response.slice(0, 200).replace(/\n/g, ' ');
      console.log(`  Response: ${preview}...`);

      results.push({ prompt, response, passed, issues });

      // Small delay between prompts
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`  ✗ ERROR: ${err}`);
      failCount++;
      results.push({ prompt, response: '', passed: false, issues: [`ERROR: ${err}`] });
    }
  }

  return { name, results, passCount, failCount };
}

// Conversation definitions
const conversations = [
  {
    name: 'Conversation 1 — analise_mezanino_guarda_moveis.pdf',
    prompts: [
      "Hey — can you open the mezzanine analysis PDF (analise_mezanino_guarda_moveis.pdf)?",
      "At a high level, what is this deal about?",
      "Summarize it in 5 bullets (full sentences).",
      "What's the total investment amount?",
      "Where does the projected revenue increase come from?",
      "Make a table with: investimento total, receita mensal adicional, custos operacionais, lucro líquido mensal adicional.",
      "How do they get to the payback period? Explain the math briefly.",
      "Quote the line that states the payback/tempo de retorno (short quote).",
      "List the key assumptions the model depends on. If any aren't stated, say 'not found' for that item.",
      "Does the document explicitly list risks? If not, say 'not found in this file' (no guessing).",
      "Compare conservative vs optimistic scenario (table).",
      "Where in the document does it mention the monthly revenue after expansion? (section title + value)",
      "If I'm an investor, what are the 3 most important numbers I should remember? (bullets)",
      "Quick check: which file are we using right now? (filename only)",
      "Wrap up with one sentence: based on the document, is the expansion financially attractive?",
    ],
  },
  {
    name: 'Conversation 2 — Capítulo 8 (Framework Scrum).pdf',
    prompts: [
      "Hey — open Capítulo 8 (Framework Scrum).pdf for me.",
      "Just to confirm you can read it: quote one short sentence from the first content page.",
      "Give me a short overview of what this chapter covers (2–3 sentences).",
      "Summarize the chapter in 6 bullets (full sentences).",
      "According to this chapter, what are the Scrum roles? Explain briefly, then list them.",
      "What Scrum events does it describe? Explain briefly, then list them.",
      "Does it list Scrum artifacts in the text? If not, say not found.",
      "Quote one short sentence describing what a Sprint is (if present; else not found).",
      "Quote one short sentence about Sprint Planning (if present; else not found).",
      "Quote one short sentence about the Daily Scrum (if present; else not found).",
      "Make a table of any timeboxes mentioned (event → timebox). If none, say not found.",
      "What guidance does the chapter give for adopting Scrum or transitioning into it? (5 bullets)",
      "If any part was hard to read due to the scan/OCR, tell me one line about what looked unclear.",
      "Which file are we using right now? (filename only)",
      "End with a one-sentence takeaway: what's the chapter's main point about Scrum?",
    ],
  },
  {
    name: 'Conversation 3 — Real-Estate-Empreendimento-Parque-Global.pptx',
    prompts: [
      "Hey — open the Parque Global presentation (Real-Estate-Empreendimento-Parque-Global.pptx).",
      "In 2–3 sentences, what is this presentation about?",
      "List the main slide headings/sections in order.",
      "Summarize the deck in 5 bullets (full sentences).",
      "What's the value proposition of the project? Explain in one short paragraph.",
      "List the key features/amenities mentioned (bullets). If the deck doesn't list them clearly, say not found.",
      "What audience is this deck aimed at (buyers, investors, partners)? Explain briefly using only what's in the slides.",
      "Make a table with: topic → what the slide says (3–6 rows of the most important topics).",
      "What numbers or metrics are mentioned? (bullets). If none, say not found.",
      "Quote one short sentence that feels like a main claim or headline (if present; else not found).",
      "If there's any timeline, phase, or delivery info, summarize it (bullets). If not found, say not found.",
      "Pick the single best slide for an investor and explain why (2–3 sentences). If not clear, say not found.",
      "Now give a short investor-style conclusion (3–5 sentences): what's compelling here?",
      "Which file are we using right now? (filename only)",
      "Finish with 3 smart follow-up questions I should ask after reading this deck (bullets).",
    ],
  },
  {
    name: 'Conversation 4 — Lone Mountain Ranch P&L 2025 (Budget).xlsx',
    prompts: [
      "Hey — open the Lone Mountain Ranch budget workbook (Lone Mountain Ranch P&L 2025 (Budget).xlsx).",
      "List the sheet names.",
      "Give me a short overview of what this workbook contains (2–3 sentences).",
      "What is total revenue for the year? Give the row label + value.",
      "Make a table: Revenue, Total Expenses, GOP, NOI (or 'not found').",
      "List the top 5 revenue line items (table: line item → annual total).",
      "List the top 5 expense line items (table: line item → annual total).",
      "Does 'Rooms Revenue' exist? If yes: value + where (sheet + row label). If not: not found.",
      "Does 'Food & Beverage' exist? Same rule: value + where, or not found.",
      "Compute (Revenue − Total Expenses) / Revenue, if possible. If not possible, say why.",
      "Do quarters (Q1/Q2/Q3/Q4) appear anywhere? If not, say not found.",
      "What's the biggest expense category, based on the totals? One sentence.",
      "Explain in plain English what this budget suggests about performance (one short paragraph).",
      "Which file are we using right now? (filename only)",
      "End with one sentence: what's the biggest driver of this budget (based on what you saw)?",
    ],
  },
];

async function main() {
  console.log('Starting ChatGPT-parity test suite...');
  console.log(`Testing ${conversations.length} conversations × 15 prompts = 60 total prompts\n`);

  const allResults: ConversationResult[] = [];

  for (const conv of conversations) {
    const result = await runConversation(conv.name, conv.prompts);
    allResults.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));

  let totalPass = 0;
  let totalFail = 0;

  for (const result of allResults) {
    console.log(`\n${result.name}`);
    console.log(`  Pass: ${result.passCount}/${result.results.length}`);
    console.log(`  Fail: ${result.failCount}/${result.results.length}`);
    totalPass += result.passCount;
    totalFail += result.failCount;

    // List failures
    const failures = result.results.filter(r => !r.passed);
    if (failures.length > 0) {
      console.log('  Failures:');
      for (const f of failures) {
        console.log(`    - [${f.issues.join(', ')}] ${f.prompt.slice(0, 50)}...`);
      }
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`TOTAL: ${totalPass}/${totalPass + totalFail} passed (${Math.round(100 * totalPass / (totalPass + totalFail))}%)`);
}

main().catch(console.error);
