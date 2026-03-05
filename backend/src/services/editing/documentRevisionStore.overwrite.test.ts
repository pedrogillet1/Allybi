import { describe, expect, jest, test, beforeEach } from "@jest/globals";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockUploadFile = jest.fn();
const mockDownloadFile = jest.fn();
const mockDocumentFindFirst = jest.fn();
const mockDocumentFindMany = jest.fn();
const mockDocumentFindUnique = jest.fn();
jest.mock("../../config/storage", () => ({
  uploadFile: (...args: any[]) => mockUploadFile(...args),
  downloadFile: (...args: any[]) => mockDownloadFile(...args),
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
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
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
    process.env.KEEP_UNDO_HISTORY = "true";
    mockDocumentFindFirst.mockResolvedValue({
      id: "doc-123",
      encryptedFilename: "storage/doc-123.pdf",
      filename: "doc.pdf",
      mimeType: "application/pdf",
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
});
