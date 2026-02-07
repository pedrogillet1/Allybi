// src/routes/multipartUpload.routes.ts
//
// Multipart upload endpoints for large files (>20MB).
// Uses GCS resumable upload sessions (Google-only).

import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { multipartUploadLimiter } from "../middleware/rateLimit.middleware";
import prisma from "../config/database";
import { GcsStorageService } from "../services/retrieval/gcsStorage.service";
import { UPLOAD_CONFIG } from "../config/upload.config";
import { randomUUID } from "crypto";
import { addDocumentJob } from "../queues/document.queue";
import { logger } from "../utils/logger";

const router = Router();

let _gcs: GcsStorageService | null = null;
function gcs(): GcsStorageService {
  if (!_gcs) _gcs = new GcsStorageService();
  return _gcs;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\u00C0-\u024F\u1E00-\u1EFF]/g, "_");
}

function validateFileName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  // Reject path traversal
  const parts = name.replace(/\\/g, '/').split('/');
  if (parts.some(p => p === '..' || p === '.')) return false;
  // Reject null bytes
  if (name.includes('\0')) return false;
  return true;
}

function buildStorageKey(userId: string, docId: string, fileName: string): string {
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
  return `users/${userId}/docs/${docId}/${docId}${ext}`;
}

/**
 * POST /init — Initialize a multipart upload.
 *
 * Creates a document record and starts a GCS resumable upload session.
 *
 * Request body:
 *   { fileName, fileSize, mimeType, folderId?, preferredChunkSize? }
 *
 * Response:
 *   { uploadId, storageKey, documentId, uploadUrl, totalParts, chunkSize }
 */
router.post(
  "/init",
  authMiddleware,
  multipartUploadLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const {
      fileName,
      fileSize,
      mimeType = "application/octet-stream",
      folderId = null,
      preferredChunkSize,
    } = req.body || {};

    if (!fileName || !fileSize) {
      res.status(400).json({ error: "fileName and fileSize are required" });
      return;
    }

    if (!validateFileName(fileName)) {
      res.status(400).json({ error: "Invalid file name" });
      return;
    }

    if (fileSize > UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
      res.status(413).json({ error: `File too large. Maximum ${UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` });
      return;
    }

    try {
      const docId = randomUUID();
      const storageKey = buildStorageKey(userId, docId, fileName);
      const uploadId = randomUUID();

      // Chunk size is client guidance only (GCS resumable is sequential).
      const chunkSize = Math.max(preferredChunkSize || UPLOAD_CONFIG.CHUNK_SIZE_BYTES, 256 * 1024);
      const totalParts = Math.ceil(fileSize / chunkSize);

      // Create document record
      await prisma.document.create({
        data: {
          id: docId,
          userId,
          folderId,
          filename: fileName,
          encryptedFilename: storageKey,
          fileSize,
          mimeType,
          fileHash: `multipart-pending-${docId}`,
          status: "uploading",
        },
      });

      // Start GCS resumable upload (pass browser origin for CORS)
      const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || process.env.FRONTEND_URL || 'http://localhost:3000';
      const { uploadUrl } = await gcs().createResumableUpload({ key: storageKey, mimeType, origin });

      res.json({
        uploadId,
        storageKey,
        documentId: docId,
        uploadUrl,
        presignedUrls: [], // Backward-compat: frontend must ignore for GCS
        totalParts,
        chunkSize,
      });
    } catch (e: any) {
      logger.error("[MultipartUpload] init error", { path: "/init" });
      res.status(500).json({ error: "Failed to initialize multipart upload" });
    }
  }
);

/**
 * POST /complete — Complete a resumable upload.
 *
 * Request body:
 *   { documentId, storageKey, expectedSize? }
 */
