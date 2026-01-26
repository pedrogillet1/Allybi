import { Request, Response } from 'express';
import prisma from '../config/database';
import { retryDocument } from '../services/document.service';
import { generatePresignedUploadUrl, getFileMetadata } from '../config/storage';
import { emitDocumentEvent, emitToUser } from '../services/websocket.service';
import { fastTextExtractor } from '../services/fastTextExtractor.service';
import { UPLOAD_CONFIG } from '../config/upload.config';
import { needsPreviewPdfGeneration } from '../services/previewPdfGenerator.service';
import { addPreviewGenerationJob } from '../queues/document.queue';

// MIME types that need PDF preview (Office documents)
const OFFICE_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
];

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS - Legacy path control
// ═══════════════════════════════════════════════════════════════════════════════
const ALLOW_LEGACY_COMPLETE = process.env.ALLOW_LEGACY_COMPLETE === 'true';

/**
 * Helper function to create folder hierarchy from relative paths
 * @param files - Array of file objects with relativePath
 * @param userId - User ID
 * @param rootFolderId - Optional root folder ID to create structure under
 * @returns Map of relative path to folder ID
 */
async function createFolderHierarchy(
  files: Array<{ relativePath?: string | null }>,
  userId: string,
  rootFolderId?: string | null
): Promise<Map<string, string>> {
  const folderMap = new Map<string, string>();

  // If rootFolderId is provided, add it to the map for empty paths
  if (rootFolderId) {
    folderMap.set('', rootFolderId);
  }

  // Extract all unique folder paths from files
  const folderPaths = new Set<string>();

  for (const file of files) {
    if (!file.relativePath) continue;

    // Extract folder path from relativePath (everything except the filename)
    // Example: "MyFolder/Subfolder/file.txt" -> "MyFolder/Subfolder"
    const pathParts = file.relativePath.split('/');

    // Build all parent paths
    // Example: "A/B/C/file.txt" -> ["A", "A/B", "A/B/C"]
    for (let i = 0; i < pathParts.length - 1; i++) {
      const folderPath = pathParts.slice(0, i + 1).join('/');
      folderPaths.add(folderPath);
    }
  }

  if (folderPaths.size === 0) {
    console.log('📁 No folder structure found in uploaded files');
    return folderMap;
  }

  console.log(`📁 Creating folder hierarchy with ${folderPaths.size} folders...`);

  // Sort paths by depth (shallowest first) to create parent folders before children
  const sortedPaths = Array.from(folderPaths).sort((a, b) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    return depthA - depthB;
  });

  // Create folders in order
  for (const folderPath of sortedPaths) {
    const pathParts = folderPath.split('/');
    const folderName = pathParts[pathParts.length - 1];

    // Get parent folder ID
    let parentFolderId = rootFolderId || null;
    if (pathParts.length > 1) {
      const parentPath = pathParts.slice(0, -1).join('/');
      parentFolderId = folderMap.get(parentPath) || null;
    }

    // Build full path for display
    const fullPath = parentFolderId
      ? await buildFullPath(parentFolderId, folderName)
      : `/${folderName}`;

    // Check if folder already exists
    const existingFolder = await prisma.folder.findFirst({
      where: {
        userId,
        name: folderName,
        parentFolderId
      }
    });

    if (existingFolder) {
      console.log(`✓ Folder "${folderName}" already exists (ID: ${existingFolder.id})`);
      folderMap.set(folderPath, existingFolder.id);
    } else {
      // Create new folder
      const newFolder = await prisma.folder.create({
        data: {
          userId,
          name: folderName,
          parentFolderId,
          path: fullPath
        }
      });

      console.log(`✓ Created folder "${folderName}" (ID: ${newFolder.id}, Path: ${fullPath})`);
      folderMap.set(folderPath, newFolder.id);
    }
  }

  console.log(`✅ Folder hierarchy created: ${folderMap.size} folders`);
  return folderMap;
}

/**
 * Helper function to build full path for a folder
 */
async function buildFullPath(parentFolderId: string, folderName: string): Promise<string> {
  const parent = await prisma.folder.findUnique({
    where: { id: parentFolderId },
    select: { path: true }
  });

  if (!parent || !parent.path) {
    return `/${folderName}`;
  }

  return `${parent.path}/${folderName}`;
}

// Validate AWS S3 configuration
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('❌ Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY in environment');
  throw new Error('AWS S3 configuration is missing');
}

console.log('✅ AWS S3 client initialized for presigned URLs');

/**
 * Generate presigned URLs for bulk file upload
 */
