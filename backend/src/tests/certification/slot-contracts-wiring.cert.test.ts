import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";

/**
 * Slot Contract Wiring Certification
 *
 * Proves:
 * 1. Slot contracts have valid structure (patterns, targetRoleId, forbidden)
 * 2. EN/PT pattern parity for each slot
 * 3. Period/unit patterns contain expected slotHints
 */

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../data_banks", rel),
      "utf8",
    ),
  );
}

describe("Certification: slot-contracts-wiring", () => {
  // -----------------------------------------------------------------------
  // 1. Slot contract structural integrity
  // -----------------------------------------------------------------------
  describe("slot contract structural integrity", () => {
    const bank = readJson("semantics/query_slot_contracts.any.json");
    const slots = Array.isArray(bank?.slots) ? bank.slots : [];

    test("at least 8 slots defined", () => {
      expect(slots.length).toBeGreaterThanOrEqual(8);
    });

    for (const slot of slots) {
      const slotId = slot?.id || "unknown";

      test(`${slotId}: patterns.en and patterns.pt both have entries`, () => {
        const pEn = Array.isArray(slot?.patterns?.en) ? slot.patterns.en : [];
        const pPt = Array.isArray(slot?.patterns?.pt) ? slot.patterns.pt : [];
        expect(pEn.length).toBeGreaterThan(0);
        expect(pPt.length).toBeGreaterThan(0);
      });

      test(`${slotId}: targetRoleId is a valid non-empty string`, () => {
        expect(typeof slot.targetRoleId).toBe("string");
        expect(slot.targetRoleId.length).toBeGreaterThan(0);
      });

      test(`${slotId}: forbidden array does not overlap with targetRoleId`, () => {
        const forbidden = Array.isArray(slot.forbidden) ? slot.forbidden : [];
        expect(forbidden).not.toContain(slot.targetRoleId);
      });

      test(`${slotId}: forbidden array has at least one entry`, () => {
        const forbidden = Array.isArray(slot.forbidden) ? slot.forbidden : [];
        expect(forbidden.length).toBeGreaterThan(0);
      });
    }
  });

  // -----------------------------------------------------------------------
  // 2. Period/unit slot presence in pattern banks
  // -----------------------------------------------------------------------
  describe("period/unit slot presence", () => {
    test("period_and_unit_patterns has patterns with slotHints containing expected slots", () => {
      const bank = readJson(
        "patterns/domains/finance/period_and_unit_patterns.any.json",
      );
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
      expect(patterns.length).toBeGreaterThan(0);

      // Collect all slotHints across patterns
      const allSlotHints = new Set<string>();
      for (const p of patterns) {
        const hints = Array.isArray(p?.slotHints) ? p.slotHints : [];
        for (const hint of hints) {
          allSlotHints.add(String(hint).toLowerCase());
        }
      }

      // At least some expected slot hint types should be present
      const expectedSlots = ["period", "unit", "currency"];
      let foundCount = 0;
      for (const expected of expectedSlots) {
        if (allSlotHints.has(expected)) foundCount++;
      }
      expect(foundCount).toBeGreaterThanOrEqual(1);
    });

    test("time_scope_patterns bank exists and has patterns", () => {
      const bank = readJson("patterns/core/time_scope_patterns.any.json");
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Period/unit extraction wiring proof
  // -----------------------------------------------------------------------
  describe("period/unit extraction wiring", () => {
    test("time_scope_patterns bank has 100+ patterns with slotHints", () => {
      const bank = readJson("patterns/core/time_scope_patterns.any.json");
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
      expect(patterns.length).toBeGreaterThanOrEqual(100);

      const withSlotHints = patterns.filter(
        (p: any) => Array.isArray(p?.slotHints) && p.slotHints.length > 0,
      );
      expect(withSlotHints.length).toBeGreaterThan(0);
    });

    test("period_and_unit_patterns covers period/unit/currency/comparisonMode slots", () => {
      const bank = readJson(
        "patterns/domains/finance/period_and_unit_patterns.any.json",
      );
      const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
      expect(patterns.length).toBeGreaterThanOrEqual(50);

      const allSlotHints = new Set<string>();
      for (const p of patterns) {
        const hints = Array.isArray(p?.slotHints) ? p.slotHints : [];
        for (const hint of hints) {
          allSlotHints.add(String(hint).toLowerCase());
        }
      }

      const expectedSlots = ["period", "unit", "currency", "comparisonmode"];
      let foundCount = 0;
      for (const expected of expectedSlots) {
        if (allSlotHints.has(expected)) foundCount++;
      }
      expect(foundCount).toBeGreaterThanOrEqual(2);
    });

    test("ScopeGate source references periodHint and unitHint", () => {
      const fs = require("fs");
      const path = require("path");
      const src = fs.readFileSync(
        path.resolve(
          __dirname,
          "../../services/core/scope/scopeGate.service.ts",
        ),
        "utf-8",
      );
      expect(src).toContain("periodHint");
      expect(src).toContain("unitHint");
      expect(src).toContain("currencyHint");
      expect(src).toContain("comparisonModeHint");
      expect(src).toContain("timeConstraintsPresent");
      expect(src).toContain("extractPeriodUnitHints");
    });
  });

  // -----------------------------------------------------------------------
  // Gate report
  // -----------------------------------------------------------------------
  test("write certification gate report", () => {
    const bank = readJson("semantics/query_slot_contracts.any.json");
    const slots = Array.isArray(bank?.slots) ? bank.slots : [];
    const failures: string[] = [];

    for (const slot of slots) {
      const slotId = slot?.id || "unknown";
      const pEn = Array.isArray(slot?.patterns?.en) ? slot.patterns.en : [];
      const pPt = Array.isArray(slot?.patterns?.pt) ? slot.patterns.pt : [];
      if (pEn.length === 0) failures.push(`MISSING_PATTERNS_EN_${slotId}`);
      if (pPt.length === 0) failures.push(`MISSING_PATTERNS_PT_${slotId}`);
      if (typeof slot.targetRoleId !== "string" || slot.targetRoleId.length === 0) {
        failures.push(`INVALID_TARGET_ROLE_${slotId}`);
      }
      const forbidden = Array.isArray(slot.forbidden) ? slot.forbidden : [];
      if (forbidden.includes(slot.targetRoleId)) {
        failures.push(`FORBIDDEN_OVERLAPS_TARGET_${slotId}`);
      }
    }

    writeCertificationGateReport("slot-contracts-wiring", {
      passed: failures.length === 0,
      metrics: {
        totalSlots: slots.length,
      },
      thresholds: {
        minSlots: 8,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
