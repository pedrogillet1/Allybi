import { describe, expect, test, jest, beforeEach } from "@jest/globals";

import {
  looksLikeTOC,
  applyRetrievalNegatives,
} from "../NegativeRules.service";
import type {
  CandidateChunk,
  RetrievalRequest,
  RetrievalScopeMetrics,
  BankLoader,
} from "../../retrieval.types";

// ── Helpers ─────────────────────────────────────────────────────────

function makeCandidate(
  overrides: Partial<CandidateChunk> = {},
): CandidateChunk {
  return {
    candidateId: overrides.candidateId ?? "chunk-1",
    type: overrides.type ?? "text",
    source: overrides.source ?? "semantic",
    docId: overrides.docId ?? "doc-1",
    docType: overrides.docType ?? "pdf",
    title: overrides.title ?? "Test Document",
    filename: overrides.filename ?? "test.pdf",
    location: overrides.location ?? { page: 1, sectionKey: "intro" },
    locationKey: overrides.locationKey ?? "d:doc-1|p:1",
    snippet: overrides.snippet ?? "This is a substantive paragraph with enough content to matter.",
    rawText: overrides.rawText ?? null,
    table: overrides.table ?? null,
    scores: {
      semantic: 0.6,
      lexical: 0.3,
      structural: 0.1,
      ...overrides.scores,
    },
    signals: { ...overrides.signals },
    provenanceOk: overrides.provenanceOk ?? true,
  };
}

function makeRequest(
  overrides: Partial<RetrievalRequest> = {},
): RetrievalRequest {
  return {
    query: overrides.query ?? "test query",
    env: overrides.env ?? "local",
    signals: {
      intentFamily: null,
      operator: null,
      answerMode: null,
      ...overrides.signals,
    },
    ...overrides,
  };
}

function makeScope(
  overrides: Partial<{
    candidateDocIds: string[];
    hardScopeActive: boolean;
    sheetName: string | null;
    rangeA1: string | null;
  }> = {},
) {
  return {
    candidateDocIds: overrides.candidateDocIds ?? [],
    hardScopeActive: overrides.hardScopeActive ?? false,
    sheetName: overrides.sheetName ?? null,
    rangeA1: overrides.rangeA1 ?? null,
  };
}

function makeBankLoader(banks: Record<string, unknown> = {}): BankLoader {
  return {
    getBank<T = unknown>(bankId: string): T {
      if (bankId in banks) return banks[bankId] as T;
      throw new Error(`Bank not found: ${bankId}`);
    },
  };
}

function makeScopeMetrics(): RetrievalScopeMetrics {
  return {
    scopeCandidatesDropped: 0,
    scopeViolationsDetected: 0,
    scopeViolationsThrown: 0,
  };
}

const enabledNegativesBank = {
  config: {
    enabled: true,
    actionsContract: {
      thresholds: {
        minRelevanceScore: 0.55,
      },
    },
  },
};

// ── looksLikeTOC ────────────────────────────────────────────────────

