import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockDocumentFindFirst = jest.fn();
const mockDocumentUpdate = jest.fn();
const mockDocumentQueueAdd = jest.fn();
const mockPublishExtractJob = jest.fn();
const mockIsPubSubAvailable = jest.fn();

jest.mock("../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findFirst: (...args: any[]) => mockDocumentFindFirst(...args),
      update: (...args: any[]) => mockDocumentUpdate(...args),
    },
  },
}));

jest.mock("../queues/queueConfig", () => ({
  documentQueue: {
    add: (...args: any[]) => mockDocumentQueueAdd(...args),
  },
}));

jest.mock("../queues/document.queue", () => ({
  addDocumentJob: jest.fn(),
}));

jest.mock("../config/env", () => ({
  env: {
    USE_GCP_WORKERS: false,
  },
}));

jest.mock("./jobs/pubsubPublisher.service", () => ({
  isPubSubAvailable: (...args: any[]) => mockIsPubSubAvailable(...args),
  publishExtractJob: (...args: any[]) => mockPublishExtractJob(...args),
}));

import { PrismaDocumentService } from "./prismaDocument.service";

describe("PrismaDocumentService.reindex", () => {
  beforeEach(() => {
    mockDocumentFindFirst.mockReset();
    mockDocumentUpdate.mockReset();
    mockDocumentQueueAdd.mockReset();
    mockPublishExtractJob.mockReset();
    mockIsPubSubAvailable.mockReset();
    mockIsPubSubAvailable.mockReturnValue(false);
    mockDocumentUpdate.mockResolvedValue({});
    mockDocumentQueueAdd.mockResolvedValue({ id: "job-1" });
  });

  test("reindexes latest family revision ordered by createdAt desc", async () => {
    mockDocumentFindFirst
      .mockResolvedValueOnce({
        id: "doc-root",
        parentVersionId: null,
        filename: "contract-v1.pdf",
        mimeType: "application/pdf",
        encryptedFilename: "users/u/doc-root.pdf",
      })
      .mockResolvedValueOnce({
        id: "doc-rev-3",
        filename: "contract-v3.pdf",
        mimeType: "application/pdf",
        encryptedFilename: "users/u/doc-rev-3.pdf",
      });

    const svc = new PrismaDocumentService();
    const out = await svc.reindex({ userId: "user-1", documentId: "doc-root" });

    expect(out).toEqual({ status: "queued" });
    expect(mockDocumentFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          OR: [{ id: "doc-root" }, { parentVersionId: "doc-root" }],
        }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(mockDocumentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc-rev-3" },
        data: expect.objectContaining({
          status: "uploaded",
          indexingState: "pending",
          embeddingsGenerated: false,
          chunksCount: 0,
        }),
      }),
    );
    expect(mockDocumentQueueAdd).toHaveBeenCalledWith(
      "process-document",
      expect.objectContaining({
        documentId: "doc-rev-3",
        userId: "user-1",
      }),
      expect.objectContaining({
        jobId: expect.stringContaining("doc-doc-rev-3-reindex-"),
      }),
    );
  });

  test("throws when latest revision has no storage key", async () => {
    mockDocumentFindFirst
      .mockResolvedValueOnce({
        id: "doc-root",
        parentVersionId: null,
        filename: "contract-v1.pdf",
        mimeType: "application/pdf",
        encryptedFilename: "users/u/doc-root.pdf",
      })
      .mockResolvedValueOnce({
        id: "doc-rev-4",
        filename: "contract-v4.pdf",
        mimeType: "application/pdf",
        encryptedFilename: null,
      });

    const svc = new PrismaDocumentService();

    await expect(
      svc.reindex({ userId: "user-1", documentId: "doc-root" }),
    ).rejects.toThrow("Document has no storage key");

    expect(mockDocumentUpdate).not.toHaveBeenCalled();
    expect(mockDocumentQueueAdd).not.toHaveBeenCalled();
  });
});
