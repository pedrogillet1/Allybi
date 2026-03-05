import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";
import { RetrievalEngineService } from "../../services/core/retrieval/retrievalEngine.service";
import { createDocScopeLock } from "../../services/core/retrieval/docScopeLock";

const ALL_DOC_IDS = ["doc-target", "doc-secondary", "doc-noise-a", "doc-noise-b"];

function makeRequiredBanks() {
  return {
    semantic_search_config: {
      config: {
        queryExpansionPolicy: { enabled: false },
        hybridPhases: [{ id: "phase_semantic", type: "semantic", enabled: true, k: 10 }],
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

function makeEngine(): RetrievalEngineService {
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
      return ALL_DOC_IDS.map((docId) => ({
        docId,
        title: docId,
        filename: `${docId}.txt`,
      }));
    },
    async getDocMeta(docId: string) {
      return { docId, title: docId, filename: `${docId}.txt` };
    },
  };
  const semanticIndex = {
    async search(opts: { query: string }) {
      return ALL_DOC_IDS.map((docId, i) => ({
        docId,
        location: { page: i + 1 },
        snippet: `${opts.query} result from ${docId}`,
        score: 0.9 - i * 0.05,
        locationKey: `d:${docId}|p:${i + 1}|c:1`,
        chunkId: `chunk-${docId}`,
      }));
    },
  };
  const emptyIndex = { async search() { return []; } };
  return new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    emptyIndex as any,
    emptyIndex as any,
  );
}

describe("Certification: scope-boundary-locks", () => {
  test("attached-only docset lock never expands beyond allowed docs", async () => {
    const engine = makeEngine();
    const allowedDocumentIds = ["doc-target", "doc-secondary"];
    const pack = await engine.retrieve({
      query: "summarize the attached files",
      env: "dev",
      signals: {
        docScopeLock: createDocScopeLock({
          mode: "docset",
          allowedDocumentIds,
          source: "attachments",
        }),
        explicitDocLock: true,
        hardScopeActive: true,
        corpusSearchAllowed: false,
      },
    });
    expect(pack.scope.hardScopeActive).toBe(true);
    expect(new Set(pack.scope.candidateDocIds)).toEqual(new Set(allowedDocumentIds));
  });

  test("this-doc lock remains single-document under explicit ref", async () => {
    const engine = makeEngine();
    const pack = await engine.retrieve({
      query: "explain this document",
      env: "dev",
      signals: {
        explicitDocRef: true,
        resolvedDocId: "doc-target",
        explicitDocLock: true,
        hardScopeActive: true,
        activeDocId: "doc-target",
        corpusSearchAllowed: false,
      },
    });
    expect(pack.scope.hardScopeActive).toBe(true);
    expect(pack.scope.candidateDocIds).toEqual(["doc-target"]);
  });

  test("compare-style corpus query keeps multi-doc scope when unlocked", async () => {
    const engine = makeEngine();
    const pack = await engine.retrieve({
      query: "compare revenue between all reports",
      env: "dev",
      signals: {
        corpusSearchAllowed: true,
      },
    });
    expect(pack.scope.hardScopeActive).toBe(false);
    expect(pack.scope.candidateDocIds.length).toBeGreaterThan(1);
  });

  test("write certification gate report", async () => {
    const failures: string[] = [];
    const engine = makeEngine();

    const attachedAllowed = ["doc-target", "doc-secondary"];
    const attachedPack = await engine.retrieve({
      query: "summarize the attached files",
      env: "dev",
      signals: {
        docScopeLock: createDocScopeLock({
          mode: "docset",
          allowedDocumentIds: attachedAllowed,
          source: "attachments",
        }),
        explicitDocLock: true,
        hardScopeActive: true,
        corpusSearchAllowed: false,
      },
    });
    const attachedSafe =
      JSON.stringify([...attachedPack.scope.candidateDocIds].sort()) ===
      JSON.stringify([...attachedAllowed].sort());
    if (!attachedSafe) failures.push("ATTACHED_LOCK_SCOPE_EXPANDED");

    const thisDocPack = await engine.retrieve({
      query: "explain this document",
      env: "dev",
      signals: {
        explicitDocRef: true,
        resolvedDocId: "doc-target",
        explicitDocLock: true,
        hardScopeActive: true,
        activeDocId: "doc-target",
        corpusSearchAllowed: false,
      },
    });
    if (JSON.stringify(thisDocPack.scope.candidateDocIds) !== JSON.stringify(["doc-target"])) {
      failures.push("THIS_DOC_SCOPE_EXPANDED");
    }

    const comparePack = await engine.retrieve({
      query: "compare revenue between all reports",
      env: "dev",
      signals: {
        corpusSearchAllowed: true,
      },
    });
    if (!(comparePack.scope.candidateDocIds.length > 1)) {
      failures.push("COMPARE_SCOPE_NOT_MULTIDOC");
    }

    writeCertificationGateReport("scope-boundary-locks", {
      passed: failures.length === 0,
      metrics: {
        attachedDocCount: attachedPack.scope.candidateDocIds.length,
        thisDocCount: thisDocPack.scope.candidateDocIds.length,
        compareDocCount: comparePack.scope.candidateDocIds.length,
      },
      thresholds: {
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
