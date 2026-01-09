import crypto from 'crypto';
import prisma from '../config/database';
import { uploadFile, downloadFile, getSignedUrl, deleteFile, bucket, fileExists } from '../config/storage';
import { config } from '../config/env';
import * as textExtractionService from './textExtraction.service';
import * as geminiService from './gemini.service';
import * as folderService from './folder.service';
// Ingestion Layer - document processing utilities (NOT used in RAG queries)
import { generateDocumentTitleOnly, markdownConversionService, fileValidator } from './ingestion';
import cacheService from './cache.service';
import encryptionService from './encryption.service';
import { invalidateUserCache } from '../controllers/batch.controller';
import { addDocumentJob } from '../queues/document.queue';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ═══════════════════════════════════════════════════════════════
// FAST AVAILABILITY: Instant text extraction for immediate chat
// ═══════════════════════════════════════════════════════════════
import { fastTextExtractor } from './fastTextExtractor.service';

// Document statuses that are usable in chat/search
const USABLE_STATUSES = ['available', 'enriching', 'ready', 'completed'];
// All statuses that should appear in file listings
const ALL_VISIBLE_STATUSES = ['uploaded', 'available', 'enriching', 'ready', 'completed', 'processing', 'uploading'];

// ═══════════════════════════════════════════════════════════════
// Docling Integration - Advanced document extraction
// ═══════════════════════════════════════════════════════════════
import { extractWithDocling } from './extraction/doclingExtractor.service';
import { isDoclingAvailable } from './extraction/doclingBridge.service';
const DOCLING_ENABLED = process.env.DOCLING_ENABLED !== 'false'; // Default enabled

// ═══════════════════════════════════════════════════════════════
// Upload Progress & Session Tracking Services
// ═══════════════════════════════════════════════════════════════
import documentProgressService from './documentProgress.service';
import uploadSessionService from './uploadSession.service';



// ═══════════════════════════════════════════════════════════════
// Semantic Chunking with Overlap - Interfaces and Fallback
// ═══════════════════════════════════════════════════════════════
interface ChunkOptions {
  maxSize: number;
  overlap: number;
  splitOn: string[];
}

interface ChunkWithPosition {
  content: string;
  index: number;
  startChar: number;
  endChar: number;
}

/**
 * Fallback chunking with overlap for improved retrieval
 * Uses smart boundary detection for cleaner chunks
 */
function chunkTextWithOverlap(text: string, options: ChunkOptions): ChunkWithPosition[] {
  const { maxSize, overlap, splitOn } = options;
  const chunks: ChunkWithPosition[] = [];

  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < text.length) {
    let endPos = Math.min(currentPos + maxSize, text.length);

    // Try to find a good break point
    if (endPos < text.length) {
      let bestBreak = endPos;

      for (const delimiter of splitOn) {
        const lastIndex = text.lastIndexOf(delimiter, endPos);
        if (lastIndex > currentPos && lastIndex > bestBreak - 100) {
          bestBreak = lastIndex + delimiter.length;
          break;
        }
      }

      endPos = bestBreak;
    }

    const content = text.substring(currentPos, endPos).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        index: chunkIndex++,
        startChar: currentPos,
        endChar: endPos,
      });
    }

    // Move forward, accounting for overlap
    const prevStartChar = chunks[chunks.length - 1]?.startChar ?? -1;
    currentPos = endPos - overlap;

    // Ensure we make progress
    if (currentPos <= prevStartChar) {
      currentPos = endPos;
    }
  }

  return chunks;
}

export interface UploadDocumentInput {
  userId: string;
  filename: string;
  fileBuffer: Buffer;
  mimeType: string;
  folderId?: string;
  fileHash: string; // SHA-256 hash from client
  relativePath?: string; // For nested folder uploads
  thumbnailBuffer?: Buffer;
  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Client-side encryption metadata
  encryptionMetadata?: {
    isEncrypted: boolean;
    encryptionSalt: string;
    encryptionIV: string;
    encryptionAuthTag: string;
    filenameEncrypted: {
      salt: string;
      iv: string;
      ciphertext: string;
      authTag: string;
    };
    extractedTextEncrypted?: {
      salt: string;
      iv: string;
      ciphertext: string;
      authTag: string;
    };
  };
  // ⚡ TEXT EXTRACTION: Plaintext for embeddings (NOT stored, only used for Pinecone)
  plaintextForEmbeddings?: string;
}

/**
 * Create folders recursively from a relative path
 */
async function createFoldersFromPath(userId: string, relativePath: string, parentFolderId: string | null = null): Promise<string> {
  // Split the path into folder names (e.g., "folder1/folder2/file.txt" -> ["folder1", "folder2"])
  const pathParts = relativePath.split('/').filter(p => p.trim() && p !== '.');

  // Remove the filename (last part)
  const folderNames = pathParts.slice(0, -1).filter(name => name !== '.' && name !== '..' && name.trim().length > 0);

  if (folderNames.length === 0) {
    // No folders in path, return the parent folder or null
    return parentFolderId || '';
  }

  let currentParentId = parentFolderId;

  // Create folders recursively
  for (const folderName of folderNames) {
    // Skip invalid folder names
    if (folderName === '.' || folderName === '..' || !folderName.trim()) {
      continue;
    }

    // Check if folder already exists at this level
    const existingFolder = await prisma.folder.findFirst({
      where: {
        userId,
        name: folderName,
        parentFolderId: currentParentId,
      },
    });

    if (existingFolder) {
      currentParentId = existingFolder.id;
    } else {
      // Create new folder
      const newFolder = await folderService.createFolder(userId, folderName, undefined, currentParentId || undefined);
      currentParentId = newFolder.id;
    }
  }

  return currentParentId || '';
}

/**
 * Upload an encrypted document (supports both server-side and zero-knowledge client-side encryption)
 */
export const uploadDocument = async (input: UploadDocumentInput) => {
  const { userId, filename, fileBuffer, mimeType, folderId, fileHash, relativePath, encryptionMetadata, plaintextForEmbeddings } = input;

  const uploadStartTime = Date.now();

  // ════════════════════════════════════════════════════════════════════════════════
  // LAYER 1: ZERO-KNOWLEDGE ENCRYPTION GUARD
  // ════════════════════════════════════════════════════════════════════════════════

  // ⚠️ ENCRYPTED UPLOAD SUPPORT CHECK
  // Zero-knowledge encryption requires all metadata fields to be present
  const ZERO_KNOWLEDGE_ENCRYPTION_ENABLED = process.env.ZERO_KNOWLEDGE_ENCRYPTION_ENABLED !== 'false';

  if (encryptionMetadata?.isEncrypted) {
    if (!ZERO_KNOWLEDGE_ENCRYPTION_ENABLED) {
      throw new Error(JSON.stringify({
        code: 'ENCRYPTION_NOT_SUPPORTED',
        message: 'Zero-knowledge encrypted uploads are disabled on this server.',
        suggestion: 'Contact your administrator to enable encrypted uploads or upload unencrypted files.',
      }));
    }

    // Validate required encryption metadata fields
    const requiredFields = ['encryptionSalt', 'encryptionIV', 'encryptionAuthTag', 'filenameEncrypted'];
    const missingFields = requiredFields.filter(field => !encryptionMetadata[field as keyof typeof encryptionMetadata]);

    if (missingFields.length > 0) {
      throw new Error(JSON.stringify({
        code: 'INVALID_ENCRYPTION_METADATA',
        message: `Missing required encryption metadata: ${missingFields.join(', ')}`,
        suggestion: 'Ensure all encryption metadata is provided when uploading encrypted files.',
      }));
    }

    console.log(`🔐 [Upload] Zero-knowledge encrypted upload for ${filename}`);
  }

  // ════════════════════════════════════════════════════════════════════════════════
  // LAYER 2: SERVER-SIDE VALIDATION
  // ════════════════════════════════════════════════════════════════════════════════

  // ⚡ SKIP VALIDATION FOR CLIENT-SIDE ENCRYPTED FILES
  // Encrypted files can't be validated because they're encrypted binary data
  // Frontend already validated them before encryption
  if (encryptionMetadata?.isEncrypted) {
    console.log(`🔐 [Validation] Skipping server-side validation for encrypted file: ${filename}`);
  } else {
    const validationStart = Date.now();

    const validationResult = await fileValidator.validateServerSide(
      fileBuffer,
      mimeType,
      filename
    );


    if (!validationResult.isValid) {
      console.error(`❌ File validation failed: ${validationResult.error}`);

      throw new Error(JSON.stringify({
        code: validationResult.errorCode,
        message: validationResult.error,
        suggestion: validationResult.suggestion,
      }));
    }

  }

  // If relativePath is provided AND contains folders (has /), create nested folders
  // Skip if it's just a filename without folder structure
  let finalFolderId = folderId;
  if (relativePath && relativePath.includes('/')) {
    finalFolderId = await createFoldersFromPath(userId, relativePath, folderId || null);
  }

  // ⚡ IDEMPOTENCY CHECK: Skip if identical file already uploaded to the SAME folder
  // ✅ FIX: Also check filename to allow identical files with different names (e.g., copy1.png, copy2.png)
  const existingDoc = await prisma.document.findFirst({
    where: {
      userId,
      fileHash,
      filename,  // ✅ CRITICAL FIX: Check filename too! Allows uploading identical content with different names
      status: 'completed',
      // Allow same file in different folders
      folderId: finalFolderId,
    },
  });

  if (existingDoc) {
    const existing = await prisma.document.findUnique({
      where: { id: existingDoc.id },
      include: { folder: true },
    });
    // Return existing document with flag indicating it already existed
    return { ...existing, isExisting: true };
  }


  // Generate unique encrypted filename
  const encryptedFilename = `${userId}/${crypto.randomUUID()}-${Date.now()}`;

  // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Handle client-side encrypted files vs server-side encryption
  let encryptedFileBuffer: Buffer;
  let encryptionIV: string;
  let encryptionAuthTag: string;
  let encryptionSalt: string | null = null;
  let filenameEncrypted: string | null = null;
  let extractedTextEncrypted: string | null = null;
  let isZeroKnowledge = false;

  if (encryptionMetadata?.isEncrypted) {
    // ⚡ ZERO-KNOWLEDGE ENCRYPTION: File is already encrypted client-side

    encryptedFileBuffer = fileBuffer; // Already encrypted
    encryptionIV = encryptionMetadata.encryptionIV;
    encryptionAuthTag = encryptionMetadata.encryptionAuthTag;
    encryptionSalt = encryptionMetadata.encryptionSalt;
    filenameEncrypted = JSON.stringify(encryptionMetadata.filenameEncrypted);

    // ⚡ TEXT EXTRACTION: Store encrypted text if provided
    if (encryptionMetadata.extractedTextEncrypted) {
      extractedTextEncrypted = JSON.stringify(encryptionMetadata.extractedTextEncrypted);
    }

    isZeroKnowledge = true;

  } else {
    // 🔒 SERVER-SIDE ENCRYPTION: Encrypt file before upload (AES-256-GCM)
    const encryptionService = await import('./encryption.service');
    encryptedFileBuffer = encryptionService.default.encryptFile(fileBuffer, `document-${userId}`);

    // Extract IV and auth tag from encrypted buffer (stored as IV + AuthTag + EncryptedData)
    encryptionIV = encryptedFileBuffer.slice(0, 16).toString('base64'); // First 16 bytes
    encryptionAuthTag = encryptedFileBuffer.slice(16, 32).toString('base64'); // Next 16 bytes
  }

  // ✅ FIX: Upload encrypted file to S3 Storage
  const uploadStart = Date.now();
  await uploadFile(encryptedFilename, encryptedFileBuffer, mimeType);

  // Thumbnail generation disabled - set to null
  const thumbnailUrl: string | null = null;

  // ═══════════════════════════════════════════════════════════════════════════════
  // FAST AVAILABILITY PIPELINE - Make document usable IMMEDIATELY
  // ═══════════════════════════════════════════════════════════════════════════════

  // Step 1: Create document record with status 'uploaded'
  const document = await prisma.document.create({
    data: {
      userId,
      folderId: finalFolderId || null,
      filename,
      encryptedFilename,
      fileSize: encryptedFileBuffer.length,
      mimeType,
      fileHash,
      status: 'uploaded', // Start as 'uploaded', will become 'available' after fast extraction
      isEncrypted: true,
      encryptionIV,
      encryptionAuthTag,
      ...(isZeroKnowledge && {
        encryptionSalt,
        filenameEncrypted,
        extractedTextEncrypted,
      }),
    },
    include: {
      folder: true,
    },
  });

  // Step 2: Run FAST text extraction inline (< 1 second)
  const extractionStart = Date.now();
  let rawText: string | null = null;
  let previewText: string | null = null;

  // For zero-knowledge files, use the provided plaintext
  if (isZeroKnowledge && plaintextForEmbeddings) {
    rawText = plaintextForEmbeddings;
    previewText = plaintextForEmbeddings.substring(0, 10000);
    console.log(`⚡ [FastExtraction] Using zero-knowledge plaintext: ${rawText.length} chars`);
  } else if (!isZeroKnowledge) {
    // For regular files, extract from the unencrypted buffer
    try {
      console.log(`⚡ [FastExtraction] Starting for ${filename}...`);
      const extractionResult = await fastTextExtractor.extractFromBuffer(fileBuffer, mimeType);

      if (extractionResult.success) {
        rawText = extractionResult.rawText;
        previewText = extractionResult.previewText;
        console.log(`⚡ [FastExtraction] Completed in ${Date.now() - extractionStart}ms - ${rawText?.length || 0} chars`);
      } else {
        console.log(`⚡ [FastExtraction] No text extracted (${extractionResult.error || 'requires OCR'})`);
      }
    } catch (extractError: any) {
      console.error(`⚡ [FastExtraction] Error: ${extractError.message}`);
    }
  }

  // Step 3: Update document to 'available' with rawText
  const updatedDocument = await prisma.document.update({
    where: { id: document.id },
    data: {
      status: 'available', // 🎉 Document is now usable in chat!
      rawText,
      previewText,
    },
    include: {
      folder: true,
    },
  });

  console.log(`✅ [FastAvailability] ${filename} is now AVAILABLE (${Date.now() - extractionStart}ms)`);

  // Step 4: Queue background enrichment AFTER returning
  setImmediate(() => {
    addDocumentJob({
      documentId: document.id,
      encryptedFilename,
      filename,
      mimeType,
      userId,
      thumbnailUrl: null,
      priority: 'normal',
      // Pass plaintext for zero-knowledge files
      ...(isZeroKnowledge && plaintextForEmbeddings && { plaintextForEmbeddings }),
    }).then(() => {
      console.log(`📋 [Queue] Background enrichment queued for ${filename}`);
    }).catch((queueError: any) => {
      console.error(`❌ [Queue] Failed to queue enrichment for ${filename}:`, queueError.message);
    });
  });

  // ⚡ CACHE: Invalidate Redis cache after document upload
  await invalidateUserCache(userId);
  await cacheService.invalidateUserQueryCache(userId);
  console.log(`🗑️  [MODE CACHE] Invalidated query cache after document upload`);

  // ✅ RETURN IMMEDIATELY - Document is AVAILABLE!
  return updatedDocument;
};

