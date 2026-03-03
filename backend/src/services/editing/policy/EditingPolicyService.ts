import type { EditPolicy } from "../editing.types";
import { safeEditingBank } from "../banks/bankService";
import { PolicyRuntimeEngine } from "../../core/policy/policyRuntimeEngine.service";

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

type EditingPolicyBank = {
  config?: Record<string, unknown>;
  alwaysRequireConfirmation?: unknown[];
  policy?: Record<string, unknown>;
  policies?: Record<string, unknown>;
  rules?: Array<Record<string, unknown>>;
};

export type EditingPolicyRuntimeDecision = {
  matched: boolean;
  action: string;
  routeTo: string | null;
  reasonCode: string | null;
  blocked: boolean;
  ruleId: string | null;
};

export class EditingPolicyService {
  private readonly engine = new PolicyRuntimeEngine();

  resolvePolicy(override?: Partial<EditPolicy>): EditPolicy {
    const bank = safeEditingBank<EditingPolicyBank>("editing_policy");
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

  decideRuntimeAction(input: {
    operator: string;
    targetConfidence: number;
    decisionMargin: number;
    userConfirmed: boolean;
    destructiveEdit: boolean;
    strictMode: boolean;
    similarityScore: number;
    styleOnlyEdit: boolean;
    numericTokensPreserved: boolean;
    entitiesPreserved: boolean;
    commitRequested: boolean;
    revisionCreated: boolean;
    newFactsIntroduced?: number;
  }): EditingPolicyRuntimeDecision {
    const bank = safeEditingBank<EditingPolicyBank>("editing_policy");
    const runtime = {
      signals: {
        operator: String(input.operator || "").trim(),
        targetConfidence: Number(input.targetConfidence),
        decisionMargin: Number(input.decisionMargin),
        userConfirmed: input.userConfirmed === true,
        destructiveEdit: input.destructiveEdit === true,
        strictMode: input.strictMode === true,
        similarityScore: Number(input.similarityScore),
        numericTokensPreserved: input.numericTokensPreserved === true,
        entitiesPreserved: input.entitiesPreserved === true,
        commitRequested: input.commitRequested === true,
        revisionCreated: input.revisionCreated === true,
      },
      metrics: {
        styleOnlyEdit: input.styleOnlyEdit === true,
        newFactsIntroduced: Number(input.newFactsIntroduced || 0),
      },
    } as Record<string, unknown>;

    const match = this.engine.firstMatch({
      policyBank: bank as Record<string, unknown>,
      runtime,
    });
    if (!match || match.ruleId === "__default__") {
      return {
        matched: false,
        action: "allow",
        routeTo: null,
        reasonCode: null,
        blocked: false,
        ruleId: null,
      };
    }

    const action = String(match.then.action || "").trim().toLowerCase() || "allow";
    const routeTo = String(match.then.routeTo || "").trim() || null;
    const blocked = action === "block";
    return {
      matched: true,
      action,
      routeTo,
      reasonCode: match.reasonCode,
      blocked,
      ruleId: match.ruleId,
    };
  }
}

export { DEFAULT_EDIT_POLICY };
