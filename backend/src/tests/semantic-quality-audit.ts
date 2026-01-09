import 'dotenv/config';
import axios from 'axios';

const API_BASE = 'http://localhost:5001';

/**
 * SEMANTIC QUALITY AUDIT
 *
 * Purpose: Verify answer QUALITY, not system correctness
 * - Is the answer factually grounded in the document?
 * - Did it select the right document?
 * - Is the answer useful and coherent?
 * - Is formatting appropriate?
 *
 * This is NOT a pass/fail test - it's for human review
 */

const AUDIT_QUESTIONS = [
  // DISCOVERY - Does it find the right files?
  { id: 1, q: 'What folders do I have inside Koda test?', verify: 'Lists actual folders: test 1, test 2, test 3' },
  { id: 2, q: 'Where is the file Rosewood Fund v3.xlsx located?', verify: 'Shows correct folder path' },

  // UNDERSTANDING - Are summaries accurate?
  { id: 3, q: 'What is Trabalho projeto.pdf about?', verify: 'Summary matches actual document content' },
  { id: 4, q: 'What kind of plan is described in LMR Improvement Plan?', verify: 'Correctly identifies plan type from document' },

  // ANALYSIS - Are comparisons valid?
  { id: 5, q: 'Compare Lone Mountain Ranch P&L 2024.xlsx and Lone Mountain Ranch P&L 2025 (Budget).xlsx.', verify: 'Mentions actual differences found in files' },
  { id: 6, q: 'Which one looks like a projection and why?', verify: 'Reasoning based on document evidence' },

  // SUBJECTIVE - Are assessments reasonable?
  { id: 7, q: 'Which file here looks more financial than descriptive?', verify: 'Reasonable selection with justification' },
  { id: 8, q: 'Is Capitulo 8 (Framework Scrum).pdf theoretical or practical?', verify: 'Assessment grounded in document content' },

  // FOLLOW-UP - Does context carry forward?
  { id: 9, q: 'Does it mention costs or investments?', verify: 'References correct document from context' },
  { id: 10, q: 'Which document talks about budgets?', verify: 'Finds budget-related files correctly' },

  // CROSS-FOLDER - Does it search broadly?
  { id: 11, q: 'From all the folders, which file should I read to understand ranch operations?', verify: 'Searches across folders, recommends relevant file' },

  // MULTI-INTENT - Handles compound queries?
  { id: 12, q: 'Which document talks about financial performance, and what does it say?', verify: 'Finds file AND provides content summary' },
  { id: 13, q: 'List the files related to planning, and open the most relevant.', verify: 'Lists files AND opens one' },

  // IMPLICIT - Resolves references?
  { id: 14, q: 'Show me the spreadsheet again.', verify: 'Shows correct previously-referenced file' },

  // AMBIGUOUS - Handles gracefully?
  { id: 15, q: 'What is the main takeaway here?', verify: 'Provides reasonable takeaway from context' },
];

async function runAudit() {
  const login = await axios.post(API_BASE + '/api/auth/login', { email: 'test@koda.com', password: 'test123' });
  const token = login.data.accessToken;
  const cid = 'audit-' + Date.now();

  console.log('='.repeat(80));
  console.log('SEMANTIC QUALITY AUDIT');
  console.log('Purpose: Human review of answer quality, factual grounding, usefulness');
  console.log('='.repeat(80));
  console.log('');

  for (const q of AUDIT_QUESTIONS) {
    console.log('-'.repeat(80));
    console.log(`Q${q.id}: "${q.q}"`);
    console.log(`VERIFY: ${q.verify}`);
    console.log('-'.repeat(80));

    try {
      const start = Date.now();
      const res = await axios.post(API_BASE + '/api/rag/query',
        { query: q.q, conversationId: cid, language: 'en' },
        { headers: { Authorization: 'Bearer ' + token }, timeout: 60000 }
      );
      const elapsed = Date.now() - start;

      const answer = res.data.answer || '';
      const intent = res.data.intent || 'unknown';
      const sources = res.data.sources || [];

      console.log(`Intent: ${intent} | Time: ${elapsed}ms | Sources: ${sources.length}`);
      console.log('');
      console.log('ANSWER:');
      console.log(answer);
      console.log('');

      if (sources.length > 0) {
        console.log('SOURCES USED:');
        sources.slice(0, 3).forEach((s: any, i: number) => {
          console.log(`  ${i + 1}. ${s.filename || s.title || 'Unknown'} (score: ${s.score?.toFixed(2) || 'N/A'})`);
        });
        console.log('');
      }

      // Quality indicators (for human review)
      const indicators = [];
      if (answer.length < 50) indicators.push('SHORT');
      if (answer.length > 500) indicators.push('DETAILED');
      if (/\{\{DOC::|📁/.test(answer)) indicators.push('HAS_BUTTON');
      if (sources.length === 0) indicators.push('NO_SOURCES');
      if (elapsed > 5000) indicators.push('SLOW');

      if (indicators.length > 0) {
        console.log(`FLAGS: ${indicators.join(', ')}`);
      }

      console.log('');
      console.log('QUALITY CHECK:');
      console.log('  [ ] Factually grounded in document?');
      console.log('  [ ] Correct document selected?');
      console.log('  [ ] Answer is useful/coherent?');
      console.log('  [ ] Formatting appropriate?');
      console.log('');

    } catch (e: any) {
      console.log(`ERROR: ${e.message}`);
      console.log('');
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('='.repeat(80));
  console.log('AUDIT COMPLETE');
  console.log('');
  console.log('Review each answer above and check:');
  console.log('1. Is the information from the actual document?');
  console.log('2. Did it pick the right document for the question?');
  console.log('3. Is the answer helpful to a real user?');
  console.log('4. Is the formatting clean and readable?');
  console.log('='.repeat(80));
}

runAudit().catch(e => console.error('Audit failed:', e.message));
