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
});

