import { beforeEach, describe, expect, jest, test } from "@jest/globals";

/* ------------------------------------------------------------------ */
/*  Hoisted mock fns                                                  */
/* ------------------------------------------------------------------ */

const mockSave = jest.fn();
const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockExists = jest.fn();
const mockGetMetadata = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockGetFiles = jest.fn();
const mockCreateResumableUpload = jest.fn();
const mockSetCorsConfiguration = jest.fn();

const mockFile = jest.fn(() => ({
  save: (...args: any[]) => mockSave(...args),
  download: (...args: any[]) => mockDownload(...args),
  delete: (...args: any[]) => mockDelete(...args),
  exists: (...args: any[]) => mockExists(...args),
  getMetadata: (...args: any[]) => mockGetMetadata(...args),
  getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
  createResumableUpload: (...args: any[]) => mockCreateResumableUpload(...args),
}));

const mockBucket = jest.fn(() => ({
  file: (...args: any[]) => mockFile(...args),
  getFiles: (...args: any[]) => mockGetFiles(...args),
  setCorsConfiguration: (...args: any[]) => mockSetCorsConfiguration(...args),
}));

jest.mock("@google-cloud/storage", () => ({
  __esModule: true,
  Storage: class MockStorage {
    bucket = (...args: any[]) => mockBucket(...args);
  },
}));

