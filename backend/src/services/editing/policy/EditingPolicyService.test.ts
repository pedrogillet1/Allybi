import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankService", () => ({
  safeEditingBank: jest.fn(),
}));

import { safeEditingBank } from "../banks/bankService";
import { EditingPolicyService } from "./EditingPolicyService";

const mockedSafeEditingBank = safeEditingBank as jest.MockedFunction<
  typeof safeEditingBank
>;

describe("EditingPolicyService", () => {
  beforeEach(() => {
    mockedSafeEditingBank.mockReset();
  });

  test("maps v2 editing policy config.thresholds and confirmation policy", () => {
    mockedSafeEditingBank.mockReturnValue({
      config: {
        thresholds: {
          silentExecuteTargetConfidence: 0.91,
          silentExecuteDecisionMargin: 0.16,
          minSimilarityForStyleOnlyEdits: 0.83,
        },
        confirmationPolicy: {
          alwaysConfirmOperators: ["DELETE_SHEET", "DELETE_ROW"],
        },
      },
      policies: {
        alwaysRequireConfirmation: ["REPLACE_SLIDE_IMAGE"],
      },
    } as any);

    const service = new EditingPolicyService();
    const policy = service.resolvePolicy();

    expect(policy.minConfidenceForAutoApply).toBe(0.91);
    expect(policy.minDecisionMarginForAutoApply).toBe(0.16);
    expect(policy.minSimilarityForAutoApply).toBe(0.83);
    expect(policy.alwaysRequireConfirmation).toContain("REPLACE_SLIDE_IMAGE");
  });

  test("evaluates policy runtime rules and returns block decision", () => {
    mockedSafeEditingBank.mockReturnValue({
      config: {
        enabled: true,
      },
      policies: {
        rules: [
          {
            ruleId: "destructive_edits_require_explicit_confirmation",
            priority: 100,
            when: {
              all: [
                { path: "signals.destructiveEdit", op: "eq", value: true },
                { path: "signals.userConfirmed", op: "neq", value: true },
              ],
            },
            then: { action: "block" },
            reasonCode: "destructive_confirmation_required",
          },
        ],
      },
    } as any);

    const service = new EditingPolicyService();
    const decision = service.decideRuntimeAction({
      operator: "DELETE_ROW",
      targetConfidence: 0.9,
      decisionMargin: 0.3,
      userConfirmed: false,
      destructiveEdit: true,
      strictMode: false,
      similarityScore: 0.9,
      styleOnlyEdit: false,
      numericTokensPreserved: true,
      entitiesPreserved: true,
      commitRequested: false,
      revisionCreated: false,
    });

    expect(decision.matched).toBe(true);
    expect(decision.blocked).toBe(true);
    expect(decision.reasonCode).toBe("destructive_confirmation_required");
  });
});
