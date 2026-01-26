/**
 * 60-Turn One-Conversation Test
 *
 * Tests the full Koda pipeline in a single continuous conversation.
 * Validates: routing, formatting, doc switching, sources separation, answer quality.
 *
 * Run with: KODA_TRACE=1 npx ts-node test_60_conversation.ts
 */

import axios from 'axios';
import * as fs from 'fs';

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const USER_ID = process.env.TEST_USER_ID || 'test-user-60';
const AUTH_HEADER = { 'X-Dev-Auth': '1', 'Content-Type': 'application/json' };

// Will be set after creating conversation
let CONVERSATION_ID: string = '';

interface TurnResult {
  turn: number;
  query: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  answerPreview: string;
  hasAnswer: boolean;
  hasSources: boolean;
  sourceCount: number;
  activeDoc?: string;
  intent?: string;
  operator?: string;
  errors: string[];
  trace?: any;
}

const QUERIES: Array<{ turn: number; query: string; phase: string; expected?: string }> = [
  // Phase 1 — Deal understanding (Mezanino PDF) (Turns 1–12)
  { turn: 1, query: "Use analise_mezanino_guarda_moveis.pdf. Summarize the deal in 5 bullets.", phase: "Phase 1: Mezanino PDF", expected: "5 bullets" },
  { turn: 2, query: "What's the total investment amount? (one sentence)", phase: "Phase 1", expected: "one sentence" },
  { turn: 3, query: "Make a table with: investimento total, receita mensal adicional, lucro líquido mensal adicional, tempo de retorno.", phase: "Phase 1", expected: "table" },
  { turn: 4, query: "Quote one sentence that states the main conclusion (short quote).", phase: "Phase 1", expected: "blockquote" },
  { turn: 5, query: "List the top 5 assumptions.", phase: "Phase 1", expected: "5 items" },
  { turn: 6, query: "List the top 5 risks.", phase: "Phase 1", expected: "5 items" },
  { turn: 7, query: "Extract any timeline/date references (table).", phase: "Phase 1", expected: "table" },
  { turn: 8, query: "Now explain in 2 bullets why revenue increase and profit increase differ (if described; else say not found).", phase: "Phase 1", expected: "2 bullets or not found" },
  { turn: 9, query: "Answer as JSON: {investment, revenue_monthly, profit_monthly, payback_months}.", phase: "Phase 1", expected: "JSON block" },
  { turn: 10, query: "Confirm which file you're using right now (filename only).", phase: "Phase 1", expected: "filename" },
  { turn: 11, query: "Stay on the same PDF. What section title contains the conclusion? (or say not found)", phase: "Phase 1", expected: "section title or not found" },
  { turn: 12, query: "Don't switch docs unless I explicitly name a file. Say \"ok\" if you understand.", phase: "Phase 1", expected: "ok" },

  // Phase 2 — P&L budget workbook (Turns 13–26)
  { turn: 13, query: "Switch to Lone Mountain Ranch P&L 2025 (Budget).xlsx. List sheet names.", phase: "Phase 2: P&L Workbook", expected: "sheet names list" },
  { turn: 14, query: "What is total revenue for the year? Give the label + value.", phase: "Phase 2", expected: "label + value" },
  { turn: 15, query: "Table: Revenue, Total Expenses, GOP, NOI (or \"not found\").", phase: "Phase 2", expected: "table or not found" },
  { turn: 16, query: "Give top 5 revenue line items (table).", phase: "Phase 2", expected: "table" },
  { turn: 17, query: "Give top 5 expense line items (table).", phase: "Phase 2", expected: "table" },
  { turn: 18, query: "If Rooms Revenue exists, give value + where (sheet + row label). If not found, say not found.", phase: "Phase 2", expected: "value or not found" },
  { turn: 19, query: "If Food & Beverage exists, give value + where. If not found, say not found.", phase: "Phase 2", expected: "value or not found" },
  { turn: 20, query: "Compute GOP margin % if possible. If not possible, say why (one paragraph).", phase: "Phase 2", expected: "percentage or explanation" },
  { turn: 21, query: "Now do Q2 only. If quarters aren't in the sheet, say not found (no guessing).", phase: "Phase 2", expected: "Q2 data or not found" },
  { turn: 22, query: "Confirm which file you're using (filename only).", phase: "Phase 2", expected: "filename" },
  { turn: 23, query: "Stay on the same file. Now answer the biggest revenue category (one line).", phase: "Phase 2", expected: "one line" },
  { turn: 24, query: "Now answer the biggest expense category (one line).", phase: "Phase 2", expected: "one line" },
  { turn: 25, query: "Show both answers as bullets.", phase: "Phase 2", expected: "2 bullets" },
  { turn: 26, query: "Show both answers as JSON.", phase: "Phase 2", expected: "JSON block" },

  // Phase 3 — PIP workbook (Turns 27–34)
  { turn: 27, query: "Switch to LMR Improvement Plan 202503 ($63m PIP).xlsx. Summarize in 5 bullets.", phase: "Phase 3: PIP Workbook", expected: "5 bullets" },
  { turn: 28, query: "Make a table with key metrics: Capex, NOI Improvement, Return on Cost.", phase: "Phase 3", expected: "table" },
  { turn: 29, query: "Quote one sentence about NOI improvement (short quote).", phase: "Phase 3", expected: "blockquote" },
  { turn: 30, query: "If \"Available Cabin Nights\" exists, give one row example with date + value (table with 2 columns). If not found, say not found.", phase: "Phase 3", expected: "table or not found" },
  { turn: 31, query: "Confirm the active file (filename only).", phase: "Phase 3", expected: "filename" },
  { turn: 32, query: "Now, without switching docs, explain in 2 bullets what \"Return on Cost\" means in this context (if described; else say not found).", phase: "Phase 3", expected: "2 bullets or not found" },
  { turn: 33, query: "Switch back to the P&L workbook and repeat the Revenue/Expenses/GOP/NOI table.", phase: "Phase 3", expected: "table" },
  { turn: 34, query: "Confirm active file again (filename only).", phase: "Phase 3", expected: "filename" },

  // Phase 4 — Scanned Scrum PDF OCR (Turns 35–44)
  { turn: 35, query: "Switch to Capítulo 8 (Framework Scrum).pdf. List Scrum roles.", phase: "Phase 4: Scrum PDF OCR", expected: "roles list" },
  { turn: 36, query: "List Scrum events.", phase: "Phase 4", expected: "events list" },
  { turn: 37, query: "List Scrum artifacts.", phase: "Phase 4", expected: "artifacts list" },
  { turn: 38, query: "Quote one sentence defining Sprint (short). If not found, say not found.", phase: "Phase 4", expected: "quote or not found" },
  { turn: 39, query: "If the chapter mentions timeboxes, list them (table). If not found, say not found.", phase: "Phase 4", expected: "table or not found" },
  { turn: 40, query: "Summarize the chapter in 6 bullets.", phase: "Phase 4", expected: "6 bullets" },
  { turn: 41, query: "Answer in Portuguese now (same content, 4 bullets).", phase: "Phase 4", expected: "4 bullets in Portuguese" },
  { turn: 42, query: "If OCR confidence is low, tell me one line about what looked unclear.", phase: "Phase 4", expected: "OCR feedback or not applicable" },
  { turn: 43, query: "Confirm active file (filename only).", phase: "Phase 4", expected: "filename" },
  { turn: 44, query: "Now ask me one question that would help you extract better quotes (max 1).", phase: "Phase 4", expected: "one question" },

  // Phase 5 — Whiteboard image OCR + PPTX (Turns 45–50)
  { turn: 45, query: "Switch to IMG_0330.jpeg. Extract main headings only.", phase: "Phase 5: Image OCR + PPTX", expected: "headings" },
  { turn: 46, query: "Turn that into a 2-level help menu (bullets).", phase: "Phase 5", expected: "nested bullets" },
  { turn: 47, query: "Under \"Features\", list all actions mentioned (bullets).", phase: "Phase 5", expected: "bullets" },
  { turn: 48, query: "Find the exact phrase that mentions embeddings (if present). If not found, say not found.", phase: "Phase 5", expected: "phrase or not found" },
  { turn: 49, query: "Switch to guarda bens self storage.pptx. Summarize in 5 bullets and list slide headings after.", phase: "Phase 5", expected: "5 bullets + headings" },
  { turn: 50, query: "If anything is truncated, continue without re-summarizing. Then confirm which file you used last.", phase: "Phase 5", expected: "continuation + filename" },

  // Extra: 10 "micro" queries (Turns 51–60)
  { turn: 51, query: "Stay on the PPTX. What slide mentions the main problem? (not found if none)", phase: "Phase 6: Edge Cases", expected: "slide or not found" },
  { turn: 52, query: "Switch to the mezanino PDF and give just 3 key numbers (bullets).", phase: "Phase 6", expected: "3 bullets" },
  { turn: 53, query: "Now give the same as a table.", phase: "Phase 6", expected: "table" },
  { turn: 54, query: "Quote one sentence from the mezanino PDF about payback (short).", phase: "Phase 6", expected: "quote" },
  { turn: 55, query: "Switch to the P&L workbook and list sheet names again.", phase: "Phase 6", expected: "sheet names" },
  { turn: 56, query: "Now: only PDFs. Summarize the Scrum chapter in 3 bullets.", phase: "Phase 6", expected: "3 bullets" },
  { turn: 57, query: "Now: only spreadsheets. Give Capex/NOI/ROC table again.", phase: "Phase 6", expected: "table" },
  { turn: 58, query: "What file are you using?", phase: "Phase 6", expected: "filename" },
  { turn: 59, query: "Continue.", phase: "Phase 6", expected: "continuation" },
  { turn: 60, query: "Stop asking questions, just answer.", phase: "Phase 6", expected: "acknowledgment" },
];

