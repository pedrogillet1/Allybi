// src/routes/presignedUrls.routes.ts
//
// Bulk presigned URL generation for direct-to-cloud-storage uploads (GCS).
// Supports local storage mode for fast development (STORAGE_PROVIDER=local).
// Frontend sends file metadata, backend creates document records + presigned PUT URLs (or local upload URLs).

import { Router, Response, Request } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { presignedUrlLimiter } from "../../../middleware/rateLimit.middleware";
import prisma from "../../../config/database";
import { GcsStorageService } from "../../../services/retrieval/gcsStorage.service";
import { UPLOAD_CONFIG } from "../../../config/upload.config";
import { randomUUID } from "crypto";
import {
  addDocumentJob,
  addDocumentJobsBulk,
} from "../../../queues/document.queue";
import {
  publishExtractFanoutJobsBulk,
  publishExtractJob,
  publishExtractJobsBulk,
  isPubSubAvailable,
} from "../../../services/jobs/pubsubPublisher.service";
import { env } from "../../../config/env";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import pLimit from "p-limit";

// Limit concurrent DB operations to prevent connection pool exhaustion
const dbConcurrencyLimit = pLimit(
  Number(process.env.DB_CONCURRENCY_LIMIT ?? 6),
);

const router = Router();

// Local storage setup for development
const isLocalStorage = UPLOAD_CONFIG.STORAGE_PROVIDER === "local";
const localStoragePath = UPLOAD_CONFIG.LOCAL_STORAGE_PATH;

// Multer for local file uploads
const localUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES },
});

let _gcs: GcsStorageService | null = null;
function gcs(): GcsStorageService {
  if (!_gcs) {
    _gcs = new GcsStorageService();
    _gcs.ensureBucketCors().catch(() => {});
  }
  return _gcs;
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
  if (providedType && providedType !== "application/octet-stream")
    return providedType;

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
  "mp4",
  "mov",
  "avi",
  "webm",
  "mkv",
  "flv",
  "wmv",
  "m4v",
  "3gp",
  // Audio - never supported
  "mp3",
  "wav",
  "aac",
  "flac",
  "ogg",
  "wma",
  "m4a",
  // Vector/special formats - not useful for text extraction
  "svg",
  "eps",
  "ai",
  // Archives - not directly indexable
  "zip",
  "rar",
  "7z",
  "gz",
  "tar",
  // Executables/binaries
  "exe",
  "dll",
  "so",
  "dmg",
  "app",
]);

interface FileValidationResult {
  valid: boolean;
  reason?: string;
}