/**
 * Process document in background without blocking the upload
 *
 * 🔥 FIX: Now routes through processDocumentAsync for unified granular progress
 * - Uses documentProgressService for 12+ progress stages (22-100%)
 * - Eliminates duplicate code path with coarse progress (0/5/8/20/40/80/100%)
 *
 * EXPORTED for background worker to reprocess pending documents
 */
export async function processDocumentInBackground(
  documentId: string,
  fileBuffer: Buffer,  // Note: Not used anymore - processDocumentAsync downloads from storage
  filename: string,
  mimeType: string,
  userId: string,
  thumbnailUrl: string | null
) {
  const PROCESSING_TIMEOUT = 180000; // 3 minutes max per document

  try {
    // 🔥 FIX: Get encryptedFilename from document record for processDocumentAsync
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { encryptedFilename: true }
    });

    if (!document?.encryptedFilename) {
      throw new Error(`Document ${documentId} not found or missing encryptedFilename`);
    }

    // Wrap entire processing in a timeout
    await Promise.race([
      // 🔥 FIX: Use processDocumentAsync instead of processDocumentWithTimeout
      // This routes through the unified progress service with granular stages
      processDocumentAsync(
        documentId,
        document.encryptedFilename,
        filename,
        mimeType,
        userId,
        thumbnailUrl,
        undefined  // sessionId - not available in this code path
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Processing timeout after ${PROCESSING_TIMEOUT / 1000} seconds`)), PROCESSING_TIMEOUT)
      )
    ]);

  } catch (error: any) {
    console.error('❌ Error processing document:', error);

    // ✅ FIXED BEHAVIOR: Mark as failed instead of deleting
    // Keep failed documents so users can:
    // 1. See what failed
    // 2. Retry processing
    // 3. Download original file
    // 4. Get error details
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'failed',
          error: error.message || 'Processing failed',
          updatedAt: new Date(),
        }
      });

      // 🔥 FIX: Emit error via documentProgressService for consistent UI updates
      await documentProgressService.emitError(
        error.message || 'Processing failed',
        { documentId, userId, filename }
      );

      console.log(`⚠️  Marked document as failed: ${filename}`);
      console.log(`   └── Reason: ${error.message || 'Unknown error'}`);

    } catch (updateError) {
      console.error('❌ CRITICAL: Failed to mark document as failed:', updateError);
    }

    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🗑️ REMOVED: processDocumentWithTimeout (~850 lines of deprecated code)
// Was using coarse-grained progress (0/5/8/20/40/80/100%)
// Replaced by processDocumentAsync which uses documentProgressService (22-100%)
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateDocumentAfterUploadInput {
  userId: string;
  encryptedFilename: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  folderId?: string;
  thumbnailData?: string; // Base64 encoded thumbnail
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: ~850 lines of deprecated processDocumentWithTimeout code was removed here
// The function used coarse progress (0/5/8/20/40/80/100%)
// Replaced by processDocumentAsync with documentProgressService (22-100%)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create document record after direct upload to GCS (via signed URL)
 */
export const createDocumentAfterUpload = async (input: CreateDocumentAfterUploadInput) => {
  const { userId, encryptedFilename, filename, mimeType, fileSize, fileHash, folderId, thumbnailData } = input;


  // ⚡ IDEMPOTENCY CHECK: Skip if identical file already uploaded to the SAME folder
  const existingDoc = await prisma.document.findFirst({
    where: {
      userId,
      fileHash,
      status: 'completed',
      // Allow same file in different folders
      folderId: folderId,
    },
  });

  if (existingDoc) {

    return await prisma.document.findUnique({
      where: { id: existingDoc.id },
      include: { folder: true },
    });
  }


  // Upload thumbnail if provided
  let thumbnailUrl: string | null = null;
  if (thumbnailData) {
    try {
      const thumbnailFilename = `${userId}/thumbnails/${crypto.randomUUID()}-${Date.now()}.jpg`;
      const thumbnailBuffer = Buffer.from(thumbnailData, 'base64');
      await uploadFile(thumbnailFilename, thumbnailBuffer, 'image/jpeg');
      thumbnailUrl = await getSignedUrl(thumbnailFilename);
    } catch (error) {
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FAST AVAILABILITY PIPELINE - Make document usable IMMEDIATELY
  // ═══════════════════════════════════════════════════════════════════════════════

  // Step 1: Create document with status 'uploaded'
  const document = await prisma.document.create({
    data: {
      userId,
      folderId: folderId || null,
      filename,
      encryptedFilename,
      fileSize,
      mimeType,
      fileHash,
      status: 'uploaded', // NOT 'processing' - file exists but not yet available for chat
    },
    include: {
      folder: true,
    },
  });

  // Step 2: Run FAST text extraction inline (< 1 second)
  // This makes the document usable in chat IMMEDIATELY
  const extractionStart = Date.now();
  let rawText: string | null = null;
  let previewText: string | null = null;

  try {
    console.log(`⚡ [FastExtraction] Starting for ${filename}...`);
    const extractionResult = await fastTextExtractor.extractFromS3(encryptedFilename, mimeType);

    if (extractionResult.success) {
      rawText = extractionResult.rawText;
      previewText = extractionResult.previewText;
      console.log(`⚡ [FastExtraction] Completed in ${extractionResult.extractionTimeMs}ms - ${rawText?.length || 0} chars`);
    } else {
      console.log(`⚡ [FastExtraction] No text extracted (${extractionResult.error || 'requires OCR'})`);
    }
  } catch (extractError: any) {
    console.error(`⚡ [FastExtraction] Error: ${extractError.message}`);
    // Don't fail - document still usable, just without text search
  }

  // Step 3: Update document to 'available' with rawText
  // Document is now USABLE IN CHAT even without embeddings!
  const updatedDocument = await prisma.document.update({
    where: { id: document.id },
    data: {
      status: 'available', // 🎉 Document is now usable in chat!
      rawText,
      previewText,
    },
    include: {
      folder: true,
    },
  });

  console.log(`✅ [FastAvailability] ${filename} is now AVAILABLE (${Date.now() - extractionStart}ms)`);

  // Step 4: Queue background enrichment AFTER returning response
  // Use setImmediate to ensure we return first, then queue
  setImmediate(() => {
    addDocumentJob({
      documentId: document.id,
      encryptedFilename,
      filename,
      mimeType,
      userId,
      thumbnailUrl,
      priority: 'normal',
    }).then(() => {
      console.log(`📋 [Queue] Background enrichment queued for ${filename}`);
    }).catch((queueError: any) => {
      console.error(`❌ [Queue] Failed to queue enrichment for ${filename}:`, queueError.message);
    });
  });

  // ✅ RETURN IMMEDIATELY - Document is AVAILABLE!
  return updatedDocument;
};

/**
 * Process document asynchronously after direct upload
 *
 * 🔥 FIX: Added sessionId parameter for batch upload tracking
 * 🔥 FIX: Using documentProgressService for 12 granular progress stages
 * 🔥 EXPORTED: For queue worker to call with granular progress
 */
export async function processDocumentAsync(
  documentId: string,
  encryptedFilename: string,
  filename: string,
  mimeType: string,
  userId: string,
  thumbnailUrl: string | null,
  sessionId?: string  // 🔥 NEW: Optional session ID for batch tracking
) {
  const io = require('../server').io;

  // 🔥 FIX: Progress options for documentProgressService
  const progressOptions = {
    documentId,
    userId,
    filename,
    sessionId
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    // 🛡️ INTEGRITY TRACKING: Track successful embedding storage
    // ═══════════════════════════════════════════════════════════════
    let embeddingsSuccessfullyStored = false;
    let storedChunksCount = 0;

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 1: EXTRACTION START (22%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('EXTRACTION_START', progressOptions);

    // Get document to check if it's encrypted
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Download file from storage
    await documentProgressService.emitCustomProgress(23, 'Downloading file from storage...', progressOptions);
    let fileBuffer = await downloadFile(encryptedFilename);

    // ════════════════════════════════════════════════════════════════════════
    // LAYER 0: FILE HEADER VALIDATION (early corrupt file detection)
    // ✅ FIX: Skip validation for encrypted files - validate AFTER decryption
    // Encrypted files start with [IV|AuthTag|...] so magic bytes won't match
    // ════════════════════════════════════════════════════════════════════════
    if (!document.isEncrypted) {
      const headerValidation = fileValidator.validateFileHeader(fileBuffer, mimeType, documentId);
      if (!headerValidation.isValid) {
        console.error(`[processDocumentAsync] Corrupt upload detected for docId=${documentId}: ${headerValidation.error}`);
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'failed',
            error: headerValidation.error || 'Corrupt upload detected',
          },
        });
        await documentProgressService.emitError(
          headerValidation.suggestion || headerValidation.error || 'File validation failed',
          progressOptions
        );
        return;
      }
    }

    // ⚡ ZERO-KNOWLEDGE ENCRYPTION CHECK
    // Zero-knowledge files have encryptionSalt (used for PBKDF2 key derivation from user's password)
    // Backend CANNOT decrypt these - must use pre-extracted text from DocumentMetadata
    const isZeroKnowledge = document.isEncrypted && document.encryptionSalt;

    if (isZeroKnowledge) {
      console.log(`[ZERO-KNOWLEDGE] Document ${documentId} is zero-knowledge encrypted - checking for pre-extracted text`);

      // Check if we have pre-extracted text from the upload step
      const existingMetadata = await prisma.documentMetadata.findUnique({
        where: { documentId }
      });

      if (existingMetadata?.extractedText && existingMetadata.extractedText.length > 50) {
        console.log(`[ZERO-KNOWLEDGE] Found pre-extracted text (${existingMetadata.extractedText.length} chars) - using for embeddings`);

        // Skip decryption and text extraction - use pre-extracted text directly
        // Jump to embedding generation with the pre-extracted text
        await documentProgressService.emitCustomProgress(50, 'Using pre-extracted text for zero-knowledge file...', progressOptions);

        const extractedText = existingMetadata.extractedText;
        const wordCount = extractedText.split(/\s+/).length;

        // Generate embeddings
        await documentProgressService.emitProgress('EMBEDDING_START', progressOptions);

        try {
          const vectorEmbeddingService = await import('./vectorEmbedding.service');
          const chunks = chunkTextWithOverlap(extractedText, {
            maxSize: 1000,
            overlap: 200,
            splitOn: ['\n\n', '\n', '. ', ', ', ' ']
          });

          if (chunks.length > 0) {
            const chunkObjects = chunks.map((c, idx) => ({
              chunkIndex: idx,
              content: c.content,
            }));

            await vectorEmbeddingService.default.storeDocumentEmbeddings(documentId, chunkObjects);

            // Update document status to completed
            await prisma.document.update({
              where: { id: documentId },
              data: {
                status: 'completed',
                error: null
              }
            });

            await documentProgressService.emitProgress('COMPLETE', progressOptions);
            console.log(`✅ [ZERO-KNOWLEDGE] Successfully processed ${filename} with ${chunks.length} chunks`);
            return;
          }
        } catch (embeddingError) {
          console.error(`[ZERO-KNOWLEDGE] Embedding generation failed:`, embeddingError);
          await prisma.document.update({
            where: { id: documentId },
            data: {
              status: 'failed',
              error: `Zero-knowledge embedding generation failed: ${(embeddingError as Error).message}`
            }
          });
          await documentProgressService.emitError(
            `Zero-knowledge embedding generation failed: ${(embeddingError as Error).message}`,
            progressOptions
          );
          return;
        }
      } else {
        // No pre-extracted text available - cannot process zero-knowledge file
        console.error(`[ZERO-KNOWLEDGE] No pre-extracted text found for document ${documentId} - cannot decrypt`);
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'failed',
            error: 'Zero-knowledge encrypted file: no pre-extracted text available. Please re-upload with text extraction enabled.'
          }
        });
        await documentProgressService.emitError(
          'Zero-knowledge encrypted file: no pre-extracted text available. Please re-upload with text extraction enabled.',
          progressOptions
        );
        return;
      }
    }

    // 🔓 DECRYPT FILE IF SERVER-SIDE ENCRYPTED (not zero-knowledge)
    if (document.isEncrypted && document.encryptionIV && document.encryptionAuthTag && !isZeroKnowledge) {
      await documentProgressService.emitCustomProgress(24, 'Decrypting file...', progressOptions);
      const encryptionService = await import('./encryption.service');

      // ✅ FIX: S3 file already contains [IV | AuthTag | EncryptedData]
      // No need to reconstruct - pass directly to decryptFile
      // The encryptFile() function stores IV+AuthTag prefix, so S3 has the complete encrypted buffer
      fileBuffer = encryptionService.default.decryptFile(fileBuffer, `document-${userId}`);

      console.log(`✅ [DECRYPT] Successfully decrypted server-side encrypted file: ${filename}`);

      // ✅ FIX: Validate decrypted file header to catch decryption issues
      const postDecryptValidation = fileValidator.validateFileHeader(fileBuffer, mimeType, documentId);
      if (!postDecryptValidation.isValid) {
        console.error(`[processDocumentAsync] Decrypted file validation failed for docId=${documentId}: ${postDecryptValidation.error}`);
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'failed',
            error: `Decryption produced invalid file: ${postDecryptValidation.error}`,
          },
        });
        await documentProgressService.emitError(
          `Decryption produced invalid file. The file may have been corrupted or double-encrypted.`,
          progressOptions
        );
        return;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 2: EXTRACTION PROGRESS (25%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('EXTRACTION_PROGRESS', progressOptions);

    // Extract text based on file type
    let extractedText = '';
    let ocrConfidence: number | null = null;
    let pageCount: number | null = null;
    let wordCount: number | null = null;
    let slidesData: any[] | null = null;
    let pptxMetadata: any | null = null;
    let pptxSlideChunks: any[] | null = null; // For Phase 4C: Slide-level chunks

    // Check if it's a PowerPoint file - use textExtraction service
    const isPPTX = mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (isPPTX) {
      try {
        // Save file buffer to temporary file
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `pptx-${crypto.randomUUID()}.pptx`);
        fs.writeFileSync(tempFilePath, fileBuffer);

        // Use textExtraction service for PowerPoint
        const pptxResult = await textExtractionService.extractTextFromPowerPoint(fileBuffer);

        if (pptxResult.text) {
          extractedText = pptxResult.text;
          pageCount = pptxResult.pageCount || null;
          pptxMetadata = {};
          slidesData = [];
          pptxSlideChunks = [];

          // ✅ FIX: PROACTIVE image extraction approach - Always extract images first
          (async () => {
            try {
              // Import prisma in async scope
              const prismaClient = (await import('../config/database')).default;


              // ✅ FIX: ALWAYS extract images first (proactive approach)
              const { PPTXImageExtractorService } = await import('./ingestion/pptxImageExtractor.service');
              const extractor = new PPTXImageExtractorService();

              const imageResult = await extractor.extractImages(
                tempFilePath,
                documentId,
                {
                  uploadToGCS: true,
                  signedUrlExpiration: 604800 // 7 days instead of 1 hour
                }
              );

              if (imageResult.success && imageResult.slides && imageResult.slides.length > 0) {

                // Fetch existing slidesData to preserve text content
                const existingMetadata = await prismaClient.documentMetadata.findUnique({
                  where: { documentId }
                });

                let existingSlidesData: any[] = [];
                try {
                  if (existingMetadata?.slidesData) {
                    existingSlidesData = typeof existingMetadata.slidesData === 'string'
                      ? JSON.parse(existingMetadata.slidesData)
                      : existingMetadata.slidesData as any[];
                  }
                } catch (e) {
                }

                // Merge extracted images with existing slide data
                const mergedSlidesData = existingSlidesData.map((existingSlide: any) => {
                  const slideNum = existingSlide.slideNumber || existingSlide.slide_number;
                  const extractedSlide = imageResult.slides!.find(s => s.slideNumber === slideNum);

                  // Use composite image if available, otherwise first image
                  const imageUrl = extractedSlide?.compositeImageUrl
                    || (extractedSlide?.images && extractedSlide.images.length > 0
                        ? extractedSlide.images[0].imageUrl
                        : null);

                  return {
                    slideNumber: slideNum,
                    content: existingSlide.content || '',
                    textCount: existingSlide.textCount || existingSlide.text_count || 0,
                    imageUrl: imageUrl || existingSlide.imageUrl // Preserve old imageUrl if extraction failed
                  };
                });

                // Update metadata with extracted images (use upsert in case metadata doesn't exist yet)
                await prismaClient.documentMetadata.upsert({
                  where: { documentId },
                  update: {
                    slidesData: JSON.stringify(mergedSlidesData),
                    slideGenerationStatus: 'completed'
                  },
                  create: {
                    documentId,
                    slidesData: JSON.stringify(mergedSlidesData),
                    slideGenerationStatus: 'completed'
                  }
                });

              } else {

                // Update status to show extraction failed (use upsert in case metadata doesn't exist yet)
                await prismaClient.documentMetadata.upsert({
                  where: { documentId },
                  update: {
                    slideGenerationStatus: 'failed',
                    slideGenerationError: imageResult.error || 'Image extraction failed'
                  },
                  create: {
                    documentId,
                    slideGenerationStatus: 'failed',
                    slideGenerationError: imageResult.error || 'Image extraction failed'
                  }
                });
              }

              // NOTE: LibreOffice/ImageMagick slide generation has been removed.
              // PPTXImageExtractor (above) handles all image extraction from PPTX files.

            } catch (error: any) {
              console.error(`❌ [Background] PPTX processing error for ${filename}:`, error);

              // Update status to failed (use upsert in case metadata doesn't exist yet)
              const prismaClient = (await import('../config/database')).default;
              await prismaClient.documentMetadata.upsert({
                where: { documentId },
                update: {
                  slideGenerationStatus: 'failed',
                  slideGenerationError: error.message
                },
                create: {
                  documentId,
                  slideGenerationStatus: 'failed',
                  slideGenerationError: error.message
                }
              }).catch(err => console.error('Failed to update error status:', err));
            } finally {
              // Clean up temp file
              try {
                fs.unlinkSync(tempFilePath);
              } catch (cleanupError: any) {
              }
            }
          })().catch(err => console.error('Background PPTX processing error:', err));
        } else {
          throw new Error('PPTX extraction failed');
        }
      } catch (pptxError: any) {
        console.error('❌ CRITICAL: Python PPTX extraction failed. This document will be marked as failed.');
        console.error('   └── Error:', pptxError.message);
        // Re-throw the error to be caught by the main try-catch block, which will set the document status to 'failed'
        throw new Error(`PowerPoint processing failed: ${pptxError.message}`);
      }
    }
    // Check if it's an image type that needs OCR via OpenAI Vision
    else if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
      extractedText = await geminiService.extractTextFromImageWithGemini(fileBuffer, mimeType);
      ocrConfidence = 0.95;
    } else {
      // Use standard text extraction service
      try {
        const result = await textExtractionService.extractText(fileBuffer, mimeType);
        extractedText = result.text;
        ocrConfidence = result.confidence || null;
        pageCount = result.pageCount || null;
        wordCount = result.wordCount || null;
      } catch (extractionError: any) {
        console.error(`❌ Failed to extract text from ${mimeType}:`, extractionError.message);
        throw new Error(`Failed to extract text from ${mimeType}: ${extractionError.message}`);
      }
    }


    // CONVERT TO MARKDOWN
    let markdownContent: string | null = null;
    try {
      const markdownResult = await markdownConversionService.convertToMarkdown(
        fileBuffer,
        mimeType,
        filename,
        documentId
      );
      markdownContent = markdownResult.markdownContent;
    } catch (error) {
    }

    // PRE-GENERATE PDF PREVIEW FOR DOCX FILES (so viewing is instant)
    const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (isDocx) {
      try {
        const { convertDocxToPdf } = await import('./ingestion/docx-converter.service');

        // ✅ FIX: Use the correct PDF path format
        // DOCX files are converted to PDF and stored as `${userId}/${documentId}-converted.pdf`
        const pdfKey = `${userId}/${documentId}-converted.pdf`;

        // ✅ FIX: Check if PDF already exists in S3
        const pdfExists = await fileExists(pdfKey);

        if (!pdfExists) {
          // Save DOCX to temp file
          const tempDocxPath = path.join(os.tmpdir(), `${documentId}.docx`);
          fs.writeFileSync(tempDocxPath, fileBuffer);

          // Convert to PDF
          const conversion = await convertDocxToPdf(tempDocxPath, os.tmpdir());

          if (conversion.success && conversion.pdfPath) {
            // ✅ FIX: Upload PDF to S3
            const pdfBuffer = fs.readFileSync(conversion.pdfPath);
            await uploadFile(pdfKey, pdfBuffer, 'application/pdf');


            // Clean up temp files
            fs.unlinkSync(tempDocxPath);
            fs.unlinkSync(conversion.pdfPath);
          } else {
          }
        } else {
        }
      } catch (error: any) {
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 3: EXTRACTION COMPLETE (30%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('EXTRACTION_COMPLETE', progressOptions);

    // 🛡️ GUARD: Fail if extraction produced too little text (prevents empty documents)
    const MIN_EXTRACTION_LENGTH = 10;
    if (!extractedText || extractedText.trim().length < MIN_EXTRACTION_LENGTH) {
      throw new Error(`Text extraction failed - extracted only ${extractedText?.length || 0} chars (minimum: ${MIN_EXTRACTION_LENGTH}). The document may be empty, corrupted, or in an unsupported format.`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 4: CLEANING START (32%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('CLEANING_START', progressOptions);

    // Text preprocessing/cleaning would happen here if needed
    // (currently extractedText is used as-is)

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 5: CLEANING COMPLETE (40%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('CLEANING_COMPLETE', progressOptions);

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 6-7: ANALYSIS (42-50%)
    // ⚡ PERF: Gemini analysis disabled by default - adds ~2-4s latency
    // Classification/entities are nice-to-have metadata, not required for RAG
    // Enable with ANALYZE_DOCUMENTS=true for enhanced metadata
    // ════════════════════════════════════════════════════════════════════════
    let classification = null;
    let entities = null;

    const shouldAnalyze = process.env.ANALYZE_DOCUMENTS === 'true';

    if (shouldAnalyze && extractedText && extractedText.length > 0) {
      await documentProgressService.emitProgress('ANALYSIS_START', progressOptions);
      try {
        const analysis = await geminiService.analyzeDocumentWithGemini(extractedText, mimeType);
        classification = analysis.suggestedCategories?.[0] || null;
        entities = JSON.stringify(analysis.keyEntities || {});
      } catch (error) {
        // Silently fail - analysis is optional
      }
      await documentProgressService.emitProgress('ANALYSIS_COMPLETE', progressOptions);
    } else {
      // Skip analysis for faster processing
      console.log(`⚡ [PERF] Skipping Gemini analysis (ANALYZE_DOCUMENTS=${shouldAnalyze})`);
    }

    // Note: Enhanced metadata enrichment removed - using docIntelligence analysis instead

    // Create or update metadata record (upsert handles retry cases)
    await prisma.documentMetadata.upsert({
      where: { documentId },
      create: {
        documentId,
        extractedText,
        ocrConfidence,
        classification,
        entities,
        summary: null,
        thumbnailUrl,
        pageCount,
        wordCount,
        markdownContent,
        slidesData: slidesData ? JSON.stringify(slidesData) : null,
        pptxMetadata: pptxMetadata ? JSON.stringify(pptxMetadata) : null,
      },
      update: {
        extractedText,
        ocrConfidence,
        classification,
        entities,
        summary: null,
        thumbnailUrl,
        pageCount,
        wordCount,
        markdownContent,
        slidesData: slidesData ? JSON.stringify(slidesData) : null,
        pptxMetadata: pptxMetadata ? JSON.stringify(pptxMetadata) : null,
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 8: CHUNKING START (52%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('CHUNKING_START', progressOptions);

    // Tags will be generated in background after document is complete

    // GENERATE VECTOR EMBEDDINGS FOR RAG WITH SEMANTIC CHUNKING
    // 🔥 FIX: Now BLOCKING to ensure embeddings complete before marking done
    if (extractedText && extractedText.length > 50) {

      // 🔥 FIX: Removed fire-and-forget - embeddings must complete before marking document done
      try {
          const vectorEmbeddingService = await import('./vectorEmbedding.service');
          const embeddingService = await import('./embedding.service');
          let chunks: Array<{ content: string; metadata: any; embedding?: number[] }> = [];
          let usedDocling = false;

          // ═══════════════════════════════════════════════════════════════
          // 🆕 DOCLING INTEGRATION: Try Docling extraction first for PDFs/Word
          // Benefits: Better structure preservation, semantic chunking, markdown output
          // Fallback: If Docling fails, continue with standard extraction
          // ═══════════════════════════════════════════════════════════════
          const doclingMimeTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
            'application/msword', // doc
          ];

          if (DOCLING_ENABLED && doclingMimeTypes.includes(mimeType)) {
            try {
              console.log(`🔬 [DOCLING] Attempting Docling extraction for ${filename}...`);
              const doclingStartTime = Date.now();

              const doclingResult = await extractWithDocling(
                fileBuffer,
                mimeType,
                filename,
                documentId,
                { indexChunks: false } // Don't use in-memory index, we'll use Pinecone
              );

              if (doclingResult.success && doclingResult.chunks && doclingResult.chunks.length > 0) {
                const doclingDuration = Date.now() - doclingStartTime;
                console.log(`✅ [DOCLING] Extraction succeeded: ${doclingResult.chunks.length} chunks in ${doclingDuration}ms`);

                // Convert Docling chunks to the expected format for embedding
                // Extended metadata for location-aware retrieval
                chunks = doclingResult.chunks.map((chunk, idx) => {
                  const page = chunk.meta?.page || null;
                  const headings = chunk.meta?.headings || [];
                  return {
                    content: `📄 File: ${filename} | ${chunk.text}`,
                    metadata: {
                      documentId: documentId,
                      filename: filename,
                      chunkIndex: idx,
                      chunkId: chunk.chunkId,
                      // Location-aware metadata
                      chunkOrder: idx,                    // Explicit ordering for neighbor expansion
                      page: page,                         // Single page (legacy)
                      pageStart: page,                    // Start page (for range queries)
                      pageEnd: page,                      // End page (for range queries)
                      headings: headings,                 // Raw headings array
                      headingPath: headings,              // Alias for heading path queries
                      source: 'docling',
                    }
                  };
                });

                usedDocling = true;

                // Emit progress for Docling path
                await documentProgressService.emitProgress('CHUNKING_COMPLETE', progressOptions);
                console.log(`✅ [DOCLING] Created ${chunks.length} chunks from Docling, starting embedding generation...`);

                // Generate embeddings for Docling chunks
                await documentProgressService.emitProgress('EMBEDDING_START', progressOptions);
                const doclingTexts = chunks.map(c => c.content);
                const doclingEmbeddingResult = await embeddingService.default.generateBatchEmbeddings(doclingTexts);

                // Update chunks with embeddings
                chunks = chunks.map((chunk, i) => ({
                  ...chunk,
                  embedding: doclingEmbeddingResult.embeddings[i]?.embedding || new Array(1536).fill(0)
                }));

                await documentProgressService.emitProgress('EMBEDDING_COMPLETE', progressOptions);
                console.log(`✅ [DOCLING] Generated embeddings for ${chunks.length} chunks`);
              } else {
                console.log(`⚠️ [DOCLING] Extraction returned no chunks, falling back to standard extraction`);
              }
            } catch (doclingError: any) {
              console.warn(`⚠️ [DOCLING] Extraction failed: ${doclingError.message}, falling back to standard extraction`);
            }
          }

          // Use enhanced Excel processor for Excel files to preserve cell coordinates
          if (!usedDocling && (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
              mimeType === 'application/vnd.ms-excel')) {
            const excelProcessor = await import('./ingestion/excelProcessor.service');
            const excelChunks = await excelProcessor.default.processExcel(fileBuffer);

            // Convert Excel chunks to embedding format with full document metadata
            // ⚡ CRITICAL: Prepend filename to content so AI sees it prominently
            chunks = excelChunks.map((chunk, idx) => ({
              content: `📄 File: ${filename} | ${chunk.content}`,
              metadata: {
                // ⚡ Document identification (CRITICAL for proper retrieval)
                documentId: documentId,
                filename: filename,

                // Location-aware metadata
                chunkOrder: idx,
                chunkIndex: chunk.metadata.chunkIndex,
                pageStart: null,  // Excel doesn't have pages
                pageEnd: null,
                headingPath: chunk.metadata.tableHeaders || [],

                // ⚡ Excel-specific metadata
                sheet: chunk.metadata.sheetName,
                sheetNumber: chunk.metadata.sheetNumber,
                row: chunk.metadata.rowNumber,
                cells: chunk.metadata.cells,
                sourceType: chunk.metadata.sourceType,
                tableHeaders: chunk.metadata.tableHeaders
              }
            }));

            // 🛡️ GUARD: Fail if no chunks were produced from Excel
            if (chunks.length === 0) {
              throw new Error(`Excel document produced 0 chunks - file may be empty or corrupted`);
            }

            // ════════════════════════════════════════════════════════════════════════
            // 🔥 FIX: CHUNKING_COMPLETE for Excel path (60%)
            // ════════════════════════════════════════════════════════════════════════
            await documentProgressService.emitProgress('CHUNKING_COMPLETE', progressOptions);
            console.log(`✅ [CHUNKING] Created ${chunks.length} Excel chunks, starting embedding generation...`);

            // ════════════════════════════════════════════════════════════════════════
            // 🔥 FIX: EMBEDDING_START for Excel path (62%)
            // ════════════════════════════════════════════════════════════════════════
            await documentProgressService.emitProgress('EMBEDDING_START', progressOptions);

            // 🆕 Generate embeddings for Excel chunks using embedding service
            const excelTexts = chunks.map(c => c.content);
            const excelEmbeddingResult = await embeddingService.default.generateBatchEmbeddings(excelTexts, {
              taskType: 'RETRIEVAL_DOCUMENT',
              title: filename
            });

            // Update chunks with embeddings
            chunks = chunks.map((chunk, i) => ({
              ...chunk,
              embedding: excelEmbeddingResult.embeddings[i]?.embedding || new Array(1536).fill(0)
            }));

            // ════════════════════════════════════════════════════════════════════════
            // 🔥 FIX: EMBEDDING_COMPLETE for Excel path (70%)
            // ════════════════════════════════════════════════════════════════════════
            await documentProgressService.emitProgress('EMBEDDING_COMPLETE', progressOptions);
          } else if (!usedDocling) {
            // 🆕 Phase 4C: For PowerPoint, use slide-level chunks with metadata
            const isPowerPoint = mimeType.includes('presentation');

            if (isPowerPoint && pptxSlideChunks && pptxSlideChunks.length > 0) {
              chunks = pptxSlideChunks.map(slideChunk => ({
                content: slideChunk.content,
                metadata: {
                  filename,
                  slideNumber: slideChunk.metadata.slideNumber,
                  totalSlides: slideChunk.metadata.totalSlides,
                  slideTitle: slideChunk.metadata.slideTitle,
                  hasNotes: slideChunk.metadata.hasNotes,
                  sourceType: 'powerpoint',
                  chunkType: 'slide'
                }
              }));
            } else {
              // ═══════════════════════════════════════════════════════════════
              // SEMANTIC CHUNKING with proper size and overlap (Background)
              // ═══════════════════════════════════════════════════════════════
              console.log('📝 [CHUNKING-BG] Using improved chunking with overlap...');

              // Use improved chunking with overlap for better retrieval
              const overlapChunks = chunkTextWithOverlap(extractedText, {
                maxSize: 1000,    // ~600 tokens (optimal for embeddings)
                overlap: 200,     // 20% overlap for context continuity
                splitOn: ['\n\n', '\n', '. ', '! ', '? '],  // Smart boundaries
              });

              // Background process - no access to docIntelligence, use basic chunking
              chunks = overlapChunks.map((chunk) => ({
                content: chunk.content,
                metadata: {
                  chunkIndex: chunk.index,
                  startChar: chunk.startChar,
                  endChar: chunk.endChar,
                }
              }));

              console.log(`✅ [CHUNKING-BG] Created ${chunks.length} chunks with overlap`);
            }

            // 🛡️ GUARD: Fail if no chunks were produced (prevents "completed" documents with no searchable content)
            if (chunks.length === 0) {
              throw new Error(`Document produced 0 chunks - text extraction likely failed. Extracted text length: ${extractedText?.length || 0}`);
            }

            // ════════════════════════════════════════════════════════════════════════
            // 🔥 FIX: CHUNKING_COMPLETE (60%) - emitted BEFORE embedding generation
            // ════════════════════════════════════════════════════════════════════════
            await documentProgressService.emitProgress('CHUNKING_COMPLETE', progressOptions);
            console.log(`✅ [CHUNKING] Created ${chunks.length} chunks, starting embedding generation...`);

            // ════════════════════════════════════════════════════════════════════════
            // 🔥 FIX: EMBEDDING_START (62%) - correct position before embedding generation
            // ════════════════════════════════════════════════════════════════════════
            await documentProgressService.emitProgress('EMBEDDING_START', progressOptions);

            // 🆕 Generate embeddings using embedding service
            const texts = chunks.map(c => c.content);
            const embeddingResult = await embeddingService.default.generateBatchEmbeddings(texts);

            // Update chunks with embeddings
            chunks = chunks.map((chunk, i) => ({
              ...chunk,
              embedding: embeddingResult.embeddings[i]?.embedding || new Array(1536).fill(0)
            }));

            // ════════════════════════════════════════════════════════════════════════
            // 🔥 FIX: EMBEDDING_COMPLETE (70%) - emitted AFTER embedding generation
            // ════════════════════════════════════════════════════════════════════════
            await documentProgressService.emitProgress('EMBEDDING_COMPLETE', progressOptions);
          }

          console.log(`💾 [Document] Preparing to store ${chunks.length} embeddings...`);

          // ════════════════════════════════════════════════════════════════════════
          // STAGE 11: VECTOR STORE START (72%)
          // ════════════════════════════════════════════════════════════════════════
          await documentProgressService.emitProgress('VECTOR_STORE_START', progressOptions);

          // Store embeddings in Pinecone + DocumentEmbedding table
          console.log(`🔄 [DIAGNOSTIC] About to call storeDocumentEmbeddings...`);
          await vectorEmbeddingService.default.storeDocumentEmbeddings(documentId, chunks);
          console.log(`✅ [DIAGNOSTIC] storeDocumentEmbeddings completed successfully!`);

          // ════════════════════════════════════════════════════════════════════════
          // STAGE 12: VECTOR STORE COMPLETE (80%)
          // ════════════════════════════════════════════════════════════════════════
          await documentProgressService.emitProgress('VECTOR_STORE_COMPLETE', progressOptions);

          // ════════════════════════════════════════════════════════════════════════
          // STAGE 13-14: VERIFICATION (96-99%)
          // ⚡ PERF: Disabled by default - adds ~3-5s latency for redundant check
          // vectorEmbedding.service.ts already handles atomic storage with rollback
          // Enable with VERIFY_EMBEDDINGS=true for debugging
          // ════════════════════════════════════════════════════════════════════════
          const shouldVerify = process.env.VERIFY_EMBEDDINGS === 'true';

          if (shouldVerify) {
            await documentProgressService.emitProgress('VERIFICATION_START', progressOptions);

            const pineconeService = await import('./pinecone.service');
            const verification = await pineconeService.default.verifyDocumentEmbeddings(documentId);

            if (!verification.success || verification.count < chunks.length * 0.95) {
              const expectedCount = chunks.length;
              const actualCount = verification.count;

              console.error(`❌ [VERIFICATION] Embedding storage verification failed!`);
              console.error(`   Expected: ${expectedCount} chunks`);
              console.error(`   Found: ${actualCount} embeddings`);

              throw new Error(
                `Embedding verification failed: expected ${expectedCount}, got ${actualCount}`
              );
            }

            console.log(`✅ [VERIFICATION] Confirmed ${verification.count}/${chunks.length} embeddings stored`);
            await documentProgressService.emitProgress('VERIFICATION_COMPLETE', progressOptions);
          } else {
            // Skip verification - trust the atomic storage in vectorEmbedding.service.ts
            console.log(`⚡ [PERF] Skipping verification (${chunks.length} chunks stored)`);
          }

          // Embedding info stored - document ready for AI chat
          console.log(`✅ [EMBEDDING] Document ${documentId} ready for AI chat`);

          // Emit success event via WebSocket
          if (io) {
            io.to(`user:${userId}`).emit('document-embeddings-ready', {
              documentId,
              filename,
              embeddingCount: chunks.length,
              message: 'AI chat ready!'
            });
          }

          // ═══════════════════════════════════════════════════════════════
          // 🛡️ INTEGRITY: Mark embeddings as successfully stored
          // ═══════════════════════════════════════════════════════════════
          embeddingsSuccessfullyStored = true;
          storedChunksCount = chunks.length;

        } catch (error: any) {
          // 🔥 FIX: Embedding failures now FAIL the document (not silent)
          console.error('❌ Vector embedding generation failed:', error);

          // Emit error via documentProgressService
          await documentProgressService.emitError(
            error.message || 'Embedding generation failed',
            progressOptions
          );

          // Re-throw to mark document as failed
          throw error;
        }
    } else {
      // ═══════════════════════════════════════════════════════════════
      // 🛡️ INTEGRITY: No text to embed = FAILURE (document unusable for RAG)
      // ═══════════════════════════════════════════════════════════════
      const errorMsg = `Document has insufficient text content for embeddings (length: ${extractedText?.length || 0} chars, minimum: 50)`;
      console.error(`❌ [INGESTION] ${errorMsg}`);

      // Emit error via progress service (emits document-processing-update with status='failed')
      await documentProgressService.emitError(errorMsg, progressOptions);

      throw new Error(errorMsg);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 15: DATABASE START (82%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('DATABASE_START', progressOptions);

    // Queue document for any additional processing if needed
    try {
      await addDocumentJob({
        documentId,
        userId,
        filename,
        mimeType,
      });
      console.log(`[Upload] Queued document ${documentId} for additional processing`);
    } catch (queueError) {
      console.error(`[Upload] Failed to queue document:`, queueError);
      // Don't fail if queuing fails
    }

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 16: DATABASE COMPLETE (90%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('DATABASE_COMPLETE', progressOptions);

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 17: INDEXING START (92%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('INDEXING_START', progressOptions);

    // Invalidate cache for this user after successful processing
    await cacheService.invalidateUserCache(userId);

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 18: INDEXING COMPLETE (95%)
    // ════════════════════════════════════════════════════════════════════════
    await documentProgressService.emitProgress('INDEXING_COMPLETE', progressOptions);

    // ═══════════════════════════════════════════════════════════════
    // 🛡️ INTEGRITY GUARD: Only mark completed if embeddings were stored
    // ═══════════════════════════════════════════════════════════════
    if (!embeddingsSuccessfullyStored || storedChunksCount === 0) {
      const errorMsg = `Cannot mark document as completed: embeddings not stored (stored=${embeddingsSuccessfullyStored}, chunks=${storedChunksCount})`;
      console.error(`❌ [INTEGRITY] ${errorMsg}`);

      // Emit error via progress service (emits document-processing-update with status='failed')
      await documentProgressService.emitError(errorMsg, progressOptions);

      throw new Error(errorMsg);
    }

    // 🔥 FIX: Update document status to completed ONLY after all verification passed
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'completed',
        chunksCount: storedChunksCount,
        embeddingsGenerated: true
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // STAGE 19: COMPLETE (100%)
    // 🔥 FIX: Only emit 100% AFTER everything is verified and stored
    // ════════════════════════════════════════════════════════════════════════
    // 🔥 FIX: COMPLETE stage emits document-processing-update with progress=100, status='completed'
    // No need for separate document-processing-complete event - frontend uses document-processing-update
    await documentProgressService.emitProgress('COMPLETE', progressOptions);

    // ✅ OPTIMIZATION: Start background tag generation AFTER document is completed
    // This saves 5-10 seconds by not blocking the upload response
    if (extractedText && extractedText.length > 20) {
      generateTagsInBackground(documentId, extractedText, filename, userId).catch(error => {
        console.error('❌ Background tag generation failed:', error);
      });
    }

    console.log(`✅ Document ${filename} processing complete!`);

  } catch (error: any) {
    console.error('❌ Error processing document:', error);

    // 🔥 FIX: Update status to failed with error message
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        error: error.message || 'Unknown error'
      },
    });

    // 🔥 FIX: Emit error via documentProgressService
    await documentProgressService.emitError(
      error.message || 'Processing failed',
      { documentId, userId, filename, sessionId }
    );

    // 🔥 FIX: Re-throw error so callers (like queue worker) can handle retries
    throw error;
  }
}

/**
 * Chunk text into smaller pieces for vector embedding
 * Enhanced to handle PowerPoint slides and images properly
 */
function chunkText(text: string, maxWords: number = 500): Array<{content: string, metadata: any}> {
  // ENHANCEMENT 1: Check if this is PowerPoint content (contains slide markers)
  const slideMarkerRegex = /===\s*Slide\s+(\d+)\s*===/gi;
  const hasSlideMarkers = slideMarkerRegex.test(text);

  if (hasSlideMarkers) {
    return chunkPowerPointText(text, maxWords);
  }

  // ENHANCEMENT 2: For short documents (< 100 words), create single chunk
  // This helps with OCR text from images that might not have proper sentence structure
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 100) {
    return [{
      content: text.trim(),
      metadata: {
        chunkIndex: 0,
        startChar: 0,
        endChar: text.length,
        wordCount
      }
    }];
  }

  // ORIGINAL LOGIC: Standard sentence-based chunking
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: Array<{content: string, metadata: any}> = [];
  let currentChunk = '';
  let currentWordCount = 0;
  let chunkIndex = 0;

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    const sentenceWordCount = words.length;

    if (currentWordCount + sentenceWordCount > maxWords && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          chunkIndex,
          startChar: text.indexOf(currentChunk),
          endChar: text.indexOf(currentChunk) + currentChunk.length
        }
      });
      chunkIndex++;
      currentChunk = '';
      currentWordCount = 0;
    }

    currentChunk += sentence + ' ';
    currentWordCount += sentenceWordCount;
  }

  // Add remaining text as last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: {
        chunkIndex,
        startChar: text.indexOf(currentChunk),
        endChar: text.indexOf(currentChunk) + currentChunk.length
      }
    });
  }

  return chunks;
}

/**
 * Chunk PowerPoint text by slides
 * Each slide becomes at least one chunk with slide metadata
 */
function chunkPowerPointText(text: string, maxWords: number = 500): Array<{content: string, metadata: any}> {
  const chunks: Array<{content: string, metadata: any}> = [];

  // Split by slide markers
  // 🔥 FIX: Use \s+ instead of \n to handle whitespace-normalized text from postProcessOCRText
  // postProcessOCRText replaces all whitespace (including newlines) with single spaces
  const slideRegex = /===\s*Slide\s+(\d+)\s*===\s+([\s\S]*?)(?=\s*===\s*Slide\s+\d+\s*===|$)/gi;
  let match;
  let chunkIndex = 0;

  while ((match = slideRegex.exec(text)) !== null) {
    const slideNumber = parseInt(match[1], 10);
    const slideContent = match[2].trim();

    if (slideContent.length === 0) {
      continue; // Skip empty slides
    }

    // Check if slide content needs to be further chunked
    const slideWordCount = slideContent.split(/\s+/).length;

    if (slideWordCount <= maxWords) {
      // Slide fits in one chunk
      chunks.push({
        content: slideContent,
        metadata: {
          chunkIndex,
          slide: slideNumber,
          slideNumber, // Both formats for compatibility
          startChar: match.index,
          endChar: match.index + match[0].length,
          wordCount: slideWordCount
        }
      });
      chunkIndex++;
    } else {
      // Slide is too large, split into multiple chunks but preserve slide number
      const sentences = slideContent.match(/[^.!?]+[.!?]+/g) || [slideContent];
      let currentChunk = '';
      let currentWordCount = 0;
      let subChunkIndex = 0;

      for (const sentence of sentences) {
        const words = sentence.trim().split(/\s+/);
        const sentenceWordCount = words.length;

        if (currentWordCount + sentenceWordCount > maxWords && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            metadata: {
              chunkIndex,
              slide: slideNumber,
              slideNumber,
              subChunk: subChunkIndex,
              startChar: match.index,
              endChar: match.index + currentChunk.length,
              wordCount: currentWordCount
            }
          });
          chunkIndex++;
          subChunkIndex++;
          currentChunk = '';
          currentWordCount = 0;
        }

        currentChunk += sentence + ' ';
        currentWordCount += sentenceWordCount;
      }

      // Add remaining content
      if (currentChunk.trim().length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            chunkIndex,
            slide: slideNumber,
            slideNumber,
            subChunk: subChunkIndex,
            startChar: match.index,
            endChar: match.index + currentChunk.length,
            wordCount: currentWordCount
          }
        });
        chunkIndex++;
      }
    }
  }

  // 🔥 FIX: Fallback if regex didn't match any slides (e.g., heavily normalized text)
  // Fall back to standard chunking if no slide markers were successfully parsed
  if (chunks.length === 0 && text.trim().length > 0) {
    console.warn('[chunkPowerPointText] Slide regex did not match - falling back to standard chunking');

    // Remove slide markers and chunk the plain text
    const plainText = text.replace(/===\s*Slide\s+\d+\s*===/gi, '').trim();

    if (plainText.length > 0) {
      const wordCount = plainText.split(/\s+/).length;

      if (wordCount <= maxWords) {
        // Entire text fits in one chunk
        chunks.push({
          content: plainText,
          metadata: {
            chunkIndex: 0,
            startChar: 0,
            endChar: plainText.length,
            wordCount,
            fallback: true
          }
        });
      } else {
        // Split into sentence-based chunks
        const sentences = plainText.match(/[^.!?]+[.!?]+/g) || [plainText];
        let currentChunk = '';
        let currentWordCount = 0;
        let chunkIdx = 0;

        for (const sentence of sentences) {
          const sentenceWords = sentence.trim().split(/\s+/).length;

          if (currentWordCount + sentenceWords > maxWords && currentChunk.length > 0) {
            chunks.push({
              content: currentChunk.trim(),
              metadata: {
                chunkIndex: chunkIdx++,
                wordCount: currentWordCount,
                fallback: true
              }
            });
            currentChunk = '';
            currentWordCount = 0;
          }

          currentChunk += sentence + ' ';
          currentWordCount += sentenceWords;
        }

        if (currentChunk.trim().length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            metadata: {
              chunkIndex: chunkIdx,
              wordCount: currentWordCount,
              fallback: true
            }
          });
        }
      }
    }
  }

  return chunks;
}

/**
 * Get document download URL
 */
export const getDocumentDownloadUrl = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized access to document');
  }

  // Generate signed URL (valid for 1 hour) with forced download
  const signedUrl = await getSignedUrl(
    document.encryptedFilename,
    3600,
    true, // Force download
    document.filename // Original filename
  );

  return {
    url: signedUrl,
    filename: document.filename,
    mimeType: document.mimeType,
  };
};

/**
 * Get signed URL for viewing document (no forced download)
 * Used by DocumentViewer for direct access without backend proxy
 * PHASE 2: Supports pre-converted PDFs for DOCX files
 */
export const getDocumentViewUrl = async (documentId: string, userId: string, req?: any) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized access to document');
  }

  // ⚡ FIX: For encrypted files, use stream endpoint instead of signed URLs
  // Signed URLs can't decrypt files client-side, so we need server-side decryption
  if (document.isEncrypted) {

    // Construct base URL from request headers (supports ngrok, localhost, etc.)
    let baseUrl = 'http://localhost:5000';
    if (req) {
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (host) {
        baseUrl = `${protocol}://${host}`;
      }
    }

    // Return the stream endpoint URL instead of a signed URL
    return {
      url: `${baseUrl}/api/documents/${documentId}/stream`,
      filename: document.filename,
      mimeType: document.mimeType,
      encrypted: true,
    };
  }

  // PHASE 2: Check if DOCX has pre-converted PDF
  const isDocx = document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  let fileToServe = document.encryptedFilename;
  let mimeTypeToServe = document.mimeType;

  if (isDocx && document.renderableContent) {
    try {
      const renderableData = JSON.parse(document.renderableContent);
      if (renderableData.type === 'docx-pdf-conversion' && renderableData.pdfPath) {
        fileToServe = renderableData.pdfPath;
        mimeTypeToServe = 'application/pdf';
      }
    } catch (error) {
    }
  }

  // Generate signed URL (valid for 1 hour) for viewing (no forced download)
  // This only works for non-encrypted files
  const signedUrl = await getSignedUrl(
    fileToServe,
    3600,
    false, // Allow inline viewing
    document.filename // Original filename
  );

  return {
    url: signedUrl,
    filename: document.filename,
    mimeType: mimeTypeToServe,
    encrypted: false,
  };
};