describe("looksLikeTOC", () => {
  test("returns false for empty string", () => {
    expect(looksLikeTOC("")).toBe(false);
  });

  test("returns false for short snippet (< 50 chars)", () => {
    expect(looksLikeTOC("Some short text.")).toBe(false);
  });

  test("returns false for fewer than 3 non-blank lines", () => {
    const snippet = "a".repeat(60) + "\n" + "b".repeat(10);
    expect(looksLikeTOC(snippet)).toBe(false);
  });

  test("returns false for normal paragraph content", () => {
    const paragraph = [
      "The company was founded in 2015 and has since grown to over 500 employees.",
      "Our primary focus is on delivering enterprise solutions for document management.",
      "We operate in 12 countries across Europe and North America.",
      "Revenue for the last fiscal year exceeded expectations significantly.",
      "The board approved a new strategy focusing on AI-driven products.",
    ].join("\n");
    expect(looksLikeTOC(paragraph)).toBe(false);
  });

  test("detects TOC with page-number endings (heuristic 1)", () => {
    const toc = [
      "Introduction 1",
      "Chapter One 5",
      "Chapter Two 12",
      "Chapter Three 24",
      "Conclusion 38",
      "Appendix A 42",
      "Appendix B 47",
    ].join("\n");
    expect(looksLikeTOC(toc)).toBe(true);
  });

  test("detects TOC with numbered section lines (heuristic 2)", () => {
    const toc = [
      "1. Introduction to the Framework",
      "1.1 Background and Context",
      "1.2 Research Methodology",
      "2. Literature Review",
      "2.1 Previous Studies",
      "3. Analysis and Results",
      "3.1 Data Collection Methods",
    ].join("\n");
    expect(looksLikeTOC(toc)).toBe(true);
  });

  test("detects TOC with Section/Chapter prefixes (heuristic 2)", () => {
    const toc = [
      "Chapter 1 Introduction to the topic",
      "Section 2 Methodology details here",
      "Chapter 3 Results and discussion points",
      "Section 4 Conclusion and recommendations",
      "Article 5 Final thoughts on the research",
      "Part 6 Appendix with supplementary data",
    ].join("\n");
    expect(looksLikeTOC(toc)).toBe(true);
  });

  test("detects TOC with dot-leader lines (heuristic 3)", () => {
    const toc = [
      "Introduction............1",
      "Background...............5",
      "Methods.................12",
      "Results.................20",
      "Discussion..............30",
      "Some normal text here that is not TOC",
    ].join("\n");
    expect(looksLikeTOC(toc)).toBe(true);
  });

  test("detects TOC with underscore leaders", () => {
    const toc = [
      "Introduction___________1",
      "Background_____________5",
      "Methods_______________12",
      "Normal line without leaders",
    ].join("\n");
    expect(looksLikeTOC(toc)).toBe(true);
  });
});

// ── applyRetrievalNegatives ─────────────────────────────────────────

