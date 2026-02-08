/**
 * Extract Worker
 *
 * Cloud Run worker for text extraction from documents.
 * Receives Pub/Sub push messages and processes documents.
 *
 * Pipeline: Download → Extract → Store text → Publish embed job
 */

import express, { Request, Response } from 'express';
import { getConfig } from '../shared/config';
import { getPrisma, disconnectPrisma } from '../shared/db';
import { logger, createLogger } from '../shared/logger';
import { decodePubSubMessage, isValidPubSubEnvelope, publishEmbedJob, publishPreviewJob } from '../shared/pubsub';
import { parseWorkerPayload, validateJobType } from '../shared/validate';
import { downloadFile } from '../shared/storage';
import { withRetry } from '../shared/retry';
import {
  markStageStarted,
  markStageCompleted,
  markStageFailed,
  markStageSkipped,
} from '../shared/pipeline/documentStatus';
import { PipelineError, wrapError, fatalError } from '../shared/pipeline/errors';
import type { WorkerJobPayload, WorkerResult } from '../shared/types/jobs';
import {
  extractPdfText,
  extractDocxText,
  extractXlsxText,
  extractPptxText,
  extractPlainText,
} from './extractors';

// MIME type constants
const PDF_MIMES = ['application/pdf'];
const DOCX_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];
const XLSX_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const PPTX_MIMES = [
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
];

// Chunking configuration
const CHUNK_TARGET_CHARS = 1500;
const CHUNK_OVERLAP_CHARS = 150;

interface InputChunk {
  chunkIndex: number;
  content: string;
  pageNumber?: number;
}

/**
 * Split text into chunks with overlap
 */
