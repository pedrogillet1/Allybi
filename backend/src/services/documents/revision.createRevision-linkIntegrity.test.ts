import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockUploadFile = jest.fn();
const mockAddDocumentJob = jest.fn();
const mockDocumentFindFirst = jest.fn();
const mockDocumentFindUnique = jest.fn();
const mockTransaction = jest.fn();
const mockTxDocumentCount = jest.fn();
const mockTxDocumentCreate = jest.fn();
const mockTxDocumentLinkUpsert = jest.fn();

jest.mock("../../config/storage", () => ({
  uploadFile: (...args: any[]) => mockUploadFile(...args),
}));

jest.mock("../../queues/document.queue", () => ({
  addDocumentJob: (...args: any[]) => mockAddDocumentJob(...args),
}));

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findFirst: (...args: any[]) => mockDocumentFindFirst(...args),
      findUnique: (...args: any[]) => mockDocumentFindUnique(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

import RevisionService from "./revision.service";

describe("RevisionService.createRevision link integrity", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockDocumentFindFirst.mockResolvedValue({
      id: "doc-root",
      userId: "user-1",
      folderId: "folder-1",
      filename: "contract.pdf",
      encryptedFilename: "users/user-1/files/contract.pdf",
      mimeType: "application/pdf",
      parentVersionId: null,
    });
    mockDocumentFindUnique.mockResolvedValue({
      id: "doc-root",
      parentVersionId: null,
    });
    mockTxDocumentCount.mockResolvedValue(1);
    mockTxDocumentCreate.mockResolvedValue({
      id: "doc-rev-2",
      filename: "contract (rev 1).pdf",
      mimeType: "application/pdf",
      fileSize: 11,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    mockTxDocumentLinkUpsert.mockResolvedValue({
      id: "link-1",
    });
    mockTransaction.mockImplementation(async (fn: any) =>
      fn({
        document: {
          count: (...args: any[]) => mockTxDocumentCount(...args),
          create: (...args: any[]) => mockTxDocumentCreate(...args),
        },
        documentLink: {
          upsert: (...args: any[]) => mockTxDocumentLinkUpsert(...args),
        },
      }),
    );
  });

  test("creates revision and persists amends link in the same transaction", async () => {
    const service = new RevisionService();

    const result = await service.createRevision({
      userId: "user-1",
      sourceDocumentId: "doc-root",
      contentBuffer: Buffer.from("hello world"),
      reason: "manual-edit",
    });

    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(mockTxDocumentCreate).toHaveBeenCalledTimes(1);
    expect(mockTxDocumentLinkUpsert).toHaveBeenCalledTimes(1);
    expect(mockAddDocumentJob).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("doc-rev-2");
    expect(result.rootDocumentId).toBe("doc-root");
  });

  test("fails revision creation when link persistence fails", async () => {
    mockTxDocumentLinkUpsert.mockRejectedValue(new Error("link write failed"));
    const service = new RevisionService();

    await expect(
      service.createRevision({
        userId: "user-1",
        sourceDocumentId: "doc-root",
        contentBuffer: Buffer.from("hello world"),
        reason: "manual-edit",
      }),
    ).rejects.toThrow(/link write failed/);

    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(mockAddDocumentJob).not.toHaveBeenCalled();
  });
});
