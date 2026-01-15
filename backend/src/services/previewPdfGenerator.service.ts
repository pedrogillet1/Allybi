/**
 * Preview PDF Generator Service
 *
 * Handles automatic PDF generation for Office documents (DOCX, XLSX, PPTX)
 * during the upload processing pipeline. This ensures previews are always
 * available when users click to view a document.
 *
 * Key features:
 * - Pre-generates PDF during upload (not on first view)
 * - Idempotent: skips if PDF already exists
 * - Tracks status in metadata (pending/processing/ready/failed)
 * - Falls back gracefully when LibreOffice unavailable
 * - Automatic retry with attempt tracking (max 3 attempts)
 * - Timeout protection for stale processing jobs
 */

import prisma from '../config/database';
import { downloadFile, uploadFile, fileExists } from '../config/storage';
import * as libreOfficeConverter from './ingestion/libreOfficeConverter.service';
import { emitToUser } from './websocket.service';

// MIME types that need PDF conversion for preview
const OFFICE_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
];

// Configuration for retry mechanism
const MAX_RETRY_ATTEMPTS = 3;
const STALE_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface PreviewGenerationResult {
  success: boolean;
  status: 'ready' | 'failed' | 'skipped' | 'max_retries_exceeded';
  pdfKey?: string;
  error?: string;
  duration?: number;
  attempts?: number;
}

/**
 * Check if a document's MIME type requires PDF preview generation
 */
export function needsPreviewPdfGeneration(mimeType: string): boolean {
  return OFFICE_MIME_TYPES.includes(mimeType);
}

/**
 * Get the S3 key for a document's preview PDF
 */
export function getPreviewPdfKey(userId: string, documentId: string): string {
  return `${userId}/${documentId}-converted.pdf`;
}

/**
 * Generate a PDF preview for an Office document
 *
 * This function implements a state machine with retry support:
 * 1. Checks if max retries exceeded
 * 2. Checks if PDF already exists (idempotent)
 * 3. Downloads the original file from S3
 * 4. Converts to PDF using LibreOffice
 * 5. Uploads the PDF to S3
 * 6. Updates metadata with status and attempt count
 *
 * @param documentId - The document to generate preview for
 * @param userId - The user who owns the document
 * @param options - Optional settings (skipRetryCheck for reconciliation jobs)
 * @returns Result with status and any errors
 */
