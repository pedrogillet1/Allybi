// src/services/llm/core/llmRouter.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * LlmRouterService (Allybi, ChatGPT-parity)
 * --------------------------------------
 * Chooses WHICH provider + model should run a given LLM call.
 *
 * Allybi philosophy:
 *  - Bank-driven behavior (capabilities + fallbacks + feature flags)
 *  - Deterministic routing (same inputs => same route)
 *  - “Fast path” vs “precision finish”:
 *      - Fast path: ultra low latency + smooth streaming (Gemini 3.0 Flash)
 *      - Precision finish: stricter correctness (GPT-5.2) used selectively
 *
 * This service does NOT:
 *  - build prompts (requestBuilder does)
 *  - call providers (clients do)
 *  - enforce output contracts (quality/output services do)
 *
 * It DOES:
 *  - interpret a RouteContext (signals + reason codes + stage)
 *  - choose a LlmRoutePlan (provider/model/reason/stage/constraints)
 *  - apply fallback policies if selected model is unavailable
 *
 * Banks used (optional; soft-fallback if missing):
 *  - llm/policy/providerCapabilities.any.json
 *  - llm/policy/providerFallbacks.any.json
 *  - data_banks/manifest/feature_flags.any.json
 *
 * Required types:
 *  - src/services/llm/types/llm.types.ts
 */

import type {
  EnvName,
  LlmProviderId,
  LlmModelId,
  LlmRoutePlan,
  LlmRouteReason,
} from "../types/llm.types";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

export interface ProviderHealth {
  provider: LlmProviderId;
  ok: boolean;
  models?: Record<string, { ok: boolean }>;
}

export interface RouteContext {
  env: EnvName;

  /**
   * Allybi stage:
   *  - "draft" => fast streaming answer or fast utility output
   *  - "final" => strict/quality pass (polish + correctness)
   */
  stage: "draft" | "final";

  /**
   * High-level mode hints from orchestration
   */
  intentFamily?: string | null;
  operator?: string | null;
  operatorFamily?: string | null;
  answerMode?: string | null;

  /**
   * Reason codes produced by policies/gates.
   * (Use shared reason codes; router only needs a few key ones.)
   */
  reasonCodes?: string[];

  /**
   * Strictness flags (from gates/policies)
   */
  numericStrict?: boolean;
  quoteStrict?: boolean;
  hallucinationGuard?: boolean;
  groundingWeak?: boolean;

  /**
   * UX requirements
   */
  requireStreaming?: boolean;
  allowTools?: boolean;

  /**
   * Latency budget preference (ms). Used as a soft preference.
   */
  latencyBudgetMs?: number;

  /**
   * Optional provider health snapshot (if you run health pings).
   */
  providerHealth?: ProviderHealth[];

  /**
   * Optional explicit override (admin/dev/testing)
   */
  force?: { provider: LlmProviderId; model: LlmModelId } | null;
}

type CapModel = {
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  maxOutputTokens?: number;
  maxInputTokens?: number;
};

type CapProvider = {
  enabled?: boolean;
  models?: Record<string, CapModel>;
  defaults?: {
    draft?: string;
    final?: string;
  };
};

type ProviderCapabilitiesBank = {
  _meta?: any;
  config?: { enabled?: boolean };
  defaults?: {
    draft?: { provider: LlmProviderId; model: LlmModelId };
    final?: { provider: LlmProviderId; model: LlmModelId };
  };
  providers?: Record<string, CapProvider>;
};

type ProviderFallbacksBank = {
  _meta?: any;
  config?: { enabled?: boolean };
  fallbacks?: Array<{
    when: {
      provider?: LlmProviderId;
      model?: LlmModelId;
      needStreaming?: boolean;
      needTools?: boolean;
    };
    try: Array<{ provider: LlmProviderId; model: LlmModelId }>;
  }>;
};

type FeatureFlagsBank = {
  _meta?: any;
  config?: { enabled?: boolean };
  flags?: Record<string, any>;
};

function uniq(arr: string[] = []) {
  return Array.from(new Set(arr));
}

function bool(v: any): boolean {
  return v === true;
}

function isNavPills(ctx: RouteContext): boolean {
  return (
    (ctx.answerMode ?? "") === "nav_pills" ||
    (ctx.operatorFamily ?? "") === "file_actions"
  );
}

function hasAnyReason(ctx: RouteContext, codes: string[]): boolean {
  const s = new Set((ctx.reasonCodes ?? []).map(String));
  return codes.some((c) => s.has(c));
}

function pickHealth(
  health: ProviderHealth[] | undefined,
  provider: LlmProviderId,
  model: LlmModelId,
): { ok: boolean } {
  if (!health || !health.length) return { ok: true };
  const p = health.find((h) => h.provider === provider);
  if (!p) return { ok: true };
  if (p.ok === false) return { ok: false };
  const m = p.models?.[model];
  if (m && m.ok === false) return { ok: false };
  return { ok: true };
}

