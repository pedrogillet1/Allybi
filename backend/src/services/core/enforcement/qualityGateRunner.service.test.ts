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

  test("labels inference instead of exact fact when claim strength bank says so", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) => {
        if (type === "claim_strength_matrix") {
          return {
            _meta: { id: "claim_strength_matrix" },
            config: { enabled: true },
            rules: [
              {
                id: "CSM_001_inference_must_be_labeled",
                trigger: "derived answers cannot be exact",
                check: "output.answerMethod.in(['inferred','derived','calculated']) == true AND output.claimLabel.in(['exact','verbatim']) == true",
                failureAction: "DOWNGRADE_TO_INFERENCE",
              },
            ],
          };
        }
        return null;
      },
    } as any);

    const out = await runner.runGates("Revenue increased based on the table trend.", {
      answerMode: "doc_grounded_single",
      diPolicyOutput: {
        answerMethod: "inferred",
        claimLabel: "exact",
      },
    });

    expect(
      out.results.find((g) => g.gateName === "CSM_001_inference_must_be_labeled")
        ?.passed,
    ).toBe(false);
  });

  test("fails numeric reconciliation when parts do not tie to total", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) => {
        if (type === "numeric_reconciliation_rules") {
          return {
            _meta: { id: "numeric_reconciliation_rules" },
            config: { enabled: true },
            rules: [
              {
                id: "NRR_TEST_mismatch",
                trigger: "parts and total mismatch",
                check: "context.arithmeticCheck == true AND output.statedTotal != sum(output.statedParts)",
                failureAction: "BLOCK_AND_REVIEW_TOTAL",
              },
            ],
          };
        }
        return null;
      },
    } as any);

    const out = await runner.runGates("10 + 20 + 30 = 70", {
      answerMode: "doc_grounded_single",
      diPolicyContext: { arithmeticCheck: true },
      diPolicyOutput: { statedParts: [10, 20, 30], statedTotal: 70 },
    });

    expect(out.results.find((g) => g.gateName === "NRR_TEST_mismatch")?.passed).toBe(
      false,
    );
  });

  test("fails field exactness when exact answer lacks source cell support", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) => {
        if (type === "field_exactness_rules") {
          return {
            _meta: { id: "field_exactness_rules" },
            config: { enabled: true },
            rules: [
              {
                id: "FER_TEST_exact_field",
                trigger: "exact answer missing cell support",
                check: "output.claimLabel == 'exact' AND output.supportedByTableCell == false AND output.supportedBySpan == false",
                failureAction: "REQUEST_CITED_FIELD",
              },
            ],
          };
        }
        return null;
      },
    } as any);

    const out = await runner.runGates("The invoice total is 100.", {
      answerMode: "doc_grounded_single",
      diPolicyOutput: {
        claimLabel: "exact",
        supportedByTableCell: false,
        supportedBySpan: false,
      },
    });

    expect(out.results.find((g) => g.gateName === "FER_TEST_exact_field")?.passed).toBe(
      false,
    );
  });

  test("blocks pii exposure using pii pattern bank for identity domain", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "sensitive_content_rules") {
        return {
          _meta: { id: "sensitive_content_rules" },
          config: { enabled: true },
          rules: [
            {
              domains: ["identity"],
              patternIds: ["PII_EMAIL"],
            },
          ],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) => {
        if (type === "pii_patterns") {
          return {
            _meta: { id: "pii_patterns" },
            config: { enabled: true },
            patterns: [
              {
                id: "PII_EMAIL",
                pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
              },
            ],
          };
        }
        return null;
      },
    } as any);

    const out = await runner.runGates("Contact the user at alice@example.com.", {
      answerMode: "doc_grounded_single",
      domainHint: "identity",
    });

    expect(
      out.results.find(
        (g) => g.gateName === "redaction_default_pii_identity_tax_banking",
      )?.passed,
    ).toBe(false);
  });

  test("blocks medical high-stakes language without qualifier from bank", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) => {
        if (type === "high_stakes_response_rules") {
          return {
            _meta: { id: "high_stakes_response_rules" },
            config: { enabled: true },
            rules: [
              {
                id: "HSR_TEST_medical",
                trigger: "unsafe diagnosis language",
                check: "context.domain == 'medical' AND output.medicalDiagnosisLike == true AND output.highStakesQualifierPresent == false",
                failureAction: "BLOCK_HIGH_STAKES_MEDICAL",
              },
            ],
          };
        }
        return null;
      },
    } as any);

    const out = await runner.runGates("You have pneumonia and I prescribe amoxicillin.", {
      answerMode: "doc_grounded_single",
      domainHint: "medical",
      diPolicyContext: { domain: "medical" },
      diPolicyOutput: {
        medicalDiagnosisLike: true,
        highStakesQualifierPresent: false,
      },
    });

    expect(out.results.find((g) => g.gateName === "HSR_TEST_medical")?.passed).toBe(
      false,
    );
  });

  test("flags bilingual field exactness mismatch instead of blocking clear answer outright", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) => {
        if (type === "field_exactness_rules") {
          return {
            _meta: { id: "field_exactness_rules" },
            config: { enabled: true },
            rules: [
              {
                id: "FER_TEST_bilingual",
                trigger: "translation ambiguity with exact label",
                check: "context.queryLang != context.docLang AND context.translationAmbiguity == true AND output.claimLabel == 'exact'",
                failureAction: "LABEL_TRANSLATED_FIELD",
              },
            ],
          };
        }
        return null;
      },
    } as any);

    const out = await runner.runGates("The field means monthly fee.", {
      answerMode: "doc_grounded_single",
      language: "en",
      diPolicyContext: {
        queryLang: "en",
        docLang: "pt",
        translationAmbiguity: true,
      },
      diPolicyOutput: {
        claimLabel: "exact",
      },
    });

    const gate = out.results.find((g) => g.gateName === "FER_TEST_bilingual");
    expect(gate).toBeDefined();
    expect(gate?.passed).toBe(false);
  });
});
