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
});
