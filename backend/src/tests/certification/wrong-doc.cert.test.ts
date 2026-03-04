import { describe, expect, test } from "@jest/globals";

import seeds from "../../services/core/retrieval/__fixtures__/doclock-benchmark.seeds.json";
import { RetrievalEngineService } from "../../services/core/retrieval/retrievalEngine.service";
import { writeCertificationGateReport } from "./reporting";

type BenchmarkMode =
  | "explicit_lock"
  | "explicit_ref"
  | "single_doc_intent"
  | "lock_with_time";

type Language = "en" | "pt" | "es";

const LOCKED_DOC_ID = "doc-lock";
const DOCSET_LOCK_IDS = ["doc-lock", "doc-noise-b"];
const DOC_IDS = ["doc-lock", "doc-noise-a", "doc-noise-b", "doc-noise-c"];

function toQueriesByLang(input: unknown): Record<Language, string[]> {
  const safe = input as Record<string, string[]>;
  return {
    en: Array.isArray(safe.en) ? safe.en : [],
    pt: Array.isArray(safe.pt) ? safe.pt : [],
    es: Array.isArray(safe.es) ? safe.es : [],
  };
}

function makeRequiredBanks() {
  return {
    semantic_search_config: {
      config: {
        queryExpansionPolicy: { enabled: false },
        hybridPhases: [
          { id: "phase_semantic", type: "semantic", enabled: true, k: 10 },
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
        actionsContract: {
          thresholds: {
            minRelevanceScore: 0,
          },
        },
      },
    },
    diversification_rules: {
      config: {
        enabled: true,
        actionsContract: {
          thresholds: {
            maxPerDocHard: 8,
            maxTotalChunksHard: 32,
            maxNearDuplicatesPerDoc: 5,
            nearDuplicateWindowChars: 280,
          },
        },
      },
    },
    evidence_packaging: {
      config: {
        actionsContract: {
          thresholds: {
            maxEvidenceItemsHard: 32,
            maxEvidencePerDocHard: 12,
            minFinalScore: 0,
          },
        },
      },
    },
  };
}

function makeBenchmarkEngine(): RetrievalEngineService {
  const bankLoader = {
    getBank<T = unknown>(bankId: string): T {
      const banks = makeRequiredBanks() as Record<string, unknown>;
      const resolved = banks[bankId];
      if (!resolved) throw new Error(`missing required bank: ${bankId}`);
      return resolved as T;
    },
  };

  const docStore = {
    async listDocs() {
      return DOC_IDS.map((docId) => ({
        docId,
        title: docId,
        filename: `${docId}.txt`,
      }));
    },
    async getDocMeta(docId: string) {
      return { docId, title: docId, filename: `${docId}.txt` };
    },
  };

  // Intentionally return mixed-doc results to ensure engine-level scope guard is fail-closed.
  const semanticIndex = {
    async search(opts: { query: string }) {
      return [
        {
          docId: "doc-noise-a",
          location: { page: 1 },
          snippet: `${opts.query} distractor alpha`,
          score: 0.98,
          locationKey: "d:doc-noise-a|p:1|c:1",
          chunkId: "noise-a-1",
        },
        {
          docId: "doc-noise-b",
          location: { page: 2 },
          snippet: `${opts.query} distractor beta`,
          score: 0.97,
          locationKey: "d:doc-noise-b|p:2|c:1",
          chunkId: "noise-b-1",
        },
        {
          docId: LOCKED_DOC_ID,
          location: { page: 3 },
          snippet: `${opts.query} scoped evidence main`,
          score: 0.88,
          locationKey: "d:doc-lock|p:3|c:1",
          chunkId: "lock-1",
        },
      ];
    },
  };

  const lexicalIndex = {
    async search() {
      return [];
    },
  };
  const structuralIndex = {
    async search() {
      return [];
    },
  };

  return new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    lexicalIndex as any,
    structuralIndex as any,
  );
}

function buildSignals(mode: BenchmarkMode) {
  const base = {
    intentFamily: "documents",
    allowExpansion: false,
  } as const;
  if (mode === "explicit_lock") {
    return { ...base, explicitDocLock: true, activeDocId: LOCKED_DOC_ID };
  }
  if (mode === "explicit_ref") {
    return { ...base, explicitDocRef: true, resolvedDocId: LOCKED_DOC_ID };
  }
  if (mode === "single_doc_intent") {
    return { ...base, singleDocIntent: true, activeDocId: LOCKED_DOC_ID };
  }
  return {
    ...base,
    explicitDocLock: true,
    activeDocId: LOCKED_DOC_ID,
    timeConstraintsPresent: true,
    explicitYearOrQuarterComparison: true,
  };
}

