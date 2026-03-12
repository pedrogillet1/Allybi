import { describe, expect, test } from "@jest/globals";

import {
  packageEvidence,
  computeDocLevelScores,
  isExploratoryRetrievalRequest,
  applyNonComparePurityPreRank,
} from "../EvidencePackager.service";
import {
  buildTelemetryDiagnostics,
  emptyPack,
} from "../RetrievalTelemetry.service";
import {
  buildRetrievalCacheKey,
  cloneEvidencePack,
} from "../RetrievalCache.service";

import type {
  CandidateChunk,
  RetrievalRequest,
  EvidencePack,
  BankLoader,
} from "../../retrieval.types";

// ── Helpers ─────────────────────────────────────────────────────────

function makeCandidateChunk(overrides: Partial<CandidateChunk> = {}): CandidateChunk {
  return {
    candidateId: overrides.candidateId ?? "chunk-1",
    type: overrides.type ?? "text",
    source: overrides.source ?? "semantic",
    docId: overrides.docId ?? "doc-1",
    docType: overrides.docType ?? null,
    title: overrides.title ?? "Test Doc",
    filename: overrides.filename ?? "test.pdf",
    location: overrides.location ?? { page: 1, sectionKey: "s1" },
    locationKey: overrides.locationKey ?? "doc-1:p1:s1",
    snippet: overrides.snippet ?? "This is test evidence content.",
    rawText: overrides.rawText ?? null,
    table: overrides.table ?? null,
    scores: overrides.scores ?? {
      semantic: 0.8,
      lexical: 0.5,
      structural: 0.3,
      final: 0.65,
    },
    signals: overrides.signals ?? {},
    provenanceOk: overrides.provenanceOk ?? true,
  };
}

function makeRetrievalRequest(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    query: overrides.query ?? "test query",
    env: overrides.env ?? "local",
    signals: overrides.signals ?? {},
  };
}

const stubBankLoader: BankLoader = {
  getBank<T = unknown>(_bankId: string): T {
    return {} as T;
  },
};

const stubDocIntelBanks = {
  getDocTypeExtractionHints: () => null,
};

// ── Contract Tests ──────────────────────────────────────────────────

