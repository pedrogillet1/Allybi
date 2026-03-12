import { describe, expect, test } from "@jest/globals";

import { normalizeQuery } from "../QueryPreparation.service";
import { mergePhaseCandidates, extractTablePayload } from "../CandidateMerge.service";
import { rankCandidates } from "../Ranker.service";
import { packageEvidence } from "../EvidencePackager.service";
import { parseLocaleNumber } from "../ConflictDetection.service";
import { buildRetrievalCacheKey } from "../RetrievalCache.service";
import { emptyPack } from "../RetrievalTelemetry.service";
import { RETRIEVAL_CONFIG } from "../retrieval.config";

import type {
  QueryNormalizer,
  RetrievalPhaseResult,
  CandidateChunk,
  RetrievalRequest,
  BankLoader,
} from "../../retrieval.types";

// ── Helpers ────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    query: "test query",
    env: "local",
    signals: {},
    ...overrides,
  } as any;
}

function makeCandidate(overrides: Partial<CandidateChunk> = {}): CandidateChunk {
  return {
    candidateId: "c-1",
    type: "text",
    source: "semantic",
    docId: "doc-1",
    docType: null,
    title: null,
    filename: null,
    location: {},
    locationKey: "loc-1",
    snippet: "some snippet text",
    rawText: null,
    table: null,
    scores: { semantic: 0, lexical: 0, structural: 0, penalties: 0, final: 0 },
    signals: {},
    provenanceOk: true,
    ...overrides,
  } as any;
}

// ── BUG #1 — QueryPreparation passes languageHint not intentFamily ────

describe("BUG #1 — normalizeQuery passes languageHint, not intentFamily", () => {
  test("external normalizer receives languageHint instead of intentFamily", async () => {
    let capturedLangHint: string | undefined;

    const mockNormalizer: QueryNormalizer = {
      normalize: async (query: string, langHint?: string) => {
        capturedLangHint = langHint;
        return { normalized: query.toLowerCase(), hasQuotedText: false, hasFilename: false };
      },
    };

    const req = makeRequest({
      query: "What is the revenue?",
      signals: { languageHint: "pt-BR", intentFamily: "extraction" } as any,
    });

    await normalizeQuery(req, mockNormalizer);

    expect(capturedLangHint).toBe("pt-BR");
    expect(capturedLangHint).not.toBe("extraction");
  });
});

// ── BUG #2 — CandidateMerge uses content-based dedupe ─────────────────

describe("BUG #2 — CandidateMerge content-based deduplication", () => {
  test("same snippet text from different phases merges into one candidate", () => {
    const snippetText = "Revenue was 1M in Q1";

    const semanticPhase: RetrievalPhaseResult = {
      phaseId: "semantic-1",
      source: "semantic",
      hits: [
        {
          docId: "doc-1",
          location: { page: 1 },
          snippet: snippetText,
          score: 0.85,
          locationKey: "loc-sem-1",
          chunkId: "chunk-aaa",
        },
      ],
      status: "ok",
    } as any;

    const lexicalPhase: RetrievalPhaseResult = {
      phaseId: "lexical-1",
      source: "lexical",
      hits: [
        {
          docId: "doc-1",
          location: { page: 1 },
          snippet: snippetText,
          score: 0.70,
          locationKey: "loc-lex-1",
          chunkId: "chunk-bbb",
        },
      ],
      status: "ok",
    } as any;

    const scope = { candidateDocIds: [], hardScopeActive: false } as any;
    const req = makeRequest();
    const bankLoader = { getBank: () => ({}) } as any;

    const merged = mergePhaseCandidates(
      [semanticPhase, lexicalPhase],
      scope,
      req,
      bankLoader,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].scores.semantic).toBeGreaterThan(0);
    expect(merged[0].scores.lexical).toBeGreaterThan(0);
  });
});

// ── BUG #3 — TOC penalty applied post-ranking via tocPenaltyMultiplier ─

describe("BUG #3 — tocPenaltyMultiplier applied post-ranking", () => {
  test("candidate with tocPenaltyMultiplier=0.5 scores lower than unpenalized candidate", () => {
    const tocCandidate = makeCandidate({
      candidateId: "c-toc",
      docId: "doc-1",
      locationKey: "loc-1",
      scores: { semantic: 0.8, lexical: 0, structural: 0, penalties: 0, final: 0 },
      signals: { tocPenaltyMultiplier: 0.5 },
    });

    const normalCandidate = makeCandidate({
      candidateId: "c-normal",
      docId: "doc-2",
      locationKey: "loc-2",
      scores: { semantic: 0.6, lexical: 0, structural: 0, penalties: 0, final: 0 },
      signals: {},
    });

    const req = makeRequest({ signals: {} as any });
    const rankerCfg = {
      config: {
        weights: {
          semantic: 1,
          lexical: 0,
          structural: 0,
          titleBoost: 0,
          documentIntelligenceBoost: 0,
          routingPriorityBoost: 0,
          typeBoost: 0,
          recencyBoost: 0,
        },
      },
    };

    const ranked = rankCandidates(
      [tocCandidate, normalCandidate],
      req,
      req.signals,
      rankerCfg,
      undefined,
      false,
    );

    // TOC candidate: 0.8 * 1.0 * 0.5 = 0.4
    // Normal candidate: 0.6 * 1.0 * 1.0 = 0.6
    // So normal should rank first
    expect(ranked[0].candidateId).toBe("c-normal");
    expect(ranked[0].scores.final).toBeGreaterThan(ranked[1].scores.final);
    expect(ranked[1].candidateId).toBe("c-toc");
  });
});