async function createConversation(): Promise<string> {
  const url = `${BASE_URL}/api/chat/conversations`;

  try {
    const response = await axios.post(url, {
      title: '60-Turn Test',
    }, {
      headers: AUTH_HEADER,
      timeout: 30000,
    });

    const conversationId = response.data?.id || response.data?.conversationId;
    if (!conversationId) {
      throw new Error('No conversation ID in response');
    }
    return conversationId;
  } catch (err: any) {
    console.error('Failed to create conversation:', err.message);
    throw err;
  }
}

async function sendMessage(query: string, conversationId: string): Promise<any> {
  const url = `${BASE_URL}/api/chat/conversations/${conversationId}/messages/stream`;

  const payload = {
    query,
    text: query,
    content: query,
  };

  try {
    const response = await axios.post(url, payload, {
      headers: AUTH_HEADER,
      responseType: 'text',
      timeout: 120000, // 2 minute timeout
    });

    // Parse SSE response
    const events = response.data.split('\n\n').filter((e: string) => e.trim());
    let answer = '';
    let sources: any[] = [];
    let trace: any = null;
    let error: string | null = null;

    for (const event of events) {
      const lines = event.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text' || data.type === 'chunk' || data.type === 'content') {
              answer += data.content || data.text || '';
            } else if (data.type === 'sources') {
              sources = data.sources || [];
            } else if (data.type === 'trace' || data.type === 'debug') {
              trace = data;
            } else if (data.type === 'intent') {
              // Capture intent info from intent event
              trace = trace || {};
              trace.intent = data.intent;
              trace.operator = data.operator;
              trace.confidence = data.confidence;
            } else if (data.type === 'error') {
              error = data.message || data.error || 'Unknown error';
            } else if (data.type === 'done' || data.type === 'end') {
              // Final event - use fullAnswer or formatted
              if (data.fullAnswer) answer = data.fullAnswer;
              else if (data.formatted) answer = data.formatted;
              else if (data.answer) answer = data.answer;
              if (data.sources) sources = data.sources;
              if (data.sourceButtons) sources = data.sourceButtons;
              // Extract trace info from done event
              trace = trace || {};
              trace.intent = trace.intent || data.intent;
              trace.operator = trace.operator || data.operator;
              trace.documentsUsed = data.documentsUsed;
              trace.sourceDocumentNames = data.sourceDocumentNames;
            }
          } catch (e) {
            // Not JSON, might be raw text
          }
        }
      }
    }

    return { answer, sources, trace, error, raw: response.data };
  } catch (err: any) {
    return {
      answer: '',
      sources: [],
      trace: null,
      error: err.message || 'Request failed',
      raw: err.response?.data
    };
  }
}

