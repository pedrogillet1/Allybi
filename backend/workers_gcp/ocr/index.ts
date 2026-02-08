/**
 * OCR Worker
 *
 * Cloud Run worker for extracting text from images using Google Cloud Vision.
 * Receives Pub/Sub push messages and processes documents.
 *
 * Pipeline: Download → OCR → Store text → Trigger embedding if needed
 */

import express, { Request, Response } from 'express';
import { getConfig } from '../shared/config';
import { getPrisma, disconnectPrisma } from '../shared/db';
import { logger, createLogger } from '../shared/logger';
import { decodePubSubMessage, isValidPubSubEnvelope, publishEmbedJob } from '../shared/pubsub';
import { parseWorkerPayload, validateJobType } from '../shared/validate';
import { downloadFile } from '../shared/storage';
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
import { ImageAnnotatorClient } from '@google-cloud/vision';

// Image MIME types that support OCR
const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/tiff',
  'image/bmp',
];

// Vision client (lazy init)
let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (!visionClient) {
    const config = getConfig();

    // Support multiple credential methods
    if (config.GOOGLE_VISION_CREDENTIALS_B64) {
      const decoded = Buffer.from(config.GOOGLE_VISION_CREDENTIALS_B64, 'base64').toString('utf8');
      const creds = JSON.parse(decoded);
      visionClient = new ImageAnnotatorClient({
        credentials: creds,
        projectId: config.GOOGLE_CLOUD_PROJECT || creds.project_id,
      });
    } else if (config.GOOGLE_VISION_CREDENTIALS_JSON) {
      const creds = JSON.parse(config.GOOGLE_VISION_CREDENTIALS_JSON);
      visionClient = new ImageAnnotatorClient({
        credentials: creds,
        projectId: config.GOOGLE_CLOUD_PROJECT || creds.project_id,
      });
    } else {
      // Default credentials chain (GOOGLE_APPLICATION_CREDENTIALS or metadata)
      visionClient = new ImageAnnotatorClient({
        projectId: config.GOOGLE_CLOUD_PROJECT,
      });
    }
  }
  return visionClient;
}

/**
 * Check if document MIME type requires OCR
 */
function needsOcr(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType);
}

interface OcrResult {
  text: string;
  confidence: number;
  warnings: string[];
}

/**
 * Extract text from image buffer using Google Cloud Vision
 */
async function extractTextFromImage(
  buffer: Buffer,
  langHint: string | undefined,
  jobLogger: ReturnType<typeof createLogger>
): Promise<OcrResult> {
  const client = getVisionClient();
  const warnings: string[] = [];

  if (!buffer || buffer.length === 0) {
    return { text: '', confidence: 0, warnings: ['EMPTY_BUFFER'] };
  }

  const languageHints = langHint ? [langHint, 'en'] : ['en', 'pt'];

  jobLogger.info('Calling Google Vision API', { bufferSize: buffer.length, languageHints });

  const [response] = await client.documentTextDetection({
    image: { content: buffer },
    imageContext: { languageHints },
  });

  const fullText = response.fullTextAnnotation?.text || '';

  // Compute average confidence from blocks
  let confidence = 0.7; // default
  const pageBlocks = response.fullTextAnnotation?.pages?.flatMap(p => p.blocks || []) || [];
  if (pageBlocks.length > 0) {
    const confs = pageBlocks
      .map(b => b.confidence)
      .filter((c): c is number => typeof c === 'number');
    if (confs.length > 0) {
      confidence = confs.reduce((a, b) => a + b, 0) / confs.length;
    }
  }

  // Normalize text
  let text = fullText
    .replace(/\r\n/g, '\n')
    .replace(/(\w)-\n(\w)/g, '$1$2') // Join hyphenated line breaks
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Cap size for safety
  const maxChars = 200_000;
  if (text.length > maxChars) {
    warnings.push('TRUNCATED_OUTPUT');
    text = text.slice(0, maxChars);
  }

  if (!text) {
    warnings.push('NO_TEXT_DETECTED');
  }

  return { text, confidence, warnings };
}

/**
 * Chunk text for embedding
 */
