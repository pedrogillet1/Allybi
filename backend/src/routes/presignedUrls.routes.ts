// src/routes/presignedUrls.routes.ts
//
// Bulk presigned URL generation for direct-to-S3 uploads.
// Supports local storage mode for fast development (STORAGE_PROVIDER=local).
// Frontend sends file metadata, backend creates document records + presigned PUT URLs (or local upload URLs).

import { Router, Response, Request } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { presignedUrlLimiter } from "../middleware/rateLimit.middleware";
import prisma from "../config/database";
import { S3StorageService } from "../services/retrieval/s3Storage.service";
import { UPLOAD_CONFIG } from "../config/upload.config";
import { randomUUID } from "crypto";
import { addDocumentJob, addDocumentJobsBulk } from "../queues/document.queue";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

const router = Router();

// Local storage setup for development
const isLocalStorage = UPLOAD_CONFIG.STORAGE_PROVIDER === "local";
const localStoragePath = UPLOAD_CONFIG.LOCAL_STORAGE_PATH;

// Multer for local file uploads
const localUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES },
});

let _s3: S3StorageService | null = null;
function s3(): S3StorageService {
  if (!_s3) _s3 = new S3StorageService();
  return _s3;
}

/**
 * Save file to local storage (for development)
 */
async function saveToLocalStorage(key: string, buffer: Buffer): Promise<void> {
  const filePath = path.join(localStoragePath, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

/**
 * Get file from local storage
 */
async function getFromLocalStorage(key: string): Promise<Buffer> {
  const filePath = path.join(localStoragePath, key);
  return fs.readFile(filePath);
}

/**
 * Infer MIME type from file extension when the browser-provided type is missing or generic.
 */
function inferMimeType(fileName: string, providedType?: string): string {
  if (providedType && providedType !== "application/octet-stream") return providedType;

  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return "application/octet-stream";

  const mimeMap: Record<string, string> = {
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    rtf: "application/rtf",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    txt: "text/plain",
    md: "text/markdown",
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    heic: "image/heic",
    heif: "image/heif",
    // Audio/Video
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    webm: "video/webm",
    // Archives
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    gz: "application/gzip",
    tar: "application/x-tar",
    // Code/Data
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    ts: "application/typescript",
    py: "text/x-python",
    java: "text/x-java-source",
    c: "text/x-c",
    cpp: "text/x-c++src",
    h: "text/x-c",
    // Ebooks
    epub: "application/epub+zip",
    mobi: "application/x-mobipocket-ebook",
  };

  return mimeMap[ext] || "application/octet-stream";
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\u00C0-\u024F\u1E00-\u1EFF]/g, "_");
}

// ---------------------------------------------------------------------------
// Supported file types - reject unsupported formats EARLY to save processing
// ---------------------------------------------------------------------------
const SUPPORTED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/tab-separated-values",
  // Images (OCR)
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/heic",
  "image/heif",
]);

const UNSUPPORTED_EXTENSIONS = new Set([
  // Video - never supported
  "mp4", "mov", "avi", "webm", "mkv", "flv", "wmv", "m4v", "3gp",
  // Audio - never supported
  "mp3", "wav", "aac", "flac", "ogg", "wma", "m4a",
  // Vector/special formats - not useful for text extraction
  "svg", "eps", "ai",
  // Archives - not directly indexable
  "zip", "rar", "7z", "gz", "tar",
  // Executables/binaries
  "exe", "dll", "so", "dmg", "app",
]);

interface FileValidationResult {
  valid: boolean;
  reason?: string;
}

function validateFileForProcessing(fileName: string, mimeType: string): FileValidationResult {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  // Check unsupported extensions first (fast path)
  if (UNSUPPORTED_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `Unsupported file type: .${ext}` };
  }

  // Check if mime type is supported
  if (SUPPORTED_MIME_TYPES.has(mimeType)) {
    return { valid: true };
  }

  // Allow generic image/* types (will use OCR)
  if (mimeType.startsWith("image/")) {
    // But reject SVG and GIF
    if (mimeType === "image/svg+xml" || mimeType === "image/gif" || mimeType === "image/webp") {
      return { valid: false, reason: `Unsupported image format: ${mimeType}` };
    }
    return { valid: true };
  }

  // Allow generic text/* types
  if (mimeType.startsWith("text/")) {
    return { valid: true };
  }

  // Reject everything else
  return { valid: false, reason: `Unsupported file type: ${mimeType}` };
}

