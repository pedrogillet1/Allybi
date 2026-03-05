import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockIngestionEventCreate = jest.fn();
const mockAddDocumentJob = jest.fn();
const mockPublishExtractJob = jest.fn();
const mockIsPubSubAvailable = jest.fn();
const mockGetFileMetadata = jest.fn();

jest.mock("../../../middleware/auth.middleware", () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../middleware/rateLimit.middleware", () => ({
  multipartUploadLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../platform/db/prismaClient", () => ({
  __esModule: true,
  default: {
    document: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
      update: (...args: any[]) => mockUpdate(...args),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    ingestionEvent: {
      create: (...args: any[]) => mockIngestionEventCreate(...args),
    },
  },
}));

jest.mock("../../../services/retrieval/gcsStorage.service", () => ({
  GcsStorageService: jest.fn().mockImplementation(() => ({
    ensureBucketCors: jest.fn().mockResolvedValue(undefined),
    getFileMetadata: (...args: any[]) => mockGetFileMetadata(...args),
    createResumableUpload: jest
      .fn()
      .mockResolvedValue({ uploadUrl: "https://example/upload" }),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../../config/upload.config", () => ({
  UPLOAD_CONFIG: {
    MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,
    CHUNK_SIZE_BYTES: 10 * 1024 * 1024,
  },
}));

jest.mock("../../../queues/document.queue", () => ({
  addDocumentJob: (...args: any[]) => mockAddDocumentJob(...args),
}));

jest.mock("../../../config/env", () => ({
  env: {
    USE_GCP_WORKERS: false,
  },
}));

jest.mock("../../../services/jobs/pubsubPublisher.service", () => ({
  isPubSubAvailable: (...args: any[]) => mockIsPubSubAvailable(...args),
  publishExtractJob: (...args: any[]) => mockPublishExtractJob(...args),
}));

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import router from "./multipart-upload.routes";

function makeRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function getCompleteHandler() {
  const layer = (router as any).stack.find(
    (entry: any) => entry?.route?.path === "/complete",
  );
  if (!layer) throw new Error("Missing /complete route");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe("multipart-upload /complete", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
    mockIngestionEventCreate.mockReset();
    mockAddDocumentJob.mockReset();
    mockPublishExtractJob.mockReset();
    mockIsPubSubAvailable.mockReset().mockReturnValue(false);
    mockGetFileMetadata.mockReset();
  });

  test("returns ok=true when scheduling succeeds", async () => {
    const handler = getCompleteHandler();
    mockFindFirst.mockResolvedValue({
      id: "doc-1",
      userId: "user-1",
      filename: "report.pdf",
      mimeType: "application/pdf",
      encryptedFilename: "users/user-1/docs/doc-1/doc-1.pdf",
    });
    mockGetFileMetadata.mockResolvedValue({ size: 1024 });
    mockUpdate.mockResolvedValue({});
    mockAddDocumentJob.mockResolvedValue({});

    const req: any = {
      user: { id: "user-1" },
      body: {
        documentId: "doc-1",
        storageKey: "users/user-1/docs/doc-1/doc-1.pdf",
      },
      headers: {},
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, documentId: "doc-1" });
    expect(mockAddDocumentJob).toHaveBeenCalledTimes(1);
  });

  test("returns 503 and marks indexing failed when scheduling fails", async () => {
    const handler = getCompleteHandler();
    mockFindFirst.mockResolvedValue({
      id: "doc-1",
      userId: "user-1",
      filename: "report.pdf",
      mimeType: "application/pdf",
      encryptedFilename: "users/user-1/docs/doc-1/doc-1.pdf",
    });
    mockGetFileMetadata.mockResolvedValue({ size: 1024 });
    mockUpdate.mockResolvedValue({});
    mockAddDocumentJob.mockRejectedValue(new Error("Redis down"));

    const req: any = {
      user: { id: "user-1" },
      body: {
        documentId: "doc-1",
        storageKey: "users/user-1/docs/doc-1/doc-1.pdf",
      },
      headers: {},
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: "QUEUE_UNAVAILABLE",
        documentId: "doc-1",
      }),
    );
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockIngestionEventCreate).toHaveBeenCalledTimes(1);
    expect(mockIngestionEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: "doc-1",
          status: "queue_fail",
        }),
      }),
    );
    expect(mockUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "doc-1" },
        data: expect.objectContaining({
          status: "uploaded",
          indexingState: "failed",
        }),
      }),
    );
  });
});