function chunkText(text: string, chunkSize: number = 1500, overlap: number = 200): string[] {
  if (!text || text.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at sentence boundary
    if (end < text.length) {
      const slice = text.slice(start, end + 100);
      const sentenceEnd = slice.search(/[.!?]\s+(?=[A-Z])/);
      if (sentenceEnd > chunkSize * 0.7) {
        end = start + sentenceEnd + 1;
      }
    }

    chunks.push(text.slice(start, Math.min(end, text.length)));
    start = end - overlap;

    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Process an OCR job
 */
async function processOcrJob(payload: WorkerJobPayload): Promise<WorkerResult> {
  const startTime = Date.now();
  const jobLogger = createLogger({ traceId: payload.jobId });
  const prisma = getPrisma();
  const config = getConfig();

  jobLogger.info('Starting OCR job', {
    documentId: payload.documentId,
    mimeType: payload.mimeType,
  });

  try {
    // Check if OCR is needed
    if (!needsOcr(payload.mimeType)) {
      jobLogger.info('Document does not need OCR', { mimeType: payload.mimeType });
      await markStageSkipped(payload.documentId, 'ocr');
      await markReadyIfComplete(payload.documentId);

      return {
        success: true,
        documentId: payload.documentId,
        jobType: 'ocr',
        durationMs: Date.now() - startTime,
      };
    }

    // Mark stage as started
    await markStageStarted(payload.documentId, 'ocr');

    // Fetch document
    const doc = await prisma.document.findUnique({
      where: { id: payload.documentId },
      select: {
        id: true,
        userId: true,
        filename: true,
        mimeType: true,
        isEncrypted: true,
        encryptionIV: true,
        encryptionAuthTag: true,
      },
    });

    if (!doc) {
      throw fatalError('DOCUMENT_NOT_FOUND', `Document ${payload.documentId} not found`);
    }

    // Download image from S3
    jobLogger.info('Downloading image');
    let imageBuffer = await withRetry(
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
        imageBuffer = Buffer.concat([decipher.update(imageBuffer), decipher.final()]);
      } catch (decryptErr: any) {
        jobLogger.warn('Decryption failed, continuing with original buffer', {
          error: decryptErr.message,
        });
      }
    }

    // Extract text with OCR
    jobLogger.info('Running OCR');
    const ocrStart = Date.now();
    const ocrResult = await withRetry(
      () => extractTextFromImage(imageBuffer, payload.langHint, jobLogger),
      {
        maxRetries: 2,
        baseDelayMs: 2000,
        onRetry: (attempt, error) => {
          jobLogger.warn(`OCR retry ${attempt}`, { error: error.message });
        },
      }
    );
    const ocrMs = Date.now() - ocrStart;

    jobLogger.info('OCR completed', {
      textLength: ocrResult.text.length,
      confidence: ocrResult.confidence,
      warnings: ocrResult.warnings,
      durationMs: ocrMs,
    });

    // Check if we got any text
    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
      jobLogger.warn('No text extracted from image');

      // Image is still viewable even without extracted text — mark ready
      await prisma.document.update({
        where: { id: payload.documentId },
        data: {
          status: 'ready',
        },
      });

      await markStageCompleted(payload.documentId, 'ocr');
      await markReadyIfComplete(payload.documentId);

      return {
        success: true,
        documentId: payload.documentId,
        jobType: 'ocr',
        durationMs: Date.now() - startTime,
        extractedTextLength: 0,
      };
    }

    // Chunk the extracted text
    const chunks = chunkText(ocrResult.text);
    jobLogger.info('Text chunked', { chunkCount: chunks.length });

    // Store chunks in database
    await prisma.$transaction(async (tx: any) => {
      // Update document status
      await tx.document.update({
        where: { id: payload.documentId },
        data: {
          chunksCount: chunks.length,
          status: 'ready',
        },
      });

      // Delete existing chunks
      await tx.documentChunk.deleteMany({
        where: { documentId: payload.documentId },
      });

      // Insert new chunks
      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map((text, index) => ({
            documentId: payload.documentId,
            chunkIndex: index,
            text,
            page: 1, // Images are single page
          })),
        });
      }
    });

    // Mark stage complete
    await markStageCompleted(payload.documentId, 'ocr');

    // Publish embed job to generate embeddings
    if (chunks.length > 0 && config.USE_GCP_WORKERS) {
      jobLogger.info('Publishing embed job');
      await publishEmbedJob(
        payload.documentId,
        doc.userId,
        payload.mimeType,
        payload.storage
      );
    }

    // Check if document is fully ready
    await markReadyIfComplete(payload.documentId);

    const durationMs = Date.now() - startTime;
    jobLogger.info('OCR job completed', {
      documentId: payload.documentId,
      durationMs,
      textExtracted: ocrResult.text.length,
      chunksCreated: chunks.length,
    });

    return {
      success: true,
      documentId: payload.documentId,
      jobType: 'ocr',
      durationMs,
      extractedTextLength: ocrResult.text.length,
      ocrConfidence: ocrResult.confidence,
    };
  } catch (error) {
    const pipelineError = wrapError(error, 'OCR_FAILED');

    jobLogger.error('OCR job failed', {
      documentId: payload.documentId,
      error: pipelineError.message,
      code: pipelineError.code,
    });

    await markStageFailed(payload.documentId, 'ocr', pipelineError.message);

    // Image is still viewable even if OCR fails — mark ready so it doesn't stay stuck
    try {
      const prisma = getPrisma();
      await prisma.document.update({
        where: { id: payload.documentId },
        data: { status: 'ready' },
      });
    } catch { /* ignore */ }

    return {
      success: true, // ACK the message so Pub/Sub doesn't retry endlessly
      documentId: payload.documentId,
      jobType: 'ocr',
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
  res.status(200).json({ status: 'ok', worker: 'ocr' });
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
    validateJobType(payload, 'ocr');

    logger.info('Received OCR job', {
      messageId: decoded.messageId,
      documentId: payload.documentId,
    });

    const result = await processOcrJob(payload);

    // Return appropriate status code based on result
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('OCR job error', {
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
  logger.info(`OCR worker listening on port ${config.PORT}`);
});

export default app;
