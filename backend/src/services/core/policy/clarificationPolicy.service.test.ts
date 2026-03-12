import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../banks/bankLoader.service";
import { ClarificationPolicyService } from "./clarificationPolicy.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("ClarificationPolicyService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
  });

  test("resolves thresholds from clarification policy bank", () => {
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "clarification_policy") {
        return {
          config: {
            enabled: true,
            actionsContract: {
              thresholds: {
                maxQuestions: 1,
                minOptions: 2,
                maxOptions: 4,
              },
            },
          },
        } as any;
      }
      return null as any;
    });

    const service = new ClarificationPolicyService();
    expect(service.resolveLimits()).toEqual({
      enabled: true,
      maxQuestions: 1,
      minOptions: 2,
      maxOptions: 4,
    });
  });

  test("returns normalized decision shape for matching policy rule", () => {
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "clarification_policy") {
        return {
          config: { enabled: true },
          policies: {
            rules: [
              {
                ruleId: "clarify_many_candidates",
                priority: 100,
                when: { path: "metrics.candidateCount", op: "gt", value: 4 },
                then: {
                  action: "clarify",
                  routeTo: "disambiguation",
                  terminal: true,
                  constraints: {
                    maxQuestions: 1,
                    minOptions: 2,
                    maxOptions: 4,
                  },
                },
              },
            ],
          },
        } as any;
      }
      return null as any;
    });

    const service = new ClarificationPolicyService();
    const decision = service.decide({
      runtime: {
        signals: {},
        metrics: { candidateCount: 6 },
      },
    });

    expect(decision).toMatchObject({
      blocked: true,
      action: "clarify",
      routeTo: "disambiguation",
      terminal: true,
      constraints: {
        maxQuestions: 1,
        minOptions: 2,
        maxOptions: 4,
      },
    });
  });

  test("applies transform overrides to resolved limits", () => {
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "clarification_policy") {
        return {
          config: {
            enabled: true,
            actionsContract: {
              thresholds: {
                minOptions: 2,
                maxOptions: 6,
              },
            },
          },
          policies: {
            rules: [
              {
                ruleId: "limit_options_rule",
                priority: 100,
                when: { path: "metrics.candidateCount", op: "gt", value: 4 },
                then: {
                  transform: [{ type: "limit_options", min: 2, max: 4 }],
                },
              },
            ],
          },
        } as any;
      }
      return null as any;
    });

    const service = new ClarificationPolicyService();
    const limits = service.resolveLimits({
      runtime: {
        signals: {},
        metrics: { candidateCount: 6 },
      },
    });

    expect(limits.minOptions).toBe(2);
    expect(limits.maxOptions).toBe(4);
  });
});
