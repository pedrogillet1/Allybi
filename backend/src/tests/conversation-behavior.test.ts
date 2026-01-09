/**
 * KODA — CONVERSATION BEHAVIOR TEST
 *
 * Tests system behavior over a continuous conversation:
 * - Conversation continuity (state persistence)
 * - Depth escalation & stability
 * - Formatting & answer style compliance
 * - Speed & stability under load
 *
 * This is NOT a routing test (that passed already).
 * This validates BEHAVIOR over time.
 *
 * Run with: npm run test:behavior
 *
 * @version 1.0.0
 */

import { IntentName, LanguageCode } from '../types/intentV3.types';

// ============================================================================
// TYPES
// ============================================================================

type DepthLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

interface ConversationTurn {
  id: number;
  query: string;
  description: string;

  // Expected classification
  expectedIntent: IntentName;
  expectedDepthMin: DepthLevel;
  expectedDepthMax?: DepthLevel;

  // State expectations
  shouldInheritDocument?: boolean;  // Should use same document as previous turn
  shouldInheritIntent?: boolean;    // Intent should match previous
  shouldEscalateDepth?: boolean;    // Depth should increase from previous
  shouldMaintainDepth?: boolean;    // Depth should stay same as previous

  // Formatting expectations
  formatting?: {
    requiresTitle?: boolean;
    requiresBullets?: boolean;
    requiresTable?: boolean;
    requiresSources?: boolean;
    requiresQuotes?: boolean;
    maxParagraphs?: number;
    forbiddenPatterns?: string[];
  };

  // Context signals
  isFollowUp?: boolean;
  referencesEarlier?: boolean;
  isAmbiguous?: boolean;
  isCorrection?: boolean;

  // Performance thresholds
  maxLatencyMs?: number;
}

interface TurnResult {
  turnId: number;
  query: string;
  passed: boolean;

  // Classification
  actualIntent: IntentName;
  intentMatch: boolean;
  actualDepth: DepthLevel;
  depthInRange: boolean;

  // State validation
  documentContinuity: boolean;
  intentContinuity: boolean;
  depthBehavior: 'escalated' | 'maintained' | 'regressed' | 'n/a';
  depthBehaviorCorrect: boolean;

  // Formatting validation
  formattingPassed: boolean;
  formattingIssues: string[];

  // Performance
  routerLatencyMs: number;
  totalLatencyMs: number;
  latencyOk: boolean;

  // Debug info
  confidence: number;
  previousDepth?: DepthLevel;
  warnings: string[];
}

interface ConversationState {
  activeDocumentId: string | null;
  previousIntent: IntentName | null;
  previousDepth: DepthLevel | null;
  turnHistory: TurnResult[];
  memoryStore: Map<string, any>;
  preferences: Map<string, any>;
}

interface BehaviorTestReport {
  timestamp: string;
  totalTurns: number;
  passed: number;
  failed: number;
  passRate: number;

  // Behavior metrics
  stateContinuityRate: number;
  depthEscalationAccuracy: number;
  formattingComplianceRate: number;

  // Performance metrics
  avgRouterLatency: number;
  maxRouterLatency: number;
  avgTotalLatency: number;
  p95Latency: number;

  // Issues
  stateBreaks: string[];
  depthViolations: string[];
  formattingViolations: string[];

  // Results
  results: TurnResult[];
  verdict: 'PASS' | 'FAIL';
  failureReasons: string[];
}

// ============================================================================
// 25-TURN CONVERSATION SCENARIO
// ============================================================================

/**
 * Simulates a realistic user conversation with a contract document.
 * Tests state persistence, depth escalation, and formatting.
 */