import { GcsStorageService, GcsStorageError } from "./gcsStorage.service";

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("GcsStorageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
    mockDownload.mockResolvedValue([Buffer.from("file-content")]);
    mockDelete.mockResolvedValue(undefined);
    mockExists.mockResolvedValue([true]);
    mockGetMetadata.mockResolvedValue([{
      size: 1024,
      contentType: "application/pdf",
      updated: "2026-03-01T00:00:00Z",
      etag: "abc123",
    }]);
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/signed-url"]);
    mockGetFiles.mockResolvedValue([[], {}, {}]);
    mockCreateResumableUpload.mockResolvedValue(["https://storage.googleapis.com/resumable-upload"]);
    mockSetCorsConfiguration.mockResolvedValue(undefined);
  });

  // ================================================================
  // Not-configured guard
  // ================================================================

  test("throws GCS_NOT_CONFIGURED when bucket is empty", async () => {
    const svc = new GcsStorageService({ bucket: "" });
    try {
      await svc.uploadFile({ key: "test.pdf", buffer: Buffer.from("x"), mimeType: "application/pdf" });
      expect(true).toBe(false); // Should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(GcsStorageError);
      expect((err as GcsStorageError).code).toBe("GCS_NOT_CONFIGURED");
    }
  });

  // ================================================================
  // uploadFile
  // ================================================================

  test("uploadFile returns key on success", async () => {
    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const result = await svc.uploadFile({
      key: "docs/report.pdf",
      buffer: Buffer.from("pdf-content"),
      mimeType: "application/pdf",
    });

    expect(result).toEqual({ key: "docs/report.pdf" });
    expect(mockFile).toHaveBeenCalledWith("docs/report.pdf");
    expect(mockSave).toHaveBeenCalledWith(
      Buffer.from("pdf-content"),
      expect.objectContaining({ contentType: "application/pdf" }),
    );
  });

  test("uploadFile wraps error with GCS_UPLOAD_FAILED", async () => {
    mockSave.mockRejectedValue(new Error("network error"));

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    try {
      await svc.uploadFile({ key: "test.pdf", buffer: Buffer.from("x"), mimeType: "application/pdf" });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(GcsStorageError);
      expect((err as GcsStorageError).code).toBe("GCS_UPLOAD_FAILED");
    }
  });

  // ================================================================
  // downloadFile
  // ================================================================

  test("downloadFile returns buffer and mimeType", async () => {
    const content = Buffer.from("downloaded-content");
    mockDownload.mockResolvedValue([content]);
    mockGetMetadata.mockResolvedValue([{ contentType: "text/plain" }]);

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const result = await svc.downloadFile({ key: "docs/notes.txt" });

    expect(result.buffer).toEqual(content);
    expect(result.mimeType).toBe("text/plain");
  });

  // ================================================================
  // deleteFile
  // ================================================================

  test("deleteFile calls file.delete with ignoreNotFound", async () => {
    const svc = new GcsStorageService({ bucket: "test-bucket" });
    await svc.deleteFile({ key: "docs/old.pdf" });

    expect(mockDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  // ================================================================
  // fileExists
  // ================================================================

  test("fileExists returns true when file exists", async () => {
    mockExists.mockResolvedValue([true]);

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const result = await svc.fileExists({ key: "docs/report.pdf" });

    expect(result).toBe(true);
  });

  test("fileExists returns false when file does not exist", async () => {
    mockExists.mockResolvedValue([false]);

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const result = await svc.fileExists({ key: "docs/nonexistent.pdf" });

    expect(result).toBe(false);
  });

  // ================================================================
  // getFileMetadata
  // ================================================================

  test("getFileMetadata returns metadata object", async () => {
    mockGetMetadata.mockResolvedValue([{
      size: 2048,
      contentType: "image/png",
      updated: "2026-02-15T12:00:00Z",
      etag: "etag-xyz",
    }]);

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const meta = await svc.getFileMetadata({ key: "images/photo.png" });

    expect(meta).not.toBeNull();
    expect(meta!.size).toBe(2048);
    expect(meta!.mimeType).toBe("image/png");
    expect(meta!.lastModified).toEqual(new Date("2026-02-15T12:00:00Z"));
    expect(meta!.etag).toBe("etag-xyz");
  });

  test("getFileMetadata returns null on error", async () => {
    mockGetMetadata.mockRejectedValue(new Error("not found"));

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const meta = await svc.getFileMetadata({ key: "nonexistent.txt" });

    expect(meta).toBeNull();
  });

  // ================================================================
  // presignUpload
  // ================================================================

  test("presignUpload returns signed URL", async () => {
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/upload-signed"]);

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const result = await svc.presignUpload({
      key: "uploads/file.pdf",
      mimeType: "application/pdf",
    });

    expect(result.url).toBe("https://storage.googleapis.com/upload-signed");
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v4", action: "write" }),
    );
  });

  // ================================================================
  // presignDownload
  // ================================================================

  test("presignDownload returns signed URL", async () => {
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/download-signed"]);

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const result = await svc.presignDownload({ key: "docs/report.pdf" });

    expect(result.url).toBe("https://storage.googleapis.com/download-signed");
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v4", action: "read" }),
    );
  });

  // ================================================================
  // listFiles
  // ================================================================

  test("listFiles returns file list with pagination", async () => {
    mockGetFiles.mockResolvedValue([
      [
        { name: "docs/a.pdf", metadata: { size: 100, updated: "2026-01-01T00:00:00Z" } },
        { name: "docs/b.pdf", metadata: { size: 200, updated: "2026-02-01T00:00:00Z" } },
      ],
      {},
      { nextPageToken: "token-abc" },
    ]);

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const result = await svc.listFiles({ prefix: "docs/", maxResults: 10 });

    expect(result.files.length).toBe(2);
    expect(result.files[0].name).toBe("docs/a.pdf");
    expect(result.files[0].size).toBe(100);
    expect(result.files[1].name).toBe("docs/b.pdf");
    expect(result.nextPageToken).toBe("token-abc");
  });

  // ================================================================
  // ensureBucketCors
  // ================================================================

  test("ensureBucketCors calls setCorsConfiguration", async () => {
    const svc = new GcsStorageService({ bucket: "test-bucket" });
    await svc.ensureBucketCors(["https://example.com"]);

    expect(mockSetCorsConfiguration).toHaveBeenCalledWith([
      expect.objectContaining({
        origin: ["https://example.com"],
        method: ["PUT", "GET", "HEAD", "OPTIONS"],
      }),
    ]);
  });

  // ================================================================
  // createResumableUpload
  // ================================================================

  test("createResumableUpload returns upload URL", async () => {
    mockCreateResumableUpload.mockResolvedValue(["https://storage.googleapis.com/resumable"]);

    const svc = new GcsStorageService({ bucket: "test-bucket" });
    const result = await svc.createResumableUpload({
      key: "large/file.zip",
      mimeType: "application/zip",
    });

    expect(result.uploadUrl).toBe("https://storage.googleapis.com/resumable");
    expect(mockCreateResumableUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ contentType: "application/zip" }),
      }),
    );
  });
});
