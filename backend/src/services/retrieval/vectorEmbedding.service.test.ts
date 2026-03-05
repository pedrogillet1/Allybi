import { beforeEach, describe, expect, jest, test } from "@jest/globals";

/* ------------------------------------------------------------------ */
/*  Mock fns – declared before jest.mock so factory closures capture   */
/* ------------------------------------------------------------------ */

const mockDocumentFindUnique = jest.fn();
const mockDocumentFindMany = jest.fn();
const mockDocumentUpdate = jest.fn();
const mockChunkCreateMany = jest.fn();
const mockChunkCount = jest.fn();
const mockChunkDeleteMany = jest.fn();
const mockChunkUpdateMany = jest.fn();
const mockTransaction = jest.fn();

const mockUpsertDocumentEmbeddings = jest.fn();
const mockPineconeDeleteDocumentEmbeddings = jest.fn();
const mockDeleteEmbeddingsByOperationId = jest.fn();
const mockGetIndexStats = jest.fn();
const mockPineconeIsAvailable = jest.fn();

const mockGenerateBatchEmbeddings = jest.fn();
const mockGenerateEmbeddingSingle = jest.fn();

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
    documentChunk: {
      createMany: (...args: any[]) => mockChunkCreateMany(...args),
      count: (...args: any[]) => mockChunkCount(...args),
      deleteMany: (...args: any[]) => mockChunkDeleteMany(...args),
      updateMany: (...args: any[]) => mockChunkUpdateMany(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

jest.mock("./pinecone.service", () => ({
  __esModule: true,
  default: {
    upsertDocumentEmbeddings: (...args: any[]) =>
      mockUpsertDocumentEmbeddings(...args),
    deleteDocumentEmbeddings: (...args: any[]) =>
      mockPineconeDeleteDocumentEmbeddings(...args),
    deleteEmbeddingsByOperationId: (...args: any[]) =>
      mockDeleteEmbeddingsByOperationId(...args),
    getIndexStats: (...args: any[]) => mockGetIndexStats(...args),
    isAvailable: (...args: any[]) => mockPineconeIsAvailable(...args),
  },
}));

jest.mock("./embedding.service", () => ({
  __esModule: true,
  default: {
    generateBatchEmbeddings: (...args: any[]) =>
      mockGenerateBatchEmbeddings(...args),
    generateEmbedding: (...args: any[]) => mockGenerateEmbeddingSingle(...args),
  },
}));

jest.mock("../documents/documentCrypto.service", () => ({
  __esModule: true,
  DocumentCryptoService: jest.fn().mockImplementation(() => ({
    encryptChunkText: jest
      .fn()
      .mockReturnValue("encrypted-payload"),
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

jest.mock("crypto", () => ({
  __esModule: true,
  randomUUID: (...args: any[]) => mockRandomUUID(...args),
  createHash: (algo: string) => {
    const { createHash: realCreateHash } = jest.requireActual("crypto") as any;
    return realCreateHash(algo);
  },
}));

/* ------------------------------------------------------------------ */
/*  Import SUT (after mocks are in place)                              */
/* ------------------------------------------------------------------ */

import {
  storeDocumentEmbeddings,
  generateEmbedding,
  deleteDocumentEmbeddings,
} from "./vectorEmbedding.service";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DOC_ID = "doc-abc-123";
const USER_ID = "user-xyz";

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
    ...overrides,
  };
}

function makeChunks(
  count: number,
  opts: { contentPrefix?: string; withEmbedding?: boolean } = {},
) {
  return Array.from({ length: count }, (_, i) => ({
    chunkIndex: i,
    content: `${opts.contentPrefix ?? "chunk content that is long enough"} ${i}`,
    metadata: {
      chunkType: "text",
      sourceType: "text",
      sectionId: `sec:test-${i}`,
    },
    ...(opts.withEmbedding ? { embedding: [0.1, 0.2, 0.3] } : {}),
  }));
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
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

describe("vectorEmbedding.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Sensible defaults
    mockRandomUUID.mockReturnValue("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    mockDocumentFindUnique.mockResolvedValue(makeDoc());
    mockDocumentFindMany.mockResolvedValue([
      {
        id: DOC_ID,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    mockDocumentUpdate.mockResolvedValue({});
    mockPineconeIsAvailable.mockReturnValue(true);
    mockUpsertDocumentEmbeddings.mockResolvedValue(undefined);
    mockPineconeDeleteDocumentEmbeddings.mockResolvedValue(undefined);
    mockDeleteEmbeddingsByOperationId.mockResolvedValue(undefined);
    mockChunkCreateMany.mockResolvedValue({ count: 2 });
    mockChunkDeleteMany.mockResolvedValue({ count: 0 });
    mockChunkUpdateMany.mockResolvedValue({ count: 0 });
    mockChunkCount.mockResolvedValue(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));

    // Default transaction — just execute the callback
    mockTransaction.mockImplementation(async (fnOrArgs: any, _opts?: any) => {
      if (typeof fnOrArgs === "function") {
        return fnOrArgs({
          documentChunk: {
            updateMany: mockChunkUpdateMany,
            createMany: mockChunkCreateMany,
          },
        });
      }
      return undefined;
    });

    // Env defaults for test isolation
    delete process.env.INDEXING_STRICT_FAIL_CLOSED;
    process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY = "false";
    delete process.env.EMBEDDING_FAILCLOSE_V1;
    delete process.env.INDEXING_ENFORCE_ENCRYPTED_ONLY;
    delete process.env.INDEXING_ENFORCE_CHUNK_METADATA;
  });

  /* ================================================================ */
  /*  1. Throws on empty documentId                                   */
  /* ================================================================ */
  test("throws on empty documentId", async () => {
    await expect(
      storeDocumentEmbeddings("", makeChunks(1)),
    ).rejects.toThrow("documentId is required");
  });

  /* ================================================================ */
  /*  2. Throws on empty chunks array                                 */
  /* ================================================================ */
  test("throws on empty chunks array", async () => {
    await expect(
      storeDocumentEmbeddings(DOC_ID, []),
    ).rejects.toThrow(/No chunks provided/);
  });

  /* ================================================================ */
  /*  3. Filters chunks below minContentChars                         */
  /* ================================================================ */
  test("filters chunks below minContentChars", async () => {
    const chunks = [
      {
        chunkIndex: 0,
        content: "ab",
        metadata: { chunkType: "text", sourceType: "text", sectionId: "sec:short" },
      }, // too short (< 8)
      {
        chunkIndex: 1,
        content: "This is a valid chunk with enough characters",
        metadata: { chunkType: "text", sourceType: "text", sectionId: "sec:valid" },
      },
    ];
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(1));
    mockChunkCount.mockResolvedValue(1);

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    // Only 1 chunk should have been processed (the valid one)
    expect(mockGenerateBatchEmbeddings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("valid chunk"),
      ]),
    );
    const calledTexts = mockGenerateBatchEmbeddings.mock.calls[0][0] as string[];
    expect(calledTexts).toHaveLength(1);
  });

  /* ================================================================ */
  /*  4. Deduplicates chunks by chunkIndex                            */
  /* ================================================================ */
  test("deduplicates chunks by chunkIndex", async () => {
    const chunks = [
      {
        chunkIndex: 0,
        content: "first occurrence is long enough to pass",
        metadata: { chunkType: "text", sourceType: "text", sectionId: "sec:first" },
      },
      {
        chunkIndex: 0,
        content: "duplicate chunkIndex also long enough",
        metadata: { chunkType: "text", sourceType: "text", sectionId: "sec:dup" },
      },
      {
        chunkIndex: 1,
        content: "second chunk content is also valid here",
        metadata: { chunkType: "text", sourceType: "text", sectionId: "sec:second" },
      },
    ];
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));
    mockChunkCount.mockResolvedValue(2);

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    // Should dedupe to 2 chunks (first occurrence of chunkIndex 0 + chunkIndex 1)
    const calledTexts = mockGenerateBatchEmbeddings.mock.calls[0][0] as string[];
    expect(calledTexts).toHaveLength(2);
    expect(calledTexts[0]).toContain("first occurrence");
  });

  /* ================================================================ */
  /*  5. Calls embedding.generateBatchEmbeddings with chunk content   */
  /* ================================================================ */
  test("calls generateBatchEmbeddings with chunk content", async () => {
    const chunks = makeChunks(3);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(3));
    mockChunkCount.mockResolvedValue(3);

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    expect(mockGenerateBatchEmbeddings).toHaveBeenCalledTimes(1);
    const texts = mockGenerateBatchEmbeddings.mock.calls[0][0] as string[];
    expect(texts).toHaveLength(3);
    texts.forEach((t) => expect(typeof t).toBe("string"));
  });

  /* ================================================================ */
  /*  6. Updates chunk counters without mutating indexing state          */
  /* ================================================================ */
  test("updates chunksCount/embeddingsGenerated without setting indexingState", async () => {
    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    // Last document.update call should update counters only.
    const updateCalls = mockDocumentUpdate.mock.calls;
    const lastUpdateData = updateCalls[updateCalls.length - 1][0].data;
    expect(lastUpdateData.chunksCount).toBe(2);
    expect(lastUpdateData.embeddingsGenerated).toBe(true);
    expect(lastUpdateData.indexingState).toBeUndefined();
    expect(lastUpdateData.status).toBeUndefined();
  });

  /* ================================================================ */
  /*  7. Pre-deletes old vectors via pinecone before upserting         */
  /* ================================================================ */
  test("pre-deletes old vectors via pinecone before upserting", async () => {
    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      preDeleteVectors: true,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    // Pre-delete should happen before upsert
    expect(mockPineconeDeleteDocumentEmbeddings).toHaveBeenCalledTimes(1);
    expect(mockPineconeDeleteDocumentEmbeddings).toHaveBeenCalledWith(
      DOC_ID,
      { userId: USER_ID },
    );

    // Verify order: delete called before upsert
    const deleteOrder =
      mockPineconeDeleteDocumentEmbeddings.mock.invocationCallOrder[0];
    const upsertOrder =
      mockUpsertDocumentEmbeddings.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(upsertOrder);
  });

  /* ================================================================ */
  /*  8. Stores chunks in Postgres                                    */
  /* ================================================================ */
  test("stores chunks in Postgres via transaction", async () => {
    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // Within the transaction, previous active rows are deactivated and new chunks are created.
    expect(mockChunkUpdateMany).toHaveBeenCalled();
    expect(mockChunkCreateMany).toHaveBeenCalled();
  });

  test("persists table metadata fields into document chunks", async () => {
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(1));
    const chunks = [
      {
        chunkIndex: 0,
        content: "Revenue / Jan = $125.00",
        metadata: {
          chunkType: "cell_fact",
          sourceType: "xlsx",
          sectionId: "sec:sheet1|row:revenue|col:jan",
          tableChunkForm: "cell_centric",
          tableId: "sheet:Sheet1",
          sheetName: "Sheet1",
          rowLabel: "Revenue",
          colHeader: "Jan",
          rowIndex: 2,
          columnIndex: 3,
          valueRaw: "$125.00",
          unitRaw: "$",
          unitNormalized: "currency_usd",
          numericValue: 125,
          scaleRaw: "thousands",
          scaleMultiplier: 1000,
        },
      },
    ];

    await storeDocumentEmbeddings(DOC_ID, chunks as any, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    const chunkCreatePayload = mockChunkCreateMany.mock.calls[0][0].data[0];
    expect(chunkCreatePayload.tableChunkForm).toBe("cell_centric");
    expect(chunkCreatePayload.tableId).toBe("sheet:Sheet1");
    expect(chunkCreatePayload.sheetName).toBe("Sheet1");
    expect(chunkCreatePayload.rowLabel).toBe("Revenue");
    expect(chunkCreatePayload.colHeader).toBe("Jan");
    expect(chunkCreatePayload.rowIndex).toBe(2);
    expect(chunkCreatePayload.columnIndex).toBe(3);
    expect(chunkCreatePayload.unitNormalized).toBe("currency_usd");
    expect(chunkCreatePayload.numericValue).toBe(125);
    expect(chunkCreatePayload.scaleRaw).toBe("thousands");
    expect(chunkCreatePayload.scaleMultiplier).toBe(1000);
  });

  test("marks metadata isLatestVersion false when a newer revision exists", async () => {
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(1));
    mockDocumentFindMany.mockResolvedValue([
      {
        id: DOC_ID,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "doc-rev-2",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);

    await storeDocumentEmbeddings(
      DOC_ID,
      [{
        chunkIndex: 0,
        content: "chunk body content long enough",
        metadata: { chunkType: "text", sourceType: "text", sectionId: "sec:body" },
      }],
      {
        maxRetries: 1,
        strictVerify: false,
        encryptionMode: "plaintext",
      },
    );

    const pineconeChunks = mockUpsertDocumentEmbeddings.mock.calls[0][3];
    expect(pineconeChunks[0].metadata.isLatestVersion).toBe(false);

    const pineconeMetadata = pineconeChunks[0].metadata;
    expect(pineconeMetadata.versionId).toBe(DOC_ID);
  });

  /* ================================================================ */
  /*  9. Handles encryption mode                                      */
  /* ================================================================ */
  test("handles encryption mode by storing encrypted text", async () => {
    const chunks = makeChunks(1);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(1));
    mockChunkCount.mockResolvedValue(1);

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "encrypted_only",
    });

    // Chunk records should have textEncrypted and text=null
    const txCallback = mockTransaction.mock.calls[0][0] as Function;
    const mockTx = {
      documentChunk: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    await txCallback(mockTx);

    const chunkData = mockTx.documentChunk.createMany.mock.calls[0][0].data;
    expect(chunkData[0].text).toBeNull();
    expect(chunkData[0].textEncrypted).toBe("encrypted-payload");
    expect(chunkData[0].metadataEncrypted).toBe("encrypted-payload");
  });

  /* ================================================================ */
  /*  10. Retries on transient failure with backoff                    */
  /* ================================================================ */
  test("retries on transient failure", async () => {
    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));

    // First attempt fails, second succeeds
    let callCount = 0;
    mockTransaction.mockImplementation(async (fn: any) => {
      callCount++;
      if (callCount === 1) {
        throw new Error("transient DB error");
      }
      return fn({
        documentChunk: {
          updateMany: mockChunkUpdateMany,
          createMany: mockChunkCreateMany,
        },
      });
    });

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 2,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    expect(callCount).toBe(2);
  });

  /* ================================================================ */
  /*  11. Does not write indexingState on terminal failure             */
  /* ================================================================ */
  test("does not set indexingState on terminal failure", async () => {
    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));
    mockTransaction.mockRejectedValue(new Error("permanent failure"));

    await expect(
      storeDocumentEmbeddings(DOC_ID, chunks, {
        maxRetries: 1,
        strictVerify: false,
        encryptionMode: "plaintext",
      }),
    ).rejects.toThrow(/Failed to store embeddings/);

    const updatePayloads = mockDocumentUpdate.mock.calls.map((call) => call[0].data);
    for (const payload of updatePayloads) {
      expect(payload.indexingState).toBeUndefined();
      expect(payload.status).toBeUndefined();
    }
  });

  /* ================================================================ */
  /*  12. Rolls back Pinecone on failure after successful upsert       */
  /* ================================================================ */
  test("rolls back Pinecone on failure after successful upsert", async () => {
    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));

    // Pinecone upsert succeeds, but transaction fails
    mockUpsertDocumentEmbeddings.mockResolvedValue(undefined);
    mockTransaction.mockRejectedValue(new Error("pg failure"));

    await expect(
      storeDocumentEmbeddings(DOC_ID, chunks, {
        maxRetries: 1,
        strictVerify: false,
        encryptionMode: "plaintext",
      }),
    ).rejects.toThrow();

    // After failure, should rollback Pinecone vectors by operation id
    expect(mockDeleteEmbeddingsByOperationId).toHaveBeenCalledWith(
      DOC_ID,
      expect.any(String),
      { userId: USER_ID },
    );
  });

  /* ================================================================ */
  /*  13. generateEmbedding delegates to embeddingService              */
  /* ================================================================ */
  test("generateEmbedding delegates to embeddingService", async () => {
    mockGenerateEmbeddingSingle.mockResolvedValue({
      embedding: [0.5, 0.6, 0.7],
      dimensions: 3,
      model: "text-embedding-3-small",
    });

    const result = await generateEmbedding("test text");

    expect(mockGenerateEmbeddingSingle).toHaveBeenCalledWith("test text");
    expect(result).toEqual([0.5, 0.6, 0.7]);
  });

  /* ================================================================ */
  /*  14. deleteDocumentEmbeddings removes from Pinecone and Postgres  */
  /* ================================================================ */
  test("deleteDocumentEmbeddings removes from Pinecone and Postgres", async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      return fn({
        documentChunk: {
          deleteMany: mockChunkDeleteMany,
        },
      });
    });

    await deleteDocumentEmbeddings(DOC_ID);

    expect(mockPineconeDeleteDocumentEmbeddings).toHaveBeenCalledWith(DOC_ID, {
      userId: USER_ID,
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  /* ================================================================ */
  /*  15. Skips Pinecone ops when unavailable (not strict mode)        */
  /* ================================================================ */
  test("skips Pinecone operations when unavailable in non-strict mode", async () => {
    process.env.INDEXING_STRICT_FAIL_CLOSED = "false";

    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));
    mockPineconeIsAvailable.mockReturnValue(false);

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    // Pinecone upsert should be skipped
    expect(mockUpsertDocumentEmbeddings).not.toHaveBeenCalled();
    // Postgres should still be called
    expect(mockTransaction).toHaveBeenCalled();
  });

  /* ================================================================ */
  /*  16. Verifies DB counts when verifyAfterStore is true             */
  /* ================================================================ */
  test("verifies DB counts when verifyAfterStore is true", async () => {
    process.env.INDEXING_STRICT_FAIL_CLOSED = "false";

    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));
    mockChunkCount.mockResolvedValue(2);

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      verifyAfterStore: true,
      strictVerify: false,
      encryptionMode: "plaintext",
    });

    expect(mockChunkCount).toHaveBeenCalledWith({
      where: {
        documentId: DOC_ID,
        isActive: true,
        indexingOperationId: expect.any(String),
      },
    });
  });

  test("fails closed when encrypted-only policy is enabled and plaintext mode is requested", async () => {
    process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY = "true";
    process.env.INDEXING_ENFORCE_ENCRYPTED_ONLY = "true";

    await expect(
      storeDocumentEmbeddings(DOC_ID, makeChunks(1), {
        maxRetries: 1,
        strictVerify: false,
        encryptionMode: "plaintext",
      }),
    ).rejects.toThrow(/plaintext embedding mode is not allowed/i);
  });

  test("fails when required chunk metadata is missing", async () => {
    process.env.INDEXING_ENFORCE_CHUNK_METADATA = "true";
    const chunks = [
      {
        chunkIndex: 0,
        content: "valid length chunk but no metadata",
        metadata: {},
      },
    ];
    await expect(
      storeDocumentEmbeddings(DOC_ID, chunks as any, {
        maxRetries: 1,
        strictVerify: false,
        encryptionMode: "plaintext",
      }),
    ).rejects.toThrow(/Chunk metadata invariant failed/i);
  });

  /* ================================================================ */
  /*  Pinecone receives empty content + contentHash in encrypted mode  */
  /* ================================================================ */
  test("strips plaintext from Pinecone payload when encrypted-only", async () => {
    process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY = "true";

    const chunks = makeChunks(2);
    mockGenerateBatchEmbeddings.mockResolvedValue(makeBatchResult(2));
    mockChunkCount.mockResolvedValue(2);

    await storeDocumentEmbeddings(DOC_ID, chunks, {
      maxRetries: 1,
      strictVerify: false,
      encryptionMode: "encrypted_only",
    });

    expect(mockUpsertDocumentEmbeddings).toHaveBeenCalled();
    const pineconeChunks = mockUpsertDocumentEmbeddings.mock.calls[0][3] as any[];
    for (const pc of pineconeChunks) {
      expect(pc.content).toBe("");
      expect(pc.metadata.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
