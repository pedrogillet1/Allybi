/**
 * llmSafetyAdapter.service.ts
 *
 * Provider-agnostic safety adapter for Allybi.
 * Purpose:
 * - Normalize provider safety signals into Allybi-safe reason codes (bank-driven fallbacks)
 * - Enforce deterministic "trust gate" decisions (block/allow/redact/escalate)
 * - NO user-facing microcopy (banks decide messaging)
 *
 * This service should be called inside the Trust Gate stage, before final compose/output.
 */

import type { LLMProvider } from './llmErrors.types';

export type SafetyAction = 'allow' | 'block' | 'redact' | 'escalate';

/**
 * Stable safety reasons used for bank routing. Keep short + consistent.
 * Do not rename without migration.
 */
export type SafetyReasonCode =
  | 'SAFE'
  | 'SELF_HARM'
  | 'SEXUAL_CONTENT'
  | 'MINORS'
  | 'VIOLENCE'
  | 'ILLEGAL'
  | 'HATE'
  | 'HARASSMENT'
  | 'PRIVACY'
  | 'MEDICAL'
  | 'LEGAL'
  | 'UNKNOWN';

export type SafetySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SafetySignal {
  provider: LLMProvider;

  /** Provider-native category label(s) if available */
  providerCategories?: string[];

  /** Provider-native severity if available */
  providerSeverity?: string;

  /** Provider-native block boolean if available */
  providerBlocked?: boolean;

  /** Optional: structured flags */
  flags?: Record<string, boolean>;

  /** For diagnostics */
  requestId?: string;
}

export interface SafetyContext {
  traceId: string;
  turnId: string;

  /** Age band if known (used by policy layers). */
  userAgeBand?: 'child' | 'teen' | 'adult' | 'unknown';

  /** Whether the user asked for instructions or intent suggests harm */
  intentHints?: {
    selfHarm?: boolean;
    illegal?: boolean;
    weapon?: boolean;
    sexual?: boolean;
    minors?: boolean;
    doxxing?: boolean;
  };

  /** Optional doc context flags (e.g., contains sensitive PII) */
  docHints?: {
    piiLikely?: boolean;
    regulatedData?: boolean;
  };
}

export interface SafetyDecision {
  action: SafetyAction;
  reason: SafetyReasonCode;
  severity: SafetySeverity;

  /** Optional: mask strategy if action='redact' */
  redact?: {
    /** What to remove/obscure (policy-driven) */
    mode: 'pii' | 'sensitive' | 'custom';
    /** Optional list of fields/patterns to redact */
    targets?: string[];
  };

  /** Diagnostic info */
  meta?: {
    traceId: string;
    turnId: string;
    provider: LLMProvider;
    requestId?: string;
    providerCategories?: string[];
    providerSeverity?: string;
  };
}

/**
 * Bank-driven adapter policy:
 * The service executes these deterministically; microcopy stays in banks.
 */
export interface SafetyAdapterPolicy {
  enabled: boolean;

  /**
   * Hard blocks by reason (deterministic).
   * Example: SELF_HARM + userAgeBand='teen' => block.
   */
  hardBlockReasons: SafetyReasonCode[];

  /**
   * Reasons that should redact instead of block (e.g., privacy/PII).
   */
  redactReasons: SafetyReasonCode[];

  /**
   * Reasons that should escalate (human review / higher model / stricter validator).
   */
  escalateReasons: SafetyReasonCode[];

  /**
   * Default action when uncertain.
   */
  defaultOnUnknown: SafetyAction;

  /**
   * If true, teen policy is stricter (recommended).
   */
  strictForTeens: boolean;
}

/**
 * Main service.
 */
export class LLMSafetyAdapterService {
  constructor(private readonly policy: SafetyAdapterPolicy) {}

  /**
   * Convert provider signal + context into a deterministic Allybi decision.
   */
  decide(params: {
    signal?: SafetySignal;
    context: SafetyContext;
    /** Optional: the raw user query (for heuristic hints). Do not log raw unless allowed. */
    userQuery?: string;
  }): SafetyDecision {
    const { signal, context } = params;

    if (!this.policy.enabled) {
      return this.allow(context, signal);
    }

    // 1) Map provider signal -> normalized reason
    const mapped = mapProviderSignalToReason(signal, context);

    // 2) Apply age-band tightening
    const tightened = tightenForAge(mapped, context, this.policy);

    // 3) Apply policy buckets
    if (this.policy.hardBlockReasons.includes(tightened.reason)) {
      return {
        action: 'block',
        reason: tightened.reason,
        severity: tightened.severity,
        meta: mkMeta(context, signal),
      };
    }

    if (this.policy.redactReasons.includes(tightened.reason)) {
      return {
        action: 'redact',
        reason: tightened.reason,
        severity: tightened.severity,
        redact: { mode: tightened.reason === 'PRIVACY' ? 'pii' : 'sensitive' },
        meta: mkMeta(context, signal),
      };
    }

    if (this.policy.escalateReasons.includes(tightened.reason)) {
      return {
        action: 'escalate',
        reason: tightened.reason,
        severity: tightened.severity,
        meta: mkMeta(context, signal),
      };
    }

    // 4) Unknown handling
    if (tightened.reason === 'UNKNOWN') {
      return {
        action: this.policy.defaultOnUnknown,
        reason: 'UNKNOWN',
        severity: tightened.severity,
        meta: mkMeta(context, signal),
      };
    }

    // 5) Otherwise allow
    return {
      action: 'allow',
      reason: tightened.reason,
      severity: tightened.severity,
      meta: mkMeta(context, signal),
    };
  }

