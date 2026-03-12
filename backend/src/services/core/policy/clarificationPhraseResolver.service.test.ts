import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../banks/bankLoader.service";
import { ClarificationPhraseResolverService } from "./clarificationPhraseResolver.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("ClarificationPhraseResolverService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
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

    const service = new ClarificationPhraseResolverService();
    const question = service.renderQuestion({
      question: "Which file do you mean. Please include format",
      preferredLanguage: "en",
    });

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

    const service = new ClarificationPhraseResolverService();
    const question = service.renderQuestion({
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
      return null as any;
    });

    const service = new ClarificationPhraseResolverService();
    expect(
      service.filterOptions({ options: ["A", "B", "C", "D", "E"] }),
    ).toEqual(["A", "B", "C", "D"]);
    expect(service.filterOptions({ options: ["OnlyOne"] })).toEqual([]);
  });
});
