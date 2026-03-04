import { describe, expect, test } from "@jest/globals";
import { UNIT_PATTERNS } from "./tableUnitNormalization.service";

describe("UNIT_PATTERNS export", () => {
  test("UNIT_PATTERNS is exported and contains expected unit families", () => {
    expect(Array.isArray(UNIT_PATTERNS)).toBe(true);
    const normalizedIds = UNIT_PATTERNS.map((p) => p.normalized);
    expect(normalizedIds).toContain("currency_usd");
    expect(normalizedIds).toContain("currency_brl");
    expect(normalizedIds).toContain("percent");
    expect(normalizedIds).toContain("mass_kg");
  });
});
