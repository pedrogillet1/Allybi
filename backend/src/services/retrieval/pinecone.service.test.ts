import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

/* ------------------------------------------------------------------ */
/*  Mock the Pinecone SDK so we never hit the network                 */
/* ------------------------------------------------------------------ */

const mockUpsert = jest.fn<(...a: any[]) => Promise<unknown>>();
const mockQuery = jest.fn<(...a: any[]) => Promise<unknown>>();
const mockDeleteMany = jest.fn<(...a: any[]) => Promise<unknown>>();
const mockDescribeIndexStats = jest.fn<(...a: any[]) => Promise<unknown>>();

jest.mock("@pinecone-database/pinecone", () => ({
  __esModule: true,
  Pinecone: jest.fn().mockImplementation(() => ({
    index: () => ({
      upsert: (...args: any[]) => mockUpsert(...args),
      query: (...args: any[]) => mockQuery(...args),
      deleteMany: (...args: any[]) => mockDeleteMany(...args),
      describeIndexStats: (...args: any[]) => mockDescribeIndexStats(...args),
    }),
  })),
}));

import { PineconeService } from "./pinecone.service";
import type { ChunkForPineconeUpsert, DocumentMetadataForPinecone } from "./pinecone.service";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeEmbedding(dim = 1536, value = 0.1): number[] {
  return new Array(dim).fill(value);
}