export async function generatePreviewPdf(
  documentId: string,
  userId: string,
  options?: { skipRetryCheck?: boolean; isRetry?: boolean }
): Promise<PreviewGenerationResult> {
  const startTime = Date.now();

  try {
    console.log(`📄 [PreviewPDF] Starting preview generation for document ${documentId.substring(0, 8)}...`);

    // 1. Get document info with metadata
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { metadata: true },
    });

    if (!document) {
      return { success: false, status: 'failed', error: 'Document not found' };
    }

    // 2. Check if this document type needs PDF conversion
    if (!needsPreviewPdfGeneration(document.mimeType)) {
      console.log(`📄 [PreviewPDF] Document ${documentId.substring(0, 8)} does not need PDF preview (${document.mimeType})`);
      await updatePreviewStatus(documentId, 'skipped', null, null);
      return { success: true, status: 'skipped' };
    }

    // 3. Check retry count before processing (unless skipRetryCheck is set)
    const currentAttempts = document.metadata?.previewPdfAttempts || 0;
    if (!options?.skipRetryCheck && currentAttempts >= MAX_RETRY_ATTEMPTS) {
      const error = `Max retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded`;
      console.warn(`⚠️ [PreviewPDF] ${error} for document ${documentId.substring(0, 8)}`);
      await updatePreviewStatus(documentId, 'failed', null, error);
      return {
        success: false,
        status: 'max_retries_exceeded',
        error,
        attempts: currentAttempts
      };
    }

    // 4. Check if PDF already exists (idempotent)
    const pdfKey = getPreviewPdfKey(userId, documentId);
    const pdfAlreadyExists = await fileExists(pdfKey);

    if (pdfAlreadyExists) {
      console.log(`📄 [PreviewPDF] PDF already exists at ${pdfKey}, skipping conversion`);
      await updatePreviewStatus(documentId, 'ready', pdfKey, null, { resetAttempts: true });
      return { success: true, status: 'ready', pdfKey };
    }

    // 5. Check LibreOffice availability first (fail fast)
    const libreOffice = await libreOfficeConverter.checkLibreOfficeAvailable();
    if (!libreOffice.available) {
      const error = `LibreOffice not available: ${libreOffice.reason || 'Unknown reason'}`;
      console.warn(`⚠️ [PreviewPDF] ${error}`);
      // Don't count LibreOffice unavailability against retry attempts (infrastructure issue)
      await updatePreviewStatus(documentId, 'failed', null, error);
      return { success: false, status: 'failed', error };
    }

    // 6. Update status to processing and increment attempts
    await updatePreviewStatus(documentId, 'processing', null, null, { incrementAttempts: true });
    const newAttempts = currentAttempts + 1;
    console.log(`📄 [PreviewPDF] Processing attempt ${newAttempts}/${MAX_RETRY_ATTEMPTS} for ${documentId.substring(0, 8)}`);

    // 7. Download the original file
    console.log(`📥 [PreviewPDF] Downloading original file: ${document.encryptedFilename}`);
    let fileBuffer = await downloadFile(document.encryptedFilename);

    // 8. Decrypt if needed
    if (document.isEncrypted && document.encryptionIV && document.encryptionAuthTag) {
      console.log(`🔓 [PreviewPDF] Decrypting file...`);
      const encryptionService = await import('./encryption.service');
      const ivBuffer = Buffer.from(document.encryptionIV, 'base64');
      const authTagBuffer = Buffer.from(document.encryptionAuthTag, 'base64');
      const encryptedBuffer = Buffer.concat([ivBuffer, authTagBuffer, fileBuffer]);
      fileBuffer = encryptionService.default.decryptFile(encryptedBuffer, `document-${userId}`);
    }

    // 9. Convert to PDF
    console.log(`🔄 [PreviewPDF] Converting ${document.filename} to PDF using LibreOffice...`);
    const conversion = await libreOfficeConverter.convertToPdf(fileBuffer, document.filename);

    if (!conversion.success || !conversion.pdfBuffer) {
      const error = conversion.error || 'PDF conversion failed';
      console.error(`❌ [PreviewPDF] Conversion failed (attempt ${newAttempts}/${MAX_RETRY_ATTEMPTS}): ${error}`);

      // Determine if we should mark as failed or keep pending for retry
      const shouldRetry = newAttempts < MAX_RETRY_ATTEMPTS;
      const status = shouldRetry ? 'pending' : 'failed';
      await updatePreviewStatus(documentId, status, null, error);

      return {
        success: false,
        status: shouldRetry ? 'failed' : 'max_retries_exceeded',
        error,
        attempts: newAttempts
      };
    }

    // 10. Upload PDF to S3
    console.log(`📤 [PreviewPDF] Uploading PDF to S3: ${pdfKey}`);
    await uploadFile(pdfKey, conversion.pdfBuffer, 'application/pdf');

    // 11. Update status to ready
    await updatePreviewStatus(documentId, 'ready', pdfKey, null);

    const duration = Date.now() - startTime;
    console.log(`✅ [PreviewPDF] Preview generated successfully in ${duration}ms (attempt ${newAttempts}): ${pdfKey}`);

    // 12. Emit WebSocket event so frontend can update
    emitToUser(userId, 'preview-pdf-ready', {
      documentId,
      previewPdfKey: pdfKey,
      previewPdfStatus: 'ready',
      attempts: newAttempts,
    });

    return { success: true, status: 'ready', pdfKey, duration, attempts: newAttempts };

  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error during preview generation';
    console.error(`❌ [PreviewPDF] Error generating preview for ${documentId}:`, errorMessage);

    // Get current attempt count for proper status determination
    const metadata = await prisma.documentMetadata.findUnique({
      where: { documentId },
      select: { previewPdfAttempts: true },
    });
    const attempts = metadata?.previewPdfAttempts || 0;
    const shouldRetry = attempts < MAX_RETRY_ATTEMPTS;

    await updatePreviewStatus(documentId, shouldRetry ? 'pending' : 'failed', null, errorMessage);

    return {
      success: false,
      status: shouldRetry ? 'failed' : 'max_retries_exceeded',
      error: errorMessage,
      attempts,
    };
  }
}

