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

export interface PreviewGenerationResult {
  success: boolean;
  status: 'ready' | 'failed' | 'skipped';
  pdfKey?: string;
  error?: string;
  duration?: number;
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
 * This function:
 * 1. Checks if PDF already exists (idempotent)
 * 2. Downloads the original file from S3
 * 3. Converts to PDF using LibreOffice
 * 4. Uploads the PDF to S3
 * 5. Updates metadata with status
 *
 * @param documentId - The document to generate preview for
 * @param userId - The user who owns the document
 * @returns Result with status and any errors
 */
export async function generatePreviewPdf(
  documentId: string,
  userId: string
): Promise<PreviewGenerationResult> {
  const startTime = Date.now();

  try {
    console.log(`📄 [PreviewPDF] Starting preview generation for document ${documentId.substring(0, 8)}...`);

    // 1. Get document info
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

    // 3. Check if PDF already exists (idempotent)
    const pdfKey = getPreviewPdfKey(userId, documentId);
    const pdfAlreadyExists = await fileExists(pdfKey);

    if (pdfAlreadyExists) {
      console.log(`📄 [PreviewPDF] PDF already exists at ${pdfKey}, skipping conversion`);
      await updatePreviewStatus(documentId, 'ready', pdfKey, null);
      return { success: true, status: 'ready', pdfKey };
    }

    // 4. Check LibreOffice availability first (fail fast)
    const libreOffice = await libreOfficeConverter.checkLibreOfficeAvailable();
    if (!libreOffice.available) {
      const error = `LibreOffice not available: ${libreOffice.reason || 'Unknown reason'}`;
      console.warn(`⚠️ [PreviewPDF] ${error}`);
      await updatePreviewStatus(documentId, 'failed', null, error);
      return { success: false, status: 'failed', error };
    }

    // 5. Update status to processing
    await updatePreviewStatus(documentId, 'processing', null, null);

    // 6. Download the original file
    console.log(`📥 [PreviewPDF] Downloading original file: ${document.encryptedFilename}`);
    let fileBuffer = await downloadFile(document.encryptedFilename);

    // 7. Decrypt if needed
    if (document.isEncrypted && document.encryptionIV && document.encryptionAuthTag) {
      console.log(`🔓 [PreviewPDF] Decrypting file...`);
      const encryptionService = await import('./encryption.service');
      const ivBuffer = Buffer.from(document.encryptionIV, 'base64');
      const authTagBuffer = Buffer.from(document.encryptionAuthTag, 'base64');
      const encryptedBuffer = Buffer.concat([ivBuffer, authTagBuffer, fileBuffer]);
      fileBuffer = encryptionService.default.decryptFile(encryptedBuffer, `document-${userId}`);
    }

    // 8. Convert to PDF
    console.log(`🔄 [PreviewPDF] Converting ${document.filename} to PDF using LibreOffice...`);
    const conversion = await libreOfficeConverter.convertToPdf(fileBuffer, document.filename);

    if (!conversion.success || !conversion.pdfBuffer) {
      const error = conversion.error || 'PDF conversion failed';
      console.error(`❌ [PreviewPDF] Conversion failed: ${error}`);
      await updatePreviewStatus(documentId, 'failed', null, error);
      return { success: false, status: 'failed', error };
    }

    // 9. Upload PDF to S3
    console.log(`📤 [PreviewPDF] Uploading PDF to S3: ${pdfKey}`);
    await uploadFile(pdfKey, conversion.pdfBuffer, 'application/pdf');

    // 10. Update status to ready
    await updatePreviewStatus(documentId, 'ready', pdfKey, null);

    const duration = Date.now() - startTime;
    console.log(`✅ [PreviewPDF] Preview generated successfully in ${duration}ms: ${pdfKey}`);

    // 11. Emit WebSocket event so frontend can update
    emitToUser(userId, 'preview-pdf-ready', {
      documentId,
      previewPdfKey: pdfKey,
      previewPdfStatus: 'ready',
    });

    return { success: true, status: 'ready', pdfKey, duration };

  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error during preview generation';
    console.error(`❌ [PreviewPDF] Error generating preview for ${documentId}:`, errorMessage);

    await updatePreviewStatus(documentId, 'failed', null, errorMessage);

    return { success: false, status: 'failed', error: errorMessage };
  }
}

/**
 * Update the preview PDF status in document metadata
 */
async function updatePreviewStatus(
  documentId: string,
  status: string,
  pdfKey: string | null,
  error: string | null
): Promise<void> {
  await prisma.documentMetadata.upsert({
    where: { documentId },
    update: {
      previewPdfStatus: status,
      previewPdfKey: pdfKey,
      previewPdfError: error,
    },
    create: {
      documentId,
      previewPdfStatus: status,
      previewPdfKey: pdfKey,
      previewPdfError: error,
    },
  });
}

/**
 * Get the preview PDF status for a document
 */
export async function getPreviewPdfStatus(documentId: string): Promise<{
  status: string | null;
  pdfKey: string | null;
  error: string | null;
}> {
  const metadata = await prisma.documentMetadata.findUnique({
    where: { documentId },
    select: {
      previewPdfStatus: true,
      previewPdfKey: true,
      previewPdfError: true,
    },
  });

  return {
    status: metadata?.previewPdfStatus || null,
    pdfKey: metadata?.previewPdfKey || null,
    error: metadata?.previewPdfError || null,
  };
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
};