function makeDocument(overrides: Partial<DocumentMetadataForPinecone> = {}): DocumentMetadataForPinecone {
  return {
    filename: "test.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

function makeChunk(
  chunkIndex: number,
  overrides: Partial<ChunkForPineconeUpsert> = {},
): ChunkForPineconeUpsert {
  return {
    chunkIndex,
    content: `Chunk content ${chunkIndex}`,
    embedding: makeEmbedding(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Original tests (unavailable / pure-logic)                         */
/* ------------------------------------------------------------------ */

describe("PineconeService", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    delete process.env.PINECONE_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
  });

  test("reports unavailable when API key is missing", () => {
    const svc = new PineconeService();
    expect(svc.isAvailable()).toBe(false);
  });

  test("returns empty results when unavailable", async () => {
    const svc = new PineconeService();
    const result = await svc.searchSimilarChunks(new Array(1536).fill(0.1), "u1");
    expect(result).toEqual([]);
  });

  test("verifyDocumentEmbeddings returns clear unavailable message", async () => {
    const svc = new PineconeService();
    const result = await svc.verifyDocumentEmbeddings("doc-1");
    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
    expect(result.message).toMatch(/not available/i);
  });

  test("metadata sanitizer keeps primitives and serializes complex values", () => {
    const svc = new PineconeService() as any;
    const out = svc.sanitizeMetadata({
      a: "x",
      b: 1,
      c: true,
      d: ["x", 2],
      e: { deep: { value: "ok" } },
    });
    expect(out.a).toBe("x");
    expect(out.b).toBe(1);
    expect(out.c).toBe(true);
    expect(out.d).toEqual(["x", 2]);
    expect(typeof out.e).toBe("string");
  });

  test("scoped filter uses document lock when documentId is provided", () => {
    const svc = new PineconeService() as any;
    const filter = svc.buildFilter({
      userId: "u1",
      documentId: "doc-42",
      folderId: "folder-1",
    });
    expect(filter).toEqual({
      $and: [
        { userId: { $eq: "u1" } },
        { documentId: { $eq: "doc-42" } },
      ],
    });
  });
});

/* ------------------------------------------------------------------ */
/*  New tests — mocked Pinecone client                                */
/* ------------------------------------------------------------------ */

describe("PineconeService — upsertDocumentEmbeddings", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;
  const originalBatchSize = process.env.PINECONE_UPSERT_BATCH_SIZE;

  beforeEach(() => {
    process.env.PINECONE_API_KEY = "test-key";
    delete process.env.PINECONE_UPSERT_BATCH_SIZE;
    mockUpsert.mockReset();
    mockQuery.mockReset();
    mockDeleteMany.mockReset();
    mockDescribeIndexStats.mockReset();
    mockUpsert.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
    if (originalBatchSize) process.env.PINECONE_UPSERT_BATCH_SIZE = originalBatchSize;
    else delete process.env.PINECONE_UPSERT_BATCH_SIZE;
  });

  test("batches large arrays of vectors into chunks of upsertBatchSize", async () => {
    // Force a small batch size so we can verify batching with fewer chunks
    process.env.PINECONE_UPSERT_BATCH_SIZE = "3";
    const svc = new PineconeService();

    const chunks = Array.from({ length: 7 }, (_, i) => makeChunk(i));
    await svc.upsertDocumentEmbeddings("doc-1", "u1", makeDocument(), chunks);

    // 7 vectors / batch 3 = 3 calls (3 + 3 + 1)
    expect(mockUpsert).toHaveBeenCalledTimes(3);
    const firstBatch = mockUpsert.mock.calls[0][0] as any[];
    const secondBatch = mockUpsert.mock.calls[1][0] as any[];
    const thirdBatch = mockUpsert.mock.calls[2][0] as any[];
    expect(firstBatch).toHaveLength(3);
    expect(secondBatch).toHaveLength(3);
    expect(thirdBatch).toHaveLength(1);
  });

  test("throws on embedding dimension mismatch", async () => {
    const svc = new PineconeService();
    const badChunk = makeChunk(0, { embedding: makeEmbedding(512) });

    await expect(
      svc.upsertDocumentEmbeddings("doc-1", "u1", makeDocument(), [badChunk]),
    ).rejects.toThrow(/dim mismatch.*512.*1536/i);
  });

  test("skips zero-length and all-zero embeddings", async () => {
    const svc = new PineconeService();
    const zeroChunk = makeChunk(0, { embedding: new Array(1536).fill(0) });
    const validChunk = makeChunk(1);

    const result = await svc.upsertDocumentEmbeddings(
      "doc-1", "u1", makeDocument(), [zeroChunk, validChunk],
    );

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  test("throws when ALL embeddings are invalid (all-zero)", async () => {
    const svc = new PineconeService();
    const allZero1 = makeChunk(0, { embedding: new Array(1536).fill(0) });
    const allZero2 = makeChunk(1, { embedding: new Array(1536).fill(0) });

    await expect(
      svc.upsertDocumentEmbeddings("doc-1", "u1", makeDocument(), [allZero1, allZero2]),
    ).rejects.toThrow(/all embeddings invalid/i);
  });

  test("includes correct metadata in upserted vectors", async () => {
    const svc = new PineconeService();
    const doc = makeDocument({
      filename: "report.pdf",
      mimeType: "application/pdf",
      title: "Q1 Report",
      folderId: "folder-5",
      folderName: "Reports",
    });
    const chunk = makeChunk(0, { content: "Revenue was up 20%" });

    await svc.upsertDocumentEmbeddings("doc-42", "u1", doc, [chunk]);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const vectors = mockUpsert.mock.calls[0][0] as any[];
    expect(vectors).toHaveLength(1);

    const meta = vectors[0].metadata;
    expect(meta.userId).toBe("u1");
    expect(meta.documentId).toBe("doc-42");
    expect(meta.filename).toBe("report.pdf");
    expect(meta.title).toBe("Q1 Report");
    expect(meta.folderId).toBe("folder-5");
    expect(meta.folderName).toBe("Reports");
    expect(meta.chunkIndex).toBe(0);
    expect(meta.content).toBe("Revenue was up 20%");

    // vector id format: documentId:chunkIndex
    expect(vectors[0].id).toBe("doc-42:0");
  });
});

describe("PineconeService — searchSimilarChunks", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    process.env.PINECONE_API_KEY = "test-key";
    mockUpsert.mockReset();
    mockQuery.mockReset();
    mockDeleteMany.mockReset();
    mockDescribeIndexStats.mockReset();
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
  });

  test("filters results below minSimilarity threshold", async () => {
    mockQuery.mockResolvedValue({
      matches: [
        { id: "d1:0", score: 0.8, metadata: { documentId: "d1", chunkIndex: 0, content: "hi", status: "active" } },
        { id: "d2:0", score: 0.2, metadata: { documentId: "d2", chunkIndex: 0, content: "lo", status: "active" } },
        { id: "d3:0", score: 0.5, metadata: { documentId: "d3", chunkIndex: 0, content: "mid", status: "active" } },
      ],
    });

    const svc = new PineconeService();
    const results = await svc.searchSimilarChunks(makeEmbedding(), "u1", 10, 0.4);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.documentId)).toEqual(["d1", "d3"]);
  });

  test("filters out documents with deleted status in metadata", async () => {
    mockQuery.mockResolvedValue({
      matches: [
        { id: "d1:0", score: 0.9, metadata: { documentId: "d1", chunkIndex: 0, content: "a", status: "active" } },
        { id: "d2:0", score: 0.85, metadata: { documentId: "d2", chunkIndex: 0, content: "b", status: "deleted" } },
      ],
    });

    const svc = new PineconeService();
    const results = await svc.searchSimilarChunks(makeEmbedding(), "u1");

    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe("d1");
  });

  test("de-duplicates results by documentId + chunkIndex keeping highest score", async () => {
    mockQuery.mockResolvedValue({
      matches: [
        { id: "d1:0-a", score: 0.7, metadata: { documentId: "d1", chunkIndex: 0, content: "x", status: "active" } },
        { id: "d1:0-b", score: 0.9, metadata: { documentId: "d1", chunkIndex: 0, content: "x", status: "active" } },
        { id: "d2:1", score: 0.6, metadata: { documentId: "d2", chunkIndex: 1, content: "y", status: "active" } },
      ],
    });

    const svc = new PineconeService();
    const results = await svc.searchSimilarChunks(makeEmbedding(), "u1");

    expect(results).toHaveLength(2);
    // d1:0 should keep the 0.9 score (highest)
    const d1Hit = results.find((r) => r.documentId === "d1");
    expect(d1Hit?.similarity).toBe(0.9);
  });

  test("returns empty array when query embedding is all zeros (assertVectorDim passes but hasNonZero is only checked for upsert)", async () => {
    // searchSimilarChunks calls assertVectorDim which checks length, not zero.
    // A valid-length all-zero query won't throw — it just gets empty matches.
    mockQuery.mockResolvedValue({ matches: [] });

    const svc = new PineconeService();
    const results = await svc.searchSimilarChunks(new Array(1536).fill(0), "u1");
    expect(results).toEqual([]);
  });
});

