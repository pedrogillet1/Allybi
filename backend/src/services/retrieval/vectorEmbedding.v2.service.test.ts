import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const originalVerifyRequired = process.env.INDEXING_VERIFY_REQUIRED;
const originalAllowUnverifiedDelete =
  process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE;

const mockDocumentFindUnique = jest.fn();
const mockChunkCount = jest.fn();
const mockStoreV1 = jest.fn();
const mockDeleteByOperationId = jest.fn();
const mockVerifyDocumentEmbeddings = jest.fn();
const mockPineconeAvailable = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findUnique: (...args: any[]) => mockDocumentFindUnique(...args),
    },
    documentChunk: {
      count: (...args: any[]) => mockChunkCount(...args),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("./vectorEmbedding.service", () => ({
  __esModule: true,
  generateEmbedding: jest.fn(),
  storeDocumentEmbeddings: (...args: any[]) => mockStoreV1(...args),
  deleteChunkEmbeddings: jest.fn(),
}));

jest.mock("./pinecone.service", () => ({
  __esModule: true,
  default: {
    isAvailable: (...args: any[]) => mockPineconeAvailable(...args),
    deleteEmbeddingsByOperationId: (...args: any[]) =>
      mockDeleteByOperationId(...args),
    verifyDocumentEmbeddings: (...args: any[]) =>
      mockVerifyDocumentEmbeddings(...args),
  },
}));

import { storeDocumentEmbeddings } from "./vectorEmbedding.v2.service";

describe("vectorEmbedding.v2 service", () => {
  beforeEach(() => {
    mockDocumentFindUnique.mockReset();
    mockChunkCount.mockReset();
    mockStoreV1.mockReset();
    mockDeleteByOperationId.mockReset();
    mockVerifyDocumentEmbeddings.mockReset();
    mockPineconeAvailable.mockReset();

    mockStoreV1.mockResolvedValue(undefined);
    mockChunkCount.mockResolvedValue(2);
    mockPineconeAvailable.mockReturnValue(true);
    mockVerifyDocumentEmbeddings.mockResolvedValue({
      success: true,
      count: 2,
      message: "ok",
    });
    process.env.INDEXING_VERIFY_REQUIRED = "true";
    process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE = "false";
  });

  test("deletes previous operation vectors only after new operation verification succeeds", async () => {
    mockDocumentFindUnique
      .mockResolvedValueOnce({
        id: "doc-1",
        userId: "user-1",
        indexingOperationId: "op_old",
      })
      .mockResolvedValueOnce({
        id: "doc-1",
        userId: "user-1",
        indexingOperationId: "op_new",
      });

    await storeDocumentEmbeddings(
      "doc-1",
      [{ chunkIndex: 0, content: "quarterly revenue", embedding: [0.1] }],
      { strictVerify: true },
    );

    expect(mockStoreV1).toHaveBeenCalledTimes(1);
    expect(mockStoreV1).toHaveBeenCalledWith(
      "doc-1",
      [{ chunkIndex: 0, content: "quarterly revenue", embedding: [0.1] }],
      expect.objectContaining({
        preDeleteVectors: false,
        strictVerify: false,
        verifyAfterStore: false,
      }),
    );
    expect(mockVerifyDocumentEmbeddings).toHaveBeenCalledTimes(1);
    expect(mockDeleteByOperationId).toHaveBeenCalledWith("doc-1", "op_old", {
      userId: "user-1",
    });
    expect(mockVerifyDocumentEmbeddings.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteByOperationId.mock.invocationCallOrder[0],
    );
  });

  test("rolls back current operation vectors when verification fails", async () => {
    mockDocumentFindUnique
      .mockResolvedValueOnce({
        id: "doc-1",
        userId: "user-1",
        indexingOperationId: "op_old",
      })
      .mockResolvedValueOnce({
        id: "doc-1",
        userId: "user-1",
        indexingOperationId: "op_new",
      });
    mockVerifyDocumentEmbeddings.mockResolvedValue({
      success: false,
      count: 0,
      message: "mismatch",
    });

    await expect(
      storeDocumentEmbeddings(
        "doc-1",
        [{ chunkIndex: 0, content: "quarterly revenue", embedding: [0.1] }],
        { strictVerify: true },
      ),
    ).rejects.toThrow(/mismatch/);

    expect(mockDeleteByOperationId).toHaveBeenCalledTimes(1);
    expect(mockDeleteByOperationId).toHaveBeenCalledWith("doc-1", "op_new", {
      userId: "user-1",
    });
  });

  test("keeps previous operation vectors when verification is skipped and cleanup override is disabled", async () => {
    process.env.INDEXING_VERIFY_REQUIRED = "false";
    process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE = "false";
    mockDocumentFindUnique
      .mockResolvedValueOnce({
        id: "doc-1",
        userId: "user-1",
        indexingOperationId: "op_old",
      })
      .mockResolvedValueOnce({
        id: "doc-1",
        userId: "user-1",
        indexingOperationId: "op_new",
      });

    await storeDocumentEmbeddings(
      "doc-1",
      [{ chunkIndex: 0, content: "quarterly revenue", embedding: [0.1] }],
      { strictVerify: false },
    );

    expect(mockVerifyDocumentEmbeddings).not.toHaveBeenCalled();
    expect(mockDeleteByOperationId).not.toHaveBeenCalled();
  });

  test("allows unverified previous-operation cleanup when override flag is enabled", async () => {
    process.env.INDEXING_VERIFY_REQUIRED = "false";
    process.env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE = "true";
    mockDocumentFindUnique
      .mockResolvedValueOnce({
        id: "doc-1",
        userId: "user-1",
        indexingOperationId: "op_old",
      })
      .mockResolvedValueOnce({
        id: "doc-1",
        userId: "user-1",
        indexingOperationId: "op_new",
      });

    await storeDocumentEmbeddings(
      "doc-1",
      [{ chunkIndex: 0, content: "quarterly revenue", embedding: [0.1] }],
      { strictVerify: false },
    );

    expect(mockVerifyDocumentEmbeddings).not.toHaveBeenCalled();
    expect(mockDeleteByOperationId).toHaveBeenCalledTimes(1);
    expect(mockDeleteByOperationId).toHaveBeenCalledWith("doc-1", "op_old", {
      userId: "user-1",
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