export class LlmRouterService {
  constructor(private readonly bankLoader: BankLoader) {}

  /**
   * Decide provider+model for a given request context.
   */
  route(ctx: RouteContext): LlmRoutePlan {
    // 0) Forced override (admin/dev/testing)
    if (ctx.force?.provider && ctx.force?.model) {
      return {
        provider: ctx.force.provider,
        model: ctx.force.model,
        reason: "unknown",
        stage: ctx.stage,
        constraints: {
          requireStreaming: bool(ctx.requireStreaming),
          disallowTools: ctx.allowTools === false,
          disallowImages: true,
          maxLatencyMs: ctx.latencyBudgetMs,
        },
      };
    }

    // 1) Load optional banks
    const caps = this.safeGetBank<ProviderCapabilitiesBank>(
      "providerCapabilities",
    );
    const fallbacks =
      this.safeGetBank<ProviderFallbacksBank>("providerFallbacks");
    const flags = this.safeGetBank<FeatureFlagsBank>("feature_flags");

    const feature = flags?.flags ?? {};
    const preferLocalInDev = bool(feature.prefer_local_in_dev);
    const enableMultiProvider = feature.enable_multi_provider !== false;

    // 2) Determine routing reason and preferred stage
    const reason = this.computeRouteReason(ctx);

    // 3) Choose a primary target (provider/model) using bank defaults + Allybi heuristics
    const primary = this.choosePrimaryTarget(ctx, reason, caps, {
      preferLocalInDev,
    });

    // 4) Validate capability constraints and provider health
    const needStreaming = bool(ctx.requireStreaming);
    const needTools = ctx.allowTools !== false;

    const okPrimary =
      this.isTargetSupported(
        primary.provider,
        primary.model,
        caps,
        needStreaming,
        needTools,
      ) && pickHealth(ctx.providerHealth, primary.provider, primary.model).ok;

    if (okPrimary) {
      return {
        provider: primary.provider,
        model: primary.model,
        reason,
        stage: primary.stage,
        constraints: {
          requireStreaming: needStreaming,
          disallowTools: !needTools,
          disallowImages: true,
          maxLatencyMs: ctx.latencyBudgetMs,
        },
      };
    }

    // 5) Fallback chain (bank-driven if present, else deterministic default)
    const fbList = this.computeFallbackList(
      primary,
      needStreaming,
      needTools,
      fallbacks,
      enableMultiProvider,
    );

    for (const cand of fbList) {
      const supported =
        this.isTargetSupported(
          cand.provider,
          cand.model,
          caps,
          needStreaming,
          needTools,
        ) && pickHealth(ctx.providerHealth, cand.provider, cand.model).ok;

      if (supported) {
        return {
          provider: cand.provider,
          model: cand.model,
          reason,
          stage: primary.stage,
          constraints: {
            requireStreaming: needStreaming,
            disallowTools: !needTools,
            disallowImages: true,
            maxLatencyMs: ctx.latencyBudgetMs,
          },
        };
      }
    }

    // 6) Last resort: return primary even if unsupported (caller can error) – deterministic
    return {
      provider: primary.provider,
      model: primary.model,
      reason,
      stage: primary.stage,
      constraints: {
        requireStreaming: needStreaming,
        disallowTools: !needTools,
        disallowImages: true,
        maxLatencyMs: ctx.latencyBudgetMs,
      },
    };
  }

  // -----------------------------
  // Reason selection
  // -----------------------------

  private computeRouteReason(ctx: RouteContext): LlmRouteReason {
    // Highest priority: strict correctness retries
    if (
      ctx.numericStrict ||
      hasAnyReason(ctx, [
        "numeric_truncation_detected",
        "numeric_not_in_source",
      ])
    )
      return "numeric_strict";
    if (ctx.quoteStrict || hasAnyReason(ctx, ["quote_too_long"]))
      return "quote_strict";
    if (
      ctx.hallucinationGuard ||
      hasAnyReason(ctx, ["hallucination_risk_high"])
    )
      return "hallucination_guard";
    if (hasAnyReason(ctx, ["wrong_doc_detected"])) return "policy_retry";
    if (hasAnyReason(ctx, ["refusal_required"])) return "fallback_only";

    // Stage-based defaults
    if (ctx.stage === "final") return "quality_finish";

    // Fast path conditions: nav_pills or low-latency requirements
    if (isNavPills(ctx)) return "fast_path";
    if (
      typeof ctx.latencyBudgetMs === "number" &&
      ctx.latencyBudgetMs > 0 &&
      ctx.latencyBudgetMs <= 2000
    )
      return "fast_path";

    return "fast_path";
  }

  // -----------------------------
  // Primary selection
  // -----------------------------

