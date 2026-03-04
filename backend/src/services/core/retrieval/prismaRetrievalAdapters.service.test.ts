import { beforeEach, describe, expect, jest, test } from "@jest/globals";

process.env.KODA_MASTER_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
process.env.RETRIEVAL_SEMANTIC_PINECONE_PRIMARY = "true";
process.env.RETRIEVAL_SEMANTIC_DB_FALLBACK = "true";
process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY = "false";
process.env.RETRIEVAL_LATEST_VERSION_ONLY = "true";

const mockDocumentFindMany = jest.fn();
const mockDocumentFindFirst = jest.fn();
const mockChunkFindMany = jest.fn();
const mockEmbeddingFindMany = jest.fn();
const mockDecryptChunksBatch = jest.fn();
const mockSearchSimilarChunks = jest.fn();
const mockPineconeAvailable = jest.fn();
const mockGenerateQueryEmbedding = jest.fn();

jest.mock("../../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: (...args: any[]) => mockDocumentFindMany(...args),
      findFirst: (...args: any[]) => mockDocumentFindFirst(...args),
    },
    documentChunk: {
      findMany: (...args: any[]) => mockChunkFindMany(...args),
    },
    documentEmbedding: {
      findMany: (...args: any[]) => mockEmbeddingFindMany(...args),
    },
  },
}));

jest.mock("../../retrieval/chunkCrypto.service", () => ({
  ChunkCryptoService: jest.fn().mockImplementation(() => ({
    decryptChunksBatch: (...args: any[]) => mockDecryptChunksBatch(...args),
  })),
}));

jest.mock("../../retrieval/embedding.service", () => ({
  EmbeddingsService: jest.fn().mockImplementation(() => ({
    generateQueryEmbedding: (...args: any[]) =>
      mockGenerateQueryEmbedding(...args),
  })),
}));

jest.mock("../../retrieval/pinecone.service", () => ({
  __esModule: true,
  default: {
    isAvailable: (...args: any[]) => mockPineconeAvailable(...args),
    searchSimilarChunks: (...args: any[]) => mockSearchSimilarChunks(...args),
  },
}));

import { PrismaRetrievalAdapterFactory } from "./prismaRetrievalAdapters.service";

