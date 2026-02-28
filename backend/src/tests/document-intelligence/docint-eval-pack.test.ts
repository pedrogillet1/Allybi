import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const dataBanksRoot = path.resolve(__dirname, "..", "..", "data_banks");
const evalRoot = path.join(dataBanksRoot, "document_intelligence", "eval");
const taxonomyPath = path.join(
  dataBanksRoot,
  "semantics",
  "taxonomy",
  "doc_taxonomy.any.json",
);

// ── Helpers ────────────────────────────────────────────────────────────

type EvalCase = {
  id: string;
  lang: "en" | "pt";
  domain: string;
  docTypeId: string;
  queryFamily: string;
  query: string;
  expected: {
    mustCite: string[];
    mustNotDo: string[];
    format: string;
    negative: boolean;
    refusalTrigger?: string | null;
    clarifyTrigger?: string | null;
    sectionHint?: string | null;
    tableHint?: string | null;
  };
};

type Suite = {
  id: string;
  path: string;
  minimumCases: number;
  domains: string[];
  requiredLangs: string[];
};

function loadRegistry() {
  const regPath = path.join(evalRoot, "suites", "suite_registry.any.json");
  return JSON.parse(fs.readFileSync(regPath, "utf8"));
}

function loadTaxonomyIds(): Set<string> {
  if (!fs.existsSync(taxonomyPath)) return new Set();
  const tax = JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
  const ids = new Set<string>();
  const clusters = tax.clusters || {};
  for (const domain of Object.keys(clusters)) {
    const arr = clusters[domain];
    if (Array.isArray(arr)) {
      for (const id of arr) {
        if (typeof id === "string") ids.add(id);
      }
    }
  }
  return ids;
}

function parseJsonl(filePath: string): EvalCase[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line, i) => {
      try {
        return JSON.parse(line) as EvalCase;
      } catch {
        throw new Error(`Invalid JSON at ${filePath}:${i + 1}`);
      }
    });
}

function loadSuiteCases(suite: Suite): EvalCase[] {
  const suitePath = suite.path;
  const fullPath = path.join(dataBanksRoot, suitePath);

  if (suitePath.endsWith("/")) {
    if (!fs.existsSync(fullPath)) return [];
    const files = fs
      .readdirSync(fullPath)
      .filter((f) => f.endsWith(".qa.jsonl"))
      .sort();
    let allCases: EvalCase[] = [];
    for (const f of files) {
      allCases = allCases.concat(parseJsonl(path.join(fullPath, f)));
    }
    return allCases;
  }

  return parseJsonl(path.join(dataBanksRoot, suitePath));
}

// ── Tests ──────────────────────────────────────────────────────────────

const VALID_LANGS = ["en", "pt"];
const VALID_DOMAINS = ["finance", "legal", "medical", "ops", "accounting"];
const VALID_FORMATS = [
  "table",
  "bullets",
  "inline_value",
  "paragraph",
  "numbered_list",
  "refusal",
  "clarification",
];
const MIN_NEGATIVE_RATIO = 0.2;
const PARITY_TOLERANCE = 0.1;

