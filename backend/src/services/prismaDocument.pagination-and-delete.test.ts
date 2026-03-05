import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockDocumentFindMany = jest.fn();
const mockDocumentFindFirst = jest.fn();
const mockFolderFindFirst = jest.fn();
const mockTxDocumentFindFirst = jest.fn();
const mockTxDocumentDeleteMany = jest.fn();
const mockTxDocumentCreate = jest.fn();
const mockTxUserUpdate = jest.fn();
const mockTransaction = jest.fn();

jest.mock("../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: (...args: any[]) => mockDocumentFindMany(...args),
      findFirst: (...args: any[]) => mockDocumentFindFirst(...args),
    },
    folder: {
      findFirst: (...args: any[]) => mockFolderFindFirst(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

jest.mock("../queues/queueConfig", () => ({
  documentQueue: { add: jest.fn() },
}));

jest.mock("../queues/document.queue", () => ({
  addDocumentJob: jest.fn(),
}));

jest.mock("./jobs/pubsubPublisher.service", () => ({
  isPubSubAvailable: jest.fn(() => false),
  publishExtractJob: jest.fn(),
}));

jest.mock("../config/storage", () => ({
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),
  getSignedUrl: jest.fn(),
  deleteFile: jest.fn(),
}));

jest.mock("../config/env", () => ({
  env: { USE_GCP_WORKERS: false },
}));

jest.mock("./retrieval/vectorEmbedding.runtime.service", () => ({
  __esModule: true,
  default: {
    deleteDocumentEmbeddings: jest.fn().mockResolvedValue(undefined),
  },
}));

import { PrismaDocumentService } from "./prismaDocument.service";

function decodeCursor(cursor: string): { id: string; updatedAt: string } {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}

describe("PrismaDocumentService list/delete invariants", () => {
  beforeEach(() => {
    mockDocumentFindMany.mockReset();
    mockDocumentFindFirst.mockReset();
    mockFolderFindFirst.mockReset();
    mockTxDocumentFindFirst.mockReset();
    mockTxDocumentDeleteMany.mockReset();
    mockTxDocumentCreate.mockReset();
    mockTxUserUpdate.mockReset();
    mockTransaction.mockReset();
  });

  test("list returns a stable composite cursor and uses deterministic order", async () => {
    const rows = [
      {
        id: "doc-3",
        filename: "c.pdf",
        encryptedFilename: "users/u/docs/doc-3/c.pdf",
        mimeType: "application/pdf",
        fileSize: 30,
        displayTitle: null,
        folderId: null,
        folder: null,
        status: "uploaded",
        createdAt: new Date("2026-03-01T10:00:00.000Z"),
        updatedAt: new Date("2026-03-03T10:00:00.000Z"),
      },
      {
        id: "doc-2",
        filename: "b.pdf",
        encryptedFilename: "users/u/docs/doc-2/b.pdf",
        mimeType: "application/pdf",
        fileSize: 20,
        displayTitle: null,
        folderId: null,
        folder: null,
        status: "uploaded",
        createdAt: new Date("2026-03-01T09:00:00.000Z"),
        updatedAt: new Date("2026-03-03T09:00:00.000Z"),
      },
      {
        id: "doc-1",
        filename: "a.pdf",
        encryptedFilename: "users/u/docs/doc-1/a.pdf",
        mimeType: "application/pdf",
        fileSize: 10,
        displayTitle: null,
        folderId: null,
        folder: null,
        status: "uploaded",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-03T08:00:00.000Z"),
      },
    ];
    mockDocumentFindMany.mockResolvedValue(rows);

    const svc = new PrismaDocumentService();
    const result = await svc.list({ userId: "u-1", limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeTruthy();
    expect(decodeCursor(result.nextCursor!)).toEqual({
      id: "doc-2",
      updatedAt: "2026-03-03T09:00:00.000Z",
    });

    expect(mockDocumentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  test("list accepts legacy id-only cursor by resolving anchor row", async () => {
    mockDocumentFindFirst.mockResolvedValue({
      id: "doc-anchor",
      updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    });
    mockDocumentFindMany.mockResolvedValue([]);

    const svc = new PrismaDocumentService();
    await svc.list({ userId: "u-1", limit: 2, cursor: "doc-anchor" });

    expect(mockDocumentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ id: "doc-anchor" }]),
        }),
      }),
    );
    expect(mockDocumentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.any(Array),
            }),
          ]),
        }),
      }),
    );
  });

  test("delete skips user storage decrement when no owned document is deleted", async () => {
    mockTransaction.mockImplementation(async (arg: any) => {
      const tx = {
        document: {
          findFirst: (...args: any[]) => mockTxDocumentFindFirst(...args),
          deleteMany: (...args: any[]) => mockTxDocumentDeleteMany(...args),
        },
        user: {
          update: (...args: any[]) => mockTxUserUpdate(...args),
        },
      };
      if (typeof arg === "function") return arg(tx);
      return null;
    });
    mockTxDocumentFindFirst.mockResolvedValue(null);

    const svc = new PrismaDocumentService();
    const result = await svc.delete({ userId: "u-1", documentId: "doc-miss" });

    expect(result).toEqual({ deleted: true });
    expect(mockTxDocumentDeleteMany).not.toHaveBeenCalled();
    expect(mockTxUserUpdate).not.toHaveBeenCalled();
  });

  test("delete decrements storage after successful owned delete", async () => {
    mockTransaction.mockImplementation(async (arg: any) => {
      const tx = {
        document: {
          findFirst: (...args: any[]) => mockTxDocumentFindFirst(...args),
          deleteMany: (...args: any[]) => mockTxDocumentDeleteMany(...args),
        },
        user: {
          update: (...args: any[]) => mockTxUserUpdate(...args),
        },
      };
      if (typeof arg === "function") return arg(tx);
      return null;
    });
    mockTxDocumentFindFirst.mockResolvedValue({ fileSize: 256 });
    mockTxDocumentDeleteMany.mockResolvedValue({ count: 1 });
    mockTxUserUpdate.mockResolvedValue({});

    const svc = new PrismaDocumentService();
    const result = await svc.delete({ userId: "u-1", documentId: "doc-1" });

    expect(result).toEqual({ deleted: true });
    expect(mockTxUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-1" },
        data: { storageUsedBytes: { decrement: 256 } },
      }),
    );
  });

  test("upload rejects non-owned folder before DB transaction", async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    const svc = new PrismaDocumentService();
    await expect(
      svc.upload({
        userId: "u-1",
        data: {
          filename: "x.pdf",
          mimeType: "application/pdf",
          folderId: "foreign-folder",
          storageKey: "users/u-1/docs/doc-1/x.pdf",
        },
      }),
    ).rejects.toThrow("Folder not found");

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test("upload rejects out-of-scope storageKey when buffer is not provided", async () => {
    const svc = new PrismaDocumentService();
    await expect(
      svc.upload({
        userId: "u-1",
        data: {
          filename: "x.pdf",
          mimeType: "application/pdf",
          storageKey: "users/other-user/docs/doc-1/x.pdf",
        },
      }),
    ).rejects.toThrow("Invalid storage key scope");
  });

  test("upload requires storageKey when buffer is not provided", async () => {
    const svc = new PrismaDocumentService();
    await expect(
      svc.upload({
        userId: "u-1",
        data: {
          filename: "x.pdf",
          mimeType: "application/pdf",
        },
      }),
    ).rejects.toThrow("storageKey is required when buffer is not provided");
  });

  test("upload persists validated storageKey and increments storage in transaction", async () => {
    mockFolderFindFirst.mockResolvedValue({ id: "folder-1" });
    mockTransaction.mockImplementation(async (arg: any) => {
      const tx = {
        document: {
          create: (...args: any[]) => mockTxDocumentCreate(...args),
        },
        user: {
          update: (...args: any[]) => mockTxUserUpdate(...args),
        },
      };
      if (typeof arg === "function") return arg(tx);
      return null;
    });
    mockTxDocumentCreate.mockResolvedValue({
      id: "doc-1",
      filename: "x.pdf",
      encryptedFilename: "users/u-1/docs/doc-1/x.pdf",
      mimeType: "application/pdf",
      fileSize: 123,
      displayTitle: null,
      folderId: "folder-1",
      folder: { path: "/F" },
      status: "uploaded",
      createdAt: new Date("2026-03-05T00:00:00.000Z"),
      updatedAt: new Date("2026-03-05T00:00:00.000Z"),
    });
    mockTxUserUpdate.mockResolvedValue({});

    const svc = new PrismaDocumentService();
    await svc.upload({
      userId: "u-1",
      data: {
        filename: "x.pdf",
        mimeType: "application/pdf",
        folderId: "folder-1",
        sizeBytes: 123,
        storageKey: "users/u-1/docs/doc-1/x.pdf",
      },
    });

    expect(mockTxDocumentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          encryptedFilename: "users/u-1/docs/doc-1/x.pdf",
          folderId: "folder-1",
        }),
      }),
    );
    expect(mockTxUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-1" },
        data: { storageUsedBytes: { increment: 123 } },
      }),
    );
  });
});