/**
 * Update the preview PDF status in document metadata
 * Now includes attempt tracking and timestamp updates for retry mechanism
 */
async function updatePreviewStatus(
  documentId: string,
  status: string,
  pdfKey: string | null,
  error: string | null,
  options?: { incrementAttempts?: boolean; resetAttempts?: boolean }
): Promise<void> {
  const now = new Date();

  // Build update object
  const updateData: any = {
    previewPdfStatus: status,
    previewPdfKey: pdfKey,
    previewPdfError: error,
    previewPdfUpdatedAt: now,
  };

  // Build create object with defaults
  const createData: any = {
    documentId,
    previewPdfStatus: status,
    previewPdfKey: pdfKey,
    previewPdfError: error,
    previewPdfUpdatedAt: now,
    previewPdfAttempts: options?.incrementAttempts ? 1 : 0,
  };

  // Handle attempt counter updates
  if (options?.resetAttempts) {
    updateData.previewPdfAttempts = 0;
  }

  // For incrementing attempts, we need a separate update
  if (options?.incrementAttempts) {
    await prisma.documentMetadata.upsert({
      where: { documentId },
      update: {
        ...updateData,
        previewPdfAttempts: { increment: 1 },
      },
      create: createData,
    });
    return;
  }

  await prisma.documentMetadata.upsert({
    where: { documentId },
    update: updateData,
    create: createData,
  });
}

/**
 * Get the preview PDF status for a document (with retry info)
 */
export async function getPreviewPdfStatus(documentId: string): Promise<{
  status: string | null;
  pdfKey: string | null;
  error: string | null;
  attempts: number;
  updatedAt: Date | null;
  isStale: boolean;
}> {
  const metadata = await prisma.documentMetadata.findUnique({
    where: { documentId },
    select: {
      previewPdfStatus: true,
      previewPdfKey: true,
      previewPdfError: true,
      previewPdfAttempts: true,
      previewPdfUpdatedAt: true,
    },
  });

  const status = metadata?.previewPdfStatus || null;
  const updatedAt = metadata?.previewPdfUpdatedAt || null;
  const isStale = isProcessingStale(status, updatedAt);

  return {
    status,
    pdfKey: metadata?.previewPdfKey || null,
    error: metadata?.previewPdfError || null,
    attempts: metadata?.previewPdfAttempts || 0,
    updatedAt,
    isStale,
  };
}

/**
 * Check if a processing job is stale (stuck in processing state too long)
 */
export function isProcessingStale(status: string | null, updatedAt: Date | null): boolean {
  if (status !== 'processing') return false;
  if (!updatedAt) return true; // No timestamp = definitely stale
  const age = Date.now() - updatedAt.getTime();
  return age > STALE_PROCESSING_TIMEOUT_MS;
}

/**
 * Find all documents that need preview retry
 * - Status is pending/processing/NULL (never processed)
 * - UpdatedAt is older than timeout (for processing) or any age (for pending/null)
 * - Attempts < MAX_RETRY_ATTEMPTS (or no attempts yet)
 *
 * FIX: Also catches Office documents with NULL previewPdfStatus (no metadata row
 * or metadata row with NULL status) - these were previously stuck forever!
 */
