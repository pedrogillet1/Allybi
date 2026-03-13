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

  test("fails closed in strict env when required quality hook bank is missing", async () => {
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
              docGroundingChecksBankId: "doc_grounding_checks",
            },
          },
          gateOrder: ["doc_grounding_minimums"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: () => null,
    } as any);

    await expect(
      runner.runGates("hello", { answerMode: "doc_grounded_single" }),
    ).rejects.toThrow(/Required quality integration hook bank missing/i);
  });

  test("warns in non-strict env when required quality hook bank is missing", async () => {
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
              hallucinationGuardsBankId: "hallucination_guards",
            },
          },
          gateOrder: ["doc_grounding_minimums"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: () => null,
    } as any);

    const out = await runner.runGates("hello", {
      answerMode: "doc_grounded_single",
      evidenceItems: [],
    });

    expect(
      out.results.some(
        (g) => g.gateName === "quality_integration_hook_presence",
      ),
    ).toBe(true);
    expect(out.allPassed).toBe(false);
  });

  test("executes configured doc grounding gate and fails without evidence", async () => {
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
            integrationHooks: {},
          },
          gateOrder: ["doc_grounding_minimums"],
        };
      }
      return null;
    });

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: () => null,
    } as any);

    const out = await runner.runGates("answer", {
      answerMode: "doc_grounded_single",
      evidenceItems: [],
    });

    const gate = out.results.find(
      (g) => g.gateName === "doc_grounding_minimums",
    );
    expect(gate).toBeDefined();
    expect(gate?.passed).toBe(false);
  });

  test("applies domain validation override checks when available", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: () => null,
      getValidationPolicies: () => ({
        _meta: { id: "medical_validation_policies" },
        config: { enabled: true },
        policies: [{ check: "units_present_for_numeric" }],
      }),
      getRedactionAndSafetyRules: () => null,
    } as any);

    const out = await runner.runGates("Total is 100", {
      domainHint: "medical",
    });

    const gate = out.results.find(
      (g) => g.gateName === "domain_validation_units_present_for_numeric",
    );
    expect(gate).toBeDefined();
    expect(gate?.passed).toBe(false);
  });

  test("evaluates source_policy bank rules expression-by-expression", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) =>
        type === "source_policy"
          ? {
              _meta: { id: "source_policy" },
              config: { enabled: true },
              rules: [
                {
                  id: "SRC_TEST_rule_eval",
                  trigger: "nav mode inline sources",
                  check: "answerMode.in(['nav_pills']) == true AND output.matchesPattern('sources\\\\s*:', 'i') == true",
                  failureAction: "STRIP_INLINE_SOURCES",
                },
              ],
            }
          : null,
    } as any);

    const out = await runner.runGates("Sources: report.pdf", {
      answerMode: "nav_pills",
    });

    const perRule = out.results.find((g) => g.gateName === "SRC_TEST_rule_eval");
    const aggregate = out.results.find(
      (g) => g.gateName === "source_policy_navigation_mode",
    );
    expect(perRule).toBeDefined();
    expect(perRule?.passed).toBe(false);
    expect(perRule?.actionOnFail).toBe("STRIP_INLINE_SOURCES");
    expect(aggregate?.passed).toBe(false);
  });

  test("evaluates numeric_integrity rules with helpers (sum + OR vice versa)", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) =>
        type === "numeric_integrity"
          ? {
              _meta: { id: "numeric_integrity" },
              config: { enabled: true },
              rules: [
                {
                  id: "NUM_TEST_sum",
                  trigger: "bad total",
                  check: "output.statedTotal != sum(output.statedParts) AND context.arithmeticCheck == true",
                  failureAction: "BLOCK_AND_REGEN",
                },
                {
                  id: "NUM_TEST_vice_versa",
                  trigger: "semantic flip",
                  check: "source.valueSemantic == 'cumulative' AND output.valueSemantic == 'incremental' OR vice versa",
                  failureAction: "BLOCK_AND_REGEN",
                },
              ],
            }
          : null,
    } as any);

    const out = await runner.runGates("Total is 7.", {
      answerMode: "doc_grounded_single",
      diPolicyContext: { arithmeticCheck: true },
      diPolicyOutput: { statedTotal: 7, statedParts: [2, 2], valueSemantic: "incremental" },
      diPolicySource: { valueSemantic: "cumulative" },
    });

    expect(out.results.find((g) => g.gateName === "NUM_TEST_sum")?.passed).toBe(
      false,
    );
    expect(
      out.results.find((g) => g.gateName === "NUM_TEST_vice_versa")?.passed,
    ).toBe(false);
    expect(
      out.results.find((g) => g.gateName === "numeric_integrity_currency_consistency")
        ?.passed,
    ).toBe(false);
  });

  test("evaluates wrong_doc_lock and ambiguity rules from bank checks", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) => {
        if (type === "wrong_doc_lock") {
          return {
            _meta: { id: "wrong_doc_lock" },
            config: { enabled: true },
            rules: [
              {
                id: "WDL_TEST_any",
                trigger: "wrong doc",
                check: "context.explicitDocRef.present == true AND output.sourceDocs.any(d => d != context.explicitDocRef.id)",
                failureAction: "REQUIRE_DOC_LOCK",
              },
            ],
          };
        }
        if (type === "ambiguity_questions") {
          return {
            _meta: { id: "ambiguity_questions" },
            config: { enabled: true },
            rules: [
              {
                id: "AMB_TEST_count",
                trigger: "broad scope",
                check: "context.matchedDocs.count >= 5 AND context.narrowingSignals.count == 0",
                failureAction: "ASK_CLARIFY_ONE",
              },
            ],
          };
        }
        return null;
      },
    } as any);

    const out = await runner.runGates("Can you help?", {
      answerMode: "doc_grounded_single",
      explicitDocRef: true,
      diPolicyContext: {
        explicitDocRefId: "doc-A",
        matchedDocs: [1, 2, 3, 4, 5],
        narrowingSignals: [],
      },
      diPolicyOutput: {
        sourceDocs: ["doc-B"],
      },
    });

    expect(out.results.find((g) => g.gateName === "WDL_TEST_any")?.passed).toBe(
      false,
    );
    expect(
      out.results.find((g) => g.gateName === "wrong_doc_lock_enforcement")?.passed,
    ).toBe(false);
    expect(
      out.results.find((g) => g.gateName === "AMB_TEST_count")?.passed,
    ).toBe(false);
    expect(
      out.results.find((g) => g.gateName === "ambiguity_single_question_policy")
        ?.passed,
    ).toBe(false);
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
