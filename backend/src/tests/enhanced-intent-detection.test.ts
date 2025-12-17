/**
 * Enhanced Intent Detection Tests
 * Tests for the new simpleIntentDetection.service.ts with RAG modes
 *
 * Run: npx ts-node --transpile-only src/tests/enhanced-intent-detection.test.ts
 */

import {
  classifyQuestion,
  detectTemporalExpression,
  detectIntent,
  getChunkCountForRagMode,
  shouldSkipRag,
  needsFullContext,
  type ClassifiedQuestion,
  type QuestionType,
  type RagMode,
} from '../services/simpleIntentDetection.service';

interface TestCase {
  query: string;
  expectedType: QuestionType;
  expectedRagMode: RagMode;
  expectedTemporal?: boolean;
  description: string;
}

// ============================================================================
// TEST CASES
// ============================================================================

const GREETING_TESTS: TestCase[] = [
  { query: 'oi', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'Portuguese greeting' },
  { query: 'olá', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'Portuguese greeting with accent' },
  { query: 'hello', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'English greeting' },
  { query: 'hi', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'Short English greeting' },
  { query: 'bom dia', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'Portuguese good morning' },
  { query: 'boa tarde', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'Portuguese good afternoon' },
  { query: 'thanks', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'Thanks' },
  { query: 'obrigado', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'Portuguese thanks' },
  { query: 'tchau', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'Portuguese goodbye' },
  { query: 'bye', expectedType: 'greeting', expectedRagMode: 'no_rag', description: 'English goodbye' },
];

const META_TESTS: TestCase[] = [
  { query: 'quem é você?', expectedType: 'meta', expectedRagMode: 'no_rag', description: 'Who are you (PT)' },
  { query: 'who are you', expectedType: 'meta', expectedRagMode: 'no_rag', description: 'Who are you (EN)' },
  { query: 'o que você faz?', expectedType: 'meta', expectedRagMode: 'no_rag', description: 'What do you do (PT)' },
  { query: 'what can you do', expectedType: 'meta', expectedRagMode: 'no_rag', description: 'What can you do (EN)' },
  { query: 'o que é koda', expectedType: 'meta', expectedRagMode: 'no_rag', description: 'What is Koda (PT)' },
  { query: 'what is koda', expectedType: 'meta', expectedRagMode: 'no_rag', description: 'What is Koda (EN)' },
  { query: 'como você funciona', expectedType: 'meta', expectedRagMode: 'no_rag', description: 'How do you work (PT)' },
  { query: 'what documents do you have', expectedType: 'meta', expectedRagMode: 'no_rag', description: 'System docs query' },
];

const COMPARISON_TESTS: TestCase[] = [
  { query: 'compare o contrato A com o B', expectedType: 'comparison', expectedRagMode: 'light_rag', description: 'Compare contracts (PT)' },
  { query: 'qual a diferença entre os dois documentos', expectedType: 'comparison', expectedRagMode: 'light_rag', description: 'Difference between docs (PT)' },
  { query: 'compare X and Y', expectedType: 'comparison', expectedRagMode: 'light_rag', description: 'Compare X and Y (EN)' },
  { query: 'difference between document A and B', expectedType: 'comparison', expectedRagMode: 'light_rag', description: 'Difference (EN)' },
  { query: 'comparar todos os documentos', expectedType: 'comparison', expectedRagMode: 'full_rag', description: 'Compare all docs - full rag' },
];

const LIST_TESTS: TestCase[] = [
  { query: 'lista os principais pontos', expectedType: 'list', expectedRagMode: 'light_rag', description: 'List main points (PT)' },
  { query: 'enumere os benefícios', expectedType: 'list', expectedRagMode: 'light_rag', description: 'Enumerate benefits (PT)' },
  { query: 'list the key findings', expectedType: 'list', expectedRagMode: 'light_rag', description: 'List findings (EN)' },
  { query: 'give me a list of items', expectedType: 'list', expectedRagMode: 'light_rag', description: 'Give me list (EN)' },
  { query: 'top 10 recommendations', expectedType: 'list', expectedRagMode: 'light_rag', description: 'Top 10 (EN)' },
  { query: 'liste em todos os documentos', expectedType: 'list', expectedRagMode: 'full_rag', description: 'List in all docs - full rag' },
];

