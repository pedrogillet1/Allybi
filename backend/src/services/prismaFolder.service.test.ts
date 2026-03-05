import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockFolderFindFirst = jest.fn();
const mockFolderUpdate = jest.fn();
const mockFolderDelete = jest.fn();
const mockDocumentUpdateMany = jest.fn();

jest.mock("../config/database", () => ({
  __esModule: true,
  default: {
    folder: {
      findFirst: (...args: any[]) => mockFolderFindFirst(...args),
      update: (...args: any[]) => mockFolderUpdate(...args),
      delete: (...args: any[]) => mockFolderDelete(...args),
    },
    document: {
      updateMany: (...args: any[]) => mockDocumentUpdateMany(...args),
    },
  },
}));

import { PrismaFolderService } from "./prismaFolder.service";

describe("PrismaFolderService ownership guards", () => {
  beforeEach(() => {
    mockFolderFindFirst.mockReset();
    mockFolderUpdate.mockReset();
    mockFolderDelete.mockReset();
    mockDocumentUpdateMany.mockReset();
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
});