function splitText(text: string, targetChars: number, overlap: number): string[] {
  if (text.length <= targetChars) return [text];

  const chunks: string[] = [];
  let offset = 0;

  while (offset < text.length) {
    let end = Math.min(offset + targetChars, text.length);

    // Try to break on paragraph or sentence boundary
    if (end < text.length) {
      const paraBreak = text.lastIndexOf('\n\n', end);
      if (paraBreak > offset + targetChars * 0.5) {
        end = paraBreak;
      } else {
        const sentBreak = text.lastIndexOf('. ', end);
        if (sentBreak > offset + targetChars * 0.5) {
          end = sentBreak + 1;
        }
      }
    }

    chunks.push(text.slice(offset, end).trim());

    const nextOffset = end - overlap;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Build input chunks from extraction result
 */
function buildInputChunks(extraction: any, fullText: string): InputChunk[] {
  // If extractor returned pages (PDF/PPTX), use them as natural boundaries
  const pages: Array<{ page: number; text: string }> | undefined = extraction.pages;
  if (pages && pages.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    for (const p of pages) {
      const pageText = (p.text || '').trim();
      if (!pageText) continue;
      for (const segment of splitText(pageText, CHUNK_TARGET_CHARS, CHUNK_OVERLAP_CHARS)) {
        out.push({ chunkIndex: idx++, content: segment, pageNumber: p.page });
      }
    }
    return out;
  }

  // If extractor returned slides (PPTX), use slide boundaries
  const slides: Array<{ slide: number; title?: string; text: string; notes?: string }> | undefined = extraction.slides;
  if (slides && slides.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    for (const s of slides) {
      const parts: string[] = [];
      if (s.title) parts.push(s.title);
      if (s.text) parts.push(s.text);
      if (s.notes) parts.push(`Notes: ${s.notes}`);
      const slideText = parts.join('\n\n').trim();
      if (!slideText) continue;
      for (const segment of splitText(slideText, CHUNK_TARGET_CHARS, CHUNK_OVERLAP_CHARS)) {
        out.push({ chunkIndex: idx++, content: segment, pageNumber: s.slide });
      }
    }
    return out;
  }

  // For DOCX/XLSX/plain text: split the full text
  const segments = splitText(fullText.trim(), CHUNK_TARGET_CHARS, CHUNK_OVERLAP_CHARS);
  return segments.map((content, idx) => ({ chunkIndex: idx, content }));
}

/**
 * Near-duplicate chunk filtering using Jaccard similarity
 */
function deduplicateChunks(chunks: InputChunk[]): InputChunk[] {
  if (chunks.length <= 1) return chunks;

  const SIMILARITY_THRESHOLD = 0.8;
  const accepted: InputChunk[] = [];
  const acceptedWordSets: Set<string>[] = [];

  for (const chunk of chunks) {
    const words = new Set(
      chunk.content
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2)
    );
    let isDuplicate = false;

    for (const existingWords of acceptedWordSets) {
      let intersection = 0;
      for (const w of words) {
        if (existingWords.has(w)) intersection++;
      }
      const union = words.size + existingWords.size - intersection;
      if (union > 0 && intersection / union > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      accepted.push(chunk);
      acceptedWordSets.push(words);
    }
  }

  return accepted;
}

/**
 * Extract text from document based on MIME type
 */
async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<{
  text: string;
  wordCount: number;
  confidence: number;
  pages?: Array<{ page: number; text: string }>;
  slides?: Array<{ slide: number; title?: string; text: string; notes?: string }>;
  pageCount?: number;
  slideCount?: number;
  skipped?: boolean;
  skipReason?: string;
}> {
  if (PDF_MIMES.includes(mimeType)) {
    return extractPdfText(buffer);
  }

  if (DOCX_MIMES.includes(mimeType)) {
    return extractDocxText(buffer);
  }

  if (XLSX_MIMES.includes(mimeType)) {
    return extractXlsxText(buffer);
  }

  if (PPTX_MIMES.includes(mimeType)) {
    return extractPptxText(buffer);
  }

  // Plain text fallback
  if (mimeType.startsWith('text/')) {
    return extractPlainText(buffer);
  }

  // Image - mark for OCR worker
  if (mimeType.startsWith('image/')) {
    return {
      text: '',
      wordCount: 0,
      confidence: 0,
      skipped: true,
      skipReason: 'requires_ocr',
    };
  }

  throw fatalError('EXTRACTION_FAILED', `Unsupported mimeType: ${mimeType}`);
}

/**
 * Process a document extraction job
 */
async function processExtractJob(payload: WorkerJobPayload): Promise<WorkerResult> {
  const startTime = Date.now();
  const jobLogger = createLogger({ traceId: payload.jobId });
  const prisma = getPrisma();
  const config = getConfig();

  jobLogger.info('Starting extract job', {
    documentId: payload.documentId,
    mimeType: payload.mimeType,
  });

  try {
    // Mark stage as started
    await markStageStarted(payload.documentId, 'extract');

    // Verify document exists
    const doc = await prisma.document.findUnique({
      where: { id: payload.documentId },
      select: { id: true, status: true, mimeType: true },
    });

    if (!doc) {
      throw fatalError('DOCUMENT_NOT_FOUND', `Document ${payload.documentId} not found`);
    }

    // Download file from storage
    jobLogger.info('Downloading file from storage', {
      bucket: payload.storage.bucket,
      key: payload.storage.key,
    });

    const fileBuffer = await withRetry(
      () => downloadFile(payload.storage),
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          jobLogger.warn(`Download retry ${attempt}`, { error: error.message });
        },
      }
    );

    jobLogger.info('File downloaded', { sizeBytes: fileBuffer.length });

    // Extract text
    const extractionStart = Date.now();
    const extraction = await extractText(fileBuffer, payload.mimeType, payload.filename);
    const extractionMs = Date.now() - extractionStart;

    jobLogger.info('Text extracted', {
      textLength: extraction.text.length,
      wordCount: extraction.wordCount,
      confidence: extraction.confidence,
      extractionMs,
    });

    // Check if document needs OCR (images)
    if (extraction.skipped && extraction.skipReason === 'requires_ocr') {
      // Publish OCR job
      const { publishOcrJob } = await import('../shared/pubsub');
      await publishOcrJob(
        payload.documentId,
        payload.userId,
        payload.mimeType,
        payload.storage
      );

      // Mark extract as skipped (OCR will handle text extraction)
      await markStageSkipped(payload.documentId, 'extract');
      // Images don't need PDF preview - they're directly viewable
      await markStageSkipped(payload.documentId, 'preview');

      return {
        success: true,
        documentId: payload.documentId,
        jobType: 'extract',
        durationMs: Date.now() - startTime,
        extractedTextLength: 0,
      };
    }

    // Check if we have any content
    const fullText = extraction.text || '';
    if (!fullText || fullText.trim().length < 10) {
      await markStageCompleted(payload.documentId, 'extract');

      // Mark document as skipped - no usable content
      await prisma.document.update({
        where: { id: payload.documentId },
        data: {
          status: 'skipped',
          error: 'No extractable text content',
        },
      });

      return {
        success: true,
        documentId: payload.documentId,
        jobType: 'extract',
        durationMs: Date.now() - startTime,
        extractedTextLength: 0,
      };
    }

    // Build and deduplicate chunks
    const rawChunks = buildInputChunks(extraction, fullText);
    const inputChunks = deduplicateChunks(rawChunks);

    jobLogger.info('Chunks created', {
      rawChunks: rawChunks.length,
      dedupedChunks: inputChunks.length,
    });

    // Store extracted text and chunks in database
    await prisma.$transaction(async (tx: any) => {
      // Clear old chunks
      await tx.documentChunk.deleteMany({
        where: { documentId: payload.documentId },
      });

      // Insert new chunks
      if (inputChunks.length > 0) {
        await tx.documentChunk.createMany({
          data: inputChunks.map(chunk => ({
            documentId: payload.documentId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.content,
            page: chunk.pageNumber,
          })),
        });
      }

      // Update document — use only fields that exist in the schema
      await tx.document.update({
        where: { id: payload.documentId },
        data: {
          chunksCount: inputChunks.length,
          status: 'ready',
        },
      });

      // Update DocumentMetadata with page/word count
      await tx.documentMetadata.upsert({
        where: { documentId: payload.documentId },
        create: {
          documentId: payload.documentId,
          pageCount: extraction.pageCount || extraction.slideCount || null,
          wordCount: extraction.wordCount,
        },
        update: {
          pageCount: extraction.pageCount || extraction.slideCount || null,
          wordCount: extraction.wordCount,
        },
      });
    });

    // Mark extraction complete
    await markStageCompleted(payload.documentId, 'extract');

    // Publish embed job to continue pipeline
    await publishEmbedJob(
      payload.documentId,
      payload.userId,
      payload.mimeType,
      payload.storage
    );

    // Publish preview job if needed (for Office docs that need PDF conversion)
    const needsPreview = DOCX_MIMES.includes(payload.mimeType) ||
                         XLSX_MIMES.includes(payload.mimeType) ||
                         PPTX_MIMES.includes(payload.mimeType);
    if (needsPreview) {
      await publishPreviewJob(
        payload.documentId,
        payload.userId,
        payload.mimeType,
        payload.storage
      );
    } else {
      // No preview needed
      await markStageSkipped(payload.documentId, 'preview');
    }

    const durationMs = Date.now() - startTime;
    jobLogger.info('Extract job completed', {
      documentId: payload.documentId,
      durationMs,
      chunkCount: inputChunks.length,
    });

    return {
      success: true,
      documentId: payload.documentId,
      jobType: 'extract',
      durationMs,
      extractedTextLength: fullText.length,
      chunkCount: inputChunks.length,
    };
  } catch (error) {
    const pipelineError = wrapError(error, 'EXTRACTION_FAILED');

    jobLogger.error('Extract job failed', {
      documentId: payload.documentId,
      error: pipelineError.message,
      code: pipelineError.code,
      retryable: pipelineError.retryable,
    });

    await markStageFailed(payload.documentId, 'extract', pipelineError.message);

    // Update document status
    try {
      await prisma.document.update({
        where: { id: payload.documentId },
        data: {
          status: 'failed',
          error: pipelineError.message,
        },
      });
    } catch {
      // Ignore - document may have been deleted
    }

    return {
      success: false,
      documentId: payload.documentId,
      jobType: 'extract',
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
  res.status(200).json({ status: 'ok', worker: 'extract' });
});

// Pub/Sub push endpoint
app.post('/pubsub', async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Validate Pub/Sub envelope
  if (!isValidPubSubEnvelope(req.body)) {
    logger.error('Invalid Pub/Sub envelope');
    res.status(400).json({ error: 'Invalid Pub/Sub envelope' });
    return;
  }

  try {
    // Decode message
    const decoded = decodePubSubMessage<WorkerJobPayload>(req.body);
    const payload = parseWorkerPayload(decoded.data);
    validateJobType(payload, 'extract');

    logger.info('Received extract job', {
      messageId: decoded.messageId,
      documentId: payload.documentId,
    });

    // Process the job
    const result = await processExtractJob(payload);

    // Return appropriate status code based on result
    // - 200: Success, ACK the message
    // - 500: Retryable failure, NACK to trigger Pub/Sub retry
    if (result.success) {
      res.status(200).json(result);
    } else {
      // Return 500 to trigger Pub/Sub retry for failed jobs
      res.status(500).json(result);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('Extract job error', {
      error: err.message,
      durationMs: Date.now() - startTime,
    });

    // Return 400 for validation errors (don't retry)
    // Return 500 for retryable errors
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
  logger.info(`Extract worker listening on port ${config.PORT}`);
});

export default app;
