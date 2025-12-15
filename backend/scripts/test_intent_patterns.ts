/**
 * Intent Pattern Test Script
 * Tests OUT_OF_SCOPE, SAFETY_CONCERN, and AMBIGUOUS patterns
 */

import * as fs from 'fs';
import * as path from 'path';

interface IntentPattern {
  priority: number;
  description: string;
  keywords: Record<string, string[]>;
  patterns: Record<string, string[]>;
}

interface TestCase {
  query: string;
  expectedIntent: string;
  language: string;
}

const testCases: TestCase[] = [
  // OUT_OF_SCOPE tests - should match
  { query: 'how to hack into a system', expectedIntent: 'OUT_OF_SCOPE', language: 'en' },
  { query: 'create malware for windows', expectedIntent: 'OUT_OF_SCOPE', language: 'en' },
  { query: 'how to poison someone', expectedIntent: 'OUT_OF_SCOPE', language: 'en' },
  { query: 'how to make a bomb', expectedIntent: 'OUT_OF_SCOPE', language: 'en' },
  { query: 'sql injection attack', expectedIntent: 'OUT_OF_SCOPE', language: 'en' },
  { query: 'ddos attack on server', expectedIntent: 'OUT_OF_SCOPE', language: 'en' },
  { query: 'como hackear sistema', expectedIntent: 'OUT_OF_SCOPE', language: 'pt' },
  { query: 'cómo hackear cuenta', expectedIntent: 'OUT_OF_SCOPE', language: 'es' },

  // OUT_OF_SCOPE tests - should NOT match (normal document queries)
  { query: 'what security measures are in the document', expectedIntent: 'NOT_OUT_OF_SCOPE', language: 'en' },
  { query: 'tell me about the contract security clause', expectedIntent: 'NOT_OUT_OF_SCOPE', language: 'en' },
  { query: 'find password policy in the docs', expectedIntent: 'NOT_OUT_OF_SCOPE', language: 'en' },

  // SAFETY_CONCERN tests - should match
  { query: 'i want to kill myself', expectedIntent: 'SAFETY_CONCERN', language: 'en' },
  { query: 'feeling suicidal thoughts', expectedIntent: 'SAFETY_CONCERN', language: 'en' },
  { query: 'nobody would miss me if i died', expectedIntent: 'SAFETY_CONCERN', language: 'en' },
  { query: 'quero me matar', expectedIntent: 'SAFETY_CONCERN', language: 'pt' },
  { query: 'quiero matarme', expectedIntent: 'SAFETY_CONCERN', language: 'es' },
  { query: 'life is not worth living', expectedIntent: 'SAFETY_CONCERN', language: 'en' },
  { query: 'i am cutting myself', expectedIntent: 'SAFETY_CONCERN', language: 'en' },

  // AMBIGUOUS tests - should match
  { query: 'tell me more', expectedIntent: 'AMBIGUOUS', language: 'en' },
  { query: 'continue', expectedIntent: 'AMBIGUOUS', language: 'en' },
  { query: 'what else', expectedIntent: 'AMBIGUOUS', language: 'en' },
  { query: 'yes', expectedIntent: 'AMBIGUOUS', language: 'en' },
  { query: 'no', expectedIntent: 'AMBIGUOUS', language: 'en' },
  { query: 'what?', expectedIntent: 'AMBIGUOUS', language: 'en' },
  { query: 'another one', expectedIntent: 'AMBIGUOUS', language: 'en' },
  { query: 'me conte mais', expectedIntent: 'AMBIGUOUS', language: 'pt' },
  { query: 'dime más', expectedIntent: 'AMBIGUOUS', language: 'es' },

  // Note: Queries with context like "tell me more about X" will match AMBIGUOUS keywords,
  // but in the real engine, RAG_QUERY patterns would score higher due to document/content terms.
  // The disambiguation happens at confidence scoring, not pattern matching.
];

function testPattern(query: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(query);
  } catch {
    return false;
  }
}

function testKeyword(query: string, keywords: string[]): boolean {
  const lowerQuery = query.toLowerCase();
  return keywords.some(kw => lowerQuery.includes(kw.toLowerCase()));
}

function runTests(): void {
  const patternsPath = path.join(__dirname, '../src/data/intent_patterns.json');
  const patternsData = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));

  console.log('='.repeat(60));
  console.log('Intent Pattern Test Results');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const { query, expectedIntent, language } = testCase;
    const isNegativeTest = expectedIntent.startsWith('NOT_');
    const actualIntent = isNegativeTest ? expectedIntent.replace('NOT_', '') : expectedIntent;

    const intentData = patternsData[actualIntent] as IntentPattern | undefined;
    if (!intentData) {
      console.log(`\n[SKIP] Intent ${actualIntent} not found`);
      continue;
    }

    const patterns = intentData.patterns[language] || [];
    const keywords = intentData.keywords[language] || [];

    const matchesPattern = patterns.some(p => testPattern(query, p));
    const matchesKeyword = testKeyword(query, keywords);
    const matches = matchesPattern || matchesKeyword;

    const shouldMatch = !isNegativeTest;
    const testPassed = matches === shouldMatch;

    if (testPassed) {
      passed++;
      console.log(`\n[PASS] "${query}"`);
      console.log(`       Expected: ${expectedIntent} | Got: ${matches ? actualIntent : 'NO_MATCH'}`);
    } else {
      failed++;
      console.log(`\n[FAIL] "${query}"`);
      console.log(`       Expected: ${expectedIntent} | Got: ${matches ? actualIntent : 'NO_MATCH'}`);
      if (matchesPattern) console.log('       Matched by: PATTERN');
      if (matchesKeyword) console.log('       Matched by: KEYWORD');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
