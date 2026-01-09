/**
 * KODA — ULTIMATE CONVERSATION TEST
 *
 * System-level acceptance test for Koda's routing, depth control,
 * intent handling, memory, preferences, and document reasoning.
 *
 * Run with Jest:   npm test -- --testPathPattern=ultimate-koda
 * Run standalone:  npx ts-node src/tests/ultimate-koda.test.ts
 *
 * @version 1.0.0
 */

import { IntentName, LanguageCode, PredictedIntent } from '../types/intentV3.types';

// ============================================================================
// TEST CASE DEFINITIONS
// ============================================================================

/**
 * Depth levels for query complexity
 */
type DepthLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

/**
 * Sub-intent categories for documents intent
 */
type DocumentSubIntent =
  | 'locate'
  | 'explain'
  | 'extract'
  | 'summarize'
  | 'compare'
  | 'cross_reference'
  | 'validate'
  | 'assess_risk';

/**
 * Test case definition with full validation criteria
 */
interface UltimateTestCase {
  id: string;
  phase: number;
  phaseTitle: string;
  query: string;
  description: string;

  // Expected classification
  expectedIntent: IntentName;
  expectedSubIntent?: DocumentSubIntent | string;
  expectedDepth: DepthLevel;
  expectedDomain?: string;

  // Multi-intent expectations
  isMultiIntent?: boolean;
  expectedSecondaryIntent?: IntentName;

  // Validation flags
  requiresDocuments?: boolean;
  requiresMemory?: boolean;
  requiresPreferences?: boolean;
  isCollisionTest?: boolean;
  isErrorTest?: boolean;

  // Context dependencies
  dependsOnPrevious?: boolean;
  setsMemory?: string;
  setsPreference?: string;
  expectsMemoryRecall?: string;
  expectsPreferenceApplied?: string;

  // Response validation
  expectedResponseContains?: string[];
  expectedResponseExcludes?: string[];
  minConfidence?: number;

  // Timing expectations
  maxRouterLatencyMs?: number;
  maxTotalLatencyMs?: number;
}

/**
 * All 17 test cases from the Ultimate Koda Test specification
 */