function validateFileForProcessing(
  fileName: string,
  mimeType: string,
): FileValidationResult {
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
    if (
      mimeType === "image/svg+xml" ||
      mimeType === "image/gif" ||
      mimeType === "image/webp"
    ) {
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

function buildStorageKey(
  userId: string,
  docId: string,
  fileName: string,
): string {
  const safeName = sanitizeFileName(fileName);
  return `users/${userId}/docs/${docId}/${safeName}`;
}

/**
 * Extract relativePath from a file object, accepting multiple field name variants.
 * Normalises backslashes → forward slashes and strips leading slashes.
 */
function resolveRelativePath(file: Record<string, any>): string | null {
  const raw =
    file.relativePath || file.webkitRelativePath || file.relative_path || null;
  if (!raw || typeof raw !== "string") return null;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  // Reject path traversal attempts
  const parts = normalized.split("/");
  if (parts.some((p) => p === ".." || p === ".")) return null;
  return normalized;
}

/**
 * Server-side folder hierarchy creation from relativePath.
 *
 * When the frontend sends files with `relativePath` (e.g. "MyFolder/Sub/file.pdf"),
 * we create the matching folder tree in the DB and return a map of path → folderId.
 * This mirrors the old presigned-url.controller.ts behaviour so folder uploads
 * land in the correct tree regardless of whether the frontend called /folders/bulk.
 *
 * OPTIMIZED: Uses bulk queries instead of per-folder DB calls.
 * - Fetches ALL user folders in ONE query
 * - Uses in-memory lookups for existence checks
 * - Creates missing folders in batches
 */
async function createFolderHierarchy(
  files: Array<Record<string, any>>,
  userId: string,
  rootFolderId?: string | null,
): Promise<Map<string, string>> {
  const t0 = Date.now();
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
  const candidateNames = Array.from(
    new Set(
      Array.from(folderPaths)
        .map((folderPath) => folderPath.split("/").pop() || "")
        .filter(Boolean),
    ),
  );

  // OPTIMIZATION: Fetch ALL existing folders for this user in ONE query
  // This replaces N sequential findFirst queries with 1 batch query
  const t1 = Date.now();
  const existingFolders = await prisma.folder.findMany({
    where: {
      userId,
      isDeleted: false,
      ...(candidateNames.length > 0 ? { name: { in: candidateNames } } : {}),
    },
    select: { id: true, name: true, parentFolderId: true },
  });
  console.log(
    `[createFolderHierarchy] Fetched ${existingFolders.length} existing folders in ${Date.now() - t1}ms`,
  );

  // Build lookup map: "parentId:name" → folderId
  const existingLookup = new Map<string, string>();
  for (const f of existingFolders) {
    const key = `${f.parentFolderId || "null"}:${f.name}`;
    existingLookup.set(key, f.id);
  }

  // Sort shallowest-first so parents exist before children
  const sorted = Array.from(folderPaths).sort(
    (a, b) => a.split("/").length - b.split("/").length,
  );

  // Process folders by depth level for proper parent resolution
  // Group by depth to batch create folders at same level
  const t2 = Date.now();
  const byDepth = new Map<number, string[]>();
  for (const folderPath of sorted) {
    const depth = folderPath.split("/").length;
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth)!.push(folderPath);
  }

  // Process each depth level
  for (const depth of Array.from(byDepth.keys()).sort((a, b) => a - b)) {
    const pathsAtDepth = byDepth.get(depth)!;
    const toCreate: Array<{
      folderPath: string;
      folderName: string;
      parentFolderId: string | null;
      dbPath: string;
    }> = [];

    for (const folderPath of pathsAtDepth) {
      const parts = folderPath.split("/");
      const folderName = parts[parts.length - 1];

      let parentFolderId = rootFolderId || null;
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join("/");
        parentFolderId = folderMap.get(parentPath) ?? parentFolderId;
      }

      // Check if exists (in-memory lookup)
      const lookupKey = `${parentFolderId || "null"}:${folderName}`;
      const existingId = existingLookup.get(lookupKey);

      if (existingId) {
        folderMap.set(folderPath, existingId);
      } else {
        // Queue for batch creation
        toCreate.push({
          folderPath,
          folderName,
          parentFolderId,
          dbPath: parentFolderId ? `/${folderPath}` : `/${folderName}`,
        });
      }
    }

    // Batch create all missing folders at this depth
    if (toCreate.length > 0) {
      // Use controlled concurrency to prevent DB connection pool exhaustion
      const created = await Promise.all(
        toCreate.map((item) =>
          dbConcurrencyLimit(async () => {
            const folder = await prisma.folder.create({
              data: {
                userId,
                name: item.folderName,
                parentFolderId: item.parentFolderId,
                path: item.dbPath,
              },
              select: { id: true, name: true, parentFolderId: true },
            });
            return { ...item, id: folder.id };
          }),
        ),
      );

      // Update maps with newly created folders
      for (const item of created) {
        folderMap.set(item.folderPath, item.id);
        const lookupKey = `${item.parentFolderId || "null"}:${item.folderName}`;
        existingLookup.set(lookupKey, item.id);
      }
    }
  }

  console.log(
    `[createFolderHierarchy] Created ${folderMap.size} folder mappings in ${Date.now() - t2}ms (total: ${Date.now() - t0}ms)`,
  );
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
    const t0 = Date.now();
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const {
      files = [],
      folderId = null,
      uploadSessionId = null,
      skipFolderHierarchy = false,
    } = req.body || {};

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    if (files.length > UPLOAD_CONFIG.MAX_BATCH_FILES) {
      res.status(400).json({
        error: `Too many files. Maximum ${UPLOAD_CONFIG.MAX_BATCH_FILES} per batch.`,
      });
      return;
    }

    try {
      const presignedUrls: string[] = [];
      const documentIds: string[] = [];
      const skippedFiles: string[] = [];

      // Diagnostic: log first file object to verify field names
      if (files.length > 0) {
        const sample = files[0];
        console.log(
          `[presigned-urls/bulk] START ${files.length} files, batchFolderId=${folderId}`,
        );
      }

      // Create folder hierarchy from relativePath values (server-side backup),
      // but skip when caller already resolved per-file folderIds.
      const filesWithNestedRelativePath = files.filter((file: any) => {
        const rp = resolveRelativePath(file);
        return !!rp && rp.split("/").length > 1;
      });
      const nestedFilesMissingFolderId = filesWithNestedRelativePath.filter(
        (file: any) => !file?.folderId,
      );
      const canSkipFolderHierarchy = nestedFilesMissingFolderId.length === 0;
      const shouldSkipFolderHierarchy =
        Boolean(skipFolderHierarchy) || canSkipFolderHierarchy;

      const tFolders = Date.now();
      const folderMap = shouldSkipFolderHierarchy
        ? new Map<string, string>()
        : await createFolderHierarchy(files, userId, folderId);
      console.log(
        `[presigned-urls/bulk] FOLDERS: ${Date.now() - tFolders}ms (${shouldSkipFolderHierarchy ? "skipped" : "resolved"})`,
      );

      // PHASE 1: Validate files and prepare document records (no DB calls yet)
      const tFiles = Date.now();
      const validFiles: Array<{
        docId: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        storageKey: string;
        targetFolderId: string | null;
        relativePath: string | null;
      }> = [];

      for (const file of files) {
        const { fileName, fileType, fileSize, folderId: fileFolderId } = file;
        const relativePath = resolveRelativePath(file);
        const skipIdentifier = relativePath || fileName || "unknown";

        if (!fileName || typeof fileName !== "string") {
          skippedFiles.push(skipIdentifier);
          continue;
        }

        if (fileSize > UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
          skippedFiles.push(skipIdentifier);
          continue;
        }

        const resolvedMimeType = inferMimeType(fileName, fileType);
        const validation = validateFileForProcessing(
          fileName,
          resolvedMimeType,
        );
        if (!validation.valid) {
          console.log(
            `[presigned-urls/bulk] Rejecting unsupported file: ${skipIdentifier} (${validation.reason})`,
          );
          skippedFiles.push(skipIdentifier);
          continue;
        }

        // Resolve folder priority
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

        validFiles.push({
          docId,
          fileName,
          fileSize: fileSize || 0,
          mimeType: resolvedMimeType,
          storageKey,
          targetFolderId,
          relativePath,
        });
      }

      // PHASE 2: Bulk insert all documents in ONE query (avoids connection pool exhaustion)
      if (validFiles.length > 0) {
        await prisma.document.createMany({
          data: validFiles.map((f) => ({
            id: f.docId,
            userId,
            folderId: f.targetFolderId,
            filename: f.fileName,
            encryptedFilename: f.storageKey,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
            fileHash: `pending-${f.docId}`,
            status: "uploading",
            uploadSessionId: uploadSessionId || null,
          })),
        });
      }

      // PHASE 3: Generate presigned URLs (controlled concurrency to avoid provider throttling)
      // Increased from 10 to 50 for faster presigned URL generation
      // 1000 files: 100 batches → 20 batches (5s → 1s)
      const PRESIGN_CONCURRENCY = 50;
      const results: Array<{
        url: string;
        documentId: string;
        isLocal: boolean;
      }> = [];

      for (let i = 0; i < validFiles.length; i += PRESIGN_CONCURRENCY) {
        const batch = validFiles.slice(i, i + PRESIGN_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (f) => {
            let url: string;
            if (isLocalStorage) {
              url = `/api/presigned-urls/local-upload/${f.docId}`;
            } else {
              const presigned = await gcs().presignUpload({
                key: f.storageKey,
                mimeType: f.mimeType,
                expiresInSeconds:
                  UPLOAD_CONFIG.PRESIGNED_URL_EXPIRATION_SECONDS,
              });
              url = presigned.url;
            }
            return { url, documentId: f.docId, isLocal: isLocalStorage };
          }),
        );
        results.push(...batchResults);
      }

      console.log(
        `[presigned-urls/bulk] FILES: ${Date.now() - tFiles}ms for ${validFiles.length} files (bulk DB + presigned URLs)`,
      );

      // Collect results (skipped files already handled in PHASE 1)
      for (const r of results) {
        presignedUrls.push(r.url);
        documentIds.push(r.documentId);
      }

      console.log(
        `[presigned-urls/bulk] TOTAL: ${Date.now() - t0}ms — ${documentIds.length} docs, ${skippedFiles.length} skipped`,
      );
      res.json({
        presignedUrls,
        documentIds,
        skippedFiles,
        storageMode: isLocalStorage ? "local" : "gcs",
      });
    } catch (e: any) {
      console.error("POST /presigned-urls/bulk error:", e);
      res.status(500).json({ error: "Failed to generate presigned URLs" });
    }
  },
);

