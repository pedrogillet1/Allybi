/**
 * geminiSafetyAdapter.service.ts
 *
 * Gemini-specific safety adapter that normalizes Gemini safety output into Allybi’s
 * provider-agnostic SafetySignal, then delegates to the generic LLMSafetyAdapterService
 * for deterministic policy decisions (block/redact/escalate/allow).
 *
 * Responsibilities:
 * - Parse Gemini safety fields (from generateContent/streamGenerateContent responses)
 * - Map Gemini categories -> Allybi SafetySignal.providerCategories / flags
 * - Produce a Allybi SafetyDecision via the generic adapter (bank-driven policy)
 *
 * Non-responsibilities:
 * - No user-facing microcopy
 * - No UI routing
 * - No retrieval logic
 */

import type { LLMProvider } from './llmErrors.types';
import type {
  SafetySignal,
  SafetyContext,
  SafetyDecision,
  SafetyAdapterPolicy,
} from './llmSafetyAdapter.service';
import { LLMSafetyAdapterService } from './llmSafetyAdapter.service';

/**
 * Gemini response safety shapes vary across versions.
 * We accept a superset and parse defensively.
 */

// Common fields seen in Gemini candidate safety outputs
interface GeminiSafetyRating {
  category?: string; // e.g., "HARM_CATEGORY_SELF_HARM"
  probability?: string; // e.g., "NEGLIGIBLE" | "LOW" | "MEDIUM" | "HIGH"
}

interface GeminiPromptFeedback {
  blockReason?: string; // e.g., "SAFETY"
  safetyRatings?: GeminiSafetyRating[];
}

interface GeminiCandidate {
  finishReason?: string; // sometimes includes "SAFETY"
  safetyRatings?: GeminiSafetyRating[];
}

interface GeminiResponseLike {
  promptFeedback?: GeminiPromptFeedback;
  candidates?: GeminiCandidate[];
}

/** Adapter config for Gemini parsing */
export interface GeminiSafetyAdapterConfig {
  /**
   * If true, treat Gemini finishReason="SAFETY" as providerBlocked.
   */
  finishReasonSafetyIsBlock: boolean;

  /**
   * If true, treat promptFeedback.blockReason="SAFETY" as providerBlocked.
   */
  promptFeedbackSafetyIsBlock: boolean;

  /**
   * Maps Gemini probability strings into a rough severity.
   */
  probabilityToSeverity: Record<string, 'low' | 'medium' | 'high' | 'critical'>;

  /**
   * Optional: allow extra category mappings (extensible).
   */
  extraCategoryMap?: Record<string, string>;
}

export class GeminiSafetyAdapterService {
  private readonly core: LLMSafetyAdapterService;

  constructor(
    private readonly cfg: GeminiSafetyAdapterConfig,
    safetyPolicy: SafetyAdapterPolicy
  ) {
    this.core = new LLMSafetyAdapterService(safetyPolicy);
  }

  /**
   * Build a Allybi SafetySignal from a Gemini response-like object and then produce a SafetyDecision.
   */
  decideFromGemini(params: {
    geminiResponse: unknown;
    context: SafetyContext;
    requestId?: string;
  }): SafetyDecision {
    const signal = this.extractSafetySignal(params.geminiResponse, params.requestId);
    return this.core.decide({
      signal,
      context: params.context,
    });
  }

  /**
   * Extract a provider-agnostic SafetySignal from Gemini response-like payload.
   */
  extractSafetySignal(geminiResponse: unknown, requestId?: string): SafetySignal {
    const resp = geminiResponse as GeminiResponseLike;

    const provider: LLMProvider = 'google';
    const providerCategories: string[] = [];
    let providerBlocked = false;

    const flags: Record<string, boolean> = {};

    // 1) Prompt feedback (often where blocks happen)
    const pf = resp?.promptFeedback;
    if (pf?.safetyRatings?.length) {
      for (const r of pf.safetyRatings) {
        const cat = normalizeGeminiCategory(r.category);
        if (cat) providerCategories.push(cat);
        this.applyFlagForCategory(cat, flags);
      }
    }
    if (this.cfg.promptFeedbackSafetyIsBlock && pf?.blockReason) {
      if (String(pf.blockReason).toUpperCase().includes('SAFETY')) providerBlocked = true;
    }

    // 2) Candidate-level safety ratings
    const c0 = resp?.candidates?.[0];
    if (c0?.safetyRatings?.length) {
      for (const r of c0.safetyRatings) {
        const cat = normalizeGeminiCategory(r.category);
        if (cat) providerCategories.push(cat);
        this.applyFlagForCategory(cat, flags);
      }
    }
    if (this.cfg.finishReasonSafetyIsBlock && c0?.finishReason) {
      if (String(c0.finishReason).toUpperCase().includes('SAFETY')) providerBlocked = true;
    }

    // 3) Derive a rough providerSeverity from highest probability seen
    const providerSeverity = this.deriveProviderSeverity(resp);

    // Deduplicate categories deterministically
    const dedupedCats = Array.from(new Set(providerCategories)).sort();

    return {
      provider,
      providerCategories: dedupedCats.map(c => this.mapExtra(c)),
      providerSeverity,
      providerBlocked,
      flags,
      requestId,
    };
  }

