import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../banks/bankLoader.service";
import { ReasoningPolicyService } from "./reasoningPolicy.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("ReasoningPolicyService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "assumption_policy") {
        return { config: { maxAssumptionsPerAnswer: 3 } } as any;
      }
      if (id === "decision_support_finance") {
        return {
          framework: {
            requireOptions: true,
            requireRiskTradeoffs: true,
            requireEvidenceSummary: true,
            requireUncertaintyStatement: true,
            requireWhatChangesMyMind: true,
          },
        } as any;
      }
      if (id === "explain_style_finance") {
        return {
          templates: [
            {
              depth: "summary",
              language: "en",
              uncertaintyStyle: "Use calibrated uncertainty language.",
            },
          ],
        } as any;
      }
      return null as any;
    });
  });

  test("builds reasoning guidance from assumption/decision/explain policies", () => {
    const service = new ReasoningPolicyService();
    const guidance = service.buildGuidance({
      domain: "finance",
      outputLanguage: "en",
      answerMode: "doc_grounded_single",
    });

    expect(guidance.assumptionsLimit).toBe(3);
    expect(guidance.domain).toBe("finance");
    expect(guidance.text).toContain("Maximum explicit assumptions: 3");
    expect(guidance.text).toContain("Provide at least 2 options");
    expect(guidance.text).toContain("calibrated uncertainty language");
  });
});