/**
 * POST /complete-bulk — Bulk completion after direct-to-storage uploads finish.
 *
 * Request body:
 *   { documentIds: [string], uploadSessionId?: string }
 *
 * Response:
 *   {
 *     confirmed: [string],
 *     pending: [string],
 *     failed: [string],
 *     stats: { confirmed: number, pending: number, failed: number, skipped: number, transitioned: number, queued: number }
 *   }
 *
 * Notes:
 * - Idempotent: safe to call multiple times with the same documentIds.
 * - Designed for incremental completion (upload -> flush completion in small batches).
 */
router.post(
  "/complete-bulk",
  authMiddleware,
  presignedUrlLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { documentIds = [], uploadSessionId } = req.body || {};

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.json({
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
      return;
    }

    try {
      const now = new Date();

      // 1) Transition uploading -> uploaded (idempotent: docs not in 'uploading' are left unchanged)
      const updateResult = await prisma.document.updateMany({
        where: { id: { in: documentIds }, userId, status: "uploading" },
        data: { status: "uploaded", updatedAt: now },
      });

      // 2) Fetch current truth for these docs (covers repeat calls, retries, and partial sessions)
      const docs = await prisma.document.findMany({
        where: { id: { in: documentIds }, userId },
        select: {
          id: true,
          status: true,
          filename: true,
          mimeType: true,
          encryptedFilename: true,
        },
      });

      const byId = new Map(docs.map((d) => [d.id, d] as const));
      const missing = documentIds.filter((id) => !byId.has(id));

      const pending = docs
        .filter((d) => d.status === "uploading")
        .map((d) => d.id);
      const failedStatus = docs
        .filter((d) => d.status === "failed")
        .map((d) => d.id);

      const confirmedDocs = docs.filter((d) =>
        ["uploaded", "enriching", "indexed", "ready", "skipped"].includes(
          d.status,
        ),
      );
      const confirmedIds = confirmedDocs.map((d) => d.id);

      // Queue only docs that are currently 'uploaded' (the worker will claim uploaded -> enriching).
      // If publish fails, re-calling /complete-bulk will retry publish for any still-uploaded docs.
      const queueCandidates = docs.filter((d) => d.status === "uploaded");

      const failed = [...new Set([...missing, ...failedStatus])];

      const requestIdHeader =
        (req.headers["x-request-id"] as string | undefined) || undefined;
      console.log(
        `[complete-bulk] transitioned=${updateResult.count} confirmed=${confirmedIds.length} pending=${pending.length} failed=${failed.length} queued=${queueCandidates.length} requestId=${requestIdHeader || "none"} uploadSessionId=${uploadSessionId || "none"}`,
      );

      // Return immediately - don't block HTTP response on job publishing
      // This makes the response 1-2s faster for large batches
      res.json({
        confirmed: confirmedIds,
        pending,
        failed,
        stats: {
          confirmed: confirmedIds.length,
          pending: pending.length,
          failed: failed.length,
          skipped: 0,
          transitioned: updateResult.count,
          queued: queueCandidates.length, // publish target count
        },
      });

      // Fire-and-forget job publishing after response is sent
      // Uses setImmediate to ensure response is flushed first
      if (queueCandidates.length > 0) {
        setImmediate(async () => {
          try {
            if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
              // Publish to GCP Pub/Sub.
              // For small batches, publish individual extract jobs (lowest latency).
              // For large batches, publish fanout batches (fewer publishes from the API server).
              const pubsubItems = queueCandidates.map((doc) => ({
                documentId: doc.id,
                userId,
                storageKey: doc.encryptedFilename || "",
                mimeType: doc.mimeType || "application/octet-stream",
                filename: doc.filename || undefined,
              }));

              const fanoutMinDocs = Number(
                process.env.PUBSUB_FANOUT_MIN_DOCS || 100,
              );
              const useFanout = pubsubItems.length >= fanoutMinDocs;

              if (useFanout) {
                const out = await publishExtractFanoutJobsBulk(pubsubItems, {
                  requestId: requestIdHeader,
                  uploadSessionId:
                    typeof uploadSessionId === "string"
                      ? uploadSessionId
                      : undefined,
                });
                console.log(
                  `[complete-bulk] Background: Published ${out.publishedDocs} docs in ${out.publishedBatches} fanout batches (messageIds=${out.messageIds.length})`,
                );
              } else {
                const results = await publishExtractJobsBulk(pubsubItems);
                const queued = Array.from(results.values()).filter(
                  (v) => v !== "error",
                ).length;
                console.log(
                  `[complete-bulk] Background: Published ${queued} extract jobs`,
                );
              }
            } else {
              // Fall back to BullMQ for local development
              const bulkItems = queueCandidates.map((doc) => ({
                documentId: doc.id,
                userId,
                filename: doc.filename || "unknown",
                mimeType: doc.mimeType || "application/octet-stream",
                encryptedFilename: doc.encryptedFilename || undefined,
              }));
              const bulkJobs = await addDocumentJobsBulk(bulkItems);
              console.log(
                `[complete-bulk] Background: Enqueued ${bulkJobs.length} jobs to BullMQ`,
              );
            }
          } catch (err: any) {
            console.error(
              "[complete-bulk] Background enqueue failed:",
              err.message,
            );
            // Jobs will be picked up by stuck document sweeper
          }
        });
      }
    } catch (e: any) {
      console.error("POST /presigned-urls/complete-bulk error:", e);
      res.status(500).json({ error: "Failed to complete bulk uploads" });
    }
  },
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
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { documentIds = [] } = req.body || {};

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.json({
        orphanedCount: 0,
        verifiedCount: 0,
        orphanedDocuments: [],
        verifiedDocuments: [],
      });
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
        // Anything that has left "uploading" is no longer an orphan. It may still fail later
        // (e.g. processing), but upload completion has been registered.
        if (doc.status === "uploading") orphanedDocuments.push(doc.id);
        else verifiedDocuments.push(doc.id);
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
  },
);