  /* --------------------- internal helpers --------------------- */

  private deriveProviderSeverity(resp: GeminiResponseLike): string | undefined {
    // Pick max severity across all safety ratings we can see.
    const ratings: GeminiSafetyRating[] = [];

    const pf = resp?.promptFeedback;
    if (pf?.safetyRatings?.length) ratings.push(...pf.safetyRatings);

    const c0 = resp?.candidates?.[0];
    if (c0?.safetyRatings?.length) ratings.push(...c0.safetyRatings);

    if (!ratings.length) return undefined;

    let best: 'low' | 'medium' | 'high' | 'critical' = 'low';

    for (const r of ratings) {
      const p = (r.probability ?? '').toUpperCase().trim();
      const sev = this.cfg.probabilityToSeverity[p];
      if (!sev) continue;
      best = maxSeverity(best, sev);
    }

    return best;
  }

  private applyFlagForCategory(cat: string | null, flags: Record<string, boolean>): void {
    if (!cat) return;

    // Map normalized categories to boolean flags used by LLMSafetyAdapterService
    // (Keep stable keys.)
    if (cat.includes('SELF_HARM')) flags['self_harm'] = true;
    if (cat.includes('SEXUAL')) flags['sexual'] = true;
    if (cat.includes('MINORS') || cat.includes('CHILD')) flags['minors'] = true;
    if (cat.includes('VIOLENCE')) flags['violence'] = true;
    if (cat.includes('HATE')) flags['hate'] = true;
    if (cat.includes('HARASSMENT')) flags['harassment'] = true;
    if (cat.includes('ILLEGAL')) flags['illegal'] = true;
    if (cat.includes('PRIVACY') || cat.includes('PII') || cat.includes('DOX')) flags['privacy'] = true;
    if (cat.includes('MEDICAL')) flags['medical'] = true;
    if (cat.includes('LEGAL')) flags['legal'] = true;
  }

  private mapExtra(cat: string): string {
    if (!this.cfg.extraCategoryMap) return cat;
    return this.cfg.extraCategoryMap[cat] ?? cat;
  }
}

/* --------------------- category normalization --------------------- */

function normalizeGeminiCategory(raw?: string): string | null {
  if (!raw) return null;

  // Gemini categories often look like: "HARM_CATEGORY_SELF_HARM"
  // Normalize to a stable, readable token.
  const s = String(raw).trim();
  if (!s) return null;

  // Keep deterministic transformations
  const upper = s.toUpperCase();

  // Common known Gemini categories
  // (We keep them as normalized providerCategories; the core adapter maps them to Allybi reasons.)
  if (upper.includes('SELF_HARM')) return 'HARM_CATEGORY_SELF_HARM';
  if (upper.includes('SEXUAL')) return 'HARM_CATEGORY_SEXUAL_CONTENT';
  if (upper.includes('HATE')) return 'HARM_CATEGORY_HATE_SPEECH';
  if (upper.includes('HARASSMENT')) return 'HARM_CATEGORY_HARASSMENT';
  if (upper.includes('VIOLENCE')) return 'HARM_CATEGORY_VIOLENCE';
  if (upper.includes('DANGEROUS') || upper.includes('ILLEGAL')) return 'HARM_CATEGORY_ILLEGAL';
  // Privacy categories are not always present; keep generic when found
  if (upper.includes('PRIVACY') || upper.includes('PII') || upper.includes('DOX')) return 'HARM_CATEGORY_PRIVACY';

  // Fallback: keep original but normalized
  return `HARM_CATEGORY_${upper.replace(/[^A-Z0-9]+/g, '_')}`;
}

function maxSeverity(
  a: 'low' | 'medium' | 'high' | 'critical',
  b: 'low' | 'medium' | 'high' | 'critical'
): 'low' | 'medium' | 'high' | 'critical' {
  const rank: Record<typeof a, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  return rank[b] > rank[a] ? b : a;
}
