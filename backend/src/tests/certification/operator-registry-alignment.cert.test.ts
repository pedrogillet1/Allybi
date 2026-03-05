import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"));
}

describe("operator-registry-alignment", () => {
  const registry = readJson("operators/operator_canonical_registry.any.json");
  const collisionMatrix = readJson("operators/operator_collision_matrix.any.json");
  const intentConfig = readJson("routing/intent_config.any.json");

  // Build CASE-SENSITIVE lookup: id/alias → canonicalId
  const reverseMap = new Map<string, string>();
  for (const op of registry.operators) {
    reverseMap.set(op.canonicalId, op.canonicalId);
    for (const alias of op.aliases) {
      reverseMap.set(alias, op.canonicalId);
    }
  }

  test("registry exists with valid structure", () => {
    expect(registry._meta.id).toBe("operator_canonical_registry");
    expect(Array.isArray(registry.operators)).toBe(true);
    expect(registry.operators.length).toBeGreaterThan(0);
    for (const op of registry.operators) {
      expect(op.canonicalId).toBeTruthy();
      expect(op.family).toBeTruthy();
      expect(Array.isArray(op.aliases)).toBe(true);
    }
  });

  test("no duplicate canonicalIds (case-sensitive)", () => {
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const op of registry.operators) {
      const count = (seen.get(op.canonicalId) || 0) + 1;
      seen.set(op.canonicalId, count);
      if (count > 1) dupes.push(op.canonicalId);
    }
    expect(dupes).toEqual([]);
  });

  test("no alias appears under multiple canonicalIds", () => {
    const aliasOwner = new Map<string, string>();
    const conflicts: string[] = [];
    for (const op of registry.operators) {
      for (const alias of op.aliases) {
        const existing = aliasOwner.get(alias);
        if (existing && existing !== op.canonicalId) {
          conflicts.push(`"${alias}" claimed by both "${existing}" and "${op.canonicalId}"`);
        }
        aliasOwner.set(alias, op.canonicalId);
      }
    }
    expect(conflicts).toEqual([]);
  });

  test("no alias collides with a different canonicalId (case-sensitive)", () => {
    const canonicalIds = new Set(registry.operators.map((op: any) => op.canonicalId));
    const conflicts: string[] = [];
    for (const op of registry.operators) {
      for (const alias of op.aliases) {
        if (canonicalIds.has(alias) && alias !== op.canonicalId) {
          conflicts.push(`alias "${alias}" of "${op.canonicalId}" collides with canonicalId "${alias}"`);
        }
      }
    }
    expect(conflicts).toEqual([]);
  });

  test("collision matrix operators all resolve in registry (case-sensitive)", () => {
    const missing: string[] = [];
    for (const rule of collisionMatrix.rules) {
      for (const opRef of rule.when.operators || []) {
        if (!reverseMap.has(opRef)) {
          missing.push(`${rule.id}: "${opRef}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("intent_config operatorsAllowed all resolve in registry (case-sensitive)", () => {
    const missing: string[] = [];
    for (const family of intentConfig.intentFamilies) {
      for (const opId of family.operatorsAllowed || []) {
        if (!reverseMap.has(opId)) {
          missing.push(`${family.id}: "${opId}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("Allybi alias mappings agree with runtime runtimeFromAllybiCanonical()", () => {
    // These mappings come from editOperatorAliases.service.ts:runtimeFromAllybiCanonical()
    const RUNTIME_TRUTH: Record<string, string> = {
      "DOCX_REPLACE_SPAN": "EDIT_SPAN",
      "DOCX_REWRITE_PARAGRAPH": "EDIT_PARAGRAPH",
      "DOCX_INSERT_AFTER": "ADD_PARAGRAPH",
      "DOCX_INSERT_BEFORE": "ADD_PARAGRAPH",
      // All other DOCX_* → EDIT_DOCX_BUNDLE
      "DOCX_REWRITE_SECTION": "EDIT_DOCX_BUNDLE",
      "DOCX_DELETE_PARAGRAPH": "EDIT_DOCX_BUNDLE",
      "DOCX_SET_RUN_STYLE": "EDIT_DOCX_BUNDLE",
      "DOCX_MERGE_PARAGRAPHS": "EDIT_DOCX_BUNDLE",
      "DOCX_SPLIT_PARAGRAPH": "EDIT_DOCX_BUNDLE",
      "DOCX_FIND_REPLACE": "EDIT_DOCX_BUNDLE",
      "XLSX_SET_CELL_VALUE": "EDIT_CELL",
      "XLSX_SET_RANGE_VALUES": "EDIT_RANGE",
      "XLSX_CHART_CREATE": "CREATE_CHART",
      "XLSX_CHART_SET_SERIES": "CREATE_CHART",
      "XLSX_CHART_SET_TITLES": "CREATE_CHART",
      // All other XLSX_* → COMPUTE_BUNDLE
      "XLSX_SET_CELL_FORMULA": "COMPUTE_BUNDLE",
      "XLSX_FORMAT_RANGE": "COMPUTE_BUNDLE",
      "XLSX_MERGE_CELLS": "COMPUTE_BUNDLE",
    };
    const mismatches: string[] = [];
    for (const [alias, expectedCanonical] of Object.entries(RUNTIME_TRUTH)) {
      const actual = reverseMap.get(alias);
      if (actual !== expectedCanonical) {
        mismatches.push(`${alias}: expected → ${expectedCanonical}, registry says → ${actual || "MISSING"}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
