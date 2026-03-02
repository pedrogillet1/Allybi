import { describe, test, expect } from "@jest/globals";
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
const domainCatalogRoot = path.join(
  dataBanksRoot,
  "document_intelligence",
  "domains",
);

const LEGACY_DOC_TYPE_ALIASES: Record<string, Record<string, string>> = {
  education: {
    education_diploma_certificate: "edu_diploma_certificate",
    education_enrollment_letter: "edu_enrollment_letter",
    education_transcript: "edu_transcript",
  },
  housing: {
    housing_lease_agreement: "housing_lease_summary",
  },
  hr_payroll: {
    hr_payroll_employment_contract: "hr_employment_verification_letter",
    hr_payroll_payslip: "hr_pay_stub",
    hr_payroll_timesheet: "hr_timesheet",
  },
  identity: {
    identity_driver_license: "id_driver_license",
    identity_national_id: "id_business_registration_certificate",
    identity_passport: "id_passport",
  },
  insurance: {
    insurance_claim_form: "ins_claim_submission",
    insurance_policy_document: "ins_policy_document",
    insurance_premium_notice: "ins_premium_invoice",
  },
  tax: {
    tax_payment_receipt: "tax_payment_slip",
    tax_return_business: "tax_assessment_notice",
    tax_return_individual: "tax_individual_income_return",
  },
  travel: {
    travel_hotel_receipt: "travel_hotel_booking_confirmation",
  },
};

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

function addDocTypeId(
  byDomain: Map<string, Set<string>>,
  domain: string,
  docTypeId: string,
) {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  const normalizedId = String(docTypeId || "").trim();
  if (!normalizedDomain || !normalizedId) return;
  if (!byDomain.has(normalizedDomain)) byDomain.set(normalizedDomain, new Set());
  byDomain.get(normalizedDomain)!.add(normalizedId);
}

function resolveLegacyDocTypeAlias(domain: string, docTypeId: string): string {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  const rawDocTypeId = String(docTypeId || "").trim();
  if (!normalizedDomain || !rawDocTypeId) return rawDocTypeId;
  const aliases = LEGACY_DOC_TYPE_ALIASES[normalizedDomain] || null;
  if (!aliases) return rawDocTypeId;
  return aliases[rawDocTypeId] || rawDocTypeId;
}

function loadDocTypeCatalogs() {
  const byDomain = new Map<string, Set<string>>();

  if (fs.existsSync(taxonomyPath)) {
    const tax = JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
    const clusters = tax.clusters || {};
    for (const [domain, ids] of Object.entries(clusters)) {
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        addDocTypeId(byDomain, domain, String(id || ""));
      }
    }
  }

  if (fs.existsSync(domainCatalogRoot)) {
    const dirs = fs
      .readdirSync(domainCatalogRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const dir of dirs) {
      const catalogPath = path.join(
        domainCatalogRoot,
        dir,
        "doc_types",
        "doc_type_catalog.any.json",
      );
      if (!fs.existsSync(catalogPath)) continue;

      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      const domain = String(
        catalog?.domain || catalog?.config?.domain || dir || "",
      )
        .trim()
        .toLowerCase();
      const docTypes = Array.isArray(catalog?.docTypes) ? catalog.docTypes : [];
      for (const docType of docTypes) {
        addDocTypeId(byDomain, domain, String(docType?.id || ""));
      }
    }
  }

  const all = new Set<string>();
  for (const ids of byDomain.values()) {
    for (const id of ids) all.add(id);
  }

  return {
    byDomain,
    all,
  };
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

