/**
 * Preview PDF Generator Service
 *
 * Handles automatic PDF generation for Office documents (DOCX, XLSX, PPTX)
 * during the upload processing pipeline.
 *
 * Key features:
 * - Pre-generates PDF during upload (not on first view)
 * - Idempotent: skips if PDF already exists
 * - Tracks status in metadata (pending/processing/ready/failed)
 * - Falls back gracefully when LibreOffice unavailable
 * - Automatic retry with attempt tracking (max 3 attempts)
 * - Timeout protection for stale processing jobs
 */

import prisma from '../../config/database';
import { downloadFile, uploadFile, fileExists } from '../../config/storage';
import * as cloudConvert from '../conversion/cloudConvertPptx.service';
import * as googleSlides from './googleSlidesPreview.service';
import { choosePreviewProvider, PreviewProvider } from './previewProviderRouter';
import * as pptxSlideImageGenerator from './pptxSlideImageGenerator.service';

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
 */
export async function generatePreviewPdf(
  documentId: string,
  userId: string,
  options?: { skipRetryCheck?: boolean; isRetry?: boolean }
): Promise<PreviewGenerationResult> {
  const startTime = Date.now();

  try {
    console.log(`[PreviewPDF] Starting preview generation for document ${documentId.substring(0, 8)}...`);

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
      console.log(`[PreviewPDF] Document ${documentId.substring(0, 8)} does not need PDF preview (${document.mimeType})`);
      await updatePreviewStatus(documentId, 'skipped', null, null);
      return { success: true, status: 'skipped' };
    }

    // 3. Check retry count before processing
    const currentAttempts = document.metadata?.previewPdfAttempts || 0;
    if (!options?.skipRetryCheck && currentAttempts >= MAX_RETRY_ATTEMPTS) {
      const error = `Max retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded`;
      console.warn(`[PreviewPDF] ${error} for document ${documentId.substring(0, 8)}`);
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
      console.log(`[PreviewPDF] PDF already exists at ${pdfKey}, skipping conversion`);
      await updatePreviewStatus(documentId, 'ready', pdfKey, null, { resetAttempts: true });
      return { success: true, status: 'ready', pdfKey };
    }

    // 5. Update status to processing and increment attempts
    await updatePreviewStatus(documentId, 'processing', null, null, { incrementAttempts: true });
    const newAttempts = currentAttempts + 1;
    console.log(`[PreviewPDF] Processing attempt ${newAttempts}/${MAX_RETRY_ATTEMPTS} for ${documentId.substring(0, 8)}`);

    // 6. Download the original file
    if (!document.encryptedFilename) {
      const error = 'Document has no storage key (encryptedFilename is null)';
      console.error(`[PreviewPDF] ${error}`);
      await updatePreviewStatus(documentId, 'failed', null, error);
      return { success: false, status: 'failed', error };
    }
    console.log(`[PreviewPDF] Downloading original file: ${document.encryptedFilename}`);
    let fileBuffer = await downloadFile(document.encryptedFilename);

    // 7. Decrypt if needed (legacy encryption scheme)
    if (document.isEncrypted && document.encryptionIV && document.encryptionAuthTag) {
      console.log(`[PreviewPDF] Decrypting file...`);
      try {
        const crypto = await import('crypto');
        const key = crypto.scryptSync(`document-${userId}`, 'salt', 32);
        const iv = Buffer.from(document.encryptionIV, 'base64');
        const authTag = Buffer.from(document.encryptionAuthTag, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        fileBuffer = Buffer.concat([decipher.update(fileBuffer), decipher.final()]);
      } catch (decryptErr: any) {
        console.error(`[PreviewPDF] Decryption failed:`, decryptErr.message);
        // Continue with original buffer — document may not actually be encrypted
      }
    }

    // 8. Resolve filename with proper extension for the converter
    let fname = document.filename;
    if (!fname && document.encryptedFilename) {
      const segments = document.encryptedFilename.split('/');
      fname = segments[segments.length - 1] || null;
    }
    if (!fname) fname = 'document';
    if (!fname.includes('.')) {
      const extMap: Record<string, string> = {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'application/vnd.ms-powerpoint': '.ppt',
      };
      fname += extMap[document.mimeType] || '';
    }

    // 9. Convert to PDF — route to best provider (Google Slides for PPTX when available, else CloudConvert)
    const provider = choosePreviewProvider(document.mimeType, fname);

    if (provider === PreviewProvider.NONE) {
      console.log(`[PreviewPDF] No conversion needed for ${fname} (${document.mimeType})`);
      await updatePreviewStatus(documentId, 'skipped', null, null);
      return { success: true, status: 'skipped' };
    }

    let conversion: { success: boolean; pdfBuffer?: Buffer; error?: string };

    if (provider === PreviewProvider.GOOGLE_SLIDES) {
      console.log(`[PreviewPDF] Converting ${fname} to PDF using Google Slides API...`);
      conversion = await googleSlides.convertPptxViaSlidesApi(fileBuffer, fname);
      // Fallback to CloudConvert if Google Slides fails
      if (!conversion.success && cloudConvert.isCloudConvertAvailable()) {
        console.warn(`[PreviewPDF] Google Slides failed, falling back to CloudConvert: ${conversion.error}`);
        conversion = await cloudConvert.convertToPdf(fileBuffer, fname, document.mimeType);
      }
    } else {
      // CloudConvert for all Office formats
      if (!cloudConvert.isCloudConvertAvailable()) {
        const error = 'CLOUDCONVERT_API_KEY is not configured — required for preview generation';
        console.error(`[PreviewPDF] ${error}`);
        await updatePreviewStatus(documentId, 'failed', null, error);
        return { success: false, status: 'failed', error };
      }
      console.log(`[PreviewPDF] Converting ${fname} to PDF using CloudConvert...`);
      conversion = await cloudConvert.convertToPdf(fileBuffer, fname, document.mimeType);
    }

    if (!conversion.success || !conversion.pdfBuffer) {
      const error = conversion.error || 'PDF conversion failed';
      console.error(`[PreviewPDF] Conversion failed (attempt ${newAttempts}/${MAX_RETRY_ATTEMPTS}): ${error}`);

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
    console.log(`[PreviewPDF] Uploading PDF to S3: ${pdfKey}`);
    await uploadFile(pdfKey, conversion.pdfBuffer, 'application/pdf');

    // 11. Update status to ready
    await updatePreviewStatus(documentId, 'ready', pdfKey, null);

    const duration = Date.now() - startTime;
    console.log(`[PreviewPDF] Preview generated successfully in ${duration}ms (attempt ${newAttempts}): ${pdfKey}`);

    // 12. For PPTX files, generate slide images from the PDF (async, don't block)
    const isPptx = document.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                   document.mimeType?.includes('presentation') ||
                   document.mimeType?.includes('powerpoint');

    if (isPptx && conversion.pdfBuffer) {
      console.log(`[PreviewPDF] Triggering slide image generation for PPTX...`);
      pptxSlideImageGenerator.generateSlideImages(conversion.pdfBuffer, documentId)
        .then(async (slideResult) => {
          if (slideResult.success && slideResult.slidesData) {
            await prisma.documentMetadata.upsert({
              where: { documentId },
              update: {
                slidesData: JSON.stringify(slideResult.slidesData),
                slideGenerationStatus: 'completed',
                slideGenerationError: null,
              },
              create: {
                documentId,
                slidesData: JSON.stringify(slideResult.slidesData),
                slideGenerationStatus: 'completed',
              },
            });
            console.log(`[PreviewPDF] Slide images generated: ${slideResult.totalSlides} slides`);
          } else {
            console.warn(`[PreviewPDF] Slide image generation failed: ${slideResult.error}`);
            await prisma.documentMetadata.upsert({
              where: { documentId },
              update: {
                slideGenerationStatus: 'failed',
                slideGenerationError: slideResult.error || 'Unknown error',
              },
              create: {
                documentId,
                slideGenerationStatus: 'failed',
                slideGenerationError: slideResult.error || 'Unknown error',
              },
            });
          }
        })
        .catch((err) => {
          console.error(`[PreviewPDF] Slide image generation error:`, err.message);
        });
    }

    return { success: true, status: 'ready', pdfKey, duration, attempts: newAttempts };

  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error during preview generation';
    console.error(`[PreviewPDF] Error generating preview for ${documentId}:`, errorMessage);

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
 */
async function updatePreviewStatus(
  documentId: string,
  status: string,
  pdfKey: string | null,
  error: string | null,
  options?: { incrementAttempts?: boolean; resetAttempts?: boolean }
): Promise<void> {
  const now = new Date();

  const updateData: any = {
    previewPdfStatus: status,
    previewPdfKey: pdfKey,
    previewPdfError: error,
    previewPdfUpdatedAt: now,
  };

  const createData: any = {
    documentId,
    previewPdfStatus: status,
    previewPdfKey: pdfKey,
    previewPdfError: error,
    previewPdfUpdatedAt: now,
    previewPdfAttempts: options?.incrementAttempts ? 1 : 0,
  };

  if (options?.resetAttempts) {
    updateData.previewPdfAttempts = 0;
  }

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
 * Check if a processing job is stale
 */
export function isProcessingStale(status: string | null, updatedAt: Date | null): boolean {
  if (status !== 'processing') return false;
  if (!updatedAt) return true;
  const age = Date.now() - updatedAt.getTime();
  return age > STALE_PROCESSING_TIMEOUT_MS;
}

/**
 * Find all documents that need preview retry
 */
export async function findDocumentsNeedingPreviewRetry(): Promise<Array<{
  documentId: string;
  userId: string;
  status: string;
  attempts: number;
  filename: string;
}>> {
  const staleThreshold = new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS);

  const staleDocuments = await prisma.document.findMany({
    where: {
      mimeType: { in: OFFICE_MIME_TYPES },
      status: { in: ['ready', 'enriching', 'available'] },
      OR: [
        {
          metadata: {
            previewPdfStatus: 'pending',
            previewPdfAttempts: { lt: MAX_RETRY_ATTEMPTS },
          },
        },
        {
          metadata: {
            previewPdfStatus: 'processing',
            previewPdfUpdatedAt: { lt: staleThreshold },
            previewPdfAttempts: { lt: MAX_RETRY_ATTEMPTS },
          },
        },
        {
          metadata: {
            previewPdfStatus: null,
            OR: [
              { previewPdfAttempts: null },
              { previewPdfAttempts: { lt: MAX_RETRY_ATTEMPTS } },
            ],
          },
        },
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
    filename: doc.filename || 'unknown',
  }));
}

/**
 * Reconcile stale preview jobs
 */
export async function reconcilePreviewJobs(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  console.log('[PreviewPDF] Starting preview reconciliation...');

  const documentsNeedingRetry = await findDocumentsNeedingPreviewRetry();
  console.log(`[PreviewPDF] Found ${documentsNeedingRetry.length} documents needing preview retry`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of documentsNeedingRetry) {
    processed++;
    console.log(`[PreviewPDF] Retrying ${doc.filename} (${doc.documentId.substring(0, 8)}...) - attempt ${doc.attempts + 1}/${MAX_RETRY_ATTEMPTS}`);

    try {
      const result = await generatePreviewPdf(doc.documentId, doc.userId, { isRetry: true });

      if (result.success) {
        succeeded++;
        console.log(`[PreviewPDF] Retry succeeded for ${doc.documentId.substring(0, 8)}`);
      } else if (result.status === 'skipped') {
        skipped++;
      } else if (result.status === 'max_retries_exceeded') {
        failed++;
        console.log(`[PreviewPDF] Max retries exceeded for ${doc.documentId.substring(0, 8)}`);
      } else {
        failed++;
        console.log(`[PreviewPDF] Retry failed for ${doc.documentId.substring(0, 8)}: ${result.error}`);
      }
    } catch (error: any) {
      failed++;
      console.error(`[PreviewPDF] Exception during retry for ${doc.documentId.substring(0, 8)}:`, error.message);
    }
  }

  console.log(`[PreviewPDF] Reconciliation complete: ${processed} processed, ${succeeded} succeeded, ${failed} failed, ${skipped} skipped`);

  return { processed, succeeded, failed, skipped };
}

/**
 * Batch generate previews for multiple documents
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