/**
 * POST /complete — Bulk completion notification after direct-to-storage uploads finish.
 *
 * Marks documents as "uploaded" after the frontend finishes uploading to storage.
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
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { documentIds = [] } = req.body || {};

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.json({
        confirmed: [],
        failed: [],
        stats: { confirmed: 0, failed: 0, skipped: 0 },
      });
      return;
    }

    try {
      const confirmed: string[] = [];
      const failed: string[] = [];

      // Track docs that actually transitioned (not already uploaded/enriching/ready)
      for (const docId of documentIds) {
        try {
          const result = await prisma.document.updateMany({
            where: { id: docId, userId, status: "uploading" }, // Only from uploading
            data: { status: "uploaded" },
          });
          if (result.count > 0) {
            confirmed.push(docId); // Only add if actually transitioned
          }
          // If count === 0, doc was already uploaded/enriching/ready - don't re-queue
        } catch {
          failed.push(docId);
        }
      }

      // Enqueue only docs that were JUST transitioned
      if (confirmed.length > 0) {
        const docs = await prisma.document.findMany({
          where: { id: { in: confirmed }, userId, status: "uploaded" },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            encryptedFilename: true,
          },
        });

        // Use GCP Pub/Sub workers if enabled, otherwise fall back to BullMQ
        if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
          const pubsubItems = docs.map((doc) => ({
            documentId: doc.id,
            userId,
            storageKey: doc.encryptedFilename || "",
            mimeType: doc.mimeType || "application/octet-stream",
            filename: doc.filename || undefined,
          }));
          try {
            const results = await publishExtractJobsBulk(pubsubItems);
            const queued = Array.from(results.values()).filter(
              (v) => v !== "error",
            ).length;
            const errors = Array.from(results.values()).filter(
              (v) => v === "error",
            ).length;
            console.log(
              `[complete] Published ${queued} jobs to GCP Pub/Sub (${errors} errors)`,
            );
          } catch (err: any) {
            console.error(`Failed to publish to Pub/Sub:`, err.message);
            // Don't fail the request - docs are uploaded, they just need manual reprocess
          }
        } else {
          addDocumentJobsBulk(
            docs.map((doc) => ({
              documentId: doc.id,
              userId,
              filename: doc.filename || "unknown",
              mimeType: doc.mimeType || "application/octet-stream",
              encryptedFilename: doc.encryptedFilename || undefined,
            })),
          ).catch((err) => console.error(`Failed to bulk queue:`, err.message));
        }
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
  },
);

/**
 * POST /local-upload/:documentId — Direct file upload to local storage (development only)
 *
 * This endpoint is only active when STORAGE_PROVIDER=local.
 * Frontend uploads directly to this endpoint instead of direct-to-storage URLs.
 */
