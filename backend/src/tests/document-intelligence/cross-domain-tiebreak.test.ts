import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

describe("cross_domain_tiebreak_policy", () => {
  const BANK_PATH = path.join(
    BANKS_ROOT,
    "quality/document_intelligence/cross_domain_tiebreak_policy.any.json",
  );

  it("bank file exists", () => {
    expect(fs.existsSync(BANK_PATH)).toBe(true);
  });

  it("has valid _meta with correct id", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    expect(raw._meta.id).toBe("cross_domain_tiebreak_policy");
    expect(raw._meta.version).toBeTruthy();
  });

  it("defines priority ordering for all overlapping domain pairs", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    const rules = raw.rules || [];

    const requiredPairs = [
      ["billing", "everyday"],
      ["medical", "billing"],
      ["medical", "insurance"],
      ["legal", "hr_payroll"],
      ["finance", "accounting"],
      ["housing", "billing"],
      ["tax", "accounting"],
      ["identity", "everyday"],
    ];

    for (const [domainA, domainB] of requiredPairs) {
      const match = rules.find(
        (r: Record<string, unknown>) =>
          (r.domainA === domainA && r.domainB === domainB) ||
          (r.domainA === domainB && r.domainB === domainA),
      );
      expect(match, `missing tiebreak for ${domainA} vs ${domainB}`).toBeTruthy();
    }
  });

  it("each rule has a winner, reason, and confidenceBoost", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    for (const rule of raw.rules || []) {
      expect(rule.winner).toBeTruthy();
      expect(rule.reason).toBeTruthy();
      expect(typeof rule.confidenceBoost).toBe("number");
    }
  });

  it("is registered in bank_registry", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(BANKS_ROOT, "manifest/bank_registry.any.json"), "utf-8"),
    );
    const match = (registry.banks || []).find(
      (b: Record<string, unknown>) => b.id === "cross_domain_tiebreak_policy",
    );
    expect(match).toBeTruthy();
  });
});

describe("cross_domain_tiebreak wiring proof", () => {
  it("bankSelectionPlanner.service.ts references cross_domain_tiebreak_policy", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../services/core/banks/bankSelectionPlanner.service.ts"),
      "utf-8",
    );
    expect(src).toContain("cross_domain_tiebreak_policy");
  });
});
