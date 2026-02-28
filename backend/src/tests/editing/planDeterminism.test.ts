/**
 * Plan Determinism Tests.
 *
 * Proves that analyzeMessageToPlan is a pure, deterministic function:
 * identical inputs always produce identical output hashes.
 */

import { describe, test, expect, beforeEach } from "@jest/globals";
import * as crypto from "crypto";
import {
  analyzeMessageToPlan,
  clearCaches,
} from "../../services/editing/intentRuntime";
import type {
  IntentPlan,
  ClarificationNeeded,
} from "../../services/editing/intentRuntime";

type PlanResult = IntentPlan | ClarificationNeeded | null;

/**
 * Produces a stable hash of any plan result by sorting keys recursively
 * before hashing. This ensures object key insertion order does not
 * affect the comparison.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  if (typeof obj === "object") {
    const sorted = Object.keys(obj as Record<string, unknown>)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          stableStringify((obj as Record<string, unknown>)[k]),
      )
      .join(",");
    return "{" + sorted + "}";
  }
  return JSON.stringify(obj);
}

function hashPlan(plan: PlanResult): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(plan))
    .digest("hex");
}

beforeEach(() => {
  clearCaches();
});

describe("Plan Determinism", () => {
  const cases: Array<{
    message: string;
    domain: "docx" | "excel";
    lang: "en" | "pt";
  }> = [
    { message: "bold the title", domain: "docx", lang: "en" },
    { message: "sum column B", domain: "excel", lang: "en" },
    { message: "negrito no título", domain: "docx", lang: "pt" },
    { message: "forecast my data", domain: "excel", lang: "en" },
  ];

  for (const c of cases) {
    test(`same input produces same plan hash: "${c.message}"`, () => {
      const plan1 = analyzeMessageToPlan({
        message: c.message,
        domain: c.domain,
        viewerContext: {},
        language: c.lang,
      });
      const plan2 = analyzeMessageToPlan({
        message: c.message,
        domain: c.domain,
        viewerContext: {},
        language: c.lang,
      });
      expect(hashPlan(plan1)).toBe(hashPlan(plan2));
    });
  }

  test("10 consecutive calls all produce the same hash", () => {
    const hashes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const plan = analyzeMessageToPlan({
        message: "remove duplicate rows",
        domain: "excel",
        viewerContext: {},
        language: "en",
      });
      hashes.push(hashPlan(plan));
    }
    const unique = new Set(hashes);
    expect(unique.size).toBe(1);
  });

  test("different inputs produce different hashes", () => {
    const plan1 = analyzeMessageToPlan({
      message: "bold the title",
      domain: "docx",
      viewerContext: {},
      language: "en",
    });
    const plan2 = analyzeMessageToPlan({
      message: "sum column B",
      domain: "excel",
      viewerContext: {},
      language: "en",
    });
    // At least one should be non-null for a meaningful test
    if (plan1 !== null || plan2 !== null) {
      expect(hashPlan(plan1)).not.toBe(hashPlan(plan2));
    }
  });
});
