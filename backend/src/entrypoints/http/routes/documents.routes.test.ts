import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { documentPatchSchema } from "../../../schemas/request.schemas";

const mockFindFirst = jest.fn();
const mockUpdateDocumentFieldsForUser = jest.fn();
const mockResetForReprocess = jest.fn();

jest.mock("../../../middleware/auth.middleware", () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../middleware/authorize.middleware", () => ({
  authorizeByMethod: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../middleware/rateLimit.middleware", () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
  statusPollingLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../middleware/upload.middleware", () => ({
  uploadMultiple: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../controllers/document.controller", () => ({
  createDocumentController: () => ({
    upload: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    download: jest.fn(),
  }),
  DocumentController: class {},
}));

jest.mock("../../../platform/db/prismaClient", () => ({
  __esModule: true,
  default: {
    document: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
    },
  },
}));

jest.mock("../../../services/documents/documentUploadWrite.service", () => ({
  documentUploadWriteService: {
    updateDocumentFieldsForUser: (...args: any[]) =>
      mockUpdateDocumentFieldsForUser(...args),
    resetForReprocess: (...args: any[]) => mockResetForReprocess(...args),
    upsertDocumentMetadata: jest.fn(),
    updateDocumentMetadata: jest.fn(),
  },
}));

jest.mock("../../../config/storage", () => ({
  downloadFile: jest.fn(),
  getSignedUrl: jest.fn(),
  fileExists: jest.fn(),
}));

jest.mock("../../../services/cache.service", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

jest.mock("../../../services/ingestion/excelHtmlPreview.service", () => ({
  generateExcelHtmlPreview: jest.fn(),
}));

jest.mock("../../../services/preview/previewOrchestrator.service", () => ({
  ensurePreview: jest.fn(),
}));

jest.mock("../../../services/preview/pptxSlideImageGenerator.service", () => ({
  generateSlideImagesForDocument: jest.fn(),
}));

jest.mock("../../../services/jobs/pubsubPublisher.service", () => ({
  publishExtractJob: jest.fn(),
  isPubSubAvailable: jest.fn().mockReturnValue(false),
}));

jest.mock("../../../config/env", () => ({
  env: {
    USE_GCP_WORKERS: false,
  },
}));

jest.mock("../../../services/editing/docx/docxAnchors.service", () => ({
  DocxAnchorsService: class {},
}));

jest.mock("../../../services/editing/docx/docxMarkdownBridge.service", () => ({
  toMarkdown: jest.fn(),
  buildDocxBundlePatchesFromMarkdown: jest.fn(),
}));

jest.mock("../../../services/extraction/xlsxExtractor.service", () => ({
  extractXlsxWithAnchors: jest.fn(),
}));

jest.mock("../../../services/editing/slides/slidesClient.service", () => ({
  SlidesClientService: class {},
}));

jest.mock("../../../services/editing/editSuggestions.service", () => ({
  EditSuggestionsService: class {},
}));

jest.mock("../../../services/editing/allybi/capabilities.service", () => ({
  buildDocumentCapabilities: jest.fn(),
}));

jest.mock("../../../modules/documents/application", () => ({
  RevisionService: class {},
}));

jest.mock("../../../services/conversion/cloudConvertPptx.service", () => ({}));

jest.mock("../../../routes/slidesStudio.routes", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require("express");
  return express.Router();
});

jest.mock("../../../routes/sheetsStudio.routes", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require("express");
  return express.Router();
});

jest.mock("xlsx", () => ({}));
jest.mock("docx", () => ({
  Document: class {},
  Packer: {},
  Paragraph: class {},
}));
jest.mock("pdf-parse", () => ({
  PDFParse: class {},
}));

import router from "./documents.routes";

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

function getRouteHandler(path: string, method: "patch" | "post") {
  const layer = (router as any).stack.find(
    (entry: any) => entry?.route?.path === path && entry.route.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe("documents.routes handlers", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdateDocumentFieldsForUser.mockReset();
    mockResetForReprocess.mockReset();
  });

  test("PATCH /:id returns 401 when user is missing", async () => {
    const handler = getRouteHandler("/:id", "patch");
    const req: any = { params: { id: "doc-1" }, body: { filename: "x.pdf" } };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Not authenticated" });
  });

  test("PATCH /:id returns 400 when payload has no mutable fields", async () => {
    const handler = getRouteHandler("/:id", "patch");
    const req: any = {
      user: { id: "u-1" },
      params: { id: "doc-1" },
      body: {},
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "No valid fields to update" });
  });

  test("PATCH /:id returns 404 when write service cannot update", async () => {
    const handler = getRouteHandler("/:id", "patch");
    mockUpdateDocumentFieldsForUser.mockResolvedValue(null);
    const req: any = {
      user: { id: "u-1" },
      params: { id: "doc-1" },
      body: { filename: "x.pdf" },
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(mockUpdateDocumentFieldsForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        documentId: "doc-1",
        filename: "x.pdf",
      }),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Document not found" });
  });

  test("PATCH /:id returns updated payload on success", async () => {
    const handler = getRouteHandler("/:id", "patch");
    const updated = { id: "doc-1", filename: "x.pdf" };
    mockUpdateDocumentFieldsForUser.mockResolvedValue(updated);
    const req: any = {
      user: { id: "u-1" },
      params: { id: "doc-1" },
      body: { filename: "x.pdf", displayTitle: "Title" },
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, data: updated });
  });

  test("POST /:id/reprocess returns 404 when document is missing", async () => {
    const handler = getRouteHandler("/:id/reprocess", "post");
    mockFindFirst.mockResolvedValue(null);
    const req: any = { user: { id: "u-1" }, params: { id: "doc-1" }, body: {} };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Document not found" });
  });

  test("POST /:id/reprocess returns 404 when reset affects no rows", async () => {
    const handler = getRouteHandler("/:id/reprocess", "post");
    mockFindFirst.mockResolvedValue({
      id: "doc-1",
      mimeType: "application/pdf",
      encryptedFilename: "users/u-1/docs/doc-1/doc-1.pdf",
      filename: "x.pdf",
    });
    mockResetForReprocess.mockResolvedValue(0);
    const req: any = { user: { id: "u-1" }, params: { id: "doc-1" }, body: {} };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Document not found" });
  });

  test("POST /:id/reprocess returns queued response when reset succeeds", async () => {
    const handler = getRouteHandler("/:id/reprocess", "post");
    mockFindFirst.mockResolvedValue({
      id: "doc-1",
      mimeType: "application/pdf",
      encryptedFilename: "users/u-1/docs/doc-1/doc-1.pdf",
      filename: "x.pdf",
    });
    mockResetForReprocess.mockResolvedValue(1);
    const req: any = { user: { id: "u-1" }, params: { id: "doc-1" }, body: {} };
    const res = makeRes();

    await handler(req, res as any);

    expect(mockResetForReprocess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        documentId: "doc-1",
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      message: "Document reprocessing started successfully",
      result: { status: "queued" },
    });
  });
});

describe("documentPatchSchema", () => {
  test("rejects unknown keys and allows nullable fields", () => {
    const good = documentPatchSchema.safeParse({
      folderId: null,
      displayTitle: null,
    });
    const bad = documentPatchSchema.safeParse({
      folderId: null,
      malicious: "1",
    });

    expect(good.success).toBe(true);
    expect(bad.success).toBe(false);
  });
});
