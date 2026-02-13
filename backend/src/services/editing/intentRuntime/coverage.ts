/**
 * Coverage reporter.
 *
 * Loads golden test cases, runs them through analyzeMessageToPlan(),
 * compares expected vs actual, and reports pass/fail + coverage gaps.
 */

import * as fs from "fs";
import * as path from "path";
import { analyzeMessageToPlan } from "./index";
import { loadPatterns } from "./loaders";
import { loadOperatorCatalog } from "./loaders";
import type { IntentPlan, ClarificationNeeded } from "./types";

// ---------------------------------------------------------------------------
// Test case schema
// ---------------------------------------------------------------------------

export interface GoldenTestCase {
  id: string;
  input: string;
  context: {
    domain: "excel" | "docx";
    sheetName?: string;
    selection?: unknown;
    language?: "en" | "pt";
  };
  expected: {
    intentIds: string[];
    plan: Array<{ op: string; [key: string]: unknown }>;
    clarificationRequired: boolean;
  };
  pairId?: string;
}

export interface TestResult {
  testId: string;
  passed: boolean;
  expectedOps: string[];
  actualOps: string[];
  expectedIntentIds: string[];
  actualIntentIds: string[];
  error?: string;
}

export interface CoverageReport {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: TestResult[];
  uncoveredOperators: string[];
  unmatchedTests: string[];
  collisions: string[];
}

// ---------------------------------------------------------------------------
// Test case loader
// ---------------------------------------------------------------------------