describe("v2 retrieval orchestrator — contract tests", () => {
  test("packageEvidence returns an EvidencePack with all required fields", () => {
    const candidates: CandidateChunk[] = [
      makeCandidateChunk({ candidateId: "c1", docId: "doc-1", scores: { final: 0.7, semantic: 0.8 } }),
      makeCandidateChunk({ candidateId: "c2", docId: "doc-1", scores: { final: 0.5, semantic: 0.6 } }),
    ];

    const req = makeRetrievalRequest();

    const pack = packageEvidence(candidates, req, req.signals, {}, {
      queryOriginal: "test query",
      queryNormalized: "test query",
      expandedQueries: [],
      scope: { candidateDocIds: [], hardScopeActive: false },
      compareIntent: false,
      exploratoryMode: false,
      classification: { domain: null, docTypeId: null, confidence: 0.1, reasons: [], matchedDomainRuleIds: [] },
      resolvedDocTypes: [],
      phaseCounts: { considered: 2, afterNegatives: 2, afterBoosts: 2, afterDiversification: 2 },
      scopeMetrics: { scopeCandidatesDropped: 0, scopeViolationsDetected: 0, scopeViolationsThrown: 0 },
      bankLoader: stubBankLoader,
      documentIntelligenceBanks: stubDocIntelBanks,
      isEncryptedOnlyMode: false,
    });

    expect(pack).toBeDefined();
    expect(pack.runtimeStatus).toBe("ok");
    expect(pack.query).toEqual(expect.objectContaining({ original: "test query", normalized: "test query" }));
    expect(pack.scope).toEqual(expect.objectContaining({ candidateDocIds: expect.any(Array) }));
    expect(pack.stats).toEqual(expect.objectContaining({
      candidatesConsidered: 2,
      evidenceItems: expect.any(Number),
      uniqueDocsInEvidence: expect.any(Number),
    }));
    expect(Array.isArray(pack.evidence)).toBe(true);
    expect(Array.isArray(pack.conflicts)).toBe(true);
    expect(pack.debug).toEqual(expect.objectContaining({
      phases: expect.any(Array),
      reasonCodes: expect.any(Array),
    }));
  });

  test("emptyPack returns an EvidencePack with zero evidence and ok runtimeStatus", () => {
    const req = makeRetrievalRequest({ env: "local" });

    const pack = emptyPack(req, { reasonCodes: ["no_docs"], note: "test" });

    expect(pack).toBeDefined();
    expect(pack.runtimeStatus).toBe("ok");
    expect(pack.evidence).toEqual([]);
    expect(pack.stats.evidenceItems).toBe(0);
    expect(pack.stats.uniqueDocsInEvidence).toBe(0);
    expect(pack.query.original).toBe("test query");
    expect(pack.scope).toEqual(expect.objectContaining({ candidateDocIds: [] }));
    // In non-production envs, debug should be present with the reason codes
    expect(pack.debug).toBeDefined();
    expect(pack.debug!.reasonCodes).toContain("no_docs");
  });

  test("buildTelemetryDiagnostics returns ruleEvents array and summary object", () => {
    const result = buildTelemetryDiagnostics({
      ruleEvents: [{ event: "retrieval.boost_rule_hit", payload: { ruleId: "r1" } }],
      matchedBoostRuleIds: ["r1", "r2"],
      appliedBoostRuleIds: ["r1"],
      rewriteRuleIds: [],
      selectedSectionRuleId: "section-1",
      crossDocGatedReason: null,
      classification: { domain: null, docTypeId: null, confidence: 0.5, reasons: ["test"], matchedDomainRuleIds: [] },
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result!.ruleEvents)).toBe(true);
    expect(result!.ruleEvents).toHaveLength(1);
    expect(result!.summary).toEqual(expect.objectContaining({
      matchedBoostRuleIds: expect.any(Array),
      appliedBoostRuleIds: expect.any(Array),
      rewriteRuleIds: expect.any(Array),
      selectedSectionRuleId: "section-1",
      crossDocGatedReason: null,
      classifiedDomain: null,
      classifiedDocTypeId: null,
      classificationReasons: ["test"],
    }));
    // Deduplication and sorting
    expect(result!.summary.matchedBoostRuleIds).toEqual(["r1", "r2"]);
    expect(result!.summary.appliedBoostRuleIds).toEqual(["r1"]);
  });

  test("buildRetrievalCacheKey is deterministic and sensitive to input changes", () => {
    const baseParams = {
      queryNormalized: "revenue in Q3",
      scopeDocIds: ["doc-a", "doc-b"],
      domain: null,
      resolvedDocTypes: [],
      resolvedDocDomains: [],
      signals: {} as RetrievalRequest["signals"],
      retrievalPlan: null,
      overrides: null,
      env: "local" as const,
      modelVersion: "v1.0",
    };

    const keyA = buildRetrievalCacheKey(baseParams);
    const keyB = buildRetrievalCacheKey(baseParams);
    expect(keyA).toBe(keyB); // deterministic

    // Different query produces a different key
    const keyC = buildRetrievalCacheKey({ ...baseParams, queryNormalized: "revenue in Q4" });
    expect(keyC).not.toBe(keyA);

    // Different scope doc IDs produce a different key
    const keyD = buildRetrievalCacheKey({ ...baseParams, scopeDocIds: ["doc-c"] });
    expect(keyD).not.toBe(keyA);

    // Key starts with expected prefix
    expect(keyA).toMatch(/^retrieval:[0-9a-f]{64}$/);
  });

  test("cloneEvidencePack produces a deep clone — mutations do not affect original", () => {
    const original: EvidencePack = {
      runtimeStatus: "ok",
      query: { original: "hello", normalized: "hello" },
      scope: { candidateDocIds: ["doc-1"], hardScopeActive: false },
      stats: {
        candidatesConsidered: 5,
        candidatesAfterNegatives: 4,
        candidatesAfterBoosts: 3,
        candidatesAfterDiversification: 3,
        scopeCandidatesDropped: 0,
        scopeViolationsDetected: 0,
        scopeViolationsThrown: 0,
        evidenceItems: 1,
        uniqueDocsInEvidence: 1,
        topScore: 0.8,
        scoreGap: null,
      },
      evidence: [
        {
          evidenceType: "text",
          docId: "doc-1",
          location: { page: 1 },
          locationKey: "doc-1:p1",
          snippet: "original snippet",
          score: { finalScore: 0.8 },
        },
      ],
    };

    const clone = cloneEvidencePack(original);

    // Structure equality
    expect(clone).toEqual(original);

    // Reference inequality — they are different objects
    expect(clone).not.toBe(original);
    expect(clone.evidence).not.toBe(original.evidence);

    // Mutate the clone and verify original is untouched
    clone.runtimeStatus = "degraded";
    clone.evidence[0].snippet = "mutated snippet";
    clone.scope.candidateDocIds.push("doc-2");

    expect(original.runtimeStatus).toBe("ok");
    expect(original.evidence[0].snippet).toBe("original snippet");
    expect(original.scope.candidateDocIds).toEqual(["doc-1"]);
  });
});
