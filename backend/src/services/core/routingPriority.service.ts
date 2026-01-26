/**
 * KODA V3 Routing Priority Service - BANK-DRIVEN VERSION
 *
 * This service applies deterministic routing adjustments using ONLY bank-driven signals.
 * NO hardcoded regex patterns allowed. All pattern matching happens in resolvers/engines
 * which return structured RoutingSignals.
 *
 * Flow:
 *   1. Resolvers detect operator, intent, domain, blockers, followup (from banks)
 *   2. These are packaged as RoutingSignals
 *   3. This service applies routing_rules.any.json to boost/dampen intents
 *   4. Result goes to tiebreakers → decision tree → final selection
 *
 * @version 2.0.0 - Bank-driven refactor (no inline regex)
 */

import { IntentName, PredictedIntent } from '../../types/intentV3.types';
import {
  RoutingSignals,
  RoutingDecision,
  RoutingRule,
  RoutingPolicy,
  Match,
  conditionMatches,
  EMPTY_SIGNALS,
} from './routingSignals';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION (Weights, not patterns)
// ============================================================================

/**
 * Intent-specific minimum confidence thresholds.
 * These are numeric weights, not language patterns.
 */
export const INTENT_CONFIDENCE_FLOORS: Record<IntentName, number> = {
  memory: 0.50,
  preferences: 0.50,
  conversation: 0.45,
  help: 0.50,
  edit: 0.55,
  documents: 0.55,
  extraction: 0.60,
  file_actions: 0.55,
  reasoning: 0.60,
  legal: 0.75,
  medical: 0.75,
  finance: 0.70,
  accounting: 0.70,
  engineering: 0.65,
  excel: 0.60,
  doc_stats: 0.55,
  error: 0.30,
};

// ============================================================================
// TYPES
// ============================================================================

export interface IntentScore {
  intent: IntentName;
  confidence: number;
  matchedPatternIds?: string[];
}

export interface RoutingContext {
  hasDocuments: boolean;
  hasConversationHistory?: boolean;
  turnCount?: number;
  lastDocIds?: string[];
  lastIntent?: IntentName;
  lastOperator?: string;
}

export interface RoutingAdjustment {
  intent: IntentName;
  originalConfidence: number;
  adjustedConfidence: number;
  boost: number;
  reason: string;
  ruleId?: string;
}

export interface RoutingPriorityResult {
  adjustedScores: IntentScore[];
  adjustments: RoutingAdjustment[];
  originalPrimary: IntentName;
  newPrimary: IntentName;
  debug: {
    signalsUsed: string[];
    rulesApplied: string[];
  };
}

// ============================================================================
// BANK LOADER
// ============================================================================

let routingRulesBank: RoutingPolicy | null = null;

function loadRoutingRules(): RoutingPolicy {
  if (routingRulesBank) return routingRulesBank;

  const bankPath = path.join(
    __dirname,
    '../../data_banks/routing/routing_rules.any.json'
  );

  try {
    const raw = fs.readFileSync(bankPath, 'utf-8');
    routingRulesBank = JSON.parse(raw) as RoutingPolicy;
    console.log(
      `[RoutingPriority] Loaded ${routingRulesBank.rules.length} routing rules from bank`
    );
    return routingRulesBank;
  } catch (err) {
    console.error(`[RoutingPriority] Failed to load routing rules bank:`, err);
    // Return empty policy on failure
    return {
      _meta: { bank: 'routing_rules', version: '1.0.0', description: 'fallback' },
      rules: [],
    };
  }
}

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

export class RoutingPriorityService {
  private readonly logger: Console;
  private readonly debugMode: boolean;

  constructor(options?: { logger?: Console; debug?: boolean }) {
    this.logger = options?.logger || console;
    this.debugMode = options?.debug || process.env.ROUTING_DEBUG === 'true';
  }

