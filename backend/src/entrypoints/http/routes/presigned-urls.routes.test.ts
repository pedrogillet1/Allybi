import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockCreateMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockFindMany = jest.fn();
const mockFolderFindMany = jest.fn();
const mockPresignUpload = jest.fn();

jest.mock("../../../middleware/auth.middleware", () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../middleware/rateLimit.middleware", () => ({
  presignedUrlLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../platform/db/prismaClient", () => ({
  __esModule: true,
  default: {
    document: {
      createMany: (...args: any[]) => mockCreateMany(...args),
      updateMany: (...args: any[]) => mockUpdateMany(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
    },
    folder: {
      findMany: (...args: any[]) => mockFolderFindMany(...args),
    },
  },
}));

jest.mock("../../../services/retrieval/gcsStorage.service", () => ({
  GcsStorageService: jest.fn().mockImplementation(() => ({
    ensureBucketCors: jest.fn().mockResolvedValue(undefined),
    presignUpload: (...args: any[]) => mockPresignUpload(...args),
  })),
}));

jest.mock("../../../config/upload.config", () => ({
  UPLOAD_CONFIG: {
    STORAGE_PROVIDER: "gcs",
    LOCAL_STORAGE_PATH: "/tmp/uploads",
    MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,
    MAX_BATCH_FILES: 1000,
    PRESIGNED_URL_EXPIRATION_SECONDS: 3600,
  },
}));

jest.mock("../../../queues/document.queue", () => ({
  addDocumentJob: jest.fn(),
  addDocumentJobsBulk: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../services/jobs/pubsubPublisher.service", () => ({
  publishExtractFanoutJobsBulk: jest.fn(),
  publishExtractJob: jest.fn(),
  publishExtractJobsBulk: jest.fn(),
  isPubSubAvailable: jest.fn().mockReturnValue(false),
}));

jest.mock("../../../config/env", () => ({
  env: {
    USE_GCP_WORKERS: false,
  },
}));

import router from "./presigned-urls.routes";

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

function getRouteHandler(path: string) {
  const layer = (router as any).stack.find(
    (entry: any) => entry?.route?.path === path,
  );
  if (!layer) throw new Error(`Missing route ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe("presigned-urls routes", () => {
  beforeEach(() => {
    mockCreateMany.mockReset().mockResolvedValue({ count: 1 });
    mockUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    mockFindMany.mockReset().mockResolvedValue([]);
    mockFolderFindMany.mockReset().mockImplementation((args: any) => {
      const requested = args?.where?.id?.in;
      if (Array.isArray(requested)) {
        return Promise.resolve(requested.map((id: string) => ({ id })));
      }
      return Promise.resolve([]);
    });
    mockPresignUpload.mockReset().mockResolvedValue({
      url: "https://storage.example/upload/1",
    });
  });

  test("POST /bulk returns presigned URLs and document IDs", async () => {
    const handler = getRouteHandler("/bulk");
    const req: any = {
      user: { id: "user-1" },
      body: {
        files: [
          {
            fileName: "proof.txt",
            fileType: "text/plain",
            fileSize: 42,
          },
        ],
      },
      headers: {},
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        documentIds: expect.arrayContaining([expect.any(String)]),
        presignedUrls: ["https://storage.example/upload/1"],
        skippedFiles: [],
      }),
    );
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
  });

  test("POST /bulk resolves nested folders through folder service", async () => {
    const handler = getRouteHandler("/bulk");
    const createFolder = jest
      .fn()
      .mockResolvedValueOnce({ id: "folder-a" })
      .mockResolvedValueOnce({ id: "folder-b" });
    const req: any = {
      user: { id: "user-1" },
      body: {
        files: [
          {
            fileName: "deep.txt",
            fileType: "text/plain",
            fileSize: 42,
            relativePath: "A/B/deep.txt",
          },
        ],
      },
      headers: {},
      app: {
        locals: {
          services: {
            folders: {
              create: createFolder,
            },
          },
        },
      },
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(createFolder).toHaveBeenCalledTimes(2);
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const payload = mockCreateMany.mock.calls[0][0];
    expect(payload.data[0].folderId).toBe("folder-b");
  });

  test("POST /bulk fails closed when nested folder creation is required but service is missing", async () => {
    const handler = getRouteHandler("/bulk");
    const req: any = {
      user: { id: "user-1" },
      body: {
        files: [
          {
            fileName: "deep.txt",
            fileType: "text/plain",
            fileSize: 42,
            relativePath: "A/B/deep.txt",
          },
        ],
      },
      headers: {},
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "Folder service unavailable" });
  });

  test("POST /bulk rejects empty files list", async () => {
    const handler = getRouteHandler("/bulk");
    const req: any = {
      user: { id: "user-1" },
      body: { files: [] },
      headers: {},
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "No files provided" });
  });

  test("POST /bulk returns 404 when provided folderId is not owned", async () => {
    const handler = getRouteHandler("/bulk");
    mockFolderFindMany.mockResolvedValueOnce([]);
    const req: any = {
      user: { id: "user-1" },
      body: {
        folderId: "foreign-folder",
        files: [
          {
            fileName: "proof.txt",
            fileType: "text/plain",
            fileSize: 42,
          },
        ],
      },
      headers: {},
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Folder not found" });
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  test("POST /complete-bulk handles empty documentIds", async () => {
    const handler = getRouteHandler("/complete-bulk");
    const req: any = {
      user: { id: "user-1" },
      body: { documentIds: [] },
      headers: {},
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      confirmed: [],
      pending: [],
      failed: [],
      stats: {
        confirmed: 0,
        pending: 0,
        failed: 0,
        skipped: 0,
        transitioned: 0,
        queued: 0,
      },
    });
  });
});
