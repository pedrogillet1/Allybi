import { beforeEach, describe, expect, jest, test } from "@jest/globals";

process.env.KODA_MASTER_KEY_BASE64 = Buffer.alloc(32, 9).toString("base64");

const mockFindDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockEmbeddingCount = jest.fn();
const mockChunkCount = jest.fn();
const mockTransaction = jest.fn();
const mockIsAvailable = jest.fn();
const mockUpsert = jest.fn();
const mockDeleteByOperationId = jest.fn();
const mockDeleteDocumentEmbeddings = jest.fn();
const mockGetDocumentKey = jest.fn();
const mockEncryptChunkText = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findUnique: (...args: any[]) => mockFindDocument(...args),
      update: (...args: any[]) => mockUpdateDocument(...args),
    },
    documentEmbedding: {
      count: (...args: any[]) => mockEmbeddingCount(...args),
    },
    documentChunk: { count: (...args: any[]) => mockChunkCount(...args) },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

jest.mock("../../services/documents/documentKey.service", () => ({
  DocumentKeyService: jest.fn().mockImplementation(() => ({
    getDocumentKey: (...args: any[]) => mockGetDocumentKey(...args),
  })),
}));

jest.mock("../../services/documents/documentCrypto.service", () => ({
  DocumentCryptoService: jest.fn().mockImplementation(() => ({
    encryptChunkText: (...args: any[]) => mockEncryptChunkText(...args),
  })),
}));

jest.mock("../../services/retrieval/embedding.service", () => ({
  __esModule: true,
  default: {
    generateBatchEmbeddings: jest.fn(),
    generateEmbedding: jest.fn(),
  },
}));

jest.mock("../../services/retrieval/pinecone.service", () => ({
  __esModule: true,
  default: {
    isAvailable: (...args: any[]) => mockIsAvailable(...args),
    upsertDocumentEmbeddings: (...args: any[]) => mockUpsert(...args),
    deleteEmbeddingsByOperationId: (...args: any[]) =>
      mockDeleteByOperationId(...args),
    deleteDocumentEmbeddings: (...args: any[]) =>
      mockDeleteDocumentEmbeddings(...args),
  },
}));

import { storeDocumentEmbeddings } from "../../services/retrieval/vectorEmbedding.service";

describe("vectorEmbedding rollback", () => {
  beforeEach(() => {
    mockFindDocument.mockReset();
    mockUpdateDocument.mockReset();
    mockEmbeddingCount.mockReset();
    mockChunkCount.mockReset();
    mockTransaction.mockReset();
    mockIsAvailable.mockReset();
    mockUpsert.mockReset();
    mockDeleteByOperationId.mockReset();
    mockDeleteDocumentEmbeddings.mockReset();
    mockGetDocumentKey.mockReset();
    mockEncryptChunkText.mockReset();

    mockFindDocument.mockResolvedValue({
      id: "doc-1",
      userId: "user-1",
      filename: "report.pdf",
      mimeType: "application/pdf",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "ready",
      folderId: null,
      folder: null,
    });
    mockUpdateDocument.mockResolvedValue({});
    mockEmbeddingCount.mockResolvedValue(1);
    mockChunkCount.mockResolvedValue(1);
    mockIsAvailable.mockReturnValue(true);
    mockUpsert.mockResolvedValue({ upserted: 1, skipped: 0 });
    mockGetDocumentKey.mockResolvedValue(Buffer.alloc(32, 1));
    mockEncryptChunkText.mockReturnValue('{"v":1}');
    mockTransaction.mockImplementation(
      async () =>
        await new Promise((_, reject) =>
          setTimeout(() => reject(new Error("postgres write failed")), 5),
        ),
    );
  });

  test("uses operation-scoped pinecone rollback when post-upsert verification fails", async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      await fn({
        documentEmbedding: {
          deleteMany: async () => ({ count: 1 }),
          createMany: async () => ({ count: 1 }),
        },
        documentChunk: {
          deleteMany: async () => ({ count: 1 }),
          createMany: async () => ({ count: 1 }),
        },
      });
      return;
    });
    mockEmbeddingCount.mockResolvedValue(0);
    mockChunkCount.mockResolvedValue(0);

    await expect(
      storeDocumentEmbeddings(
        "doc-1",
        [{ chunkIndex: 0, content: "quarterly revenue", embedding: [0.11] }],
        { maxRetries: 1, strictVerify: true, encryptionMode: "plaintext" },
      ),
    ).rejects.toThrow("Failed to store embeddings for document doc-1");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockDeleteDocumentEmbeddings).toHaveBeenCalledTimes(1);
    expect(mockDeleteByOperationId).toHaveBeenCalledTimes(1);

    const [documentId, operationId, opts] =
      mockDeleteByOperationId.mock.calls[0];
    expect(documentId).toBe("doc-1");
    expect(String(operationId)).toMatch(/^op_/);
    expect(opts).toEqual({ userId: "user-1" });
  });

  test("pre-deletes vectors before upsert and persists encrypted-only chunk rows", async () => {
    const sequence: string[] = [];
    const createdChunkRows: Array<Record<string, any>> = [];

    mockTransaction.mockImplementation(async (fn: any) => {
      await fn({
        documentEmbedding: {
          deleteMany: async () => ({ count: 1 }),
          createMany: async () => ({ count: 1 }),
        },
        documentChunk: {
          deleteMany: async () => ({ count: 1 }),
          createMany: async (args: any) => {
            createdChunkRows.push(...(args?.data || []));
            return { count: (args?.data || []).length };
          },
        },
      });
      return;
    });
    mockDeleteDocumentEmbeddings.mockImplementation(async () => {
      sequence.push("delete");
    });
    mockUpsert.mockImplementation(async () => {
      sequence.push("upsert");
      return { upserted: 1, skipped: 0 };
    });

    await storeDocumentEmbeddings(
      "doc-1",
      [{ chunkIndex: 0, content: "quarterly revenue", embedding: [0.11] }],
      {
        maxRetries: 1,
        strictVerify: false,
        encryptionMode: "encrypted_only",
        preDeleteVectors: true,
      },
    );

    expect(sequence).toEqual(["delete", "upsert"]);
    expect(mockGetDocumentKey).toHaveBeenCalledWith("user-1", "doc-1");
    expect(createdChunkRows).toHaveLength(1);
    expect(createdChunkRows[0].text).toBeNull();
    expect(createdChunkRows[0].textEncrypted).toBe('{"v":1}');
  });
});
