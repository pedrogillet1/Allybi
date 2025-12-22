/**
 * KODA V3 Routing Smoke Tests
 *
 * Tests the intent routing system to ensure queries are correctly classified.
 * Run with: npx ts-node src/tests/routing.smoke.test.ts
 *
 * Categories:
 * - Help queries (product questions)
 * - Document queries (RAG)
 * - Domain queries (legal, medical, finance, etc.)
 * - Edge cases (multilingual, conversational)
 */

import KodaIntentEngineV3 from '../services/core/kodaIntentEngineV3.service';
import IntentConfigService from '../services/core/intentConfig.service';

// Test case structure
interface RoutingTestCase {
  id: string;
  query: string;
  expectedIntent: string;
  expectedDomain?: string;
  language?: 'en' | 'pt' | 'es';
  minConfidence?: number;
  description: string;
}

// Define test cases
const testCases: RoutingTestCase[] = [
  // ==================== HELP QUERIES (5) ====================
  {
    id: 'HELP_01',
    query: 'How do I upload a file?',
    expectedIntent: 'help',
    minConfidence: 0.7,
    description: 'Product help - file upload',
  },
  {
    id: 'HELP_02',
    query: 'What can Koda do?',
    expectedIntent: 'help',
    minConfidence: 0.7,
    description: 'Product capabilities question',
  },
  {
    id: 'HELP_03',
    query: 'How do I delete a document?',
    expectedIntent: 'help',
    minConfidence: 0.7,
    description: 'Product help - document deletion',
  },
  {
    id: 'HELP_04',
    query: 'Can you summarize files?',
    expectedIntent: 'help',
    minConfidence: 0.6,
    description: 'Product capability inquiry',
  },
  {
    id: 'HELP_05',
    query: 'How to search my documents?',
    expectedIntent: 'help',
    minConfidence: 0.7,
    description: 'Product help - search feature',
  },

  // ==================== DOCUMENT QUERIES (5) ====================
  {
    id: 'DOC_01',
    query: 'What does the contract say about termination?',
    expectedIntent: 'documents',
    minConfidence: 0.7,
    description: 'Document content question',
  },
  {
    id: 'DOC_02',
    query: 'Summarize my uploaded documents',
    expectedIntent: 'documents',
    minConfidence: 0.7,
    description: 'Document summary request',
  },
  {
    id: 'DOC_03',
    query: 'Find all mentions of revenue in my files',
    expectedIntent: 'documents',
    minConfidence: 0.7,
    description: 'Document search/extraction',
  },
  {
    id: 'DOC_04',
    query: 'What are the key points from the quarterly report?',
    expectedIntent: 'documents',
    minConfidence: 0.7,
    description: 'Document key points extraction',
  },
  {
    id: 'DOC_05',
    query: 'Compare the two contracts',
    expectedIntent: 'documents',
    minConfidence: 0.7,
    description: 'Document comparison',
  },

  // ==================== DOMAIN QUERIES (5) ====================
  {
    id: 'DOMAIN_LEGAL_01',
    query: 'What is the liability cap in clause 7?',
    expectedIntent: 'legal',
    minConfidence: 0.7,
    description: 'Legal domain - contract clause',
  },
  {
    id: 'DOMAIN_MEDICAL_01',
    query: 'What is the patient\'s hemoglobin level?',
    expectedIntent: 'medical',
    minConfidence: 0.7,
    description: 'Medical domain - lab result',
  },
  {
    id: 'DOMAIN_FINANCE_01',
    query: 'What is the EBITDA for Q3?',
    expectedIntent: 'finance',
    minConfidence: 0.7,
    description: 'Finance domain - financial metric',
  },
  {
    id: 'DOMAIN_EXCEL_01',
    query: 'Sum column B in the spreadsheet',
    expectedIntent: 'excel',
    minConfidence: 0.7,
    description: 'Excel domain - spreadsheet operation',
  },
  {
    id: 'DOMAIN_ENGINEERING_01',
    query: 'What are the ISO tolerance requirements?',
    expectedIntent: 'engineering',
    minConfidence: 0.7,
    description: 'Engineering domain - spec requirement',
  },

  // ==================== EDGE CASES (5) ====================
  {
    id: 'EDGE_CONVO_01',
    query: 'Hello, how are you?',
    expectedIntent: 'conversation',
    minConfidence: 0.6,
    description: 'Conversational greeting',
  },
  {
    id: 'EDGE_CONVO_02',
    query: 'Thank you for your help',
    expectedIntent: 'conversation',
    minConfidence: 0.6,
    description: 'Conversational thanks',
  },
  {
    id: 'EDGE_PT_01',
    query: 'Como faço para enviar um arquivo?',
    expectedIntent: 'help',
    language: 'pt',
    minConfidence: 0.6,
    description: 'Portuguese - file upload help',
  },
  {
    id: 'EDGE_ES_01',
    query: '¿Qué dice el contrato sobre la terminación?',
    expectedIntent: 'documents',
    language: 'es',
    minConfidence: 0.6,
    description: 'Spanish - document content question',
  },
  {
    id: 'EDGE_FILE_01',
    query: 'How many files do I have?',
    expectedIntent: 'file_actions',
    minConfidence: 0.6,
    description: 'File metadata query',
  },
];