router.post(
  "/local-upload/:documentId",
  authMiddleware,
  localUpload.single("file"),
  async (req: any, res: Response): Promise<void> => {
    if (!isLocalStorage) {
      res.status(400).json({
        error: "Local uploads not enabled. Set STORAGE_PROVIDER=local",
      });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

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
        res
          .status(404)
          .json({ error: "Document not found or not in uploading state" });
        return;
      }

      // Save file to local storage
      const storageKey =
        doc.encryptedFilename ||
        `users/${userId}/docs/${documentId}/${doc.filename}`;
      await saveToLocalStorage(storageKey, file.buffer);

      // Update document status
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "uploaded" },
      });

      // Queue for processing
      // Use GCP Pub/Sub workers if enabled, otherwise fall back to BullMQ
      if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
        await publishExtractJob(
          documentId,
          userId,
          storageKey,
          doc.mimeType || "application/octet-stream",
          doc.filename || undefined,
        );
        console.log(`[local-upload] Published job to GCP Pub/Sub`);
      } else {
        await addDocumentJob({
          documentId,
          userId,
          filename: doc.filename || "unknown",
          mimeType: doc.mimeType || "application/octet-stream",
          encryptedFilename: storageKey,
        });
      }

      console.log(
        `[local-upload] File saved: ${storageKey} (${file.size} bytes)`,
      );
      res.json({ success: true, documentId, storageKey });
    } catch (e: any) {
      console.error("POST /local-upload error:", e);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
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
