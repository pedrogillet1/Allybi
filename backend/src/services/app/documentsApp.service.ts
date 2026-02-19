// backend/src/services/app/documentsApp.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeWhitespace } from "../../utils";

/**
 * DocumentAppService (ChatGPT-parity, backend)
 * -------------------------------------------
 * Centralized document operations used by:
 *  - document.controller.ts (list/search/metadata)
 *  - storage.controller.ts (open/where)
 *  - chat.controller.ts (source pills, open/where/find doc resolution)
 *
 * Responsibilities:
 *  - Load and write the document index (doc-index.json) atomically
 *  - Provide normalized, client-safe metadata (never leak server paths)
 *  - Resolve storage pointers to absolute paths safely (no path traversal)
 *  - Provide stable URLs for "open" and "where" pills in the chat UI
 *  - Provide deterministic list/search/sort behavior
 *  - Optional: delete documents (index-only or hard delete file)
 *
 * What it does NOT do:
 *  - OCR/extraction
 *  - retrieval/ranking/LLM
 *  - encryption (unless your index stores encrypted pointers; handle externally)
 */

import path from "path";
import * as fs from "fs/promises";

export type EnvName = "production" | "staging" | "dev" | "local";

export type DocTypeCategory =
  | "pdf"
  | "spreadsheet"
  | "slides"
  | "image"
  | "text"
  | "unknown";

export type DocumentIndexRecord = {
  docId: string;

  title?: string | null;
  filename?: string | null;
  mimeType?: string | null;

  sizeBytes?: number | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;

  // Storage pointers (server-side only)
  storageKey?: string | null; // e.g., "uploads/abc.pdf"
  relativePath?: string | null; // e.g., "uploads/abc.pdf"
  folderPath?: string | null; // UI folder label (client-safe)

  // Optional containers
  sheets?: string[] | null;
  pageCount?: number | null;
  slideCount?: number | null;

  // Optional: any extra fields produced by your pipeline
  meta?: Record<string, any>;
};

export type DocumentIndexFile = {
  version: string;
  docs: DocumentIndexRecord[];
};

export type ClientDoc = {
  docId: string;
  title: string | null;
  filename: string | null;
  mimeType: string | null;
  docType: DocTypeCategory;

  sizeBytes: number | null;
  createdAt: number | string | null;
  updatedAt: number | string | null;

  folderPath: string | null;
  sheets: string[] | null;
  pageCount: number | null;
  slideCount: number | null;

  // URLs the chat UI uses to make source pills work
  openUrl: string;
  whereUrl: string;
};

export type ListDocsOptions = {
  query?: string; // free text filter on title/filename
  docTypes?: DocTypeCategory[];
  mimeTypes?: string[];
  sortBy?: "updatedAt" | "createdAt" | "sizeBytes" | "title" | "filename";
  sortDir?: "asc" | "desc";
  limit?: number;
};

export type WhereInfo = {
  docId: string;
  folderPath: string | null;
  filename: string | null;
  title: string | null;
};

export type OpenInfo = {
  docId: string;
  absolutePath: string; // server-only
  mimeType: string;
  downloadName: string;
};

export class DocumentAppError extends Error {
  status: number;
  code: string;
  details?: any;