function buildStorageKey(userId: string, docId: string, fileName: string): string {
  const safeName = sanitizeFileName(fileName);
  return `users/${userId}/docs/${docId}/${safeName}`;
}

/**
 * Extract relativePath from a file object, accepting multiple field name variants.
 * Normalises backslashes → forward slashes and strips leading slashes.
 */
function resolveRelativePath(file: Record<string, any>): string | null {
  const raw = file.relativePath || file.webkitRelativePath || file.relative_path || null;
  if (!raw || typeof raw !== "string") return null;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  // Reject path traversal attempts
  const parts = normalized.split("/");
  if (parts.some(p => p === ".." || p === ".")) return null;
  return normalized;
}

/**
 * Server-side folder hierarchy creation from relativePath.
 *
 * When the frontend sends files with `relativePath` (e.g. "MyFolder/Sub/file.pdf"),
 * we create the matching folder tree in the DB and return a map of path → folderId.
 * This mirrors the old presigned-url.controller.ts behaviour so folder uploads
 * land in the correct tree regardless of whether the frontend called /folders/bulk.
 */
async function createFolderHierarchy(
  files: Array<Record<string, any>>,
  userId: string,
  rootFolderId?: string | null,
): Promise<Map<string, string>> {
  const folderMap = new Map<string, string>();

  if (rootFolderId) folderMap.set("", rootFolderId);

  // Collect unique folder paths from relativePath values
  const folderPaths = new Set<string>();
  for (const file of files) {
    const rp = resolveRelativePath(file);
    if (!rp) continue;
    const parts = rp.split("/");
    // Build every ancestor: "A/B/C/file.txt" → ["A", "A/B", "A/B/C"]
    for (let i = 0; i < parts.length - 1; i++) {
      folderPaths.add(parts.slice(0, i + 1).join("/"));
    }
  }

  if (folderPaths.size === 0) return folderMap;

  // Sort shallowest-first so parents exist before children
  const sorted = Array.from(folderPaths).sort(
    (a, b) => a.split("/").length - b.split("/").length,
  );

  for (const folderPath of sorted) {
    const parts = folderPath.split("/");
    const folderName = parts[parts.length - 1];

    let parentFolderId = rootFolderId || null;
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      parentFolderId = folderMap.get(parentPath) ?? parentFolderId;
    }

    // Re-use existing folder with same name + parent
    const existing = await prisma.folder.findFirst({
      where: { userId, name: folderName, parentFolderId },
    });

    if (existing) {
      folderMap.set(folderPath, existing.id);
    } else {
      const created = await prisma.folder.create({
        data: {
          userId,
          name: folderName,
          parentFolderId,
          path: parentFolderId ? `/${folderPath}` : `/${folderName}`,
        },
      });
      folderMap.set(folderPath, created.id);
    }
  }

  return folderMap;
}

/**
 * POST /bulk — Generate presigned PUT URLs for a batch of files.
 *
 * Request body:
 *   { files: [{ fileName, fileType, fileSize, relativePath?, folderId? }], folderId?, uploadSessionId? }
 *
 * Response:
 *   { presignedUrls: [{ url, storageKey, documentId }], documentIds: [string], skippedFiles: [] }
 */
