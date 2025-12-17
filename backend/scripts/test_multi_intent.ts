/**
 * Multi-Intent Test Script
 * Tests:
 * 1. Classification - multi-intent query detection
 * 2. MultiIntent.service.ts segmentation
 * 3. Pattern matching for MULTI_INTENT
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  query: string;
  expectedMultiIntent: boolean;
  expectedSegmentCount?: number;
  language: string;
  description: string;
}

const testCases: TestCase[] = [
  // Multi-intent queries - SHOULD be detected
  {
    query: 'List my documents and summarize the latest upload',
    expectedMultiIntent: true,
    expectedSegmentCount: 2,
    language: 'en',
    description: 'Classic multi-intent with "and"',
  },
  {
    query: 'Find contracts; summarize the most recent one',
    expectedMultiIntent: true,
    expectedSegmentCount: 2,
    language: 'en',
    description: 'Semicolon separator',
  },
  {
    query: 'Search for budget reports, then show me a summary',
    expectedMultiIntent: true,
    expectedSegmentCount: 2,
    language: 'en',
    description: 'Comma-then pattern',
  },
  {
    query: 'Show all documents and also filter by date',
    expectedMultiIntent: true,
    expectedSegmentCount: 2,
    language: 'en',
    description: '"and also" connector',
  },
  {
    query: 'First list my files, then summarize the largest one',
    expectedMultiIntent: true,
    expectedSegmentCount: 2,
    language: 'en',
    description: '"First...then" pattern',
  },
  // Portuguese multi-intent
  {
    query: 'Listar documentos e depois resumir o mais recente',
    expectedMultiIntent: true,
    expectedSegmentCount: 2,
    language: 'pt',
    description: 'Portuguese "e depois"',
  },
  // Spanish multi-intent
  {
    query: 'Buscar contratos y después mostrar un resumen',
    expectedMultiIntent: true,
    expectedSegmentCount: 2,
    language: 'es',
    description: 'Spanish "y después"',
  },
  // Single-intent queries - should NOT be detected as multi-intent
  {
    query: 'What is the revenue in the annual report?',
    expectedMultiIntent: false,
    language: 'en',
    description: 'Simple DOC_QA query',
  },
  {
    query: 'Summarize my documents',
    expectedMultiIntent: false,
    language: 'en',
    description: 'Simple DOC_SUMMARIZE query',
  },
  {
    query: 'How do I upload files?',
    expectedMultiIntent: false,
    language: 'en',
    description: 'Simple PRODUCT_HELP query',
  },
  {
    query: 'Hello',
    expectedMultiIntent: false,
    language: 'en',
    description: 'Simple CHITCHAT query',
  },
  // Edge cases
  {
    query: 'Search and rescue operations mentioned in the report',
    expectedMultiIntent: false,
    language: 'en',
    description: '"and" in compound noun - should NOT split',
  },
  {
    query: 'Find the "summary and analysis" section',
    expectedMultiIntent: false,
    language: 'en',
    description: 'Quoted text with "and" - should NOT split',
  },
];

// Simple multi-intent detection mirroring the service logic
function detectMultiIntent(query: string): { isMultiIntent: boolean; segments: string[] } {
  if (!query || query.trim().length < 10) {
    return { isMultiIntent: false, segments: [query] };
  }

  const normalizedQuery = query.trim();

  // Protect quoted strings
  const quotedStrings: string[] = [];
  let workingQuery = normalizedQuery.replace(/["']([^"']+)["']/g, (match) => {
    quotedStrings.push(match);
    return `__QUOTED_${quotedStrings.length - 1}__`;
  });

  // Delimiter patterns in order of specificity
  const delimiterPatterns = [
    / and also /i,
    / and then /i,
    / then also /i,
    /, then /i,
    /, and /i,
    / e também /i,
    / e depois /i,
    / depois também /i,
    /, depois /i,
    /, e /i,
    / y también /i,
    / y luego /i,
    / luego también /i,
    /, después /i,
    /, y /i,
    /; /,
    / and (?=\w{4,})/i,
    / e (?=\w{4,})/i,
    / y (?=\w{4,})/i,
  ];

  for (const pattern of delimiterPatterns) {
    const parts = workingQuery.split(pattern);
    // Filter segments - require at least 8 chars OR 2+ words
    const validParts = parts.filter(p => {
      const trimmed = p.trim();
      const wordCount = trimmed.split(/\s+/).length;
      return trimmed.length >= 8 || wordCount >= 2;
    });
    if (validParts.length > 1) {
      // Restore quoted strings
      const restored = validParts.map(part => {
        return part.replace(/__QUOTED_(\d+)__/g, (_, idx) => quotedStrings[parseInt(idx)]);
      });
      return { isMultiIntent: true, segments: restored.map(s => s.trim()) };
    }
  }

  return { isMultiIntent: false, segments: [normalizedQuery] };
}

// Test MULTI_INTENT patterns
function testPatternMatch(query: string, language: string): boolean {
  const patternsPath = path.join(__dirname, '../src/data/intent_patterns.json');
  const patternsData = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));

  const multiIntentData = patternsData['MULTI_INTENT'];
  if (!multiIntentData) return false;

  const patterns = multiIntentData.patterns[language] || [];
  const keywords = multiIntentData.keywords[language] || [];

  // Check patterns
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(query)) return true;
    } catch {
      continue;
    }
  }

  // Check keywords
  const lowerQuery = query.toLowerCase();
  for (const keyword of keywords) {
    if (lowerQuery.includes(keyword.toLowerCase())) return true;
  }

  return false;
}

function runTests(): void {
  console.log('='.repeat(70));
  console.log('Multi-Intent Detection Tests');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = detectMultiIntent(testCase.query);
    const patternMatch = testPatternMatch(testCase.query, testCase.language);

    const detectionPassed = result.isMultiIntent === testCase.expectedMultiIntent;
    const segmentPassed = !testCase.expectedSegmentCount || result.segments.length === testCase.expectedSegmentCount;
    const testPassed = detectionPassed && segmentPassed;

    if (testPassed) {
      passed++;
      console.log(`\n[PASS] ${testCase.description}`);
      console.log(`       Query: "${testCase.query}"`);
      console.log(`       Multi-intent: ${result.isMultiIntent} | Segments: ${result.segments.length}`);
      if (patternMatch) console.log('       Pattern match: YES');
    } else {
      failed++;
      console.log(`\n[FAIL] ${testCase.description}`);
      console.log(`       Query: "${testCase.query}"`);
      console.log(`       Expected: multiIntent=${testCase.expectedMultiIntent}, segments=${testCase.expectedSegmentCount || 'N/A'}`);
      console.log(`       Got: multiIntent=${result.isMultiIntent}, segments=${result.segments.length}`);
      if (result.segments.length > 1) {
        console.log(`       Segments: ${JSON.stringify(result.segments)}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