  /**
   * Apply routing priority adjustments using ONLY bank-driven signals.
   *
   * This method does NOT parse the query. It expects structured signals
   * from the resolver/engine layer.
   *
   * @param scores - Array of intent scores from the engine
   * @param signals - Structured routing signals from resolvers
   * @param context - Routing context (has documents, etc.)
   * @returns Adjusted scores with boost/dampening applied
   */
  adjustScoresWithSignals(
    scores: IntentScore[],
    signals: RoutingSignals,
    context: RoutingContext
  ): RoutingPriorityResult {
    const adjustments: RoutingAdjustment[] = [];
    const rulesApplied: string[] = [];
    const signalsUsed: string[] = [];

    // Find original primary intent
    const sortedOriginal = [...scores].sort((a, b) => b.confidence - a.confidence);
    const originalPrimary = sortedOriginal[0]?.intent || 'error';

    // Load routing rules from bank
    const policy = loadRoutingRules();

    // Build adjusted scores map
    const scoreMap = new Map<IntentName, number>();
    for (const score of scores) {
      scoreMap.set(score.intent, score.confidence);
    }

    // Track which signals are in use
    if (signals.operator.score > 0) signalsUsed.push(`operator:${signals.operator.name}`);
    if (signals.domain?.score) signalsUsed.push(`domain:${signals.domain.name}`);
    if (signals.scope?.mode !== 'none') signalsUsed.push(`scope:${signals.scope?.mode}`);
    if (signals.contentGuard) signalsUsed.push('contentGuard:true');
    if (signals.followup.isFollowup) signalsUsed.push('followup:true');
    Object.entries(signals.blockers).forEach(([k, v]) => {
      if (v) signalsUsed.push(`blocker:${k}`);
    });

    // Merge context into signals memory
    const mergedSignals: RoutingSignals = {
      ...signals,
      memory: {
        ...signals.memory,
        hasLastDoc: context.hasDocuments || signals.memory.hasLastDoc,
        lastIntent: context.lastIntent || signals.memory.lastIntent,
        lastOperator: context.lastOperator || signals.memory.lastOperator,
        turnCount: context.turnCount || signals.memory.turnCount,
      },
    };

    // Apply each rule in order
    for (const rule of policy.rules) {
      if (conditionMatches(rule.when, mergedSignals)) {
        rulesApplied.push(rule.id);

        for (const action of rule.then) {
          if (action.boost) {
            const intent = action.boost.intent as IntentName;
            const current = scoreMap.get(intent) || 0;
            const newScore = Math.min(current + action.boost.amount, 0.98);
            scoreMap.set(intent, newScore);

            adjustments.push({
              intent,
              originalConfidence: current,
              adjustedConfidence: newScore,
              boost: action.boost.amount,
              reason: rule.description,
              ruleId: rule.id,
            });
          }

          if (action.dampen) {
            const intent = action.dampen.intent as IntentName;
            const current = scoreMap.get(intent) || 0;
            const newScore = Math.max(current + action.dampen.amount, 0);
            scoreMap.set(intent, newScore);

            adjustments.push({
              intent,
              originalConfidence: current,
              adjustedConfidence: newScore,
              boost: action.dampen.amount,
              reason: rule.description,
              ruleId: rule.id,
            });
          }
        }
      }
    }

    // Apply confidence floors
    for (const [intent, floor] of Object.entries(INTENT_CONFIDENCE_FLOORS)) {
      const current = scoreMap.get(intent as IntentName) || 0;
      if (current > 0 && current < floor) {
        // Soft floor - don't zero out, just note it's below threshold
        if (this.debugMode) {
          this.logger.log(
            `[RoutingPriority] ${intent} confidence ${current.toFixed(2)} below floor ${floor}`
          );
        }
      }
    }

    // Build adjusted scores array
    const adjustedScores: IntentScore[] = Array.from(scoreMap.entries())
      .map(([intent, confidence]) => ({
        intent,
        confidence,
        matchedPatternIds: scores.find((s) => s.intent === intent)?.matchedPatternIds,
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const newPrimary = adjustedScores[0]?.intent || 'error';

    // Debug logging
    if (this.debugMode) {
      this.logger.log(`[RoutingPriority] Signals: ${signalsUsed.join(', ')}`);
      this.logger.log(`[RoutingPriority] Rules applied: ${rulesApplied.join(', ')}`);
      this.logger.log(`[RoutingPriority] ${originalPrimary} → ${newPrimary}`);
    }

    return {
      adjustedScores,
      adjustments,
      originalPrimary,
      newPrimary,
      debug: {
        signalsUsed,
        rulesApplied,
      },
    };
  }

  /**
   * LEGACY COMPATIBILITY: adjustScores with query parsing
   *
   * This method exists for backward compatibility but should be migrated away from.
   * It creates basic signals from context and delegates to adjustScoresWithSignals.
   *
   * @deprecated Use adjustScoresWithSignals with proper RoutingSignals instead
   */
  adjustScores(
    scores: IntentScore[],
    query: string,
    context: RoutingContext
  ): RoutingPriorityResult {
    // Create minimal signals from context (no query parsing here)
    const signals: RoutingSignals = {
      ...EMPTY_SIGNALS,
      memory: {
        hasLastDoc: context.hasDocuments,
        lastIntent: context.lastIntent,
        lastOperator: context.lastOperator,
        turnCount: context.turnCount || 0,
        lastDocIds: context.lastDocIds,
      },
    };

    // Log deprecation warning in debug mode
    if (this.debugMode) {
      this.logger.warn(
        `[RoutingPriority] DEPRECATED: adjustScores called without RoutingSignals. ` +
          `Query: "${query.substring(0, 50)}...". ` +
          `Migrate to adjustScoresWithSignals for bank-driven routing.`
      );
    }

    return this.adjustScoresWithSignals(scores, signals, context);
  }

  /**
   * Build RoutingSignals from resolver outputs.
   *
   * Call this in the orchestrator after running operator/intent/domain resolution,
   * then pass the result to adjustScoresWithSignals.
   */
  buildSignals(params: {
    language: 'en' | 'pt' | 'es';
    operator: Match;
    intents: Match[];
    domain?: Match;
    scope?: { mode: 'single_doc' | 'multi_doc' | 'none'; confidence: number; lockedDocId?: string };
    constraints: RoutingSignals['constraints'];
    blockers: RoutingSignals['blockers'];
    followup: RoutingSignals['followup'];
    memory: RoutingSignals['memory'];
    contentGuard: boolean;
  }): RoutingSignals {
    return {
      language: params.language,
      contentGuard: params.contentGuard,
      operator: params.operator,
      intents: params.intents,
      domain: params.domain,
      scope: params.scope,
      constraints: params.constraints,
      blockers: params.blockers,
      followup: params.followup,
      memory: params.memory,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const routingPriorityService = new RoutingPriorityService();
