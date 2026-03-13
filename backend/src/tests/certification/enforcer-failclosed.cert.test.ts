import "reflect-metadata";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockGetBank = jest.fn();
const mockGetOptionalBank = jest.fn();

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (...args: unknown[]) => mockGetBank(...args),
  getOptionalBank: (...args: unknown[]) => mockGetOptionalBank(...args),
}));

import {
  ResponseContractEnforcerService,
} from "../../services/core/enforcement/responseContractEnforcer.service";
import { writeCertificationGateReport } from "./reporting";

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
      };
    case "bullet_rules":
    case "table_rules":
    case "answer_style_policy":
      return { config: { enabled: true }, profiles: {} };
    default:
      return { config: { enabled: true } };
  }
}

describe("Certification: enforcer shape-repair only behavior", () => {
  beforeEach(() => {
    mockGetBank.mockReset();
    mockGetOptionalBank.mockReset();
    mockGetBank.mockImplementation((bankId: string) => bankById(bankId));
    mockGetOptionalBank.mockImplementation((bankId: string) => bankById(bankId));
  });

  test("enforcer returns violations without inventing fallback content", () => {
    const enforcer = new ResponseContractEnforcerService();
    const originalText = '{"answer":"ok"}';
    const out = enforcer.enforce(
      {
        content: originalText,
        attachments: [],
      },
      {
        answerMode: "general_answer",
        language: "en",
      },
    );

    const failures: string[] = [];
    if (out.enforcement.violations.length === 0) {
      failures.push("MISSING_VIOLATIONS");
    }
    if (
      !out.enforcement.violations.some(
        (violation) => violation.code === "JSON_NOT_ALLOWED",
      )
    ) {
      failures.push("JSON_VIOLATION_NOT_REPORTED");
    }
    if (
      out.content !== originalText &&
      out.content !== "" &&
      !out.content.includes("{")
    ) {
      failures.push("INVENTED_FALLBACK_CONTENT");
    }

    writeCertificationGateReport("enforcer-shape-repair-only", {
      passed: failures.length === 0,
      metrics: {
        violationCount: out.enforcement.violations.length,
        contentChanged: out.content !== originalText,
      },
      thresholds: {
        minViolations: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
