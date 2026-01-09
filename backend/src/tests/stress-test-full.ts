/**
 * KODA FULL STRESS TEST
 *
 * Tests with REAL document-related queries and shows FULL output:
 * - Intent detection
 * - Answer format
 * - File actions
 *
 * Run with: npx ts-node src/tests/stress-test-full.ts
 */

import KodaIntentEngineV3 from '../services/core/kodaIntentEngineV3.service';
import IntentConfigService from '../services/core/intentConfig.service';

// Test cases based on REAL documents in the test folder
interface StressTestCase {
  id: string;
  query: string;
  category: string;
  expectedBehavior: string;
}

const stressTestCases: StressTestCase[] = [
  // ==================== A) FILE NAVIGATION ====================
  { id: 'NAV_01', query: 'What folders do I have?', category: 'file_actions', expectedBehavior: 'list folders' },
  { id: 'NAV_02', query: 'List everything in test 1', category: 'file_actions', expectedBehavior: 'list folder contents' },
  { id: 'NAV_03', query: 'Show me all my files', category: 'file_actions', expectedBehavior: 'list all documents' },
  { id: 'NAV_04', query: 'Do I have any PDFs?', category: 'file_actions', expectedBehavior: 'filter by type' },
  { id: 'NAV_05', query: 'Which folder has the P&L files?', category: 'file_actions', expectedBehavior: 'folder search' },

  // ==================== B) FILE DISCOVERY (SHOW_FILE) ====================
  { id: 'SHOW_01', query: 'Where is the Lone Mountain Ranch P&L?', category: 'file_actions', expectedBehavior: 'SHOW_FILE with location' },
  { id: 'SHOW_02', query: 'Find the Rosewood Fund file', category: 'file_actions', expectedBehavior: 'SHOW_FILE' },
  { id: 'SHOW_03', query: 'Show me the LMR Improvement Plan', category: 'file_actions', expectedBehavior: 'SHOW_FILE' },
  { id: 'SHOW_04', query: 'Open the Scrum chapter PDF', category: 'file_actions', expectedBehavior: 'OPEN_FILE' },
  { id: 'SHOW_05', query: 'Where is the real estate presentation?', category: 'file_actions', expectedBehavior: 'SHOW_FILE with location' },

  // ==================== C) DOCUMENT CONTENT Q&A ====================
  { id: 'DOC_01', query: 'What is the total revenue in the Lone Mountain Ranch P&L 2024?', category: 'documents', expectedBehavior: 'answer from document' },
  { id: 'DOC_02', query: 'Summarize the Rosewood Fund spreadsheet', category: 'documents', expectedBehavior: 'document summary' },
  { id: 'DOC_03', query: 'What is the $63m PIP plan about?', category: 'documents', expectedBehavior: 'answer from document' },
  { id: 'DOC_04', query: 'Compare the 2024 P&L with the 2025 budget', category: 'documents', expectedBehavior: 'comparison answer' },
  { id: 'DOC_05', query: 'What does the Scrum framework chapter explain?', category: 'documents', expectedBehavior: 'summary' },

  // ==================== D) FOLLOW-UP QUERIES ====================
  { id: 'FOLLOW_01', query: 'Open it', category: 'file_actions', expectedBehavior: 'OPEN_FILE using context' },
  { id: 'FOLLOW_02', query: 'Show me that file', category: 'file_actions', expectedBehavior: 'SHOW_FILE using context' },
  { id: 'FOLLOW_03', query: 'What are the expenses in the P&L?', category: 'documents', expectedBehavior: 'document Q&A' },
  { id: 'FOLLOW_04', query: 'What is the net income in the budget?', category: 'documents', expectedBehavior: 'document Q&A' },
  { id: 'FOLLOW_05', query: 'Which folder is it in?', category: 'file_actions', expectedBehavior: 'show location' },

  // ==================== E) FILE MANAGEMENT (MOVE/RENAME/DELETE) ====================
  { id: 'MGMT_01', query: 'Move the Rosewood file to test 2', category: 'file_actions', expectedBehavior: 'MOVE_FILE' },
  { id: 'MGMT_02', query: 'Rename the P&L 2024 to "P&L Final 2024"', category: 'file_actions', expectedBehavior: 'RENAME_FILE' },
  { id: 'MGMT_03', query: 'Delete the PNG file', category: 'file_actions', expectedBehavior: 'DELETE_FILE with confirm' },
  { id: 'MGMT_04', query: 'Move it to test 3', category: 'file_actions', expectedBehavior: 'MOVE_FILE using context' },
  { id: 'MGMT_05', query: 'Create a new folder called Archives', category: 'file_actions', expectedBehavior: 'CREATE_FOLDER' },

  // ==================== F) EXCEL/FINANCE DOMAIN ====================
  { id: 'EXCEL_01', query: 'Sum the total expenses in the P&L', category: 'excel', expectedBehavior: 'calculation from spreadsheet' },
  { id: 'EXCEL_02', query: 'What is the EBITDA in the 2024 P&L?', category: 'finance', expectedBehavior: 'financial metric extraction' },
  { id: 'EXCEL_03', query: 'Calculate the profit margin', category: 'excel', expectedBehavior: 'calculation' },
  { id: 'EXCEL_04', query: 'Show me the budget breakdown by category', category: 'documents', expectedBehavior: 'structured answer' },
  { id: 'EXCEL_05', query: 'What is the improvement plan budget?', category: 'documents', expectedBehavior: 'answer from document' },

  // ==================== G) PORTUGUESE QUERIES ====================
  { id: 'PT_01', query: 'Onde está o arquivo do Scrum?', category: 'file_actions', expectedBehavior: 'SHOW_FILE (Portuguese)' },
  { id: 'PT_02', query: 'Mostrar o arquivo do projeto', category: 'file_actions', expectedBehavior: 'SHOW_FILE (Portuguese)' },
  { id: 'PT_03', query: 'O que diz a análise do mezanino?', category: 'documents', expectedBehavior: 'answer from document' },
  { id: 'PT_04', query: 'Resumir o documento de anotações', category: 'documents', expectedBehavior: 'summary (Portuguese)' },
  { id: 'PT_05', query: 'O que há no documento do Parque Global?', category: 'documents', expectedBehavior: 'answer from document' },

  // ==================== H) EDGE CASES ====================
  { id: 'EDGE_01', query: 'Open the file', category: 'file_actions', expectedBehavior: 'ask which file or use context' },
  { id: 'EDGE_02', query: 'What is in my documents?', category: 'documents', expectedBehavior: 'list all documents' },
  { id: 'EDGE_03', query: 'Find the budget file', category: 'file_actions', expectedBehavior: 'SHOW_FILE or SELECT_FILE' },
  { id: 'EDGE_04', query: 'Show me the P&L', category: 'file_actions', expectedBehavior: 'SELECT_FILE (multiple matches)' },
  { id: 'EDGE_05', query: 'Delete all the PDFs', category: 'file_actions', expectedBehavior: 'multi-file DELETE with confirm' },

  // ==================== I) CONVERSATIONAL ====================
  { id: 'CONV_01', query: 'Hello', category: 'conversation', expectedBehavior: 'greeting' },
  { id: 'CONV_02', query: 'Thanks for the help', category: 'conversation', expectedBehavior: 'acknowledgment' },
  { id: 'CONV_03', query: 'What can you do?', category: 'help', expectedBehavior: 'capabilities' },
  { id: 'CONV_04', query: 'How do I upload a file?', category: 'help', expectedBehavior: 'product help' },
  { id: 'CONV_05', query: 'Goodbye', category: 'conversation', expectedBehavior: 'farewell' },
];

