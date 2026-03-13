import "reflect-metadata";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

const mockGetOptionalBank = jest.fn();

jest.mock("../banks/bankLoader.service", () => ({
  __esModule: true,
  getOptionalBank: (...args: unknown[]) => mockGetOptionalBank(...args),
}));

describe("QualityGateRunnerService", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    mockGetOptionalBank.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test("fails closed in strict env when required verifier hook bank is missing", async () => {
    process.env.NODE_ENV = "production";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "quality_gates") {
        return {
          _meta: { id: "quality_gates" },
          config: {
            modes: {
              byEnv: {
                production: { failClosed: true },
              },
            },
            integrationHooks: {
              dedupeBankId: "dedupe_and_repetition",
            },
          },
          gateOrder: ["repetition_and_banned_phrases"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService();

    await expect(
      runner.runGates("hello", { answerMode: "general_answer" }),
    ).rejects.toThrow(/Required quality integration hook bank missing/i);
  });

  test("warns in non-strict env when required verifier hook bank is missing", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "quality_gates") {
        return {
          _meta: { id: "quality_gates" },
          config: {
            modes: {
              byEnv: {
                dev: { failClosed: false },
              },
            },
            integrationHooks: {
              piiLabelsBankId: "pii_field_labels",
            },
          },
          gateOrder: ["privacy_minimal"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService();

    const out = await runner.runGates("hello", {
      answerMode: "general_answer",
    });

    expect(
      out.results.find((g) => g.gateName === "quality_integration_hook_presence")
        ?.failureCode,
    ).toBe("QUALITY_HOOK_BANK_MISSING");
    expect(out.allPassed).toBe(false);
  });

  test("respects declared gate order and does not inject no_raw_json implicitly", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "quality_gates") {
        return {
          _meta: { id: "quality_gates" },
          config: { integrationHooks: {} },
          gateOrder: ["markdown_sanity"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService();

    const out = await runner.runGates('{"raw": true}', {
      answerMode: "general_answer",
    });

    expect(out.results.map((g) => g.gateName)).toEqual(["markdown_sanity"]);
  });

  test("executes configured nav verifier and emits stable failure code", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "quality_gates") {
        return {
          _meta: { id: "quality_gates" },
          config: { integrationHooks: {} },
          gateOrder: ["nav_pills_enforcement"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService();

    const out = await runner.runGates("Sources: report.pdf", {
      answerMode: "nav_pills",
      sourceButtonsCount: 0,
    });

    const gate = out.results.find((g) => g.gateName === "nav_pills_enforcement");
    expect(gate?.passed).toBe(false);
    expect(gate?.failureCode).toBe("NAV_PILLS_CONTRACT_VIOLATION");
  });

  test("evaluates repetition verifier from declared hook bank", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "quality_gates") {
        return {
          _meta: { id: "quality_gates" },
          config: {
            integrationHooks: {
              dedupeBankId: "dedupe_and_repetition",
            },
          },
          gateOrder: ["repetition_and_banned_phrases"],
        };
      }
      if (bankId === "dedupe_and_repetition") {
        return {
          _meta: { id: "dedupe_and_repetition" },
          bannedPhrases: ["do not use this phrase"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService();

    const out = await runner.runGates("Please do not use this phrase.", {
      answerMode: "general_answer",
    });

    const gate = out.results.find(
      (g) => g.gateName === "repetition_and_banned_phrases",
    );
    expect(gate?.passed).toBe(false);
    expect(gate?.failureCode).toBe("REPETITION_OR_BANNED_PHRASE");
  });

  test("evaluates privacy verifier and emits pii failure code", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "quality_gates") {
        return {
          _meta: { id: "quality_gates" },
          config: {
            integrationHooks: {
              piiLabelsBankId: "pii_field_labels",
            },
          },
          gateOrder: ["privacy_minimal"],
        };
      }
      if (bankId === "pii_field_labels") {
        return {
          _meta: { id: "pii_field_labels" },
          piiPatterns: ["secret customer id"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService();

    const out = await runner.runGates("The secret customer id is exposed.", {
      answerMode: "general_answer",
    });

    const gate = out.results.find((g) => g.gateName === "privacy_minimal");
    expect(gate?.passed).toBe(false);
    expect(gate?.failureCode).toBe("PII_DETECTED");
  });

  test("evaluates style sub-gates for robotic lead-ins, canned empathy, repetition, and confidence mismatch", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "quality_gates") {
        return {
          _meta: { id: "quality_gates" },
          config: {
            integrationHooks: {
              antiRoboticBankId: "anti_robotic_style_rules",
              cannedEmpathyBankId: "eval_style_canned_empathy",
            },
          },
          gateOrder: [
            "style_opener_naturalness",
            "style_empathy_authenticity",
            "style_repetition_control",
            "style_confidence_alignment",
            "style_domain_voice_match",
            "style_conversational_flow",
          ],
        };
      }
      if (bankId === "anti_robotic_style_rules") {
        return {
          _meta: { id: "anti_robotic_style_rules" },
          bannedLeadins: {
            en: ["Based on the provided information,"],
          },
        };
      }
      if (bankId === "eval_style_canned_empathy") {
        return {
          _meta: { id: "eval_style_canned_empathy" },
          bans: ["I know this can be difficult"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService();

    const out = await runner.runGates(
      "Based on the provided information, I know this can be difficult. The document shows the clause applies. The document shows the clause applies.",
      {
        answerMode: "general_answer",
        language: "en",
        domainHint: "legal",
        evidenceStrength: "low",
        turnStyleState: {
          recentLeadSignatures: ["the document shows"],
          recentCloserSignatures: ["clause applies"],
        },
      },
    );

    const openerGate = out.results.find((g) => g.gateName === "style_opener_naturalness");
    const empathyGate = out.results.find((g) => g.gateName === "style_empathy_authenticity");
    const repetitionGate = out.results.find((g) => g.gateName === "style_repetition_control");
    const confidenceGate = out.results.find((g) => g.gateName === "style_confidence_alignment");

    expect(openerGate?.passed).toBe(false);
    expect(openerGate?.failureCode).toBe("STYLE_OPENER_NOT_NATURAL");
    expect(empathyGate?.passed).toBe(false);
    expect(empathyGate?.failureCode).toBe("STYLE_EMPATHY_INAUTHENTIC");
    expect(repetitionGate?.passed).toBe(false);
    expect(repetitionGate?.failureCode).toBe("STYLE_REPETITION_DETECTED");
    expect(confidenceGate?.passed).toBe(false);
    expect(confidenceGate?.failureCode).toBe("STYLE_CONFIDENCE_MISMATCH");
    expect(openerGate?.issues ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Robotic lead-in detected"),
      ]),
    );
  });

  test("style contract aggregates sub-gate failures for compatibility", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "quality_gates") {
        return {
          _meta: { id: "quality_gates" },
          config: {
            integrationHooks: {
              antiRoboticBankId: "anti_robotic_style_rules",
              cannedEmpathyBankId: "eval_style_canned_empathy",
            },
          },
          gateOrder: ["style_contract"],
        };
      }
      if (bankId === "anti_robotic_style_rules") {
        return {
          _meta: { id: "anti_robotic_style_rules" },
          bannedLeadins: {
            en: ["Based on the provided information,"],
          },
        };
      }
      if (bankId === "eval_style_canned_empathy") {
        return {
          _meta: { id: "eval_style_canned_empathy" },
          bans: ["I know this can be difficult"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } = await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService();

    const out = await runner.runGates(
      "Based on the provided information, I know this can be difficult. The document shows the clause applies.",
      {
        answerMode: "general_answer",
        language: "en",
        evidenceStrength: "low",
      },
    );

    const gate = out.results.find((g) => g.gateName === "style_contract");
    expect(gate?.passed).toBe(false);
    expect(gate?.failureCode).toBe("STYLE_CONTRACT_VIOLATION");
    expect(gate?.issues ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Robotic lead-in detected"),
        expect.stringContaining("Canned empathy detected"),
        expect.stringContaining("Confidence is stronger than the evidence justifies."),
      ]),
    );
  });
});