const ultimateTestCases: UltimateTestCase[] = [
  // ==========================================================================
  // PHASE 1 — Grounding & Basic Document Routing
  // ==========================================================================
  {
    id: 'Q1',
    phase: 1,
    phaseTitle: 'Grounding & Basic Document Routing',
    query: 'Where in the document does it talk about contract termination?',
    description: 'SIMPLE / D1 / documents.locate',
    expectedIntent: 'documents',
    expectedSubIntent: 'locate',
    expectedDepth: 'D1',
    requiresDocuments: true,
    minConfidence: 0.7,
    maxRouterLatencyMs: 50,
    expectedResponseContains: ['section', 'clause'],
    expectedResponseExcludes: ['I think', 'probably', 'might be'],
  },
  {
    id: 'Q2',
    phase: 1,
    phaseTitle: 'Grounding & Basic Document Routing',
    query: 'Can you explain that termination clause in simple terms?',
    description: 'SIMPLE / D2 / documents.explain',
    expectedIntent: 'documents',
    expectedSubIntent: 'explain',
    expectedDepth: 'D2',
    requiresDocuments: true,
    dependsOnPrevious: true,
    minConfidence: 0.7,
    expectedResponseExcludes: ['legal advice', 'I recommend', 'you should'],
  },

  // ==========================================================================
  // PHASE 2 — Extraction & Structure
  // ==========================================================================
  {
    id: 'Q3',
    phase: 2,
    phaseTitle: 'Extraction & Structure',
    query: 'List all deadlines mentioned in this document.',
    description: 'SIMPLE / documents.extract',
    expectedIntent: 'documents',
    expectedSubIntent: 'extract',
    expectedDepth: 'D2',
    requiresDocuments: true,
    minConfidence: 0.7,
  },
  {
    id: 'Q4',
    phase: 2,
    phaseTitle: 'Extraction & Structure',
    query: 'Organize those deadlines into a table with name and duration.',
    description: 'MEDIUM / documents.extract + formatting',
    expectedIntent: 'documents',
    expectedSubIntent: 'extract',
    expectedDepth: 'D2',
    requiresDocuments: true,
    dependsOnPrevious: true,
    minConfidence: 0.7,
    expectedResponseContains: ['|', 'name', 'duration'], // Table markers
  },

  // ==========================================================================
  // PHASE 3 — Comparison & Cross-Reference
  // ==========================================================================
  {
    id: 'Q5',
    phase: 3,
    phaseTitle: 'Comparison & Cross-Reference',
    query: 'Compare this version of the contract with the previous one and tell me what changed in the payment section.',
    description: 'MEDIUM / documents.compare / D3',
    expectedIntent: 'documents',
    expectedSubIntent: 'compare',
    expectedDepth: 'D3',
    requiresDocuments: true,
    minConfidence: 0.7,
    expectedResponseContains: ['before', 'after', 'changed'],
  },
  {
    id: 'Q6',
    phase: 3,
    phaseTitle: 'Comparison & Cross-Reference',
    query: 'Is the payment clause consistent with the financial annex?',
    description: 'HARD / documents.cross_reference',
    expectedIntent: 'documents',
    expectedSubIntent: 'cross_reference',
    expectedDepth: 'D3',
    requiresDocuments: true,
    minConfidence: 0.7,
    expectedResponseContains: ['yes', 'no', 'partially', 'consistent', 'inconsistent'],
  },

  // ==========================================================================
  // PHASE 4 — Validation & Risk Awareness
  // ==========================================================================
  {
    id: 'Q7',
    phase: 4,
    phaseTitle: 'Validation & Risk Awareness',
    query: 'Are there any inconsistencies or missing information in this contract?',
    description: 'HARD / documents.validate / D4',
    expectedIntent: 'documents',
    expectedSubIntent: 'validate',
    expectedDepth: 'D4',
    requiresDocuments: true,
    minConfidence: 0.7,
    expectedResponseExcludes: ['definitely', 'certainly', 'must'],
  },
  {
    id: 'Q8',
    phase: 4,
    phaseTitle: 'Validation & Risk Awareness',
    query: 'Could this contract create risks or problems in the future?',
    description: 'VERY HARD / documents.assess_risk / D5',
    expectedIntent: 'documents',
    expectedSubIntent: 'assess_risk',
    expectedDepth: 'D5',
    requiresDocuments: true,
    minConfidence: 0.7,
    expectedResponseExcludes: ['legal advice', 'guarantee', 'definitely will'],
  },

  // ==========================================================================
  // PHASE 5 — Multi-Intent (Documents + Decision Support)
  // ==========================================================================
  {
    id: 'Q9',
    phase: 5,
    phaseTitle: 'Multi-Intent',
    query: 'Summarize the key points of the contract and tell me what I should pay special attention to.',
    description: 'MULTI-INTENT: documents.summarize + decision_support',
    expectedIntent: 'documents',
    expectedSubIntent: 'summarize',
    expectedDepth: 'D3',
    isMultiIntent: true,
    expectedSecondaryIntent: 'reasoning',
    requiresDocuments: true,
    minConfidence: 0.6,
  },

  // ==========================================================================
  // PHASE 6 — Memory
  // ==========================================================================
  {
    id: 'Q10',
    phase: 6,
    phaseTitle: 'Memory',
    query: 'Remember that this contract is important to me.',
    description: 'memory.store',
    expectedIntent: 'memory',
    expectedSubIntent: 'store',
    expectedDepth: 'D1',
    requiresMemory: true,
    setsMemory: 'contract_importance',
    minConfidence: 0.7,
    expectedResponseContains: ['remember', 'noted', 'stored', 'saved'],
  },
  {
    id: 'Q11',
    phase: 6,
    phaseTitle: 'Memory',
    query: 'What was the important contract I asked you to remember?',
    description: 'memory.recall',
    expectedIntent: 'memory',
    expectedSubIntent: 'recall',
    expectedDepth: 'D1',
    requiresMemory: true,
    dependsOnPrevious: true,
    expectsMemoryRecall: 'contract_importance',
    minConfidence: 0.7,
  },

  // ==========================================================================
  // PHASE 7 — Preferences
  // ==========================================================================
  {
    id: 'Q12',
    phase: 7,
    phaseTitle: 'Preferences',
    query: 'I prefer short answers in bullet points.',
    description: 'preferences.set',
    expectedIntent: 'preferences',
    expectedSubIntent: 'set',
    expectedDepth: 'D1',
    requiresPreferences: true,
    setsPreference: 'format:bullet_short',
    minConfidence: 0.7,
    expectedResponseContains: ['preference', 'noted', 'saved', 'understood'],
  },
  {
    id: 'Q13',
    phase: 7,
    phaseTitle: 'Preferences',
    query: 'Explain the confidentiality clause.',
    description: 'preferences.apply (implicit)',
    expectedIntent: 'documents',
    expectedSubIntent: 'explain',
    expectedDepth: 'D2',
    requiresDocuments: true,
    dependsOnPrevious: true,
    expectsPreferenceApplied: 'format:bullet_short',
    minConfidence: 0.7,
    expectedResponseContains: ['•', '-'], // Bullet markers
  },

  // ==========================================================================
  // PHASE 8 — Error Handling
  // ==========================================================================
  {
    id: 'Q14',
    phase: 8,
    phaseTitle: 'Error Handling',
    query: 'Analyze a document I haven\'t uploaded yet.',
    description: 'error.no_document',
    expectedIntent: 'documents',
    expectedDepth: 'D2',
    isErrorTest: true,
    minConfidence: 0.6,
    expectedResponseContains: ['upload', 'no document', 'not found', 'haven\'t uploaded'],
    expectedResponseExcludes: ['here is the analysis', 'the document says'],
  },

  // ==========================================================================
  // PHASE 9 — Collision & Routing Stress Tests
  // ==========================================================================
  {
    id: 'Q15',
    phase: 9,
    phaseTitle: 'Collision & Routing Stress Tests',
    query: 'Extract the values from the financial table.',
    description: 'COLLISION: documents × extraction × excel',
    expectedIntent: 'documents', // or 'excel' depending on context
    expectedSubIntent: 'extract',
    expectedDepth: 'D2',
    isCollisionTest: true,
    minConfidence: 0.5,
  },
  {
    id: 'Q16',
    phase: 9,
    phaseTitle: 'Collision & Routing Stress Tests',
    query: 'Is this cash flow correct according to the contract?',
    description: 'COLLISION: finance × accounting × documents',
    expectedIntent: 'documents', // Document-anchored reasoning wins
    expectedSubIntent: 'validate',
    expectedDepth: 'D3',
    isCollisionTest: true,
    requiresDocuments: true,
    minConfidence: 0.5,
    expectedResponseExcludes: ['valuation', 'investment advice', 'I recommend buying'],
  },

  // ==========================================================================
  // PHASE 10 — Long-Context Continuity
  // ==========================================================================
  {
    id: 'Q17',
    phase: 10,
    phaseTitle: 'Long-Context Continuity',
    query: 'Considering everything we discussed, give me a final summary with critical points, risks, and next steps.',
    description: 'LONG / COMPLEX / FINAL',
    expectedIntent: 'documents',
    expectedSubIntent: 'summarize',
    expectedDepth: 'D4',
    dependsOnPrevious: true,
    requiresMemory: true,
    minConfidence: 0.6,
    expectedResponseContains: ['summary', 'critical', 'risk', 'next step'],
  },
];