describe("Document Intelligence Eval Pack", () => {
  const registry = loadRegistry();
  const parityTolerance =
    Number.isFinite(Number(registry?.config?.parityTolerancePercent))
      ? Number(registry.config.parityTolerancePercent) / 100
      : 0.1;
  const docTypeCatalogs = loadDocTypeCatalogs();
  const suites: Suite[] = registry.suites || [];
  const knownDomains = new Set(
    suites
      .flatMap((suite) => suite.domains || [])
      .map((domain) => String(domain || "").trim().toLowerCase())
      .filter(Boolean),
  );
  for (const domain of docTypeCatalogs.byDomain.keys()) knownDomains.add(domain);

  test("suite registry exists and has suites", () => {
    expect(suites.length).toBeGreaterThan(0);
  });

  test("suite registry schema definition is present", () => {
    expect(registry.schema).toBeDefined();
    expect(registry.schema.required).toContain("id");
    expect(registry.schema.required).toContain("lang");
    expect(registry.schema.required).toContain("query");
    expect(registry.schema.required).toContain("expected");
  });

  for (const suite of suites) {
    describe(`Suite: ${suite.id}`, () => {
      const cases = loadSuiteCases(suite);
      const suiteDomains = new Set(
        (suite.domains || [])
          .map((value) => String(value || "").trim().toLowerCase())
          .filter(Boolean),
      );

      test(`has at least ${suite.minimumCases} cases`, () => {
        expect(cases.length).toBeGreaterThanOrEqual(suite.minimumCases);
      });

      test("all cases have required fields", () => {
        const missing: string[] = [];
        for (const c of cases) {
          if (!c.id) missing.push("case missing id");
          if (!c.lang) missing.push(`${c.id}: missing lang`);
          if (!c.domain) missing.push(`${c.id}: missing domain`);
          if (!c.docTypeId) missing.push(`${c.id}: missing docTypeId`);
          if (!c.queryFamily) missing.push(`${c.id}: missing queryFamily`);
          if (!c.query) missing.push(`${c.id}: missing query`);
          if (!c.expected) missing.push(`${c.id}: missing expected`);
        }
        expect(missing).toEqual([]);
      });

      test("all IDs are unique", () => {
        const ids = cases.map((c) => c.id);
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        expect(dupes).toEqual([]);
      });

      test("all langs are valid (en|pt)", () => {
        const invalid = cases.filter((c) => !VALID_LANGS.includes(c.lang));
        expect(invalid.map((c) => `${c.id}:${c.lang}`)).toEqual([]);
      });

      test("all domains are valid", () => {
        const invalid = cases.filter((c) => {
          const domain = String(c.domain || "").trim().toLowerCase();
          if (!domain) return true;
          if (suiteDomains.size > 0 && !suiteDomains.has(domain)) return true;
          return !knownDomains.has(domain);
        });
        expect(
          invalid.map(
            (c) => `${c.id}:${c.domain} (not in suite domains or known domains)`,
          ),
        ).toEqual([]);
      });

      test("all docTypeIds resolve in domain catalogs", () => {
        if (docTypeCatalogs.all.size === 0) return;
        const invalid = cases.filter((c) => {
          const domain = String(c.domain || "").trim().toLowerCase();
          const canonicalDocTypeId = resolveLegacyDocTypeAlias(
            domain,
            c.docTypeId,
          );
          const domainDocTypes = docTypeCatalogs.byDomain.get(domain);
          if (domainDocTypes && domainDocTypes.size > 0) {
            return !domainDocTypes.has(canonicalDocTypeId);
          }
          return !docTypeCatalogs.all.has(canonicalDocTypeId);
        });
        expect(
          invalid.map(
            (c) =>
              `${c.id}: unknown docTypeId=${c.docTypeId} for domain=${c.domain}`,
          ),
        ).toEqual([]);
      });

      test("all formats are valid", () => {
        const invalid = cases.filter(
          (c) => c.expected && !VALID_FORMATS.includes(c.expected.format),
        );
        expect(
          invalid.map((c) => `${c.id}: bad format=${c.expected?.format}`),
        ).toEqual([]);
      });

      test("mustCite and mustNotDo are arrays", () => {
        const bad = cases.filter(
          (c) =>
            c.expected &&
            (!Array.isArray(c.expected.mustCite) ||
              !Array.isArray(c.expected.mustNotDo)),
        );
        expect(bad.map((c) => c.id)).toEqual([]);
      });

      test("has at least 20% negative cases", () => {
        const negCount = cases.filter((c) => c.expected?.negative === true).length;
        const ratio = cases.length > 0 ? negCount / cases.length : 0;
        expect(ratio).toBeGreaterThanOrEqual(MIN_NEGATIVE_RATIO);
      });

      test("EN/PT parity within 10% tolerance", () => {
        const enCount = cases.filter((c) => c.lang === "en").length;
        const ptCount = cases.filter((c) => c.lang === "pt").length;
        if (cases.length === 0) return;
        const enRatio = enCount / cases.length;
        const ptRatio = ptCount / cases.length;
        const gap = Math.abs(enRatio - ptRatio);
        expect(gap).toBeLessThanOrEqual(parityTolerance);
      });

      test("negative cases have refusalTrigger or clarifyTrigger", () => {
        const negCases = cases.filter((c) => c.expected?.negative === true);
        const missing = negCases.filter(
          (c) => !c.expected.refusalTrigger && !c.expected.clarifyTrigger,
        );
        expect(
          missing.map((c) => `${c.id}: negative but no refusal/clarify trigger`),
        ).toEqual([]);
      });

      test("positive cases have non-empty mustCite", () => {
        const posCases = cases.filter((c) => c.expected?.negative !== true);
        const empty = posCases.filter(
          (c) => !c.expected.mustCite || c.expected.mustCite.length === 0,
        );
        expect(empty.map((c) => `${c.id}: positive but empty mustCite`)).toEqual(
          [],
        );
      });

      if (
        suite.requiredLangs?.includes("en") &&
        suite.requiredLangs?.includes("pt")
      ) {
        test("has both EN and PT cases", () => {
          const enCount = cases.filter((c) => c.lang === "en").length;
          const ptCount = cases.filter((c) => c.lang === "pt").length;
          expect(enCount).toBeGreaterThan(0);
          expect(ptCount).toBeGreaterThan(0);
        });
      }

      test("covers all required domains", () => {
        const presentDomains = new Set(cases.map((c) => c.domain));
        for (const d of suite.domains || []) {
          expect(presentDomains.has(d)).toBe(true);
        }
      });
    });
  }

  describe("Cross-suite integrity", () => {
    test("no duplicate IDs across suites", () => {
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

    test("total case count meets overall minimum (1040)", () => {
      let total = 0;
      for (const suite of suites) {
        total += loadSuiteCases(suite).length;
      }
      expect(total).toBeGreaterThanOrEqual(1040);
    });

    test("overall EN/PT parity", () => {
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
      expect(gap).toBeLessThanOrEqual(parityTolerance);
    });
  });
});
