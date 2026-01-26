/**
 * Trace Output Service - Bank-Driven Debug & Telemetry
 *
 * This service provides structured trace output for debugging and proving
 * that the system is bank-driven. It collects decisions from each pipeline
 * stage and outputs them in a structured format.
 *
 * Enable with: KODA_TRACE=1 or ?debug=1
 *
 * Trace output includes:
 * - Bank versions loaded
 * - Answer mode decision (rule ID, reason)
 * - Tool plan selected (plan ID, steps)
 * - Retrieval stats (docs searched, chunks returned)
 * - Ranking stats (top score, margin, winner)
 * - Quality verdict (grounding, hallucination risk)
 * - Triggers fired
 * - State changes (active doc, TTL)
 */

import { bankLoader, BankLoadSummary } from './bankLoader.service';
import { AnswerModeResult } from './answerModeRouter.service';
import { ToolRouterResult } from './toolRouter.service';

// =============================================================================
// TYPES
// =============================================================================

export interface TraceNormalization {
  original: string;
  normalized: string;
  corrections: Array<{ original: string; corrected: string }>;
  quotedSpans?: string[];
  docRefs?: string[];
}

export interface TraceLanguage {
  detected: string;
  confidence: number;
  source: 'detected' | 'request_fallback' | 'default';
}

export interface TraceFollowup {
  isFollowup: boolean;
  reuseState: boolean;
  resetScope: 'partial' | 'full' | 'none';
}

export interface TraceDomain {
  topDomain: string | null;
  confidence: number;
  evidenceTerms: string[];
}

export interface TraceNegatives {
  directives: Array<{
    type: 'exclude_doc' | 'include_only' | 'exclude_time' | 'exclude_term';
    value: string;
    hard: boolean;
  }>;
  relaxationsApplied: string[];
}

export interface TraceEntities {
  resolved: Array<{ type: string; value: string; aliases?: string[] }>;
  conflicts: string[];
  constraints: {
    hard: string[];
    soft: string[];
  };
}

export interface TraceScope {
  mode: string;
  docAllowCount: number;
  docTypeAllow: string[];
  docTypeDeny: string[];
  relaxationsApplied: string[];
}

export interface TraceRetrieval {
  docsSearched: number;
  chunksScored: number;
  chunksReturned: number;
  topChunkScores: number[];
  strategy: string;
  // Canonical retrieval summary for bank-driven routing
  summary?: {
    profileUsed: string;
    reasonCode: string;
    resultCount: number;
    docsRepresented: string[];
    scopeWasHard: boolean;
    activeDocHardLockApplied: boolean;
    scopeEmpty: boolean;
    scopedNoEvidence: boolean;
  };
}

export interface TraceRanking {
  candidateCount: number;
  topScore: number;
  margin: number;
  pickedBy: string;
  whyWinnerWon?: string;
}

export interface TraceQuality {
  grounding: {
    verdict: 'pass' | 'warn' | 'fail';
    reasons: string[];
  };
  hallucination: {
    risk: 'low' | 'medium' | 'high';
    signals: string[];
  };
  actionsApplied: string[];
}

export interface TraceTriggers {
  fired: Array<{
    triggerId: string;
    actionId: string;
    reason: string;
  }>;
}

export interface TraceState {
  activeDoc: { docId: string; docName: string; ttl: number } | null;
  activeTime: { period: string; ttl: number } | null;
  activeMetric: { metric: string; ttl: number } | null;
  writes: string[];
  clears: string[];
}

export interface PipelineTrace {
  requestId: string;
  timestamp: number;
  processingTimeMs: number;

  // Bank metadata
  banks: {
    versions: Record<string, string>;
    manifestHash: string;
    totalLoaded: number;
  };

  // Pipeline stages
  normalization?: TraceNormalization;
  language?: TraceLanguage;
  followup?: TraceFollowup;
  domain?: TraceDomain;
  negatives?: TraceNegatives;
  entities?: TraceEntities;
  scope?: TraceScope;
  retrieval?: TraceRetrieval;
  ranking?: TraceRanking;

  // Routing decisions
  answerMode?: {
    mode: string;
    reason: string;
    ruleId: string;
    confidence: number;
    thresholds: Record<string, number>;
  };

  toolPlan?: {
    planId: string;
    stepsExecuted: string[];
    matchedOverride?: string;
  };

  // Quality & State
  quality?: TraceQuality;
  triggers?: TraceTriggers;
  state?: TraceState;
}