/**
 * Stream document file (downloads and decrypts server-side, returns buffer)
 */
export const streamDocument = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized access to document');
  }

  // ⚡ PERFORMANCE OPTIMIZATION: Check cache first
  const cachedBuffer = await cacheService.getCachedDocumentBuffer(documentId);
  if (cachedBuffer) {
    return {
      buffer: cachedBuffer,
      filename: document.filename,
      mimeType: document.mimeType,
    };
  }


  // ✅ FIX: Download file from S3
  const encryptedBuffer = await downloadFile(document.encryptedFilename);

  // Decrypt if encrypted
  let fileBuffer: Buffer;
  if (document.isEncrypted) {
    fileBuffer = encryptionService.decryptFile(
      encryptedBuffer,
      `document-${document.userId}`
    );
  } else {
    fileBuffer = encryptedBuffer;
  }

  // ⚡ PERFORMANCE OPTIMIZATION: Cache the decrypted buffer for next time
  await cacheService.cacheDocumentBuffer(documentId, fileBuffer);

  return {
    buffer: fileBuffer,
    filename: document.filename,
    mimeType: document.mimeType,
  };
};

/**
 * Stream converted PDF for DOCX preview
 * Downloads the converted PDF file from storage and returns it for streaming
 */
export const streamPreviewPdf = async (documentId: string, userId: string) => {

  // Verify document ownership
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    console.error(`❌ [streamPreviewPdf] Document not found: ${documentId}`);
    throw new Error('Document not found');
  }


  if (document.userId !== userId) {
    console.error(`❌ [streamPreviewPdf] Unauthorized access: document userId ${document.userId} !== request userId ${userId}`);
    throw new Error('Unauthorized access to document');
  }

  // ✅ FIX: Build the PDF key (same format as in getDocumentPreview)
  // DOCX files are converted to PDF and stored as `${userId}/${documentId}-converted.pdf`
  const pdfKey = `${userId}/${documentId}-converted.pdf`;

  // ✅ FIX: Check if the PDF version exists in S3 storage
  const pdfExistsInS3 = await fileExists(pdfKey);


  if (!pdfExistsInS3) {
    console.error(`❌ [streamPreviewPdf] PDF not found at ${pdfKey}. Document may need reprocessing.`);
    throw new Error(`PDF preview not available. This document may need to be reprocessed. Please try re-uploading this document.`);
  }

  // ✅ FIX: Download the converted PDF from S3 Storage
  const pdfBuffer = await downloadFile(pdfKey);

  // REASON: Validate PDF buffer
  // WHY: Ensure we have valid data before streaming
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('PDF preview file is empty or corrupted');
  }


  return {
    buffer: pdfBuffer,
    filename: document.filename,
  };
};

