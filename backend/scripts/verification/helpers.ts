/**
 * Shared helpers for verification scripts
 * Properly initializes services with required dependencies
 */

import { KodaIntentEngineV3 } from '../../src/services/core/kodaIntentEngineV3.service';
import { IntentConfigService } from '../../src/services/core/intentConfig.service';
import { DomainEnforcementService } from '../../src/services/core/domainEnforcement.service';
import { MathOrchestratorService } from '../../src/services/core/mathOrchestrator.service';
import { PredictedIntent, IntentClassificationRequest } from '../../src/types/intentV3.types';

// Cache services to avoid re-initialization
let _intentConfig: IntentConfigService | null = null;
let _intentEngine: KodaIntentEngineV3 | null = null;
let _domainService: DomainEnforcementService | null = null;
let _mathOrchestrator: MathOrchestratorService | null = null;
let _initialized = false;

/**
 * Initialize all services (call once at startup)
 */
export async function initializeServices(): Promise<void> {
  if (_initialized) return;

  const config = getIntentConfig();
  await config.loadPatterns();
  _initialized = true;
}

/**
 * Get or create IntentConfigService
 */
export function getIntentConfig(): IntentConfigService {
  if (!_intentConfig) {
    _intentConfig = new IntentConfigService();
  }
  return _intentConfig;
}

/**
 * Get or create KodaIntentEngineV3
 */
export function getIntentEngine(): KodaIntentEngineV3 {
  if (!_intentEngine) {
    _intentEngine = new KodaIntentEngineV3(getIntentConfig());
  }
  return _intentEngine;
}

/**
 * Get or create DomainEnforcementService
 */
export function getDomainService(): DomainEnforcementService {
  if (!_domainService) {
    _domainService = new DomainEnforcementService();
  }
  return _domainService;
}

/**
 * Get or create MathOrchestratorService
 */
export function getMathOrchestrator(): MathOrchestratorService {
  if (!_mathOrchestrator) {
    _mathOrchestrator = new MathOrchestratorService();
  }
  return _mathOrchestrator;
}

/**
 * Helper to classify intent from query string
 */
export async function classifyIntent(query: string): Promise<PredictedIntent> {
  await initializeServices();
  const engine = getIntentEngine();
  return engine.predict({ text: query });
}

/**
 * Compute depth level based on intent and query
 * Mirrors logic from kodaOrchestratorV3.service.ts
 */
export function computeDepth(intent: string, confidence: number, query: string): { depth: string; reason: string } {
  const scenarioKeywords = /\b(what if|what happens if|scenario|hypothetical|simulate|project|forecast|if.*then)\b/i;
  const comparisonKeywords = /\b(compare|versus|vs\.?|difference between|contrast)\b/i;
  const validationKeywords = /\b(validate|verify|check|audit|review|assess)\b/i;
  const explanationKeywords = /\b(explain|why|how does|what causes)\b/i;

  let baseDepth = 'D2';
  let reason = `Intent: ${intent}`;

  switch (intent) {
    case 'file_actions':
    case 'help':
    case 'conversation':
    case 'memory':
    case 'preferences':
      baseDepth = 'D1';
      reason = `${intent} intent → surface level`;
      break;

    case 'extraction':
    case 'documents':
      baseDepth = 'D2';
      reason = `${intent} intent → data extraction level`;
      break;

    case 'reasoning':
      baseDepth = confidence > 0.8 ? 'D4' : 'D3';
      reason = `Reasoning with confidence ${(confidence * 100).toFixed(0)}%`;
      break;

    case 'accounting':
    case 'engineering':
    case 'finance':
    case 'legal':
    case 'medical':
      baseDepth = 'D3';
      reason = `Domain-specific intent: ${intent}`;
      break;

    default:
      baseDepth = 'D2';
      reason = `Default depth for ${intent}`;
  }

  // Upgrade based on query keywords
  if (scenarioKeywords.test(query)) {
    baseDepth = 'D5';
    reason = `Scenario keyword detected + ${reason}`;
  } else if (validationKeywords.test(query)) {
    const newDepth = Math.max(parseInt(baseDepth[1]), 4);
    baseDepth = `D${Math.min(newDepth, 5)}`;
    reason = `Validation keyword + ${reason}`;
  } else if (comparisonKeywords.test(query)) {
    const newDepth = Math.max(parseInt(baseDepth[1]), 3);
    baseDepth = `D${Math.min(newDepth, 5)}`;
    reason = `Comparison keyword + ${reason}`;
  } else if (explanationKeywords.test(query)) {
    const newDepth = Math.max(parseInt(baseDepth[1]), 2);
    baseDepth = `D${Math.min(newDepth, 5)}`;
    reason = `Explanation keyword + ${reason}`;
  }

  return { depth: baseDepth, reason };
}

/**
 * Determine if RAG is required based on intent
 */
export function requiresRAG(intent: string): boolean {
  const documentIntents = ['documents', 'accounting', 'engineering', 'finance', 'legal', 'medical'];
  return documentIntents.includes(intent) && intent !== 'file_actions';
}

/**
 * Get validation policy key for an intent
 */
export function getValidationPolicyKey(intent: string): string {
  switch (intent) {
    case 'documents':
    case 'file_actions':
    case 'accounting':
    case 'engineering':
    case 'finance':
    case 'legal':
    case 'medical':
      return 'documents.factual';
    case 'extraction':
      return 'extraction.structured';
    case 'reasoning':
      return 'reasoning.analytical';
    case 'help':
      return 'help.guidance';
    case 'conversation':
      return 'conversation.friendly';
    case 'memory':
      return 'memory.recall';
    case 'preferences':
      return 'preferences.confirmation';
    case 'error':
      return 'error.helpful';
    default:
      return 'default';
  }
}

/**
 * Answer style mapping
 */
export const STYLE_MAPPING: Record<string, string> = {
  documents: 'documents.factual',
  file_actions: 'documents.factual',
  accounting: 'documents.factual',
  engineering: 'documents.factual',
  finance: 'documents.factual',
  legal: 'documents.factual',
  medical: 'documents.factual',
  extraction: 'extraction.structured',
  reasoning: 'reasoning.analytical',
  edit: 'edit.suggestion',
  help: 'help.guidance',
  conversation: 'conversation.friendly',
  memory: 'memory.recall',
  preferences: 'preferences.confirmation',
  error: 'error.helpful',
};