  private choosePrimaryTarget(
    ctx: RouteContext,
    reason: LlmRouteReason,
    caps: ProviderCapabilitiesBank | null,
    opts: { preferLocalInDev: boolean },
  ): { provider: LlmProviderId; model: LlmModelId; stage: "draft" | "final" } {
    // Bank defaults if present
    const bankDraft = caps?.defaults?.draft;
    const bankFinal = caps?.defaults?.final;

    // Allybi default strategy:
    // - Draft/fast path: Gemini 2.5 Flash (streaming-first)
    // - Final/precision: Gemini 2.5 Flash
    const DEFAULT_DRAFT = {
      provider: "gemini" as LlmProviderId,
      model: "gemini-2.5-flash" as LlmModelId,
    };
    const DEFAULT_FINAL = {
      provider: "gemini" as LlmProviderId,
      model: "gemini-2.5-flash" as LlmModelId,
    };

    // Dev/local cost control: optionally prefer local for draft
    const localDraft = {
      provider: "local" as LlmProviderId,
      model: "local-default" as LlmModelId,
    };

    // Decide stage override from reason
    const stage: "draft" | "final" =
      reason === "quality_finish" ||
      reason === "numeric_strict" ||
      reason === "quote_strict" ||
      reason === "hallucination_guard" ||
      reason === "policy_retry"
        ? "final"
        : ctx.stage;

    if (stage === "final") {
      const chosen = bankFinal ?? DEFAULT_FINAL;
      return { ...chosen, stage: "final" };
    }

    // stage === draft
    if ((ctx.env === "dev" || ctx.env === "local") && opts.preferLocalInDev) {
      return { ...localDraft, stage: "draft" };
    }

    const chosen = bankDraft ?? DEFAULT_DRAFT;
    return { ...chosen, stage: "draft" };
  }

  // -----------------------------
  // Capability checks
  // -----------------------------

  private isTargetSupported(
    provider: LlmProviderId,
    model: LlmModelId,
    caps: ProviderCapabilitiesBank | null,
    needStreaming: boolean,
    needTools: boolean,
  ): boolean {
    // If no capabilities bank, assume supported (system is configured elsewhere)
    if (!caps?.providers) return true;

    const p = caps.providers[String(provider)];
    if (!p) return true;

    if (p.enabled === false) return false;

    const m = p.models?.[String(model)];
    if (!m) return true;

    if (needStreaming && m.supportsStreaming === false) return false;
    if (needTools && m.supportsTools === false) return false;

    return true;
  }

  // -----------------------------
  // Fallback chains
  // -----------------------------

  private computeFallbackList(
    primary: {
      provider: LlmProviderId;
      model: LlmModelId;
      stage: "draft" | "final";
    },
    needStreaming: boolean,
    needTools: boolean,
    fallbacks: ProviderFallbacksBank | null,
    enableMultiProvider: boolean,
  ): Array<{ provider: LlmProviderId; model: LlmModelId }> {
    const out: Array<{ provider: LlmProviderId; model: LlmModelId }> = [];

    // 1) Bank-driven fallbacks
    const fallbackRules =
      fallbacks?.config?.enabled !== false &&
      Array.isArray(fallbacks?.fallbacks)
        ? fallbacks.fallbacks
        : [];

    if (fallbackRules.length) {
      for (const rule of fallbackRules) {
        const w = rule.when ?? {};
        const matchProvider = !w.provider || w.provider === primary.provider;
        const matchModel = !w.model || w.model === primary.model;
        const matchStreaming =
          w.needStreaming == null ? true : w.needStreaming === needStreaming;
        const matchTools =
          w.needTools == null ? true : w.needTools === needTools;

        if (matchProvider && matchModel && matchStreaming && matchTools) {
          for (const t of rule.try ?? [])
            out.push({ provider: t.provider, model: t.model });
        }
      }
    }

    // 2) Deterministic default fallbacks (no bank required)
    // Keep this minimal and general:
    // - If gemini fails, try openai; if openai fails, try local; then swap.
    const primaryKey = `${primary.provider}:${primary.model}`;
    const add = (p: LlmProviderId, m: LlmModelId) => {
      const k = `${p}:${m}`;
      if (k === primaryKey) return;
      if (out.some((x) => `${x.provider}:${x.model}` === k)) return;
      out.push({ provider: p, model: m });
    };

    if (enableMultiProvider) {
      if (primary.provider === "gemini") {
        add("openai", "gpt-5-mini");
        add("openai", "gpt-5.2");
        add("gemini", "gemini-2.5-flash");
        add("local", "local-default");
      } else if (primary.provider === "openai") {
        add("gemini", "gemini-2.5-flash");
        add("openai", "gpt-5-mini");
        add("openai", "gpt-5.2");
        add("local", "local-default");
      } else {
        // local primary
        add("gemini", "gemini-2.5-flash");
        add("openai", "gpt-5-mini");
        add("openai", "gpt-5.2");
      }
    }

    return out;
  }

  // -----------------------------
  // Bank loader safety
  // -----------------------------

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}

export default LlmRouterService;