/**
 * Get a single document by ID
 */
export const getDocumentById = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      folder: true,
      metadata: true,
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (!document) {
    return null;
  }

  if (document.userId !== userId) {
    return null;
  }

  return document;
};

/**
 * List user documents
 */
export const listDocuments = async (
  userId: string,
  folderId?: string,
  page: number = 1,
  limit: number = 1000
) => {
  // ⚡ CACHE: Generate cache key
  const cacheKey = `documents_list:${userId}:${folderId || 'all'}:${page}:${limit}`;

  // ⚡ CACHE: Check cache first
  const cached = await cacheService.get<any>(cacheKey);
  if (cached) {
    return cached;
  }

  const skip = (page - 1) * limit;

  const where: any = {
    userId,
    status: { in: ALL_VISIBLE_STATUSES }  // ✅ FIX: Include all active documents (matches folder count logic)
  };
  if (folderId !== undefined) {
    where.folderId = folderId === 'root' ? null : folderId;
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        folder: true,
        tags: {
          include: {
            tag: true,
          },
        },
        // Only include minimal metadata fields for list view (not the huge content fields)
        metadata: {
          select: {
            documentId: true,
            pageCount: true,
            wordCount: true,
            ocrConfidence: true,
            // Exclude large fields: markdownContent, extractedText, slidesData, pptxMetadata, etc.
          }
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  // 🔍 DEBUG: Log document filenames to verify correct data
  if (documents.length > 0) {
  }

  // ✅ SAFETY CHECK: Ensure we're not accidentally returning encryptedFilename as filename
  // Map documents to explicitly set the correct fields
  const sanitizedDocuments = documents.map(doc => {
    // Check if filename looks like an encrypted filename (contains UUID pattern)
    const looksEncrypted = doc.filename.includes('/') ||
                          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/.test(doc.filename);

    if (looksEncrypted) {
    }

    return {
      ...doc,
      // Ensure we're using the original filename, NOT the encrypted one
      filename: doc.filename,
      encryptedFilename: doc.encryptedFilename,
    };
  });

  const result = {
    documents: sanitizedDocuments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };

  // ⚡ CACHE: Store result with 1 minute TTL
  await cacheService.set(cacheKey, result, { ttl: 60 });

  return result;
};

/**
 * Update document
 */
export const updateDocument = async (
  documentId: string,
  userId: string,
  updates: { folderId?: string | null; filename?: string }
) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // Build update data
  const updateData: any = {};

  if (updates.folderId !== undefined) {
    updateData.folderId = updates.folderId === null ? null : updates.folderId;
  }

  if (updates.filename !== undefined && updates.filename.trim()) {
    updateData.filename = updates.filename.trim();
  }

  // Update document
  const updatedDocument = await prisma.document.update({
    where: { id: documentId },
    data: updateData,
    include: {
      folder: true,
    },
  });

  return updatedDocument;
};

/**
 * Delete document
 * ✅ FIXED: Now properly deletes from all storage systems (GCS, PostgreSQL embeddings, Pinecone)
 */
export const deleteDocument = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // Store file size before deletion for storage tracking
  const fileSize = document.fileSize;
  const deletionErrors: string[] = [];

  // 1. Delete from GCS/S3
  try {
    await deleteFile(document.encryptedFilename);
    console.log(`✅ [DeleteDocument] Deleted file from storage: ${document.encryptedFilename}`);
  } catch (error: any) {
    const errorMsg = `Failed to delete file from storage: ${error.message}`;
    console.error(`❌ [DeleteDocument] ${errorMsg}`);
    deletionErrors.push(errorMsg);
    // Continue with deletion - don't block on storage failure
  }

  // 2. Delete embeddings from PostgreSQL vector store
  try {
    const vectorEmbeddingService = await import('./vectorEmbedding.service');
    await vectorEmbeddingService.default.deleteDocumentEmbeddings(documentId);
    console.log(`✅ [DeleteDocument] Deleted PostgreSQL embeddings for document: ${documentId}`);
  } catch (error: any) {
    const errorMsg = `Failed to delete PostgreSQL embeddings: ${error.message}`;
    console.error(`❌ [DeleteDocument] ${errorMsg}`);
    deletionErrors.push(errorMsg);
  }

  // 3. Delete embeddings from Pinecone (CRITICAL - prevents orphaned vectors)
  try {
    const pineconeService = await import('./pinecone.service');
    await pineconeService.default.deleteDocumentEmbeddings(documentId);
    console.log(`✅ [DeleteDocument] Deleted Pinecone embeddings for document: ${documentId}`);
  } catch (error: any) {
    const errorMsg = `Failed to delete Pinecone embeddings: ${error.message}`;
    console.error(`❌ [DeleteDocument] ${errorMsg}`);
    deletionErrors.push(errorMsg);
  }

  // 4. Delete from database (cascade will handle metadata and tags)
  await prisma.document.delete({
    where: { id: documentId },
  });



  // Invalidate caches
  await cacheService.invalidateUserCache(userId);

  // Invalidate document-specific response cache (AI chat responses)
  await cacheService.invalidateDocumentCache(documentId);

  // ⚡ MODE OPTIMIZATION: Invalidate query response cache (deleted documents = stale answers)
  await cacheService.invalidateUserQueryCache(userId);
  console.log(`🗑️  [MODE CACHE] Invalidated query cache after document deletion`);

  // Log any errors that occurred during cleanup (but deletion succeeded)
  if (deletionErrors.length > 0) {
    console.warn(`⚠️ [DeleteDocument] Document ${documentId} deleted with ${deletionErrors.length} cleanup errors:`, deletionErrors);
  }

  return { success: true, cleanupErrors: deletionErrors };
};