router.post(
  "/complete",
  authMiddleware,
  multipartUploadLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { documentId, storageKey, expectedSize } = req.body || {};

    if (!documentId || !storageKey) {
      res.status(400).json({ error: "documentId and storageKey are required" });
      return;
    }

    try {
      // Verify document belongs to user
      const doc = await prisma.document.findFirst({
        where: { id: documentId, userId },
      });
      if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

      // Verify object exists in GCS (and size if provided)
      const meta = await gcs().getFileMetadata({ key: storageKey });
      if (!meta?.size || meta.size <= 0) {
        res.status(400).json({ error: "Upload not found in storage" });
        return;
      }
      if (expectedSize && Number.isFinite(Number(expectedSize)) && Number(expectedSize) > 0) {
        const exp = Number(expectedSize);
        if (meta.size !== exp) {
          res.status(400).json({ error: `Upload size mismatch (expected ${exp}, got ${meta.size})` });
          return;
        }
      }

      // Update document status
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "uploaded" },
      });

      // Enqueue for processing (extraction → chunking → embedding)
      try {
        await addDocumentJob({
          documentId: doc.id,
          userId,
          filename: doc.filename || 'unknown',
          mimeType: doc.mimeType || "application/octet-stream",
          encryptedFilename: doc.encryptedFilename || undefined,
        });
        logger.info("[MultipartUpload] queued for processing", { documentId });
      } catch (queueErr: any) {
        logger.error("[MultipartUpload] failed to queue", { documentId });
      }

      res.json({ ok: true, documentId });
    } catch (e: any) {
      logger.error("[MultipartUpload] complete error", { path: "/complete" });
      res.status(500).json({ error: "Failed to complete multipart upload" });
    }
  }
);

/**
 * POST /abort — Abort an upload and clean up (best-effort).
 *
 * Request body:
 *   { documentId, uploadId, storageKey }
 */
router.post(
  "/abort",
  authMiddleware,
  multipartUploadLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { documentId, uploadId, storageKey } = req.body || {};

    try {
      // Best-effort delete the object (GCS resumable sessions cannot be explicitly aborted)
      if (storageKey) {
        await gcs().deleteFile({ key: storageKey });
      }

      // Mark document as failed
      if (documentId) {
        await prisma.document.updateMany({
          where: { id: documentId, userId },
          data: { status: "failed" },
        });
      }

      res.json({ ok: true });
    } catch (e: any) {
      logger.error("[MultipartUpload] abort error", { path: "/abort" });
      // Still return success — abort is best-effort cleanup
      res.json({ ok: true });
    }
  }
);

/**
 * POST /urls — Not supported for GCS resumable uploads.
 *
 * Request body:
 *   { storageKey, uploadId, partNumbers: [number] }
 *
 * Response:
 *   { presignedUrls: [string] }
 */
router.post(
  "/urls",
  authMiddleware,
  multipartUploadLimiter,
  async (req: any, res: Response): Promise<void> => {
    res.status(410).json({ error: "Not supported for GCS resumable uploads" });
  }
);

/**
 * GET /status/:documentId — Check upload status (for resume verification).
 *
 * Response:
 *   { status: "uploading" | "uploaded" | "failed" | "expired" }
 */
router.get(
  "/status/:documentId",
  authMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { documentId } = req.params;

    try {
      const doc = await prisma.document.findFirst({
        where: { id: documentId, userId },
        select: { status: true, createdAt: true },
      });

      if (!doc) {
        res.json({ status: "expired" });
        return;
      }

      // Check if upload session has expired (24 hours)
      const ageMs = Date.now() - new Date(doc.createdAt).getTime();
      if (doc.status === "uploading" && ageMs > UPLOAD_CONFIG.UPLOAD_SESSION_EXPIRATION_HOURS * 3600000) {
        res.json({ status: "expired" });
        return;
      }

      res.json({ status: doc.status });
    } catch (e: any) {
      logger.error("[MultipartUpload] status error", { path: "/status" });
      res.status(500).json({ error: "Failed to check upload status" });
    }
  }
);

export default router;
