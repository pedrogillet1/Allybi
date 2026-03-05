import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockDocumentCreate = jest.fn();
const mockDocumentCreateMany = jest.fn();
const mockDocumentUpdateMany = jest.fn();
const mockDocumentFindFirst = jest.fn();
const mockDocumentMetadataUpsert = jest.fn();
const mockDocumentMetadataUpdate = jest.fn();
const mockFolderFindFirst = jest.fn();
const mockFolderFindMany = jest.fn();
const mockUserUpdate = jest.fn();
const mockTransaction = jest.fn();

const mockTxDocumentFindMany = jest.fn();
const mockTxDocumentUpdateMany = jest.fn();
const mockTxDocumentFindFirst = jest.fn();
const mockTxUserUpdate = jest.fn();

jest.mock("../../platform/db/prismaClient", () => ({
  __esModule: true,
  default: {
    document: {
      create: (...args: any[]) => mockDocumentCreate(...args),
      createMany: (...args: any[]) => mockDocumentCreateMany(...args),
      updateMany: (...args: any[]) => mockDocumentUpdateMany(...args),
      findFirst: (...args: any[]) => mockDocumentFindFirst(...args),
    },
    folder: {
      findFirst: (...args: any[]) => mockFolderFindFirst(...args),
      findMany: (...args: any[]) => mockFolderFindMany(...args),
    },
    user: {
      update: (...args: any[]) => mockUserUpdate(...args),
    },
    documentMetadata: {
      upsert: (...args: any[]) => mockDocumentMetadataUpsert(...args),
      update: (...args: any[]) => mockDocumentMetadataUpdate(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

import { documentUploadWriteService } from "./documentUploadWrite.service";

describe("documentUploadWriteService", () => {
  beforeEach(() => {
    mockDocumentCreate.mockReset();
    mockDocumentCreateMany.mockReset();
    mockDocumentUpdateMany.mockReset();
    mockDocumentFindFirst.mockReset();
    mockDocumentMetadataUpsert.mockReset();
    mockDocumentMetadataUpdate.mockReset();
    mockFolderFindFirst.mockReset();
    mockFolderFindMany.mockReset();
    mockUserUpdate.mockReset();
    mockTransaction.mockReset();
    mockTxDocumentFindMany.mockReset();
    mockTxDocumentUpdateMany.mockReset();
    mockTxDocumentFindFirst.mockReset();
    mockTxUserUpdate.mockReset();

    mockTransaction.mockImplementation(async (arg: any) => {
      const tx = {
        document: {
          findMany: (...args: any[]) => mockTxDocumentFindMany(...args),
          updateMany: (...args: any[]) => mockTxDocumentUpdateMany(...args),
          findFirst: (...args: any[]) => mockTxDocumentFindFirst(...args),
        },
        user: {
          update: (...args: any[]) => mockTxUserUpdate(...args),
        },
      };
      if (typeof arg === "function") return arg(tx);
      return null;
    });
  });

  test("createUploadingDocument rejects non-owned folder", async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    await expect(
      documentUploadWriteService.createUploadingDocument({
        id: "d-1",
        userId: "u-1",
        folderId: "foreign-folder",
        filename: "x.pdf",
        encryptedFilename: "users/u-1/docs/d-1/x.pdf",
        fileSize: 10,
        mimeType: "application/pdf",
        fileHash: "hash",
      }),
    ).rejects.toThrow("Folder not found");

    expect(mockDocumentCreate).not.toHaveBeenCalled();
  });

  test("createUploadingDocumentsBulk rejects when any folder is not owned", async () => {
    mockFolderFindMany.mockResolvedValue([{ id: "owned-folder" }]);

    await expect(
      documentUploadWriteService.createUploadingDocumentsBulk("u-1", [
        {
          id: "d-1",
          folderId: "owned-folder",
          filename: "a.pdf",
          encryptedFilename: "users/u-1/docs/d-1/a.pdf",
          fileSize: 10,
          mimeType: "application/pdf",
          fileHash: "h1",
        },
        {
          id: "d-2",
          folderId: "foreign-folder",
          filename: "b.pdf",
          encryptedFilename: "users/u-1/docs/d-2/b.pdf",
          fileSize: 20,
          mimeType: "application/pdf",
          fileHash: "h2",
        },
      ]),
    ).rejects.toThrow("Folder not found");

    expect(mockDocumentCreateMany).not.toHaveBeenCalled();
  });

  test("transitionUploadingToUploadedBatch increments storage by transitioned bytes", async () => {
    mockTxDocumentFindMany.mockResolvedValue([
      { id: "d-1", fileSize: 100 },
      { id: "d-2", fileSize: 300 },
    ]);
    mockTxDocumentUpdateMany.mockResolvedValue({ count: 2 });
    mockTxUserUpdate.mockResolvedValue({});

    const count =
      await documentUploadWriteService.transitionUploadingToUploadedBatch({
        userId: "u-1",
        documentIds: ["d-1", "d-2"],
      });

    expect(count).toBe(2);
    expect(mockTxUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-1" },
        data: { storageUsedBytes: { increment: 400 } },
      }),
    );
  });

  test("transitionUploadingToUploadedSingle increments storage only when transitioned", async () => {
    mockTxDocumentFindFirst.mockResolvedValue({ fileSize: 256 });
    mockTxDocumentUpdateMany.mockResolvedValue({ count: 1 });
    mockTxUserUpdate.mockResolvedValue({});

    const count =
      await documentUploadWriteService.transitionUploadingToUploadedSingle({
        userId: "u-1",
        documentId: "d-1",
      });

    expect(count).toBe(1);
    expect(mockTxUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-1" },
        data: { storageUsedBytes: { increment: 256 } },
      }),
    );
  });

  test("markUploadedPendingById requires user ownership context", async () => {
    mockTxDocumentFindFirst.mockResolvedValue({ fileSize: 50 });
    mockTxDocumentUpdateMany.mockResolvedValue({ count: 1 });
    mockTxUserUpdate.mockResolvedValue({});

    const count = await documentUploadWriteService.markUploadedPendingById({
      userId: "u-1",
      documentId: "d-1",
    });

    expect(count).toBe(1);
    expect(mockTxDocumentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "d-1",
          userId: "u-1",
          status: "uploading",
        }),
      }),
    );
  });

  test("markQueueSchedulingFailed updates only owned document rows", async () => {
    mockDocumentUpdateMany.mockResolvedValue({ count: 1 });

    const count = await documentUploadWriteService.markQueueSchedulingFailed({
      userId: "u-1",
      documentId: "d-1",
      queueMessage: "queue down",
    });

    expect(count).toBe(1);
    expect(mockDocumentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1", userId: "u-1" },
        data: expect.objectContaining({
          status: "uploaded",
          indexingState: "failed",
        }),
      }),
    );
  });

  test("updateDocumentFieldsForUser returns null when no fields are provided", async () => {
    const result = await documentUploadWriteService.updateDocumentFieldsForUser({
      userId: "u-1",
      documentId: "d-1",
    });

    expect(result).toBeNull();
    expect(mockDocumentUpdateMany).not.toHaveBeenCalled();
  });

  test("updateDocumentFieldsForUser enforces ownership via updateMany", async () => {
    mockDocumentUpdateMany.mockResolvedValue({ count: 0 });

    const result = await documentUploadWriteService.updateDocumentFieldsForUser({
      userId: "u-1",
      documentId: "d-1",
      filename: "new.pdf",
    });

    expect(result).toBeNull();
    expect(mockDocumentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1", userId: "u-1" },
        data: { filename: "new.pdf" },
      }),
    );
  });

  test("updateDocumentFieldsForUser rejects non-owned folder assignment", async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    await expect(
      documentUploadWriteService.updateDocumentFieldsForUser({
        userId: "u-1",
        documentId: "d-1",
        folderId: "foreign-folder",
      }),
    ).rejects.toThrow("Folder not found");
  });

  test("updateDocumentFieldsForUser returns refreshed row when update succeeds", async () => {
    const row = { id: "d-1", filename: "new.pdf", folder: { path: "/a" } };
    mockDocumentUpdateMany.mockResolvedValue({ count: 1 });
    mockDocumentFindFirst.mockResolvedValue(row);

    const result = await documentUploadWriteService.updateDocumentFieldsForUser({
      userId: "u-1",
      documentId: "d-1",
      filename: "new.pdf",
      displayTitle: "New Title",
    });

    expect(result).toEqual(row);
    expect(mockDocumentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1", userId: "u-1" },
      }),
    );
  });

  test("resetForReprocess updates guarded by user ownership", async () => {
    mockDocumentUpdateMany.mockResolvedValue({ count: 1 });
    const at = new Date("2026-03-05T00:00:00.000Z");

    const count = await documentUploadWriteService.resetForReprocess({
      userId: "u-1",
      documentId: "d-1",
      at,
    });

    expect(count).toBe(1);
    expect(mockDocumentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1", userId: "u-1" },
        data: expect.objectContaining({
          status: "uploaded",
          indexingState: "pending",
          indexingError: null,
          indexingUpdatedAt: at,
          error: null,
        }),
      }),
    );
  });

  test("upsertDocumentMetadata writes update/create payloads", async () => {
    mockDocumentMetadataUpsert.mockResolvedValue({ documentId: "d-1" });

    await documentUploadWriteService.upsertDocumentMetadata({
      documentId: "d-1",
      update: { markdownContent: "body" },
      create: { markdownContent: "body" },
    });

    expect(mockDocumentMetadataUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId: "d-1" },
        update: { markdownContent: "body" },
        create: expect.objectContaining({
          documentId: "d-1",
          markdownContent: "body",
        }),
      }),
    );
  });

  test("updateDocumentMetadata updates by documentId", async () => {
    mockDocumentMetadataUpdate.mockResolvedValue({ documentId: "d-1" });

    await documentUploadWriteService.updateDocumentMetadata({
      documentId: "d-1",
      data: { slideGenerationStatus: "pending" },
    });

    expect(mockDocumentMetadataUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId: "d-1" },
        data: { slideGenerationStatus: "pending" },
      }),
    );
  });
});
