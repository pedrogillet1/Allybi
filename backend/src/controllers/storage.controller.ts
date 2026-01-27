import express, { Request, Response } from "express";
import path from "path";
import * as fs from "fs/promises";

/**
 * Storage Controller (ChatGPT-parity)
 * - Provides safe, deterministic API endpoints for listing/retrieving/deleting stored documents.
 * - Never leaks internal server paths in responses.
 * - Does NOT do retrieval, chat, or AI.
 * - Used by the Chat UI for "open/where" style source links.
 */

type EnvName = "production" | "staging" | "dev" | "local";

type AuthenticatedRequest = Request & {
  user?: { id: string };
};

type DocIndexRecord = {
  docId: string;
  title?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  storageKey?: string | null;
  relativePath?: string | null;
  folderPath?: string | null;
  sheets?: string[] | null;
  pageCount?: number | null;
  slideCount?: number | null;
};

type DocIndexFile = {
  version: string;
  docs: DocIndexRecord[];
};

const DEFAULT_DOC_INDEX_PATH = path.resolve(process.cwd(), "storage/doc-index.json");
const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), "storage/uploads");

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

function sanitizeDocForClient(doc: DocIndexRecord) {
  return {
    docId: doc.docId,
    title: safeString(doc.title, 260),
    filename: safeString(doc.filename, 260),
    mimeType: safeString(doc.mimeType, 120),
    sizeBytes: safeNumber(doc.sizeBytes),
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
    folderPath: safeString(doc.folderPath, 260),
    sheets: Array.isArray(doc.sheets) ? doc.sheets.slice(0, 64) : null,
    pageCount: safeNumber(doc.pageCount),
    slideCount: safeNumber(doc.slideCount),
  };
}

async function readDocIndex(filePath: string): Promise<DocIndexFile> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid doc index");
    if (!Array.isArray(parsed.docs)) parsed.docs = [];
    if (typeof parsed.version !== "string") parsed.version = "1.0.0";
    return parsed as DocIndexFile;
  } catch {
    return { version: "1.0.0", docs: [] };
  }
}

async function atomicWriteJson(filePath: string, data: any): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

function requireAuth(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.user?.id) {
    res.status(401).json({ ok: false, error: { code: "unauthorized", message: "Unauthorized" } });
    return false;
  }
  return true;
}

function safeJoinStorage(storageDir: string, relativePath: string): string {
  const full = path.resolve(storageDir, relativePath);
  const base = path.resolve(storageDir);
  if (!full.startsWith(base)) {
    throw new Error("invalid_path");
  }
  return full;
}

function guessDownloadName(doc: DocIndexRecord): string {
  const f = safeString(doc.filename, 180);
  if (f) return f;
  const t = safeString(doc.title, 180);
  if (t) return `${t}.bin`;
  return `${doc.docId}.bin`;
}

