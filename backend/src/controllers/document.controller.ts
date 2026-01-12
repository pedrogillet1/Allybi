import { Request, Response } from 'express';
import * as documentService from '../services/document.service';
import { sendDocumentShareEmail } from '../services/email.service';
import { config } from '../config/env';
import { getSignedUploadUrl } from '../config/storage';
import crypto from 'crypto';
import { emitDocumentEvent, emitToUser } from '../services/websocket.service';
import { getContainer } from '../bootstrap/container';
// cacheService now accessed via getContainer().getCache()
import { redisConnection } from '../config/redis';

/**
 * Generate signed upload URL for direct-to-GCS upload
 */
export const getUploadUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { fileName, fileType, folderId } = req.body;

    if (!fileName || !fileType) {
      res.status(400).json({ error: 'fileName and fileType are required' });
      return;
    }

    // Generate unique document ID upfront
    const documentId = crypto.randomUUID();

    // Generate unique encrypted filename for S3
    const encryptedFilename = `${req.user.id}/${documentId}-${Date.now()}`;

    // Generate signed upload URL (valid for 10 minutes)
    const uploadUrl = await getSignedUploadUrl(encryptedFilename, fileType, 600);

    res.status(200).json({
      uploadUrl,
      documentId,
      encryptedFilename,
      expiresIn: 600, // seconds
    });
  } catch (error) {
    const err = error as Error;
    console.error('Get upload URL error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Confirm upload and create document record (called after direct upload to S3)
 */
export const confirmUpload = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      encryptedFilename,
      filename,
      mimeType,
      fileSize,
      fileHash,
      folderId,
      thumbnailData // Base64 thumbnail data (optional)
    } = req.body;

    if (!encryptedFilename || !filename || !mimeType || !fileSize || !fileHash) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Create document record and process it
    const document = await documentService.createDocumentAfterUpload({
      userId: req.user.id,
      encryptedFilename,
      filename,
      mimeType,
      fileSize,
      fileHash,
      folderId: folderId || undefined,
      thumbnailData: thumbnailData || undefined,
    });

    if (!document) {
      res.status(500).json({ error: 'Failed to create document' });
      return;
    }

    // ✅ CACHE FIX: Invalidate cache BEFORE emitting events
    // This ensures frontend gets fresh data when it fetches
    await getContainer().getCache().invalidateUserCache(req.user.id);
    console.log('🗑️ [Cache] Invalidated user cache synchronously');

    // ✅ INSTANT UPLOAD FIX: Emit FULL document object via WebSocket
    // Document is created with status: 'processing'
    // Frontend will add it to state immediately and show it in the UI
    emitToUser(req.user.id, 'document-created', document);
    console.log('📡 [WebSocket] Emitted document-created event with full document object');

    // Emit folder-tree-updated event to refresh folder tree
    emitToUser(req.user.id, 'folder-tree-updated', { documentId: document.id });

    res.status(201).json({
      message: 'Document uploaded successfully',
      document,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Confirm upload error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Upload a document
 */
export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Handle files from upload.fields()
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const fileArray = files?.file;
    const thumbnailArray = files?.thumbnail;

    if (!fileArray || fileArray.length === 0) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const file = fileArray[0];
    const thumbnail = thumbnailArray && thumbnailArray.length > 0 ? thumbnailArray[0] : undefined;

    const {
      folderId,
      fileHash,
      filename,
      relativePath,
      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Extract encryption metadata
      isEncrypted,
      encryptionSalt,
      encryptionIV,
      encryptionAuthTag,
      filenameEncrypted,
      originalMimeType,
      originalFilename,
      // ⚡ TEXT EXTRACTION: Encrypted text and plaintext for embeddings
      extractedTextEncrypted,
      plaintextForEmbeddings
    } = req.body;

    // 🔍 DEBUG: Log what we received from frontend
    console.log('📥 [Upload] Received upload request:', {
      filename: filename || file.originalname,
      fileSize: file.size,
      isEncrypted,
      hasEncryptionSalt: !!encryptionSalt,
      hasEncryptionIV: !!encryptionIV,
      hasEncryptionAuthTag: !!encryptionAuthTag,
      hasPlaintextForEmbeddings: !!plaintextForEmbeddings,
      bodyKeys: Object.keys(req.body)
    });

    if (!fileHash) {
      res.status(400).json({ error: 'File hash is required' });
      return;
    }

    // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Handle encrypted files
    let finalFilename: string;
    let finalMimeType: string;
    let encryptionMetadata: any = undefined;

    if (isEncrypted === 'true') {
      console.log('🔐 [Encryption] Receiving encrypted file');

      // Parse encrypted filename object
      const parsedFilenameEncrypted = filenameEncrypted ? JSON.parse(filenameEncrypted) : null;

      // Parse encrypted text object (if provided)
      const parsedExtractedTextEncrypted = extractedTextEncrypted ? JSON.parse(extractedTextEncrypted) : null;

      // Use original filename for display
      finalFilename = (originalFilename || file.originalname).normalize('NFC');

      // Use original MIME type for file type detection
      finalMimeType = originalMimeType || file.mimetype;

      // Prepare encryption metadata for storage
      encryptionMetadata = {
        isEncrypted: true,
        encryptionSalt,
        encryptionIV,
        encryptionAuthTag,
        filenameEncrypted: parsedFilenameEncrypted,
        extractedTextEncrypted: parsedExtractedTextEncrypted, // Store encrypted text
      };

      console.log('✅ [Encryption] Metadata extracted:', {
        filename: finalFilename,
        mimeType: finalMimeType,
        hasMetadata: !!encryptionMetadata,
        hasExtractedText: !!parsedExtractedTextEncrypted,
        hasPlaintext: !!plaintextForEmbeddings
      });
    } else {
      // Use filename from request body (properly encoded from frontend) or fallback to multer's filename
      // Normalize to NFC form to handle special characters like ç correctly
      finalFilename = (filename || file.originalname).normalize('NFC');
      finalMimeType = file.mimetype;
    }

    const document = await documentService.uploadDocument({
      userId: req.user.id,
      filename: finalFilename,
      fileBuffer: file.buffer,
      mimeType: finalMimeType,
      folderId: folderId || undefined,
      fileHash,
      thumbnailBuffer: thumbnail?.buffer,
      relativePath: relativePath || undefined,
      encryptionMetadata, // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Pass encryption metadata
      plaintextForEmbeddings: plaintextForEmbeddings || undefined, // ⚡ TEXT EXTRACTION: Pass plaintext for embeddings
    });

    if (!document) {
      res.status(500).json({ error: 'Failed to upload document' });
      return;
    }

    // Check if document already existed (duplicate upload)
    const isExisting = (document as any).isExisting === true;

    // Remove the isExisting flag from the document object before sending
    const { isExisting: _, ...cleanDocument } = document as any;

    if (!isExisting) {
      // ✅ INSTANT UPLOAD: Emit FULL document object via WebSocket (only for new uploads)
      // Document is returned with status='processing', frontend will add it to state immediately
      emitToUser(req.user.id, 'document-created', cleanDocument);
      console.log('📡 [WebSocket] Emitted document-created event with full document object');

      // Invalidate cache immediately
      await getContainer().getCache().invalidateDocumentListCache(req.user.id);
      console.log('🗑️ [Cache] Invalidated document list cache immediately');

      // Emit folder-tree-updated event to refresh folder tree
      emitToUser(req.user.id, 'folder-tree-updated', { documentId: cleanDocument.id });
    } else {
      console.log('📋 [Upload] File already exists, returning existing document');
    }

    res.status(201).json({
      message: isExisting ? 'File already exists in this folder' : 'Document uploaded successfully',
      document: cleanDocument,
      isExisting,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Upload multiple documents
 */
export const uploadMultipleDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const files = req.files as Express.Multer.File[];

    console.log(`📥 [Backend] Received ${files?.length || 0} file(s)`);
    console.log(`📥 [Backend] Files:`, files?.map(f => f.originalname).join(', '));

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const { folderId, fileHashes, filenames, relativePaths } = req.body;

    // Parse fileHashes if sent as JSON string
    const parsedFileHashes = typeof fileHashes === 'string' ? JSON.parse(fileHashes) : fileHashes;

    if (!parsedFileHashes || !Array.isArray(parsedFileHashes) || parsedFileHashes.length !== files.length) {
      res.status(400).json({ error: 'File hashes are required for each file' });
      return;
    }

    // Parse filenames if sent as JSON string
    const parsedFilenames = filenames ? JSON.parse(filenames) : null;

    // Parse relativePaths if sent as JSON string (for folder uploads)
    const parsedRelativePaths = relativePaths ? (typeof relativePaths === 'string' ? JSON.parse(relativePaths) : relativePaths) : null;

    const uploadPromises = files.map((file, index) => {
      // Use filename from request body (properly encoded from frontend) or fallback to multer's filename
      // Normalize to NFC form to handle special characters like ç correctly
      const filename = (parsedFilenames && parsedFilenames[index] ? parsedFilenames[index] : file.originalname).normalize('NFC');

      // Get relativePath for this file (used for folder structure preservation)
      const relativePath = parsedRelativePaths && parsedRelativePaths[index] ? parsedRelativePaths[index] : undefined;

      return documentService.uploadDocument({
        userId: req.user!.id,
        filename: filename,
        fileBuffer: file.buffer,
        mimeType: file.mimetype,
        folderId: folderId || undefined,
        fileHash: parsedFileHashes[index],
        relativePath: relativePath,
      });
    });

    const documents = await Promise.all(uploadPromises);

    // Separate new uploads from existing documents
    const newDocuments = documents.filter(doc => doc && !(doc as any).isExisting);
    const existingDocuments = documents.filter(doc => doc && (doc as any).isExisting);

    // Clean isExisting flag from all documents
    const cleanDocuments = documents.map(doc => {
      if (!doc) return doc;
      const { isExisting: _, ...clean } = doc as any;
      return clean;
    });

    console.log(`📤 [Backend] Returning ${documents.length} document(s) to frontend (${newDocuments.length} new, ${existingDocuments.length} existing)`);
    console.log(`📤 [Backend] Document IDs:`, cleanDocuments.map(d => d?.id || 'null').join(', '));

    // Emit real-time events only for newly created documents
    newDocuments.forEach(doc => {
      if (doc) {
        emitDocumentEvent(req.user!.id, 'created', doc.id);
      }
    });

    // ✅ INSTANT UPLOAD: Invalidate cache immediately (no delay!) - only if new docs uploaded
    if (newDocuments.length > 0) {
      await getContainer().getCache().invalidateDocumentListCache(req.user.id);
      console.log('🗑️ [Cache] Invalidated document list cache immediately');

      // Emit folder-tree-updated event to refresh folder tree
      emitToUser(req.user.id, 'folder-tree-updated', { documentCount: newDocuments.length });
    }

    res.status(201).json({
      message: existingDocuments.length > 0
        ? `${newDocuments.length} documents uploaded, ${existingDocuments.length} already existed`
        : `${cleanDocuments.length} documents uploaded successfully`,
      documents: cleanDocuments,
      existingCount: existingDocuments.length,
    });
  } catch (error) {
    const err = error as Error;
    console.error('Multiple upload error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get document download URL
 */
export const getDownloadUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const result = await documentService.getDocumentDownloadUrl(id, req.user.id);

    res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get document view URL (signed URL for direct viewing, no forced download)
 */
export const getViewUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    // Pass request object to construct proper base URL (ngrok, localhost, etc.)
    const result = await documentService.getDocumentViewUrl(id, req.user.id, req);

    res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Stream document file (proxies from GCS to avoid CORS issues)
 */
export const streamDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    // Get decrypted file buffer from service
    const { buffer, filename, mimeType } = await documentService.streamDocument(id, req.user.id);

    // Set appropriate headers for viewing (especially for Safari/Mac PDF viewing)
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Accept-Ranges', 'bytes'); // Important for Safari PDF viewing
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // Allow cross-origin access
    res.setHeader('Content-Length', buffer.length.toString());

    // Use res.end with binary encoding for PDFs to prevent corruption
    if (mimeType === 'application/pdf') {
      res.end(buffer, 'binary');
    } else {
      res.send(buffer);
    }
  } catch (error) {
    const err = error as Error;
    console.error(`❌ Stream document error for ID ${req.params.id}:`, err.message);

    // Provide more specific error messages
    if (err.message.includes('not found')) {
      res.status(404).json({
        error: 'File not found in storage',
        details: 'This document may have been deleted or is unavailable. Please re-upload the file.',
        documentId: req.params.id
      });
    } else {
      res.status(400).json({ error: err.message });
    }
  }
};

/**
 * Stream converted PDF for DOCX preview
 */
export const streamPreviewPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    console.log(`📄 [streamPreviewPdf] Starting PDF stream for document: ${id}`);

    // Get PDF buffer from service
    const { buffer, filename } = await documentService.streamPreviewPdf(id, req.user.id);

    console.log(`✅ [streamPreviewPdf] Got PDF buffer: ${(buffer.length / 1024).toFixed(2)} KB, filename: ${filename}`);

    // Verify PDF header
    const pdfHeader = buffer.slice(0, 5).toString();
    if (!pdfHeader.startsWith('%PDF-')) {
      console.error(`❌ [streamPreviewPdf] Invalid PDF header: ${pdfHeader}`);
      throw new Error('Invalid PDF file - missing PDF header');
    }

    // Set appropriate headers for PDF viewing
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename.replace(/\.[^.]+$/, '.pdf'))}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Length', buffer.length.toString());

    console.log(`📤 [streamPreviewPdf] Sending PDF response...`);
    res.end(buffer, 'binary');
  } catch (error) {
    const err = error as Error;
    console.error(`❌ Stream preview PDF error for ID ${req.params.id}:`, err.message);
    console.error(`❌ Stack trace:`, err.stack);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Manual retry for preview PDF generation
 * Allows users to trigger a retry when preview generation fails
 * Resets the attempt counter and forces a new generation
 */
export const retryPreviewPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    console.log(`🔄 [retryPreviewPdf] Manual retry requested for document: ${id}`);

    // Import the preview generator service
    const { generatePreviewPdf, getPreviewPdfStatus } = await import('../services/previewPdfGenerator.service');

    // Get current status
    const currentStatus = await getPreviewPdfStatus(id);
    console.log(`📊 [retryPreviewPdf] Current status: ${currentStatus.status}, attempts: ${currentStatus.attempts}`);

    // Reset attempt counter by using skipRetryCheck option
    const result = await generatePreviewPdf(id, req.user.id, { skipRetryCheck: true, isRetry: true });

    if (result.success) {
      console.log(`✅ [retryPreviewPdf] Retry succeeded for document ${id}`);
      res.status(200).json({
        success: true,
        status: result.status,
        pdfKey: result.pdfKey,
        attempts: result.attempts,
        message: 'Preview generated successfully',
      });
    } else {
      console.log(`⚠️ [retryPreviewPdf] Retry failed for document ${id}: ${result.error}`);
      res.status(200).json({
        success: false,
        status: result.status,
        error: result.error,
        attempts: result.attempts,
        message: result.status === 'max_retries_exceeded'
          ? 'Maximum retry attempts exceeded'
          : 'Preview generation failed',
      });
    }
  } catch (error) {
    const err = error as Error;
    console.error(`❌ Retry preview PDF error for ID ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * List documents
 */
export const listDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { folderId, page, limit } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 1000;

    // Try to get from cache first
    const cacheKey = getContainer().getCache().generateKey('documents_list', req.user.id, folderId, pageNum, limitNum);
    const cached = await getContainer().getCache().get<any>(cacheKey);

    if (cached) {
      console.log(`✅ Cache hit for document list (folderId: ${folderId || 'all'})`);
      res.status(200).json(cached);
      return;
    }

    const result = await documentService.listDocuments(
      req.user.id,
      folderId as string | undefined,
      pageNum,
      limitNum
    );

    // Cache the result for 2 minutes
    await getContainer().getCache().set(cacheKey, result, { ttl: 120 });

    res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
};

/**
 * Update document
 */
export const updateDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { folderId, filename } = req.body;

    const document = await documentService.updateDocument(id, req.user.id, { folderId, filename });

    // Invalidate document list cache
    await getContainer().getCache().invalidateDocumentListCache(req.user.id);

    // Emit real-time event for document update (moved or renamed)
    if (folderId !== undefined) {
      emitDocumentEvent(req.user.id, 'moved', id);
    } else {
      emitDocumentEvent(req.user.id, 'updated', id);
    }

    res.status(200).json({
      message: 'Document updated successfully',
      document,
    });
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Update document encryption metadata
 * Called by frontend after client-side encryption
 */
export const updateEncryptionMetadata = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const {
      isEncrypted,
      encryptionSalt,
      encryptionIV,
      encryptionAuthTag,
      filenameEncrypted,
      filenameIV,
      originalMimeType
    } = req.body;

    const prisma = (await import('../config/database')).default;

    // Verify document belongs to user
    const document = await prisma.document.findUnique({
      where: { id },
      select: { userId: true, id: true }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (document.userId !== req.user.id) {
      res.status(403).json({ error: 'Unauthorized access to document' });
      return;
    }

    // Update document with encryption metadata
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        isEncrypted: isEncrypted || false,
        encryptionSalt: encryptionSalt || null,
        encryptionIV: encryptionIV || null,
        encryptionAuthTag: encryptionAuthTag || null,
        filenameEncrypted: filenameEncrypted || null,
        // Store original mimeType in metadata if encrypted
        ...(originalMimeType && {
          mimeType: originalMimeType
        })
      }
    });

    console.log(`🔐 [ENCRYPTION] Updated encryption metadata for document ${id}`);

    res.status(200).json({
      message: 'Encryption metadata updated successfully',
      document: {
        id: updatedDocument.id,
        isEncrypted: updatedDocument.isEncrypted
      }
    });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [ENCRYPTION] Failed to update encryption metadata:', err.message);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Update document markdown content
 */
export const updateMarkdown = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { markdownContent } = req.body;

    if (markdownContent === undefined) {
      res.status(400).json({ error: 'markdownContent is required' });
      return;
    }

    const prisma = (await import('../config/database')).default;

    // Verify document belongs to user
    const document = await prisma.document.findUnique({
      where: { id },
      select: { userId: true, id: true }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (document.userId !== req.user.id) {
      res.status(403).json({ error: 'Unauthorized access to document' });
      return;
    }

    // Update markdown content in metadata
    const updatedMetadata = await prisma.documentMetadata.upsert({
      where: { documentId: id },
      update: { markdownContent },
      create: {
        document: { connect: { id } },
        markdownContent
      }
    });

    res.status(200).json({
      message: 'Markdown updated successfully',
      metadata: updatedMetadata
    });
  } catch (error) {
    const err = error as Error;
    console.error('Update markdown error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete document
 */
export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    await documentService.deleteDocument(id, req.user.id);

    // Emit real-time event for document deletion
    emitDocumentEvent(req.user.id, 'deleted', id);

    // Invalidate RAG cache (document removed, search results may change)
    await getContainer().getCache().invalidateUserCache(req.user.id);

    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Upload new version
 */
export const uploadVersion = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { id } = req.params;
    const { fileHash, filename } = req.body;

    if (!fileHash) {
      res.status(400).json({ error: 'File hash is required' });
      return;
    }

    // Use filename from request body (properly encoded from frontend) or fallback to multer's filename
    // Normalize to NFC form to handle special characters like ç correctly
    const finalFilename = (filename || req.file.originalname).normalize('NFC');

    const document = await documentService.uploadDocumentVersion(id, {
      userId: req.user.id,
      filename: finalFilename,
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      fileHash,
    });

    res.status(201).json({
      message: 'New version uploaded successfully',
      document,
    });
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get document versions
 */
export const getVersions = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const versions = await documentService.getDocumentVersions(id, req.user.id);

    res.status(200).json({ versions });
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get document processing status
 */
export const getDocumentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const status = await documentService.getDocumentStatus(id, req.user.id);

    res.status(200).json(status);
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get document thumbnail
 */
export const getThumbnail = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const { thumbnailUrl } = await documentService.getDocumentThumbnail(id, req.user.id);

    res.status(200).json({ thumbnailUrl });
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get document preview (returns PDF for DOCX files)
 */
export const getPreview = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const preview = await documentService.getDocumentPreview(id, req.user.id);

    res.status(200).json(preview);
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
};

/**
 * Share a document via email
 */
export const shareDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Get document and user info
    const prisma = (await import('../config/database')).default;
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (document.userId !== req.user.id) {
      res.status(403).json({ error: 'Unauthorized access to document' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { firstName: true, lastName: true, email: true }
    });

    const senderName = user?.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : user?.email || 'A Koda user';

    // Send email
    await sendDocumentShareEmail(email, document.filename, senderName);

    res.json({ message: 'Document shared successfully' });
  } catch (error) {
    console.error('Error sharing document:', error);
    res.status(500).json({ error: 'Failed to share document' });
  }
};

/**
 * Reprocess document (regenerate embeddings and metadata)
 * TODO: Implement reprocessDocument method in document.service.ts
 */
export const reprocessDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const result = await documentService.reprocessDocument(id, req.user.id);

    res.status(200).json({
      message: 'Document reprocessing started successfully',
      result
    });
  } catch (error) {
    const err = error as Error;
    console.error('Reprocess error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Retry failed document processing
 * Restarts async processing for a failed document
 */
export const retryDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const result = await documentService.retryDocument(id, req.user.id);

    // Emit real-time event for document retry
    emitDocumentEvent(req.user.id, 'processing', id);

    res.status(200).json({
      message: 'Document processing restarted successfully',
      document: result
    });
  } catch (error) {
    const err = error as Error;
    console.error('Retry error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Search within a document
 */
export const searchInDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const prisma = (await import('../config/database')).default;

    // Get document with metadata
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        metadata: true,
      },
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (document.userId !== req.user.id) {
      res.status(403).json({ error: 'Unauthorized access to document' });
      return;
    }

    // Get extracted text from metadata
    let extractedText = '';
    if (document.metadata) {
      extractedText = document.metadata.extractedText || '';
    }

    if (!extractedText) {
      res.status(200).json({
        success: true,
        query,
        totalMatches: 0,
        matches: [],
        message: 'No text available for search. Document may still be processing.'
      });
      return;
    }

    // Search for query in text (case-insensitive)
    const matches: Array<{
      index: number;
      text: string;
      context: string;
      position: number;
    }> = [];

    const lowerText = extractedText.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let startIndex = 0;
    let matchIndex;

    while ((matchIndex = lowerText.indexOf(lowerQuery, startIndex)) !== -1) {
      // Get context around match (50 chars before and after)
      const contextStart = Math.max(0, matchIndex - 50);
      const contextEnd = Math.min(extractedText.length, matchIndex + query.length + 50);
      const context = extractedText.substring(contextStart, contextEnd);

      matches.push({
        index: matchIndex,
        text: extractedText.substring(matchIndex, matchIndex + query.length),
        context: context,
        position: matches.length + 1
      });

      startIndex = matchIndex + 1;
    }

    res.status(200).json({
      success: true,
      query: query,
      totalMatches: matches.length,
      matches: matches
    });
  } catch (error) {
    const err = error as Error;
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
};

/**
 * Get PPTX slides data for preview
 */
export const getPPTXSlides = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const prisma = (await import('../config/database')).default;

    // Get document with metadata
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        metadata: true,
      },
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (document.userId !== req.user.id) {
      res.status(403).json({ error: 'Unauthorized access to document' });
      return;
    }

    // Check if document is PPTX
    const isPPTX = document.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (!isPPTX) {
      res.status(400).json({ error: 'Document is not a PowerPoint presentation' });
      return;
    }

    // Get slides data from metadata (stored as JSON string)
    console.log('📊 Raw slidesData from DB:', document.metadata?.slidesData);
    console.log('📊 Raw pptxMetadata from DB:', document.metadata?.pptxMetadata);

    let slidesData: any[] = [];
    try {
      if (document.metadata?.slidesData) {
        slidesData = typeof document.metadata.slidesData === 'string'
          ? JSON.parse(document.metadata.slidesData as string)
          : document.metadata.slidesData as any[];
      }
    } catch (error) {
      console.error('❌ Failed to parse slidesData:', error);
    }

    // Parse pptxMetadata if it's a string
    let pptxMetadata: any = {};
    try {
      if (document.metadata?.pptxMetadata) {
        pptxMetadata = typeof document.metadata.pptxMetadata === 'string'
          ? JSON.parse(document.metadata.pptxMetadata as string)
          : document.metadata.pptxMetadata;
      }
    } catch (error) {
      console.error('❌ Failed to parse pptxMetadata:', error);
    }

    console.log('📊 Parsed slidesData:', slidesData);
    console.log('📊 Parsed pptxMetadata:', pptxMetadata);

    if (!slidesData || slidesData.length === 0) {
      console.log('📊 No slides found, returning empty response');
      res.status(200).json({
        success: true,
        slides: [],
        totalSlides: 0,
        metadata: pptxMetadata,
        message: 'No slides data available. Document may still be processing.'
      });
      return;
    }

    // Generate signed URLs for slide images stored in GCS/S3
    const { getSignedUrl } = await import('../config/storage');
    const slidesWithUrls = await Promise.all(
      slidesData.map(async (slide: any) => {
        if (slide.imageUrl) {
          try {
            let filePath: string | null = null;

            // Handle GCS URLs (format: gcs://bucket-name/path)
            if (slide.imageUrl.startsWith('gcs://')) {
              filePath = slide.imageUrl.replace(/^gcs:\/\/[^\/]+\//, '');
            }
            // Handle S3 URLs or direct file paths
            else if (slide.imageUrl.startsWith('s3://') || !slide.imageUrl.startsWith('http')) {
              filePath = slide.imageUrl.replace(/^s3:\/\/[^\/]+\//, '');
            }

            // If we extracted a file path, generate a fresh signed URL
            if (filePath) {
              console.log(`🔐 Generating signed URL for: ${filePath}`);
              const signedUrl = await getSignedUrl(filePath, 3600); // 1 hour expiry
              return {
                ...slide,
                imageUrl: signedUrl
              };
            }
          } catch (error) {
            console.error(`Failed to generate signed URL for slide ${slide.slideNumber}:`, error);
          }
        }
        return slide;
      })
    );

    res.status(200).json({
      success: true,
      slides: slidesWithUrls,
      totalSlides: slidesWithUrls.length,
      metadata: pptxMetadata
    });
  } catch (error) {
    const err = error as Error;
    console.error('Get PPTX slides error:', err);
    res.status(500).json({ error: 'Failed to get slides data' });
  }
};

/**
 * Regenerate PPTX slides (useful after installing ImageMagick for better font rendering)
 */
export const regeneratePPTXSlides = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const result = await documentService.regeneratePPTXSlides(id, req.user.id);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    const err = error as Error;
    console.error('Regenerate PPTX slides error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Test LibreOffice installation
 * NOTE: Service removed - returning stub response
 */
export const testLibreOffice = async (req: Request, res: Response): Promise<void> => {
  // REMOVED: pptxSlideGeneratorService was deleted
  res.status(501).json({
    installed: false,
    error: 'Service not available',
    message: 'LibreOffice check service has been removed'
  });
};

/**
 * Export document with edited markdown content
 * NOTE: Service removed - returning stub response
 */
export const exportDocument = async (req: Request, res: Response): Promise<void> => {
  // REMOVED: documentExportService was deleted
  res.status(501).json({
    error: 'Export service not available',
    message: 'Document export service has been removed'
  });
};

/**
 * Delete all documents for the current user
 * This will delete all documents, their metadata, embeddings, and GCS files
 */
export const deleteAllDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = req.user.id;

    const result = await documentService.deleteAllDocuments(userId);

    res.status(200).json({
      message: 'All documents deleted successfully',
      ...result
    });
  } catch (error) {
    const err = error as Error;
    console.error('Delete all documents error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Re-index all documents in Pinecone
 * NOTE: Service removed - returning stub response
 */
export const reindexAllDocuments = async (req: Request, res: Response): Promise<void> => {
  // REMOVED: vectorEmbeddingService was deleted
  res.status(501).json({
    success: false,
    error: 'Re-indexing service not available',
    message: 'Vector embedding service has been removed'
  });
};

/**
 * Get document processing progress
 * Endpoint: GET /api/documents/:documentId/progress
 */
export const getDocumentProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { documentId } = req.params;
    const userId = req.user.id;

    // Verify document belongs to user
    const document = await documentService.getDocumentById(documentId, userId);

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Get progress from Redis
    if (!redisConnection) {
      // No Redis connection - return status-based progress
      const statusProgress: Record<string, any> = {
        'uploading': { progress: 5, stage: 'uploading', message: 'Uploading to storage...' },
        'processing': { progress: 50, stage: 'processing', message: 'Processing document...' },
        'completed': { progress: 100, stage: 'completed', message: 'Processing complete' },
        'failed': { progress: 0, stage: 'failed', message: 'Processing failed' }
      };
      res.status(200).json(statusProgress[document.status] || { progress: 0, stage: 'unknown', message: 'Unknown status' });
      return;
    }

    const progressData = await redisConnection.get(`progress:${documentId}`);

    if (progressData) {
      const progress = JSON.parse(progressData as string);
      res.status(200).json(progress);
    } else {
      // No progress data in Redis - return status-based progress
      const statusProgress: Record<string, any> = {
        'uploading': { progress: 5, stage: 'uploading', message: 'Uploading to storage...' },
        'processing': { progress: 50, stage: 'processing', message: 'Processing document...' },
        'completed': { progress: 100, stage: 'completed', message: 'Processing complete' },
        'failed': { progress: 0, stage: 'failed', message: 'Processing failed' }
      };

      res.status(200).json(statusProgress[document.status] || { progress: 0, stage: 'unknown', message: 'Unknown status' });
    }

  } catch (error: any) {
    console.error('❌ Error fetching document progress:', error);
    res.status(500).json({ error: error.message });
  }
};