router.post(
  "/bulk",
  authMiddleware,
  presignedUrlLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { files = [], folderId = null, uploadSessionId = null } = req.body || {};

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    if (files.length > UPLOAD_CONFIG.MAX_BATCH_FILES) {
      res.status(400).json({ error: `Too many files. Maximum ${UPLOAD_CONFIG.MAX_BATCH_FILES} per batch.` });
      return;
    }

    try {
      const presignedUrls: string[] = [];
      const documentIds: string[] = [];
      const skippedFiles: string[] = [];

      // Diagnostic: log first file object to verify field names
      if (files.length > 0) {
        const sample = files[0];
        console.log(`[presigned-urls/bulk] ${files.length} files, batchFolderId=${folderId}, sample keys: ${Object.keys(sample).join(",")}, relativePath=${sample.relativePath ?? "MISSING"}, webkitRelativePath=${sample.webkitRelativePath ?? "MISSING"}, folderId=${sample.folderId ?? "MISSING"}`);
      }

      // Create folder hierarchy from relativePath values (server-side backup)
      const folderMap = await createFolderHierarchy(files, userId, folderId);

      if (folderMap.size > 0) {
        console.log(`[presigned-urls/bulk] folderMap created: ${folderMap.size} entries — keys: ${Array.from(folderMap.keys()).join(", ")}`);
      }

      // Process files in parallel (within each batch from frontend)
      const results = await Promise.all(files.map(async (file) => {
        const { fileName, fileType, fileSize, folderId: fileFolderId } = file;
        const relativePath = resolveRelativePath(file);

        // Use relativePath for skip identification to avoid collisions with same-name files in different folders
        const skipIdentifier = relativePath || fileName || "unknown";

        if (!fileName || typeof fileName !== "string") {
          return { skipped: skipIdentifier, reason: "Invalid filename" };
        }

        if (fileSize > UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
          return { skipped: skipIdentifier, reason: "File too large" };
        }

        // EARLY REJECTION: Check if file type is supported before creating DB record
        const resolvedMimeType = inferMimeType(fileName, fileType);
        const validation = validateFileForProcessing(fileName, resolvedMimeType);
        if (!validation.valid) {
          console.log(`[presigned-urls/bulk] Rejecting unsupported file: ${skipIdentifier} (${validation.reason})`);
          return { skipped: skipIdentifier, reason: validation.reason };
        }

        // Resolve folder priority:
        //   1. Per-file folderId that differs from batch folderId (frontend explicitly set it)
        //   2. relativePath lookup in server-created folderMap
        //   3. Per-file folderId (may equal batch folderId as fallback)
        //   4. Batch-level folderId
        let targetFolderId: string | null = null;

        const hasExplicitFolderId = fileFolderId && fileFolderId !== folderId;
        if (hasExplicitFolderId) {
          targetFolderId = fileFolderId;
        } else if (relativePath) {
          const parts = relativePath.split("/");
          if (parts.length > 1) {
            const folderPath = parts.slice(0, -1).join("/");
            targetFolderId = folderMap.get(folderPath) ?? null;
          }
        }
        if (!targetFolderId) targetFolderId = fileFolderId || folderId || null;

        const docId = randomUUID();
        const storageKey = buildStorageKey(userId, docId, fileName);

        // Create document record first
        const doc = await prisma.document.create({
          data: {
            id: docId,
            userId,
            folderId: targetFolderId,
            filename: fileName,
            encryptedFilename: storageKey,
            fileSize: fileSize || 0,
            mimeType: resolvedMimeType,
            fileHash: `pending-${docId}`,
            status: "uploading",
            uploadSessionId: uploadSessionId || null,
          },
        });

        // For local storage: return local upload endpoint URL
        // For S3: return presigned PUT URL
        let url: string;
        if (isLocalStorage) {
          // Local mode: frontend will POST to /api/presigned-urls/local-upload/:documentId
          url = `/api/presigned-urls/local-upload/${docId}`;
        } else {
          const presigned = await s3().presignUpload({
            key: storageKey,
            mimeType: resolvedMimeType,
            expiresInSeconds: UPLOAD_CONFIG.PRESIGNED_URL_EXPIRATION_SECONDS,
          });
          url = presigned.url;
        }

        return { url, documentId: doc.id, isLocal: isLocalStorage };
      }));

      // Split results into arrays
      for (const r of results) {
        if ('skipped' in r) { skippedFiles.push(r.skipped as string); continue; }
        presignedUrls.push(r.url);
        documentIds.push(r.documentId);
      }

      res.json({ presignedUrls, documentIds, skippedFiles, storageMode: isLocalStorage ? "local" : "s3" });
    } catch (e: any) {
      console.error("POST /presigned-urls/bulk error:", e);
      res.status(500).json({ error: "Failed to generate presigned URLs" });
    }
  }
);

