import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockGetBank = jest.fn();

jest.mock("../banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (...args: unknown[]) => mockGetBank(...args),
}));

function bankById(bankId: string): unknown {
  switch (bankId) {
    case "render_policy":
      return {
        config: {
          markdown: { allowCodeBlocks: false, maxConsecutiveNewlines: 2 },
          noJsonOutput: { enabled: true, detectJsonLike: true },
        },
      };
    case "ui_contracts":
      return { config: { enabled: true } };
    case "banned_phrases":
      return {
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
      return { config: { enabled: true } };
    default:
      return {};
  }
}

describe("ResponseContractEnforcerService nav_pills contract", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetBank.mockImplementation((bankId: string) => bankById(bankId));
  });

  test("blocks nav_pills response when source_buttons attachment is missing", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "Sources: Contract.pdf\\n- Contract.pdf\\nOpen the file and jump to the clause now.",
        attachments: [],
      },
      {
        answerMode: "nav_pills",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(true);
    expect(out.enforcement.reasonCode).toBe("nav_pills_missing_buttons");
    expect(out.enforcement.warnings).toContain(
      "NAV_PILLS_MISSING_SOURCE_BUTTONS",
    );
  });

  test("strips inline sources text and passes when source buttons are present", async () => {
    const { ResponseContractEnforcerService } = await import(
      "./responseContractEnforcer.service"
    );
    const enforcer = new ResponseContractEnforcerService();

    const out = enforcer.enforce(
      {
        content:
          "Sources: Budget.xlsx\\n- Budget.xlsx\\nOpen the budget sheet and pick a section for me to jump to.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [{ id: "doc-1", label: "Budget.xlsx" }],
          } as any,
        ],
      },
      {
        answerMode: "nav_pills",
        language: "en",
      },
    );

    expect(out.enforcement.blocked).toBe(false);
    expect(out.content.length).toBeLessThanOrEqual(90);
    expect(out.enforcement.repairs).toContain("NAV_PILLS_BODY_TRIMMED");
  });
});
