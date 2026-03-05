import fs from "node:fs";
import path from "node:path";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

/** The 15 canonical domains in priority order (highest first). */
const CANONICAL_DOMAINS = [
  "accounting",
  "banking",
  "billing",
  "education",
  "everyday",
  "finance",
  "housing",
  "hr_payroll",
  "identity",
  "insurance",
  "legal",
  "medical",
  "ops",
  "tax",
  "travel",
] as const;

/** Generate all C(15,2) = 105 unique unordered domain pairs. */
function allDomainPairs(): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < CANONICAL_DOMAINS.length; i++) {
    for (let j = i + 1; j < CANONICAL_DOMAINS.length; j++) {
      pairs.push([CANONICAL_DOMAINS[i], CANONICAL_DOMAINS[j]]);
    }
  }
  return pairs;
}

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

  it("defines priority ordering for ALL 105 domain pairs", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    const rules = raw.rules || [];

    const requiredPairs = allDomainPairs();
    expect(requiredPairs).toHaveLength(105);

    for (const [domainA, domainB] of requiredPairs) {
      const match = rules.find(
        (r: Record<string, unknown>) =>
          (r.domainA === domainA && r.domainB === domainB) ||
          (r.domainA === domainB && r.domainB === domainA),
      );
      expect(match).toBeTruthy();
    }
  });

  it("no duplicate domain pairs", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    const rules = raw.rules || [];

    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const rule of rules) {
      const key = [rule.domainA, rule.domainB].sort().join("|");
      if (seen.has(key)) {
        duplicates.push(`${rule.id}: ${rule.domainA} vs ${rule.domainB}`);
      }
      seen.add(key);
    }

    expect(duplicates).toHaveLength(0);
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