/**
 * POST /complete-bulk — Bulk completion with optional S3 verification.
 *
 * Request body:
 *   { documentIds: [string], uploadSessionId?: string, skipS3Check?: boolean }
 *
 * Response:
 *   { confirmed: [string], failed: [string], stats: { confirmed: number, failed: number, skipped: number } }
 */
router.post(
  "/complete-bulk",
  authMiddleware,
  presignedUrlLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { documentIds = [], uploadSessionId } = req.body || {};

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.json({ confirmed: [], failed: [], stats: { confirmed: 0, failed: 0, skipped: 0 } });
      return;
    }

    try {
      // Batch update all documents to "uploaded" status
      await prisma.document.updateMany({
        where: { id: { in: documentIds }, userId, status: "uploading" },
        data: { status: "uploaded" },
      });

      // Find which ones were actually updated (with details for queue)
      const updated = await prisma.document.findMany({
        where: { id: { in: documentIds }, userId },
        select: { id: true, status: true, filename: true, mimeType: true, encryptedFilename: true },
      });

      const confirmed = updated.filter(d => d.status === "uploaded");
      const confirmedIds = confirmed.map(d => d.id);
      const failed = documentIds.filter(id => !confirmedIds.includes(id));

      // Enqueue confirmed documents for processing (single Redis round-trip)
      const bulkItems = confirmed.map(doc => ({
        documentId: doc.id,
        userId,
        filename: doc.filename || 'unknown',
        mimeType: doc.mimeType || "application/octet-stream",
        encryptedFilename: doc.encryptedFilename || undefined,
      }));
      const bulkJobs = await addDocumentJobsBulk(bulkItems);
      const queued = bulkJobs.length;

      console.log(`[complete-bulk] ${confirmedIds.length} confirmed, ${queued} queued for processing, ${failed.length} failed`);

      res.json({
        confirmed: confirmedIds,
        failed,
        stats: {
          confirmed: confirmedIds.length,
          failed: failed.length,
          skipped: 0,
          queued,
        },
      });
    } catch (e: any) {
      console.error("POST /presigned-urls/complete-bulk error:", e);
      res.status(500).json({ error: "Failed to complete bulk uploads" });
    }
  }
);

/**
 * POST /reconcile — Reconcile upload session: mark orphaned docs as failed.
 *
 * Request body:
 *   { documentIds: [string], sessionId?: string }
 *
 * Response:
 *   { orphanedCount: number, verifiedCount: number, orphanedDocuments: [string], verifiedDocuments: [string] }
 */
router.post(
  "/reconcile",
  authMiddleware,
  presignedUrlLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { documentIds = [] } = req.body || {};

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.json({ orphanedCount: 0, verifiedCount: 0, orphanedDocuments: [], verifiedDocuments: [] });
      return;
    }

    try {
      const docs = await prisma.document.findMany({
        where: { id: { in: documentIds }, userId },
        select: { id: true, status: true },
      });

      const verifiedDocuments: string[] = [];
      const orphanedDocuments: string[] = [];

      for (const doc of docs) {
        if (doc.status === "uploaded" || doc.status === "processed") {
          verifiedDocuments.push(doc.id);
        } else if (doc.status === "uploading") {
          orphanedDocuments.push(doc.id);
        }
      }

      // Mark orphaned documents as failed_incomplete
      if (orphanedDocuments.length > 0) {
        await prisma.document.updateMany({
          where: { id: { in: orphanedDocuments }, userId },
          data: { status: "failed" },
        });
      }

      res.json({
        orphanedCount: orphanedDocuments.length,
        verifiedCount: verifiedDocuments.length,
        orphanedDocuments,
        verifiedDocuments,
      });
    } catch (e: any) {
      console.error("POST /presigned-urls/reconcile error:", e);
      res.status(500).json({ error: "Failed to reconcile uploads" });
    }
  }
);

