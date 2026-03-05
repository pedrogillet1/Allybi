import type { Request, Response } from "express";
import fileValidator from "../services/ingestion/fileValidator.service";

/**
 * Clean, DI-friendly Document Controller.
 *
 * Goals:
 * - No business logic here (no extraction, no embeddings, no orchestration).
 * - No direct filesystem/S3 logic here.
 * - No hardcoded "UX messages" here.
 * - All doc behaviors go through DocumentService (upload/list/get/preview/delete/reindex).
 */

export type DocumentId = string;

export interface DocumentRecord {
  id: DocumentId;
  title?: string;
  filename: string;
  mimeType: string;
  folderId?: string | null;
  folderPath?: string | null;
  sizeBytes?: number;
  fileSize?: number;
  uploadedAt: string;
  createdAt?: string;
  updatedAt?: string;
  status?: "ready" | "processing" | "failed";
  docType?:
    | "pdf"
    | "docx"
    | "pptx"
    | "xlsx"
    | "csv"
    | "txt"
    | "image"
    | "unknown";
  domains?: string[];
}

export interface DocumentPreview {
  kind: "text" | "html" | "image" | "pdf_page_thumbs";
  content?: string;
  url?: string;
  pages?: Array<{ page: number; url: string }>;
  meta?: Record<string, any>;
}

export interface UploadInput {
  filename: string;
  mimeType: string;
  folderId?: string | null;
  buffer?: Buffer;
  storageKey?: string;
  sizeBytes?: number;
}

export interface DocumentService {
  list(input: {
    userId: string;
    limit?: number;
    cursor?: string;
    folderId?: string;
    q?: string;
    docTypes?: string[];
  }): Promise<{ items: DocumentRecord[]; nextCursor?: string }>;

  get(input: {
    userId: string;
    documentId: string;
  }): Promise<DocumentRecord | null>;

  upload(input: { userId: string; data: UploadInput }): Promise<DocumentRecord>;

  delete(input: {
    userId: string;
    documentId: string;
    source?: string;
  }): Promise<{ deleted: true }>;

  preview(input: {
    userId: string;
    documentId: string;
    mode?: "auto" | "text" | "html" | "thumbs";
    page?: number;
  }): Promise<DocumentPreview>;

  reindex?(input: {
    userId: string;
    documentId: string;
  }): Promise<{ status: "queued" | "started" }>;

  getSupportedTypes?(): Promise<{ mimeTypes: string[]; extensions: string[] }>;

  streamFile?(input: {
    userId: string;
    documentId: string;
  }): Promise<{ buffer: Buffer; mimeType: string; filename: string }>;

  getDownloadUrl?(input: {
    userId: string;
    documentId: string;
  }): Promise<{ url: string; filename: string }>;
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string } };

function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ ok: true, data } satisfies ApiOk<T>);
}

