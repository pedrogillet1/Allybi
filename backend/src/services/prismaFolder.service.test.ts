import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockFolderFindFirst = jest.fn();
const mockFolderFindMany = jest.fn();
const mockFolderCreate = jest.fn();
const mockFolderUpdate = jest.fn();
const mockFolderDelete = jest.fn();
const mockDocumentUpdateMany = jest.fn();

jest.mock("../config/database", () => ({
  __esModule: true,
    default: {
      folder: {
        findFirst: (...args: any[]) => mockFolderFindFirst(...args),
        findMany: (...args: any[]) => mockFolderFindMany(...args),
        create: (...args: any[]) => mockFolderCreate(...args),
        update: (...args: any[]) => mockFolderUpdate(...args),
        delete: (...args: any[]) => mockFolderDelete(...args),
      },
    document: {
      updateMany: (...args: any[]) => mockDocumentUpdateMany(...args),
    },
  },
}));

import { PrismaFolderService } from "./prismaFolder.service";

function decodeCursor(cursor: string): { id: string; createdAt: string } {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}

describe("PrismaFolderService invariants", () => {
  beforeEach(() => {
    mockFolderFindFirst.mockReset();
    mockFolderFindMany.mockReset();
    mockFolderCreate.mockReset();
    mockFolderUpdate.mockReset();
    mockFolderDelete.mockReset();
    mockDocumentUpdateMany.mockReset();
  });

  test("list returns composite cursor and deterministic order", async () => {
    mockFolderFindMany.mockResolvedValue([
      {
        id: "f-3",
        userId: "u-1",
        name: "Folder C",
        nameEncrypted: null,
        parentFolderId: null,
        path: "/Folder C",
        emoji: null,
        createdAt: new Date("2026-03-03T12:00:00.000Z"),
        updatedAt: new Date("2026-03-03T12:00:00.000Z"),
        _count: { documents: 0, subfolders: 0 },
      },
      {
        id: "f-2",
        userId: "u-1",
        name: "Folder B",
        nameEncrypted: null,
        parentFolderId: null,
        path: "/Folder B",
        emoji: null,
        createdAt: new Date("2026-03-03T11:00:00.000Z"),
        updatedAt: new Date("2026-03-03T11:00:00.000Z"),
        _count: { documents: 0, subfolders: 0 },
      },
      {
        id: "f-1",
        userId: "u-1",
        name: "Folder A",
        nameEncrypted: null,
        parentFolderId: null,
        path: "/Folder A",
        emoji: null,
        createdAt: new Date("2026-03-03T10:00:00.000Z"),
        updatedAt: new Date("2026-03-03T10:00:00.000Z"),
        _count: { documents: 0, subfolders: 0 },
      },
    ]);

    const svc = new PrismaFolderService();
    const result = await svc.list({ userId: "u-1", limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeTruthy();
    expect(decodeCursor(result.nextCursor!)).toEqual({
      id: "f-2",
      createdAt: "2026-03-03T11:00:00.000Z",
    });

    expect(mockFolderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  test("list totalDocuments equals own document count on paged results", async () => {
    mockFolderFindMany.mockResolvedValue([
      {
        id: "f-parent",
        userId: "u-1",
        name: "Parent",
        nameEncrypted: null,
        parentFolderId: null,
        path: "/Parent",
        emoji: null,
        createdAt: new Date("2026-03-03T12:00:00.000Z"),
        updatedAt: new Date("2026-03-03T12:00:00.000Z"),
        _count: { documents: 2, subfolders: 1 },
      },
      {
        id: "f-child",
        userId: "u-1",
        name: "Child",
        nameEncrypted: null,
        parentFolderId: "f-parent",
        path: "/Parent/Child",
        emoji: null,
        createdAt: new Date("2026-03-03T11:00:00.000Z"),
        updatedAt: new Date("2026-03-03T11:00:00.000Z"),
        _count: { documents: 3, subfolders: 0 },
      },
    ]);

    const svc = new PrismaFolderService();
    const result = await svc.list({ userId: "u-1", limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]._count?.documents).toBe(2);
    expect(result.items[0]._count?.totalDocuments).toBe(2);
  });

  test("list supports legacy id-only cursor by resolving anchor row", async () => {
    mockFolderFindFirst.mockResolvedValue({
      id: "f-anchor",
      createdAt: new Date("2026-03-02T00:00:00.000Z"),
    });
    mockFolderFindMany.mockResolvedValue([]);

    const svc = new PrismaFolderService();
    await svc.list({ userId: "u-1", limit: 2, cursor: "f-anchor" });

    expect(mockFolderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ id: "f-anchor" }]),
        }),
      }),
    );
    expect(mockFolderFindMany).toHaveBeenCalledWith(
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

  test("rename rejects non-owned folder", async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    const svc = new PrismaFolderService();
    await expect(
      svc.rename({ userId: "u-1", folderId: "f-1", name: "renamed" }),
    ).rejects.toThrow("Folder not found");

    expect(mockFolderUpdate).not.toHaveBeenCalled();
  });

  test("move rejects when new parent is not owned by same user", async () => {
    mockFolderFindFirst
      .mockResolvedValueOnce({ id: "f-1" }) // target folder belongs to user
      .mockResolvedValueOnce(null); // parent folder does not belong to user

    const svc = new PrismaFolderService();
    await expect(
      svc.move({ userId: "u-1", folderId: "f-1", newParentId: "f-2" }),
    ).rejects.toThrow("Folder not found");

    expect(mockFolderUpdate).not.toHaveBeenCalled();
  });

  test("create rejects non-owned parent folder", async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    const svc = new PrismaFolderService();
    await expect(
      svc.create({
        userId: "u-1",
        name: "Child",
        parentId: "foreign-folder",
      }),
    ).rejects.toThrow("Folder not found");

    expect(mockFolderCreate).not.toHaveBeenCalled();
  });

  test("move rejects self-parent cycles", async () => {
    mockFolderFindFirst
      .mockResolvedValueOnce({ id: "f-1" }) // folder ownership
      .mockResolvedValueOnce({ id: "f-1" }); // parent ownership check

    const svc = new PrismaFolderService();
    await expect(
      svc.move({ userId: "u-1", folderId: "f-1", newParentId: "f-1" }),
    ).rejects.toThrow("Cannot move a folder into itself");

    expect(mockFolderUpdate).not.toHaveBeenCalled();
  });

  test("move rejects descendant-parent cycles", async () => {
    mockFolderFindFirst
      .mockResolvedValueOnce({ id: "f-1" }) // folder ownership
      .mockResolvedValueOnce({ id: "f-2" }); // parent ownership check
    mockFolderFindMany.mockResolvedValue([
      { id: "f-1", parentFolderId: null },
      { id: "f-2", parentFolderId: "f-1" },
    ]);

    const svc = new PrismaFolderService();
    await expect(
      svc.move({ userId: "u-1", folderId: "f-1", newParentId: "f-2" }),
    ).rejects.toThrow("Cannot move a folder into one of its descendants");

    expect(mockFolderUpdate).not.toHaveBeenCalled();
  });

  test("delete rejects non-owned folder before any mutation", async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    const svc = new PrismaFolderService();
    await expect(
      svc.delete({ userId: "u-1", folderId: "f-404", mode: "hard" }),
    ).rejects.toThrow("Folder not found");

    expect(mockFolderDelete).not.toHaveBeenCalled();
    expect(mockFolderUpdate).not.toHaveBeenCalled();
    expect(mockDocumentUpdateMany).not.toHaveBeenCalled();
  });

  test("setEmoji rejects non-owned folder before update", async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    const svc = new PrismaFolderService();
    await expect(
      svc.setEmoji({ userId: "u-1", folderId: "f-404", emoji: "📁" }),
    ).rejects.toThrow("Folder not found");

    expect(mockFolderUpdate).not.toHaveBeenCalled();
  });

  test("folderOnly mode moves docs from descendants before deleting root folder", async () => {
    mockFolderFindFirst.mockResolvedValue({ id: "f-root" });
    mockFolderFindMany.mockResolvedValue([
      { id: "f-root", parentFolderId: null },
      { id: "f-child", parentFolderId: "f-root" },
      { id: "f-grandchild", parentFolderId: "f-child" },
    ]);
    mockDocumentUpdateMany.mockResolvedValue({ count: 3 });
    mockFolderDelete.mockResolvedValue({});

    const svc = new PrismaFolderService();
    const result = await svc.delete({
      userId: "u-1",
      folderId: "f-root",
      mode: "folderOnly",
    });

    expect(result).toEqual({ deleted: true, movedDocs: 3 });
    expect(mockDocumentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          folderId: { in: ["f-root", "f-child", "f-grandchild"] },
          userId: "u-1",
        },
        data: { folderId: null },
      }),
    );
    expect(mockFolderDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f-root" },
      }),
    );
  });
});
