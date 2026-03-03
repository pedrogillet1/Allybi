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
    const limits = service.resolveLimits();
    expect(limits.maxQuestions).toBe(1);
    expect(limits.minOptions).toBe(2);
    expect(limits.maxOptions).toBe(4);
  });

  test("enforces single-question output shape", () => {
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "clarification_policy") {
        return {
          config: {
            enabled: true,
            actionsContract: { thresholds: { maxQuestions: 1 } },
          },
        } as any;
      }
      return null as any;
    });

    const service = new ClarificationPolicyService();
    const question = service.enforceClarificationQuestion({
      question: "Which file do you mean. Please include format",
      preferredLanguage: "en",
    });

    expect(question.endsWith("?")).toBe(true);
    expect(question).toBe("Which file do you mean?");
  });

  test("strips apology and policy words when clarification phrases policy requires it", () => {
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "clarification_policy") {
        return {
          config: {
            enabled: true,
            actionsContract: { thresholds: { maxQuestions: 1 } },
          },
        } as any;
      }
      if (bankId === "clarification_phrases") {
        return {
          config: {
            enabled: true,
            noApologyTone: true,
            noPolicyMentions: true,
          },
        } as any;
      }
      return null as any;
    });

    const service = new ClarificationPolicyService();
    const question = service.enforceClarificationQuestion({
      question: "Sorry, which file is this policy referring to?",
      preferredLanguage: "en",
    });

    expect(question.toLowerCase()).not.toContain("sorry");
    expect(question.toLowerCase()).not.toContain("policy");
    expect(question).toBe("which file is this referring to?");
  });

  test("enforces disambiguation option min/max bounds", () => {
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "clarification_policy") {
        return {
          config: {
            enabled: true,
            actionsContract: {
              thresholds: {
                minOptions: 2,
                maxOptions: 4,
              },
            },
          },
        } as any;
      }
      if (bankId === "disambiguation_policies") {
        return {
          config: {
            enabled: true,
            optionPolicy: { minOptions: 2, maxOptions: 4 },
          },
        } as any;
      }
      return null as any;
    });

    const service = new ClarificationPolicyService();
    const options = service.enforceClarificationOptions({
      options: ["A", "B", "C", "D", "E"],
    });
    expect(options).toEqual(["A", "B", "C", "D"]);

    const tooFew = service.enforceClarificationOptions({
      options: ["OnlyOne"],
    });
    expect(tooFew).toEqual([]);
  });

  test("applies limit_options transform from clarification policy rules", () => {
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
    const options = service.enforceClarificationOptions({
      options: ["A", "B", "C", "D", "E", "F"],
    });
    expect(options).toEqual(["A", "B", "C", "D"]);
  });
});
