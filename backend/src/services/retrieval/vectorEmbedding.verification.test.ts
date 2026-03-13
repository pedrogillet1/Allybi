import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const originalVerifyRequired = process.env.INDEXING_VERIFY_REQUIRED;
const originalAllowUnverifiedDelete =
  process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE;

/* ------------------------------------------------------------------ */
/*  Mock fns                                                           */
/* ------------------------------------------------------------------ */

const mockDocumentFindUnique = jest.fn();
const mockDocumentFindMany = jest.fn();
const mockDocumentUpdate = jest.fn();
const mockEmbeddingCreateMany = jest.fn();
const mockEmbeddingDeleteMany = jest.fn();
const mockEmbeddingCount = jest.fn();
const mockChunkCreateMany = jest.fn();
const mockChunkDeleteMany = jest.fn();
const mockChunkCount = jest.fn();
const mockTransaction = jest.fn();

const mockUpsertDocumentEmbeddings = jest.fn();
const mockPineconeDeleteDocumentEmbeddings = jest.fn();
const mockDeleteByOperationId = jest.fn();
const mockVerifyDocumentEmbeddings = jest.fn();
const mockPineconeAvailable = jest.fn();

const mockGenerateBatchEmbeddings = jest.fn();

const mockRandomUUID = jest.fn();

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findUnique: (...args: any[]) => mockDocumentFindUnique(...args),
      findMany: (...args: any[]) => mockDocumentFindMany(...args),
      update: (...args: any[]) => mockDocumentUpdate(...args),
    },
    documentEmbedding: {
      createMany: (...args: any[]) => mockEmbeddingCreateMany(...args),
      count: (...args: any[]) => mockEmbeddingCount(...args),
      deleteMany: (...args: any[]) => mockEmbeddingDeleteMany(...args),
      findMany: jest.fn().mockResolvedValue([]),
    },
    documentChunk: {
      createMany: (...args: any[]) => mockChunkCreateMany(...args),
      count: (...args: any[]) => mockChunkCount(...args),
      deleteMany: (...args: any[]) => mockChunkDeleteMany(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock("./pinecone.service", () => ({
  __esModule: true,
  default: {
    isAvailable: (...args: any[]) => mockPineconeAvailable(...args),
    upsertDocumentEmbeddings: (...args: any[]) =>
      mockUpsertDocumentEmbeddings(...args),
    deleteDocumentEmbeddings: (...args: any[]) =>
      mockPineconeDeleteDocumentEmbeddings(...args),
    deleteEmbeddingsByOperationId: (...args: any[]) =>
      mockDeleteByOperationId(...args),
    verifyDocumentEmbeddings: (...args: any[]) =>
      mockVerifyDocumentEmbeddings(...args),
  },
}));

jest.mock("./embedding.service", () => ({
  __esModule: true,
  default: {
    generateBatchEmbeddings: (...args: any[]) =>
      mockGenerateBatchEmbeddings(...args),
    generateEmbedding: jest.fn(),
  },
}));

jest.mock("../documents/documentCrypto.service", () => ({
  __esModule: true,
  DocumentCryptoService: jest.fn().mockImplementation(() => ({
    encryptChunkText: jest.fn().mockReturnValue("encrypted-payload"),
  })),
}));

jest.mock("../documents/documentKey.service", () => ({
  __esModule: true,
  DocumentKeyService: jest.fn().mockImplementation(() => ({
    getDocumentKey: jest.fn().mockResolvedValue("doc-key-bytes"),
  })),
}));

jest.mock("../security/encryption.service", () => ({
  __esModule: true,
  EncryptionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../security/envelope.service", () => ({
  __esModule: true,
  EnvelopeService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../security/tenantKey.service", () => ({
  __esModule: true,
  TenantKeyService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../security/fieldEncryption.service", () => ({
  __esModule: true,
  getFieldEncryption: jest.fn().mockReturnValue({
    encryptField: jest.fn().mockReturnValue("encrypted"),
  }),
}));

jest.mock("crypto", () => ({
  __esModule: true,
  randomUUID: (...args: any[]) => mockRandomUUID(...args),
}));

/* ------------------------------------------------------------------ */
/*  Import SUT                                                         */
/* ------------------------------------------------------------------ */

import { storeDocumentEmbeddings } from "./vectorEmbedding.service";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DOC_ID = "doc-1";
const USER_ID = "user-1";

function makeDoc(overrides: Record<string, any> = {}) {
  return {
    id: DOC_ID,
    userId: USER_ID,
    filename: "report.pdf",
    mimeType: "application/pdf",
    createdAt: new Date("2026-01-01"),
    status: "active",
    folderId: "folder-1",
    folder: { name: "My Folder" },
    parentVersionId: null,
    ...overrides,
  };
}

function makeBatchResult(count: number) {
  return {
    embeddings: Array.from({ length: count }, (_, i) => ({
      text: `chunk ${i}`,
      embedding: [0.1 * i, 0.2, 0.3],
      dimensions: 3,
      model: "text-embedding-3-small",
    })),
    totalProcessed: count,
    failedCount: 0,
    processingTime: 100,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("vectorEmbedding verification-first indexing", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRandomUUID.mockReturnValue("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    mockPineconeAvailable.mockReturnValue(true);
    mockUpsertDocumentEmbeddings.mockResolvedValue(undefined);
    mockPineconeDeleteDocumentEmbeddings.mockResolvedValue(undefined);
    mockDeleteByOperationId.mockResolvedValue(undefined);
    mockEmbeddingCreateMany.mockResolvedValue({ count: 1 });
    mockChunkCreateMany.mockResolvedValue({ count: 1 });
    mockEmbeddingDeleteMany.mockResolvedValue({ count: 0 });
    mockChunkDeleteMany.mockResolvedValue({ count: 0 });
    mockEmbeddingCount.mockResolvedValue(1);
    mockChunkCount.mockResolvedValue(1);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(1));
    mockDocumentUpdate.mockResolvedValue({});
    mockDocumentFindMany.mockResolvedValue([
      { id: DOC_ID, createdAt: new Date("2026-01-01") },
    ]);

    mockVerifyDocumentEmbeddings.mockResolvedValue({
      success: true,
      count: 1,
      message: "ok",
    });

    // Default transaction — execute the callback
    mockTransaction.mockImplementation(async (fnOrArgs: any, _opts?: any) => {
      if (typeof fnOrArgs === "function") {
        return fnOrArgs({
          documentEmbedding: {
            deleteMany: mockEmbeddingDeleteMany,
            createMany: mockEmbeddingCreateMany,
          },
          documentChunk: {
            deleteMany: mockChunkDeleteMany,
            createMany: mockChunkCreateMany,
          },
        });
      }
      return undefined;
    });

    process.env.INDEXING_VERIFY_REQUIRED = "true";
    process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE = "false";
    delete process.env.INDEXING_STRICT_FAIL_CLOSED;
    delete process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY;
    delete process.env.EMBEDDING_FAILCLOSE_V1;
  });

  /**
   * Helper: set up mockDocumentFindUnique for a full storeDocumentEmbeddings call.
   * Call sequence:
   *   1. Wrapper before-lookup (select: id, userId, indexingOperationId)
   *   2. Core document lookup (include: { folder: true })
   *   3. Core resolveRootDocumentId (select: id, parentVersionId)
   *   4. Wrapper after-lookup (select: id, userId, indexingOperationId)
   */
  function setupFindUniqueSequence(
    previousOpId: string,
    newOpId: string,
  ) {
    mockDocumentFindUnique
      .mockResolvedValueOnce({
        id: DOC_ID,
        userId: USER_ID,
        indexingOperationId: previousOpId,
      })
      .mockResolvedValueOnce(makeDoc({ indexingOperationId: previousOpId }))
      .mockResolvedValueOnce({
        id: DOC_ID,
        parentVersionId: null,
      })
      .mockResolvedValueOnce({
        id: DOC_ID,
        userId: USER_ID,
        indexingOperationId: newOpId,
      });
  }

  test("deletes previous operation vectors only after new operation verification succeeds", async () => {
    setupFindUniqueSequence("op_old", "op_new");

    await storeDocumentEmbeddings(
      DOC_ID,
      [{ chunkIndex: 0, content: "quarterly revenue content here", embedding: [0.1] }],
      { strictVerify: true, encryptionMode: "plaintext" },
    );

    expect(mockVerifyDocumentEmbeddings).toHaveBeenCalledTimes(1);
    expect(mockDeleteByOperationId).toHaveBeenCalledWith(DOC_ID, "op_old", {
      userId: USER_ID,
    });
    // Verification must happen before previous-op cleanup
    expect(mockVerifyDocumentEmbeddings.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteByOperationId.mock.invocationCallOrder[0],
    );
  });

  test("rolls back current operation vectors when verification fails", async () => {
    setupFindUniqueSequence("op_old", "op_new");
    mockVerifyDocumentEmbeddings.mockResolvedValue({
      success: false,
      count: 0,
      message: "mismatch",
    });

    await expect(
      storeDocumentEmbeddings(
        DOC_ID,
        [{ chunkIndex: 0, content: "quarterly revenue content here", embedding: [0.1] }],
        { strictVerify: true, encryptionMode: "plaintext" },
      ),
    ).rejects.toThrow(/mismatch/);

    expect(mockDeleteByOperationId).toHaveBeenCalledTimes(1);
    expect(mockDeleteByOperationId).toHaveBeenCalledWith(DOC_ID, "op_new", {
      userId: USER_ID,
    });
  });

  test("keeps previous operation vectors when verification is skipped and cleanup override is disabled", async () => {
    process.env.INDEXING_VERIFY_REQUIRED = "false";
    process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE = "false";
    setupFindUniqueSequence("op_old", "op_new");

    await storeDocumentEmbeddings(
      DOC_ID,
      [{ chunkIndex: 0, content: "quarterly revenue content here", embedding: [0.1] }],
      { strictVerify: false, encryptionMode: "plaintext" },
    );

    expect(mockVerifyDocumentEmbeddings).not.toHaveBeenCalled();
    expect(mockDeleteByOperationId).not.toHaveBeenCalled();
  });

  test("allows unverified previous-operation cleanup when override flag is enabled", async () => {
    process.env.INDEXING_VERIFY_REQUIRED = "false";
    process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE = "true";
    setupFindUniqueSequence("op_old", "op_new");

    await storeDocumentEmbeddings(
      DOC_ID,
      [{ chunkIndex: 0, content: "quarterly revenue content here", embedding: [0.1] }],
      { strictVerify: false, encryptionMode: "plaintext" },
    );

    expect(mockVerifyDocumentEmbeddings).not.toHaveBeenCalled();
    expect(mockDeleteByOperationId).toHaveBeenCalledTimes(1);
    expect(mockDeleteByOperationId).toHaveBeenCalledWith(DOC_ID, "op_old", {
      userId: USER_ID,
    });
  });
});

afterEach(() => {
  if (originalVerifyRequired === undefined) {
    delete process.env.INDEXING_VERIFY_REQUIRED;
  } else {
    process.env.INDEXING_VERIFY_REQUIRED = originalVerifyRequired;
  }
  if (originalAllowUnverifiedDelete === undefined) {
    delete process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE;
  } else {
    process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE =
      originalAllowUnverifiedDelete;
  }
});
