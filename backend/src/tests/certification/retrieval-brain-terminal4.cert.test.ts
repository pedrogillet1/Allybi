import { describe, expect, test } from "@jest/globals";

import { RetrievalEngineService } from "../../services/core/retrieval/retrievalEngine.service";
import { writeCertificationGateReport } from "./reporting";

function makeBanks() {
  return {
    semantic_search_config: {
      config: {
        queryExpansionPolicy: { enabled: false },
        hybridPhases: [
          { id: "phase_semantic", type: "semantic", enabled: true, k: 8 },
        ],
      },
    },
    retrieval_ranker_config: {
      config: {
        weights: {
          semantic: 1,
          lexical: 0,
          structural: 0,
          titleBoost: 0,
          typeBoost: 0,
          recencyBoost: 0,
          documentIntelligenceBoost: 0,
        },
        actionsContract: {
          thresholds: {
            minFinalScore: 0,
          },
        },
      },
    },
    retrieval_negatives: {
      config: {
        enabled: true,
        actionsContract: { thresholds: { minRelevanceScore: 0 } },
      },
    },
    diversification_rules: {
      config: {
        enabled: true,
        actionsContract: {
          thresholds: {
            maxPerDocHard: 4,
            maxTotalChunksHard: 12,
            maxNearDuplicatesPerDoc: 2,
            nearDuplicateWindowChars: 160,
          },
        },
      },
    },
    evidence_packaging: {
      config: {
        actionsContract: {
          thresholds: {
            maxEvidenceItemsHard: 8,
            maxEvidencePerDocHard: 4,
            minFinalScore: 0,
          },
        },
      },
    },
    snippet_compression_policy: {
      config: {
        maxSnippetChars: 280,
        preserveNumericUnits: true,
        preserveHeadings: true,
      },
    },
    keyword_boost_rules: { rules: [] },
    doc_title_boost_rules: { rules: [] },
    doc_type_boost_rules: { rules: [] },
    recency_boost_rules: { rules: [] },
    routing_priority: { config: { enabled: false } },
  };
}

function makeEngine() {
  const bankLoader = {
    getBank<T = unknown>(bankId: string): T {
      const banks = makeBanks() as Record<string, unknown>;
      const value = banks[bankId];
      if (!value) throw new Error(`missing bank: ${bankId}`);
      return value as T;
    },
  };

  const docStore = {
    async listDocs() {
      return [
        { docId: "doc-a", title: "Alpha", filename: "alpha.pdf" },
        { docId: "doc-b", title: "Beta", filename: "beta.pdf" },
        { docId: "doc-noise", title: "Noise", filename: "noise.pdf" },
      ];
    },
    async getDocMeta(docId: string) {
      return { docId, title: docId, filename: `${docId}.pdf` };
    },
  };

  const semanticIndex = {
    async search(opts: { query: string; docIds?: string[]; k: number }) {
      const rows = [
        {
          docId: "doc-a",
          title: "Alpha",
          filename: "alpha.pdf",
          docType: "report",
          location: { page: 7, sectionKey: "Revenue" },
          locationKey: "d:doc-a|p:7|sec:Revenue|cell:B14|c:1",
          snippet:
            'Revenue field says EBITDA margin improved. "EBITDA margin improved" with support from upsell.',
          score: 0.93,
          chunkId: "alpha-1",
        },
        {
          docId: "doc-b",
          title: "Beta",
          filename: "beta.pdf",
          docType: "report",
          location: { page: 4, sectionKey: "Revenue" },
          locationKey: "d:doc-b|p:4|sec:Revenue|cell:C9|c:1",
          snippet: "Revenue field says gross margin declined.",
          score: 0.88,
          chunkId: "beta-1",
        },
        {
          docId: "doc-noise",
          title: "Noise",
          filename: "noise.pdf",
          docType: "memo",
          location: { page: 1, sectionKey: "placeholder" },
          locationKey: "d:doc-noise|p:1|sec:placeholder|c:1",
          snippet: "lorem ipsum placeholder sample text",
          score: 0.99,
          chunkId: "noise-1",
        },
      ];
      const filtered = rows.filter(
        (row) => !opts.docIds || opts.docIds.includes(row.docId),
      );
      return filtered.slice(0, opts.k);
    },
  };

  const noopIndex = {
    async search() {
      return [];
    },
  };

  const diBanks = {
    getCrossDocGroundingPolicy() {
      return null;
    },
    getCrossDocSynthesisRules() {
      return {
        config: { enabled: true },
        retrievalPolicy: {},
        rules: [
          {
            id: "compare_requires_two_docs",
            operators: ["compare"],
            minExplicitResolvedDocs: 2,
            enabled: true,
            priority: 100,
          },
        ],
      };
    },
    getDocumentIntelligenceDomains() {
      return { domains: [] };
    },
    getDiDocTypes() {
      return { docTypes: [] };
    },
    getDiDomains() {
      return { domains: [] };
    },
    getDiMetrics() {
      return { metrics: [] };
    },
    getDiSections() {
      return { sections: [] };
    },
    getDiUnits() {
      return { units: [] };
    },
    getFieldRoleOntology() {
      return { roles: [] };
    },
    getDocTypeCatalog() {
      return { docTypes: [] };
    },
    getDocTypeSections() {
      return { sections: [] };
    },
    getDocTypeTables() {
      return { tables: [], headerMappings: [] };
    },
    getDomainDetectionRules() {
      return { config: {}, rules: [] };
    },
    getRetrievalBoostRules() {
      return { config: {}, rules: [] };
    },
    getRetrievalRankerConfig() {
      return {
        config: {
          enabled: true,
        },
        weights: {
          semantic: 1,
          documentIntelligenceBoost: 0.4,
        },
      };
    },
    getQueryRewriteRules() {
      return { config: { maxRewriteTerms: 8 }, rules: [] };
    },
    getRetrievalQueryRewritePolicy() {
      return {
        config: { enabled: true },
        rewrites: [
          {
            id: "rewrite_ytd",
            pattern: "\\bEBITDA\\b",
            replaceWith: "EBITDA margin",
          },
        ],
      };
    },
    getSectionPriorityRules() {
      return { priorities: [] };
    },
    getRetrievalSectionBoostRules() {
      return {
        priorities: [{ id: "sec_revenue", sections: ["revenue"] }],
      };
    },
    getRetrievalTableBoostRules() {
      return {
        rules: [{ id: "table_revenue", sections: ["revenue", "b14"] }],
      };
    },
    getFieldLockPatterns() {
      return {
        patterns: [{ field: "revenue" }, { field: "ebitda margin" }],
      };
    },
    getQuoteSpanRules() {
      return {
        config: { contextWindowChars: 12 },
      };
    },
    getEvidenceBindingContract() {
      return {
        config: {
          enabled: true,
          requireRichLocationProvenance: true,
        },
      };
    },
    getEvidencePackagingStrategies() {
      return {
        config: {
          enabled: true,
          requireLocation: true,
        },
      };
    },
    getNegativeRetrievalPatterns() {
      return {
        patterns: [{ regex: "lorem ipsum|placeholder", action: "DROP_CANDIDATE" }],
      };
    },
    getSynonymExpansion() {
      return null;
    },
    getLanguageIndicators() {
      return null;
    },
    getScopeResolutionRules() {
      return null;
    },
    getDocLockPolicy() {
      return null;
    },
  };

  return new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    noopIndex as any,
    noopIndex as any,
    undefined,
    diBanks as any,
  );
}

