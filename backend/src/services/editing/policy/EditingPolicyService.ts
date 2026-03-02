import type { EditPolicy } from "../editing.types";
import { safeEditingBank } from "../banks/bankService";

const DEFAULT_EDIT_POLICY: EditPolicy = {
  minConfidenceForAutoApply: 0.88,
  minDecisionMarginForAutoApply: 0.14,
  minSimilarityForAutoApply: 0.28,
  alwaysRequireConfirmation: ["EDIT_RANGE", "REPLACE_SLIDE_IMAGE"],
};

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export class EditingPolicyService {
  resolvePolicy(override?: Partial<EditPolicy>): EditPolicy {
    const bank = safeEditingBank<Record<string, unknown>>("editing_policy");
    const fromBank = bank && typeof bank === "object" ? bank : {};
    const thresholds = (fromBank as any)?.config?.thresholds || {};
    const confirmationPolicy = (fromBank as any)?.config?.confirmationPolicy || {};
    const legacyPolicy = (fromBank as any)?.policy || {};
    const v2Policies = (fromBank as any)?.policies || {};
    const alwaysRequireConfirmationRaw = Array.isArray(
      fromBank.alwaysRequireConfirmation,
    )
      ? fromBank.alwaysRequireConfirmation
      : Array.isArray(legacyPolicy?.alwaysRequireConfirmation)
        ? legacyPolicy.alwaysRequireConfirmation
        : Array.isArray(v2Policies?.alwaysRequireConfirmation)
          ? v2Policies.alwaysRequireConfirmation
          : Array.isArray(confirmationPolicy?.alwaysConfirmOperators)
            ? confirmationPolicy.alwaysConfirmOperators
        : [];

    return {
      minConfidenceForAutoApply: toNumber(
        (fromBank as any)?.minConfidenceForAutoApply ??
          legacyPolicy?.minConfidenceForAutoApply ??
          thresholds?.silentExecuteTargetConfidence ??
          thresholds?.minTargetConfidence,
        override?.minConfidenceForAutoApply ??
          DEFAULT_EDIT_POLICY.minConfidenceForAutoApply,
      ),
      minDecisionMarginForAutoApply: toNumber(
        (fromBank as any)?.minDecisionMarginForAutoApply ??
          legacyPolicy?.minDecisionMarginForAutoApply ??
          thresholds?.silentExecuteDecisionMargin ??
          thresholds?.minDecisionMargin,
        override?.minDecisionMarginForAutoApply ??
          DEFAULT_EDIT_POLICY.minDecisionMarginForAutoApply,
      ),
      minSimilarityForAutoApply: toNumber(
        (fromBank as any)?.minSimilarityForAutoApply ??
          legacyPolicy?.minSimilarityForAutoApply ??
          thresholds?.minSimilarityForStyleOnlyEdits ??
          thresholds?.minSemanticSimilarity,
        override?.minSimilarityForAutoApply ??
          DEFAULT_EDIT_POLICY.minSimilarityForAutoApply,
      ),
      alwaysRequireConfirmation: (
        override?.alwaysRequireConfirmation ||
        alwaysRequireConfirmationRaw ||
        DEFAULT_EDIT_POLICY.alwaysRequireConfirmation
      )
        .map((v: unknown) => String(v || "").trim())
        .filter(Boolean) as EditPolicy["alwaysRequireConfirmation"],
    };
  }
}

export { DEFAULT_EDIT_POLICY };