// =============================================================================
// TRACE BUILDER
// =============================================================================

export class TraceBuilder {
  private trace: Partial<PipelineTrace> = {};
  private enabled: boolean;

  constructor(requestId: string) {
    this.enabled = process.env.KODA_TRACE === '1' || process.env.NODE_ENV === 'development';
    this.trace.requestId = requestId;
    this.trace.timestamp = Date.now();
    this.initBankInfo();
  }

  private initBankInfo(): void {
    if (!this.enabled) return;

    const summary = bankLoader.getLoadSummary();
    this.trace.banks = {
      versions: {},
      manifestHash: summary?.manifestHash || 'unknown',
      totalLoaded: summary?.totalLoaded || 0,
    };

    // Collect versions of loaded banks
    if (summary) {
      for (const bank of summary.banks) {
        if (bank.status === 'loaded') {
          this.trace.banks.versions[bank.id] = bank.version;
        }
      }
    }
  }

  // ===========================================================================
  // SETTERS
  // ===========================================================================

  setNormalization(data: TraceNormalization): this {
    if (this.enabled) this.trace.normalization = data;
    return this;
  }

  setLanguage(data: TraceLanguage): this {
    if (this.enabled) this.trace.language = data;
    return this;
  }

  setFollowup(data: TraceFollowup): this {
    if (this.enabled) this.trace.followup = data;
    return this;
  }

  setDomain(data: TraceDomain): this {
    if (this.enabled) this.trace.domain = data;
    return this;
  }

  setNegatives(data: TraceNegatives): this {
    if (this.enabled) this.trace.negatives = data;
    return this;
  }

  setEntities(data: TraceEntities): this {
    if (this.enabled) this.trace.entities = data;
    return this;
  }

  setScope(data: TraceScope): this {
    if (this.enabled) this.trace.scope = data;
    return this;
  }

  setRetrieval(data: TraceRetrieval): this {
    if (this.enabled) this.trace.retrieval = data;
    return this;
  }

  setRanking(data: TraceRanking): this {
    if (this.enabled) this.trace.ranking = data;
    return this;
  }

  setAnswerMode(result: AnswerModeResult): this {
    if (this.enabled) {
      this.trace.answerMode = {
        mode: result.mode,
        reason: result.reason,
        ruleId: result.ruleId,
        confidence: result.confidence,
        thresholds: result.thresholds,
      };
    }
    return this;
  }

  setToolPlan(result: ToolRouterResult): this {
    if (this.enabled) {
      this.trace.toolPlan = {
        planId: result.planId,
        stepsExecuted: result.stepsToExecute,
        matchedOverride: result.matchedOverride,
      };
    }
    return this;
  }

  setQuality(data: TraceQuality): this {
    if (this.enabled) this.trace.quality = data;
    return this;
  }

  setTriggers(data: TraceTriggers): this {
    if (this.enabled) this.trace.triggers = data;
    return this;
  }

  setState(data: TraceState): this {
    if (this.enabled) this.trace.state = data;
    return this;
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  build(): PipelineTrace | null {
    if (!this.enabled) return null;

    this.trace.processingTimeMs = Date.now() - (this.trace.timestamp || Date.now());
    return this.trace as PipelineTrace;
  }

  /**
   * Build a minimal trace (for production - just key decisions)
   */
  buildMinimal(): Partial<PipelineTrace> | null {
    if (!this.enabled) return null;

    return {
      requestId: this.trace.requestId,
      timestamp: this.trace.timestamp,
      processingTimeMs: Date.now() - (this.trace.timestamp || Date.now()),
      answerMode: this.trace.answerMode,
      toolPlan: this.trace.toolPlan,
      ranking: this.trace.ranking
        ? {
            candidateCount: this.trace.ranking.candidateCount,
            topScore: this.trace.ranking.topScore,
            margin: this.trace.ranking.margin,
            pickedBy: this.trace.ranking.pickedBy,
          }
        : undefined,
      quality: this.trace.quality
        ? {
            grounding: { verdict: this.trace.quality.grounding.verdict, reasons: [] },
            hallucination: { risk: this.trace.quality.hallucination.risk, signals: [] },
            actionsApplied: this.trace.quality.actionsApplied,
          }
        : undefined,
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function createTrace(requestId: string): TraceBuilder {
  return new TraceBuilder(requestId);
}

export function isTraceEnabled(): boolean {
  return process.env.KODA_TRACE === '1' || process.env.NODE_ENV === 'development';
}