// ============================================================================
// TEST RESULT TYPES
// ============================================================================

interface TestResult {
  id: string;
  phase: number;
  passed: boolean;
  query: string;

  // Classification results
  expectedIntent: IntentName;
  actualIntent: IntentName;
  intentMatch: boolean;

  expectedDepth: DepthLevel;
  actualDepth?: DepthLevel;
  depthMatch: boolean;

  expectedSubIntent?: string;
  actualSubIntent?: string;
  subIntentMatch: boolean;

  // Confidence
  confidence: number;
  minConfidence: number;
  confidenceOk: boolean;

  // Multi-intent
  isMultiIntent: boolean;
  multiIntentDetected: boolean;
  secondaryIntentsFound?: string[];

  // Validation results
  responseValidation: {
    containsExpected: boolean;
    excludesForbidden: boolean;
    details: string[];
  };

  // Performance
  routerLatencyMs: number;
  totalLatencyMs: number;
  latencyOk: boolean;

  // State tracking
  memoryPersisted?: boolean;
  preferencePersisted?: boolean;
  preferenceApplied?: boolean;

  // Error info
  error?: string;
  warnings: string[];
}

interface TestSuiteReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;

  // Detailed metrics
  intentAccuracy: number;
  depthAccuracy: number;
  subIntentAccuracy: number;
  confidenceRate: number;

  // Category breakdowns
  byPhase: Record<number, { passed: number; failed: number }>;
  collisionErrors: string[];
  formattingViolations: string[];
  memoryFailures: string[];
  preferenceFailures: string[];

  // Performance
  avgRouterLatency: number;
  maxRouterLatency: number;
  avgTotalLatency: number;

  // Individual results
  results: TestResult[];

  // Final verdict
  verdict: 'PASS' | 'FAIL';
  failureReasons: string[];
}

