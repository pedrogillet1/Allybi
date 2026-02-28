import {
  RetrievalEngineService,
  type DocStore,
  type LexicalIndex,
  type RetrievalRequest,
  type SemanticIndex,
  type StructuralIndex,
  type BankLoader,
} from "./retrievalEngine.service";
import { createDocScopeLock } from "./docScopeLock";

const noopIndex: SemanticIndex & LexicalIndex & StructuralIndex = {
  async search() {
    return [];
  },
};

function makeDocStore(docIds: string[]): DocStore {
  return {
    async listDocs() {
      return docIds.map((docId) => ({
        docId,
        title: docId,
        filename: `${docId}.pdf`,
        mimeType: "application/pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }));
    },
    async getDocMeta(docId: string) {
      return {
        docId,
        title: docId,
        filename: `${docId}.pdf`,
        mimeType: "application/pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    },
  };
}

function makeReq(signals: RetrievalRequest["signals"]): RetrievalRequest {
  return {
    query: "overview",
    env: "dev",
    signals,
  };
}

describe("RetrievalEngineService resolveScope lock behavior", () => {
  const bankLoader: BankLoader = {
    getBank() {
      throw new Error("not needed in resolveScope unit test");
    },
  };

  test("keeps full attached docset under explicit lock even when cap is lower", async () => {
    const docIds = Array.from({ length: 20 }, (_, idx) => `doc-${idx + 1}`);
    const engine = new RetrievalEngineService(
      bankLoader,
      makeDocStore(docIds),
      noopIndex,
      noopIndex,
      noopIndex,
    );

    const scope = await (engine as any).resolveScope(
      makeReq({
        docScopeLock: createDocScopeLock({
          mode: "docset",
          allowedDocumentIds: docIds,
          source: "attachments",
        }),
        explicitDocLock: true,
        hardScopeActive: true,
        corpusSearchAllowed: false,
      }),
      {
        docScopeLock: createDocScopeLock({
          mode: "docset",
          allowedDocumentIds: docIds,
          source: "attachments",
        }),
        explicitDocLock: true,
        hardScopeActive: true,
        corpusSearchAllowed: false,
      },
      {},
    );

    expect(scope.hardScopeActive).toBe(true);
    expect(scope.candidateDocIds).toHaveLength(docIds.length);
    expect(new Set(scope.candidateDocIds)).toEqual(new Set(docIds));
  });

  test("still applies corpus candidate cap when no explicit docset lock exists", async () => {
    const docIds = Array.from({ length: 20 }, (_, idx) => `doc-${idx + 1}`);
    const engine = new RetrievalEngineService(
      bankLoader,
      makeDocStore(docIds),
      noopIndex,
      noopIndex,
      noopIndex,
    );

    const req = makeReq({
      explicitDocLock: false,
      hardScopeActive: false,
      corpusSearchAllowed: true,
    });
    req.overrides = { maxCandidateDocsHard: 8 };

    const scope = await (engine as any).resolveScope(req, req.signals, {});
    const expected = [...docIds].sort((a, b) => a.localeCompare(b)).slice(0, 8);
    expect(scope.candidateDocIds).toHaveLength(8);
    expect(scope.candidateDocIds).toEqual(expected);
  });
});
