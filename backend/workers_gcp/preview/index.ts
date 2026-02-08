/**
 * Preview Worker
 *
 * Cloud Run worker for generating PDF previews of Office documents.
 * Receives Pub/Sub push messages and processes documents.
 *
 * Pipeline: Download → Convert to PDF → Upload → Update status
 */

import express, { Request, Response } from 'express';
import { getConfig } from '../shared/config';
import { getPrisma, disconnectPrisma } from '../shared/db';
import { logger, createLogger } from '../shared/logger';
import { decodePubSubMessage, isValidPubSubEnvelope } from '../shared/pubsub';
import { parseWorkerPayload, validateJobType } from '../shared/validate';
import { downloadFile, uploadFile } from '../shared/storage';
import { uploadToGcs } from '../shared/storage/gcs';
import { withRetry } from '../shared/retry';
import {
  markStageStarted,
  markStageCompleted,
  markStageFailed,
  markStageSkipped,
  markReadyIfComplete,
} from '../shared/pipeline/documentStatus';
import { PipelineError, wrapError, fatalError } from '../shared/pipeline/errors';
import type { WorkerJobPayload, WorkerResult } from '../shared/types/jobs';

// MIME types that need PDF conversion for preview
const OFFICE_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
];

/**
 * Check if a document's MIME type requires PDF preview generation
 */
function needsPreviewPdfGeneration(mimeType: string): boolean {
  return OFFICE_MIME_TYPES.includes(mimeType);
}

/**
 * Get the S3 key for a document's preview PDF
 */
function getPreviewPdfKey(userId: string, documentId: string): string {
  return `${userId}/${documentId}-converted.pdf`;
}

/**
 * Get file extension for MIME type
 */
function getExtensionForMime(mimeType: string): string {
  const extMap: Record<string, string> = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.ms-powerpoint': '.ppt',
  };
  return extMap[mimeType] || '';
}

/**
 * Convert document to PDF using CloudConvert
 */