describe("PrismaRetrievalAdapterFactory encrypted chunk hydration", () => {
  beforeEach(() => {
    process.env.RETRIEVAL_LEXICAL_FROM_EMBEDDINGS = "false";
    mockDocumentFindMany.mockReset();
    mockDocumentFindFirst.mockReset();
    mockChunkFindMany.mockReset();
    mockEmbeddingFindMany.mockReset();
    mockDecryptChunksBatch.mockReset();
    mockSearchSimilarChunks.mockReset();
    mockPineconeAvailable.mockReset();
    mockGenerateQueryEmbedding.mockReset();
    mockDocumentFindMany.mockResolvedValue([]);
    mockEmbeddingFindMany.mockResolvedValue([]);
  });

  test("lexical search decrypts encrypted chunk text when plaintext is not stored", async () => {
    mockChunkFindMany.mockResolvedValue([
      {
        id: "chunk-1",
        documentId: "doc-1",
        chunkIndex: 0,
        text: null,
        textEncrypted: '{"v":1}',
        page: 2,
        document: {
          id: "doc-1",
          filename: "bill.pdf",
          displayTitle: "Mobile bill",
          encryptedFilename: "users/u-1/bill.pdf",
          mimeType: "application/pdf",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    ]);
    mockDecryptChunksBatch.mockResolvedValue(
      new Map([["chunk-1", "Invoice total due is $120.00 on 02/01/2026."]]),
    );

    const deps = new PrismaRetrievalAdapterFactory().createForUser("user-1");
    const hits = await deps.lexicalIndex.search({
      query: "invoice total due",
      k: 3,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].docId).toBe("doc-1");
    expect(hits[0].snippet).toContain("Invoice total due is $120.00");
    expect(hits[0].chunkId).toBe("chunk-1");
    expect(mockDecryptChunksBatch).toHaveBeenCalledWith("user-1", "doc-1", [
      "chunk-1",
    ]);
  });

  test("semantic search hydrates missing pinecone content from encrypted chunks", async () => {
    mockPineconeAvailable.mockReturnValue(true);
    mockGenerateQueryEmbedding.mockResolvedValue({
      embedding: [0.5, 0.6],
      model: "text-embedding-3-small",
      tokens: 10,
    });
    mockSearchSimilarChunks.mockResolvedValue([
      {
        documentId: "doc-2",
        chunkIndex: 7,
        content: "",
        similarity: 0.94,
        metadata: {},
        document: {
          id: "doc-2",
          filename: "statement.pdf",
          mimeType: "application/pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ready",
        },
      },
    ]);
    mockChunkFindMany.mockResolvedValue([
      {
        id: "chunk-db-7",
        documentId: "doc-2",
        chunkIndex: 7,
        text: null,
        textEncrypted: '{"v":1}',
        page: 8,
      },
    ]);
    mockDecryptChunksBatch.mockResolvedValue(
      new Map([["chunk-db-7", "Statement ending balance is $4,510.83."]]),
    );

    const deps = new PrismaRetrievalAdapterFactory().createForUser("user-1");
    const hits = await deps.semanticIndex.search({
      query: "ending balance",
      k: 3,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].docId).toBe("doc-2");
    expect(hits[0].snippet).toContain("ending balance is $4,510.83");
    expect(hits[0].location.page).toBe(8);
    expect(hits[0].chunkId).toBe("chunk-db-7");
  });

  test("lexical search emits table payload when chunk row is cell-centric", async () => {
    mockChunkFindMany.mockResolvedValue([
      {
        id: "chunk-cell-1",
        documentId: "doc-10",
        chunkIndex: 4,
        text: "Revenue / Jan = $125.00",
        textEncrypted: null,
        page: null,
        sheetName: "Summary",
        tableChunkForm: "cell_centric",
        rowLabel: "Revenue",
        colHeader: "Jan",
        valueRaw: "$125.00",
        unitRaw: "$",
        unitNormalized: "currency_usd",
        document: {
          id: "doc-10",
          filename: "revenue.xlsx",
          displayTitle: "Revenue",
          encryptedFilename: "users/u-1/revenue.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    ]);

    const deps = new PrismaRetrievalAdapterFactory().createForUser("user-1");
    const hits = await deps.lexicalIndex.search({
      query: "revenue jan",
      k: 3,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].table?.header).toEqual(["Revenue", "Jan"]);
    expect(hits[0].table?.rows?.[0]?.[0]).toBe("$125.00");
    expect(hits[0].table?.warnings).toBeUndefined();
    expect(hits[0].location.sheet).toBe("Summary");
    expect(hits[0].locationKey).toContain("|s:Summary|");
    expect(hits[0].locationKey).not.toContain("|p:-1|");
  });

  test("embedding-backed lexical search emits table payload from embedding metadata", async () => {
    process.env.RETRIEVAL_LEXICAL_FROM_EMBEDDINGS = "true";
    mockEmbeddingFindMany.mockResolvedValue([
      {
        id: "emb-1",
        documentId: "doc-11",
        chunkIndex: 2,
        content: "EBITDA / Q1 = 42%",
        metadata: JSON.stringify({
          tableChunkForm: "cell_centric",
          sheetName: "KPI Dashboard",
          tableId: "tbl_kpi",
          rowLabel: "EBITDA",
          colHeader: "Q1",
          valueRaw: "42%",
          unitRaw: "%",
          unitNormalized: "percent",
        }),
        pageNumber: null,
        sectionName: null,
        document: {
          id: "doc-11",
          parentVersionId: null,
          filename: "kpi.xlsx",
          displayTitle: "KPI",
          encryptedFilename: "users/u-1/kpi.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    ]);

    const deps = new PrismaRetrievalAdapterFactory().createForUser("user-1");
    const hits = await deps.lexicalIndex.search({
      query: "ebitda q1",
      k: 2,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].table?.header).toEqual(["EBITDA", "Q1"]);
    expect(hits[0].table?.rows?.[0]?.[0]).toBe("42%");
    expect(hits[0].table?.numericIntegrityScore).toBeGreaterThan(0.9);
    expect(hits[0].location.sheet).toBe("KPI Dashboard");
    expect(hits[0].location.sectionKey).toBe("tbl_kpi");
    expect(hits[0].locationKey).toContain("|s:KPI Dashboard|");
    expect(hits[0].locationKey).toContain("|sec:tbl_kpi|");
    expect(hits[0].locationKey).not.toContain("|p:-1|");
    process.env.RETRIEVAL_LEXICAL_FROM_EMBEDDINGS = "false";
  });

  test("semantic search uses sheet metadata for non-placeholder location keys", async () => {
    mockPineconeAvailable.mockReturnValue(true);
    mockGenerateQueryEmbedding.mockResolvedValue({
      embedding: [0.9, 0.1],
      model: "text-embedding-3-small",
      tokens: 6,
    });
    mockSearchSimilarChunks.mockResolvedValue([
      {
        documentId: "doc-sheet-1",
        chunkIndex: 3,
        content: "Gross margin is 51.2% in Q2.",
        similarity: 0.89,
        metadata: {
          sheetName: "Financials",
          rowLabel: "Gross Margin",
        },
        document: {
          id: "doc-sheet-1",
          filename: "financials.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          createdAt: "2026-03-01T00:00:00.000Z",
          status: "ready",
        },
      },
    ]);
    mockDocumentFindMany.mockResolvedValueOnce([]);

    const deps = new PrismaRetrievalAdapterFactory().createForUser("user-1");
    const hits = await deps.semanticIndex.search({
      query: "gross margin q2",
      k: 3,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].location.sheet).toBe("Financials");
    expect(hits[0].location.sectionKey).toBe("Gross Margin");
    expect(hits[0].locationKey).toContain("|s:Financials|");
    expect(hits[0].locationKey).toContain("|sec:Gross Margin|");
    expect(hits[0].locationKey).toContain("|c:3");
    expect(hits[0].locationKey).not.toContain("|p:-1|");
  });

  test("scoped root doc ids resolve to latest ready revision before semantic search", async () => {
    mockPineconeAvailable.mockReturnValue(true);
    mockGenerateQueryEmbedding.mockResolvedValue({
      embedding: [0.11, 0.22],
      model: "text-embedding-3-small",
      tokens: 8,
    });
    mockDocumentFindMany
      // resolveScopedDocIds: requested docs
      .mockResolvedValueOnce([{ id: "doc-root", parentVersionId: null }])
      // resolveLatestReadyDocByRootIds: family docs
      .mockResolvedValueOnce([
        {
          id: "doc-root",
          parentVersionId: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "doc-rev-2",
          parentVersionId: "doc-root",
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          updatedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ]);
    mockSearchSimilarChunks.mockResolvedValue([
      {
        documentId: "doc-rev-2",
        chunkIndex: 1,
        content: "Latest revised content.",
        similarity: 0.91,
        metadata: { versionId: "doc-rev-2", rootDocumentId: "doc-root" },
        document: {
          id: "doc-rev-2",
          filename: "contract-v2.pdf",
          mimeType: "application/pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          status: "ready",
        },
      },
    ]);

    const deps = new PrismaRetrievalAdapterFactory().createForUser("user-1");
    const hits = await deps.semanticIndex.search({
      query: "latest clause update",
      docIds: ["doc-root"],
      k: 2,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].docId).toBe("doc-rev-2");
    expect(mockSearchSimilarChunks).toHaveBeenCalledWith(
      expect.any(Array),
      "user-1",
      expect.any(Number),
      expect.any(Number),
      "doc-rev-2",
    );
  });

  test("unscoped semantic search drops stale root hits when newer revision exists", async () => {
    mockPineconeAvailable.mockReturnValue(true);
    mockGenerateQueryEmbedding.mockResolvedValue({
      embedding: [0.7, 0.8],
      model: "text-embedding-3-small",
      tokens: 7,
    });
    mockSearchSimilarChunks.mockResolvedValue([
      {
        documentId: "doc-root",
        chunkIndex: 0,
        content: "Old root version text.",
        similarity: 0.86,
        metadata: { versionId: "doc-root", rootDocumentId: "doc-root" },
        document: {
          id: "doc-root",
          filename: "policy-v1.pdf",
          mimeType: "application/pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ready",
        },
      },
      {
        documentId: "doc-rev-3",
        chunkIndex: 0,
        content: "New revised policy text.",
        similarity: 0.84,
        metadata: { versionId: "doc-rev-3", rootDocumentId: "doc-root" },
        document: {
          id: "doc-rev-3",
          filename: "policy-v3.pdf",
          mimeType: "application/pdf",
          createdAt: "2026-03-01T00:00:00.000Z",
          status: "ready",
        },
      },
    ]);
    mockDocumentFindMany
      // keepLatestVersionHits: candidate docs by id
      .mockResolvedValueOnce([
        { id: "doc-root", parentVersionId: null },
        { id: "doc-rev-3", parentVersionId: "doc-root" },
      ])
      // resolveLatestReadyDocByRootIds: family docs
      .mockResolvedValueOnce([
        {
          id: "doc-root",
          parentVersionId: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "doc-rev-3",
          parentVersionId: "doc-root",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      ]);

    const deps = new PrismaRetrievalAdapterFactory().createForUser("user-1");
    const hits = await deps.semanticIndex.search({
      query: "policy latest revision",
      k: 5,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].docId).toBe("doc-rev-3");
    expect(hits[0].snippet).toContain("New revised policy text");
  });

  test("unscoped semantic search keeps stale hits if latest revision has no matching hit", async () => {
    mockPineconeAvailable.mockReturnValue(true);
    mockGenerateQueryEmbedding.mockResolvedValue({
      embedding: [0.3, 0.4],
      model: "text-embedding-3-small",
      tokens: 7,
    });
    mockSearchSimilarChunks.mockResolvedValue([
      {
        documentId: "doc-root",
        chunkIndex: 0,
        content: "Only old version contains this exact clause.",
        similarity: 0.82,
        metadata: { versionId: "doc-root", rootDocumentId: "doc-root" },
        document: {
          id: "doc-root",
          filename: "policy-v1.pdf",
          mimeType: "application/pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "ready",
        },
      },
    ]);
    mockDocumentFindMany
      .mockResolvedValueOnce([{ id: "doc-root", parentVersionId: null }])
      .mockResolvedValueOnce([
        {
          id: "doc-root",
          parentVersionId: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "doc-rev-4",
          parentVersionId: "doc-root",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ]);

    const deps = new PrismaRetrievalAdapterFactory().createForUser("user-1");
    const hits = await deps.semanticIndex.search({
      query: "exact clause in old policy",
      k: 5,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].docId).toBe("doc-root");
  });
});