describe("Document Intelligence Eval Pack", () => {
  const registry = loadRegistry();
  const validDocTypes = loadTaxonomyIds();
  const suites: Suite[] = registry.suites || [];

  it("suite registry exists and has suites", () => {
    expect(suites.length).toBeGreaterThan(0);
  });

  it("suite registry schema definition is present", () => {
    expect(registry.schema).toBeDefined();
    expect(registry.schema.required).toContain("id");
    expect(registry.schema.required).toContain("lang");
    expect(registry.schema.required).toContain("query");
    expect(registry.schema.required).toContain("expected");
  });

  for (const suite of suites) {
    describe(`Suite: ${suite.id}`, () => {
      const cases = loadSuiteCases(suite);

      it(`has at least ${suite.minimumCases} cases`, () => {
        expect(cases.length).toBeGreaterThanOrEqual(suite.minimumCases);
      });

      it("all cases have required fields", () => {
        const missing: string[] = [];
        for (const c of cases) {
          if (!c.id) missing.push(`case missing id`);
          if (!c.lang) missing.push(`${c.id}: missing lang`);
          if (!c.domain) missing.push(`${c.id}: missing domain`);
          if (!c.docTypeId) missing.push(`${c.id}: missing docTypeId`);
          if (!c.queryFamily) missing.push(`${c.id}: missing queryFamily`);
          if (!c.query) missing.push(`${c.id}: missing query`);
          if (!c.expected) missing.push(`${c.id}: missing expected`);
        }
        expect(missing).toEqual([]);
      });

      it("all IDs are unique", () => {
        const ids = cases.map((c) => c.id);
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        expect(dupes).toEqual([]);
      });

      it("all langs are valid (en|pt)", () => {
        const invalid = cases.filter((c) => !VALID_LANGS.includes(c.lang));
        expect(invalid.map((c) => `${c.id}:${c.lang}`)).toEqual([]);
      });

      it("all domains are valid", () => {
        const invalid = cases.filter(
          (c) => !VALID_DOMAINS.includes(c.domain),
        );
        expect(invalid.map((c) => `${c.id}:${c.domain}`)).toEqual([]);
      });

      it("all docTypeIds resolve in taxonomy", () => {
        if (validDocTypes.size === 0) return; // taxonomy not found; skip
        const invalid = cases.filter(
          (c) => !validDocTypes.has(c.docTypeId),
        );
        expect(
          invalid.map((c) => `${c.id}: unknown docTypeId=${c.docTypeId}`),
        ).toEqual([]);
      });

      it("all formats are valid", () => {
        const invalid = cases.filter(
          (c) => c.expected && !VALID_FORMATS.includes(c.expected.format),
        );
        expect(
          invalid.map((c) => `${c.id}: bad format=${c.expected?.format}`),
        ).toEqual([]);
      });

      it("mustCite and mustNotDo are arrays", () => {
        const bad = cases.filter(
          (c) =>
            c.expected &&
            (!Array.isArray(c.expected.mustCite) ||
              !Array.isArray(c.expected.mustNotDo)),
        );
        expect(bad.map((c) => c.id)).toEqual([]);
      });

      it(`has at least 20% negative cases`, () => {
        const negCount = cases.filter(
          (c) => c.expected?.negative === true,
        ).length;
        const ratio = cases.length > 0 ? negCount / cases.length : 0;
        expect(ratio).toBeGreaterThanOrEqual(MIN_NEGATIVE_RATIO);
      });

      it("EN/PT parity within 10% tolerance", () => {
        const enCount = cases.filter((c) => c.lang === "en").length;
        const ptCount = cases.filter((c) => c.lang === "pt").length;
        if (cases.length === 0) return;
        const enRatio = enCount / cases.length;
        const ptRatio = ptCount / cases.length;
        const gap = Math.abs(enRatio - ptRatio);
        expect(gap).toBeLessThanOrEqual(PARITY_TOLERANCE);
      });

      it("negative cases have refusalTrigger or clarifyTrigger", () => {
        const negCases = cases.filter(
          (c) => c.expected?.negative === true,
        );
        const missing = negCases.filter(
          (c) =>
            !c.expected.refusalTrigger && !c.expected.clarifyTrigger,
        );
        expect(
          missing.map(
            (c) => `${c.id}: negative but no refusal/clarify trigger`,
          ),
        ).toEqual([]);
      });

      it("positive cases have non-empty mustCite", () => {
        const posCases = cases.filter(
          (c) => c.expected?.negative !== true,
        );
        const empty = posCases.filter(
          (c) =>
            !c.expected.mustCite || c.expected.mustCite.length === 0,
        );
        expect(
          empty.map((c) => `${c.id}: positive but empty mustCite`),
        ).toEqual([]);
      });

      if (suite.requiredLangs?.includes("en") && suite.requiredLangs?.includes("pt")) {
        it("has both EN and PT cases", () => {
          const enCount = cases.filter((c) => c.lang === "en").length;
          const ptCount = cases.filter((c) => c.lang === "pt").length;
          expect(enCount).toBeGreaterThan(0);
          expect(ptCount).toBeGreaterThan(0);
        });
      }

      it("covers all required domains", () => {
        const presentDomains = new Set(cases.map((c) => c.domain));
        for (const d of suite.domains || []) {
          expect(presentDomains.has(d)).toBe(true);
        }
      });
    });
  }

  describe("Cross-suite integrity", () => {
    it("no duplicate IDs across suites", () => {
      const allIds = new Set<string>();
      const dupes: string[] = [];
      for (const suite of suites) {
        const cases = loadSuiteCases(suite);
        for (const c of cases) {
          if (allIds.has(c.id)) dupes.push(`${c.id} (in ${suite.id})`);
          allIds.add(c.id);
        }
      }
      expect(dupes).toEqual([]);
    });

    it("total case count meets overall minimum (1040)", () => {
      let total = 0;
      for (const suite of suites) {
        total += loadSuiteCases(suite).length;
      }
      expect(total).toBeGreaterThanOrEqual(1040);
    });

    it("overall EN/PT parity", () => {
      let en = 0;
      let pt = 0;
      for (const suite of suites) {
        const cases = loadSuiteCases(suite);
        en += cases.filter((c) => c.lang === "en").length;
        pt += cases.filter((c) => c.lang === "pt").length;
      }
      const total = en + pt;
      if (total === 0) return;
      const gap = Math.abs(en / total - pt / total);
      expect(gap).toBeLessThanOrEqual(PARITY_TOLERANCE);
    });
  });
});
