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
import { computeFallbackList } from "./fallbackRouteResolver";
import { resolvePrimaryRoute } from "./primaryRouteResolver";
import {
  bool,
  pickHealth,
  type BankLoader,
  type CompositionLanePolicyBank,
  type FeatureFlagsBank,
  type PrimaryTarget,
  type ProviderCapabilitiesBank,
  type ProviderFallbacksBank,
  type RouteContext,
  type RouterLogger,
} from "./llmRouter.shared";

export type { BankLoader, ProviderHealth, RouteContext, RouterLogger } from "./llmRouter.shared";

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

    return computeFallbackList(
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

    // 2) Determine routing reason and primary target from dedicated resolvers
    const { reason, primary } = resolvePrimaryRoute({
      ctx,
      caps,
      lanePolicy,
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
    const fbList = computeFallbackList(
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
