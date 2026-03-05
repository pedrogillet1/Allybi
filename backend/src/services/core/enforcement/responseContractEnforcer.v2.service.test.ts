import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockGetBank = jest.fn();
const mockGetOptionalBank = jest.fn();
const mockGetTypedBank = jest.fn();

jest.mock("../banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (...args: unknown[]) => mockGetBank(...args),
  getOptionalBank: (...args: unknown[]) => mockGetOptionalBank(...args),
  getTypedBank: (...args: unknown[]) => mockGetTypedBank(...args),
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
      return {
        _meta: { id: "ui_contracts", version: "1.0.0" },
        config: {
          enabled: true,
          contracts: {
            nav_pills: {
              maxIntroSentences: 1,
              maxIntroChars: 40,
              noSourcesHeader: true,
              disallowedTextPatterns: ["\\bSources?:\\b"],
              allowedAttachments: ["source_buttons"],
              disallowedAttachments: ["actions"],
              suppressActions: true,
            },
          },
          actionsContract: {
            thresholds: {
              maxIntroSentencesNavPills: 1,
              maxClarificationQuestions: 1,
            },
          },
        },
      };
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
    case "ui_receipt_shapes":
      return { config: { enabled: true }, mappings: [] };
    default:
      return { config: { enabled: true } };
  }
}

describe("ResponseContractEnforcerService v2", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetOptionalBank.mockReset();
    mockGetTypedBank.mockReset();
    mockGetBank.mockImplementation((bankId: string) => bankById(bankId));
    mockGetOptionalBank.mockImplementation((bankId: string) => bankById(bankId));
    mockGetTypedBank.mockImplementation((bankId: string) => bankById(bankId));
  });

  test("blocks nav_pills response when source_buttons attachment is missing", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.v2.service"
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
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("nav_pills_missing_buttons");
  });

  test("uses ui_contracts nav maxIntroChars instead of hardcoded limit", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.v2.service"
    );
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "Open the quarterly board deck and jump to revenue bridge details please.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [{ id: "doc-1", label: "Deck.pdf" }],
          } as any,
        ],
      },
      {
        answerMode: "nav_pills",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content.length).toBeLessThanOrEqual(40);
  });

  test("blocks json-like outputs when no-json policy is enabled", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.v2.service"
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

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("json_not_allowed");
  });

  test("applies user-requested short constraints to sentence count", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.v2.service"
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

    expect(out.enforcement.blocked).toBe(false);
    const sentenceCount = (out.content.match(/[.!?]+(?:\s|$)/g) || []).length;
    expect(sentenceCount).toBeLessThanOrEqual(3);
  });
});