const COMPLEX_ANALYSIS_TESTS: TestCase[] = [
  { query: 'analise detalhada do contrato', expectedType: 'complex_analysis', expectedRagMode: 'full_rag', description: 'Detailed analysis (PT)' },
  { query: 'analyze the document in depth', expectedType: 'complex_analysis', expectedRagMode: 'full_rag', description: 'Deep analysis (EN)' },
  { query: 'explique detalhadamente o documento', expectedType: 'complex_analysis', expectedRagMode: 'full_rag', description: 'Explain in detail (PT)' },
  { query: 'resumo do arquivo', expectedType: 'complex_analysis', expectedRagMode: 'full_rag', description: 'Summary of file (PT)' },
  { query: 'summarize the pdf', expectedType: 'complex_analysis', expectedRagMode: 'full_rag', description: 'Summarize (EN)' },
];

const COMPLEX_MULTIDOC_TESTS: TestCase[] = [
  { query: 'analise todos os documentos e compare', expectedType: 'complex_multidoc', expectedRagMode: 'full_rag', description: 'Analyze all docs (PT)' },
  { query: 'explique os vários documentos', expectedType: 'complex_multidoc', expectedRagMode: 'full_rag', description: 'Explain multiple docs (PT)' },
  { query: 'summarize all documents', expectedType: 'complex_multidoc', expectedRagMode: 'full_rag', description: 'Summarize all (EN)' },
];

const FOLLOWUP_TESTS: TestCase[] = [
  { query: 'e quanto ao segundo ponto?', expectedType: 'followup', expectedRagMode: 'light_rag', description: 'And about second point (PT)' },
  { query: 'pode detalhar mais?', expectedType: 'followup', expectedRagMode: 'light_rag', description: 'Can you detail more (PT)' },
  { query: 'and what about this?', expectedType: 'followup', expectedRagMode: 'light_rag', description: 'And what about (EN)' },
  { query: 'can you elaborate?', expectedType: 'followup', expectedRagMode: 'light_rag', description: 'Can you elaborate (EN)' },
];

const MEDIUM_SPECIFIC_TESTS: TestCase[] = [
  { query: 'qual o valor no contrato.pdf?', expectedType: 'medium_specific', expectedRagMode: 'light_rag', description: 'Value in specific file (PT)' },
  { query: 'nesse documento, qual a data?', expectedType: 'medium_specific', expectedRagMode: 'light_rag', description: 'Date in this doc (PT)' },
  { query: 'in this document, what is the price?', expectedType: 'medium_specific', expectedRagMode: 'light_rag', description: 'Price in this doc (EN)' },
];

const SIMPLE_FACTUAL_TESTS: TestCase[] = [
  { query: 'que dia é hoje?', expectedType: 'simple_factual', expectedRagMode: 'no_rag', expectedTemporal: true, description: 'What day is today (PT)' },
  { query: 'what day is it?', expectedType: 'simple_factual', expectedRagMode: 'no_rag', expectedTemporal: true, description: 'What day (EN)' },
  { query: 'what is entropy?', expectedType: 'simple_factual', expectedRagMode: 'no_rag', description: 'Simple factual (EN)' },
];

const MEDIUM_TESTS: TestCase[] = [
  { query: 'qual o valor do contrato?', expectedType: 'medium', expectedRagMode: 'light_rag', description: 'Contract value (PT)' },
  { query: 'quais são os termos?', expectedType: 'medium', expectedRagMode: 'light_rag', description: 'What are terms (PT)' },
  { query: 'when does the contract expire?', expectedType: 'medium', expectedRagMode: 'light_rag', description: 'Contract expiry (EN)' },
];