/**
 * Delete all documents for a user
 * ✅ FIXED: Now properly deletes from all storage systems (GCS, PostgreSQL embeddings, Pinecone)
 */
export const deleteAllDocuments = async (userId: string) => {
  try {
    console.log(`🗑️ [DeleteAllDocuments] Starting deletion for user: ${userId}`);

    // Get all documents for the user
    const documents = await prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        encryptedFilename: true,
        filename: true
      }
    });

    if (documents.length === 0) {
      return {
        totalDocuments: 0,
        deleted: 0,
        failed: 0,
        message: 'No documents found to delete'
      };
    }

    console.log(`📊 [DeleteAllDocuments] Found ${documents.length} documents to delete`);

    let successCount = 0;
    let failedCount = 0;
    const results: Array<{
      documentId: string;
      filename: string;
      status: string;
      error?: string;
      cleanupErrors?: string[];
    }> = [];

    // Delete each document
    for (const document of documents) {
      const cleanupErrors: string[] = [];

      try {
        // 1. Delete from GCS/S3
        try {
          await deleteFile(document.encryptedFilename);
          console.log(`  ✅ Deleted file: ${document.encryptedFilename}`);
        } catch (error: any) {
          const errorMsg = `GCS delete failed: ${error.message}`;
          console.error(`  ❌ ${errorMsg}`);
          cleanupErrors.push(errorMsg);
        }

        // 2. Delete embeddings from PostgreSQL vector store
        try {
          const vectorEmbeddingService = await import('./vectorEmbedding.service');
          await vectorEmbeddingService.default.deleteDocumentEmbeddings(document.id);
          console.log(`  ✅ Deleted PostgreSQL embeddings for: ${document.id}`);
        } catch (error: any) {
          const errorMsg = `PostgreSQL embeddings delete failed: ${error.message}`;
          console.error(`  ❌ ${errorMsg}`);
          cleanupErrors.push(errorMsg);
        }

        // 3. Delete embeddings from Pinecone (CRITICAL - prevents orphaned vectors)
        try {
          const pineconeService = await import('./pinecone.service');
          await pineconeService.default.deleteDocumentEmbeddings(document.id);
          console.log(`  ✅ Deleted Pinecone embeddings for: ${document.id}`);
        } catch (error: any) {
          const errorMsg = `Pinecone delete failed: ${error.message}`;
          console.error(`  ❌ ${errorMsg}`);
          cleanupErrors.push(errorMsg);
        }

        // 4. Delete from database (cascade will handle metadata, tags, etc.)
        await prisma.document.delete({
          where: { id: document.id }
        });

        // Invalidate document-specific response cache
        await cacheService.invalidateDocumentCache(document.id);

        results.push({
          documentId: document.id,
          filename: document.filename,
          status: 'success',
          cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined
        });

        successCount++;

      } catch (error: any) {
        console.error(`❌ Failed to delete ${document.filename}:`, error.message);

        results.push({
          documentId: document.id,
          filename: document.filename,
          status: 'failed',
          error: error.message,
          cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined
        });

        failedCount++;
      }
    }

    // Invalidate cache for this user
    await cacheService.invalidateUserCache(userId);

    console.log(`✅ [DeleteAllDocuments] Completed: ${successCount} deleted, ${failedCount} failed`);

    return {
      totalDocuments: documents.length,
      deleted: successCount,
      failed: failedCount,
      results
    };
  } catch (error) {
    console.error('❌ Error deleting all documents:', error);
    throw error;
  }
};