describe("applyRetrievalNegatives", () => {
  test("returns candidates unchanged when negativesBank is null", () => {
    const candidates = [makeCandidate()];
    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      null,
      makeBankLoader(),
      false,
    );
    expect(result).toBe(candidates);
  });

  test("returns candidates unchanged when negativesBank is not enabled", () => {
    const candidates = [makeCandidate()];
    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      { config: { enabled: false } },
      makeBankLoader(),
      false,
    );
    expect(result).toBe(candidates);
  });

  test("returns empty array for empty candidates", () => {
    const result = applyRetrievalNegatives(
      [],
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      enabledNegativesBank,
      makeBankLoader(),
      false,
    );
    expect(result).toEqual([]);
  });

  test("keeps candidates above minRelevanceScore", () => {
    const candidates = [
      makeCandidate({ scores: { semantic: 0.7 } }),
    ];
    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      enabledNegativesBank,
      makeBankLoader(),
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe("chunk-1");
  });

  test("drops candidates below minRelevanceScore", () => {
    const candidates = [
      makeCandidate({
        candidateId: "low-score",
        scores: { semantic: 0.1, lexical: 0.05, structural: 0.02 },
      }),
    ];
    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      enabledNegativesBank,
      makeBankLoader(),
      false,
    );
    expect(result).toHaveLength(0);
  });

  test("encrypted mode lowers minRelevance to 0.1", () => {
    // Score of 0.3 would be dropped with normal minRelevance=0.55 but kept with encrypted=0.1
    const candidates = [
      makeCandidate({
        candidateId: "encrypted-ok",
        scores: { semantic: 0.3, lexical: 0.0, structural: 0.0 },
      }),
    ];
    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      enabledNegativesBank,
      makeBankLoader(),
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe("encrypted-ok");
  });

  test("encrypted mode still drops candidates below 0.1", () => {
    const candidates = [
      makeCandidate({
        candidateId: "too-low-even-encrypted",
        scores: { semantic: 0.05, lexical: 0.02, structural: 0.01 },
      }),
    ];
    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      enabledNegativesBank,
      makeBankLoader(),
      true,
    );
    expect(result).toHaveLength(0);
  });

  test("sets tocCandidate and tocPenaltyMultiplier for TOC-like snippets", () => {
    const tocSnippet = [
      "Introduction............1",
      "Background...............5",
      "Methods.................12",
      "Results.................20",
      "Discussion..............30",
      "Conclusion..............35",
    ].join("\n");

    const candidates = [
      makeCandidate({
        candidateId: "toc-chunk",
        snippet: tocSnippet,
        scores: { semantic: 0.8 },
      }),
    ];
    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      enabledNegativesBank,
      makeBankLoader(),
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0].signals.tocCandidate).toBe(true);
    expect(result[0].signals.tocPenaltyMultiplier).toBe(0.2);
  });

  test("does NOT set tocCandidate for non-TOC snippets", () => {
    const candidates = [
      makeCandidate({
        snippet: "This is a perfectly normal paragraph about business operations and quarterly performance.",
        scores: { semantic: 0.7 },
      }),
    ];
    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      enabledNegativesBank,
      makeBankLoader(),
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0].signals.tocCandidate).toBeUndefined();
    expect(result[0].signals.tocPenaltyMultiplier).toBeUndefined();
  });

  test("drops out-of-scope candidates when scope is enforced", () => {
    const candidates = [
      makeCandidate({ candidateId: "in-scope", docId: "doc-A", scores: { semantic: 0.7 } }),
      makeCandidate({ candidateId: "out-scope", docId: "doc-B", scores: { semantic: 0.8 } }),
    ];

    const req = makeRequest({
      signals: {
        hardScopeActive: true,
        intentFamily: "doc_qa",
      },
    });

    const scope = makeScope({
      candidateDocIds: ["doc-A"],
      hardScopeActive: true,
    });

    const result = applyRetrievalNegatives(
      candidates,
      req,
      req.signals,
      scope,
      enabledNegativesBank,
      makeBankLoader(),
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe("in-scope");
  });

  test("increments scopeMetrics.scopeCandidatesDropped for scope violations", () => {
    const candidates = [
      makeCandidate({ docId: "doc-B", scores: { semantic: 0.8 } }),
    ];

    const req = makeRequest({
      signals: { hardScopeActive: true, intentFamily: "doc_qa" },
    });

    const scope = makeScope({
      candidateDocIds: ["doc-A"],
      hardScopeActive: true,
    });

    const metrics = makeScopeMetrics();

    applyRetrievalNegatives(
      candidates,
      req,
      req.signals,
      scope,
      enabledNegativesBank,
      makeBankLoader(),
      false,
      metrics,
    );
    expect(metrics.scopeCandidatesDropped).toBe(1);
  });

  test("uses very low minRelevance for in-scope candidates in hard scope mode", () => {
    // A candidate with topScore 0.06 would be dropped normally (0.06 < 0.55)
    // and dropped in encrypted mode (0.06 < 0.10)
    // but kept in hard scope mode with in-scope doc (effectiveMinRelevance = min(0.55, 0.05) = 0.05)
    const candidates = [
      makeCandidate({
        candidateId: "low-but-in-scope",
        docId: "doc-A",
        scores: { semantic: 0.06, lexical: 0.01, structural: 0.0 },
      }),
    ];

    const req = makeRequest({
      signals: { hardScopeActive: true, intentFamily: "doc_qa" },
    });

    const scope = makeScope({
      candidateDocIds: ["doc-A"],
      hardScopeActive: true,
    });

    const result = applyRetrievalNegatives(
      candidates,
      req,
      req.signals,
      scope,
      enabledNegativesBank,
      makeBankLoader(),
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe("low-but-in-scope");
  });

  test("mixed: keeps high-score, drops low-score, marks TOC", () => {
    const tocSnippet = [
      "1. Introduction to the Framework",
      "1.1 Background and Context",
      "1.2 Research Methodology",
      "2. Literature Review",
      "2.1 Previous Studies",
      "3. Analysis and Results",
      "3.1 Data Collection Methods",
    ].join("\n");

    const candidates = [
      makeCandidate({ candidateId: "good", scores: { semantic: 0.7 } }),
      makeCandidate({
        candidateId: "low",
        scores: { semantic: 0.05, lexical: 0.02, structural: 0.01 },
      }),
      makeCandidate({
        candidateId: "toc",
        snippet: tocSnippet,
        scores: { semantic: 0.8 },
      }),
    ];

    const result = applyRetrievalNegatives(
      candidates,
      makeRequest(),
      makeRequest().signals,
      makeScope(),
      enabledNegativesBank,
      makeBankLoader(),
      false,
    );

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.candidateId)).toEqual(["good", "toc"]);
    expect(result[1].signals.tocCandidate).toBe(true);
    expect(result[1].signals.tocPenaltyMultiplier).toBe(0.2);
  });
});
