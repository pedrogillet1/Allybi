import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockFindUnique = jest.fn();
const mockAddDocumentJob = jest.fn();

jest.mock("../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
    },
  },
}));

jest.mock("../queues/document.queue", () => ({
  addDocumentJob: (...args: any[]) => mockAddDocumentJob(...args),
}));

jest.mock("../queues/edit.queue", () => ({
  startEditWorker: jest.fn(),
  stopEditWorker: jest.fn(),
}));

import { runJob } from "./edit-worker";

describe("edit-worker runJob", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockAddDocumentJob.mockReset();
  });

  test("uses documentId first when it resolves", async () => {
    mockFindUnique.mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      if (id === "doc-1") {
        return {
          id: "doc-1",
          userId: "user-1",
          encryptedFilename: "users/user-1/doc-1.pdf",
          filename: "doc-1.pdf",
          mimeType: "application/pdf",
        };
      }
      return null;
    });

    await runJob({
      data: {
        documentId: "doc-1",
        revisionId: "rev-1",
        userId: "user-1",
      },
    } as any);

    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(mockAddDocumentJob).toHaveBeenCalledTimes(1);
    expect(mockAddDocumentJob).toHaveBeenCalledWith({
      documentId: "doc-1",
      encryptedFilename: "users/user-1/doc-1.pdf",
      filename: "doc-1.pdf",
      mimeType: "application/pdf",
      userId: "user-1",
      thumbnailUrl: null,
    });
  });

  test("falls back to revisionId when documentId does not resolve", async () => {
    mockFindUnique.mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      if (id === "doc-missing") return null;
      if (id === "rev-1") {
        return {
          id: "rev-1",
          userId: "user-1",
          encryptedFilename: "users/user-1/rev-1.pdf",
          filename: "rev-1.pdf",
          mimeType: "application/pdf",
        };
      }
      return null;
    });

    await runJob({
      data: {
        documentId: "doc-missing",
        revisionId: "rev-1",
        userId: "user-1",
      },
    } as any);

    expect(mockFindUnique).toHaveBeenCalledTimes(2);
    expect(mockAddDocumentJob).toHaveBeenCalledTimes(1);
    expect(mockAddDocumentJob).toHaveBeenCalledWith({
      documentId: "rev-1",
      encryptedFilename: "users/user-1/rev-1.pdf",
      filename: "rev-1.pdf",
      mimeType: "application/pdf",
      userId: "user-1",
      thumbnailUrl: null,
    });
  });

  test("throws when no candidate document resolves", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      runJob({
        data: {
          documentId: "doc-missing",
          revisionId: "rev-missing",
          userId: "user-1",
        },
      } as any),
    ).rejects.toThrow("Document not found for reindex");
  });

  test("throws when resolved document user differs from job user", async () => {
    mockFindUnique.mockResolvedValue({
      id: "doc-1",
      userId: "other-user",
      encryptedFilename: "users/other-user/doc-1.pdf",
      filename: "doc-1.pdf",
      mimeType: "application/pdf",
    });

    await expect(
      runJob({
        data: {
          documentId: "doc-1",
          userId: "user-1",
        },
      } as any),
    ).rejects.toThrow("Reindex user mismatch");
    expect(mockAddDocumentJob).not.toHaveBeenCalled();
  });
});