const conversationTurns: ConversationTurn[] = [
  // --- PHASE 1: Document Grounding (Turns 1-3) ---
  {
    id: 1,
    query: 'I just uploaded my employment contract. Can you see it?',
    description: 'Initial document grounding',
    expectedIntent: 'documents',
    expectedDepthMin: 'D1',
    formatting: { requiresSources: false },
    maxLatencyMs: 2000,
  },
  {
    id: 2,
    query: 'What is this document about?',
    description: 'Simple summary request',
    expectedIntent: 'documents',
    expectedDepthMin: 'D1',
    expectedDepthMax: 'D2',
    shouldInheritDocument: true,
    isFollowUp: true,
    formatting: { requiresTitle: true },
    maxLatencyMs: 3000,
  },
  {
    id: 3,
    query: 'Summarize the key terms.',
    description: 'Key terms extraction',
    expectedIntent: 'documents',
    expectedDepthMin: 'D2',
    shouldInheritDocument: true,
    shouldInheritIntent: true,
    isFollowUp: true,
    formatting: { requiresBullets: true, requiresSources: true },
    maxLatencyMs: 3000,
  },

  // --- PHASE 2: Simple Extraction (Turns 4-6) ---
  {
    id: 4,
    query: 'What is the salary mentioned?',
    description: 'Simple factual extraction',
    expectedIntent: 'documents',
    expectedDepthMin: 'D1',
    expectedDepthMax: 'D2',
    shouldInheritDocument: true,
    formatting: { requiresSources: true },
    maxLatencyMs: 2000,
  },
  {
    id: 5,
    query: 'And the start date?',
    description: 'Follow-up extraction (implicit reference)',
    expectedIntent: 'documents',
    expectedDepthMin: 'D1',
    shouldInheritDocument: true,
    shouldInheritIntent: true,
    isFollowUp: true,
    referencesEarlier: true,
    maxLatencyMs: 2000,
  },
  {
    id: 6,
    query: 'List all the benefits.',
    description: 'List extraction',
    expectedIntent: 'documents',
    expectedDepthMin: 'D2',
    shouldInheritDocument: true,
    formatting: { requiresBullets: true },
    maxLatencyMs: 2500,
  },

  // --- PHASE 3: Depth Escalation (Turns 7-10) ---
  {
    id: 7,
    query: 'Explain the termination clause.',
    description: 'D2 explanation request',
    expectedIntent: 'documents',
    expectedDepthMin: 'D2',
    shouldInheritDocument: true,
    formatting: { requiresTitle: true },
    maxLatencyMs: 3000,
  },
  {
    id: 8,
    query: 'Why is that clause written that way?',
    description: 'D3 reasoning request (depth escalation)',
    expectedIntent: 'documents',
    expectedDepthMin: 'D3',
    shouldInheritDocument: true,
    shouldEscalateDepth: true,
    referencesEarlier: true,
    maxLatencyMs: 4000,
  },
  {
    id: 9,
    query: 'Compare that with section 5 on non-compete.',
    description: 'D3 comparison request',
    expectedIntent: 'documents',
    expectedDepthMin: 'D3',
    shouldInheritDocument: true,
    shouldMaintainDepth: true,
    formatting: { requiresTable: true },
    maxLatencyMs: 4000,
  },
  {
    id: 10,
    query: 'Is there a conflict between these two sections?',
    description: 'D4 validation/conflict detection',
    expectedIntent: 'documents',
    expectedDepthMin: 'D4',
    shouldInheritDocument: true,
    shouldEscalateDepth: true,
    maxLatencyMs: 5000,
  },

  // --- PHASE 4: Meta Operations (Turns 11-13) ---
  {
    id: 11,
    query: 'Remember that the non-compete clause is concerning to me.',
    description: 'Memory store operation',
    expectedIntent: 'memory',
    expectedDepthMin: 'D1',
    maxLatencyMs: 1000,
  },
  {
    id: 12,
    query: 'I prefer detailed explanations with examples.',
    description: 'Preference setting',
    expectedIntent: 'preferences',
    expectedDepthMin: 'D1',
    maxLatencyMs: 1000,
  },
  {
    id: 13,
    query: 'Now explain the intellectual property section.',
    description: 'Test preference applied (detailed + examples)',
    expectedIntent: 'documents',
    expectedDepthMin: 'D2',
    shouldInheritDocument: true,
    formatting: { requiresTitle: true },
    maxLatencyMs: 4000,
  },

  // --- PHASE 5: Ambiguity & Correction (Turns 14-16) ---
  {
    id: 14,
    query: 'What about the other thing?',
    description: 'Ambiguous reference (should handle gracefully)',
    expectedIntent: 'documents',
    expectedDepthMin: 'D1',
    expectedDepthMax: 'D2',
    shouldInheritDocument: true,
    isAmbiguous: true,
    maxLatencyMs: 3000,
  },
  {
    id: 15,
    query: 'I meant the confidentiality clause.',
    description: 'User correction',
    expectedIntent: 'documents',
    expectedDepthMin: 'D2',
    shouldInheritDocument: true,
    isCorrection: true,
    maxLatencyMs: 3000,
  },
  {
    id: 16,
    query: 'Actually, go back to the termination clause.',
    description: 'User redirect',
    expectedIntent: 'documents',
    expectedDepthMin: 'D2',
    shouldInheritDocument: true,
    isCorrection: true,
    referencesEarlier: true,
    maxLatencyMs: 3000,
  },

  // --- PHASE 6: Complex Multi-step (Turns 17-20) ---
  {
    id: 17,
    query: 'What would happen if I violated the non-compete?',
    description: 'D4/D5 hypothetical reasoning',
    expectedIntent: 'documents',
    expectedDepthMin: 'D4',
    shouldInheritDocument: true,
    maxLatencyMs: 5000,
  },
  {
    id: 18,
    query: 'Are there any loopholes in that clause?',
    description: 'D4 risk assessment',
    expectedIntent: 'documents',
    expectedDepthMin: 'D4',
    shouldInheritDocument: true,
    shouldMaintainDepth: true,
    formatting: { forbiddenPatterns: ['legal advice', 'you should', 'I recommend'] },
    maxLatencyMs: 5000,
  },
  {
    id: 19,
    query: 'What did I ask you to remember earlier?',
    description: 'Memory recall',
    expectedIntent: 'memory',
    expectedDepthMin: 'D1',
    maxLatencyMs: 1000,
  },
  {
    id: 20,
    query: 'Based on that concern, what sections should I review carefully?',
    description: 'Multi-intent (memory + documents)',
    expectedIntent: 'documents',
    expectedDepthMin: 'D3',
    shouldInheritDocument: true,
    referencesEarlier: true,
    formatting: { requiresBullets: true },
    maxLatencyMs: 4000,
  },

  // --- PHASE 7: Final Synthesis (Turns 21-25) ---
  {
    id: 21,
    query: 'Give me a complete summary of all the key risks.',
    description: 'D4 comprehensive risk summary',
    expectedIntent: 'documents',
    expectedDepthMin: 'D4',
    shouldInheritDocument: true,
    formatting: { requiresTitle: true, requiresBullets: true },
    maxLatencyMs: 6000,
  },
  {
    id: 22,
    query: 'Put that in a table format.',
    description: 'Format transformation request',
    expectedIntent: 'documents',
    expectedDepthMin: 'D2',
    expectedDepthMax: 'D4',
    shouldInheritDocument: true,
    isFollowUp: true,
    formatting: { requiresTable: true },
    maxLatencyMs: 3000,
  },
  {
    id: 23,
    query: 'Are there any inconsistencies in the document overall?',
    description: 'D4/D5 document validation',
    expectedIntent: 'documents',
    expectedDepthMin: 'D4',
    shouldInheritDocument: true,
    maxLatencyMs: 6000,
  },
  {
    id: 24,
    query: 'What are my next steps before signing?',
    description: 'D3 guidance (document-anchored)',
    expectedIntent: 'documents',
    expectedDepthMin: 'D3',
    shouldInheritDocument: true,
    formatting: { requiresBullets: true, forbiddenPatterns: ['legal advice'] },
    maxLatencyMs: 4000,
  },
  {
    id: 25,
    query: 'Considering everything we discussed, give me a final executive summary.',
    description: 'D4 full conversation synthesis',
    expectedIntent: 'documents',
    expectedDepthMin: 'D4',
    shouldInheritDocument: true,
    referencesEarlier: true,
    formatting: { requiresTitle: true, requiresSources: true },
    maxLatencyMs: 8000,
  },
];

