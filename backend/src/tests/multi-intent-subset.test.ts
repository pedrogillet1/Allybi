import axios from 'axios';

const API_BASE = 'http://localhost:5001';
const MULTI_INTENT_QUERIES = [
  "Find the file about taxes and summarize it",
  "Open the budget file and tell me the total",
  "List all P&L files and compare their totals",
  "Find which doc mentions investments and open it",
  "Show the improvement plan and highlight the timeline",
  "Search for revenue data and create a summary",
  "Open the newest file and tell me what it contains",
  "Find all financial documents and rank them by importance",
  "List folders then open the one with most files",
  "Compare the two ranch files and recommend which to use",
  "Find any mention of risk and explain the context",
  "Open the Rosewood file and extract the key metrics",
  "Search across all docs for the word budget",
  "List spreadsheets and show their sizes",
  "Find the most relevant doc for understanding cash flow and open it",
  "Compare all 3 Excel files on revenue",
  "Open the 2025 budget and extract all expense line items",
  "Find documents with numbers over $1 million",
  "List all files then filter to just PDFs",
  "Open the oldest file and summarize its purpose",
];

async function runTest() {
  console.log('='.repeat(80));
  console.log('MULTI-INTENT SUBSET TEST (20 queries)');
  console.log('='.repeat(80));

  // Login
  const login = await axios.post(API_BASE + '/api/auth/login', {
    email: 'test@koda.com',
    password: 'test123'
  });
  const token = login.data.accessToken;

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < MULTI_INTENT_QUERIES.length; i++) {
    const query = MULTI_INTENT_QUERIES[i];
    try {
      const res = await axios.post(
        API_BASE + '/api/rag/query',
        { query, conversationId: 'test-multi-' + Date.now(), language: 'en' },
        { headers: { Authorization: 'Bearer ' + token }, timeout: 120000 }
      );

      const answer = res.data.answer || '';

      // Check for duplicate DOC markers
      const docMarkers = answer.match(/\{\{DOC::[^}]+\}\}/g) || [];
      const docIds = docMarkers.map((m: string) => {
        const match = m.match(/\{\{DOC::([a-f0-9-]+)::/i);
        return match ? match[1] : null;
      }).filter(Boolean);
      const uniqueIds = new Set(docIds);
      const hasDuplicateMarkers = docIds.length !== uniqueIds.size;

      // Check for repeated sentences
      const sentences = answer.split(/[.!?]+/).map((s: string) => s.trim().toLowerCase()).filter((s: string) => s.length > 20);
      const seenSentences = new Set<string>();
      let hasRepeatedSentence = false;
      for (const s of sentences) {
        if (seenSentences.has(s)) {
          hasRepeatedSentence = true;
          break;
        }
        seenSentences.add(s);
      }

      const issues: string[] = [];
      if (hasDuplicateMarkers) issues.push('DUPLICATE_MARKERS');
      if (hasRepeatedSentence) issues.push('REPEATED_SENTENCE');

      if (issues.length === 0) {
        passed++;
        console.log('✅ Q' + (i+1) + ': "' + query.substring(0, 40) + '..."');
      } else {
        failed++;
        console.log('❌ Q' + (i+1) + ': "' + query.substring(0, 40) + '..." → ' + issues.join(', '));
        failures.push('Q' + (i+1) + ': ' + issues.join(', '));
      }
    } catch (e: any) {
      failed++;
      console.log('❌ Q' + (i+1) + ': "' + query.substring(0, 40) + '..." → ERROR: ' + e.message);
      failures.push('Q' + (i+1) + ': ERROR');
    }
  }

  console.log('='.repeat(80));
  console.log('RESULT: ' + passed + '/' + MULTI_INTENT_QUERIES.length + ' PASSED (' + Math.round(passed/MULTI_INTENT_QUERIES.length*100) + '%)');
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log('  - ' + f));
  }
  console.log('='.repeat(80));
}

runTest().catch(console.error);
