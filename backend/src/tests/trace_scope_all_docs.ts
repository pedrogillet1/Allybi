/**
 * Trace scope detection for "summarize all documents"
 */

import { getScopeGate } from '../services/core/scopeGate.service';

const scopeGate = getScopeGate();

const testQueries = [
  'summarize all documents',
  'summarize the report',
  'all documents',
  'across all documents',
];

console.log('=== SCOPE PATTERN TEST FOR "ALL" ===\n');

for (const q of testQueries) {
  console.log(`Query: "${q}"`);
  // @ts-ignore
  const match = scopeGate['matchScopeFrames'](q, 'en');
  console.log(`  Match: ${JSON.stringify(match)}\n`);
}