function err(res: Response, code: string, message: string, status = 400) {
  return res
    .status(status)
    .json({ ok: false, error: { code, message } } satisfies ApiErr);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getUserId(req: Request): string | null {
  const anyReq = req as any;
  const userId = anyReq?.user?.id || anyReq?.userId || anyReq?.auth?.userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

function mapError(e: unknown): {
  code: string;
  message: string;
  status: number;
} {
  const msg = e instanceof Error ? e.message : "Unknown error";
  const m = msg.toLowerCase();

  if (m.includes("unauthorized") || m.includes("not authenticated")) {
    return {
      code: "AUTH_UNAUTHORIZED",
      message: "Not authenticated.",
      status: 401,
    };
  }
  if (m.includes("not found")) {
    return {
      code: "DOC_NOT_FOUND",
      message: "Document not found.",
      status: 404,
    };
  }
  if (m.includes("payload too large")) {
    return {
      code: "PAYLOAD_TOO_LARGE",
      message: "File too large.",
      status: 413,
    };
  }
  if (m.includes("unsupported") || m.includes("invalid mime")) {
    return {
      code: "UNSUPPORTED_FILE_TYPE",
      message: "Unsupported file type.",
      status: 400,
    };
  }

  // Default: treat as internal error unless we recognize it as client input.
  // This prevents infra failures (S3/DB/etc.) from showing up as "400 Bad Request".
  const isLikelyClientError =
    m.includes("validation") ||
    m.includes("bad request") ||
    m.includes("invalid") ||
    m.includes("missing");

  const isProd = process.env.NODE_ENV === "production";
  if (isLikelyClientError) {
    return {
      code: "DOC_ERROR",
      message: msg || "Document error.",
      status: 400,
    };
  }

  return {
    code: "DOC_ERROR",
    message: isProd ? "Internal server error" : msg || "Document error.",
    status: 500,
  };
}

export class DocumentController {
  constructor(private readonly docs: DocumentService) {}

  list = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const limit = Math.min(Math.max(asInt(req.query.limit) ?? 50, 1), 500);
    const cursor = asString(req.query.cursor) ?? undefined;
    const folderId = asString(req.query.folderId) ?? undefined;
    const q = asString(req.query.q) ?? undefined;

    const typesRaw = asString(req.query.types);
    const docTypes = typesRaw
      ? typesRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    try {
      const result = await this.docs.list({
        userId,
        limit,
        cursor,
        folderId,
        q,
        docTypes,
      });
      return ok(res, result, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  get = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const documentId = asString(req.params.id);
    if (!documentId)
      return err(
        res,
        "VALIDATION_DOC_ID_REQUIRED",
        "Document id is required.",
        400,
      );

    try {
      const doc = await this.docs.get({ userId, documentId });
      if (!doc) return err(res, "DOC_NOT_FOUND", "Document not found.", 404);
      return ok(res, doc, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  upload = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    try {
      const anyReq = req as any;
      const file: Express.Multer.File | undefined =
        anyReq.file ??
        (Array.isArray(anyReq.files) ? anyReq.files[0] : undefined);

      const folderId = asString((req.body as any)?.folderId) ?? null;

      if (file?.buffer && file?.originalname) {
        // Validate file header (magic bytes, empty check)
        const headerCheck = fileValidator.validateFileHeader(
          file.buffer,
          file.mimetype || "application/octet-stream",
        );
        if (!headerCheck.isValid) {
          return err(
            res,
            headerCheck.errorCode || "FILE_INVALID",
            headerCheck.error || "File validation failed",
            400,
          );
        }

        const created = await this.docs.upload({
          userId,
          data: {
            filename: file.originalname,
            mimeType: file.mimetype || "application/octet-stream",
            sizeBytes: file.size,
            folderId,
            buffer: file.buffer,
          },
        });
        return ok(res, created, 201);
      }

      const filename = asString((req.body as any)?.filename);
      const mimeType = asString((req.body as any)?.mimeType);
      const storageKey = asString((req.body as any)?.storageKey);
      const sizeBytes = asInt((req.body as any)?.sizeBytes) ?? undefined;

      if (!filename || !mimeType) {
        return err(
          res,
          "VALIDATION_UPLOAD_REQUIRED",
          "Provide either an uploaded file (multipart) or filename + mimeType (+ storageKey).",
          400,
        );
      }

      const created = await this.docs.upload({
        userId,
        data: {
          filename,
          mimeType,
          folderId,
          storageKey: storageKey ?? undefined,
          sizeBytes,
        },
      });

      return ok(res, created, 201);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  preview = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const documentId = asString(req.params.id);
    if (!documentId)
      return err(
        res,
        "VALIDATION_DOC_ID_REQUIRED",
        "Document id is required.",
        400,
      );

    const mode = (asString(req.query.mode) as any) ?? "auto";
    const page = asInt(req.query.page) ?? undefined;

    try {
      const preview = await this.docs.preview({
        userId,
        documentId,
        mode,
        page,
      });
      return ok(res, preview, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  reindex = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const documentId = asString(req.params.id);
    if (!documentId)
      return err(
        res,
        "VALIDATION_DOC_ID_REQUIRED",
        "Document id is required.",
        400,
      );

    if (!this.docs.reindex) {
      return err(res, "NOT_IMPLEMENTED", "Reindex is not enabled.", 501);
    }

    try {
      const out = await this.docs.reindex({ userId, documentId });
      return ok(res, out, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  stream = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const documentId = asString(req.params.id);
    if (!documentId)
      return err(
        res,
        "VALIDATION_DOC_ID_REQUIRED",
        "Document id is required.",
        400,
      );

    if (!this.docs.streamFile) {
      return err(res, "NOT_IMPLEMENTED", "File streaming is not enabled.", 501);
    }

    try {
      const { buffer, mimeType, filename } = await this.docs.streamFile({
        userId,
        documentId,
      });
      res.setHeader("Content-Type", mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(filename)}"`,
      );
      res.setHeader("Content-Length", buffer.length);
      return void res.send(buffer);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  download = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const documentId = asString(req.params.id);
    if (!documentId)
      return err(
        res,
        "VALIDATION_DOC_ID_REQUIRED",
        "Document id is required.",
        400,
      );

    if (!this.docs.getDownloadUrl) {
      return err(res, "NOT_IMPLEMENTED", "Download is not enabled.", 501);
    }

    try {
      const { url, filename } = await this.docs.getDownloadUrl({
        userId,
        documentId,
      });
      return ok(res, { url, filename }, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  delete = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const documentId = asString(req.params.id);
    if (!documentId)
      return err(
        res,
        "VALIDATION_DOC_ID_REQUIRED",
        "Document id is required.",
        400,
      );

    try {
      const sourceHeader = Array.isArray(req.headers["x-delete-source"])
        ? req.headers["x-delete-source"][0]
        : req.headers["x-delete-source"];
      const source =
        asString(sourceHeader) ?? asString(req.query.source) ?? undefined;
      const out = await this.docs.delete({ userId, documentId, source });
      return ok(res, out, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  supportedTypes = async (_req: Request, res: Response) => {
    if (!this.docs.getSupportedTypes) {
      return ok(res, { mimeTypes: [], extensions: [] }, 200);
    }
    try {
      const out = await this.docs.getSupportedTypes();
      return ok(res, out, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };
}

export function createDocumentController(documentService: DocumentService) {
  return new DocumentController(documentService);
}
