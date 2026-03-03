import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockSemanticSearch = jest.fn();
const mockLexicalSearch = jest.fn();
const mockStructuralSearch = jest.fn();
const mockListDocs = jest.fn();
const mockGetDocMeta = jest.fn();

jest.mock("./prismaRetrievalAdapters.service", () => {
  class MockFactory {
    createForUser() {
      return {
        docStore: {
          listDocs: (...args: any[]) => mockListDocs(...args),
          getDocMeta: (...args: any[]) => mockGetDocMeta(...args),
        },
        semanticIndex: {
          search: (...args: any[]) => mockSemanticSearch(...args),
        },
        lexicalIndex: {
          search: (...args: any[]) => mockLexicalSearch(...args),
        },
        structuralIndex: {
          search: (...args: any[]) => mockStructuralSearch(...args),
        },
      };
    }
  }

  return {
    __esModule: true,
    PrismaRetrievalAdapterFactory: MockFactory,
  };
});

import {
  PrismaRetrievalAdapterFactoryV2,
  RetrievalAdapterDependencyError,
} from "./prismaRetrievalAdapters.v2.service";

describe("PrismaRetrievalAdapterFactoryV2", () => {
  beforeEach(() => {
    mockSemanticSearch.mockReset();
    mockLexicalSearch.mockReset();
    mockStructuralSearch.mockReset();
    mockListDocs.mockReset();
    mockGetDocMeta.mockReset();
  });

  test("returns stably sorted semantic hits", async () => {
    mockSemanticSearch.mockResolvedValue([
      {
        docId: "doc-b",
        location: { page: 2 },
        snippet: "beta",
        score: 0.8,
        locationKey: "d:doc-b|p:2|c:2",
        chunkId: "b2",
      },
      {
        docId: "doc-a",
        location: { page: 1 },
        snippet: "alpha",
        score: 0.8,
        locationKey: "d:doc-a|p:1|c:1",
        chunkId: "a1",
      },
    ]);

    const deps = new PrismaRetrievalAdapterFactoryV2().createForUser("user-1");
    const hits = await deps.semanticIndex.search({
      query: "balance",
      k: 5,
    });

    expect(hits.map((hit) => hit.docId)).toEqual(["doc-a", "doc-b"]);
  });

  test("throws typed dependency errors instead of returning silent empties", async () => {
    mockSemanticSearch.mockRejectedValue(new Error("pinecone offline"));

    const deps = new PrismaRetrievalAdapterFactoryV2().createForUser("user-1");
    await expect(
      deps.semanticIndex.search({
        query: "revenue",
        k: 3,
      }),
    ).rejects.toBeInstanceOf(RetrievalAdapterDependencyError);
    await expect(
      deps.semanticIndex.search({
        query: "revenue",
        k: 3,
      }),
    ).rejects.toMatchObject({
      code: "RETRIEVAL_ADAPTER_DEPENDENCY_ERROR",
      operation: "semantic_search",
      userId: "user-1",
    });
  });
});
