/**
 * Multipart Upload Controller
 * Handles S3 multipart upload operations for large files (>20MB)
 */

/// <reference path="../types/express.d.ts" />
import { Request, Response } from 'express';
import prisma from '../config/database';
import { UPLOAD_CONFIG } from '../config/upload.config';
import {
  createMultipartUpload,
  getMultipartUploadUrls,
  completeMultipartUpload,
  abortMultipartUpload,
} from '../services/s3Storage.service';
import { addDocumentJob } from '../queues/document.queue';
import { emitDocumentEvent } from '../services/websocket.service';

/**
 * Initialize a multipart upload session
 * POST /api/multipart-upload/init
 */
export const initMultipartUpload = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { fileName, fileSize, mimeType, folderId } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!fileName || !fileSize || !mimeType) {
      res.status(400).json({ error: 'Missing required fields: fileName, fileSize, mimeType' });
      return;
    }

    // Validate file size
    if (fileSize > UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
      res.status(400).json({
        error: `File too large. Maximum size is ${UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
      });
      return;
    }

    console.log(`📤 [Multipart] Initializing upload for "${fileName}" (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

    // Generate unique storage key (WITHOUT filename to avoid S3 signature issues with special chars)
    // This matches the regular upload flow pattern: `${userId}/${uuid}-${timestamp}`
    const crypto = await import('crypto');
    const storageKey = `${userId}/${crypto.randomUUID()}-${Date.now()}`;

    // Calculate number of parts
    const chunkSize = UPLOAD_CONFIG.CHUNK_SIZE_BYTES;
    const totalParts = Math.ceil(fileSize / chunkSize);

    // Create S3 multipart upload
    const uploadId = await createMultipartUpload(storageKey, mimeType);

    // Generate presigned URLs for all parts
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
    const presignedUrls = await getMultipartUploadUrls(storageKey, uploadId, partNumbers);

    // Create document record in database with "uploading" status
    const document = await prisma.document.create({
      data: {
        user: { connect: { id: userId } },
        folder: folderId ? { connect: { id: folderId } } : undefined,
        filename: fileName,
        encryptedFilename: storageKey,
        fileSize,
        mimeType,
        fileHash: 'pending',
        status: 'uploading',
        isEncrypted: false,
      },
    });

    console.log(`✅ [Multipart] Upload initialized: ${document.id} (${totalParts} parts)`);

    // Emit WebSocket event
    emitDocumentEvent(userId, 'created');

    res.status(200).json({
      documentId: document.id,
      uploadId,
      storageKey,
      presignedUrls,
      totalParts,
      chunkSize,
    });
  } catch (error: any) {
    console.error('❌ [Multipart] Error initializing upload:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Complete a multipart upload
 * POST /api/multipart-upload/complete
 */
export const completeMultipartUploadHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { documentId, uploadId, storageKey, parts } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!documentId || !uploadId || !storageKey || !parts) {
      res.status(400).json({ error: 'Missing required fields: documentId, uploadId, storageKey, parts' });
      return;
    }

    // Verify document belongs to user
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId,
        status: 'uploading',
      },
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found or already processed' });
      return;
    }

    console.log(`📤 [Multipart] Completing upload for "${document.filename}" (${parts.length} parts)`);

    // Complete S3 multipart upload
    await completeMultipartUpload(storageKey, uploadId, parts);

    // Update document status to 'completed' (same as regular upload flow)
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'completed' },
    });

    // Queue document for embedding generation via BullMQ (same as regular upload flow)
    try {
      await addDocumentJob({
        documentId,
        userId,
        filename: document.filename,
        mimeType: document.mimeType,
      });
      console.log(`✅ [Multipart] Upload completed and queued for embedding: ${documentId}`);
    } catch (queueError) {
      console.error(`⚠️ [Multipart] Failed to queue document for embeddings (non-critical):`, queueError);
    }

    // Emit WebSocket event
    emitDocumentEvent(userId, 'updated');

    res.status(200).json({
      success: true,
      documentId,
      message: 'Upload completed successfully',
    });
  } catch (error: any) {
    console.error('❌ [Multipart] Error completing upload:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Abort a multipart upload
 * POST /api/multipart-upload/abort
 */
export const abortMultipartUploadHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { documentId, uploadId, storageKey } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!uploadId || !storageKey) {
      res.status(400).json({ error: 'Missing required fields: uploadId, storageKey' });
      return;
    }

    console.log(`📤 [Multipart] Aborting upload: ${storageKey}`);

    // Abort S3 multipart upload
    await abortMultipartUpload(storageKey, uploadId);

    // Delete document record if it exists
    if (documentId) {
      await prisma.document.deleteMany({
        where: {
          id: documentId,
          userId,
          status: 'uploading',
        },
      });
    }

    console.log(`✅ [Multipart] Upload aborted: ${storageKey}`);

    res.status(200).json({
      success: true,
      message: 'Upload aborted successfully',
    });
  } catch (error: any) {
    console.error('❌ [Multipart] Error aborting upload:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get upload configuration
 * GET /api/multipart-upload/config
 */
export const getUploadConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      resumableThreshold: UPLOAD_CONFIG.RESUMABLE_UPLOAD_THRESHOLD_BYTES,
      chunkSize: UPLOAD_CONFIG.CHUNK_SIZE_BYTES,
      maxFileSize: UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES,
      maxConcurrentUploads: UPLOAD_CONFIG.MAX_CONCURRENT_UPLOADS,
      maxConcurrentChunks: UPLOAD_CONFIG.MAX_CONCURRENT_CHUNKS,
    });
  } catch (error: any) {
    console.error('❌ Error getting upload config:', error);
    res.status(500).json({ error: error.message });
  }
};