// ── BUG #4 — selectedDocs tracking in packageEvidence ──────────────────

describe("BUG #4 — selectedDocs tracked unconditionally in packageEvidence", () => {
  test("safety net caps secondary docs when enforceNonComparePurity is off", () => {
    // classification.confidence < 0.35 => enforceNonComparePurity = false
    const candidates = [
      makeCandidate({
        candidateId: "c-primary",
        docId: "doc-primary",
        locationKey: "loc-p",
        snippet: "Primary document evidence about revenue figures",
        scores: { semantic: 0.9, lexical: 0, structural: 0, penalties: 0, final: 0.9 },
      }),
      makeCandidate({
        candidateId: "c-secondary-1",
        docId: "doc-s1",
        locationKey: "loc-s1",
        snippet: "Secondary doc one about different topic entirely",
        scores: { semantic: 0.3, lexical: 0, structural: 0, penalties: 0, final: 0.3 },
      }),
      makeCandidate({
        candidateId: "c-secondary-2",
        docId: "doc-s2",
        locationKey: "loc-s2",
        snippet: "Secondary doc two with unrelated content here",
        scores: { semantic: 0.3, lexical: 0, structural: 0, penalties: 0, final: 0.3 },
      }),
      makeCandidate({
        candidateId: "c-secondary-3",
        docId: "doc-s3",
        locationKey: "loc-s3",
        snippet: "Secondary doc three more unrelated information present",
        scores: { semantic: 0.3, lexical: 0, structural: 0, penalties: 0, final: 0.3 },
      }),
      makeCandidate({
        candidateId: "c-secondary-4",
        docId: "doc-s4",
        locationKey: "loc-s4",
        snippet: "Secondary doc four additional low relevance data here",
        scores: { semantic: 0.3, lexical: 0, structural: 0, penalties: 0, final: 0.3 },
      }),
    ];

    const req = makeRequest({ signals: {} as any });
    const packagingBank = {
      config: {
        actionsContract: {
          thresholds: {
            maxEvidenceItemsHard: 36,
            maxEvidencePerDocHard: 10,
            maxDistinctDocsNonCompare: 1,
            maxDistinctDocsExploratoryNonCompare: 3,
            minFinalScore: 0.01,
          },
        },
      },
    };

    const ctx = {
      queryOriginal: "test query",
      queryNormalized: "test query",
      expandedQueries: [],
      scope: { candidateDocIds: [], hardScopeActive: false } as any,
      compareIntent: false,
      exploratoryMode: false,
      classification: { confidence: 0.2, domain: null, docTypeId: null, reasons: [] } as any,
      resolvedDocTypes: [],
      phaseCounts: { considered: 5, afterNegatives: 5, afterBoosts: 5, afterDiversification: 5 },
      scopeMetrics: { scopeCandidatesDropped: 0, scopeViolationsDetected: 0, scopeViolationsThrown: 0 },
      bankLoader: { getBank: () => ({}) } as any,
      documentIntelligenceBanks: {} as any,
      isEncryptedOnlyMode: false,
    };

    const pack = packageEvidence(candidates, req, req.signals, packagingBank, ctx);

    // Secondary docs score 0.3, which is < 0.55 * 0.9 = 0.495
    // So the safety net should filter them out, leaving only primary doc
    const uniqueDocIds = new Set(pack.evidence.map((e) => e.docId));
    expect(uniqueDocIds.size).toBe(1);
    expect(uniqueDocIds.has("doc-primary")).toBe(true);
  });
});

// ── BUG #5 — FR locale number parsing ──────────────────────────────────

describe("BUG #5 — parseLocaleNumber handles FR, BR, and US formats", () => {
  test("FR format: space-separated thousands with comma decimal", () => {
    expect(parseLocaleNumber("1 500,00")).toBe(1500);
  });

  test("US format: comma-separated thousands with dot decimal", () => {
    expect(parseLocaleNumber("1,500.00")).toBe(1500);
  });

  test("BR format: dot-separated thousands with comma decimal", () => {
    expect(parseLocaleNumber("1.500,00")).toBe(1500);
  });
});

// ── BUG #6 — Cache key includes new signal fields ──────────────────────