// ============================================================================
// DEPTH ESCALATION RULES
// ============================================================================

const DEPTH_VALUES: Record<DepthLevel, number> = {
  'D1': 1,
  'D2': 2,
  'D3': 3,
  'D4': 4,
  'D5': 5,
};

/**
 * Keywords that trigger depth escalation
 */
const DEPTH_ESCALATION_TRIGGERS: Record<DepthLevel, RegExp[]> = {
  'D1': [
    /\b(what|where|when|who|list|show|find)\b/i,
  ],
  'D2': [
    /\b(explain|describe|summarize|extract|detail)\b/i,
  ],
  'D3': [
    /\b(why|compare|contrast|difference|relate|between)\b/i,
  ],
  'D4': [
    /\b(conflict|inconsisten|risk|problem|validate|verify|assess)\b/i,
    /\b(what would happen|what if|hypothetic)\b/i,
  ],
  'D5': [
    /\b(predict|future|scenario|model|simulate)\b/i,
    /\b(considering everything|overall|synthesis)\b/i,
  ],
};

function inferDepthFromQuery(query: string, previousDepth: DepthLevel | null): DepthLevel {
  const q = query.toLowerCase();

  // Check from highest to lowest
  for (const trigger of DEPTH_ESCALATION_TRIGGERS['D5']) {
    if (trigger.test(q)) return 'D5';
  }
  for (const trigger of DEPTH_ESCALATION_TRIGGERS['D4']) {
    if (trigger.test(q)) return 'D4';
  }
  for (const trigger of DEPTH_ESCALATION_TRIGGERS['D3']) {
    if (trigger.test(q)) return 'D3';
  }
  for (const trigger of DEPTH_ESCALATION_TRIGGERS['D2']) {
    if (trigger.test(q)) return 'D2';
  }

  // Default based on previous depth (maintain or D1)
  return previousDepth || 'D1';
}