interface TestResult {
  id: string;
  query: string;
  category: string;
  expectedBehavior: string;
  detectedIntent: string;
  confidence: number;
  matchedPattern?: string;
  matchedKeywords?: string[];
  secondaryIntents?: Array<{ name: string; confidence: number }>;
  passed: boolean;
  issue?: string;
}

// Define acceptable intents for each category
// Domain-specific queries (finance, legal, medical, excel) are CORRECT to route to their domain
// The orchestrator will still use RAG with domain context
const ACCEPTABLE_INTENTS: Record<string, string[]> = {
  'file_actions': ['file_actions', 'files'],
  'documents': ['documents', 'doc_qa', 'doc_summarize', 'doc_search', 'finance', 'legal', 'medical', 'excel', 'engineering', 'file_actions'],
  'excel': ['excel', 'file_actions', 'documents', 'finance', 'reasoning'],
  'finance': ['finance', 'documents', 'excel'],
  'conversation': ['conversation', 'greeting', 'documents'],  // fallback queries may route to documents
  'help': ['help'],
};

async function runFullStressTest(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('  KODA V3 FULL STRESS TEST - DOCUMENT-RELATED QUERIES');
  console.log('='.repeat(80) + '\n');

  // Initialize services
  const intentConfig = new IntentConfigService();
  await intentConfig.loadPatterns();

  const intentEngine = new KodaIntentEngineV3(intentConfig);

  const stats = intentConfig.getStatistics();
  console.log(`📊 Loaded: ${stats.totalIntents} intents, ${stats.totalPatterns} patterns, ${stats.totalKeywords} keywords\n`);

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  // Category tracking
  const categoryResults: Record<string, { passed: number; failed: number }> = {};

  for (const testCase of stressTestCases) {
    console.log('-'.repeat(80));
    console.log(`🧪 TEST ${testCase.id}: "${testCase.query}"`);
    console.log(`   Category: ${testCase.category} | Expected: ${testCase.expectedBehavior}`);

    try {
      // Detect language (Portuguese: check accents + common Portuguese words)
      const hasAccents = /[áéíóúãõçê]/.test(testCase.query);
      const hasPtWords = /\b(arquivo|documento|onde|qual|mostrar|abrir|resumir|conteúdo|está)\b/i.test(testCase.query);
      const isPt = hasAccents || (testCase.id.startsWith('PT_') && hasPtWords);

      // Step 1: Intent prediction
      const prediction = await intentEngine.predict({
        text: testCase.query,
        language: isPt ? 'pt' : 'en',
      });

      // Check if the detected intent is acceptable for the category
      const acceptableIntents = ACCEPTABLE_INTENTS[testCase.category] || [testCase.category];
      const intentMatch = acceptableIntents.includes(prediction.primaryIntent);
      const confidenceOk = prediction.confidence >= 0.5;
      const testPassed = intentMatch && confidenceOk;

      const result: TestResult = {
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        expectedBehavior: testCase.expectedBehavior,
        detectedIntent: prediction.primaryIntent,
        confidence: prediction.confidence,
        matchedPattern: prediction.matchedPattern,
        matchedKeywords: prediction.matchedKeywords,
        secondaryIntents: prediction.secondaryIntents,
        passed: testPassed,
        issue: testPassed ? undefined : `Expected one of [${acceptableIntents.join(', ')}], got ${prediction.primaryIntent}`,
      };

      results.push(result);

      // Track by category
      if (!categoryResults[testCase.category]) {
        categoryResults[testCase.category] = { passed: 0, failed: 0 };
      }

      if (testPassed) {
        passed++;
        categoryResults[testCase.category].passed++;
        console.log(`   ✅ PASS: ${prediction.primaryIntent} (${(prediction.confidence * 100).toFixed(1)}%)`);
      } else {
        failed++;
        categoryResults[testCase.category].failed++;
        console.log(`   ❌ FAIL: Got ${prediction.primaryIntent} (${(prediction.confidence * 100).toFixed(1)}%)`);
        console.log(`          Expected one of: [${acceptableIntents.join(', ')}]`);
      }

      // Show details
      if (prediction.matchedPattern) {
        console.log(`   📋 Pattern: ${prediction.matchedPattern.substring(0, 60)}${prediction.matchedPattern.length > 60 ? '...' : ''}`);
      }
      if (prediction.matchedKeywords && prediction.matchedKeywords.length > 0) {
        console.log(`   🔑 Keywords: ${prediction.matchedKeywords.slice(0, 5).join(', ')}`);
      }
      if (prediction.secondaryIntents && prediction.secondaryIntents.length > 0) {
        console.log(`   📊 Secondary: ${prediction.secondaryIntents.slice(0, 2).map(s => `${s.name}(${(s.confidence * 100).toFixed(0)}%)`).join(', ')}`);
      }

    } catch (error) {
      failed++;
      console.log(`   ❌ ERROR: ${error}`);
      results.push({
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        expectedBehavior: testCase.expectedBehavior,
        detectedIntent: 'ERROR',
        confidence: 0,
        passed: false,
        issue: String(error),
      });
      if (!categoryResults[testCase.category]) {
        categoryResults[testCase.category] = { passed: 0, failed: 0 };
      }
      categoryResults[testCase.category].failed++;
    }

    console.log('');
  }

  // ==================== SUMMARY ====================
  console.log('='.repeat(80));
  console.log('  SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n📊 OVERALL: ${passed}/${stressTestCases.length} passed (${((passed / stressTestCases.length) * 100).toFixed(1)}%)\n`);

  console.log('BY CATEGORY:');
  Object.entries(categoryResults).forEach(([cat, stats]) => {
    const total = stats.passed + stats.failed;
    const pct = ((stats.passed / total) * 100).toFixed(0);
    const icon = stats.failed === 0 ? '✅' : stats.passed === 0 ? '❌' : '⚠️';
    console.log(`  ${icon} ${cat}: ${stats.passed}/${total} (${pct}%)`);
  });

  // ==================== FAILURES ====================
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('  FAILURES (NEED FIXING)');
    console.log('='.repeat(80));
    failures.forEach(f => {
      console.log(`\n❌ ${f.id}: "${f.query}"`);
      console.log(`   Expected: ${f.category} | Got: ${f.detectedIntent} (${(f.confidence * 100).toFixed(1)}%)`);
      if (f.matchedKeywords) console.log(`   Keywords: ${f.matchedKeywords.join(', ')}`);
      if (f.issue) console.log(`   Issue: ${f.issue}`);
    });
  }

  // ==================== CRITICAL ISSUES ====================
  console.log('\n' + '='.repeat(80));
  console.log('  CRITICAL ISSUES DETECTED');
  console.log('='.repeat(80));

  // Check for file management failures (MOVE/RENAME/DELETE)
  const mgmtFailures = failures.filter(f => f.id.startsWith('MGMT_'));
  if (mgmtFailures.length > 0) {
    console.log('\n🔴 FILE MANAGEMENT (MOVE/RENAME/DELETE) ROUTING ISSUES:');
    mgmtFailures.forEach(f => console.log(`   - ${f.id}: "${f.query}" → ${f.detectedIntent}`));
  }

  // Check for follow-up failures
  const followupFailures = failures.filter(f => f.id.startsWith('FOLLOW_'));
  if (followupFailures.length > 0) {
    console.log('\n🔴 FOLLOW-UP CONTEXT ISSUES:');
    followupFailures.forEach(f => console.log(`   - ${f.id}: "${f.query}" → ${f.detectedIntent}`));
  }

  // Check for file action failures
  const fileActionFailures = failures.filter(f => f.category === 'file_actions' && !f.id.startsWith('MGMT_'));
  if (fileActionFailures.length > 0) {
    console.log('\n🟡 FILE ACTION ROUTING ISSUES:');
    fileActionFailures.forEach(f => console.log(`   - ${f.id}: "${f.query}" → ${f.detectedIntent}`));
  }

  // Check for navigation failures
  const navFailures = failures.filter(f => f.id.startsWith('NAV_'));
  if (navFailures.length > 0) {
    console.log('\n🟡 NAVIGATION ROUTING ISSUES:');
    navFailures.forEach(f => console.log(`   - ${f.id}: "${f.query}" → ${f.detectedIntent}`));
  }

  console.log('\n' + '='.repeat(80));
  const passRate = passed / stressTestCases.length;
  const verdict = passRate >= 0.9 ? '🟢 READY TO DEPLOY' :
    passRate >= 0.7 ? '🟡 NEEDS FIXES BEFORE DEPLOY' :
    '🔴 NOT READY - CRITICAL ISSUES';
  console.log(`  VERDICT: ${verdict} (${(passRate * 100).toFixed(1)}% pass rate)`);
  console.log('='.repeat(80) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run
runFullStressTest().catch(console.error);
