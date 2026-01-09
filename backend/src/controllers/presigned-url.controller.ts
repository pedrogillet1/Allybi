import { Request, Response } from 'express';
import prisma from '../config/database';
import { retryDocument } from '../services/document.service';
import { generatePresignedUploadUrl } from '../config/storage';
import { emitDocumentEvent, emitToUser } from '../services/websocket.service';
import { fastTextExtractor } from '../services/fastTextExtractor.service';

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

    const { files, folderId } = req.body;
    const userId = req.user.id;

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'Files array is required and must not be empty' });
      return;
    }

    const startTime = Date.now();
    console.log(`📝 Generating ${files.length} presigned URLs for user ${userId}`);

    // ✅ OPTIMIZATION: Validate all file sizes upfront
    const MAX_FILE_SIZE = 500 * 1024 * 1024;
    for (const file of files) {
      if (file.fileSize > MAX_FILE_SIZE) {
        res.status(400).json({
          error: `File too large: ${file.fileName} (${(file.fileSize / 1024 / 1024).toFixed(2)}MB). Maximum size is 500MB.`
        });
        return;
      }
    }

    // ✅ NEW: Create folder hierarchy from relative paths
    const folderMap = await createFolderHierarchy(files, userId, folderId);
    console.log(`📊 [FOLDERS] Created/found ${folderMap.size} folders in hierarchy`);

    // ✅ OPTIMIZATION: Process files in parallel batches of 50 to avoid connection pool exhaustion
    const BATCH_SIZE = 50;
    const results: Array<{
      presignedUrl: string;
      documentId: string;
      encryptedFilename: string;
    }> = [];

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)} (${batch.length} files)`);

      const batchResults = await Promise.all(
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
              isEncrypted: false // Client-side encryption not implemented yet
            }
          });

          return {
            presignedUrl,
            documentId: document.id,
            encryptedFilename
          };
        })
      );

      results.push(...batchResults);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Generated ${results.length} presigned URLs successfully in ${duration}ms`);
    console.log(`📊 [METRICS] URL generation speed: ${(results.length / (duration / 1000)).toFixed(2)} URLs/second`);
    console.log(`📊 [METRICS] Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);

    // 🔔 Emit WebSocket event to notify UI of new documents (with "uploading" status)
    console.log(`🔔 Notifying UI: ${results.length} documents created (status: uploading)`);
    emitDocumentEvent(userId, 'created');

    res.status(200).json({
      presignedUrls: results.map(r => r.presignedUrl),
      documentIds: results.map(r => r.documentId),
      encryptedFilenames: results.map(r => r.encryptedFilename)
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
    const userId = req.user.id;

    if (!documentId) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    console.log(`📥 [completeSingleDocument] Processing document ${documentId} for user ${userId}`);

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
        encryptedFilename: true
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

    // Update to 'available' with rawText (document is now usable for chat!)
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'available',
        rawText,
        previewText
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