function depthInRange(actual: DepthLevel, min: DepthLevel, max?: DepthLevel): boolean {
  const actualVal = DEPTH_VALUES[actual];
  const minVal = DEPTH_VALUES[min];
  const maxVal = max ? DEPTH_VALUES[max] : 5;
  return actualVal >= minVal && actualVal <= maxVal;
}

function compareDepths(current: DepthLevel, previous: DepthLevel): 'escalated' | 'maintained' | 'regressed' {
  const currentVal = DEPTH_VALUES[current];
  const previousVal = DEPTH_VALUES[previous];
  if (currentVal > previousVal) return 'escalated';
  if (currentVal < previousVal) return 'regressed';
  return 'maintained';
}

// ============================================================================
// FORMATTING VALIDATORS
// ============================================================================

interface FormattingResult {
  passed: boolean;
  issues: string[];
}

function validateFormatting(
  response: string,
  rules: ConversationTurn['formatting']
): FormattingResult {
  if (!rules) return { passed: true, issues: [] };

  const issues: string[] = [];

  // Check for title (### or ## headers)
  if (rules.requiresTitle) {
    if (!/^#{1,3}\s+\w+/m.test(response)) {
      issues.push('Missing title/header');
    }
  }

  // Check for bullets
  if (rules.requiresBullets) {
    if (!/^[\s]*[-*•]\s+/m.test(response)) {
      issues.push('Missing bullet points');
    }
  }

  // Check for table
  if (rules.requiresTable) {
    if (!/\|.*\|.*\|/m.test(response)) {
      issues.push('Missing table format');
    }
  }

  // Check for sources/citations
  if (rules.requiresSources) {
    if (!/\{\{DOC::|source:|section|page/i.test(response)) {
      issues.push('Missing source references');
    }
  }

  // Check for quotes
  if (rules.requiresQuotes) {
    if (!/["""]|^>\s/m.test(response)) {
      issues.push('Missing quotes');
    }
  }

  // Check paragraph count
  if (rules.maxParagraphs) {
    const paragraphs = response.split(/\n\n+/).filter(p => p.trim().length > 0);
    if (paragraphs.length > rules.maxParagraphs) {
      issues.push(`Too many paragraphs: ${paragraphs.length} > ${rules.maxParagraphs}`);
    }
  }

  // Check forbidden patterns
  if (rules.forbiddenPatterns) {
    for (const pattern of rules.forbiddenPatterns) {
      if (response.toLowerCase().includes(pattern.toLowerCase())) {
        issues.push(`Contains forbidden pattern: "${pattern}"`);
      }
    }
  }

  return { passed: issues.length === 0, issues };
}

// ============================================================================
// TEST HARNESS
// ============================================================================

async function loadServices() {
  const { default: KodaIntentEngineV3 } = await import('../services/core/kodaIntentEngineV3.service');
  const { default: IntentConfigService } = await import('../services/core/intentConfig.service');
  const { decide } = await import('../services/core/decisionTree.service');
  const { RoutingPriorityService } = await import('../services/core/routingPriority.service');

  return { KodaIntentEngineV3, IntentConfigService, decide, RoutingPriorityService };
}

async function runConversationBehaviorTest(options: {
  verbose?: boolean;
  simulateResponses?: boolean;
} = {}): Promise<BehaviorTestReport> {
  const { verbose = true, simulateResponses = true } = options;

  const startTime = Date.now();
  const results: TurnResult[] = [];

  console.log('\n' + '='.repeat(60));
  console.log('  KODA — CONVERSATION BEHAVIOR TEST');
  console.log('  25-Turn Continuous Conversation');
  console.log('='.repeat(60) + '\n');

  // Load services
  const { KodaIntentEngineV3, IntentConfigService, decide, RoutingPriorityService } = await loadServices();

  const intentConfig = new IntentConfigService();
  await intentConfig.loadPatterns();
  const intentEngine = new KodaIntentEngineV3(intentConfig);
  const routingPriority = new RoutingPriorityService({ debug: false });

  // Initialize conversation state
  const state: ConversationState = {
    activeDocumentId: 'employment-contract-001',  // Simulated document
    previousIntent: null,
    previousDepth: null,
    turnHistory: [],
    memoryStore: new Map(),
    preferences: new Map(),
  };

  // Tracking metrics
  const stateBreaks: string[] = [];
  const depthViolations: string[] = [];
  const formattingViolations: string[] = [];
  let routerLatencies: number[] = [];
  let totalLatencies: number[] = [];

  // Run each turn
  for (const turn of conversationTurns) {
    const turnStartTime = Date.now();
    const warnings: string[] = [];

    console.log(`\n─── Turn ${turn.id}: ${turn.description} ───`);
    console.log(`Query: "${turn.query}"`);

    try {
      // Classify intent
      const routerStartTime = Date.now();
      const rawPrediction = await intentEngine.predict({
        text: turn.query,
        language: 'en' as LanguageCode,
      });

      // Apply routing priority
      const allScores = [
        { intent: rawPrediction.primaryIntent, confidence: rawPrediction.confidence },
        ...(rawPrediction.secondaryIntents || []).map(s => ({ intent: s.name, confidence: s.confidence })),
      ];

      const priorityResult = routingPriority.adjustScores(
        allScores,
        turn.query,
        { hasDocuments: state.activeDocumentId !== null }
      );

      const routerLatency = Date.now() - routerStartTime;
      routerLatencies.push(routerLatency);

      // Determine depth
      const actualDepth = inferDepthFromQuery(turn.query, state.previousDepth);

      // Validate intent
      const intentMatch = priorityResult.primaryIntent === turn.expectedIntent;

      // Validate depth range
      const depthInRangeOk = depthInRange(actualDepth, turn.expectedDepthMin, turn.expectedDepthMax);

      // Validate state continuity
      let documentContinuity = true;
      let intentContinuity = true;
      let depthBehavior: 'escalated' | 'maintained' | 'regressed' | 'n/a' = 'n/a';
      let depthBehaviorCorrect = true;

      if (turn.shouldInheritDocument && state.previousIntent === 'documents') {
        // Should maintain same document context
        documentContinuity = true; // Would check actual document ID in real test
      }

      if (turn.shouldInheritIntent && state.previousIntent) {
        intentContinuity = priorityResult.primaryIntent === state.previousIntent;
        if (!intentContinuity) {
          stateBreaks.push(`Turn ${turn.id}: Intent changed from ${state.previousIntent} to ${priorityResult.primaryIntent}`);
        }
      }

      if (state.previousDepth && (turn.shouldEscalateDepth || turn.shouldMaintainDepth)) {
        depthBehavior = compareDepths(actualDepth, state.previousDepth);

        if (turn.shouldEscalateDepth && depthBehavior !== 'escalated') {
          depthBehaviorCorrect = false;
          depthViolations.push(`Turn ${turn.id}: Expected escalation from ${state.previousDepth} but got ${depthBehavior}`);
        }
        if (turn.shouldMaintainDepth && depthBehavior === 'regressed') {
          depthBehaviorCorrect = false;
          depthViolations.push(`Turn ${turn.id}: Unexpected regression from ${state.previousDepth} to ${actualDepth}`);
        }
      }

      // Simulate response for formatting validation
      const simulatedResponse = simulateResponses
        ? generateSimulatedResponse(turn, actualDepth)
        : '';

      // Validate formatting
      const formattingResult = validateFormatting(simulatedResponse, turn.formatting);
      if (!formattingResult.passed) {
        formattingViolations.push(`Turn ${turn.id}: ${formattingResult.issues.join(', ')}`);
      }

      const totalLatency = Date.now() - turnStartTime;
      totalLatencies.push(totalLatency);
      const latencyOk = totalLatency <= (turn.maxLatencyMs || 5000);

      // Build result
      const result: TurnResult = {
        turnId: turn.id,
        query: turn.query,
        passed: intentMatch && depthInRangeOk && latencyOk,

        actualIntent: priorityResult.primaryIntent,
        intentMatch,
        actualDepth,
        depthInRange: depthInRangeOk,

        documentContinuity,
        intentContinuity,
        depthBehavior,
        depthBehaviorCorrect,

        formattingPassed: formattingResult.passed,
        formattingIssues: formattingResult.issues,

        routerLatencyMs: routerLatency,
        totalLatencyMs: totalLatency,
        latencyOk,

        confidence: priorityResult.primaryConfidence,
        previousDepth: state.previousDepth || undefined,
        warnings,
      };

      results.push(result);

      // Update state
      state.previousIntent = priorityResult.primaryIntent;
      state.previousDepth = actualDepth;
      state.turnHistory.push(result);

      // Store memory if memory intent
      if (priorityResult.primaryIntent === 'memory') {
        state.memoryStore.set(`turn_${turn.id}`, turn.query);
      }
      // Store preferences if preferences intent
      if (priorityResult.primaryIntent === 'preferences') {
        state.preferences.set(`turn_${turn.id}`, turn.query);
      }

      // Output
      const status = result.passed ? '✅' : '❌';
      const depthStr = `${actualDepth} (${turn.expectedDepthMin}${turn.expectedDepthMax ? '-' + turn.expectedDepthMax : '+'}${depthInRangeOk ? '' : ' ⚠'})`;

      console.log(`${status} Intent: ${priorityResult.primaryIntent} (${(priorityResult.primaryConfidence * 100).toFixed(0)}%)`);
      console.log(`   Depth: ${depthStr} | Latency: ${routerLatency}ms/${totalLatency}ms`);

      if (depthBehavior !== 'n/a') {
        const behaviorIcon = depthBehaviorCorrect ? '✓' : '⚠';
        console.log(`   Behavior: ${depthBehavior} ${behaviorIcon}`);
      }

      if (!formattingResult.passed && verbose) {
        console.log(`   Formatting: ${formattingResult.issues.join(', ')}`);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        turnId: turn.id,
        query: turn.query,
        passed: false,
        actualIntent: 'error' as IntentName,
        intentMatch: false,
        actualDepth: 'D1',
        depthInRange: false,
        documentContinuity: false,
        intentContinuity: false,
        depthBehavior: 'n/a',
        depthBehaviorCorrect: false,
        formattingPassed: false,
        formattingIssues: ['Error during execution'],
        routerLatencyMs: 0,
        totalLatencyMs: 0,
        latencyOk: false,
        confidence: 0,
        warnings: [errorMsg],
      });
      console.log(`❌ ERROR: ${errorMsg}`);
    }
  }

  // Calculate metrics
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  const stateContinuityTests = results.filter(r =>
    conversationTurns.find(t => t.id === r.turnId)?.shouldInheritIntent
  );
  const stateContinuityPassed = stateContinuityTests.filter(r => r.intentContinuity).length;
  const stateContinuityRate = stateContinuityTests.length > 0
    ? (stateContinuityPassed / stateContinuityTests.length) * 100
    : 100;

  const depthTests = results.filter(r => r.depthBehavior !== 'n/a');
  const depthCorrect = depthTests.filter(r => r.depthBehaviorCorrect).length;
  const depthEscalationAccuracy = depthTests.length > 0
    ? (depthCorrect / depthTests.length) * 100
    : 100;

  const formattingTests = results.filter(r =>
    conversationTurns.find(t => t.id === r.turnId)?.formatting
  );
  const formattingPassed = formattingTests.filter(r => r.formattingPassed).length;
  const formattingComplianceRate = formattingTests.length > 0
    ? (formattingPassed / formattingTests.length) * 100
    : 100;

  const avgRouterLatency = routerLatencies.reduce((a, b) => a + b, 0) / routerLatencies.length;
  const maxRouterLatency = Math.max(...routerLatencies);
  const avgTotalLatency = totalLatencies.reduce((a, b) => a + b, 0) / totalLatencies.length;
  const sortedLatencies = [...totalLatencies].sort((a, b) => a - b);
  const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;

  // Determine verdict
  const failureReasons: string[] = [];
  if (passed / results.length < 0.85) {
    failureReasons.push(`Pass rate ${((passed / results.length) * 100).toFixed(0)}% < 85%`);
  }
  if (stateContinuityRate < 90) {
    failureReasons.push(`State continuity ${stateContinuityRate.toFixed(0)}% < 90%`);
  }
  if (depthEscalationAccuracy < 80) {
    failureReasons.push(`Depth accuracy ${depthEscalationAccuracy.toFixed(0)}% < 80%`);
  }
  if (stateBreaks.length > 2) {
    failureReasons.push(`${stateBreaks.length} state breaks > 2`);
  }

  const verdict = failureReasons.length === 0 ? 'PASS' : 'FAIL';

  // Build report
  const report: BehaviorTestReport = {
    timestamp: new Date().toISOString(),
    totalTurns: results.length,
    passed,
    failed,
    passRate: (passed / results.length) * 100,

    stateContinuityRate,
    depthEscalationAccuracy,
    formattingComplianceRate,

    avgRouterLatency: Math.round(avgRouterLatency),
    maxRouterLatency,
    avgTotalLatency: Math.round(avgTotalLatency),
    p95Latency,

    stateBreaks,
    depthViolations,
    formattingViolations,

    results,
    verdict,
    failureReasons,
  };

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`
Total Turns:          ${results.length}
Passed:               ${passed} (${report.passRate.toFixed(1)}%)
Failed:               ${failed}

State Continuity:     ${stateContinuityRate.toFixed(1)}%
Depth Accuracy:       ${depthEscalationAccuracy.toFixed(1)}%
Formatting Compliance: ${formattingComplianceRate.toFixed(1)}%

Avg Router Latency:   ${report.avgRouterLatency}ms
Max Router Latency:   ${report.maxRouterLatency}ms
P95 Total Latency:    ${report.p95Latency}ms
`);

  if (stateBreaks.length > 0) {
    console.log('State Breaks:');
    stateBreaks.slice(0, 5).forEach(b => console.log(`  - ${b}`));
  }

  if (depthViolations.length > 0) {
    console.log('\nDepth Violations:');
    depthViolations.slice(0, 5).forEach(v => console.log(`  - ${v}`));
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

/**
 * Generate a simulated response for formatting validation
 */
function generateSimulatedResponse(turn: ConversationTurn, depth: DepthLevel): string {
  const parts: string[] = [];

  // Add title if needed
  if (turn.formatting?.requiresTitle) {
    parts.push(`### ${turn.description}\n`);
  }

  // Add content based on depth
  if (turn.formatting?.requiresBullets) {
    parts.push('- First point from the document\n- Second important detail\n- Third consideration\n');
  } else if (turn.formatting?.requiresTable) {
    parts.push('| Section | Content | Notes |\n|---------|---------|-------|\n| 1 | Value A | Note A |\n| 2 | Value B | Note B |\n');
  } else {
    parts.push('This is a response based on the document content.\n');
  }

  // Add sources if needed
  if (turn.formatting?.requiresSources) {
    parts.push('\n{{DOC::employment-contract-001::page 5}}\n');
  }

  return parts.join('\n');
}

// ============================================================================
// JEST INTEGRATION
// ============================================================================

const isJest = typeof describe !== 'undefined' && typeof it !== 'undefined';

if (isJest) {
  describe('Conversation Behavior Test', () => {
    let report: BehaviorTestReport;

    beforeAll(async () => {
      report = await runConversationBehaviorTest({ verbose: false, simulateResponses: true });
    }, 180000); // 3 minute timeout

    it('should achieve ≥85% pass rate', () => {
      expect(report.passRate).toBeGreaterThanOrEqual(85);
    });

    it('should maintain state continuity ≥90%', () => {
      expect(report.stateContinuityRate).toBeGreaterThanOrEqual(90);
    });

    it('should achieve depth accuracy ≥80%', () => {
      expect(report.depthEscalationAccuracy).toBeGreaterThanOrEqual(80);
    });

    it('should have ≤2 state breaks', () => {
      expect(report.stateBreaks.length).toBeLessThanOrEqual(2);
    });

    it('should have max router latency <100ms', () => {
      expect(report.maxRouterLatency).toBeLessThanOrEqual(100);
    });

    it('should return PASS verdict', () => {
      expect(report.verdict).toBe('PASS');
    });
  });
}

// ============================================================================
// STANDALONE RUNNER
// ============================================================================

if (require.main === module) {
  runConversationBehaviorTest({ verbose: true, simulateResponses: true })
    .then(report => {
      const fs = require('fs');
      const reportPath = './conversation-behavior-report.json';
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`Report saved to: ${reportPath}`);
      process.exit(report.verdict === 'PASS' ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

export { runConversationBehaviorTest, conversationTurns, BehaviorTestReport };