describe("Certification: terminal 4 retrieval brain", () => {
  test("proves provenance richness, field locking, quote spans, and wrong-doc controls", async () => {
    const engine = makeEngine();

    const lockedPack = await engine.retrieve({
      query: 'extract the Revenue field with "EBITDA margin improved"',
      env: "dev",
      signals: {
        intentFamily: "documents",
        operator: "extract",
        explicitDocLock: true,
        activeDocId: "doc-a",
        allowExpansion: false,
      },
    });

    expect(lockedPack.evidence.length).toBeGreaterThan(0);
    expect(lockedPack.evidence.every((item) => item.docId === "doc-a")).toBe(true);
    expect(lockedPack.evidence.some((item) => item.page === 7)).toBe(true);
    expect(lockedPack.evidence.some((item) => item.cell === "B14")).toBe(true);
    expect(
      lockedPack.evidence.some(
        (item) =>
          String(item.locationLabel || "").includes("Page 7") &&
          String(item.locationLabel || "").includes("Cell B14"),
      ),
    ).toBe(true);
    expect(
      lockedPack.evidence.some((item) =>
        String(item.snippet || "").includes("EBITDA margin improved"),
      ),
    ).toBe(true);
    expect(
      lockedPack.evidence.every((item) =>
        String(item.snippet || "").toLowerCase().includes("revenue"),
      ),
    ).toBe(true);
    expect(
      lockedPack.evidence.some((item) => item.docId === "doc-noise"),
    ).toBe(false);

    const compareBlocked = await engine.retrieve({
      query: "compare revenue trends",
      env: "dev",
      signals: {
        intentFamily: "documents",
        operator: "compare",
        explicitDocIds: ["doc-a"],
        allowExpansion: false,
      },
    });

    expect(compareBlocked.evidence).toHaveLength(0);
    expect(compareBlocked.debug?.reasonCodes).toContain(
      "cross_doc_compare_needs_explicit_docs",
    );

    const compareAllowed = await engine.retrieve({
      query: "compare revenue trends",
      env: "dev",
      signals: {
        intentFamily: "documents",
        operator: "compare",
        explicitDocIds: ["doc-a", "doc-b"],
        allowExpansion: false,
      },
    });

    const compareDocs = new Set(compareAllowed.evidence.map((item) => item.docId));
    expect(compareDocs.has("doc-a")).toBe(true);
    expect(compareDocs.has("doc-b")).toBe(true);

    writeCertificationGateReport("retrieval-brain-terminal4", {
      passed: true,
      metrics: {
        provenanceRichness: lockedPack.evidence.filter(
          (item) => item.page && item.cell && item.locationLabel,
        ).length,
        wrongDocLeakCount: lockedPack.evidence.filter((item) => item.docId !== "doc-a").length,
        compareEvidenceDocs: compareDocs.size,
        quoteSpanHits: lockedPack.evidence.filter((item) =>
          String(item.snippet || "").includes("EBITDA margin improved"),
        ).length,
        irrelevantSuppressed: lockedPack.evidence.filter((item) => item.docId === "doc-noise").length === 0 ? 1 : 0,
      },
      thresholds: {
        provenanceRichness: ">=1",
        wrongDocLeakCount: "==0",
        compareEvidenceDocs: ">=2",
        quoteSpanHits: ">=1",
        irrelevantSuppressed: "==1",
      },
      failures: [],
    });
  });
});
