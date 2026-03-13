import type { LlmModelId, LlmProviderId, LlmRouteReason } from "../types/llm.types";
import { toCostFamilyModel } from "./llmCostCalculator";
import {
  hasAnyReason,
  isNavPills,
  type CompositionLanePolicyBank,
  type PrimaryTarget,
  type ProviderCapabilitiesBank,
  type RouteContext,
} from "./llmRouter.shared";

export function computeRouteReason(ctx: RouteContext): LlmRouteReason {
  if (
    ctx.numericStrict ||
    hasAnyReason(ctx, ["numeric_truncation_detected", "numeric_not_in_source"])
  ) {
    return "numeric_strict";
  }
  if (ctx.quoteStrict || hasAnyReason(ctx, ["quote_too_long"])) {
    return "quote_strict";
  }
  if (ctx.hallucinationGuard || hasAnyReason(ctx, ["hallucination_risk_high"])) {
    return "hallucination_guard";
  }
  if (hasAnyReason(ctx, ["wrong_doc_detected"])) return "policy_retry";
  if (hasAnyReason(ctx, ["refusal_required"])) return "fallback_only";
  if (ctx.stage === "final") return "quality_finish";
  if (String(ctx.answerMode || "").toLowerCase() === "doc_grounded_table") {
    return "quality_finish";
  }
  if (isNavPills(ctx)) return "fast_path";
  if (
    typeof ctx.latencyBudgetMs === "number" &&
    ctx.latencyBudgetMs > 0 &&
    ctx.latencyBudgetMs <= 2000
  ) {
    return "fast_path";
  }
  return "fast_path";
}

function selectLanePolicyTarget(
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
    if (Array.isArray(when.reasons) && when.reasons.length > 0 && !when.reasons.includes(reason)) {
      continue;
    }
    if (Array.isArray(when.answerModes) && when.answerModes.length > 0 && !when.answerModes.includes(answerMode)) {
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

function choosePrimaryTarget(
  ctx: RouteContext,
  reason: LlmRouteReason,
  caps: ProviderCapabilitiesBank | null,
  lanePolicy: CompositionLanePolicyBank | null,
  opts: { preferLocalInDev: boolean },
): PrimaryTarget {
  const bankDraft = caps?.defaults?.draft;
  const bankFinal = caps?.defaults?.final;
  const DEFAULT_DRAFT = {
    provider: "gemini" as LlmProviderId,
    model: "gemini-2.5-flash" as LlmModelId,
  };
  const DEFAULT_FINAL = {
    provider: "openai" as LlmProviderId,
    model: "gpt-5.2" as LlmModelId,
  };
  const localDraft = {
    provider: "local" as LlmProviderId,
    model: "local-default" as LlmModelId,
  };

  const stage: "draft" | "final" =
    reason === "quality_finish" ||
    reason === "numeric_strict" ||
    reason === "quote_strict" ||
    reason === "hallucination_guard" ||
    reason === "policy_retry"
      ? "final"
      : ctx.stage;

  if (stage === "final") {
    const laneTarget = selectLanePolicyTarget(ctx, reason, stage, lanePolicy);
    if (laneTarget) return laneTarget;
    if ((ctx.answerMode ?? "") === "doc_grounded_quote") {
      return {
        provider: "openai",
        model: "gpt-5.2",
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

  const laneTarget = selectLanePolicyTarget(ctx, reason, stage, lanePolicy);
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

export function resolvePrimaryRoute(input: {
  ctx: RouteContext;
  caps: ProviderCapabilitiesBank | null;
  lanePolicy: CompositionLanePolicyBank | null;
  preferLocalInDev: boolean;
}): { reason: LlmRouteReason; primary: PrimaryTarget } {
  const reason = computeRouteReason(input.ctx);
  const primary = choosePrimaryTarget(
    input.ctx,
    reason,
    input.caps,
    input.lanePolicy,
    { preferLocalInDev: input.preferLocalInDev },
  );
  return { reason, primary };
}
