import 'dotenv/config';
import axios from 'axios';

const API_BASE = 'http://localhost:5001';

const TEST_CASES = [
  // Phase 1: Discovery
  { id: 1, q: 'What folders do I have inside Koda test?' },
  { id: 2, q: 'Open the test 1 folder.' },
  { id: 3, q: 'Which files are inside this folder?' },
  { id: 4, q: 'Where is the file Rosewood Fund v3.xlsx located?' },
  { id: 5, q: 'Just open Rosewood Fund v3.xlsx.' },
  { id: 6, q: 'Go back to the Koda test folder.' },
  { id: 7, q: 'Open test 2.' },
  { id: 8, q: 'List all the documents in this folder.' },
  { id: 9, q: 'Where is Trabalho projeto.pdf stored?' },
  { id: 10, q: 'Show me OBA_marketing_servicos (1).pdf.' },
  // Phase 2: Understanding
  { id: 11, q: 'What is Trabalho projeto.pdf about?' },
  { id: 12, q: 'Does OBA_marketing_servicos (1).pdf talk about marketing?' },
  { id: 13, q: 'Summarize analise_mezanino_guarda_moveis.pdf in one sentence.' },
  { id: 14, q: 'What kind of plan is described in LMR Improvement Plan?' },
  { id: 15, q: 'Which file here looks more financial than descriptive?' },
  // Phase 3: Follow-ups
  { id: 16, q: 'Does it mention costs or investments?' },
  { id: 17, q: 'Which page talks about that?' },
  { id: 18, q: 'Open that section.' },
  { id: 19, q: 'Is this document more operational or strategic?' },
  { id: 20, q: 'Compare this file with Rosewood Fund v3.xlsx.' },
  // Phase 4: Cross-folder
  { id: 21, q: 'Go back to test 1.' },
  { id: 22, q: 'Which document talks about budgets?' },
  { id: 23, q: 'Compare Lone Mountain Ranch P&L 2024.xlsx and Lone Mountain Ranch P&L 2025 (Budget).xlsx.' },
  { id: 24, q: 'Which one looks like a projection and why?' },
  { id: 25, q: 'Open the older one.' },
  { id: 26, q: 'Where exactly is this file located in the folder structure?' },
  // Phase 5: Implicit
  { id: 27, q: 'Show me the spreadsheet again.' },
  { id: 28, q: 'Is that file bigger or smaller than the Rosewood one?' },
  { id: 29, q: 'Open the other one.' },
  { id: 30, q: 'Which folder contains more financial files overall?' },
  // Phase 6: Multi-intent
  { id: 31, q: 'Which document talks about financial performance, and what does it say?' },
  { id: 32, q: 'From all the folders, which file should I read to understand ranch operations?' },
  { id: 33, q: 'List the files related to planning, and open the most relevant.' },
  { id: 34, q: 'Compare the Rosewood Fund file with the Lone Mountain budget.' },
  // Phase 7: Test3
  { id: 35, q: 'Open test 3.' },
  { id: 36, q: 'What is Capitulo 8 (Framework Scrum).pdf about?' },
  { id: 37, q: 'Is this document theoretical or practical?' },
  { id: 38, q: 'Compare it with Anotacoes Aula 2 (1).pdf.' },
  { id: 39, q: 'Which one looks like class notes?' },
  { id: 40, q: 'Open the image file in this folder.' },
  { id: 41, q: 'What does the image represent?' },
  // Phase 8: Ambiguous
  { id: 42, q: 'Which of these files is more important?' },
  { id: 43, q: 'Does this look good or bad overall?' },
  { id: 44, q: 'What is the main takeaway here?' },
  { id: 45, q: 'Is this better than the other one?' },
  // Phase 9: Short
  { id: 46, q: 'Open it.' },
  { id: 47, q: 'Show that file again.' },
  { id: 48, q: 'Where was that stored?' },
  { id: 49, q: 'Just list the files.' },
  { id: 50, q: 'Only open the document.' },
  // Phase 10: Stress
  { id: 51, q: 'Open Rosewood.' },
  { id: 52, q: 'Who is it about?' },
  { id: 53, q: 'Now go back.' },
  { id: 54, q: 'Open the budget.' },
  { id: 55, q: 'Which year is this?' },
  { id: 56, q: 'Compare it with the other one.' },
  { id: 57, q: 'Open the older file.' },
  { id: 58, q: 'Where is it located?' },
  { id: 59, q: 'Show it.' },
  { id: 60, q: 'Close it and list files.' },
];

const FALLBACK_PATTERNS = [
  /i couldn't/i, /i can't/i, /i was unable/i, /unable to/i,
  /try rephrasing/i, /be more specific/i, /rephrase/i,
  /that information isn't available/i,
  /i don't have/i, /no information/i, /cannot help/i,
  /not supported/i, /generic error/i,
];

async function run() {
  const login = await axios.post(API_BASE + '/api/auth/login', { email: 'test@koda.com', password: 'test123' });
  const token = login.data.accessToken;
  const cid = 'validation-' + Date.now();

  console.log('| # | Intent | File Action | Button | Fallback | Pass/Fail | Notes |');
  console.log('|---|--------|-------------|--------|----------|-----------|-------|');

  let failures = 0;

  for (const tc of TEST_CASES) {
    const start = Date.now();
    const res = await axios.post(API_BASE + '/api/rag/query',
      { query: tc.q, conversationId: cid, language: 'en' },
      { headers: { Authorization: 'Bearer ' + token }, timeout: 60000 }
    );
    const elapsed = Date.now() - start;

    const answer = res.data.answer || '';
    const intent = res.data.intent || 'unknown';
    const hasButton = /\{\{DOC::|📁|file_action/.test(answer) || res.data.metadata?.fileAction;
    const hasFallback = FALLBACK_PATTERNS.some(p => p.test(answer));
    const isFileAction = ['file_actions', 'documents'].includes(intent) && hasButton;

    const pass = !hasFallback && answer.length > 10;
    if (!pass) failures++;

    const btn = hasButton ? '✅' : '—';
    const fb = hasFallback ? '❌ YES' : '✅ NO';
    const pf = pass ? '✅ PASS' : '❌ FAIL';
    const notes = hasFallback ? answer.substring(0, 40) : (elapsed > 5000 ? 'Slow: ' + elapsed + 'ms' : '');

    console.log(`| ${tc.id} | ${intent} | ${isFileAction ? 'YES' : '—'} | ${btn} | ${fb} | ${pf} | ${notes.substring(0,30)} |`);

    await new Promise(r => setTimeout(r, 300));
  }

  console.log('');
  if (failures === 0) {
    console.log('✅ PASS — Zero fallbacks. Production ready');
  } else {
    console.log('❌ FAIL — ' + failures + ' fallback(s) detected. Do not deploy');
  }
}

run().catch(e => console.error('Error:', e.message));