describe("PineconeService — deleteDocumentEmbeddings", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    process.env.PINECONE_API_KEY = "test-key";
    mockUpsert.mockReset();
    mockQuery.mockReset();
    mockDeleteMany.mockReset();
    mockDescribeIndexStats.mockReset();
    mockDeleteMany.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
  });

  test("uses fast deterministic ID path when chunkCount is provided", async () => {
    const svc = new PineconeService();
    await svc.deleteDocumentEmbeddings("doc-1", { chunkCount: 3 });

    // Should call deleteMany with deterministic IDs, no query needed
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockDeleteMany).toHaveBeenCalled();

    const deletedIds = mockDeleteMany.mock.calls[0][0] as string[];
    expect(deletedIds).toEqual(["doc-1:0", "doc-1:1", "doc-1:2"]);
  });

  test("falls back to query+delete loop when chunkCount not provided", async () => {
    mockQuery.mockResolvedValueOnce({
      matches: [
        { id: "doc-1:0" },
        { id: "doc-1:1" },
      ],
    });

    const svc = new PineconeService();
    await svc.deleteDocumentEmbeddings("doc-1");

    // Should query first, then delete the discovered IDs
    expect(mockQuery).toHaveBeenCalled();
    expect(mockDeleteMany).toHaveBeenCalled();

    const deletedIds = mockDeleteMany.mock.calls[0][0] as string[];
    expect(deletedIds).toContain("doc-1:0");
    expect(deletedIds).toContain("doc-1:1");
  });
});

describe("PineconeService — deleteEmbeddingsByOperationId", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    process.env.PINECONE_API_KEY = "test-key";
    mockUpsert.mockReset();
    mockQuery.mockReset();
    mockDeleteMany.mockReset();
    mockDescribeIndexStats.mockReset();
    mockDeleteMany.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
  });

  test("queries by operationId filter and deletes matched vectors", async () => {
    mockQuery.mockResolvedValueOnce({
      matches: [
        { id: "doc-1:0" },
        { id: "doc-1:1" },
        { id: "doc-1:2" },
      ],
    });

    const svc = new PineconeService();
    const deleted = await svc.deleteEmbeddingsByOperationId("doc-1", "op-42");

    expect(mockQuery).toHaveBeenCalled();
    const queryArgs = mockQuery.mock.calls[0][0] as any;
    expect(queryArgs.filter).toEqual({
      $and: [
        { documentId: { $eq: "doc-1" } },
        { operationId: { $eq: "op-42" } },
      ],
    });
    expect(deleted).toBe(3);
  });

  test("returns 0 when documentId or operationId is empty", async () => {
    const svc = new PineconeService();

    const result1 = await svc.deleteEmbeddingsByOperationId("", "op-1");
    const result2 = await svc.deleteEmbeddingsByOperationId("doc-1", "");

    expect(result1).toBe(0);
    expect(result2).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("PineconeService — getIndexStats", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    process.env.PINECONE_API_KEY = "test-key";
    mockUpsert.mockReset();
    mockQuery.mockReset();
    mockDeleteMany.mockReset();
    mockDescribeIndexStats.mockReset();
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
  });

  test("returns namespace stats when index is reachable", async () => {
    const fakeStats = {
      namespaces: { "": { vectorCount: 4200 } },
      dimension: 1536,
      indexFullness: 0.01,
      totalVectorCount: 4200,
    };
    mockDescribeIndexStats.mockResolvedValue(fakeStats);

    const svc = new PineconeService();
    const result = await svc.getIndexStats();

    expect(result.available).toBe(true);
    expect(result.indexName).toBe("koda-openai");
    expect(result.stats).toEqual(fakeStats);
  });

  test("handles Pinecone API errors gracefully in getIndexStats", async () => {
    mockDescribeIndexStats.mockRejectedValue(new Error("Network timeout"));

    const svc = new PineconeService();
    const result = await svc.getIndexStats();

    expect(result.available).toBe(false);
    expect(result.error).toMatch(/network timeout/i);
  });
});

