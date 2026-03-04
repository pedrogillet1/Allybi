import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

describe("wrong_section_lock", () => {
  const BANK_PATH = path.join(BANKS_ROOT, "quality/document_intelligence/wrong_section_lock.any.json");

  it("bank file exists", () => {
    expect(fs.existsSync(BANK_PATH)).toBe(true);
  });

  it("has at least 8 rules", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    expect(raw.rules.length).toBeGreaterThanOrEqual(8);
  });

  it("covers section mismatch, table mismatch, and clause number mismatch", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    const ruleIds = raw.rules.map((r: Record<string, unknown>) => r.id);
    expect(ruleIds.some((id: string) => id.includes("section_mismatch"))).toBe(true);
    expect(ruleIds.some((id: string) => id.includes("table_mismatch"))).toBe(true);
    expect(ruleIds.some((id: string) => id.includes("clause_number"))).toBe(true);
  });

  it("is registered in bank_registry", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(BANKS_ROOT, "manifest/bank_registry.any.json"), "utf-8"),
    );
    const match = (registry.banks || []).find(
      (b: Record<string, unknown>) => b.id === "wrong_section_lock",
    );
    expect(match).toBeTruthy();
  });
});