/**
 * POST /complete — Bulk completion notification after S3 uploads finish.
 *
 * Marks documents as "uploaded" after the frontend finishes uploading to S3.
 *
 * Request body:
 *   { documentIds: [string] }
 *
 * Response:
 *   { confirmed: [string], failed: [string], stats: { confirmed: number, failed: number, skipped: number } }
 */
router.post(
  "/complete",
  authMiddleware,
  presignedUrlLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { documentIds = [] } = req.body || {};

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.json({ confirmed: [], failed: [], stats: { confirmed: 0, failed: 0, skipped: 0 } });
      return;
    }

    try {
      const confirmed: string[] = [];
      const failed: string[] = [];

      for (const docId of documentIds) {
        try {
          await prisma.document.updateMany({
            where: { id: docId, userId, status: "uploading" },
            data: { status: "uploaded" },
          });
          confirmed.push(docId);
        } catch {
          failed.push(docId);
        }
      }

      // Enqueue confirmed documents for processing
      if (confirmed.length > 0) {
        const docs = await prisma.document.findMany({
          where: { id: { in: confirmed }, userId },
          select: { id: true, filename: true, mimeType: true, encryptedFilename: true },
        });
        addDocumentJobsBulk(docs.map(doc => ({
          documentId: doc.id,
          userId,
          filename: doc.filename || 'unknown',
          mimeType: doc.mimeType || "application/octet-stream",
          encryptedFilename: doc.encryptedFilename || undefined,
        }))).catch(err => console.error(`Failed to bulk queue:`, err.message));
      }

      res.json({
        confirmed,
        failed,
        stats: {
          confirmed: confirmed.length,
          failed: failed.length,
          skipped: 0,
        },
      });
    } catch (e: any) {
      console.error("POST /presigned-urls/complete error:", e);
      res.status(500).json({ error: "Failed to complete uploads" });
    }
  }
);

/**
 * POST /local-upload/:documentId — Direct file upload to local storage (development only)
 *
 * This endpoint is only active when STORAGE_PROVIDER=local.
 * Frontend uploads directly to this endpoint instead of S3.
 */
router.post(
  "/local-upload/:documentId",
  authMiddleware,
  localUpload.single("file"),
  async (req: any, res: Response): Promise<void> => {
    if (!isLocalStorage) {
      res.status(400).json({ error: "Local uploads not enabled. Set STORAGE_PROVIDER=local" });
      return;
    }

    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { documentId } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    try {
      // Verify document belongs to user and is in uploading state
      const doc = await prisma.document.findFirst({
        where: { id: documentId, userId, status: "uploading" },
      });

      if (!doc) {
        res.status(404).json({ error: "Document not found or not in uploading state" });
        return;
      }

      // Save file to local storage
      const storageKey = doc.encryptedFilename || `users/${userId}/docs/${documentId}/${doc.filename}`;
      await saveToLocalStorage(storageKey, file.buffer);

      // Update document status
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "uploaded" },
      });

      // Queue for processing
      await addDocumentJob({
        documentId,
        userId,
        filename: doc.filename || "unknown",
        mimeType: doc.mimeType || "application/octet-stream",
        encryptedFilename: storageKey,
      });

      console.log(`[local-upload] File saved: ${storageKey} (${file.size} bytes)`);
      res.json({ success: true, documentId, storageKey });
    } catch (e: any) {
      console.error("POST /local-upload error:", e);
      res.status(500).json({ error: "Failed to upload file" });
    }
  }
);

/**
 * GET /storage-mode — Check current storage mode
 */
router.get("/storage-mode", (_req: Request, res: Response) => {
  res.json({
    mode: UPLOAD_CONFIG.STORAGE_PROVIDER,
    isLocal: isLocalStorage,
    localPath: isLocalStorage ? localStoragePath : null,
  });
});

export default router;
