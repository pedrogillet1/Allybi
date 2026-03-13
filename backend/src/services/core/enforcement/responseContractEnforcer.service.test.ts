import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockGetBank = jest.fn();
const mockGetOptionalBank = jest.fn();

jest.mock("../banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (...args: unknown[]) => mockGetBank(...args),
  getOptionalBank: (...args: unknown[]) => mockGetOptionalBank(...args),
}));

function bankById(bankId: string): unknown {
  switch (bankId) {
    case "render_policy":
      return {
        config: {
          markdown: { allowCodeBlocks: false, maxConsecutiveNewlines: 2 },
          noJsonOutput: { enabled: true, detectJsonLike: true },
        },
        enforcementRules: {
          rules: [{ id: "RP6_MAX_ONE_QUESTION", then: { maxQuestions: 1 } }],
        },
      };
    case "ui_contracts":
      return { config: { enabled: true } };
    case "banned_phrases":
      return {
        config: { enabled: true, actionOnMatch: "strip_or_replace" },
        categories: {},
        patterns: [],
        sourceLeakage: { patterns: [] },
        robotic: { en: [], pt: [], es: [] },
      };
    case "truncation_and_limits":
      return {
        globalLimits: {
          maxResponseCharsHard: 12000,
          maxResponseTokensHard: 3500,
        },
        outputShapeLimits: {
          file_list: { maxCharsHard: 220 },
        },
      };
    case "bullet_rules":
      return { config: { enabled: true } };
    case "table_rules":
      return { config: { enabled: true, maxRowsHard: 4, maxCellCharsHard: 64 } };
    case "answer_style_policy":
      return {
        config: {
          enabled: true,
          globalRules: {
            maxQuestionsPerAnswer: 1,
            forceDoubleNewlineBetweenBlocks: false,
          },
        },
        profiles: {},
      };
    default:
      return { config: { enabled: true } };
  }
}

describe("ResponseContractEnforcerService v2", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetOptionalBank.mockReset();
    mockGetBank.mockImplementation((bankId: string) => bankById(bankId));
    mockGetOptionalBank.mockImplementation((bankId: string) => bankById(bankId));
  });

  test("reports nav_pills source-button violations without inventing content", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "Sources: Budget.xlsx\n- Budget.xlsx\nOpen this file for me.",
        attachments: [],
      },
      {
        answerMode: "nav_pills",
        language: "en",
        evidenceRequired: true,
      },
    );

    expect(out.enforcement.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "NAV_PILLS_MISSING_SOURCE_BUTTONS" }),
      ]),
    );
    expect(out.content).toContain("Open this file for me.");
  });

  test("returns json contract violations instead of fallback content", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: '{"answer":"ok"}',
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
      },
    );

    expect(out.enforcement.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "JSON_NOT_ALLOWED" }),
      ]),
    );
    expect(out.content).toBe('{"answer":"ok"}');
  });

  test("applies user-requested short constraints to sentence count", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content: "One. Two? Three! Four.",
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
        constraints: {
          userRequestedShort: true,
          maxSentences: 3,
          maxOutputTokens: 80,
        },
      },
    );

    const sentenceCount = (out.content.match(/[.!?]+(?:\s|$)/g) || []).length;
    expect(sentenceCount).toBeLessThanOrEqual(3);
  });

  test("enforces file_list char cap from centralized truncation limits", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();
    const content = "A".repeat(400);

    const out = enforcer.enforce(
      {
        content,
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
        constraints: {
          outputShape: "file_list",
        },
      },
    );

    expect(out.content.length).toBeLessThanOrEqual(220);
    expect(out.enforcement.repairs).toContain("FILE_LIST_SHAPE_BODY_TRIMMED");
  });
});