function evaluateTurn(turn: number, query: string, response: any): TurnResult {
  const errors: string[] = [];
  const answer = (response.answer || '').trim();
  const sources = response.sources || [];

  // Extract trace info
  const trace = response.trace || {};
  const intent = trace.intent || trace.intentFamily || '';
  const operator = trace.operator || '';
  const activeDoc = trace.activeDoc || trace.docId || (trace.sourceDocumentNames && trace.sourceDocumentNames[0]) || '';

  // Check 1: Text exists (allow short answers for acknowledgment queries)
  const isAcknowledgmentQuery = query.toLowerCase().includes('say "ok"') ||
                                query.toLowerCase().includes("say 'ok'") ||
                                query.toLowerCase().includes('say ok');
  const hasAnswer = answer.length > 10 || (isAcknowledgmentQuery && answer.toLowerCase().includes('ok'));
  if (!hasAnswer) {
    errors.push('EMPTY_ANSWER: Answer is blank or too short');
  }

  // Check 2: Sources exist but don't pollute answer
  const hasSources = sources.length > 0;
  const sourcesPollute = answer.includes('[Source') || answer.includes('Source:') ||
                         /\[\d+\]/.test(answer) || answer.includes('📄');
  if (sourcesPollute) {
    errors.push('SOURCES_POLLUTE: Sources appear in answer body');
  }

  // Check 3: "List" queries shouldn't route to file_actions
  if (query.toLowerCase().includes('list') &&
      !query.toLowerCase().includes('list my') &&
      !query.toLowerCase().includes('list files') &&
      intent === 'file_actions') {
    errors.push('MISROUTE_LIST: "List X" query routed to file_actions instead of documents');
  }

  // Check 4: Confirm queries should return filename
  if (query.toLowerCase().includes('confirm') &&
      query.toLowerCase().includes('file') &&
      !answer.toLowerCase().includes('.pdf') &&
      !answer.toLowerCase().includes('.xlsx') &&
      !answer.toLowerCase().includes('.pptx') &&
      !answer.toLowerCase().includes('.jpeg') &&
      !answer.toLowerCase().includes('.jpg')) {
    errors.push('CONFIRM_FAIL: File confirmation didn\'t return a filename');
  }

  // Check 5: Table requests should have table markdown
  if ((query.toLowerCase().includes('table') || query.toLowerCase().includes('tabela')) &&
      !answer.includes('|') &&
      !answer.toLowerCase().includes('not found') &&
      answer.length > 20) {
    errors.push('FORMAT_TABLE: Table requested but no markdown table in response');
  }

  // Check 6: JSON requests should have code block
  if (query.toLowerCase().includes('json') &&
      !answer.includes('```') &&
      !answer.includes('{') &&
      answer.length > 20) {
    errors.push('FORMAT_JSON: JSON requested but no code block/JSON in response');
  }

  // Check 7: Quote requests should have blockquote
  if (query.toLowerCase().includes('quote') &&
      !answer.includes('>') &&
      !answer.includes('"') &&
      !answer.toLowerCase().includes('not found') &&
      answer.length > 20) {
    errors.push('FORMAT_QUOTE: Quote requested but no blockquote in response');
  }

  // Determine status
  let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
  if (errors.length > 0) {
    if (errors.some(e => e.startsWith('EMPTY') || e.startsWith('MISROUTE'))) {
      status = 'FAIL';
    } else {
      status = 'WARN';
    }
  }

  // Error from API
  if (response.error) {
    errors.push(`API_ERROR: ${response.error}`);
    status = 'FAIL';
  }

  return {
    turn,
    query,
    status,
    answerPreview: answer.slice(0, 200) + (answer.length > 200 ? '...' : ''),
    hasAnswer,
    hasSources,
    sourceCount: sources.length,
    activeDoc,
    intent,
    operator,
    errors,
    trace: response.trace,
  };
}

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('60-TURN ONE-CONVERSATION TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`API URL: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}`);

  // Create conversation first
  try {
    CONVERSATION_ID = await createConversation();
    console.log(`✅ Created conversation: ${CONVERSATION_ID}`);
  } catch (err: any) {
    console.error(`❌ Failed to create conversation: ${err.message}`);
    return;
  }

  console.log('═══════════════════════════════════════════════════════════════\n');

  const results: TurnResult[] = [];
  let currentPhase = '';

  for (const { turn, query, phase, expected } of QUERIES) {
    // Print phase header
    if (phase !== currentPhase) {
      currentPhase = phase;
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`📌 ${phase}`);
      console.log(`${'─'.repeat(60)}`);
    }

    console.log(`\n[T${turn.toString().padStart(2, '0')}] ${query.slice(0, 70)}${query.length > 70 ? '...' : ''}`);

    const response = await sendMessage(query, CONVERSATION_ID);
    const result = evaluateTurn(turn, query, response);
    results.push(result);

    // Print result
    const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
    console.log(`     ${statusIcon} ${result.status} | Answer: ${result.hasAnswer ? 'YES' : 'NO'} | Sources: ${result.sourceCount}`);

    if (result.intent || result.operator) {
      console.log(`     → Intent: ${result.intent || 'unknown'} / Operator: ${result.operator || 'unknown'}`);
    }

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.log(`     ⚡ ${err}`);
      }
    }

    // Small preview
    if (result.answerPreview) {
      const preview = result.answerPreview.replace(/\n/g, ' ').slice(0, 100);
      console.log(`     📝 "${preview}${result.answerPreview.length > 100 ? '...' : ''}"`);
    }

    // Brief delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  // Final summary
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('FINAL SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');

  const pass = results.filter(r => r.status === 'PASS').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const fail = results.filter(r => r.status === 'FAIL').length;

  console.log(`\n📊 Results: ${pass} PASS | ${warn} WARN | ${fail} FAIL`);
  console.log(`   Pass rate: ${((pass / results.length) * 100).toFixed(1)}%`);
  console.log(`   Pass+Warn rate: ${(((pass + warn) / results.length) * 100).toFixed(1)}%`);

  // List failures
  if (fail > 0) {
    console.log('\n❌ FAILURES:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`   T${r.turn}: ${r.errors.join(', ')}`);
    }
  }

  // List warnings
  if (warn > 0) {
    console.log('\n⚠️ WARNINGS:');
    for (const r of results.filter(r => r.status === 'WARN')) {
      console.log(`   T${r.turn}: ${r.errors.join(', ')}`);
    }
  }

  // Save detailed results
  const outputPath = `/tmp/60_query_results_${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify({
    conversationId: CONVERSATION_ID,
    timestamp: new Date().toISOString(),
    summary: { pass, warn, fail, total: results.length },
    results
  }, null, 2));
  console.log(`\n📁 Detailed results saved to: ${outputPath}`);

  // Generate markdown report
  const reportPath = `/tmp/60_query_report_${Date.now()}.md`;
  let report = `# 60-Turn Conversation Test Report\n\n`;
  report += `**Conversation ID:** ${CONVERSATION_ID}\n`;
  report += `**Timestamp:** ${new Date().toISOString()}\n\n`;
  report += `## Summary\n\n`;
  report += `| Status | Count | Percentage |\n`;
  report += `|--------|-------|------------|\n`;
  report += `| PASS   | ${pass}    | ${((pass / results.length) * 100).toFixed(0)}%        |\n`;
  report += `| WARN   | ${warn}    | ${((warn / results.length) * 100).toFixed(0)}%        |\n`;
  report += `| FAIL   | ${fail}    | ${((fail / results.length) * 100).toFixed(0)}%        |\n\n`;

  report += `## Detailed Results\n\n`;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
    report += `### T${r.turn} ${icon}\n\n`;
    report += `**Query:** ${r.query}\n\n`;
    report += `**Status:** ${r.status}\n\n`;
    if (r.errors.length > 0) {
      report += `**Issues:** ${r.errors.join(', ')}\n\n`;
    }
    report += `**Answer Preview:** ${r.answerPreview || '(empty)'}\n\n`;
    report += `---\n\n`;
  }

  fs.writeFileSync(reportPath, report);
  console.log(`📄 Markdown report saved to: ${reportPath}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runTest().catch(console.error);