export function createStorageRouter(opts?: {
  env?: EnvName;
  docIndexPath?: string;
  storageDir?: string;
  requireAuth?: boolean;
}) {
  const router = express.Router();

  const env = opts?.env ?? ((process.env.NODE_ENV as EnvName) || "dev");
  const docIndexPath = opts?.docIndexPath ?? DEFAULT_DOC_INDEX_PATH;
  const storageDir = opts?.storageDir ?? DEFAULT_STORAGE_DIR;
  const authRequired = opts?.requireAuth ?? true;

  router.get("/docs", async (req: AuthenticatedRequest, res: Response) => {
    if (authRequired && !requireAuth(req, res)) return;

    const db = await readDocIndex(docIndexPath);
    const docs = db.docs.slice().sort((a, b) => {
      const au = typeof a.updatedAt === "number" ? a.updatedAt : Date.parse(String(a.updatedAt ?? 0)) || 0;
      const bu = typeof b.updatedAt === "number" ? b.updatedAt : Date.parse(String(b.updatedAt ?? 0)) || 0;
      return bu - au;
    });

    return res.json({ ok: true, docs: docs.map(sanitizeDocForClient) });
  });

  router.get("/docs/:docId", async (req: AuthenticatedRequest, res: Response) => {
    if (authRequired && !requireAuth(req, res)) return;

    const docId = String(req.params.docId || "").trim();
    if (!docId) {
      return res.status(400).json({ ok: false, error: { code: "bad_request", message: "docId required" } });
    }

    const db = await readDocIndex(docIndexPath);
    const doc = db.docs.find((d) => d.docId === docId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: { code: "not_found", message: "Document not found" } });
    }

    return res.json({
      ok: true,
      doc: {
        ...sanitizeDocForClient(doc),
        openUrl: `/api/storage/open/${encodeURIComponent(docId)}`,
        whereUrl: `/api/storage/where/${encodeURIComponent(docId)}`,
      },
    });
  });

  router.get("/open/:docId", async (req: AuthenticatedRequest, res: Response) => {
    if (authRequired && !requireAuth(req, res)) return;

    const docId = String(req.params.docId || "").trim();
    const db = await readDocIndex(docIndexPath);
    const doc = db.docs.find((d) => d.docId === docId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: { code: "not_found", message: "Document not found" } });
    }

    const rel = safeString(doc.relativePath, 500) || safeString(doc.storageKey, 500);
    if (!rel) {
      return res.status(500).json({ ok: false, error: { code: "missing_storage_pointer", message: "Storage pointer missing" } });
    }

    let fullPath: string;
    try {
      fullPath = safeJoinStorage(storageDir, rel);
    } catch {
      return res.status(400).json({ ok: false, error: { code: "invalid_path", message: "Invalid document path" } });
    }

    try {
      const mime = safeString(doc.mimeType, 120) || "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `inline; filename="${guessDownloadName(doc).replace(/"/g, "")}"`);

      const fileHandle = await fs.open(fullPath, "r");
      const stream = fileHandle.createReadStream();
      stream.on("close", async () => {
        try {
          await fileHandle.close();
        } catch {}
      });
      stream.pipe(res);
    } catch {
      return res.status(500).json({ ok: false, error: { code: "read_failed", message: "Unable to open document" } });
    }
  });

  router.get("/where/:docId", async (req: AuthenticatedRequest, res: Response) => {
    if (authRequired && !requireAuth(req, res)) return;

    const docId = String(req.params.docId || "").trim();
    const db = await readDocIndex(docIndexPath);
    const doc = db.docs.find((d) => d.docId === docId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: { code: "not_found", message: "Document not found" } });
    }

    return res.json({
      ok: true,
      docId: doc.docId,
      folderPath: safeString(doc.folderPath, 260) || null,
      filename: safeString(doc.filename, 260) || null,
      title: safeString(doc.title, 260) || null,
    });
  });

  router.delete("/docs/:docId", async (req: AuthenticatedRequest, res: Response) => {
    if (authRequired && !requireAuth(req, res)) return;

    const docId = String(req.params.docId || "").trim();
    const hardDelete = req.query.hard === "true";

    await fs.mkdir(path.dirname(docIndexPath), { recursive: true });

    const updated = await (async () => {
      const db = await readDocIndex(docIndexPath);
      const idx = db.docs.findIndex((d) => d.docId === docId);
      if (idx === -1) return null;

      const doc = db.docs[idx];
      db.docs.splice(idx, 1);
      await atomicWriteJson(docIndexPath, db);

      return doc;
    })();

    if (!updated) {
      return res.status(404).json({ ok: false, error: { code: "not_found", message: "Document not found" } });
    }

    if (hardDelete) {
      const rel = safeString(updated.relativePath, 500) || safeString(updated.storageKey, 500);
      if (rel) {
        try {
          const fullPath = safeJoinStorage(storageDir, rel);
          await fs.unlink(fullPath);
        } catch {
          // ignore file deletion errors (record already removed)
        }
      }
    }

    return res.json({ ok: true, deleted: sanitizeDocForClient(updated), hardDeleted: hardDelete });
  });

  return router;
}

export default createStorageRouter;
