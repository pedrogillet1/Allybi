import 'dotenv/config';
import axios from 'axios';

const API_BASE = 'http://localhost:5001';

// Test the specific fixes
const TEST_CASES = [
  // Fix 1: File search prefix "the file" removal
  { id: 1, q: 'Where is the file Rosewood Fund v3.xlsx located?', expect: 'shows file location, not "the file rosewood..."' },

  // Fix 2: Folder listing
  { id: 2, q: 'What folders do I have inside Koda test?', expect: 'lists folder names, not document count' },

  // Fix 3: Compare query not split into multi-intent
  { id: 3, q: 'Compare Lone Mountain Ranch P&L 2024.xlsx and Lone Mountain Ranch P&L 2025 (Budget).xlsx.', expect: 'comparison response, not Koda Help' },

  // Basic file action still works
  { id: 4, q: 'Open Rosewood Fund v3.xlsx', expect: 'opens file with button' },
];

async function runQuickValidation() {
  const login = await axios.post(API_BASE + '/api/auth/login', { email: 'test@koda.com', password: 'test123' });
  const token = login.data.accessToken;
  const cid = 'quick-' + Date.now();

  console.log('QUICK FIX VALIDATION\n');

  for (const tc of TEST_CASES) {
    console.log(`--- Q${tc.id}: "${tc.q}" ---`);
    console.log(`Expected: ${tc.expect}`);

    const res = await axios.post(API_BASE + '/api/rag/query',
      { query: tc.q, conversationId: cid, language: 'en' },
      { headers: { Authorization: 'Bearer ' + token }, timeout: 30000 }
    );

    const answer = res.data.answer || '';
    const intent = res.data.intent || 'unknown';
    const hasButton = /\{\{DOC::|📁/.test(answer);
    const isHelp = /Koda Help|I can help you with/.test(answer);
    const isDocCount = /You have \d+ documents?\./.test(answer);

    console.log(`Intent: ${intent} | Button: ${hasButton ? 'YES' : 'NO'} | Help: ${isHelp ? 'YES' : 'NO'}`);
    console.log(`Answer preview: ${answer.substring(0, 100)}...`);

    // Simple pass/fail based on anti-patterns
    let pass = true;
    if (tc.id === 1 && answer.includes('the file rosewood')) pass = false;
    if (tc.id === 2 && isDocCount) pass = false;
    if (tc.id === 3 && isHelp) pass = false;
    if (tc.id === 4 && !hasButton) pass = false;

    console.log(`Result: ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

    await new Promise(r => setTimeout(r, 300));
  }
}

runQuickValidation().catch(e => console.error('Error:', e.message));
