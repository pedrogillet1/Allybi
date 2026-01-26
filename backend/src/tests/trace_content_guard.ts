/**
 * Trace ContentGuard classification for problematic queries
 */

import { classifyQuery } from '../services/core/contentGuard.service';

const testQueries = [
  'show me EBITDA',
  'show me budget allocation',
  'what is the EBITDA',
  'search for Q4 projections in documents',
  'find revenue in the report',
  'display pdf',
  'show me the files',
];

console.log('=== CONTENT GUARD CLASSIFICATION ===\n');

for (const q of testQueries) {
  const result = classifyQuery(q, 'en');
  console.log(`"${q}"`);
  console.log(`  isContentQuestion: ${result.isContentQuestion}`);
  console.log(`  isFileAction: ${result.isFileAction}`);
  console.log(`  matchedPattern: ${result.matchedPattern || 'none'}`);
  console.log(`  confidence: ${result.confidence}`);
  console.log('');
}