/**
 * Upload new version of a document
 */
export const uploadDocumentVersion = async (
  parentDocumentId: string,
  input: Omit<UploadDocumentInput, 'folderId'>
) => {
  const parentDocument = await prisma.document.findUnique({
    where: { id: parentDocumentId },
  });

  if (!parentDocument) {
    throw new Error('Parent document not found');
  }

  if (parentDocument.userId !== input.userId) {
    throw new Error('Unauthorized');
  }

  const { userId, filename, fileBuffer, mimeType, fileHash } = input;

  // Generate unique encrypted filename
  const encryptedFilename = `${userId}/${crypto.randomUUID()}-${Date.now()}`;

  // Upload to GCS
  await uploadFile(encryptedFilename, fileBuffer, mimeType);

  // Create new version
  const newVersion = await prisma.document.create({
    data: {
      userId,
      folderId: parentDocument.folderId,
      filename,
      encryptedFilename,
      fileSize: fileBuffer.length,
      mimeType,
      fileHash,
      status: 'processing',
      parentVersionId: parentDocumentId,
    },
  });

  return newVersion;
};

/**
 * Get document versions
 */
export const getDocumentVersions = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // Get all versions (current and previous)
  const versions = await prisma.document.findMany({
    where: {
      OR: [
        { id: documentId },
        { parentVersionId: documentId },
      ],
      status: { not: 'deleted' },  // ✅ FIX: Filter deleted documents
    },
    orderBy: { createdAt: 'desc' },
  });

  return versions;
};

/**
 * Get document processing status
 */
export const getDocumentStatus = async (documentId: string, userId: string) => {
  console.log(`[getDocumentStatus] Fetching document: ${documentId} for user: ${userId}`);

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      metadata: true,
    },
  });

  console.log(`[getDocumentStatus] Document found: ${!!document}, Document userId: ${document?.userId}`);

  if (!document) {
    console.log(`[getDocumentStatus] ERROR: Document ${documentId} not found in database`);
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    console.log(`[getDocumentStatus] ERROR: userId mismatch - doc.userId: ${document.userId}, req.userId: ${userId}`);
    throw new Error('Unauthorized');
  }

  return {
    ...document,
    metadata: document.metadata || null,
  };
};

/**
 * Get document thumbnail
 */
export const getDocumentThumbnail = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // Thumbnails disabled - always return null
  return { thumbnailUrl: null };
};

/**
 * Get document preview URL (converts DOCX to PDF if needed)
 * Supports all file formats: PDF, DOCX, PPTX, XLSX, images, text files, etc.
 */