export const generateBulkPresignedUrls = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { files, folderId, uploadSessionId } = req.body;
    const userId = req.user.id;

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'Files array is required and must not be empty' });
      return;
    }

    // ✅ SECURITY FIX: Enforce maximum batch size to prevent memory exhaustion
    // ✅ UNIFIED: Use centralized config constants
    if (files.length > UPLOAD_CONFIG.MAX_BATCH_FILES) {
      res.status(400).json({
        error: `Too many files in batch. Maximum ${UPLOAD_CONFIG.MAX_BATCH_FILES} files per request. Received: ${files.length}. Please split into smaller batches.`
      });
      return;
    }

    const startTime = Date.now();
    console.log(`📝 Generating ${files.length} presigned URLs for user ${userId}`);

    // ✅ OPTIMIZATION: Validate all file sizes upfront
    // ✅ UNIFIED: Use centralized config constant
    for (const file of files) {
      if (file.fileSize > UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
        res.status(400).json({
          error: `File too large: ${file.fileName} (${(file.fileSize / 1024 / 1024).toFixed(2)}MB). Maximum size is ${UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`
        });
        return;
      }
    }

    // ✅ NEW: Create folder hierarchy from relative paths
    const folderMap = await createFolderHierarchy(files, userId, folderId);
    console.log(`📊 [FOLDERS] Created/found ${folderMap.size} folders in hierarchy`);

    // ✅ OPTIMIZATION: Process files in parallel batches of 50 to avoid connection pool exhaustion
    // ✅ CRITICAL FIX: Use Promise.allSettled so one file failure doesn't fail the entire batch
    const BATCH_SIZE = 50;
    const results: Array<{
      presignedUrl: string;
      documentId: string;
      encryptedFilename: string;
      fileName: string;
    }> = [];
    const failedFiles: Array<{ fileName: string; error: string }> = [];
    const skippedFiles: string[] = [];

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)} (${batch.length} files)`);

      // ✅ CRITICAL FIX: Use Promise.allSettled instead of Promise.all
      const batchSettled = await Promise.allSettled(
        batch.map(async (file) => {
          const { fileName, fileType, fileSize, relativePath } = file;

          // ✅ NEW: Determine correct folder ID based on relativePath
          let targetFolderId = folderId || null;
          if (relativePath) {
            // Extract folder path from relativePath
            // Example: "MyFolder/Subfolder/file.txt" -> "MyFolder/Subfolder"
            const pathParts = relativePath.split('/');
            if (pathParts.length > 1) {
              const folderPath = pathParts.slice(0, -1).join('/');
              targetFolderId = folderMap.get(folderPath) || targetFolderId;
            }
          }

          // Generate unique encrypted filename
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 15);
          const encryptedFilename = `${userId}/${timestamp}-${randomSuffix}-${fileName}`;

          // Generate presigned upload URL for S3 (expires in 1 hour)
          const presignedUrl = await generatePresignedUploadUrl(
            encryptedFilename,
            fileType,
            3600 // 1 hour
          );

          // Create document record with "uploading" status
          // Folder structure is preserved via targetFolderId
          // For Office documents, also create metadata row with previewPdfStatus='pending'
          const isOfficeType = OFFICE_MIME_TYPES.includes(fileType);

          const document = await prisma.document.create({
            data: {
              userId,
              folderId: targetFolderId,
              filename: fileName,
              encryptedFilename,
              fileSize,
              mimeType: fileType,
              fileHash: 'pending', // Placeholder - will be calculated after upload
              status: 'uploading',
              isEncrypted: false, // Client-side encryption not implemented yet
              uploadSessionId: uploadSessionId || null, // Track which upload session this belongs to
              // ✅ CRITICAL: Create metadata row at document creation for Office types
              // This ensures previewPdfStatus is NEVER NULL - it starts as 'pending'
              ...(isOfficeType && {
                metadata: {
                  create: {
                    previewPdfStatus: 'pending',
                    previewPdfAttempts: 0,
                    previewPdfUpdatedAt: new Date(),
                  },
                },
              }),
            }
          });

          return {
            presignedUrl,
            documentId: document.id,
            encryptedFilename,
            fileName
          };
        })
      );

      // ✅ Process allSettled results - separate successes from failures
      for (let j = 0; j < batchSettled.length; j++) {
        const result = batchSettled[j];
        const originalFile = batch[j];

        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`❌ [Presigned URL] Failed for file "${originalFile.fileName}":`, result.reason);
          failedFiles.push({
            fileName: originalFile.fileName,
            error: result.reason?.message || String(result.reason)
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Generated ${results.length} presigned URLs successfully in ${duration}ms`);
    if (failedFiles.length > 0) {
      console.warn(`⚠️ Failed to generate presigned URLs for ${failedFiles.length} files:`, failedFiles.map(f => f.fileName));
    }
    console.log(`📊 [METRICS] URL generation speed: ${(results.length / (duration / 1000)).toFixed(2)} URLs/second`);
    console.log(`📊 [METRICS] Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);

    // 🔔 Emit WebSocket event to notify UI of new documents (with "uploading" status)
    if (results.length > 0) {
      console.log(`🔔 Notifying UI: ${results.length} documents created (status: uploading)`);
      emitDocumentEvent(userId, 'created');
    }

    res.status(200).json({
      presignedUrls: results.map(r => r.presignedUrl),
      documentIds: results.map(r => r.documentId),
      encryptedFilenames: results.map(r => r.encryptedFilename),
      // ✅ NEW: Include failure information so frontend can report accurately
      failedFiles,
      skippedFiles,
      summary: {
        total: files.length,
        success: results.length,
        failed: failedFiles.length,
        skipped: skippedFiles.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error generating presigned URLs:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Mark documents as uploaded and trigger background processing
 */
export const completeBatchUpload = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      console.error('❌ [completeBatchUpload] Unauthorized: No user in request');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { documentIds } = req.body;
    const userId = req.user.id;

    // ✅ Enhanced logging for debugging
    console.log(`📥 [completeBatchUpload] ========================================`);
    console.log(`📥 [completeBatchUpload] Received request from user: ${userId}`);
    console.log(`📥 [completeBatchUpload] Number of documents: ${documentIds?.length || 0}`);
    console.log(`📥 [completeBatchUpload] Document IDs:`, documentIds);
    console.log(`📥 [completeBatchUpload] Request headers:`, {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      contentType: req.headers['content-type']
    });
    console.log(`📥 [completeBatchUpload] ========================================`);

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      console.error(`❌ [completeBatchUpload] Invalid request: documentIds missing or empty`);
      console.error(`❌ [completeBatchUpload] Request body:`, JSON.stringify(req.body));
      res.status(400).json({ error: 'Document IDs array is required and must not be empty' });
      return;
    }

    const startTime = Date.now();
    console.log(`✅ Marking ${documentIds.length} documents as uploaded for user ${userId}`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // FAST AVAILABILITY PIPELINE - Make documents usable IMMEDIATELY
    // ═══════════════════════════════════════════════════════════════════════════════

    // Fetch document details for fast extraction
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        userId,
        status: 'uploading'
      },
      select: {
        id: true,
        filename: true,
        encryptedFilename: true,
        mimeType: true
      }
    });

    console.log(`⚡ [FastAvailability] Processing ${documents.length} documents...`);

    // Run fast text extraction for each document (parallel, max 5 concurrent)
    const CONCURRENCY = 5;
    let availableCount = 0;

    for (let i = 0; i < documents.length; i += CONCURRENCY) {
      const batch = documents.slice(i, i + CONCURRENCY);

      await Promise.all(batch.map(async (doc) => {
        try {
          console.log(`⚡ [FastExtraction] Starting for ${doc.filename}...`);
          const extractionResult = await fastTextExtractor.extractFromS3(doc.encryptedFilename, doc.mimeType);

          const rawText = extractionResult.success ? extractionResult.rawText : null;
          const previewText = extractionResult.success ? extractionResult.previewText : null;

          // Update to 'available' with rawText
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              status: 'available',
              rawText,
              previewText
            }
          });

          availableCount++;
          console.log(`✅ [FastAvailability] ${doc.filename} is now AVAILABLE (${rawText?.length || 0} chars)`);

          // Emit availability event
          emitToUser(userId, 'document-processing-update', {
            documentId: doc.id,
            status: 'available',
            stage: 'available',
            progress: 50,
            message: 'Document ready for chat'
          });
        } catch (error: any) {
          console.error(`⚡ [FastExtraction] Error for ${doc.filename}: ${error.message}`);
          // Still mark as available even without text
          await prisma.document.update({
            where: { id: doc.id },
            data: { status: 'available' }
          });
          availableCount++;
        }
      }));
    }

    console.log(`✅ [FastAvailability] ${availableCount}/${documents.length} documents now AVAILABLE`);

    // Queue background enrichment for all documents (embeddings, etc.)
    console.log(`🔄 Queuing ${documents.length} documents for background enrichment...`);

    const queueResults = await Promise.allSettled(
      documents.map(async (doc) => {
        await retryDocument(doc.id, userId);
        return doc.id;
      })
    );

    const queuedCount = queueResults.filter(r => r.status === 'fulfilled').length;
    const skippedCount = queueResults.filter(r => r.status === 'rejected').length;

    // Log any failures
    queueResults.forEach((result, idx) => {
      if (result.status === 'rejected') {
        console.error(`❌ Failed to queue document ${documents[idx].id}:`, result.reason);
      }
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Started ${queuedCount} documents for processing in ${duration}ms`);
    if (skippedCount > 0) {
      console.warn(`⚠️  ${skippedCount} documents failed to start processing`);
    }
    console.log(`📊 [METRICS] Processing speed: ${(queuedCount / (duration / 1000)).toFixed(2)} docs/second`);

    // 🔔 Emit WebSocket event to notify UI that documents are now available
    console.log(`🔔 Notifying UI: ${availableCount} documents now AVAILABLE`);
    emitDocumentEvent(userId, 'updated');

    res.status(200).json({
      success: true,
      count: availableCount,
      queued: queuedCount,
      skipped: skippedCount
    });

  } catch (error: any) {
    console.error('❌ Error completing batch upload:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Complete a single document upload and immediately enqueue for processing
 * This enables per-file pipeline: upload → process without waiting for other files
 *
 * INTEGRITY VERIFICATION:
 * - Accepts optional `fileHash` (MD5) in request body
 * - Verifies against S3 ETag to ensure upload integrity
 * - Stores verified hash in document record
 */
export const completeSingleDocument = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { documentId } = req.params;
    const { fileHash, fileSize } = req.body; // Optional integrity verification params
    const userId = req.user.id;

    if (!documentId) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // DEPRECATED: This endpoint is being phased out in favor of /complete-bulk
    // ═══════════════════════════════════════════════════════════════════════════════
    console.warn(`⚠️ [DEPRECATED] completeSingleDocument called for ${documentId} - use /complete-bulk instead`);

    // Reject if legacy path is disabled
    if (!ALLOW_LEGACY_COMPLETE) {
      console.error(`❌ [DEPRECATED] Rejecting legacy /complete/:documentId - set ALLOW_LEGACY_COMPLETE=true to enable`);
      res.status(410).json({
        error: 'Legacy per-file completion is deprecated. Use /api/presigned-urls/complete-bulk instead.',
        deprecated: true
      });
      return;
    }

    console.log(`📥 [completeSingleDocument] Processing document ${documentId} for user ${userId}`);
    if (fileHash) {
      console.log(`🔒 [Integrity] Client provided hash: ${fileHash}`);
    }

    // Verify document belongs to user and is in uploading status
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId,
        status: 'uploading'
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        encryptedFilename: true,
        fileSize: true
      }
    });

    if (!document) {
      // Check if already processed
      const existingDoc = await prisma.document.findFirst({
        where: { id: documentId, userId }
      });

      if (existingDoc && existingDoc.status !== 'uploading') {
        console.log(`📥 [completeSingleDocument] Document ${documentId} already in status: ${existingDoc.status}`);
        res.status(200).json({
          success: true,
          queued: false,
          message: `Document already in ${existingDoc.status} status`
        });
        return;
      }

      res.status(404).json({ error: 'Document not found or not in uploading status' });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // INTEGRITY VERIFICATION - Verify upload completed correctly
    // ═══════════════════════════════════════════════════════════════════════════════
    let verifiedHash: string | null = null;

    try {
      // Get S3 metadata to verify the file exists and get its ETag
      const s3Metadata = await getFileMetadata(document.encryptedFilename);

      // S3 ETag is the MD5 hash for single-part uploads (enclosed in quotes)
      const s3Etag = s3Metadata.etag?.replace(/"/g, '') || null;
      const s3Size = s3Metadata.size;

      console.log(`🔒 [Integrity] S3 ETag: ${s3Etag}, S3 Size: ${s3Size}`);

      // Verify file size matches if client provided it
      if (fileSize && s3Size && Math.abs(Number(fileSize) - s3Size) > 0) {
        console.error(`❌ [Integrity] Size mismatch! Client: ${fileSize}, S3: ${s3Size}`);
        res.status(400).json({
          error: 'Upload integrity check failed',
          code: 'SIZE_MISMATCH',
          message: `File size mismatch. Expected ${fileSize} bytes, got ${s3Size} bytes. Please re-upload.`
        });
        return;
      }

      // Verify hash if client provided it (MD5 hash comparison)
      if (fileHash && s3Etag) {
        // Normalize both hashes for comparison (lowercase, no dashes)
        const normalizedClientHash = fileHash.toLowerCase().replace(/-/g, '');
        const normalizedS3Hash = s3Etag.toLowerCase().replace(/-/g, '');

        // For multipart uploads, S3 ETag contains a dash (e.g., "abc123-5")
        // Only verify hash for single-part uploads
        if (!normalizedS3Hash.includes('-')) {
          if (normalizedClientHash !== normalizedS3Hash) {
            console.error(`❌ [Integrity] Hash mismatch! Client: ${normalizedClientHash}, S3: ${normalizedS3Hash}`);
            res.status(400).json({
              error: 'Upload integrity check failed',
              code: 'HASH_MISMATCH',
              message: 'File hash mismatch. The uploaded file may be corrupted. Please re-upload.'
            });
            return;
          }
          console.log(`✅ [Integrity] Hash verified: ${normalizedS3Hash}`);
          verifiedHash = normalizedS3Hash;
        } else {
          // Multipart upload - use client hash since S3 ETag isn't a simple MD5
          console.log(`ℹ️ [Integrity] Multipart upload detected, using client hash`);
          verifiedHash = normalizedClientHash;
        }
      } else if (s3Etag && !s3Etag.includes('-')) {
        // No client hash provided, use S3 ETag for single-part uploads
        verifiedHash = s3Etag.toLowerCase();
      }
    } catch (metadataError: any) {
      console.error(`⚠️ [Integrity] Failed to get S3 metadata: ${metadataError.message}`);
      // Continue without verification - file may still be processing
      // This is non-blocking to avoid breaking existing uploads
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // FAST AVAILABILITY - Extract text immediately, make document usable for chat
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log(`⚡ [FastExtraction] Starting for ${document.filename}...`);

    let rawText: string | null = null;
    let previewText: string | null = null;

    try {
      const extractionResult = await fastTextExtractor.extractFromS3(document.encryptedFilename, document.mimeType);
      if (extractionResult.success) {
        rawText = extractionResult.rawText;
        previewText = extractionResult.previewText;
        console.log(`✅ [FastAvailability] ${document.filename}: ${rawText?.length || 0} chars extracted`);
      } else {
        console.log(`⚠️ [FastExtraction] No text: ${extractionResult.error}`);
      }
    } catch (extractError: any) {
      console.error(`⚡ [FastExtraction] Error: ${extractError.message}`);
    }

    // Update to 'available' with rawText and verified hash (document is now usable for chat!)
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'available',
        rawText,
        previewText,
        // Store verified hash if available (replaces 'pending' placeholder)
        ...(verifiedHash && { fileHash: verifiedHash })
      }
    });

    // Emit availability event
    emitToUser(userId, 'document-processing-update', {
      documentId,
      filename: document.filename,
      status: 'available',
      stage: 'available',
      progress: 50,
      message: 'Document ready for chat'
    });

    // Queue background enrichment (embeddings) - non-blocking
    retryDocument(documentId, userId).catch(err => {
      console.error(`❌ [completeSingleDocument] Failed to queue enrichment for ${documentId}:`, err);
    });

    console.log(`✅ [completeSingleDocument] Document ${documentId} queued for processing`);

    res.status(200).json({
      success: true,
      queued: true,
      documentId,
      message: 'Document queued for processing'
    });

  } catch (error: any) {
    console.error('❌ [completeSingleDocument] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Complete bulk documents after all S3 uploads finish
 *
 * This endpoint replaces 600+ individual /complete/:documentId calls with a single batch operation.
 *
 * RACE CONDITION FIX:
 * - Individual calls: 600 concurrent requests race with each other and reconcile
 * - Bulk call: Single atomic transaction after all S3 uploads complete
 *
 * IDEMPOTENT: Uses conditional update (status == 'uploading') to prevent double-processing.
 *
 * @route POST /api/presigned-urls/complete-bulk
 * @body { documentIds: string[], uploadSessionId?: string, skipS3Check?: boolean }
 * @returns { success: boolean, confirmed: string[], failed: Array<{id, error}>, skipped: string[] }
 */
export const completeBulkDocuments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { documentIds, uploadSessionId, skipS3Check = false } = req.body;
    const userId = req.user.id;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      res.status(400).json({ error: 'documentIds array is required and must not be empty' });
      return;
    }

    console.log(`[completeBulkDocuments] Processing ${documentIds.length} documents for user ${userId}`);
    if (uploadSessionId) {
      console.log(`[completeBulkDocuments] Session: ${uploadSessionId}`);
    }

    const startTime = Date.now();
    const confirmed: string[] = [];
    const failed: Array<{ id: string; error: string; permanent?: boolean }> = [];
    const skipped: string[] = []; // Already processed (not in 'uploading' status)

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 1: Find all documents that are still in 'uploading' status
    // ═══════════════════════════════════════════════════════════════════════════════
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        userId,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        encryptedFilename: true,
        fileSize: true,
        status: true
      }
    });

    // Build lookup map
    const docMap = new Map(documents.map(d => [d.id, d]));

    // Categorize documents
    const toProcess: typeof documents = [];
    const notFound: string[] = [];

    for (const docId of documentIds) {
      const doc = docMap.get(docId);
      if (!doc) {
        notFound.push(docId);
      } else if (doc.status !== 'uploading') {
        // Already processed - skip (idempotent)
        skipped.push(docId);
      } else {
        toProcess.push(doc);
      }
    }

    if (notFound.length > 0) {
      console.warn(`[completeBulkDocuments] ${notFound.length} documents not found`);
    }

    if (skipped.length > 0) {
      console.log(`[completeBulkDocuments] ${skipped.length} documents already processed (skipped)`);
    }

    console.log(`[completeBulkDocuments] ${toProcess.length} documents need processing`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 2: Optional S3 verification (HEAD check in parallel batches)
    // ═══════════════════════════════════════════════════════════════════════════════
    const verifiedDocs: typeof documents = [];
    const s3Missing: Array<{ id: string; filename: string }> = [];

    if (!skipS3Check && toProcess.length > 0) {
      console.log(`[completeBulkDocuments] Verifying ${toProcess.length} S3 objects...`);

      // Process in batches of 50 concurrent HEAD requests
      const S3_CHECK_BATCH_SIZE = 50;

      for (let i = 0; i < toProcess.length; i += S3_CHECK_BATCH_SIZE) {
        const batch = toProcess.slice(i, i + S3_CHECK_BATCH_SIZE);

        const results = await Promise.all(
          batch.map(async (doc) => {
            try {
              if (!doc.encryptedFilename) {
                return { doc, exists: false, error: 'No S3 key' };
              }
              await getFileMetadata(doc.encryptedFilename);
              return { doc, exists: true };
            } catch (error: any) {
              if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return { doc, exists: false, error: 'S3 object not found' };
              }
              // Transient error - assume file exists
              console.warn(`[S3 Check] Error checking ${doc.filename}: ${error.message}`);
              return { doc, exists: true, error: error.message };
            }
          })
        );

        for (const result of results) {
          if (result.exists) {
            verifiedDocs.push(result.doc);
          } else {
            s3Missing.push({ id: result.doc.id, filename: result.doc.filename });
          }
        }
      }

      console.log(`[completeBulkDocuments] S3 verified: ${verifiedDocs.length}, missing: ${s3Missing.length}`);
    } else {
      // Skip S3 check - trust all documents
      verifiedDocs.push(...toProcess);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 3: Batch update verified documents to 'available'
    // ═══════════════════════════════════════════════════════════════════════════════
    if (verifiedDocs.length > 0) {
      const verifiedIds = verifiedDocs.map(d => d.id);

      // IDEMPOTENT UPDATE: Only update if still in 'uploading' status
      const updateResult = await prisma.document.updateMany({
        where: {
          id: { in: verifiedIds },
          userId,
          status: 'uploading' // Conditional update - prevents race conditions
        },
        data: {
          status: 'available'
        }
      });

      console.log(`[completeBulkDocuments] Updated ${updateResult.count} documents to available`);

      // All verified docs are confirmed (even if already updated by concurrent request)
      confirmed.push(...verifiedIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 4: Mark S3-missing documents as 'failed_incomplete'
    // ═══════════════════════════════════════════════════════════════════════════════
    if (s3Missing.length > 0) {
      const missingIds = s3Missing.map(d => d.id);

      await prisma.document.updateMany({
        where: {
          id: { in: missingIds },
          userId,
          status: 'uploading' // Only if still uploading
        },
        data: {
          status: 'failed_incomplete'
        }
      });

      console.log(`[completeBulkDocuments] Marked ${s3Missing.length} documents as failed_incomplete`);

      for (const missing of s3Missing) {
        failed.push({
          id: missing.id,
          error: 'S3 object not found',
          permanent: true
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 5: Queue background enrichment for confirmed documents
    // ═══════════════════════════════════════════════════════════════════════════════
    // Queue in small batches to avoid overwhelming the system
    const ENRICH_BATCH_SIZE = 10;
    let enrichQueued = 0;

    for (let i = 0; i < confirmed.length; i += ENRICH_BATCH_SIZE) {
      const batch = confirmed.slice(i, i + ENRICH_BATCH_SIZE);

      // Fire and forget - don't await
      Promise.all(
        batch.map(docId =>
          retryDocument(docId, userId).catch(err => {
            console.error(`[completeBulkDocuments] Failed to queue enrichment for ${docId}: ${err.message}`);
          })
        )
      );

      enrichQueued += batch.length;
    }

    console.log(`[completeBulkDocuments] Queued ${enrichQueued} documents for enrichment`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 5.5: IMMEDIATE Preview Generation for Office documents (PPTX, DOCX, XLSX)
    // This ensures previews start generating RIGHT NOW, not waiting for 5-min reconciliation
    // ═══════════════════════════════════════════════════════════════════════════════
    const officeDocsForPreview = verifiedDocs.filter(doc =>
      doc.mimeType && OFFICE_MIME_TYPES.includes(doc.mimeType)
    );

    if (officeDocsForPreview.length > 0) {
      console.log(`📄 [completeBulkDocuments] Enqueueing ${officeDocsForPreview.length} Office documents for IMMEDIATE preview generation`);

      // Fire and forget - don't block the response
      Promise.all(
        officeDocsForPreview.map(doc =>
          addPreviewGenerationJob({
            documentId: doc.id,
            userId,
            filename: doc.filename,
            mimeType: doc.mimeType || '',
          }).catch(err => {
            console.error(`[completeBulkDocuments] Failed to queue preview for ${doc.id}: ${err.message}`);
          })
        )
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 6: Emit WebSocket events for all confirmed documents
    // ═══════════════════════════════════════════════════════════════════════════════
    for (const doc of verifiedDocs) {
      emitToUser(userId, 'document-processing-update', {
        documentId: doc.id,
        filename: doc.filename,
        status: 'available',
        stage: 'available',
        progress: 50,
        message: 'Document ready for chat'
      });
    }

    const elapsedMs = Date.now() - startTime;

    // ═══════════════════════════════════════════════════════════════════════════════
    // STRUCTURED MONITORING LOG
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log(JSON.stringify({
      event: 'upload_session_complete',
      sessionId: uploadSessionId || 'unknown',
      userId: userId.substring(0, 8) + '...',
      stats: {
        attempted: documentIds.length,
        confirmed: confirmed.length,
        failed: failed.length,
        skipped: skipped.length,
        durationMs: elapsedMs
      }
    }));

    res.status(200).json({
      success: true,
      confirmed,
      failed,
      skipped,
      stats: {
        total: documentIds.length,
        confirmed: confirmed.length,
        failed: failed.length,
        skipped: skipped.length,
        notFound: notFound.length,
        elapsedMs
      }
    });

  } catch (error: any) {
    console.error('[completeBulkDocuments] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Reconcile orphaned uploads after a session ends
 * Marks DB records without S3 objects as 'failed_incomplete'
 *
 * INVARIANT ENFORCED:
 * - discovered = confirmed + failed + skipped
 * - No DB records left in 'uploading' status after session ends
 */
export const reconcileOrphanedUploads = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { documentIds, sessionId } = req.body;
    const userId = req.user.id;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      res.status(400).json({ error: 'Document IDs array is required' });
      return;
    }

    console.log(`🔍 [Reconciliation] Starting for ${documentIds.length} documents (session: ${sessionId || 'unknown'})`);

    // Find all documents in the list that are still in 'uploading' status
    const uploadingDocs = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        userId,
        status: 'uploading'
      },
      select: {
        id: true,
        filename: true,
        encryptedFilename: true,
        fileSize: true
      }
    });

    if (uploadingDocs.length === 0) {
      console.log(`✅ [Reconciliation] No orphaned documents found`);
      res.status(200).json({
        success: true,
        orphanedCount: 0,
        message: 'No orphaned documents found'
      });
      return;
    }

    console.log(`⚠️ [Reconciliation] Found ${uploadingDocs.length} documents still in 'uploading' status`);

    // For each document, check if S3 object exists
    const orphanedIds: string[] = [];
    const verifiedIds: string[] = [];

    for (const doc of uploadingDocs) {
      try {
        const metadata = await getFileMetadata(doc.encryptedFilename);

        // Verify size matches if we have expected size
        if (doc.fileSize && metadata.size) {
          if (Math.abs(doc.fileSize - metadata.size) > 0) {
            console.log(`❌ [Reconciliation] Size mismatch for ${doc.filename}: expected ${doc.fileSize}, got ${metadata.size}`);
            orphanedIds.push(doc.id);
            continue;
          }
        }

        // S3 object exists and size matches - mark for completion
        console.log(`✅ [Reconciliation] S3 verified for ${doc.filename}`);
        verifiedIds.push(doc.id);
      } catch (s3Error: any) {
        // S3 object doesn't exist - this is an orphaned DB record
        console.log(`❌ [Reconciliation] S3 missing for ${doc.filename}: ${s3Error.message}`);
        orphanedIds.push(doc.id);
      }
    }

    // Mark orphaned documents as 'failed_incomplete'
    if (orphanedIds.length > 0) {
      await prisma.document.updateMany({
        where: {
          id: { in: orphanedIds },
          userId
        },
        data: {
          status: 'failed_incomplete'
        }
      });
      console.log(`🔴 [Reconciliation] Marked ${orphanedIds.length} documents as 'failed_incomplete'`);
    }

    // Complete verified documents that were missed
    if (verifiedIds.length > 0) {
      // Update to 'available' since S3 upload succeeded
      await prisma.document.updateMany({
        where: {
          id: { in: verifiedIds },
          userId
        },
        data: {
          status: 'available'
        }
      });
      console.log(`✅ [Reconciliation] Marked ${verifiedIds.length} verified documents as 'available'`);
    }

    // Emit WebSocket event
    emitDocumentEvent(userId, 'updated');

    // ═══════════════════════════════════════════════════════════════════════════════
    // MONITORING: Log error if orphaned > 0 (indicates upload issues)
    // ═══════════════════════════════════════════════════════════════════════════════
    if (orphanedIds.length > 0) {
      console.error(JSON.stringify({
        event: 'upload_session_orphaned',
        severity: 'ERROR',
        sessionId: sessionId || 'unknown',
        orphanedCount: orphanedIds.length,
        verifiedCount: verifiedIds.length
      }));
    }

    res.status(200).json({
      success: true,
      orphanedCount: orphanedIds.length,
      verifiedCount: verifiedIds.length,
      orphanedDocuments: orphanedIds,
      verifiedDocuments: verifiedIds,
      message: `Reconciled ${uploadingDocs.length} documents: ${orphanedIds.length} failed_incomplete, ${verifiedIds.length} verified`
    });

  } catch (error: any) {
    console.error('❌ [Reconciliation] Error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Manually trigger processing for documents stuck in "uploading" status
 * This is a recovery endpoint for when completeBatchUpload fails
 */
export const retriggerStuckDocuments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = req.user.id;

    console.log(`🔄 [retriggerStuckDocuments] Finding stuck documents for user ${userId}...`);

    // Find all documents stuck in "uploading" status for this user
    const stuckDocuments = await prisma.document.findMany({
      where: {
        userId,
        status: 'uploading',
        createdAt: {
          // Only process documents uploaded more than 5 minutes ago
          lt: new Date(Date.now() - 5 * 60 * 1000)
        }
      },
      select: {
        id: true,
        encryptedFilename: true,
        mimeType: true,
        filename: true,
        createdAt: true
      }
    });

    console.log(`📊 [retriggerStuckDocuments] Found ${stuckDocuments.length} stuck documents`);

    if (stuckDocuments.length === 0) {
      res.status(200).json({
        success: true,
        message: 'No stuck documents found',
        count: 0
      });
      return;
    }

    // Update status to "processing"
    const updateResult = await prisma.document.updateMany({
      where: {
        id: { in: stuckDocuments.map(d => d.id) },
        userId
      },
      data: {
        status: 'processing'
      }
    });

    console.log(`✅ [retriggerStuckDocuments] Updated ${updateResult.count} documents to processing`);

    // Start background processing
    let queuedCount = 0;
    let skippedCount = 0;

    for (const doc of stuckDocuments) {
      try {
        await retryDocument(doc.id, userId);
        queuedCount++;
        console.log(`✅ [retriggerStuckDocuments] Started processing: ${doc.filename}`);
      } catch (error) {
        console.error(`❌ [retriggerStuckDocuments] Failed to start ${doc.id}:`, error);
        skippedCount++;
      }
    }

    console.log(`✅ [retriggerStuckDocuments] Started ${queuedCount} documents, skipped ${skippedCount}`);

    // Emit WebSocket event
    emitDocumentEvent(userId, 'updated');

    res.status(200).json({
      success: true,
      message: `Retriggered processing for ${queuedCount} stuck documents`,
      count: queuedCount,
      skipped: skippedCount,
      documents: stuckDocuments.map(d => ({
        id: d.id,
        filename: d.filename,
        createdAt: d.createdAt
      }))
    });

  } catch (error: any) {
    console.error('❌ [retriggerStuckDocuments] Error:', error);
    res.status(500).json({ error: error.message });
  }
};