  private allow(context: SafetyContext, signal?: SafetySignal): SafetyDecision {
    return {
      action: 'allow',
      reason: 'SAFE',
      severity: 'low',
      meta: mkMeta(context, signal),
    };
  }
}

/* ------------------------- mapping helpers ------------------------- */

function mapProviderSignalToReason(
  signal: SafetySignal | undefined,
  context: SafetyContext
): { reason: SafetyReasonCode; severity: SafetySeverity } {
  // If no signal, fall back to intent hints as a minimal deterministic layer
  if (!signal) {
    const hinted = reasonFromHints(context);
    return hinted ?? { reason: 'SAFE', severity: 'low' };
  }

  // Provider said blocked: treat as high severity unless we have better detail
  const providerBlocked = !!signal.providerBlocked;

  // Normalize categories from provider strings + flags
  const cats = (signal.providerCategories ?? []).map(s => s.toLowerCase());
  const flags = signal.flags ?? {};

  // --- Self-harm ---
  if (providerBlocked && (cats.some(c => c.includes('self')) || flags['self_harm'])) {
    return { reason: 'SELF_HARM', severity: 'critical' };
  }

  // --- Minors / sexual ---
  if (
    cats.some(c => c.includes('minor') || c.includes('child')) ||
    flags['minors'] ||
    context.intentHints?.minors
  ) {
    // If also sexual indicators
    if (cats.some(c => c.includes('sex')) || flags['sexual'] || context.intentHints?.sexual) {
      return { reason: 'MINORS', severity: 'critical' };
    }
    return { reason: 'MINORS', severity: providerBlocked ? 'high' : 'medium' };
  }

  if (cats.some(c => c.includes('sex')) || flags['sexual'] || context.intentHints?.sexual) {
    return { reason: 'SEXUAL_CONTENT', severity: providerBlocked ? 'high' : 'medium' };
  }

  // --- Violence ---
  if (cats.some(c => c.includes('violence')) || flags['violence']) {
    return { reason: 'VIOLENCE', severity: providerBlocked ? 'high' : 'medium' };
  }

  // --- Illegal ---
  if (cats.some(c => c.includes('illegal')) || flags['illegal'] || context.intentHints?.illegal) {
    return { reason: 'ILLEGAL', severity: providerBlocked ? 'high' : 'medium' };
  }

  // --- Hate/harassment ---
  if (cats.some(c => c.includes('hate')) || flags['hate']) {
    return { reason: 'HATE', severity: providerBlocked ? 'high' : 'medium' };
  }

  if (cats.some(c => c.includes('harass')) || flags['harassment']) {
    return { reason: 'HARASSMENT', severity: providerBlocked ? 'high' : 'medium' };
  }

  // --- Privacy ---
  if (
    cats.some(c => c.includes('privacy') || c.includes('pii') || c.includes('dox')) ||
    flags['privacy'] ||
    context.intentHints?.doxing ||
    context.docHints?.piiLikely
  ) {
    return { reason: 'PRIVACY', severity: providerBlocked ? 'high' : 'medium' };
  }

  // --- Domain risk flags (not necessarily block; used for escalation elsewhere) ---
  if (cats.some(c => c.includes('medical')) || flags['medical']) {
    return { reason: 'MEDICAL', severity: providerBlocked ? 'medium' : 'low' };
  }
  if (cats.some(c => c.includes('legal')) || flags['legal']) {
    return { reason: 'LEGAL', severity: providerBlocked ? 'medium' : 'low' };
  }

  // If provider explicitly blocked but we can't map category
  if (providerBlocked) return { reason: 'UNKNOWN', severity: 'high' };

  return { reason: reasonFromHints(context)?.reason ?? 'SAFE', severity: 'low' };
}

function reasonFromHints(
  context: SafetyContext
): { reason: SafetyReasonCode; severity: SafetySeverity } | null {
  if (context.intentHints?.selfHarm) return { reason: 'SELF_HARM', severity: 'high' };
  if (context.intentHints?.minors) return { reason: 'MINORS', severity: 'high' };
  if (context.intentHints?.sexual) return { reason: 'SEXUAL_CONTENT', severity: 'medium' };
  if (context.intentHints?.illegal || context.intentHints?.weapon)
    return { reason: 'ILLEGAL', severity: 'medium' };
  if (context.intentHints?.doxing || context.docHints?.piiLikely)
    return { reason: 'PRIVACY', severity: 'medium' };
  return null;
}

function tightenForAge(
  mapped: { reason: SafetyReasonCode; severity: SafetySeverity },
  context: SafetyContext,
  policy: SafetyAdapterPolicy
): { reason: SafetyReasonCode; severity: SafetySeverity } {
  if (!policy.strictForTeens) return mapped;

  if (context.userAgeBand === 'teen') {
    // Teen strictness: elevate self-harm and minors to critical; lean toward block/escalate.
    if (mapped.reason === 'SELF_HARM') return { reason: 'SELF_HARM', severity: 'critical' };
    if (mapped.reason === 'MINORS') return { reason: 'MINORS', severity: 'critical' };
    // If ambiguous sexual content, raise severity
    if (mapped.reason === 'SEXUAL_CONTENT') return { reason: 'SEXUAL_CONTENT', severity: 'high' };
  }

  return mapped;
}

function mkMeta(context: SafetyContext, signal?: SafetySignal): SafetyDecision['meta'] {
  return {
    traceId: context.traceId,
    turnId: context.turnId,
    provider: signal?.provider ?? 'unknown',
    requestId: signal?.requestId,
    providerCategories: signal?.providerCategories,
    providerSeverity: signal?.providerSeverity,
  };
}
