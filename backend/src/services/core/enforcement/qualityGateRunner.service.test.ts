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
  const originalCertProfile = process.env.CERT_PROFILE;
  const originalStrictGovernanceFlag = process.env.CHAT_RUNTIME_STRICT_GOVERNANCE;

  beforeEach(() => {
    jest.resetModules();
    mockGetOptionalBank.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.CERT_PROFILE = originalCertProfile;
    process.env.CHAT_RUNTIME_STRICT_GOVERNANCE = originalStrictGovernanceFlag;
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

  test("forces strict fail-closed when CERT_PROFILE is ci", async () => {
    process.env.NODE_ENV = "development";
    process.env.CERT_PROFILE = "ci";
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

    await expect(
      runner.runGates("hello", { answerMode: "doc_grounded_single" }),
    ).rejects.toThrow(/Required quality integration hook bank missing/i);
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

  test("enforces blocking safetyRules for medical and legal domain outputs", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: () => null,
      getValidationPolicies: () => null,
      getRedactionAndSafetyRules: (domain: string) => {
        if (domain === "medical") {
          return {
            _meta: { id: "medical_redaction_and_safety_rules" },
            config: { enabled: true },
            redactionRules: [],
            safetyRules: [
              {
                id: "medical_safety_001",
                trigger: "request_for_new_diagnosis_or_differential",
                description: "Forbid diagnosis advice generation.",
                action: "BLOCK_WITH_DISCLAIMER",
              },
            ],
          };
        }
        if (domain === "legal") {
          return {
            _meta: { id: "legal_redaction_and_safety_rules" },
            config: { enabled: true },
            redactionRules: [],
            safetyRules: [
              {
                id: "legal_safe_005_harmful_guidance",
                trigger: "request to bypass obligations",
                description: "Block harmful legal evasion guidance.",
                action: "BLOCK_WITH_DISCLAIMER",
              },
            ],
          };
        }
        return null;
      },
    } as any);

    const medicalOut = await runner.runGates(
      "You are diagnosed with pneumonia and should start treatment now.",
      { domainHint: "medical" },
    );
    expect(
      medicalOut.results.find(
        (g) => g.gateName === "domain_safety_rule_violation:medical_safety_001",
      )?.passed,
    ).toBe(false);

    const legalOut = await runner.runGates(
      "You can bypass the contract obligation by hiding this clause.",
      { domainHint: "legal" },
    );
    expect(
      legalOut.results.find(
        (g) =>
          g.gateName === "domain_safety_rule_violation:legal_safe_005_harmful_guidance",
      )?.passed,
    ).toBe(false);
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

  test("enforces contradiction_policy when contradiction signals are present", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) =>
        type === "contradiction_policy"
          ? {
              _meta: { id: "contradiction_policy" },
              config: { enabled: true },
              rules: [
                {
                  id: "CP_001_cross_statement_conflict",
                  trigger: "cross statement contradiction",
                  check: "context.contradictions >= 1 AND context.confidence < 0.8",
                  failureAction: "BLOCK_AND_ASK_CLARIFY",
                },
              ],
            }
          : null,
    } as any);

    const out = await runner.runGates("summary text", {
      answerMode: "doc_grounded_single",
      diPolicyContext: { contradictions: 2, confidence: 0.5 },
    });

    expect(
      out.results.find((g) => g.gateName === "CP_001_cross_statement_conflict")
        ?.passed,
    ).toBe(false);
    expect(
      out.results.find((g) => g.gateName === "contradiction_policy_enforcement")
        ?.passed,
    ).toBe(false);
  });

  test("supports contradiction_policy banks that provide contradictionChecks instead of rules", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: (type: string) =>
        type === "contradiction_policy"
          ? {
              _meta: { id: "contradiction_policy" },
              config: { enabled: true },
              contradictionChecks: [
                {
                  id: "CP_002_alias_shape",
                  trigger: "alias shape contradiction",
                  check: "context.contradictions >= 1",
                  failureAction: "BLOCK_AND_ASK_CLARIFY",
                },
              ],
            }
          : null,
    } as any);

    const out = await runner.runGates("summary text", {
      answerMode: "doc_grounded_single",
      diPolicyContext: { contradictions: 2 },
    });

    expect(
      out.results.find((g) => g.gateName === "CP_002_alias_shape")?.passed,
    ).toBe(false);
    expect(
      out.results.find((g) => g.gateName === "contradiction_policy_enforcement")
        ?.passed,
    ).toBe(false);
  });

  test("fails closed in strict mode when contradiction_policy bank shape is invalid", async () => {
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
      getQualityGateBank: (type: string) =>
        type === "contradiction_policy"
          ? {
              _meta: { id: "contradiction_policy" },
              config: { enabled: true },
              contradictionChecks: {
                id: "invalid",
              } as any,
            }
          : null,
    } as any);

    await expect(
      runner.runGates("summary text", {
        answerMode: "doc_grounded_single",
        diPolicyContext: { contradictions: 1 },
      }),
    ).rejects.toThrow(/Invalid contradiction_policy bank shape/i);
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

  test("fails closed when configured gate order contains unknown gate id", async () => {
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
          gateOrder: ["unknown_gate_for_test"],
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
      runner.runGates("hello", { answerMode: "general_answer" }),
    ).rejects.toThrow(/unknown_gate_for_test/i);
  });

  test("runGate returns explicit failure for unknown gate", async () => {
    process.env.NODE_ENV = "development";
    mockGetOptionalBank.mockReturnValue(null);

    const { QualityGateRunnerService } =
      await import("./qualityGateRunner.service");
    const runner = new QualityGateRunnerService({
      getQualityGateBank: () => null,
    } as any);

    const result = await runner.runGate(
      "definitely_missing_gate",
      "hello",
      { answerMode: "general_answer" },
    );

    expect(result.passed).toBe(false);
    expect(result.actionOnFail).toBe("fail_closed_unknown_gate");
    expect(result.issues?.[0]).toMatch(/not found/i);
  });
});
