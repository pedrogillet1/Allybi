import { describe, expect, jest, test, beforeEach } from "@jest/globals";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockUploadFile = jest.fn();
const mockDownloadFile = jest.fn();
const mockDocumentFindFirst = jest.fn();
const mockDocumentFindMany = jest.fn();
const mockDocumentFindUnique = jest.fn();
const mockDocumentUpdate = jest.fn();
const mockDocumentChunkUpdateMany = jest.fn();
const mockDocumentMetadataFindUnique = jest.fn();
const mockDocumentMetadataUpsert = jest.fn();
const mockDocumentMetadataDeleteMany = jest.fn();
const mockDocumentProcessingMetricsDeleteMany = jest.fn();
const mockTransaction = jest.fn();
jest.mock("../../config/storage", () => ({
  uploadFile: (...args: any[]) => mockUploadFile(...args),
  downloadFile: (...args: any[]) => mockDownloadFile(...args),
}));

jest.mock("../cache.service", () => ({
  __esModule: true,
  default: { del: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("../../queues/document.queue", () => ({
  addDocumentJob: jest.fn(),
  processDocumentJobData: jest.fn(),
}));

jest.mock("../jobs/pubsubPublisher.service", () => ({
  isPubSubAvailable: jest.fn(() => false),
  publishExtractJob: jest.fn(),
}));

const mockCreateRevision = jest.fn();
jest.mock("../documents/revision.service", () => ({
  __esModule: true,
  RevisionService: jest.fn().mockImplementation(() => ({
    createRevision: (...args: any[]) => mockCreateRevision(...args),
  })),
  default: jest.fn().mockImplementation(() => ({
    createRevision: (...args: any[]) => mockCreateRevision(...args),
  })),
}));

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findFirst: (...args: any[]) => mockDocumentFindFirst(...args),
      findMany: (...args: any[]) => mockDocumentFindMany(...args),
      findUnique: (...args: any[]) => mockDocumentFindUnique(...args),
      update: (...args: any[]) => mockDocumentUpdate(...args),
    },
    documentChunk: {
      updateMany: (...args: any[]) => mockDocumentChunkUpdateMany(...args),
    },
    documentMetadata: {
      findUnique: (...args: any[]) => mockDocumentMetadataFindUnique(...args),
      upsert: (...args: any[]) => mockDocumentMetadataUpsert(...args),
      deleteMany: (...args: any[]) => mockDocumentMetadataDeleteMany(...args),
    },
    documentProcessingMetrics: {
      deleteMany: (...args: any[]) =>
        mockDocumentProcessingMetricsDeleteMany(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

import { DocumentRevisionStoreService } from "./documentRevisionStore.service";

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

describe("DocumentRevisionStoreService overwrite safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.KODA_EDITING_SAVE_MODE = "overwrite";
    process.env.KODA_EDITING_ENABLE_OVERWRITE = "true";
    process.env.KEEP_UNDO_HISTORY = "true";
    process.env.NODE_ENV = "test";
    delete process.env.KODA_EDITING_ALLOW_OVERWRITE_PROTECTED;
    mockDocumentFindFirst.mockResolvedValue({
      id: "doc-123",
      encryptedFilename: "storage/doc-123.pdf",
      filename: "doc.pdf",
      mimeType: "application/pdf",
      fileHash: "before-hash",
      parentVersionId: null,
    });
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-123",
      parentVersionId: null,
    });
    mockDocumentFindMany.mockResolvedValue([
      {
        id: "doc-123",
        encryptedFilename: "storage/doc-123.pdf",
        filename: "doc.pdf",
        mimeType: "application/pdf",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "rev-1",
        encryptedFilename: "storage/rev-1.pdf",
        filename: "doc.pdf",
        mimeType: "application/pdf",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);
    mockDocumentUpdate.mockResolvedValue({});
    mockDocumentChunkUpdateMany.mockResolvedValue({ count: 1 });
    mockDocumentMetadataFindUnique.mockResolvedValue({ pptxMetadata: null });
    mockDocumentMetadataUpsert.mockResolvedValue({});
    mockDocumentMetadataDeleteMany.mockResolvedValue({ count: 1 });
    mockDocumentProcessingMetricsDeleteMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(async (arg: any) => {
      if (typeof arg === "function") {
        return arg({
          documentChunk: { updateMany: mockDocumentChunkUpdateMany },
          documentMetadata: {
            findUnique: mockDocumentMetadataFindUnique,
            upsert: mockDocumentMetadataUpsert,
            deleteMany: mockDocumentMetadataDeleteMany,
          },
          documentProcessingMetrics: {
            deleteMany: mockDocumentProcessingMetricsDeleteMany,
          },
          document: { update: mockDocumentUpdate },
        });
      }
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg;
    });
  });

  test("uploadFile is NOT called when backup createRevision throws", async () => {
    mockCreateRevision.mockRejectedValue(new Error("storage unavailable"));
    mockDownloadFile.mockResolvedValue(Buffer.from("original bytes"));

    const service = new DocumentRevisionStoreService();

    // We can't easily call the full applyAndSave method without extensive
    // mocking of the operator pipeline, so we verify the pattern by calling
    // the undo path which has the same safeguard.
    await expect(
      service.undoToRevision({
        documentId: "doc-123",
        userId: "user-456",
      }),
    ).rejects.toThrow(/BACKUP_FAILED/);

    // The critical assertion: uploadFile must never be called if backup failed
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  test("storeEditedBuffer is blocked when overwrite is not globally enabled", async () => {
    process.env.KODA_EDITING_ENABLE_OVERWRITE = "false";
    mockCreateRevision.mockResolvedValue({ id: "backup-1" });
    mockDownloadFile.mockResolvedValue(Buffer.from("original bytes"));

    const service = new DocumentRevisionStoreService();

    await expect(
      service.storeEditedBuffer({
        documentId: "doc-123",
        userId: "user-456",
        editedBuffer: Buffer.from("edited bytes"),
        operator: "EXPORT_SLIDES",
      }),
    ).rejects.toThrow(/OVERWRITE_DISABLED/);

    expect(mockCreateRevision).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  test("storeEditedBuffer blocks overwrite when backup creation fails", async () => {
    mockCreateRevision.mockRejectedValue(new Error("storage unavailable"));
    mockDownloadFile.mockResolvedValue(Buffer.from("original bytes"));

    const service = new DocumentRevisionStoreService();

    await expect(
      service.storeEditedBuffer({
        documentId: "doc-123",
        userId: "user-456",
        editedBuffer: Buffer.from("edited bytes"),
        operator: "EXPORT_SLIDES",
        metadata: { source: "pptx_studio" },
      }),
    ).rejects.toThrow(/BACKUP_FAILED/);

    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  test("storeEditedBuffer proceeds only after backup creation succeeds", async () => {
    mockCreateRevision.mockResolvedValue({ id: "backup-1" });
    mockDownloadFile.mockResolvedValue(Buffer.from("original bytes"));

    const service = new DocumentRevisionStoreService();

    const result = await service.storeEditedBuffer({
      documentId: "doc-123",
      userId: "user-456",
      editedBuffer: Buffer.from("edited bytes"),
      operator: "EXPORT_SLIDES",
      metadata: { source: "pptx_studio" },
    });

    expect(mockCreateRevision).toHaveBeenCalledTimes(1);
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(result.revisionId).toBe("doc-123");
  });

  test("storeEditedBuffer is blocked in protected envs unless explicit override is enabled", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.KODA_EDITING_ALLOW_OVERWRITE_PROTECTED;

    mockCreateRevision.mockResolvedValue({ id: "backup-1" });
    mockDownloadFile.mockResolvedValue(Buffer.from("original bytes"));

    const service = new DocumentRevisionStoreService();

    await expect(
      service.storeEditedBuffer({
        documentId: "doc-123",
        userId: "user-456",
        editedBuffer: Buffer.from("edited bytes"),
        operator: "EXPORT_SLIDES",
      }),
    ).rejects.toThrow(/OVERWRITE_DISABLED_IN_PROTECTED_ENV/);

    expect(mockCreateRevision).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  test("storeEditedBuffer rolls storage back when prisma persistence fails", async () => {
    mockCreateRevision.mockResolvedValue({ id: "backup-1" });
    mockDownloadFile.mockResolvedValue(Buffer.from("original bytes"));
    mockTransaction.mockRejectedValue(new Error("db transaction failed"));

    const service = new DocumentRevisionStoreService();

    await expect(
      service.storeEditedBuffer({
        documentId: "doc-123",
        userId: "user-456",
        editedBuffer: Buffer.from("edited bytes"),
        operator: "EXPORT_SLIDES",
      }),
    ).rejects.toThrow(/STORE_BUFFER_PERSISTENCE_FAILED_RECOVERED/);

    // first upload = edited bytes, second upload = rollback to original bytes
    expect(mockUploadFile).toHaveBeenCalledTimes(2);
  });
});