export async function findDocumentsNeedingPreviewRetry(): Promise<Array<{
  documentId: string;
  userId: string;
  status: string;
  attempts: number;
  filename: string;
}>> {
  const staleThreshold = new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS);

  // Find documents with:
  // 1. status = 'pending' (always retry)
  // 2. status = 'processing' AND updatedAt < staleThreshold (stuck jobs)
  // 3. status = NULL (never processed - no metadata row or null status) - NEW!
  // AND attempts < MAX_RETRY_ATTEMPTS (or no attempts yet)
  const staleDocuments = await prisma.document.findMany({
    where: {
      mimeType: { in: OFFICE_MIME_TYPES },
      status: { in: ['ready', 'enriching', 'available'] }, // Only process documents that are usable
      OR: [
        // Case 1: Has metadata with pending status
        {
          metadata: {
            previewPdfStatus: 'pending',
            previewPdfAttempts: { lt: MAX_RETRY_ATTEMPTS },
          },
        },
        // Case 2: Has metadata with stale processing status
        {
          metadata: {
            previewPdfStatus: 'processing',
            previewPdfUpdatedAt: { lt: staleThreshold },
            previewPdfAttempts: { lt: MAX_RETRY_ATTEMPTS },
          },
        },
        // Case 3: Has metadata but NULL previewPdfStatus (never started)
        {
          metadata: {
            previewPdfStatus: null,
            OR: [
              { previewPdfAttempts: null },
              { previewPdfAttempts: { lt: MAX_RETRY_ATTEMPTS } },
            ],
          },
        },
        // Case 4: No metadata row at all (brand new document)
        {
          metadata: null,
        },
      ],
    },
    select: {
      id: true,
      userId: true,
      filename: true,
      metadata: {
        select: {
          previewPdfStatus: true,
          previewPdfAttempts: true,
        },
      },
    },
  });

  return staleDocuments.map(doc => ({
    documentId: doc.id,
    userId: doc.userId,
    status: doc.metadata?.previewPdfStatus || 'null',
    attempts: doc.metadata?.previewPdfAttempts || 0,
    filename: doc.filename,
  }));
}

/**
 * Reconcile stale preview jobs
 * Called periodically to retry stuck/pending documents
 */
export async function reconcilePreviewJobs(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  console.log('🔄 [PreviewPDF] Starting preview reconciliation...');

  const documentsNeedingRetry = await findDocumentsNeedingPreviewRetry();
  console.log(`🔄 [PreviewPDF] Found ${documentsNeedingRetry.length} documents needing preview retry`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of documentsNeedingRetry) {
    processed++;
    console.log(`🔄 [PreviewPDF] Retrying ${doc.filename} (${doc.documentId.substring(0, 8)}...) - attempt ${doc.attempts + 1}/${MAX_RETRY_ATTEMPTS}`);

    try {
      const result = await generatePreviewPdf(doc.documentId, doc.userId, { isRetry: true });

      if (result.success) {
        succeeded++;
        console.log(`✅ [PreviewPDF] Retry succeeded for ${doc.documentId.substring(0, 8)}`);
      } else if (result.status === 'skipped') {
        skipped++;
      } else if (result.status === 'max_retries_exceeded') {
        failed++;
        console.log(`❌ [PreviewPDF] Max retries exceeded for ${doc.documentId.substring(0, 8)}`);
      } else {
        failed++;
        console.log(`⚠️ [PreviewPDF] Retry failed for ${doc.documentId.substring(0, 8)}: ${result.error}`);
      }
    } catch (error: any) {
      failed++;
      console.error(`❌ [PreviewPDF] Exception during retry for ${doc.documentId.substring(0, 8)}:`, error.message);
    }
  }

  console.log(`🔄 [PreviewPDF] Reconciliation complete: ${processed} processed, ${succeeded} succeeded, ${failed} failed, ${skipped} skipped`);

  return { processed, succeeded, failed, skipped };
}

/**
 * Batch generate previews for multiple documents
 * Useful for processing uploaded documents in bulk
 */
export async function generatePreviewsForDocuments(
  documentIds: string[],
  userId: string
): Promise<Map<string, PreviewGenerationResult>> {
  const results = new Map<string, PreviewGenerationResult>();

  for (const documentId of documentIds) {
    const result = await generatePreviewPdf(documentId, userId);
    results.set(documentId, result);
  }

  return results;
}

export default {
  needsPreviewPdfGeneration,
  getPreviewPdfKey,
  generatePreviewPdf,
  getPreviewPdfStatus,
  generatePreviewsForDocuments,
  isProcessingStale,
  findDocumentsNeedingPreviewRetry,
  reconcilePreviewJobs,
  MAX_RETRY_ATTEMPTS,
  STALE_PROCESSING_TIMEOUT_MS,
};
