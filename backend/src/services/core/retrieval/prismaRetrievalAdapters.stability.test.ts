import { describe, expect, jest, test } from "@jest/globals";

import {
  sortHitsStable,
  RetrievalAdapterDependencyError,
  PrismaRetrievalAdapterFactory,
} from "./prismaRetrievalAdapters.service";

describe("sortHitsStable", () => {
  test("sorts by score descending, then docId, locationKey, chunkId", () => {
    const hits = [
      {
        docId: "doc-b",
        location: { page: 2 } as any,
        snippet: "beta",
        score: 0.8,
        locationKey: "d:doc-b|p:2|c:2",
        chunkId: "b2",
      },
      {
        docId: "doc-a",
        location: { page: 1 } as any,
        snippet: "alpha",
        score: 0.8,
        locationKey: "d:doc-a|p:1|c:1",
        chunkId: "a1",
      },
    ];

    const sorted = sortHitsStable(hits);
    expect(sorted.map((h) => h.docId)).toEqual(["doc-a", "doc-b"]);
  });

  test("higher score comes first", () => {
    const hits = [
      {
        docId: "doc-a",
        location: { page: 1 } as any,
        snippet: "alpha",
        score: 0.5,
        locationKey: "d:doc-a|p:1|c:1",
        chunkId: "a1",
      },
      {
        docId: "doc-b",
        location: { page: 2 } as any,
        snippet: "beta",
        score: 0.9,
        locationKey: "d:doc-b|p:2|c:2",
        chunkId: "b2",
      },
    ];

    const sorted = sortHitsStable(hits);
    expect(sorted.map((h) => h.docId)).toEqual(["doc-b", "doc-a"]);
  });
});

describe("RetrievalAdapterDependencyError", () => {
  test("has correct code, operation, userId", () => {
    const err = new RetrievalAdapterDependencyError({
      operation: "semantic_search",
      userId: "user-1",
      message: "Semantic retrieval dependency failed.",
      cause: new Error("pinecone offline"),
    });

    expect(err).toBeInstanceOf(RetrievalAdapterDependencyError);
    expect(err.code).toBe("RETRIEVAL_ADAPTER_DEPENDENCY_ERROR");
    expect(err.operation).toBe("semantic_search");
    expect(err.userId).toBe("user-1");
    expect(err.message).toBe("Semantic retrieval dependency failed.");
    expect((err as any).cause).toBeInstanceOf(Error);
  });
});

describe("PrismaRetrievalAdapterFactory backward-compat alias", () => {
  test("PrismaRetrievalAdapterFactoryV2 is the same class", async () => {
    const mod = await import("./prismaRetrievalAdapters.service");
    expect(mod.PrismaRetrievalAdapterFactoryV2).toBe(
      mod.PrismaRetrievalAdapterFactory,
    );
  });
});