describe("PineconeService — verifyDocumentEmbeddings (with mocked client)", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    process.env.PINECONE_API_KEY = "test-key";
    mockUpsert.mockReset();
    mockQuery.mockReset();
    mockDeleteMany.mockReset();
    mockDescribeIndexStats.mockReset();
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
  });

  test("returns count of vectors for document and success when count meets minimum", async () => {
    mockQuery.mockResolvedValue({
      matches: [
        { id: "doc-1:0", metadata: { documentId: "doc-1" } },
        { id: "doc-1:1", metadata: { documentId: "doc-1" } },
        { id: "doc-1:2", metadata: { documentId: "doc-1" } },
      ],
    });

    const svc = new PineconeService();
    const result = await svc.verifyDocumentEmbeddings("doc-1", { minCount: 2 });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(result.message).toMatch(/found 3/i);
  });

  test("returns failure when count is below expectedCount", async () => {
    mockQuery.mockResolvedValue({
      matches: [{ id: "doc-1:0", metadata: { documentId: "doc-1" } }],
    });

    const svc = new PineconeService();
    const result = await svc.verifyDocumentEmbeddings("doc-1", { expectedCount: 5 });

    expect(result.success).toBe(false);
    expect(result.count).toBe(1);
    expect(result.message).toMatch(/mismatch.*1.*5/i);
  });
});

describe("PineconeService — configuration and edge cases", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;
  const originalIndex = process.env.PINECONE_INDEX_NAME;

  beforeEach(() => {
    process.env.PINECONE_API_KEY = "test-key";
    mockUpsert.mockReset();
    mockQuery.mockReset();
    mockDeleteMany.mockReset();
    mockDescribeIndexStats.mockReset();
    mockUpsert.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
    if (originalIndex) process.env.PINECONE_INDEX_NAME = originalIndex;
    else delete process.env.PINECONE_INDEX_NAME;
  });

  test("reports available when API key is set", () => {
    const svc = new PineconeService();
    expect(svc.isAvailable()).toBe(true);
  });

  test("respects PINECONE_INDEX_NAME configuration", async () => {
    process.env.PINECONE_INDEX_NAME = "custom-index";
    mockDescribeIndexStats.mockResolvedValue({ totalVectorCount: 0 });

    const svc = new PineconeService();
    const result = await svc.getIndexStats();

    expect(result.indexName).toBe("custom-index");
  });

  test("scoped filter uses folderId when documentId is absent", () => {
    const svc = new PineconeService() as any;
    const filter = svc.buildFilter({ userId: "u1", folderId: "f-10" });
    expect(filter).toEqual({
      $and: [
        { userId: { $eq: "u1" } },
        { folderId: { $eq: "f-10" } },
      ],
    });
  });

  test("scoped filter uses userId only when no documentId or folderId", () => {
    const svc = new PineconeService() as any;
    const filter = svc.buildFilter({ userId: "u1" });
    expect(filter).toEqual({ userId: { $eq: "u1" } });
  });

  test("upsertDocumentEmbeddings returns skipped count matching chunks.length when unavailable", async () => {
    delete process.env.PINECONE_API_KEY;
    const svc = new PineconeService();

    const result = await svc.upsertDocumentEmbeddings(
      "doc-1", "u1", makeDocument(), [makeChunk(0), makeChunk(1)],
    );

    expect(result).toEqual({ upserted: 0, skipped: 2 });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("deleteDocumentEmbeddings is a no-op when unavailable", async () => {
    delete process.env.PINECONE_API_KEY;
    const svc = new PineconeService();

    await svc.deleteDocumentEmbeddings("doc-1", { chunkCount: 5 });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