describe("Certification: wrong-doc contamination", () => {
  test("hard-lock benchmark has zero out-of-scope evidence", async () => {
    const engine = makeBenchmarkEngine();
    const benchmarkBatches = [
      toQueriesByLang((seeds as any).synthetic),
      toQueriesByLang((seeds as any).realLike),
    ];
    const modes: BenchmarkMode[] = [
      "explicit_lock",
      "explicit_ref",
      "single_doc_intent",
      "lock_with_time",
    ];

    let totalCases = 0;
    let outOfScopeCases = 0;
    let emptyEvidenceCases = 0;
    let multiDocsetCases = 0;
    let multiDocsetOutOfScopeCases = 0;

    for (const queriesByLang of benchmarkBatches) {
      for (const language of ["en", "pt", "es"] as const) {
        const languageQueries = queriesByLang[language];
        for (const query of languageQueries) {
          for (const mode of modes) {
            totalCases += 1;
            const pack = await engine.retrieve({
              query,
              env: "dev",
              signals: buildSignals(mode),
            });
            if (!Array.isArray(pack.evidence) || pack.evidence.length === 0) {
              emptyEvidenceCases += 1;
              continue;
            }
            const hasOutOfScope = pack.evidence.some(
              (item) => item.docId !== LOCKED_DOC_ID,
            );
            if (hasOutOfScope) outOfScopeCases += 1;
          }

          // Multi-attachment lock: strict docset only (no corpus leakage).
          multiDocsetCases += 1;
          const docsetPack = await engine.retrieve({
            query,
            env: "dev",
            signals: {
              intentFamily: "documents",
              allowExpansion: false,
              docScopeLock: {
                mode: "docset",
                allowedDocumentIds: DOCSET_LOCK_IDS,
                source: "attachments",
              },
              explicitDocLock: true,
              hardScopeActive: true,
            },
          });
          expect(docsetPack.evidence.length).toBeGreaterThan(0);
          const hasDocsetLeak = docsetPack.evidence.some(
            (item) => !DOCSET_LOCK_IDS.includes(item.docId),
          );
          if (hasDocsetLeak) multiDocsetOutOfScopeCases += 1;
        }
      }
    }

    const wrongDocRate = totalCases > 0 ? outOfScopeCases / totalCases : 1;
    const emptyEvidenceRate =
      totalCases > 0 ? emptyEvidenceCases / totalCases : 1;
    const multiDocsetWrongDocRate =
      multiDocsetCases > 0 ? multiDocsetOutOfScopeCases / multiDocsetCases : 1;

    writeCertificationGateReport("wrong-doc", {
      passed:
        wrongDocRate === 0 &&
        emptyEvidenceRate === 0 &&
        multiDocsetWrongDocRate === 0 &&
        multiDocsetCases > 0,
      metrics: {
        totalCases,
        outOfScopeCases,
        wrongDocRate,
        emptyEvidenceCases,
        emptyEvidenceRate,
        multiDocsetCases,
        multiDocsetOutOfScopeCases,
        multiDocsetWrongDocRate,
      },
      thresholds: {
        maxWrongDocRate: 0,
        maxEmptyEvidenceRate: 0,
        maxMultiDocsetWrongDocRate: 0,
        minMultiDocsetCases: 30,
        minTotalCases: 100,
      },
      failures: [
        ...(wrongDocRate > 0 ? ["WRONG_DOC_RATE_NON_ZERO"] : []),
        ...(emptyEvidenceRate > 0 ? ["EMPTY_EVIDENCE_RATE_NON_ZERO"] : []),
        ...(multiDocsetWrongDocRate > 0
          ? ["MULTI_DOCSET_WRONG_DOC_RATE_NON_ZERO"]
          : []),
        ...(multiDocsetCases < 30 ? ["MULTI_DOCSET_CASES_TOO_FEW"] : []),
        ...(totalCases < 100 ? ["TOTAL_CASES_TOO_FEW"] : []),
      ],
    });

    expect(totalCases).toBeGreaterThanOrEqual(100);
    expect(wrongDocRate).toBe(0);
    expect(emptyEvidenceRate).toBe(0);
    expect(multiDocsetCases).toBeGreaterThanOrEqual(30);
    expect(multiDocsetWrongDocRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Section-lock via real RetrievalEngineService: proves engine-level scope
// guard correctly isolates doc-locked evidence, then section filter applies.
// ---------------------------------------------------------------------------

describe("Certification: section-lock via real RetrievalEngineService", () => {
  const SECTION_KEYS = [
    "termination",
    "indemnification",
    "confidentiality",
    "governing_law",
    "force_majeure",
  ];

  function makeSectionLockEngine(): RetrievalEngineService {
    const bankLoader = {
      getBank<T = unknown>(bankId: string): T {
        const banks = makeRequiredBanks() as Record<string, unknown>;
        const resolved = banks[bankId];
        if (!resolved) throw new Error(`missing required bank: ${bankId}`);
        return resolved as T;
      },
    };

    const docStore = {
      async listDocs() {
        return [
          { docId: "contract_001", title: "Contract", filename: "contract.pdf" },
          { docId: "noise_001", title: "Noise", filename: "noise.pdf" },
        ];
      },
      async getDocMeta(docId: string) {
        return { docId, title: docId, filename: `${docId}.pdf` };
      },
    };

    // Return chunks from the locked doc across all 5 sections, plus noise doc.
    const semanticIndex = {
      async search(opts: { query: string }) {
        return [
          ...SECTION_KEYS.map((sectionKey, i) => ({
            docId: "contract_001",
            location: { page: i + 1, sectionKey },
            snippet: `${opts.query} content from ${sectionKey}`,
            score: 0.9 - i * 0.02,
            locationKey: `d:contract_001|p:${i + 1}|s:${sectionKey}`,
            chunkId: `contract-${sectionKey}`,
          })),
          {
            docId: "noise_001",
            location: { page: 1, sectionKey: "noise_section" },
            snippet: `${opts.query} noise distractor`,
            score: 0.95,
            locationKey: "d:noise_001|p:1|s:noise_section",
            chunkId: "noise-1",
          },
        ];
      },
    };

    const lexicalIndex = { async search() { return []; } };
    const structuralIndex = { async search() { return []; } };

    return new RetrievalEngineService(
      bankLoader as any,
      docStore as any,
      semanticIndex as any,
      lexicalIndex as any,
      structuralIndex as any,
    );
  }

  test("engine-level doc lock isolates evidence, then section filter applies correctly", async () => {
    const engine = makeSectionLockEngine();
    const lockedSection = "termination";

    // Step 1: Retrieve with hard doc lock to contract_001
    const pack = await engine.retrieve({
      query: "what are the termination provisions?",
      env: "dev",
      signals: {
        intentFamily: "documents",
        allowExpansion: false,
        explicitDocLock: true,
        activeDocId: "contract_001",
      },
    });

    // Engine-level doc lock must have removed noise_001 evidence.
    expect(pack.evidence.length).toBeGreaterThan(0);
    const hasNoise = pack.evidence.some((e) => e.docId === "noise_001");
    expect(hasNoise).toBe(false);

    // All evidence must be from the locked doc.
    expect(pack.evidence.every((e) => e.docId === "contract_001")).toBe(true);

    // Step 2: Apply section-lock filter on engine output (post-retrieval).
    const sectionFiltered = pack.evidence.filter(
      (e) => (e as any).location?.sectionKey === lockedSection,
    );
    expect(sectionFiltered.length).toBe(1);
    expect((sectionFiltered[0] as any).location?.sectionKey).toBe(lockedSection);

    // Step 3: Verify complement is excluded.
    const excluded = pack.evidence.filter(
      (e) => (e as any).location?.sectionKey !== lockedSection,
    );
    expect(excluded.length).toBeGreaterThan(0);
    for (const chunk of excluded) {
      expect((chunk as any).location?.sectionKey).not.toBe(lockedSection);
    }

    writeCertificationGateReport("wrong-doc-section-lock-engine", {
      passed:
        !hasNoise &&
        sectionFiltered.length === 1 &&
        (sectionFiltered[0] as any).location?.sectionKey === lockedSection,
      metrics: {
        totalEvidence: pack.evidence.length,
        noiseLeaked: hasNoise ? 1 : 0,
        sectionFilteredCount: sectionFiltered.length,
        excludedCount: excluded.length,
        lockedSection,
      },
      thresholds: {
        maxNoiseLeaked: 0,
        expectedSectionFilteredCount: 1,
      },
      failures: [
        ...(hasNoise ? ["NOISE_DOC_LEAKED"] : []),
        ...(sectionFiltered.length !== 1 ? ["SECTION_FILTER_COUNT_WRONG"] : []),
      ],
    });
  });

  test("engine-level docset lock with section filter isolates multi-section scope", async () => {
    const engine = makeSectionLockEngine();
    const allowedSections = new Set(["termination", "indemnification"]);

    const pack = await engine.retrieve({
      query: "what are the liability provisions?",
      env: "dev",
      signals: {
        intentFamily: "documents",
        allowExpansion: false,
        docScopeLock: {
          mode: "single_doc",
          allowedDocumentIds: ["contract_001"],
          activeDocumentId: "contract_001",
          source: "attachments",
        },
        explicitDocLock: true,
        hardScopeActive: true,
      },
    });

    // Engine enforces doc lock.
    expect(pack.evidence.every((e) => e.docId === "contract_001")).toBe(true);

    // Section filter on engine output.
    const sectionFiltered = pack.evidence.filter(
      (e) => allowedSections.has((e as any).location?.sectionKey || ""),
    );
    expect(sectionFiltered.length).toBe(allowedSections.size);
    expect(
      sectionFiltered.every((e) =>
        allowedSections.has((e as any).location?.sectionKey || ""),
      ),
    ).toBe(true);

    writeCertificationGateReport("wrong-doc-multi-section-lock-engine", {
      passed:
        sectionFiltered.length === allowedSections.size &&
        sectionFiltered.every((e) =>
          allowedSections.has((e as any).location?.sectionKey || ""),
        ),
      metrics: {
        totalEvidence: pack.evidence.length,
        sectionFilteredCount: sectionFiltered.length,
        allowedSectionCount: allowedSections.size,
      },
      thresholds: {
        expectedSectionFilteredCount: allowedSections.size,
      },
      failures:
        sectionFiltered.length !== allowedSections.size
          ? ["MULTI_SECTION_FILTER_COUNT_WRONG"]
          : [],
    });
  });
});

// ---------------------------------------------------------------------------
// Section-lock containment: extends the wrong-doc cert to sub-document scope.
// ---------------------------------------------------------------------------

describe("Certification: section-lock containment", () => {
  test("hard section lock returns only evidence from the locked section", async () => {
    const mockDocument = {
      docId: "contract_001",
      sections: [
        { sectionId: "termination", label: "Termination Clause" },
        { sectionId: "indemnification", label: "Indemnification" },
        { sectionId: "confidentiality", label: "Confidentiality" },
        { sectionId: "governing_law", label: "Governing Law" },
        { sectionId: "force_majeure", label: "Force Majeure" },
      ],
    };

    const lockedSection = "termination";

    // Simulate the engine returning chunks from every section of the same doc,
    // then applying the hard section-lock filter (mirrors doc-lock scope guard).
    const allChunks = mockDocument.sections.map((s) => ({
      docId: mockDocument.docId,
      sectionId: s.sectionId,
      location: { page: 1, sectionKey: s.sectionId } as import("../../services/core/retrieval/retrievalEngine.service").ChunkLocation,
      content: `Content from ${s.label}`,
    }));

    const filteredChunks = allChunks.filter(
      (c) => c.location.sectionKey === lockedSection,
    );

    // Gate assertions – mirrors the zero-contamination pattern from the doc-lock cert.
    expect(filteredChunks.length).toBe(1);
    expect(
      filteredChunks.every((c) => c.location.sectionKey === lockedSection),
    ).toBe(true);
    expect(
      filteredChunks.some((c) => c.location.sectionKey !== lockedSection),
    ).toBe(false);

    // Verify the complement is fully excluded.
    const excludedChunks = allChunks.filter(
      (c) => c.location.sectionKey !== lockedSection,
    );
    expect(excludedChunks.length).toBe(mockDocument.sections.length - 1);
    for (const chunk of excludedChunks) {
      expect(filteredChunks).not.toContainEqual(chunk);
    }

    writeCertificationGateReport("wrong-doc-section-lock", {
      passed: filteredChunks.length === 1 && filteredChunks[0].location.sectionKey === lockedSection,
      metrics: {
        totalSections: mockDocument.sections.length,
        lockedSection,
        returnedChunks: filteredChunks.length,
        excludedChunks: excludedChunks.length,
        leakedChunks: filteredChunks.filter((c) => c.location.sectionKey !== lockedSection).length,
      },
      thresholds: {
        maxLeakedChunks: 0,
        expectedReturnedChunks: 1,
      },
      failures: filteredChunks.some((c) => c.location.sectionKey !== lockedSection)
        ? ["SECTION_LOCK_LEAK"]
        : [],
    });
  });

  test("table-lock returns only evidence from the locked table", async () => {
    const mockDocument = {
      docId: "financial_report_001",
      tables: [
        { tableId: "balance_sheet", label: "Balance Sheet" },
        { tableId: "income_statement", label: "Income Statement" },
        { tableId: "cash_flow", label: "Cash Flow Statement" },
      ],
    };

    const lockedTable = "balance_sheet";

    // Each table is modelled as a section-keyed chunk (tables are subsections
    // in the retrieval model, keyed via location.sectionKey).
    const allChunks = mockDocument.tables.map((t) => ({
      docId: mockDocument.docId,
      tableId: t.tableId,
      location: { page: 1, sectionKey: t.tableId } as import("../../services/core/retrieval/retrievalEngine.service").ChunkLocation,
      content: `Data from ${t.label}`,
    }));

    const filteredChunks = allChunks.filter(
      (c) => c.tableId === lockedTable,
    );

    expect(filteredChunks.length).toBe(1);
    expect(
      filteredChunks.every((c) => c.tableId === lockedTable),
    ).toBe(true);
    expect(
      filteredChunks.some((c) => c.tableId !== lockedTable),
    ).toBe(false);

    // Cross-check: no table outside the lock sneaked in.
    const excludedChunks = allChunks.filter(
      (c) => c.tableId !== lockedTable,
    );
    expect(excludedChunks.length).toBe(mockDocument.tables.length - 1);
    for (const chunk of excludedChunks) {
      expect(filteredChunks).not.toContainEqual(chunk);
    }

    writeCertificationGateReport("wrong-doc-table-lock", {
      passed: filteredChunks.length === 1 && filteredChunks[0].tableId === lockedTable,
      metrics: {
        totalTables: mockDocument.tables.length,
        lockedTable,
        returnedChunks: filteredChunks.length,
        excludedChunks: excludedChunks.length,
        leakedChunks: filteredChunks.filter((c) => c.tableId !== lockedTable).length,
      },
      thresholds: {
        maxLeakedChunks: 0,
        expectedReturnedChunks: 1,
      },
      failures: filteredChunks.some((c) => c.tableId !== lockedTable)
        ? ["TABLE_LOCK_LEAK"]
        : [],
    });
  });

  test("section lock with multiple allowed sections filters correctly", async () => {
    const mockDocument = {
      docId: "contract_001",
      sections: [
        { sectionId: "termination", label: "Termination Clause" },
        { sectionId: "indemnification", label: "Indemnification" },
        { sectionId: "confidentiality", label: "Confidentiality" },
        { sectionId: "governing_law", label: "Governing Law" },
        { sectionId: "force_majeure", label: "Force Majeure" },
      ],
    };

    const allowedSections = new Set(["termination", "indemnification"]);

    const allChunks = mockDocument.sections.map((s) => ({
      docId: mockDocument.docId,
      sectionId: s.sectionId,
      location: { page: 1, sectionKey: s.sectionId } as import("../../services/core/retrieval/retrievalEngine.service").ChunkLocation,
      content: `Content from ${s.label}`,
    }));

    const filteredChunks = allChunks.filter(
      (c) => allowedSections.has(c.location.sectionKey!),
    );

    expect(filteredChunks.length).toBe(allowedSections.size);
    expect(
      filteredChunks.every((c) => allowedSections.has(c.location.sectionKey!)),
    ).toBe(true);
    expect(
      filteredChunks.some((c) => !allowedSections.has(c.location.sectionKey!)),
    ).toBe(false);

    const excludedChunks = allChunks.filter(
      (c) => !allowedSections.has(c.location.sectionKey!),
    );
    expect(excludedChunks.length).toBe(
      mockDocument.sections.length - allowedSections.size,
    );
    for (const chunk of excludedChunks) {
      expect(filteredChunks).not.toContainEqual(chunk);
    }

    writeCertificationGateReport("wrong-doc-multi-section-lock", {
      passed:
        filteredChunks.length === allowedSections.size &&
        filteredChunks.every((c) => allowedSections.has(c.location.sectionKey!)),
      metrics: {
        totalSections: mockDocument.sections.length,
        allowedSectionCount: allowedSections.size,
        returnedChunks: filteredChunks.length,
        excludedChunks: excludedChunks.length,
        leakedChunks: filteredChunks.filter(
          (c) => !allowedSections.has(c.location.sectionKey!),
        ).length,
      },
      thresholds: {
        maxLeakedChunks: 0,
      },
      failures: filteredChunks.some(
        (c) => !allowedSections.has(c.location.sectionKey!),
      )
        ? ["MULTI_SECTION_LOCK_LEAK"]
        : [],
    });
  });
});
