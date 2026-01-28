// src/routes/multipartUpload.routes.ts
//
// Multipart upload endpoints for large files (>20MB).
// Uses S3 multipart upload API with presigned part URLs.

import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { multipartUploadLimiter } from "../middleware/rateLimit.middleware";
import prisma from "../config/database";
import { S3StorageService } from "../services/retrieval/s3Storage.service";
import { UPLOAD_CONFIG } from "../config/upload.config";
import { randomUUID } from "crypto";
import { addDocumentJob } from "../queues/document.queue";
import { logger } from "../utils/logger";

const router = Router();

let _s3: S3StorageService | null = null;
function s3(): S3StorageService {
  if (!_s3) _s3 = new S3StorageService();
  return _s3;
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
 * Creates a document record, starts S3 multipart upload,
 * and returns presigned URLs for all parts.
 *
 * Request body:
 *   { fileName, fileSize, mimeType, folderId?, preferredChunkSize? }
 *
 * Response:
 *   { uploadId, storageKey, documentId, presignedUrls: [string], totalParts, chunkSize }
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

      // Determine chunk size (minimum 5MB for S3)
      const chunkSize = Math.max(
        preferredChunkSize || UPLOAD_CONFIG.CHUNK_SIZE_BYTES,
        5 * 1024 * 1024 // S3 minimum
      );
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

      // Start S3 multipart upload
      const { uploadId } = await s3().createMultipartUpload({
        key: storageKey,
        mimeType,
      });

      // Generate presigned URLs for all parts
      const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
      const { urls } = await s3().presignUploadParts({
        key: storageKey,
        uploadId,
        partNumbers,
        expiresInSeconds: UPLOAD_CONFIG.PRESIGNED_URL_EXPIRATION_SECONDS,
      });

      // Return URLs as flat array (ordered by part number)
      const sortedUrls = urls
        .sort((a, b) => a.partNumber - b.partNumber)
        .map(u => u.url);

      res.json({
        uploadId,
        storageKey,
        documentId: docId,
        presignedUrls: sortedUrls,
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
 * POST /complete — Complete a multipart upload.
 *
 * Request body:
 *   { documentId, uploadId, storageKey, parts: [{ ETag, PartNumber }] }
 */
router.post(
  "/complete",
  authMiddleware,
  multipartUploadLimiter,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { documentId, uploadId, storageKey, parts } = req.body || {};

    if (!documentId || !uploadId || !storageKey || !Array.isArray(parts)) {
      res.status(400).json({ error: "documentId, uploadId, storageKey, and parts are required" });
      return;
    }

    try {
      // Verify document belongs to user
      const doc = await prisma.document.findFirst({
        where: { id: documentId, userId },
      });
      if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

      // Complete S3 multipart upload
      await s3().completeMultipartUpload({
        key: storageKey,
        uploadId,
        parts,
      });

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
 * POST /abort — Abort a multipart upload and clean up.
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
      // Abort S3 multipart upload (best-effort)
      if (uploadId && storageKey) {
        await s3().abortMultipartUpload({ key: storageKey, uploadId });
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
 * POST /urls — Get presigned URLs for specific parts (used for resume).
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
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { storageKey, uploadId, partNumbers } = req.body || {};

    if (!storageKey || !uploadId || !Array.isArray(partNumbers)) {
      res.status(400).json({ error: "storageKey, uploadId, and partNumbers are required" });
      return;
    }

    try {
      const { urls } = await s3().presignUploadParts({
        key: storageKey,
        uploadId,
        partNumbers,
        expiresInSeconds: UPLOAD_CONFIG.PRESIGNED_URL_EXPIRATION_SECONDS,
      });

      const sortedUrls = urls
        .sort((a, b) => a.partNumber - b.partNumber)
        .map(u => u.url);

      res.json({ presignedUrls: sortedUrls });
    } catch (e: any) {
      logger.error("[MultipartUpload] urls error", { path: "/urls" });
      res.status(500).json({ error: "Failed to generate part URLs" });
    }
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
