/**
 * Trace scope pattern matching
 */

import { getScopeGate } from '../services/core/scopeGate.service';

// Force reload patterns by accessing the service
const testQueries = [
  'summarize the report',
  'about this document',
  'in the report',
];

console.log('=== SCOPE PATTERN TEST ===\n');

const scopeGate = getScopeGate();

for (const q of testQueries) {
  console.log(`Query: "${q}"`);
  // @ts-ignore - accessing private method for debugging
  const match = scopeGate['matchScopeFrames'](q, 'en');
  console.log(`  Match: ${JSON.stringify(match)}\n`);
}