export const getDocumentPreview = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      metadata: true,
    },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized');
  }

  // REASON: Verify file exists in storage before proceeding
  // WHY: Prevents generating URLs for non-existent files after migration
  const fileExistsInStorage = await fileExists(document.encryptedFilename);
  if (!fileExistsInStorage) {
    throw new Error(`Document file not found in storage: ${document.encryptedFilename}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCX FILES: Convert to PDF for universal preview (LibreOffice for excellent fidelity)
  // ═══════════════════════════════════════════════════════════════════════════
  const isDocx = document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (isDocx) {
    // REASON: Use the correct path for the converted PDF
    // WHY: During upload, DOCX is converted to PDF and saved as `${userId}/${documentId}-converted.pdf`
    const pdfKey = `${userId}/${documentId}-converted.pdf`;

    const pdfExists = await fileExists(pdfKey);

    if (!pdfExists) {
      // ✅ FIX: Download DOCX from S3 Storage
      let docxBuffer = await downloadFile(document.encryptedFilename);

      // ✅ Validate that the downloaded buffer is not empty
      if (!docxBuffer || docxBuffer.length === 0) {
        throw new Error(`Downloaded DOCX file is empty: ${document.encryptedFilename}`);
      }

      // 🔓 DECRYPT FILE if encrypted
      if (document.isEncrypted && document.encryptionIV && document.encryptionAuthTag) {
        const encryptionService = await import('./encryption.service');
        const ivBuffer = Buffer.from(document.encryptionIV, 'base64');
        const authTagBuffer = Buffer.from(document.encryptionAuthTag, 'base64');
        const encryptedBuffer = Buffer.concat([ivBuffer, authTagBuffer, docxBuffer]);
        docxBuffer = encryptionService.default.decryptFile(encryptedBuffer, `document-${userId}`);
      }

      // ✅ Validate DOCX file format (check ZIP signature)
      if (docxBuffer[0] !== 0x50 || docxBuffer[1] !== 0x4B) {
        throw new Error(`Invalid DOCX file format - not a valid ZIP archive: ${document.encryptedFilename}`);
      }

      // Try LibreOffice first for excellent fidelity
      const libreOfficeConverter = await import('./ingestion/libreOfficeConverter.service');
      const libreOffice = await libreOfficeConverter.checkLibreOfficeAvailable();

      if (libreOffice.available) {
        console.log('📄 [getDocumentPreview] Converting DOCX with LibreOffice for excellent fidelity...');
        const conversion = await libreOfficeConverter.convertToPdf(docxBuffer, document.filename);

        if (conversion.success && conversion.pdfBuffer) {
          await uploadFile(pdfKey, conversion.pdfBuffer, 'application/pdf');
          console.log(`✅ [getDocumentPreview] DOCX PDF uploaded: ${pdfKey}`);
        } else {
          throw new Error('LibreOffice DOCX conversion failed: ' + conversion.error);
        }
      } else {
        // Fallback to Mammoth+Puppeteer (good but not excellent fidelity)
        console.log('⚠️ [getDocumentPreview] LibreOffice not available, using Mammoth fallback...');
        const { convertDocxToPdf } = await import('./ingestion/docx-converter.service');

        const tempDocxPath = path.join(os.tmpdir(), `${documentId}.docx`);
        fs.writeFileSync(tempDocxPath, docxBuffer);

        const conversion = await convertDocxToPdf(tempDocxPath, os.tmpdir());

        if (conversion.success && conversion.pdfPath) {
          const pdfBuffer = fs.readFileSync(conversion.pdfPath);
          await uploadFile(pdfKey, pdfBuffer, 'application/pdf');
          fs.unlinkSync(tempDocxPath);
          fs.unlinkSync(conversion.pdfPath);
        } else {
          fs.unlinkSync(tempDocxPath);
          throw new Error('Failed to convert DOCX to PDF: ' + conversion.error);
        }
      }
    }

    // Return backend preview endpoint URL
    return {
      previewType: 'pdf',
      previewUrl: `/api/documents/${documentId}/preview-pdf`,
      originalType: document.mimeType,
      filename: document.filename,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POWERPOINT FILES: Convert to PDF for excellent fidelity preview (LibreOffice)
  // ═══════════════════════════════════════════════════════════════════════════
  const isPptx = document.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                 document.mimeType?.includes('presentation') ||
                 document.mimeType?.includes('powerpoint');

  if (isPptx) {
    // Check if we already have a PDF conversion
    const pdfKey = `${userId}/${documentId}-converted.pdf`;
    const pdfExists = await fileExists(pdfKey);

    if (pdfExists) {
      // Use existing PDF conversion - excellent fidelity
      return {
        previewType: 'pptx-pdf',
        previewUrl: `/api/documents/${documentId}/preview-pdf`,
        originalType: document.mimeType,
        filename: document.filename,
      };
    }

    // Try to convert PPTX to PDF using LibreOffice
    try {
      const libreOfficeConverter = await import('./ingestion/libreOfficeConverter.service');
      const libreOffice = await libreOfficeConverter.checkLibreOfficeAvailable();

      if (libreOffice.available) {
        console.log('📊 [getDocumentPreview] Converting PPTX with LibreOffice for excellent fidelity...');

        // Download and decrypt the file
        const fileBuffer = await downloadFile(document.encryptedFilename);

        let pptxBuffer = fileBuffer;
        if (document.isEncrypted && document.encryptionIV && document.encryptionAuthTag) {
          const encryptionService = await import('./encryption.service');
          const ivBuffer = Buffer.from(document.encryptionIV, 'base64');
          const authTagBuffer = Buffer.from(document.encryptionAuthTag, 'base64');
          const encryptedBuffer = Buffer.concat([ivBuffer, authTagBuffer, fileBuffer]);
          pptxBuffer = encryptionService.default.decryptFile(encryptedBuffer, `document-${userId}`);
        }

        // Convert to PDF using unified converter
        const conversion = await libreOfficeConverter.convertToPdf(pptxBuffer, document.filename);

        if (conversion.success && conversion.pdfBuffer) {
          await uploadFile(pdfKey, conversion.pdfBuffer, 'application/pdf');
          console.log(`✅ [getDocumentPreview] PPTX PDF uploaded: ${pdfKey}`);

          return {
            previewType: 'pptx-pdf',
            previewUrl: `/api/documents/${documentId}/preview-pdf`,
            originalType: document.mimeType,
            filename: document.filename,
          };
        }
      }
    } catch (conversionError: any) {
      console.warn('⚠️ [getDocumentPreview] PPTX PDF conversion failed:', conversionError.message);
      // Fall through to slide data approach
    }

    // Fall back to slide data approach (limited fidelity)
    const slidesData = document.metadata?.slidesData;
    const pptxMetadata = document.metadata?.pptxMetadata;
    const slideGenerationStatus = document.metadata?.slideGenerationStatus;
    const slideGenerationError = document.metadata?.slideGenerationError;

    return {
      previewType: 'pptx',
      slidesData: slidesData ? (typeof slidesData === 'string' ? JSON.parse(slidesData) : slidesData) : [],
      pptxMetadata: pptxMetadata ? (typeof pptxMetadata === 'string' ? JSON.parse(pptxMetadata) : pptxMetadata) : {},
      slideGenerationStatus: slideGenerationStatus || null,
      slideGenerationError: slideGenerationError || null,
      originalType: document.mimeType,
      filename: document.filename,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PDF FILES: Generate signed URL with 1-hour expiration
  // ═══════════════════════════════════════════════════════════════════════════
  if (document.mimeType === 'application/pdf') {
    // ✅ FIX: Generate signed URL with 1-hour expiration
    // S3 storage requires signed URLs for private files
    // This creates a temporary, secure link that expires automatically
    const url = await getSignedUrl(document.encryptedFilename, 3600);

    return {
      previewType: 'pdf',
      previewUrl: url,
      originalType: document.mimeType,
      filename: document.filename,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAGE FILES: Generate signed URL for direct display
  // ═══════════════════════════════════════════════════════════════════════════
  const imageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff'
  ];

  if (imageTypes.includes(document.mimeType)) {
    // REASON: Generate signed URL with 1-hour expiration for images
    // WHY: Images can be displayed directly in browser with img tag
    const url = await getSignedUrl(document.encryptedFilename, 3600);

    return {
      previewType: 'image',
      previewUrl: url,
      originalType: document.mimeType,
      filename: document.filename,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXCEL FILES: Convert to PDF for excellent fidelity preview (LibreOffice)
  // ═══════════════════════════════════════════════════════════════════════════
  const excelTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
  ];

  if (excelTypes.includes(document.mimeType)) {
    // Check if we already have a PDF conversion
    const pdfKey = `${userId}/${documentId}-converted.pdf`;
    const pdfExists = await fileExists(pdfKey);

    if (pdfExists) {
      // Use existing PDF conversion - excellent fidelity
      return {
        previewType: 'excel-pdf',
        previewUrl: `/api/documents/${documentId}/preview-pdf`,
        originalType: document.mimeType,
        filename: document.filename,
      };
    }

    try {
      // Download and decrypt the file
      const fileBuffer = await downloadFile(document.encryptedFilename);

      let excelBuffer = fileBuffer;
      if (document.isEncrypted && document.encryptionIV && document.encryptionAuthTag) {
        const encryptionService = await import('./encryption.service');
        const ivBuffer = Buffer.from(document.encryptionIV, 'base64');
        const authTagBuffer = Buffer.from(document.encryptionAuthTag, 'base64');
        const encryptedBuffer = Buffer.concat([ivBuffer, authTagBuffer, fileBuffer]);
        excelBuffer = encryptionService.default.decryptFile(encryptedBuffer, `document-${userId}`);
      }

      // Try LibreOffice first for excellent fidelity
      const libreOfficeConverter = await import('./ingestion/libreOfficeConverter.service');
      const libreOffice = await libreOfficeConverter.checkLibreOfficeAvailable();

      if (libreOffice.available) {
        console.log('📊 [getDocumentPreview] Converting Excel with LibreOffice for excellent fidelity...');
        const conversion = await libreOfficeConverter.convertToPdf(excelBuffer, document.filename);

        if (conversion.success && conversion.pdfBuffer) {
          await uploadFile(pdfKey, conversion.pdfBuffer, 'application/pdf');
          console.log(`✅ [getDocumentPreview] Excel PDF uploaded: ${pdfKey}`);

          return {
            previewType: 'excel-pdf',
            previewUrl: `/api/documents/${documentId}/preview-pdf`,
            originalType: document.mimeType,
            filename: document.filename,
          };
        }
      }

      // Fallback to HTML tables if LibreOffice not available
      console.log('⚠️ [getDocumentPreview] LibreOffice not available, using HTML table fallback...');
      const { generateExcelHtmlPreview } = await import('./ingestion/excelHtmlPreview.service');
      const preview = await generateExcelHtmlPreview(excelBuffer);
      const url = await getSignedUrl(document.encryptedFilename, 3600);

      return {
        previewType: 'excel',
        htmlContent: preview.htmlContent,
        sheetCount: preview.sheetCount,
        sheets: preview.sheets,
        downloadUrl: url,
        originalType: document.mimeType,
        filename: document.filename,
      };
    } catch (error: any) {
      console.error('❌ [getDocumentPreview] Excel preview generation failed:', error.message);
      const url = await getSignedUrl(document.encryptedFilename, 3600);
      return {
        previewType: 'excel',
        htmlContent: null,
        sheetCount: 0,
        sheets: [],
        downloadUrl: url,
        originalType: document.mimeType,
        filename: document.filename,
        error: 'Failed to generate preview: ' + error.message,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CSV FILES: Generate signed URL for download
  // ═══════════════════════════════════════════════════════════════════════════
  if (document.mimeType === 'text/csv') {
    const url = await getSignedUrl(document.encryptedFilename, 3600);
    return {
      previewType: 'csv',
      previewUrl: url,
      originalType: document.mimeType,
      filename: document.filename,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT FILES: Generate signed URL for direct display
  // ═══════════════════════════════════════════════════════════════════════════
  const textTypes = [
    'text/plain',
    'text/markdown',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/xml',
    'text/xml'
  ];

  if (textTypes.includes(document.mimeType)) {
    // REASON: Generate signed URL with 1-hour expiration
    // WHY: Text files can be displayed directly in browser
    const url = await getSignedUrl(document.encryptedFilename, 3600);

    return {
      previewType: 'text',
      previewUrl: url,
      originalType: document.mimeType,
      filename: document.filename,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO FILES: Generate signed URL for video player
  // ═══════════════════════════════════════════════════════════════════════════
  const videoTypes = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime', // .mov
    'video/x-msvideo', // .avi
    'video/x-matroska' // .mkv
  ];

  if (videoTypes.includes(document.mimeType)) {
    // REASON: Generate signed URL with 2-hour expiration (longer for videos)
    // WHY: Videos can be played directly in browser video player
    const url = await getSignedUrl(document.encryptedFilename, 7200); // 2 hours

    return {
      previewType: 'video',
      previewUrl: url,
      originalType: document.mimeType,
      filename: document.filename,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO FILES: Generate signed URL for audio player
  // ═══════════════════════════════════════════════════════════════════════════
  const audioTypes = [
    'audio/mpeg', // .mp3
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/flac',
    'audio/x-m4a'
  ];

  if (audioTypes.includes(document.mimeType)) {
    // REASON: Generate signed URL with 2-hour expiration (longer for audio)
    // WHY: Audio files can be played directly in browser audio player
    const url = await getSignedUrl(document.encryptedFilename, 7200); // 2 hours

    return {
      previewType: 'audio',
      previewUrl: url,
      originalType: document.mimeType,
      filename: document.filename,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OTHER FILES: Generate signed URL for download
  // ═══════════════════════════════════════════════════════════════════════════
  // REASON: For unknown file types, provide signed URL for secure download
  // WHY: Ensures all files can be accessed even if no specific preview is available

  const url = await getSignedUrl(document.encryptedFilename, 3600);

  return {
    previewType: 'download',
    previewUrl: url,
    originalType: document.mimeType,
    filename: document.filename,
  };
};

/**
 * Reindex all documents for a user - regenerate embeddings for all documents
 */
export const reindexAllDocuments = async (userId: string) => {
  try {

    // Get all completed documents for the user
    const documents = await prisma.document.findMany({
      where: {
        userId,
        status: 'completed'  // Already filtering by status='completed', no deleted documents
      },
      include: {
        metadata: true
      }
    });

    if (documents.length === 0) {
      return {
        totalDocuments: 0,
        reindexed: 0,
        failed: 0,
        message: 'No documents found to reindex'
      };
    }


    let successCount = 0;
    let failedCount = 0;
    const results = [];

    // Process each document
    for (const document of documents) {
      try {

        // Call the existing reprocessDocument function
        const result = await reprocessDocument(document.id, userId);

        results.push({
          ...result,
          status: 'success'
        });

        successCount++;
      } catch (error: any) {
        console.error(`❌ Failed to reprocess ${document.filename}:`, error.message);

        results.push({
          documentId: document.id,
          filename: document.filename,
          status: 'failed',
          error: error.message
        });

        failedCount++;
      }

      // Add small delay between documents to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }


    return {
      totalDocuments: documents.length,
      reindexed: successCount,
      failed: failedCount,
      results
    };
  } catch (error) {
    console.error('❌ Error reindexing all documents:', error);
    throw error;
  }
};

/**
 * Reprocess document - regenerate vector embeddings
 */
export const reprocessDocument = async (documentId: string, userId: string) => {
  try {

    // 1. Get document and verify ownership
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { metadata: true }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // 2. Check if it's a PowerPoint file and needs slide extraction
    const isPPTX = document.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const hasSlides = document.metadata?.slidesData && JSON.parse(document.metadata.slidesData as string).length > 0;

    // For PPTX files, reprocess slides if they're missing
    if (isPPTX && !hasSlides) {

      // Download file from GCS
      const fileBuffer = await downloadFile(document.encryptedFilename);

      // Save file buffer to temporary file
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `pptx-${crypto.randomUUID()}.pptx`);
      fs.writeFileSync(tempFilePath, fileBuffer);

      try {
        // Use textExtraction service for PowerPoint
        const pptxResult = await textExtractionService.extractTextFromPowerPoint(fileBuffer);

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        if (pptxResult.text) {
          const extractedText = pptxResult.text;
          const slidesData: any[] = [];
          const pptxMetadata = {};
          const pageCount = pptxResult.pageCount || null;


          // Update metadata with slides data
          if (document.metadata) {
            await prisma.documentMetadata.update({
              where: { id: document.metadata.id },
              data: {
                extractedText,
                slidesData: JSON.stringify(slidesData),
                pptxMetadata: JSON.stringify(pptxMetadata),
                pageCount
              }
            });
          } else {
            await prisma.documentMetadata.create({
              data: {
                documentId,
                extractedText,
                slidesData: JSON.stringify(slidesData),
                pptxMetadata: JSON.stringify(pptxMetadata),
                pageCount
              }
            });
          }

          // Delete old embeddings
          const vectorEmbeddingService = await import('./vectorEmbedding.service');
          await vectorEmbeddingService.default.deleteDocumentEmbeddings(documentId);

          // Generate new embeddings
          if (extractedText && extractedText.length > 50) {
            const chunks = chunkText(extractedText, 500);

            // Generate embeddings for each chunk (prepend filename for better retrieval)
            const embeddingService = (await import('./embedding.service')).default;
            const filenamePrefix = `📄 File: ${document.filename} | `;
            const chunksWithEmbeddings = [];
            for (const chunk of chunks) {
              // Prepend filename to content for embedding (improves semantic search)
              const contentWithContext = filenamePrefix + chunk.content;
              const embeddingResult = await embeddingService.generateEmbedding(contentWithContext);
              chunksWithEmbeddings.push({
                ...chunk,
                content: contentWithContext, // Store with filename prefix
                embedding: embeddingResult.embedding,
              });
            }

            await vectorEmbeddingService.default.storeDocumentEmbeddings(documentId, chunksWithEmbeddings);
          }

          return {
            documentId,
            filename: document.filename,
            chunksGenerated: extractedText.length > 50 ? chunkText(extractedText, 500).length : 0,
            textLength: extractedText.length,
            slidesExtracted: slidesData.length,
            status: 'completed'
          };
        } else {
          throw new Error('PPTX extraction failed');
        }
      } catch (pptxError: any) {
        console.error('❌ PPTX extraction failed:', pptxError.message);
        // Clean up temp file if it exists
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        throw new Error(`Failed to extract PowerPoint slides: ${pptxError.message}`);
      }
    }

    // 3. Get or re-extract text for non-PPTX or when slides already exist
    let extractedText = document.metadata?.extractedText;
    let fileBuffer: Buffer | null = null;

    if (!extractedText || extractedText.length === 0) {

      // Download file from GCS
      fileBuffer = await downloadFile(document.encryptedFilename);

      // Extract text
      const result = await textExtractionService.extractText(fileBuffer, document.mimeType);
      extractedText = result.text;

      // Update metadata with extracted text
      if (document.metadata) {
        await prisma.documentMetadata.update({
          where: { id: document.metadata.id },
          data: {
            extractedText,
            wordCount: result.wordCount || null,
            pageCount: result.pageCount || null
          }
        });
      } else {
        await prisma.documentMetadata.create({
          data: {
            documentId,
            extractedText,
            wordCount: result.wordCount || null,
            pageCount: result.pageCount || null
          }
        });
      }

    } else {
    }

    // 3.5. Regenerate markdown content if missing or requested
    const needsMarkdown = !document.metadata?.markdownContent;
    if (needsMarkdown) {

      try {
        // Download file if not already downloaded
        if (!fileBuffer) {
          fileBuffer = await downloadFile(document.encryptedFilename);
        }

        // Convert to markdown
        const markdownResult = await markdownConversionService.convertToMarkdown(
          fileBuffer,
          document.mimeType,
          document.filename,
          documentId
        );

        // Update metadata with markdown content
        if (document.metadata) {
          await prisma.documentMetadata.update({
            where: { id: document.metadata.id },
            data: {
              markdownContent: markdownResult.markdownContent
            }
          });
        } else {
          await prisma.documentMetadata.create({
            data: {
              documentId,
              markdownContent: markdownResult.markdownContent
            }
          });
        }

      } catch (markdownError: any) {
      }
    } else {
    }

    // 4. Delete old embeddings
    const vectorEmbeddingService = await import('./vectorEmbedding.service');
    await vectorEmbeddingService.default.deleteDocumentEmbeddings(documentId);

    // 5. Generate new embeddings
    if (extractedText && extractedText.length > 50) {
      const chunks = chunkText(extractedText, 500);

      // Generate embeddings for each chunk (prepend filename for better retrieval)
      const embeddingService = (await import('./embedding.service')).default;
      const filenamePrefix = `📄 File: ${document.filename} | `;
      const chunksWithEmbeddings = [];
      for (const chunk of chunks) {
        // Prepend filename to content for embedding (improves semantic search)
        const contentWithContext = filenamePrefix + chunk.content;
        const embeddingResult = await embeddingService.generateEmbedding(contentWithContext);
        chunksWithEmbeddings.push({
          ...chunk,
          content: contentWithContext, // Store with filename prefix
          embedding: embeddingResult.embedding,
        });
      }

      await vectorEmbeddingService.default.storeDocumentEmbeddings(documentId, chunksWithEmbeddings);

      return {
        documentId,
        filename: document.filename,
        chunksGenerated: chunks.length,
        textLength: extractedText.length,
        status: 'completed'
      };
    } else {
      return {
        documentId,
        filename: document.filename,
        chunksGenerated: 0,
        textLength: extractedText?.length || 0,
        status: 'completed',
        warning: 'Text too short for embeddings'
      };
    }
  } catch (error) {
    console.error('❌ Error reprocessing document:', error);
    throw error;
  }
};

/**
 * Retry failed document processing
 * Restarts async processing for a failed or stuck document
 */
export const retryDocument = async (documentId: string, userId: string) => {
  try {

    // 1. Get document and verify ownership
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { metadata: true }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // 2. Update status to 'processing'
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });


    // 3. Re-trigger async processing with PROPER error handling
    processDocumentAsync(
      document.id,
      document.encryptedFilename,
      document.filename,
      document.mimeType,
      userId,
      document.metadata?.thumbnailUrl || null
    ).catch(async (error) => {
      console.error('❌ Error in retry processing:', error);

      // 🔥 FIX: Update document status to 'failed' on error
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'failed',
          error: error.message || 'Processing failed during retry'
        },
      });

      // 🔥 FIX: Use documentProgressService for consistent error events
      await documentProgressService.emitError(
        error.message || 'Processing failed',
        { documentId: document.id, userId, filename: document.filename }
      );
    });


    return {
      id: document.id,
      filename: document.filename,
      status: 'processing'
    };
  } catch (error) {
    console.error('❌ Error retrying document:', error);
    throw error;
  }
};

/**
 * Regenerate PPTX slides with improved ImageMagick rendering
 */
export const regeneratePPTXSlides = async (documentId: string, userId: string) => {
  try {

    // 1. Get document and verify ownership
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { metadata: true }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // 2. Verify it's a PowerPoint file
    const isPPTX = document.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (!isPPTX) {
      throw new Error('Document is not a PowerPoint presentation');
    }


    // Set status to processing
    await prisma.documentMetadata.update({
      where: { documentId: document.id },
      data: {
        slideGenerationStatus: 'processing',
        slideGenerationError: null
      }
    });

    // 3. Download file from GCS
    const fileBuffer = await downloadFile(document.encryptedFilename);

    // 4. Save file buffer to temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `pptx-regen-${crypto.randomUUID()}.pptx`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    try {
      // 5. Extract images from PPTX using PPTXImageExtractor
      // NOTE: LibreOffice/ImageMagick slide generation has been removed.
      // PPTXImageExtractor handles all image extraction from PPTX files.
      const { PPTXImageExtractorService } = await import('./ingestion/pptxImageExtractor.service');
      const pptxExtractor = new PPTXImageExtractorService();
      const imageResult = await pptxExtractor.extractImages(
          tempFilePath,
          documentId,
          { uploadToGCS: true }
        );

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        if (imageResult.success && imageResult.slides && imageResult.slides.length > 0) {

          // Fetch existing slidesData
          const existingMetadata = await prisma.documentMetadata.findUnique({
            where: { documentId: document.id }
          });

          let existingSlidesData: any[] = [];
          try {
            if (existingMetadata?.slidesData) {
              existingSlidesData = typeof existingMetadata.slidesData === 'string'
                ? JSON.parse(existingMetadata.slidesData)
                : existingMetadata.slidesData as any[];
            }
          } catch (e) {
          }

          // Merge extracted images with existing slide data
          const slidesData = existingSlidesData.map((existingSlide: any) => {
            const slideNum = existingSlide.slideNumber || existingSlide.slide_number;
            const extractedSlide = imageResult.slides!.find(s => s.slideNumber === slideNum);

            // Use the first image as the slide preview
            const imageUrl = extractedSlide && extractedSlide.images.length > 0
              ? extractedSlide.images[0].imageUrl
              : existingSlide.imageUrl;

            return {
              slideNumber: slideNum,
              content: existingSlide.content || '',
              textCount: existingSlide.textCount || existingSlide.text_count || 0,
              imageUrl: imageUrl
            };
          });

          // Update metadata
          await prisma.documentMetadata.update({
            where: { documentId: document.id },
            data: {
              slidesData: JSON.stringify(slidesData),
              slideGenerationStatus: 'completed',
              slideGenerationError: null,
              updatedAt: new Date()
            }
          });


          return {
            success: true,
            message: 'Slides regenerated successfully using image extraction',
            slides: slidesData,
            totalSlides: slidesData.length
          };
        } else {
          throw new Error('Image extraction failed - no slides extracted');
        }

      return {
        totalSlides: 0,
        slides: [],
        message: 'Slides regenerated successfully with improved font rendering'
      };

    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw error;
    }

  } catch (error: any) {
    console.error('❌ Error regenerating PPTX slides:', error);

    // Set status to failed
    try {
      await prisma.documentMetadata.update({
        where: { documentId },
        data: {
          slideGenerationStatus: 'failed',
          slideGenerationError: error.message || 'Unknown error during slide generation'
        }
      });
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    throw error;
  }
};

/**
 * Generate tags in background (fire-and-forget)
 * ✅ OPTIMIZATION: This runs AFTER document is completed to save 5-10 seconds
 */
async function generateTagsInBackground(
  documentId: string,
  extractedText: string,
  filename: string,
  userId: string
) {
  try {

    const tags = await geminiService.generateDocumentTags(filename, extractedText);

    if (tags && tags.length > 0) {

      for (const tagName of tags) {
        // Get or create tag
        let tag = await prisma.tag.findUnique({
          where: { userId_name: { userId, name: tagName } },
        });

        if (!tag) {
          tag = await prisma.tag.create({
            data: { userId, name: tagName },
          });
        }

        // Link tag to document
        await prisma.documentTag.upsert({
          where: {
            documentId_tagId: {
              documentId,
              tagId: tag.id,
            },
          },
          update: {},
          create: {
            documentId,
            tagId: tag.id,
          },
        });
      }


      // Emit WebSocket event to notify frontend
      try {
        const io = require('../server').io;
        if (io) {
          io.to(`user:${userId}`).emit('document-tags-updated', {
            documentId,
            tags,
            filename
          });
        }
      } catch (wsError) {
      }
    } else {
    }
  } catch (error) {
    console.error(`❌ [Background] Tag generation failed for ${documentId}:`, error);
  }
}


