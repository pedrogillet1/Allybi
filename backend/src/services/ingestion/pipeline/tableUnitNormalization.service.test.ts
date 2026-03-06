import { describe, expect, test } from "@jest/globals";
import {
  UNIT_PATTERNS,
  normalizeCellUnit,
  checkRowUnitConsistency,
} from "./tableUnitNormalization.service";

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

describe("normalizeCellUnit", () => {
  // Currency detection
  test("detects USD from dollar sign", () => {
    const r = normalizeCellUnit({ value: "$1,500" });
    expect(r.unitNormalized).toBe("currency_usd");
    expect(r.numericValue).toBe(1500);
  });

  test("detects USD with space after $", () => {
    const r = normalizeCellUnit({ value: "$ 1,500" });
    expect(r.unitNormalized).toBe("currency_usd");
  });

  test("detects BRL from R$", () => {
    const r = normalizeCellUnit({ value: "R$ 100" });
    expect(r.unitNormalized).toBe("currency_brl");
  });

  test("detects EUR from euro symbol", () => {
    const r = normalizeCellUnit({ value: "€ 42.50" });
    expect(r.unitNormalized).toBe("currency_eur");
    expect(r.unitRaw).toBe("€");
  });

  test("detects GBP from pound symbol", () => {
    const r = normalizeCellUnit({ value: "£1,250" });
    expect(r.unitNormalized).toBe("currency_gbp");
    expect(r.unitRaw).toBe("£");
  });

  test("detects JPY from yen symbol", () => {
    const r = normalizeCellUnit({ value: "¥8000" });
    expect(r.unitNormalized).toBe("currency_jpy");
    expect(r.unitRaw).toBe("¥");
  });

  // Scale/magnitude detection
  test("detects millions multiplier from header", () => {
    const r = normalizeCellUnit({
      value: "1.5",
      colHeader: "Revenue (USD millions)",
    });
    expect(r.unitNormalized).toBe("currency_usd");
    expect(r.numericValue).toBe(1500000);
    expect(r.scaleRaw).toBe("millions");
  });

  test("detects 'mn' shorthand", () => {
    const r = normalizeCellUnit({
      value: "2.3",
      colHeader: "Revenue (USD mn)",
    });
    expect(r.numericValue).toBe(2300000);
  });

  test("detects billions", () => {
    const r = normalizeCellUnit({
      value: "1.2",
      colHeader: "Assets ($bn)",
    });
    expect(r.numericValue).toBe(1200000000);
  });

  test("detects thousands from '000", () => {
    const r = normalizeCellUnit({
      value: "150",
      colHeader: "Revenue ('000)",
    });
    expect(r.numericValue).toBe(150000);
  });

  test("detects 'in thousands' from header", () => {
    const r = normalizeCellUnit({
      value: "500",
      colHeader: "Revenue (in thousands)",
    });
    expect(r.numericValue).toBe(500000);
  });

  // False positive prevention
  test("does NOT detect mass_g from '5G Network'", () => {
    const r = normalizeCellUnit({ value: "5G Network" });
    expect(r.unitNormalized).not.toBe("mass_g");
  });

  test("does NOT detect length_m from 'size: M'", () => {
    const r = normalizeCellUnit({ value: "M", colHeader: "T-Shirt Size" });
    expect(r.unitNormalized).toBeNull();
  });

  test("does NOT detect duration_s from 'item(s)'", () => {
    const r = normalizeCellUnit({ value: "item(s)" });
    expect(r.unitNormalized).toBeNull();
  });

  test("does NOT detect duration_h from 'Step H'", () => {
    const r = normalizeCellUnit({ value: "Step H" });
    expect(r.unitNormalized).toBeNull();
  });

  // Accounting negatives
  test("parses parenthesized negative: (1,500)", () => {
    const r = normalizeCellUnit({
      value: "(1,500)",
      colHeader: "Net Income (USD)",
    });
    expect(r.numericValue).toBe(-1500);
  });

  // Percentage as display value
  test("percentage numericValue is display value", () => {
    const r = normalizeCellUnit({ value: "45%" });
    expect(r.unitNormalized).toBe("percent");
    expect(r.numericValue).toBe(45);
  });
});

describe("checkRowUnitConsistency", () => {
  test("returns consistent when all cells have same unit", () => {
    const result = checkRowUnitConsistency([
      { unitNormalized: "currency_usd" },
      { unitNormalized: "currency_usd" },
      { unitNormalized: "currency_usd" },
    ]);
    expect(result.consistent).toBe(true);
    expect(result.dominantUnit).toBe("currency_usd");
    expect(result.conflicts).toHaveLength(0);
  });

  test("returns inconsistent when cells have mixed units", () => {
    const result = checkRowUnitConsistency([
      { unitNormalized: "currency_usd", cellRef: "A1" },
      { unitNormalized: "percent", cellRef: "B1" },
      { unitNormalized: "currency_usd", cellRef: "C1" },
    ]);
    expect(result.consistent).toBe(false);
    expect(result.dominantUnit).toBe("currency_usd");
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].cellRef).toBe("B1");
  });

  test("ignores null units (cells with no detected unit)", () => {
    const result = checkRowUnitConsistency([
      { unitNormalized: "currency_usd" },
      { unitNormalized: null },
      { unitNormalized: "currency_usd" },
    ]);
    expect(result.consistent).toBe(true);
  });

  test("returns consistent with no units at all", () => {
    const result = checkRowUnitConsistency([
      { unitNormalized: null },
      { unitNormalized: null },
    ]);
    expect(result.consistent).toBe(true);
    expect(result.dominantUnit).toBeNull();
  });
});
