import {
  describe,
  expect,
  test,
} from "@jest/globals";

import {
  DocumentIntelligenceBanksService,
  normalizeDocumentIntelligenceDomain,
} from "./documentIntelligenceBanks.service";

type LoaderMap = Record<string, Record<string, unknown>>;

function makeLoader(banks: LoaderMap) {
  return {
    getBank<T = unknown>(bankId: string): T {
      const value = banks[bankId];
      if (!value) {
        throw new Error(`missing bank: ${bankId}`);
      }
      return value as T;
    },
    getOptionalBank<T = unknown>(bankId: string): T | null {
      return (banks[bankId] as T) || null;
    },
    listLoaded(): string[] {
      return Object.keys(banks);
    },
  };
}

describe("DocumentIntelligenceBanksService", () => {
  test("normalizes domain aliases", () => {
    expect(normalizeDocumentIntelligenceDomain("operations")).toBe("ops");
    expect(normalizeDocumentIntelligenceDomain("finance")).toBe("finance");
    expect(normalizeDocumentIntelligenceDomain("unknown")).toBeNull();
  });

  test("builds merged alias thresholds from domain banks when legacy bank is absent", () => {
    const svc = new DocumentIntelligenceBanksService(
      makeLoader({
        doc_aliases_finance: {
          config: { minAliasConfidence: 0.82 },
          aliases: [{ phrase: "10-k", normalized: "10k" }],
          _meta: { version: "1.0.0", lastUpdated: "2026-01-01" },
        },
        doc_aliases_legal: {
          config: { minAliasConfidence: 0.77 },
          aliases: [{ phrase: "msa", normalized: "master services agreement" }],
          _meta: { version: "1.0.0", lastUpdated: "2026-01-01" },
        },
      }) as any,
    );

    const thresholds = svc.getDocAliasThresholds();
    expect(thresholds.minAliasConfidence).toBe(0.77);
    expect(thresholds.autopickConfidence).toBe(0.88);
    expect(thresholds.autopickGap).toBe(0.25);

    const merged = svc.getMergedDocAliasesBank();
    expect(merged.aliases.length).toBe(2);
  });

  test("resolves legal docType lookup by stripping legal_ prefix", () => {
    const svc = new DocumentIntelligenceBanksService(
      makeLoader({
        legal_doc_type_catalog: {
          types: [{ id: "legal_nda" }],
        },
        legal_nda_sections: {
          sections: [{ id: "s1" }],
        },
      }) as any,
    );

    const sections = svc.getDocTypeSections("legal", "legal_nda");
    expect(sections).toBeTruthy();
    expect((sections as any).sections[0].id).toBe("s1");
  });

  test("falls back to version-suffixed legal doc-type packs when unsuffixed ids are absent", () => {
    const svc = new DocumentIntelligenceBanksService(
      makeLoader({
        legal_nda_sections_v215acb2d: {
          sections: [{ id: "termination" }],
        },
        legal_nda_tables_v215acb2d: {
          tables: [{ id: "obligations_table" }],
        },
        legal_nda_extraction_hints_v94b17eb1: {
          hints: [{ id: "extract_confidentiality_term" }],
        },
      }) as any,
    );

    expect(svc.getDocTypeSections("legal", "legal_nda")).toBeTruthy();
    expect(svc.getDocTypeTables("legal", "legal_nda")).toBeTruthy();
    expect(svc.getDocTypeExtractionHints("legal", "legal_nda")).toBeTruthy();
  });

  test("supports legacy legal double-prefix bank ids for malformed canonical ids", () => {
    const svc = new DocumentIntelligenceBanksService(
      makeLoader({
        legal_legal_lease_agreement_sections: {
          sections: [{ id: "rent_schedule" }],
        },
      }) as any,
    );

    const sections = svc.getDocTypeSections("legal", "legal_lease_agreement");
    expect(sections).toBeTruthy();
    expect((sections as any).sections[0].id).toBe("rent_schedule");
  });

  test("maps legal alias doc types to canonical section packs", () => {
    const svc = new DocumentIntelligenceBanksService(
      makeLoader({
        legal_terms_of_service_sections: {
          sections: [{ id: "governing_law" }],
        },
      }) as any,
    );

    const sections = svc.getDocTypeSections("legal", "terms");
    expect(sections).toBeTruthy();
    expect((sections as any).sections[0].id).toBe("governing_law");
  });

  test("returns diagnostics warning when required core bank is missing", () => {
    const svc = new DocumentIntelligenceBanksService(
      makeLoader({
        document_intelligence_bank_map: {
          requiredCoreBankIds: ["missing_required_bank"],
          optionalBankIds: [],
        },
      }) as any,
    );

    const diagnostics = svc.listDiagnostics();
    expect(
      diagnostics.validationWarnings.some((msg) =>
        msg.includes("missing_required_bank"),
      ),
      ).toBe(true);
  });

  test("falls back to _v2 accounting family and legacy doc-type ordering", () => {
    const svc = new DocumentIntelligenceBanksService(
      makeLoader({
        di_accounting_doc_type_catalog_v2: {
          docTypes: [{ id: "acct_trial_balance" }],
        },
        di_accounting_sections_acct_trial_balance: {
          sections: [{ id: "tb_header" }],
        },
        di_accounting_tables_acct_trial_balance: {
          tables: [{ id: "tb_lines" }],
        },
        di_accounting_extraction_acct_trial_balance: {
          extractionPatterns: [{ pattern: "balance" }],
        },
        di_accounting_domain_profile_v2: {
          indicators: ["applied"],
        },
        di_accounting_lexicon_en_v2: {
          terms: ["debit", "credit"],
        },
        di_accounting_abbreviations_en_v2: {
          terms: ["acct"],
        },
      }) as any,
    );

    expect(svc.getDocTypeCatalog("accounting")).toBeTruthy();
    expect(svc.getDocTypeSections("accounting", "acct_trial_balance")).toBeTruthy();
    expect(svc.getDocTypeTables("accounting", "acct_trial_balance")).toBeTruthy();
    expect(
      svc.getDocTypeExtractionHints("accounting", "acct_trial_balance"),
    ).toBeTruthy();
    expect(svc.getDomainProfile("accounting")).toBeTruthy();
    expect(svc.getDomainLexicon("accounting", "en")).toBeTruthy();
    expect(svc.getDomainAbbreviations("accounting", "en")).toBeTruthy();
  });
});
