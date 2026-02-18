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
    const alwaysRequireConfirmationRaw = Array.isArray(fromBank.alwaysRequireConfirmation)
      ? fromBank.alwaysRequireConfirmation
      : Array.isArray((fromBank as any)?.policy?.alwaysRequireConfirmation)
        ? (fromBank as any).policy.alwaysRequireConfirmation
        : [];

    return {
      minConfidenceForAutoApply: toNumber(
        (fromBank as any)?.minConfidenceForAutoApply ?? (fromBank as any)?.policy?.minConfidenceForAutoApply,
        override?.minConfidenceForAutoApply ?? DEFAULT_EDIT_POLICY.minConfidenceForAutoApply,
      ),
      minDecisionMarginForAutoApply: toNumber(
        (fromBank as any)?.minDecisionMarginForAutoApply ?? (fromBank as any)?.policy?.minDecisionMarginForAutoApply,
        override?.minDecisionMarginForAutoApply ?? DEFAULT_EDIT_POLICY.minDecisionMarginForAutoApply,
      ),
      minSimilarityForAutoApply: toNumber(
        (fromBank as any)?.minSimilarityForAutoApply ?? (fromBank as any)?.policy?.minSimilarityForAutoApply,
        override?.minSimilarityForAutoApply ?? DEFAULT_EDIT_POLICY.minSimilarityForAutoApply,
      ),
      alwaysRequireConfirmation: (
        override?.alwaysRequireConfirmation
        || alwaysRequireConfirmationRaw
        || DEFAULT_EDIT_POLICY.alwaysRequireConfirmation
      ).map((v: unknown) => String(v || "").trim()).filter(Boolean) as EditPolicy["alwaysRequireConfirmation"],
    };
  }
}

export { DEFAULT_EDIT_POLICY };