async function convertToPdfWithCloudConvert(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  jobLogger: ReturnType<typeof createLogger>
): Promise<{ success: boolean; pdfBuffer?: Buffer; error?: string }> {
  const config = getConfig();

  if (!config.CLOUDCONVERT_API_KEY) {
    return {
      success: false,
      error: 'CloudConvert API key not configured',
    };
  }

  try {
    const CloudConvert = (await import('cloudconvert')).default;
    const cloudConvert = new CloudConvert(config.CLOUDCONVERT_API_KEY);

    // Determine input format
    const extension = filename.split('.').pop()?.toLowerCase() || getExtensionForMime(mimeType).slice(1);

    jobLogger.info('Starting CloudConvert job', { extension, filename });

    // Create conversion job
    const job = await cloudConvert.jobs.create({
      tasks: {
        'import-file': {
          operation: 'import/upload',
        },
        'convert-to-pdf': {
          operation: 'convert',
          input: ['import-file'],
          output_format: 'pdf',
        },
        'export-result': {
          operation: 'export/url',
          input: ['convert-to-pdf'],
        },
      },
    });

    // Upload the file
    const uploadTask = job.tasks?.find((t: any) => t.name === 'import-file');
    if (!uploadTask) {
      throw new Error('Failed to get upload task');
    }

    await cloudConvert.tasks.upload(uploadTask, fileBuffer, filename);

    // Wait for job completion
    const completedJob = await cloudConvert.jobs.wait(job.id);

    // Get the export task result
    const exportTask = completedJob.tasks?.find(
      (t: any) => t.name === 'export-result' && t.status === 'finished'
    );

    if (!exportTask?.result?.files?.[0]?.url) {
      throw new Error('Failed to get export URL from CloudConvert');
    }

    // Download the converted PDF
    const pdfUrl = exportTask.result.files[0].url;
    const pdfResponse = await fetch(pdfUrl);

    if (!pdfResponse.ok) {
      throw new Error(`Failed to download converted PDF: ${pdfResponse.statusText}`);
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    jobLogger.info('CloudConvert conversion complete', { pdfSize: pdfBuffer.length });

    return { success: true, pdfBuffer };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    jobLogger.error('CloudConvert error', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Process a preview generation job
 */
async function processPreviewJob(payload: WorkerJobPayload): Promise<WorkerResult> {
  const startTime = Date.now();
  const jobLogger = createLogger({ traceId: payload.jobId });
  const prisma = getPrisma();
  const config = getConfig();

  jobLogger.info('Starting preview job', {
    documentId: payload.documentId,
    mimeType: payload.mimeType,
  });

  try {
    // Check if preview is needed
    if (!needsPreviewPdfGeneration(payload.mimeType)) {
      jobLogger.info('Document does not need PDF preview', { mimeType: payload.mimeType });
      await markStageSkipped(payload.documentId, 'preview');
      await markReadyIfComplete(payload.documentId);

      return {
        success: true,
        documentId: payload.documentId,
        jobType: 'preview',
        durationMs: Date.now() - startTime,
      };
    }

    // Mark stage as started
    await markStageStarted(payload.documentId, 'preview');

    // Fetch document
    const doc = await prisma.document.findUnique({
      where: { id: payload.documentId },
      select: {
        id: true,
        userId: true,
        filename: true,
        mimeType: true,
        encryptedFilename: true,
        isEncrypted: true,
        encryptionIV: true,
        encryptionAuthTag: true,
        metadata: {
          select: {
            previewPdfKey: true,
            previewPdfStatus: true,
          },
        },
      },
    });

    if (!doc) {
      throw fatalError('DOCUMENT_NOT_FOUND', `Document ${payload.documentId} not found`);
    }

    // Check if preview already exists
    const pdfKey = getPreviewPdfKey(doc.userId, payload.documentId);
    if (doc.metadata?.previewPdfStatus === 'ready' && doc.metadata?.previewPdfKey) {
      jobLogger.info('Preview already exists, skipping');
      await markStageCompleted(payload.documentId, 'preview');
      await markReadyIfComplete(payload.documentId);

      return {
        success: true,
        documentId: payload.documentId,
        jobType: 'preview',
        durationMs: Date.now() - startTime,
        previewKey: doc.metadata.previewPdfKey,
      };
    }

    // Download original file
    jobLogger.info('Downloading original file');
    let fileBuffer = await withRetry(
      () => downloadFile(payload.storage),
      {
        maxRetries: 3,
        baseDelayMs: 1000,
      }
    );

    // Handle legacy encryption if needed
    if (doc.isEncrypted && doc.encryptionIV && doc.encryptionAuthTag) {
      jobLogger.info('Decrypting file');
      try {
        const crypto = await import('crypto');
        const key = crypto.scryptSync(`document-${doc.userId}`, 'salt', 32);
        const iv = Buffer.from(doc.encryptionIV, 'base64');
        const authTag = Buffer.from(doc.encryptionAuthTag, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        fileBuffer = Buffer.concat([decipher.update(fileBuffer), decipher.final()]);
      } catch (decryptErr: any) {
        jobLogger.warn('Decryption failed, continuing with original buffer', {
          error: decryptErr.message,
        });
      }
    }

    // Resolve filename
    let filename: string | undefined = doc.filename || payload.filename || undefined;
    if (!filename && doc.encryptedFilename) {
      const segments = doc.encryptedFilename.split('/');
      filename = segments[segments.length - 1] || undefined;
    }
    if (!filename) filename = 'document';
    if (!filename.includes('.')) {
      filename += getExtensionForMime(payload.mimeType);
    }

    // Convert to PDF
    jobLogger.info('Converting to PDF', { filename });
    const conversion = await convertToPdfWithCloudConvert(
      fileBuffer,
      filename,
      payload.mimeType,
      jobLogger
    );

    if (!conversion.success || !conversion.pdfBuffer) {
      const error = conversion.error || 'PDF conversion failed';
      jobLogger.error('Conversion failed', { error });

      // Update metadata with failure
      await prisma.documentMetadata.upsert({
        where: { documentId: payload.documentId },
        create: {
          documentId: payload.documentId,
          previewPdfStatus: 'failed',
          previewPdfError: error,
          previewPdfUpdatedAt: new Date(),
        },
        update: {
          previewPdfStatus: 'failed',
          previewPdfError: error,
          previewPdfUpdatedAt: new Date(),
        },
      });

      await markStageFailed(payload.documentId, 'preview', error);

      return {
        success: false,
        documentId: payload.documentId,
        jobType: 'preview',
        durationMs: Date.now() - startTime,
        error,
      };
    }

    // Upload PDF to GCS
    jobLogger.info('Uploading preview PDF', { pdfKey, size: conversion.pdfBuffer.length });
    await uploadToGcs(
      config.GCS_BUCKET_NAME,
      pdfKey,
      conversion.pdfBuffer,
      'application/pdf'
    );

    // Update metadata
    await prisma.documentMetadata.upsert({
      where: { documentId: payload.documentId },
      create: {
        documentId: payload.documentId,
        previewPdfStatus: 'ready',
        previewPdfKey: pdfKey,
        previewPdfError: null,
        previewPdfUpdatedAt: new Date(),
      },
      update: {
        previewPdfStatus: 'ready',
        previewPdfKey: pdfKey,
        previewPdfError: null,
        previewPdfUpdatedAt: new Date(),
      },
    });

    // Mark stage complete
    await markStageCompleted(payload.documentId, 'preview');

    // Check if document is fully ready
    await markReadyIfComplete(payload.documentId);

    const durationMs = Date.now() - startTime;
    jobLogger.info('Preview job completed', {
      documentId: payload.documentId,
      durationMs,
      previewKey: pdfKey,
    });

    return {
      success: true,
      documentId: payload.documentId,
      jobType: 'preview',
      durationMs,
      previewKey: pdfKey,
    };
  } catch (error) {
    const pipelineError = wrapError(error, 'PREVIEW_FAILED');

    jobLogger.error('Preview job failed', {
      documentId: payload.documentId,
      error: pipelineError.message,
      code: pipelineError.code,
    });

    await markStageFailed(payload.documentId, 'preview', pipelineError.message);

    return {
      success: false,
      documentId: payload.documentId,
      jobType: 'preview',
      durationMs: Date.now() - startTime,
      error: pipelineError.message,
      errorCode: pipelineError.code,
    };
  }
}

// Create Express app
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', worker: 'preview' });
});

// Pub/Sub push endpoint
app.post('/pubsub', async (req: Request, res: Response) => {
  const startTime = Date.now();

  if (!isValidPubSubEnvelope(req.body)) {
    logger.error('Invalid Pub/Sub envelope');
    res.status(400).json({ error: 'Invalid Pub/Sub envelope' });
    return;
  }

  try {
    const decoded = decodePubSubMessage<WorkerJobPayload>(req.body);
    const payload = parseWorkerPayload(decoded.data);
    validateJobType(payload, 'preview');

    logger.info('Received preview job', {
      messageId: decoded.messageId,
      documentId: payload.documentId,
    });

    const result = await processPreviewJob(payload);

    // Return appropriate status code based on result
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('Preview job error', {
      error: err.message,
      durationMs: Date.now() - startTime,
    });

    const isValidationError = err.message.includes('Invalid') || err.message.includes('Expected job type');
    res.status(isValidationError ? 400 : 500).json({
      success: false,
      error: err.message,
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down...');
  await disconnectPrisma();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down...');
  await disconnectPrisma();
  process.exit(0);
});

// Start server
const config = getConfig();
app.listen(config.PORT, () => {
  logger.info(`Preview worker listening on port ${config.PORT}`);
});

export default app;