describe("BUG #6 — buildRetrievalCacheKey includes corpusSearchAllowed", () => {
  test("differing corpusSearchAllowed produces different cache keys", () => {
    const base = {
      queryNormalized: "test query",
      scopeDocIds: [],
      domain: null,
      resolvedDocTypes: [],
      resolvedDocDomains: [],
      history: undefined,
      retrievalPlan: null,
      overrides: null,
      env: "local" as const,
      modelVersion: "v1",
    };

    const keyA = buildRetrievalCacheKey({
      ...base,
      signals: { corpusSearchAllowed: true } as any,
    });

    const keyB = buildRetrievalCacheKey({
      ...base,
      signals: { corpusSearchAllowed: false } as any,
    });

    expect(keyA).not.toBe(keyB);
  });
});

// ── BUG #7 — emptyPack includes all required fields ───────────────────

describe("BUG #7 — emptyPack returns pack with correct shape", () => {
  test("emptyPack has runtimeStatus, empty evidence, and debug.reasonCodes", () => {
    const req = makeRequest({ env: "local" as any });
    const reasonCodes = ["NO_DOCUMENTS", "EMPTY_QUERY"];

    const pack = emptyPack(req, { reasonCodes });

    expect(pack.runtimeStatus).toBe("ok");
    expect(pack.evidence).toEqual([]);
    expect(pack.debug?.reasonCodes).toEqual(reasonCodes);
  });
});

// ── BUG A — parseLocaleNumber used in extractTablePayload for BR format ─

describe("BUG A — parseLocaleNumber handles BR format in extractTablePayload", () => {
  test("BR format '1.250,00' parses to 1250.00 via parseLocaleNumber", () => {
    // Verify parseLocaleNumber itself handles BR format correctly
    expect(parseLocaleNumber("1.250,00")).toBe(1250);
  });

  test("extractTablePayload uses parseLocaleNumber for BR-formatted cells", () => {
    const hit = {
      snippet: "Item\tValue\nProduct A\t1.250,00\nProduct B\t3.500,75",
    };

    const req = makeRequest({
      signals: { tableExpected: true } as RetrievalRequest["signals"],
    });

    const bankLoader: BankLoader = {
      getBank: <T>() => ({ config: { maxRowsPerChunk: 100 } }) as T,
    };

    const table = extractTablePayload(hit, req, bankLoader);

    expect(table).not.toBeNull();
    expect(table!.rows).toBeDefined();
    // "1.250,00" should have been parsed to the number 1250 by parseLocaleNumber
    const firstRowValue = table!.rows![0][1];
    expect(firstRowValue).toBe(1250);
    // "3.500,75" should have been parsed to the number 3500.75
    const secondRowValue = table!.rows![1][1];
    expect(secondRowValue).toBe(3500.75);
  });
});

// ── BUG B — normalizeQuery passes query and languageHint, not same signal twice ─

describe("BUG B — normalizeQuery passes query and languageHint correctly", () => {
  test("external normalizer receives query as first arg and 'en' as second, not the same signal twice", async () => {
    let capturedQuery: string | undefined;
    let capturedLangHint: string | undefined;

    const mockNormalizer: QueryNormalizer = {
      normalize: async (query: string, langHint?: string) => {
        capturedQuery = query;
        capturedLangHint = langHint;
        return { normalized: query.toLowerCase(), hasQuotedText: false, hasFilename: false };
      },
    };

    const req = makeRequest({
      query: "What is the quarterly revenue?",
      signals: { languageHint: undefined, intentFamily: "documents" } as RetrievalRequest["signals"],
    });

    await normalizeQuery(req, mockNormalizer);

    // First arg must be the query text
    expect(capturedQuery).toBe("What is the quarterly revenue?");
    // Second arg must be the languageHint fallback "en", NOT the intentFamily
    expect(capturedLangHint).toBe("en");
    expect(capturedLangHint).not.toBe("documents");
    // Verify the two args are different values (not the same signal passed twice)
    expect(capturedQuery).not.toBe(capturedLangHint);
  });
});

// ── BUG G — RETRIEVAL_CONFIG.isEncryptedOnlyMode exists and is boolean ──

describe("BUG G — RETRIEVAL_CONFIG.isEncryptedOnlyMode is a boolean", () => {
  test("isEncryptedOnlyMode property exists on RETRIEVAL_CONFIG", () => {
    expect(RETRIEVAL_CONFIG).toHaveProperty("isEncryptedOnlyMode");
  });

  test("isEncryptedOnlyMode is a boolean value", () => {
    expect(typeof RETRIEVAL_CONFIG.isEncryptedOnlyMode).toBe("boolean");
  });

  test("isEncryptedOnlyMode is present in the RetrievalConfig interface shape", () => {
    // Verify the frozen config object contains isEncryptedOnlyMode as an
    // enumerable key — this guards against accidental removal during refactors
    const keys = Object.keys(RETRIEVAL_CONFIG);
    expect(keys).toContain("isEncryptedOnlyMode");
  });
});