  constructor(code: string, message: string, status = 500, details?: any) {
    super(message);
    this.name = "DocumentAppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type DocumentAppServiceConfig = {
  env: EnvName;

  // Index and storage locations
  docIndexPath: string; // e.g., storage/doc-index.json
  storageDir: string; // e.g., storage/uploads

  // Base API paths for source pills (must match your routers)
  openRouteBase: string; // e.g., "/api/storage/open"
  whereRouteBase: string; // e.g., "/api/storage/where"

  // Safety controls
  maxDocsSoft: number;
  maxDocsHard: number;
};

const DEFAULT_CONFIG: DocumentAppServiceConfig = {
  env: (process.env.NODE_ENV as EnvName) || "dev",
  docIndexPath: path.resolve(process.cwd(), "storage/doc-index.json"),
  storageDir: path.resolve(process.cwd(), "storage/uploads"),
  openRouteBase: "/api/storage/open",
  whereRouteBase: "/api/storage/where",
  maxDocsSoft: 2000,
  maxDocsHard: 20000,
};

// In-process write lock for doc-index.json to prevent concurrent corruption
let docIndexWriteLock: Promise<void> = Promise.resolve();
async function withDocIndexWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = docIndexWriteLock;
  let release!: () => void;
  docIndexWriteLock = new Promise<void>((r) => (release = r));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function safeString(x: any, max = 260): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function safeNumber(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseDateAny(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const t = Date.parse(x);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

// normalizeWhitespace imported from ../../utils

function normalizeKey(s: string | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function docTypeCategory(mimeType: string | null): DocTypeCategory {
  const m = (mimeType ?? "").toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m.includes("sheet") ||
    m.includes("csv") ||
    m.includes("application/vnd.ms-excel") ||
    m.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
  )
    return "spreadsheet";
  if (
    m.includes("presentation") ||
    m.includes("powerpoint") ||
    m.includes("application/vnd.ms-powerpoint") ||
    m.includes(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
  )
    return "slides";
  if (m.startsWith("image/")) return "image";
  if (
    m.startsWith("text/") ||
    m.includes("wordprocessingml") ||
    m.includes("markdown")
  )
    return "text";
  return "unknown";
}

function stableSort<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const c = compare(a.item, b.item);
      return c !== 0 ? c : a.idx - b.idx;
    })
    .map((x) => x.item);
}

async function atomicWriteJson(filePath: string, data: any): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

function safeJoinUnder(baseDir: string, relativeOrKey: string): string {
  const base = path.resolve(baseDir);
  const full = path.resolve(baseDir, relativeOrKey);
  if (!full.startsWith(base)) {
    throw new DocumentAppError("invalid_path", "Invalid document path", 400, {
      relativeOrKey,
    });
  }
  return full;
}

function guessDownloadName(doc: DocumentIndexRecord): string {
  const filename = safeString(doc.filename, 180);
  if (filename) return filename.replace(/"/g, "");
  const title = safeString(doc.title, 180);
  if (title) return `${title.replace(/"/g, "")}.bin`;
  return `${doc.docId}.bin`;
}

export class DocumentAppService {
  private cfg: DocumentAppServiceConfig;

  constructor(config: Partial<DocumentAppServiceConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------
  // Index IO
  // -----------------------------

  async readIndex(): Promise<DocumentIndexFile> {
    try {
      const raw = await fs.readFile(this.cfg.docIndexPath, "utf8");
      const parsed = JSON.parse(raw);
      const docs = Array.isArray(parsed?.docs) ? parsed.docs : [];
      const version =
        typeof parsed?.version === "string" ? parsed.version : "1.0.0";

      // Hard cap guard: prevent runaway memory if index file is corrupted/huge
      if (docs.length > this.cfg.maxDocsHard) {
        throw new DocumentAppError(
          "doc_index_too_large",
          "Document index too large",
          500,
          { docs: docs.length, maxDocsHard: this.cfg.maxDocsHard },
        );
      }

      return { version, docs };
    } catch {
      return { version: "1.0.0", docs: [] };
    }
  }

  async writeIndex(next: DocumentIndexFile): Promise<void> {
    await withDocIndexWriteLock(async () => {
      await atomicWriteJson(this.cfg.docIndexPath, next);
    });
  }

  // -----------------------------
  // Client-safe views
  // -----------------------------

  toClientDoc(doc: DocumentIndexRecord): ClientDoc {
    const mimeType = safeString(doc.mimeType, 120);
    const t = safeString(doc.title, 260);
    const f = safeString(doc.filename, 260);

    return {
      docId: doc.docId,
      title: t,
      filename: f,
      mimeType,
      docType: docTypeCategory(mimeType),

      sizeBytes: safeNumber(doc.sizeBytes),
      createdAt: doc.createdAt ?? null,
      updatedAt: doc.updatedAt ?? null,

      folderPath: safeString(doc.folderPath, 260),
      sheets: Array.isArray(doc.sheets) ? doc.sheets.slice(0, 64) : null,
      pageCount: safeNumber(doc.pageCount),
      slideCount: safeNumber(doc.slideCount),

      openUrl: `${this.cfg.openRouteBase}/${encodeURIComponent(doc.docId)}`,
      whereUrl: `${this.cfg.whereRouteBase}/${encodeURIComponent(doc.docId)}`,
    };
  }

  // -----------------------------
  // Public operations
  // -----------------------------

  async listDocs(opts: ListDocsOptions = {}): Promise<ClientDoc[]> {
    const index = await this.readIndex();
    let docs = index.docs.slice();

    // Filter: mimeTypes
    if (opts.mimeTypes?.length) {
      const set = new Set(opts.mimeTypes.map((m) => String(m).toLowerCase()));
      docs = docs.filter(
        (d) =>
          (d.mimeType ?? "").toLowerCase() &&
          set.has((d.mimeType ?? "").toLowerCase()),
      );
    }

    // Filter: docTypes
    if (opts.docTypes?.length) {
      const set = new Set(opts.docTypes);
      docs = docs.filter((d) =>
        set.has(docTypeCategory(safeString(d.mimeType, 120))),
      );
    }

    // Filter: free text query against title/filename
    if (opts.query && opts.query.trim()) {
      const q = normalizeKey(opts.query);
      docs = docs.filter((d) => {
        const titleKey = normalizeKey(d.title ?? null);
        const fileKey = normalizeKey(d.filename ?? null);
        return titleKey.includes(q) || fileKey.includes(q);
      });
    }

    // Sort stable
    const sortBy = opts.sortBy ?? "updatedAt";
    const dir = opts.sortDir ?? "desc";
    const mult = dir === "asc" ? 1 : -1;

    docs = stableSort(docs, (a, b) => {
      switch (sortBy) {
        case "updatedAt": {
          const au =
            parseDateAny(a.updatedAt) ?? parseDateAny(a.createdAt) ?? 0;
          const bu =
            parseDateAny(b.updatedAt) ?? parseDateAny(b.createdAt) ?? 0;
          return (au - bu) * mult;
        }
        case "createdAt": {
          const au = parseDateAny(a.createdAt) ?? 0;
          const bu = parseDateAny(b.createdAt) ?? 0;
          return (au - bu) * mult;
        }
        case "sizeBytes": {
          const au = safeNumber(a.sizeBytes) ?? 0;
          const bu = safeNumber(b.sizeBytes) ?? 0;
          return (au - bu) * mult;
        }
        case "title": {
          const au = safeString(a.title, 260) ?? "";
          const bu = safeString(b.title, 260) ?? "";
          return au.localeCompare(bu) * mult;
        }
        case "filename": {
          const au = safeString(a.filename, 260) ?? "";
          const bu = safeString(b.filename, 260) ?? "";
          return au.localeCompare(bu) * mult;
        }
        default:
          return 0;
      }
    });

    // Soft limit to prevent UI overload
    const limit =
      typeof opts.limit === "number"
        ? Math.max(1, opts.limit)
        : this.cfg.maxDocsSoft;
    docs = docs.slice(0, limit);

    return docs.map((d) => this.toClientDoc(d));
  }

  async getDoc(docId: string): Promise<ClientDoc | null> {
    const index = await this.readIndex();
    const doc = index.docs.find((d) => d.docId === docId) ?? null;
    return doc ? this.toClientDoc(doc) : null;
  }

  async getDocRecord(docId: string): Promise<DocumentIndexRecord | null> {
    const index = await this.readIndex();
    return index.docs.find((d) => d.docId === docId) ?? null;
  }

  async where(docId: string): Promise<WhereInfo> {
    const doc = await this.getDocRecord(docId);
    if (!doc)
      throw new DocumentAppError("not_found", "Document not found", 404);

    return {
      docId: doc.docId,
      folderPath: safeString(doc.folderPath, 260),
      filename: safeString(doc.filename, 260),
      title: safeString(doc.title, 260),
    };
  }

  /**
   * Returns the absolute path & download details for opening the file.
   * Controllers should stream this path (never return it to clients).
   */
  async openInfo(docId: string): Promise<OpenInfo> {
    const doc = await this.getDocRecord(docId);
    if (!doc)
      throw new DocumentAppError("not_found", "Document not found", 404);

    const rel =
      safeString(doc.relativePath, 500) || safeString(doc.storageKey, 500);
    if (!rel)
      throw new DocumentAppError(
        "missing_storage_pointer",
        "Storage pointer missing",
        500,
      );

    const absolutePath = safeJoinUnder(this.cfg.storageDir, rel);

    const mimeType =
      safeString(doc.mimeType, 120) || "application/octet-stream";
    const downloadName = guessDownloadName(doc);

    return { docId: doc.docId, absolutePath, mimeType, downloadName };
  }

  /**
   * Remove a document from index; optionally hard delete file.
   */
  async deleteDoc(
    docId: string,
    opts: { hardDelete?: boolean } = {},
  ): Promise<{ deleted: ClientDoc; hardDeleted: boolean }> {
    const hardDelete = Boolean(opts.hardDelete);

    const deleted = await withDocIndexWriteLock(async () => {
      const index = await this.readIndex();
      const i = index.docs.findIndex((d) => d.docId === docId);
      if (i === -1) return null;

      const doc = index.docs[i];
      index.docs.splice(i, 1);
      await atomicWriteJson(this.cfg.docIndexPath, index);
      return doc;
    });

    if (!deleted)
      throw new DocumentAppError("not_found", "Document not found", 404);

    if (hardDelete) {
      const rel =
        safeString(deleted.relativePath, 500) ||
        safeString(deleted.storageKey, 500);
      if (rel) {
        try {
          const abs = safeJoinUnder(this.cfg.storageDir, rel);
          await fs.unlink(abs);
        } catch {
          // ignore: index already removed
        }
      }
    }

    return { deleted: this.toClientDoc(deleted), hardDeleted: hardDelete };
  }

  /**
   * Convenience helper for chat: generate pill-ready source attachment.
   * (Never includes absolute paths.)
   */
  async toSourceAttachment(
    docId: string,
    extra?: Partial<Omit<SourceAttachment, "docId">>,
  ): Promise<SourceAttachment | null> {
    const doc = await this.getDocRecord(docId);
    if (!doc) return null;

    return {
      docId: doc.docId,
      title: safeString(doc.title, 260) ?? undefined,
      filename: safeString(doc.filename, 260) ?? undefined,
      mimeType: safeString(doc.mimeType, 120) ?? undefined,
      url: `${this.cfg.openRouteBase}/${encodeURIComponent(doc.docId)}`,
      ...(extra ?? {}),
    };
  }
}

// A tiny shared type for chat sources
export type SourceAttachment = {
  docId?: string;
  title?: string;
  filename?: string;
  mimeType?: string;
  url?: string;
  page?: number;
  slide?: number;
  sheet?: string;
  locationKey?: string;
};

export default DocumentAppService;
