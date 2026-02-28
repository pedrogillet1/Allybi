import { beforeEach, describe, expect, jest, test } from "@jest/globals";

process.env.KODA_MASTER_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
process.env.RETRIEVAL_SEMANTIC_PINECONE_PRIMARY = "true";
process.env.RETRIEVAL_SEMANTIC_DB_FALLBACK = "true";
process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY = "false";

const mockChunkFindMany = jest.fn();
const mockDecryptChunksBatch = jest.fn();
const mockSearchSimilarChunks = jest.fn();
const mockPineconeAvailable = jest.fn();
const mockGenerateQueryEmbedding = jest.fn();

jest.mock("../../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    documentChunk: {
      findMany: (...args: any[]) => mockChunkFindMany(...args),
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
    generateQueryEmbedding: (...args: any[]) => mockGenerateQueryEmbedding(...args),
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
    mockChunkFindMany.mockReset();
    mockDecryptChunksBatch.mockReset();
    mockSearchSimilarChunks.mockReset();
    mockPineconeAvailable.mockReset();
    mockGenerateQueryEmbedding.mockReset();
  });

  test("lexical search decrypts encrypted chunk text when plaintext is not stored", async () => {
    mockChunkFindMany.mockResolvedValue([
      {
        id: "chunk-1",
        documentId: "doc-1",
        chunkIndex: 0,
        text: null,
        textEncrypted: "{\"v\":1}",
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
        textEncrypted: "{\"v\":1}",
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
});