function loadTestCases(testDir: string): GoldenTestCase[] {
  const files = [
    "excel.en.json",
    "excel.pt.json",
    "docx.en.json",
    "docx.pt.json",
  ];

  const allCases: GoldenTestCase[] = [];

  for (const file of files) {
    const filePath = path.join(testDir, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const cases = Array.isArray(raw?.cases) ? raw.cases : Array.isArray(raw) ? raw : [];
      allCases.push(...cases);
    } catch {
      // Skip invalid files
    }
  }

  return allCases;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

function runSingleTest(tc: GoldenTestCase): TestResult {
  const domain = tc.context.domain === "docx" ? "docx" : "excel";
  const lang = tc.context.language || "en";

  try {
    const result = analyzeMessageToPlan({
      message: tc.input,
      domain,
      viewerContext: {
        selection: tc.context.selection,
        sheetName: tc.context.sheetName,
      },
      language: lang,
    });

    if (!result) {
      return {
        testId: tc.id,
        passed: false,
        expectedOps: tc.expected.plan.map((p) => p.op),
        actualOps: [],
        expectedIntentIds: tc.expected.intentIds,
        actualIntentIds: [],
        error: "No result returned (null)",
      };
    }

    if (tc.expected.clarificationRequired) {
      const isClarification = result.kind === "clarification";
      return {
        testId: tc.id,
        passed: isClarification,
        expectedOps: tc.expected.plan.map((p) => p.op),
        actualOps:
          result.kind === "plan"
            ? result.ops.map((o) => o.op)
            : (result as ClarificationNeeded).partialOps.map((o) => o.op),
        expectedIntentIds: tc.expected.intentIds,
        actualIntentIds: result.sourcePatternIds,
        error: isClarification
          ? undefined
          : "Expected clarification but got a plan",
      };
    }

    if (result.kind !== "plan") {
      return {
        testId: tc.id,
        passed: false,
        expectedOps: tc.expected.plan.map((p) => p.op),
        actualOps: (result as ClarificationNeeded).partialOps.map((o) => o.op),
        expectedIntentIds: tc.expected.intentIds,
        actualIntentIds: result.sourcePatternIds,
        error: `Expected plan but got clarification: ${(result as ClarificationNeeded).missingSlots.map((s) => s.slot).join(", ")}`,
      };
    }

    const plan = result as IntentPlan;
    const actualOps = plan.ops.map((o) => o.op);
    const expectedOps = tc.expected.plan.map((p) => p.op);

    // Check if all expected ops appear in actual (order-independent)
    const opsMatch =
      expectedOps.length === actualOps.length &&
      expectedOps.every((op) => actualOps.includes(op));

    // Check intent ID match
    const intentMatch =
      tc.expected.intentIds.length === 0 ||
      tc.expected.intentIds.some((id) =>
        plan.sourcePatternIds.some((pid) => pid.includes(id)),
      );

    return {
      testId: tc.id,
      passed: opsMatch && intentMatch,
      expectedOps,
      actualOps,
      expectedIntentIds: tc.expected.intentIds,
      actualIntentIds: plan.sourcePatternIds,
      error: !opsMatch
        ? `Op mismatch: expected [${expectedOps}] got [${actualOps}]`
        : !intentMatch
          ? `Intent mismatch: expected ${tc.expected.intentIds} got ${plan.sourcePatternIds}`
          : undefined,
    };
  } catch (err) {
    return {
      testId: tc.id,
      passed: false,
      expectedOps: tc.expected.plan.map((p) => p.op),
      actualOps: [],
      expectedIntentIds: tc.expected.intentIds,
      actualIntentIds: [],
      error: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Coverage analysis
// ---------------------------------------------------------------------------

function findUncoveredOperators(
  testCases: GoldenTestCase[],
): string[] {
  const catalog = loadOperatorCatalog();
  const coveredOps = new Set<string>();

  for (const tc of testCases) {
    for (const step of tc.expected.plan) {
      coveredOps.add(step.op);
    }
  }

  const uncovered: string[] = [];
  for (const op of Object.keys(catalog)) {
    if (!coveredOps.has(op)) uncovered.push(op);
  }

  return uncovered;
}

function findCollisions(domain: "excel" | "docx", lang: "en" | "pt"): string[] {
  const patterns = loadPatterns(domain, lang);
  const collisions: string[] = [];

  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const a = patterns[i];
      const b = patterns[j];

      // Check if both patterns have overlapping regex
      if (a.triggers.regex_any && b.triggers.regex_any) {
        for (const posA of a.examples.positive) {
          for (const regB of b.triggers.regex_any) {
            try {
              if (new RegExp(regB, "i").test(posA)) {
                collisions.push(
                  `${a.id} positive example "${posA.slice(0, 40)}" also matches ${b.id}`,
                );
              }
            } catch {
              // skip
            }
          }
        }
      }
    }
  }

  return collisions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function runCoverage(testDir: string): CoverageReport {
  const testCases = loadTestCases(testDir);
  const results: TestResult[] = [];

  for (const tc of testCases) {
    results.push(runSingleTest(tc));
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const uncoveredOperators = findUncoveredOperators(testCases);
  const unmatchedTests = results
    .filter((r) => !r.passed)
    .map((r) => r.testId);

  // Detect collisions across all domains/langs
  const collisions = [
    ...findCollisions("excel", "en"),
    ...findCollisions("excel", "pt"),
    ...findCollisions("docx", "en"),
    ...findCollisions("docx", "pt"),
  ];

  return {
    total: testCases.length,
    passed,
    failed,
    passRate: testCases.length > 0 ? passed / testCases.length : 0,
    results,
    uncoveredOperators,
    unmatchedTests,
    collisions,
  };
}

export function generateMarkdownReport(report: CoverageReport): string {
  const lines: string[] = [];

  lines.push("# Intent Runtime Coverage Report");
  lines.push("");
  lines.push(`**Total tests:** ${report.total}`);
  lines.push(`**Passed:** ${report.passed}`);
  lines.push(`**Failed:** ${report.failed}`);
  lines.push(
    `**Pass rate:** ${(report.passRate * 100).toFixed(1)}%`,
  );
  lines.push("");

  if (report.uncoveredOperators.length > 0) {
    lines.push("## Uncovered Operators");
    lines.push("");
    for (const op of report.uncoveredOperators) {
      lines.push(`- ${op}`);
    }
    lines.push("");
  }

  if (report.unmatchedTests.length > 0) {
    lines.push("## Failed Tests");
    lines.push("");
    for (const id of report.unmatchedTests) {
      const result = report.results.find((r) => r.testId === id);
      lines.push(`- **${id}**: ${result?.error || "unknown"}`);
    }
    lines.push("");
  }

  if (report.collisions.length > 0) {
    lines.push("## Pattern Collisions");
    lines.push("");
    for (const collision of report.collisions.slice(0, 20)) {
      lines.push(`- ${collision}`);
    }
    if (report.collisions.length > 20) {
      lines.push(`- ... and ${report.collisions.length - 20} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