// Test result interface
interface TestResult {
  id: string;
  passed: boolean;
  query: string;
  expectedIntent: string;
  actualIntent: string;
  confidence: number;
  minConfidence: number;
  error?: string;
}

// Run the tests
async function runRoutingTests(): Promise<void> {
  console.log('\n====================================');
  console.log('  KODA V3 ROUTING SMOKE TESTS');
  console.log('====================================\n');

  // Initialize services
  const intentConfig = new IntentConfigService();
  await intentConfig.loadPatterns();

  const intentEngine = new KodaIntentEngineV3(intentConfig);

  const stats = intentConfig.getStatistics();
  console.log(`Loaded ${stats.totalIntents} intents, ${stats.totalPatterns} patterns, ${stats.totalKeywords} keywords\n`);

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  // Run each test case
  for (const testCase of testCases) {
    try {
      const prediction = await intentEngine.predict({
        text: testCase.query,
        language: testCase.language || 'en',
      });

      const intentMatches = prediction.primaryIntent === testCase.expectedIntent;
      const confidenceOk = prediction.confidence >= (testCase.minConfidence || 0.7);
      const testPassed = intentMatches && confidenceOk;

      const result: TestResult = {
        id: testCase.id,
        passed: testPassed,
        query: testCase.query,
        expectedIntent: testCase.expectedIntent,
        actualIntent: prediction.primaryIntent,
        confidence: prediction.confidence,
        minConfidence: testCase.minConfidence || 0.7,
      };

      results.push(result);

      if (testPassed) {
        passed++;
        console.log(`✅ ${testCase.id}: ${testCase.description}`);
        console.log(`   Query: "${testCase.query.substring(0, 50)}..."`);
        console.log(`   Intent: ${prediction.primaryIntent} (${(prediction.confidence * 100).toFixed(1)}%)`);
      } else {
        failed++;
        console.log(`❌ ${testCase.id}: ${testCase.description}`);
        console.log(`   Query: "${testCase.query}"`);
        console.log(`   Expected: ${testCase.expectedIntent} (>= ${(testCase.minConfidence || 0.7) * 100}%)`);
        console.log(`   Got: ${prediction.primaryIntent} (${(prediction.confidence * 100).toFixed(1)}%)`);
        if (prediction.matchedPattern) {
          console.log(`   Matched pattern: ${prediction.matchedPattern}`);
        }
        if (prediction.matchedKeywords) {
          console.log(`   Matched keywords: ${prediction.matchedKeywords.join(', ')}`);
        }
      }
      console.log('');
    } catch (error) {
      failed++;
      results.push({
        id: testCase.id,
        passed: false,
        query: testCase.query,
        expectedIntent: testCase.expectedIntent,
        actualIntent: 'ERROR',
        confidence: 0,
        minConfidence: testCase.minConfidence || 0.7,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`❌ ${testCase.id}: ERROR - ${error}`);
      console.log('');
    }
  }

  // Print summary
  console.log('====================================');
  console.log('  SUMMARY');
  console.log('====================================');
  console.log(`Total: ${testCases.length}`);
  console.log(`Passed: ${passed} (${((passed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed} (${((failed / testCases.length) * 100).toFixed(1)}%)`);
  console.log('====================================\n');

  // Print failures for easy debugging
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('FAILED TESTS:');
    for (const failure of failures) {
      console.log(`  - ${failure.id}: expected ${failure.expectedIntent}, got ${failure.actualIntent}`);
    }
    console.log('');
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests if called directly
runRoutingTests().catch(console.error);