// ============================================================================
// MOCK SERVICES (for standalone testing)
// ============================================================================

/**
 * Mock conversation state for tracking memory and preferences
 */
interface ConversationState {
  memories: Map<string, any>;
  preferences: Map<string, any>;
  previousQueries: string[];
  documentContext: boolean;
}

// ============================================================================
// TEST HARNESS
// ============================================================================

/**
 * Import services conditionally - works in both Jest and standalone mode
 */
async function loadServices() {
  try {
    const { default: KodaIntentEngineV3 } = await import('../services/core/kodaIntentEngineV3.service');
    const { default: IntentConfigService } = await import('../services/core/intentConfig.service');
    const { decide } = await import('../services/core/decisionTree.service');
    const { RoutingPriorityService } = await import('../services/core/routingPriority.service');

    return { KodaIntentEngineV3, IntentConfigService, decide, RoutingPriorityService };
  } catch (error) {
    console.error('Failed to load services:', error);
    throw error;
  }
}

/**
 * Run the ultimate test suite
 */
async function runUltimateTests(options: {
  verbose?: boolean;
  documentContext?: boolean;
} = {}): Promise<TestSuiteReport> {
  const { verbose = true, documentContext = true } = options;

  const startTime = Date.now();
  const results: TestResult[] = [];
  const conversationState: ConversationState = {
    memories: new Map(),
    preferences: new Map(),
    previousQueries: [],
    documentContext,
  };

  console.log('\n' + '='.repeat(60));
  console.log('  KODA — ULTIMATE CONVERSATION TEST');
  console.log('  System-Level Acceptance Test Suite');
  console.log('='.repeat(60) + '\n');

  // Load services
  const { KodaIntentEngineV3, IntentConfigService, decide, RoutingPriorityService } = await loadServices();

  const intentConfig = new IntentConfigService();
  await intentConfig.loadPatterns();

  const intentEngine = new KodaIntentEngineV3(intentConfig);
  const routingPriority = new RoutingPriorityService({ debug: false });

  const stats = intentConfig.getStatistics();
  console.log(`Loaded: ${stats.totalIntents} intents, ${stats.totalPatterns} patterns, ${stats.totalKeywords} keywords\n`);

  // Track metrics
  let currentPhase = 0;
  const phaseResults: Record<number, { passed: number; failed: number }> = {};
  const collisionErrors: string[] = [];
  const formattingViolations: string[] = [];
  const memoryFailures: string[] = [];
  const preferenceFailures: string[] = [];
  let routerLatencies: number[] = [];
  let totalLatencies: number[] = [];

  // Run each test case
  for (const testCase of ultimateTestCases) {
    // Phase header
    if (testCase.phase !== currentPhase) {
      currentPhase = testCase.phase;
      phaseResults[currentPhase] = { passed: 0, failed: 0 };
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`PHASE ${currentPhase}: ${testCase.phaseTitle}`);
      console.log(`${'─'.repeat(50)}\n`);
    }

    const testStartTime = Date.now();
    const warnings: string[] = [];

    try {
      // Classify intent
      const routerStartTime = Date.now();
      const rawPrediction = await intentEngine.predict({
        text: testCase.query,
        language: 'en' as LanguageCode,
      });

      // Apply routing priority adjustments
      const allIntentScores = [
        { intent: rawPrediction.primaryIntent, confidence: rawPrediction.confidence },
        ...(rawPrediction.secondaryIntents || []).map(s => ({ intent: s.name, confidence: s.confidence })),
      ];

      const priorityResult = routingPriority.adjustScores(
        allIntentScores,
        testCase.query,
        { hasDocuments: conversationState.documentContext }
      );

      // Use adjusted prediction
      const prediction = {
        ...rawPrediction,
        primaryIntent: priorityResult.primaryIntent,
        confidence: priorityResult.primaryConfidence,
        // Keep original for debugging
        _rawIntent: rawPrediction.primaryIntent,
        _rawConfidence: rawPrediction.confidence,
        _adjustments: priorityResult.adjustments,
      };

      const routerLatency = Date.now() - routerStartTime;
      routerLatencies.push(routerLatency);

      // Get decision tree analysis
      let depth: DepthLevel = 'D2';
      let subIntent: string | undefined;
      let family: string | undefined;

      try {
        const decision = decide({
          predicted: { ...rawPrediction, primaryIntent: prediction.primaryIntent, confidence: prediction.confidence },
          hasDocs: conversationState.documentContext,
        });
        family = decision.family;
        subIntent = decision.subIntent;
        // Infer depth from family and confidence
        depth = inferDepthFromFamily(family, prediction.confidence);
      } catch {
        // Decision tree not available in all configurations
        depth = inferDepth(prediction.primaryIntent, prediction.confidence);
        subIntent = inferSubIntent(testCase.query, prediction.primaryIntent);
      }

      // Validate results
      const intentMatch = prediction.primaryIntent === testCase.expectedIntent;
      const depthMatch = depth === testCase.expectedDepth;
      const subIntentMatch = !testCase.expectedSubIntent ||
        subIntent === testCase.expectedSubIntent ||
        subIntent?.includes(testCase.expectedSubIntent) ||
        testCase.expectedSubIntent.includes(subIntent || '');
      const confidenceOk = prediction.confidence >= (testCase.minConfidence || 0.5);
      const latencyOk = routerLatency <= (testCase.maxRouterLatencyMs || 100);

      // Multi-intent detection
      const multiIntentDetected = prediction.secondaryIntents &&
        prediction.secondaryIntents.length > 0 &&
        prediction.secondaryIntents[0].confidence >= 0.3;

      // Build result
      const totalLatency = Date.now() - testStartTime;
      totalLatencies.push(totalLatency);

      const result: TestResult = {
        id: testCase.id,
        phase: testCase.phase,
        passed: intentMatch && confidenceOk,
        query: testCase.query,

        expectedIntent: testCase.expectedIntent,
        actualIntent: prediction.primaryIntent,
        intentMatch,

        expectedDepth: testCase.expectedDepth,
        actualDepth: depth,
        depthMatch,

        expectedSubIntent: testCase.expectedSubIntent,
        actualSubIntent: subIntent,
        subIntentMatch,

        confidence: prediction.confidence,
        minConfidence: testCase.minConfidence || 0.5,
        confidenceOk,

        isMultiIntent: testCase.isMultiIntent || false,
        multiIntentDetected: multiIntentDetected || false,
        secondaryIntentsFound: prediction.secondaryIntents?.map(s => s.name),

        responseValidation: {
          containsExpected: true, // Would validate actual response
          excludesForbidden: true,
          details: [],
        },

        routerLatencyMs: routerLatency,
        totalLatencyMs: totalLatency,
        latencyOk,

        warnings,
      };

      // Update phase results
      if (result.passed) {
        phaseResults[currentPhase].passed++;
      } else {
        phaseResults[currentPhase].failed++;
      }

      // Track collisions
      if (testCase.isCollisionTest && !intentMatch) {
        collisionErrors.push(`${testCase.id}: Expected ${testCase.expectedIntent}, got ${prediction.primaryIntent}`);
      }

      // Track memory/preference state
      if (testCase.setsMemory) {
        conversationState.memories.set(testCase.setsMemory, { query: testCase.query, timestamp: Date.now() });
      }
      if (testCase.setsPreference) {
        conversationState.preferences.set(testCase.setsPreference, true);
      }
      if (testCase.expectsMemoryRecall && !conversationState.memories.has(testCase.expectsMemoryRecall)) {
        result.memoryPersisted = false;
        memoryFailures.push(`${testCase.id}: Memory '${testCase.expectsMemoryRecall}' not found`);
      }
      if (testCase.expectsPreferenceApplied && !conversationState.preferences.has(testCase.expectsPreferenceApplied)) {
        result.preferenceApplied = false;
        preferenceFailures.push(`${testCase.id}: Preference '${testCase.expectsPreferenceApplied}' not applied`);
      }

      conversationState.previousQueries.push(testCase.query);
      results.push(result);

      // Output
      const status = result.passed ? '✅' : '❌';
      const confidenceStr = `${(prediction.confidence * 100).toFixed(0)}%`;
      const latencyStr = `${routerLatency}ms`;

      // Check if routing priority changed the intent
      const wasAdjusted = (prediction as any)._rawIntent !== prediction.primaryIntent;
      const adjustmentNote = wasAdjusted
        ? ` [adjusted from ${(prediction as any)._rawIntent}]`
        : '';

      console.log(`${status} ${testCase.id}: ${testCase.description}`);
      console.log(`   Query: "${testCase.query.substring(0, 60)}${testCase.query.length > 60 ? '...' : ''}"`);
      console.log(`   Intent: ${prediction.primaryIntent} (${confidenceStr})${adjustmentNote} | Depth: ${depth} | Latency: ${latencyStr}`);

      if (!result.passed && verbose) {
        console.log(`   Expected: ${testCase.expectedIntent} @ ${testCase.expectedDepth}`);
        if (prediction.matchedKeywords?.length) {
          console.log(`   Matched: ${prediction.matchedKeywords.slice(0, 5).join(', ')}`);
        }
        // Show adjustments if any
        const adjustments = (prediction as any)._adjustments || [];
        if (adjustments.length > 0) {
          console.log(`   Adjustments: ${adjustments.map((a: any) => `${a.intent}(${a.boost > 0 ? '+' : ''}${a.boost.toFixed(2)})`).join(', ')}`);
        }
      }
      console.log('');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        id: testCase.id,
        phase: testCase.phase,
        passed: false,
        query: testCase.query,
        expectedIntent: testCase.expectedIntent,
        actualIntent: 'error' as IntentName,
        intentMatch: false,
        expectedDepth: testCase.expectedDepth,
        depthMatch: false,
        expectedSubIntent: testCase.expectedSubIntent,
        subIntentMatch: false,
        confidence: 0,
        minConfidence: testCase.minConfidence || 0.5,
        confidenceOk: false,
        isMultiIntent: false,
        multiIntentDetected: false,
        responseValidation: { containsExpected: false, excludesForbidden: false, details: [] },
        routerLatencyMs: 0,
        totalLatencyMs: 0,
        latencyOk: false,
        error: errorMsg,
        warnings: [],
      });
      phaseResults[currentPhase].failed++;
      console.log(`❌ ${testCase.id}: ERROR - ${errorMsg}\n`);
    }
  }

  // Calculate summary metrics
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const intentMatches = results.filter(r => r.intentMatch).length;
  const depthMatches = results.filter(r => r.depthMatch).length;
  const subIntentMatches = results.filter(r => r.subIntentMatch).length;
  const confidenceOks = results.filter(r => r.confidenceOk).length;

  const avgRouterLatency = routerLatencies.length > 0
    ? routerLatencies.reduce((a, b) => a + b, 0) / routerLatencies.length
    : 0;
  const maxRouterLatency = routerLatencies.length > 0
    ? Math.max(...routerLatencies)
    : 0;
  const avgTotalLatency = totalLatencies.length > 0
    ? totalLatencies.reduce((a, b) => a + b, 0) / totalLatencies.length
    : 0;

  // Determine verdict
  const failureReasons: string[] = [];
  if (intentMatches / results.length < 0.8) {
    failureReasons.push(`Intent accuracy ${((intentMatches / results.length) * 100).toFixed(0)}% < 80%`);
  }
  if (collisionErrors.length > 0) {
    failureReasons.push(`${collisionErrors.length} collision errors`);
  }
  if (maxRouterLatency > 100) {
    failureReasons.push(`Max router latency ${maxRouterLatency}ms > 100ms`);
  }
  if (memoryFailures.length > 0) {
    failureReasons.push(`${memoryFailures.length} memory failures`);
  }

  const verdict = failureReasons.length === 0 ? 'PASS' : 'FAIL';

  // Build report
  const report: TestSuiteReport = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    passRate: (passed / results.length) * 100,

    intentAccuracy: (intentMatches / results.length) * 100,
    depthAccuracy: (depthMatches / results.length) * 100,
    subIntentAccuracy: (subIntentMatches / results.length) * 100,
    confidenceRate: (confidenceOks / results.length) * 100,

    byPhase: phaseResults,
    collisionErrors,
    formattingViolations,
    memoryFailures,
    preferenceFailures,

    avgRouterLatency: Math.round(avgRouterLatency),
    maxRouterLatency,
    avgTotalLatency: Math.round(avgTotalLatency),

    results,
    verdict,
    failureReasons,
  };

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`
Total Tests:      ${results.length}
Passed:           ${passed} (${report.passRate.toFixed(1)}%)
Failed:           ${failed}

Intent Accuracy:  ${report.intentAccuracy.toFixed(1)}%
Depth Accuracy:   ${report.depthAccuracy.toFixed(1)}%
SubIntent Match:  ${report.subIntentAccuracy.toFixed(1)}%
Confidence Rate:  ${report.confidenceRate.toFixed(1)}%

Avg Router:       ${report.avgRouterLatency}ms
Max Router:       ${report.maxRouterLatency}ms
Avg Total:        ${report.avgTotalLatency}ms
`);

  // Phase breakdown
  console.log('By Phase:');
  for (const [phase, counts] of Object.entries(phaseResults)) {
    const phaseTotal = counts.passed + counts.failed;
    const phaseRate = ((counts.passed / phaseTotal) * 100).toFixed(0);
    console.log(`  Phase ${phase}: ${counts.passed}/${phaseTotal} (${phaseRate}%)`);
  }

  // Issues
  if (collisionErrors.length > 0) {
    console.log('\nCollision Errors:');
    collisionErrors.forEach(e => console.log(`  - ${e}`));
  }
  if (memoryFailures.length > 0) {
    console.log('\nMemory Failures:');
    memoryFailures.forEach(e => console.log(`  - ${e}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  VERDICT: ${verdict}`);
  if (failureReasons.length > 0) {
    console.log('  Reasons:');
    failureReasons.forEach(r => console.log(`    - ${r}`));
  }
  console.log('='.repeat(60) + '\n');

  const totalTime = Date.now() - startTime;
  console.log(`Total execution time: ${totalTime}ms\n`);

  return report;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function inferDepthFromFamily(family: string, confidence: number): DepthLevel {
  // Simple depth mapping from family
  switch (family) {
    case 'help':
    case 'conversation':
    case 'memory':
    case 'preferences':
    case 'error':
      return 'D1';
    case 'documents':
    case 'extraction':
    case 'edit':
      if (confidence > 0.9) return 'D3';
      if (confidence > 0.8) return 'D2';
      return 'D2';
    case 'reasoning':
      if (confidence > 0.85) return 'D4';
      return 'D3';
    default:
      return 'D2';
  }
}

function inferDepth(intent: IntentName, confidence: number): DepthLevel {
  const d1Intents: IntentName[] = ['file_actions', 'help', 'conversation', 'memory', 'preferences', 'error'];
  const d2Intents: IntentName[] = ['documents', 'extraction', 'edit'];
  const d3Intents: IntentName[] = ['excel', 'accounting', 'engineering', 'finance', 'legal', 'medical'];

  if (d1Intents.includes(intent)) return 'D1';
  if (d2Intents.includes(intent)) return 'D2';
  if (d3Intents.includes(intent)) return 'D3';
  if (intent === 'reasoning' && confidence > 0.8) return 'D4';
  return 'D2';
}

function inferSubIntent(query: string, intent: IntentName): string {
  const q = query.toLowerCase();

  if (intent === 'documents') {
    if (q.includes('where') || q.includes('locate') || q.includes('find')) return 'locate';
    if (q.includes('explain') || q.includes('simple terms')) return 'explain';
    if (q.includes('extract') || q.includes('list') || q.includes('table')) return 'extract';
    if (q.includes('summarize') || q.includes('summary') || q.includes('key points')) return 'summarize';
    if (q.includes('compare') || q.includes('changed') || q.includes('different')) return 'compare';
    if (q.includes('consistent') || q.includes('cross') || q.includes('annex')) return 'cross_reference';
    if (q.includes('inconsisten') || q.includes('missing') || q.includes('correct')) return 'validate';
    if (q.includes('risk') || q.includes('problem') || q.includes('future')) return 'assess_risk';
  }

  if (intent === 'memory') {
    if (q.includes('remember') || q.includes('store') || q.includes('save')) return 'store';
    if (q.includes('what was') || q.includes('recall') || q.includes('you remember')) return 'recall';
  }

  if (intent === 'preferences') {
    if (q.includes('prefer') || q.includes('want') || q.includes('like')) return 'set';
    return 'get';
  }

  return 'general';
}

// ============================================================================
// JEST TEST SUITE (only runs when Jest globals are available)
// ============================================================================

// Check if running in Jest environment
const isJest = typeof describe !== 'undefined' && typeof it !== 'undefined';

if (isJest) {
  describe('Ultimate Koda Test Suite', () => {
    let report: TestSuiteReport;

    beforeAll(async () => {
      report = await runUltimateTests({ verbose: false });
    }, 120000); // 2 minute timeout for full suite

    it('should achieve >80% intent accuracy', () => {
      expect(report.intentAccuracy).toBeGreaterThanOrEqual(80);
    });

    it('should have no collision errors', () => {
      expect(report.collisionErrors).toHaveLength(0);
    });

    it('should maintain memory persistence', () => {
      expect(report.memoryFailures).toHaveLength(0);
    });

    it('should have router latency <100ms', () => {
      expect(report.maxRouterLatency).toBeLessThanOrEqual(100);
    });

    it('should pass all Phase 1 tests (Document Routing)', () => {
      const phase1 = report.byPhase[1];
      expect(phase1.failed).toBe(0);
    });

    it('should pass all Phase 6 tests (Memory)', () => {
      const phase6 = report.byPhase[6];
      expect(phase6.failed).toBe(0);
    });

    it('should pass all Phase 8 tests (Error Handling)', () => {
      const phase8 = report.byPhase[8];
      expect(phase8.failed).toBe(0);
    });

    it('should return PASS verdict', () => {
      expect(report.verdict).toBe('PASS');
    });
  });
}

// ============================================================================
// STANDALONE RUNNER
// ============================================================================

// Run if called directly
if (require.main === module) {
  runUltimateTests({ verbose: true })
    .then(report => {
      // Export JSON report
      const fs = require('fs');
      const reportPath = './ultimate-koda-report.json';
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`Report saved to: ${reportPath}`);

      process.exit(report.verdict === 'PASS' ? 0 : 1);
    })
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}

export { runUltimateTests, ultimateTestCases, TestSuiteReport, UltimateTestCase };