const TEMPORAL_TESTS: { query: string; expected: boolean; description: string }[] = [
  { query: 'hoje', expected: true, description: 'Today (PT)' },
  { query: 'yesterday', expected: true, description: 'Yesterday (EN)' },
  { query: 'tomorrow', expected: true, description: 'Tomorrow (EN)' },
  { query: '10/12/2024', expected: true, description: 'Date format dd/mm/yyyy' },
  { query: '2024-12-10', expected: true, description: 'Date format yyyy-mm-dd' },
  { query: '15:30', expected: true, description: 'Time format HH:mm' },
  { query: 'em 3 dias', expected: true, description: 'In 3 days (PT)' },
  { query: 'há 2 semanas', expected: true, description: '2 weeks ago (PT)' },
  { query: 'last week', expected: true, description: 'Last week (EN)' },
  { query: 'next month', expected: true, description: 'Next month (EN)' },
  { query: 'hello world', expected: false, description: 'No temporal' },
  { query: 'what is the price?', expected: false, description: 'No temporal - price question' },
];

// ============================================================================
// TEST RUNNER
// ============================================================================

interface TestResult {
  category: string;
  passed: number;
  failed: number;
  details: { query: string; description: string; expected: any; actual: any; passed: boolean }[];
}

function runClassificationTests(category: string, tests: TestCase[]): TestResult {
  const result: TestResult = {
    category,
    passed: 0,
    failed: 0,
    details: [],
  };

  for (const test of tests) {
    const classification = classifyQuestion(test.query);
    const typeMatch = classification.type === test.expectedType;
    const ragMatch = classification.ragMode === test.expectedRagMode;
    const temporalMatch = test.expectedTemporal === undefined || classification.hasTemporalExpression === test.expectedTemporal;

    const passed = typeMatch && ragMatch && temporalMatch;

    if (passed) {
      result.passed++;
    } else {
      result.failed++;
    }

    result.details.push({
      query: test.query,
      description: test.description,
      expected: { type: test.expectedType, ragMode: test.expectedRagMode, temporal: test.expectedTemporal },
      actual: { type: classification.type, ragMode: classification.ragMode, temporal: classification.hasTemporalExpression },
      passed,
    });
  }

  return result;
}

function runTemporalTests(): TestResult {
  const result: TestResult = {
    category: 'Temporal Detection',
    passed: 0,
    failed: 0,
    details: [],
  };

  for (const test of TEMPORAL_TESTS) {
    const detected = detectTemporalExpression(test.query);
    const passed = detected === test.expected;

    if (passed) {
      result.passed++;
    } else {
      result.failed++;
    }

    result.details.push({
      query: test.query,
      description: test.description,
      expected: test.expected,
      actual: detected,
      passed,
    });
  }

  return result;
}

function runBackwardCompatibilityTests(): TestResult {
  const result: TestResult = {
    category: 'Backward Compatibility',
    passed: 0,
    failed: 0,
    details: [],
  };

  const tests = [
    { query: 'oi', expectedOldType: 'greeting', expectedNeedsDoc: false },
    { query: 'what can you do', expectedOldType: 'capability', expectedNeedsDoc: false },
    { query: 'compare A and B', expectedOldType: 'comparison', expectedNeedsDoc: true },
    { query: 'analyze the document', expectedOldType: 'explanation', expectedNeedsDoc: true },
    { query: 'what is the price?', expectedOldType: 'data', expectedNeedsDoc: true },
  ];

  for (const test of tests) {
    const intent = detectIntent(test.query);
    const typeMatch = intent.type === test.expectedOldType;
    const docMatch = intent.needsDocuments === test.expectedNeedsDoc;
    const passed = typeMatch && docMatch;

    if (passed) {
      result.passed++;
    } else {
      result.failed++;
    }

    result.details.push({
      query: test.query,
      description: `detectIntent backward compat`,
      expected: { type: test.expectedOldType, needsDocuments: test.expectedNeedsDoc },
      actual: { type: intent.type, needsDocuments: intent.needsDocuments },
      passed,
    });
  }

  return result;
}

