import { describe, expect, test } from "@jest/globals";

import {
  clamp01,
  isProductionEnv,
  safeNumber,
  sha256,
  stableLocationKey,
} from "./retrievalEngine.utils";

describe("retrievalEngine.utils", () => {
  test("sha256 is deterministic", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abcd"));
  });

  test("clamp01 bounds invalid and out-of-range numbers", () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(2)).toBe(1);
  });

  test("safeNumber returns fallback for non-finite values", () => {
    expect(safeNumber("3.2")).toBe(3.2);
    expect(safeNumber("x", 7)).toBe(7);
    expect(safeNumber(Infinity, 9)).toBe(9);
  });

  test("stableLocationKey uses location components or fallback id", () => {
    expect(
      stableLocationKey(
        "doc-1",
        { page: 3, sheet: "Summary", slide: null, sectionKey: "totals" },
        "chunk-9",
      ),
    ).toBe("d:doc-1|p:3|s:Summary|sec:totals");
    expect(stableLocationKey("doc-1", {}, "chunk-9")).toBe("d:doc-1");
  });

  test("isProductionEnv matches exact production literal", () => {
    expect(isProductionEnv("production")).toBe(true);
    expect(isProductionEnv("prod")).toBe(false);
  });
});
