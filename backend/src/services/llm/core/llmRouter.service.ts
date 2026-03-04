// src/services/llm/core/llmRouter.service.ts

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
 * Banks used:
 *  - data_banks/llm/provider_capabilities.any.json (id: provider_capabilities)
 *  - data_banks/llm/provider_fallbacks.any.json (id: provider_fallbacks)
 *  - data_banks/llm/composition_lane_policy.any.json (id: composition_lane_policy)
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
import { toCostFamilyModel } from "./llmCostCalculator";

export interface BankLoader {
  getBank<T = unknown>(bankId: string): T;
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
  pinnedVersion?: string;
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
  _meta?: Record<string, unknown>;
  config?: { enabled?: boolean };
  defaults?: {
    draft?: { provider: LlmProviderId; model: LlmModelId };
    final?: { provider: LlmProviderId; model: LlmModelId };
  };
  providers?: Record<string, CapProvider>;
};

type ProviderFallbacksBank = {
  _meta?: Record<string, unknown>;
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

type CompositionLanePolicyBank = {
  _meta?: Record<string, unknown>;
  config?: { enabled?: boolean };
  lanes?: Array<{
    id?: string;
    when?: {
      stage?: "draft" | "final";
      reasons?: LlmRouteReason[];
      answerModes?: string[];
      answerModePrefixes?: string[];
    };
    route?: {
      provider?: LlmProviderId;
      model?: LlmModelId;
      modelFamily?: string;
    };
    qualityReason?: string;
    policyRuleId?: string;
  }>;
};

type FeatureFlagsBank = {
  _meta?: Record<string, unknown>;
  config?: { enabled?: boolean };
  flags?: Record<string, unknown>;
};

function uniq(arr: string[] = []) {
  return Array.from(new Set(arr));
}

function bool(v: unknown): boolean {
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

export interface RouterLogger {
  warn(msg: string, meta?: Record<string, unknown>): void;
}

type PrimaryTarget = {
  provider: LlmProviderId;
  model: LlmModelId;
  stage: "draft" | "final";
  lane?: string;
  modelFamily?: string;
  policyRuleId?: string;
  qualityReason?: string;
};

export class LlmRouterService {
  private bankMissCount = 0;
  private lastBankMiss: string | null = null;

  constructor(
    private readonly bankLoader: BankLoader,
    private readonly logger?: RouterLogger,
  ) {}

  /** Observability: bank miss diagnostics for health checks */
  getBankDiagnostics(): { missCount: number; lastMiss: string | null } {
    return { missCount: this.bankMissCount, lastMiss: this.lastBankMiss };
  }

  /**
   * List deterministic fallback candidates for an already-routed primary target.
   * This is used by the gateway execution loop when the primary provider/model
   * fails at runtime.
   */
  listFallbackTargets(input: {
    primary: {
      provider: LlmProviderId;
      model: LlmModelId;
      stage: "draft" | "final";
    };
    requireStreaming?: boolean;
    allowTools?: boolean;
  }): Array<{ provider: LlmProviderId; model: LlmModelId }> {
    const fallbacks = this.safeGetBankMulti<ProviderFallbacksBank>([
      "provider_fallbacks",
      "providerFallbacks",
    ]);
    const flags = this.safeGetBank<FeatureFlagsBank>("feature_flags");
    const feature = flags?.flags ?? {};
    const enableMultiProvider = feature.enable_multi_provider !== false;

    return this.computeFallbackList(
      input.primary,
      bool(input.requireStreaming),
      input.allowTools !== false,
      fallbacks,
      enableMultiProvider,
    );
  }

  /**
   * Decide provider+model for a given request context.
   */
  route(ctx: RouteContext): LlmRoutePlan {
    // 0) Forced override (admin/dev/testing)
    if (ctx.force?.provider && ctx.force?.model) {
      const forcedModel = String(ctx.force.model);
      return {
        provider: ctx.force.provider,
        model: ctx.force.model,
        modelFamily: toCostFamilyModel(forcedModel) ?? forcedModel,
        reason: "unknown",
        lane: "forced_override",
        policyRuleId: "forced_override",
        qualityReason: "forced_override",
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
    const caps = this.safeGetBankMulti<ProviderCapabilitiesBank>([
      "provider_capabilities",
      "providerCapabilities",
    ]);
    const fallbacks = this.safeGetBankMulti<ProviderFallbacksBank>([
      "provider_fallbacks",
      "providerFallbacks",
    ]);
    const lanePolicy = this.safeGetBankMulti<CompositionLanePolicyBank>([
      "composition_lane_policy",
      "compositionLanePolicy",
    ]);
    const flags = this.safeGetBank<FeatureFlagsBank>("feature_flags");

    const feature = flags?.flags ?? {};
    const preferLocalInDev = bool(feature.prefer_local_in_dev);
    const enableMultiProvider = feature.enable_multi_provider !== false;

    // 2) Determine routing reason and preferred stage
    const reason = this.computeRouteReason(ctx);

    // 3) Choose a primary target (provider/model) using bank defaults + Allybi heuristics
    const primary = this.choosePrimaryTarget(
      ctx,
      reason,
      caps,
      lanePolicy,
      {
        preferLocalInDev,
      },
    );

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
      return this.toRoutePlan(
        primary,
        caps,
        reason,
        needStreaming,
        needTools,
        ctx.latencyBudgetMs,
      );
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
        return this.toRoutePlan(
          {
            provider: cand.provider,
            model: cand.model,
            stage: primary.stage,
            lane: primary.lane,
            modelFamily: toCostFamilyModel(cand.model) ?? cand.model,
            policyRuleId: "provider_fallbacks",
            qualityReason: primary.qualityReason ?? reason,
          },
          caps,
          reason,
          needStreaming,
          needTools,
          ctx.latencyBudgetMs,
        );
      }
    }

    // 6) Last resort: return primary even if unsupported (caller can error) – deterministic
    return this.toRoutePlan(
      primary,
      caps,
      reason,
      needStreaming,
      needTools,
      ctx.latencyBudgetMs,
    );
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
    lanePolicy: CompositionLanePolicyBank | null,
    opts: { preferLocalInDev: boolean },
  ): PrimaryTarget {
    // Bank defaults if present
    const bankDraft = caps?.defaults?.draft;
    const bankFinal = caps?.defaults?.final;

    // Allybi default strategy:
    // - Draft/fast path: Gemini 2.5 Flash (streaming-first)
    // - Final/precision: GPT-5.2 authority lane
    const DEFAULT_DRAFT = {
      provider: "gemini" as LlmProviderId,
      model: "gemini-2.5-flash" as LlmModelId,
    };
    const DEFAULT_FINAL = {
      provider: "openai" as LlmProviderId,
      model: "gpt-5.2" as LlmModelId,
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
      const laneTarget = this.selectLanePolicyTarget(
        ctx,
        reason,
        stage,
        lanePolicy,
      );
      if (laneTarget) return laneTarget;

      if ((ctx.answerMode ?? "") === "doc_grounded_quote") {
        return {
          provider: "openai" as LlmProviderId,
          model: "gpt-5.2" as LlmModelId,
          stage: "final",
          lane: "final_quote_authority_builtin",
          modelFamily: "gpt-5.2",
          policyRuleId: "router_builtin_doc_grounded_quote",
          qualityReason: "quote_strict",
        };
      }
      if (reason === "quality_finish") {
        const chosen = bankFinal ?? DEFAULT_FINAL;
        return {
          ...chosen,
          stage: "final",
          lane: "final_authority_default_builtin",
          modelFamily: toCostFamilyModel(chosen.model) ?? chosen.model,
          policyRuleId: "router_builtin_final_default",
          qualityReason: "quality_finish",
        };
      }
      const chosen = bankFinal ?? DEFAULT_FINAL;
      return {
        ...chosen,
        stage: "final",
        lane: "final_guarded_builtin",
        modelFamily: toCostFamilyModel(chosen.model) ?? chosen.model,
        policyRuleId: "router_builtin_final_guarded",
        qualityReason: reason,
      };
    }

    // stage === draft
    if ((ctx.env === "dev" || ctx.env === "local") && opts.preferLocalInDev) {
      return {
        ...localDraft,
        stage: "draft",
        lane: "draft_local_dev",
        modelFamily: toCostFamilyModel(localDraft.model) ?? localDraft.model,
        policyRuleId: "router_builtin_local_dev",
        qualityReason: "fast_path",
      };
    }

    const laneTarget = this.selectLanePolicyTarget(
      ctx,
      reason,
      stage,
      lanePolicy,
    );
    if (laneTarget) return laneTarget;

    const chosen = bankDraft ?? DEFAULT_DRAFT;
    return {
      ...chosen,
      stage: "draft",
      lane: "draft_fast_default_builtin",
      modelFamily: toCostFamilyModel(chosen.model) ?? chosen.model,
      policyRuleId: "router_builtin_draft_default",
      qualityReason: "fast_path",
    };
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
        if (primary.stage === "final") {
          add("openai", "gpt-5.2");
          add("openai", "gpt-5-mini");
        } else {
          add("openai", "gpt-5-mini");
          add("openai", "gpt-5.2");
        }
        add("local", "local-default");
      } else if (primary.provider === "openai") {
        if (primary.model === "gpt-5-mini") {
          add("openai", "gpt-5.2");
          add("gemini", "gemini-2.5-flash");
        } else {
          add("gemini", "gemini-2.5-flash");
          add("openai", "gpt-5-mini");
        }
        add("local", "local-default");
      } else {
        // local primary
        if (primary.stage === "final") {
          add("openai", "gpt-5.2");
          add("gemini", "gemini-2.5-flash");
          add("openai", "gpt-5-mini");
        } else {
          add("gemini", "gemini-2.5-flash");
          add("openai", "gpt-5-mini");
          add("openai", "gpt-5.2");
        }
      }
    }

    return out;
  }

  // -----------------------------
  // Model version pinning
  // -----------------------------

  private resolvePinnedVersion(
    provider: LlmProviderId,
    model: LlmModelId,
    caps: ProviderCapabilitiesBank | null,
  ): LlmModelId {
    const p = caps?.providers?.[String(provider)];
    const m = p?.models?.[String(model)];
    return (m?.pinnedVersion as LlmModelId) || model;
  }

  private selectLanePolicyTarget(
    ctx: RouteContext,
    reason: LlmRouteReason,
    stage: "draft" | "final",
    lanePolicy: CompositionLanePolicyBank | null,
  ): PrimaryTarget | null {
    const enabled = lanePolicy?.config?.enabled !== false;
    const lanes = enabled && Array.isArray(lanePolicy?.lanes) ? lanePolicy.lanes : [];
    if (!lanes.length) return null;

    const answerMode = String(ctx.answerMode || "").trim();

    for (const lane of lanes) {
      const route = lane.route ?? {};
      if (!route.provider || !route.model) continue;
      const when = lane.when ?? {};

      if (when.stage && when.stage !== stage) continue;
      if (
        Array.isArray(when.reasons) &&
        when.reasons.length > 0 &&
        !when.reasons.includes(reason)
      ) {
        continue;
      }
      if (
        Array.isArray(when.answerModes) &&
        when.answerModes.length > 0 &&
        !when.answerModes.includes(answerMode)
      ) {
        continue;
      }
      if (
        Array.isArray(when.answerModePrefixes) &&
        when.answerModePrefixes.length > 0 &&
        !when.answerModePrefixes.some((prefix) => answerMode.startsWith(String(prefix || "")))
      ) {
        continue;
      }

      const modelText = String(route.model);
      return {
        provider: route.provider,
        model: route.model,
        stage,
        lane: String(lane.id || "").trim() || "composition_lane_policy",
        modelFamily: route.modelFamily || toCostFamilyModel(modelText) || modelText,
        policyRuleId:
          String(lane.policyRuleId || "").trim() ||
          (String(lane.id || "").trim() || "composition_lane_policy"),
        qualityReason: String(lane.qualityReason || "").trim() || reason,
      };
    }

    return null;
  }

  private toRoutePlan(
    target: PrimaryTarget,
    caps: ProviderCapabilitiesBank | null,
    reason: LlmRouteReason,
    needStreaming: boolean,
    needTools: boolean,
    maxLatencyMs: number | undefined,
  ): LlmRoutePlan {
    const resolvedModel = this.resolvePinnedVersion(
      target.provider,
      target.model,
      caps,
    );
    const modelFamily =
      target.modelFamily ||
      toCostFamilyModel(resolvedModel) ||
      toCostFamilyModel(target.model) ||
      String(target.model);

    return {
      provider: target.provider,
      model: resolvedModel,
      modelFamily,
      reason,
      lane: target.lane,
      policyRuleId: target.policyRuleId,
      qualityReason: target.qualityReason || reason,
      stage: target.stage,
      constraints: {
        requireStreaming: needStreaming,
        disallowTools: !needTools,
        disallowImages: true,
        maxLatencyMs,
      },
    };
  }

  // -----------------------------
  // Bank loader safety
  // -----------------------------

  private safeGetBank<T = unknown>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      this.bankMissCount++;
      this.lastBankMiss = bankId;
      this.logger?.warn("Bank miss in router", { bankId, missCount: this.bankMissCount });
      return null;
    }
  }

  private safeGetBankMulti<T = unknown>(bankIds: string[]): T | null {
    for (const bankId of bankIds) {
      try {
        return this.bankLoader.getBank<T>(bankId);
      } catch {
        // continue
      }
    }
    this.bankMissCount++;
    this.lastBankMiss = bankIds.join("|");
    this.logger?.warn("Bank miss in router", {
      bankIds,
      missCount: this.bankMissCount,
    });
    return null;
  }
}

export default LlmRouterService;