function runRagModeUtilityTests(): TestResult {
  const result: TestResult = {
    category: 'RAG Mode Utilities',
    passed: 0,
    failed: 0,
    details: [],
  };

  // Test getChunkCountForRagMode
  const chunkTests: { mode: RagMode; expected: number }[] = [
    { mode: 'no_rag', expected: 0 },
    { mode: 'light_rag', expected: 3 },
    { mode: 'full_rag', expected: 15 },
  ];

  for (const test of chunkTests) {
    const actual = getChunkCountForRagMode(test.mode);
    const passed = actual === test.expected;

    if (passed) {
      result.passed++;
    } else {
      result.failed++;
    }

    result.details.push({
      query: `getChunkCountForRagMode('${test.mode}')`,
      description: `Chunk count for ${test.mode}`,
      expected: test.expected,
      actual,
      passed,
    });
  }

  return result;
}

function runPerformanceTest(): { avgTimeMs: number; maxTimeMs: number; passed: boolean } {
  const iterations = 100;
  const times: number[] = [];

  const queries = [
    'oi',
    'o que você pode fazer?',
    'compare todos os documentos',
    'qual o valor do contrato assinado em 10/12/2024?',
    'analyze the revenue trends across all quarterly reports',
  ];

  for (let i = 0; i < iterations; i++) {
    for (const query of queries) {
      const start = Date.now();
      classifyQuestion(query);
      times.push(Date.now() - start);
    }
  }

  const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTimeMs = Math.max(...times);

  return {
    avgTimeMs,
    maxTimeMs,
    passed: avgTimeMs < 10 && maxTimeMs < 50, // Target: avg < 10ms, max < 50ms
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('ENHANCED INTENT DETECTION TESTS');
  console.log('='.repeat(70) + '\n');

  const allResults: TestResult[] = [];

  // Run all test categories
  allResults.push(runClassificationTests('Greetings', GREETING_TESTS));
  allResults.push(runClassificationTests('Meta/Capability', META_TESTS));
  allResults.push(runClassificationTests('Comparison', COMPARISON_TESTS));
  allResults.push(runClassificationTests('List', LIST_TESTS));
  allResults.push(runClassificationTests('Complex Analysis', COMPLEX_ANALYSIS_TESTS));
  allResults.push(runClassificationTests('Complex Multi-Doc', COMPLEX_MULTIDOC_TESTS));
  allResults.push(runClassificationTests('Follow-up', FOLLOWUP_TESTS));
  allResults.push(runClassificationTests('Medium Specific', MEDIUM_SPECIFIC_TESTS));
  allResults.push(runClassificationTests('Simple Factual', SIMPLE_FACTUAL_TESTS));
  allResults.push(runClassificationTests('Medium', MEDIUM_TESTS));
  allResults.push(runTemporalTests());
  allResults.push(runBackwardCompatibilityTests());
  allResults.push(runRagModeUtilityTests());

  // Print results
  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of allResults) {
    console.log(`\n${result.category}:`);
    console.log('-'.repeat(40));

    for (const detail of result.details) {
      const icon = detail.passed ? '\x1b[32m\u2714\x1b[0m' : '\x1b[31m\u2718\x1b[0m';
      console.log(`${icon} ${detail.description}`);

      if (!detail.passed) {
        console.log(`   Query: "${detail.query}"`);
        console.log(`   Expected: ${JSON.stringify(detail.expected)}`);
        console.log(`   Actual: ${JSON.stringify(detail.actual)}`);
      }
    }

    console.log(`\nPassed: ${result.passed}/${result.passed + result.failed}`);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  // Performance test
  console.log('\n' + '='.repeat(70));
  console.log('PERFORMANCE TEST');
  console.log('='.repeat(70));

  const perfResult = runPerformanceTest();
  console.log(`\nAverage time: ${perfResult.avgTimeMs.toFixed(2)}ms`);
  console.log(`Maximum time: ${perfResult.maxTimeMs}ms`);
  console.log(`Target: avg < 10ms, max < 50ms`);
  console.log(`Status: ${perfResult.passed ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`\nTotal: ${totalPassed}/${totalPassed + totalFailed} tests passed`);
  console.log(`Performance: ${perfResult.passed ? 'PASSED' : 'FAILED'}`);

  const allPassed = totalFailed === 0 && perfResult.passed;
  console.log(`\nOverall: ${allPassed ? '\x1b[32mALL TESTS PASSED\x1b[0m' : '\x1b[31mSOME TESTS FAILED\x1b[0m'}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
