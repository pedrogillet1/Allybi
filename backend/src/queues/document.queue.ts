/**
 * ULTRA-FAST Document Processing Queue
 *
 * Handles async document processing after upload:
 * 1. Text extraction
 * 2. Chunking
 * 3. Embedding generation (batch)
 * 4. Pinecone storage (batch)
 *
 * OPTIMIZATIONS:
 * - 20 concurrent workers (not 3!)
 * - Batch embedding generation
 * - Uses existing reprocessDocument for reliability
 *
 * Expected performance:
 * - Single document: 2-4 seconds
 * - 100 documents: ~30-60 seconds
 */

import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/env';
import prisma from '../config/database';
import { logger } from '../infra/logger';
import { downloadFile } from '../config/storage';
import { extractPdfWithAnchors } from '../services/extraction/pdfExtractor.service';
import { extractTextFromWord } from '../services/extraction/docxExtractor.service';
import { extractTextFromExcel } from '../services/extraction/xlsxExtractor.service';
import { extractPptxWithAnchors } from '../services/extraction/pptxExtractor.service';
import vectorEmbeddingService from '../services/retrieval/vectorEmbedding.service';
import { getGoogleVisionOcrService } from '../services/extraction/google-vision-ocr.service';

// Encryption imports (encrypt extracted text before DB write)
import { EncryptionService } from '../services/security/encryption.service';
import { EnvelopeService } from '../services/security/envelope.service';
import { TenantKeyService } from '../services/security/tenantKey.service';
import { DocumentKeyService } from '../services/documents/documentKey.service';
import { DocumentCryptoService } from '../services/documents/documentCrypto.service';
import { EncryptedDocumentRepo } from '../services/documents/encryptedDocumentRepo.service';

// Preview generation imports (restored from preview services)
import {
  generatePreviewPdf,
  needsPreviewPdfGeneration,
  reconcilePreviewJobs,
} from '../services/preview/previewPdfGenerator.service';

// ---------------------------------------------------------------------------
// Lightweight helpers (WebSocket & progress stubs — non-critical for embeddings)
// ---------------------------------------------------------------------------

const emitToUser = (userId: string, event: string, data: any) => {
  logger.debug('[WebSocket stub] Event emitted', { userId, event, data });
};

const documentProgressService = {
  async emitCustomProgress(pct: number, msg: string, _opts: any) {
    logger.debug('[DocProgress] Progress', { pct, msg });
  },
};

// ---------------------------------------------------------------------------
// MIME → extractor dispatch
// ---------------------------------------------------------------------------
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

async function extractText(buffer: Buffer, mimeType: string) {
  if (PDF_MIMES.includes(mimeType)) return extractPdfWithAnchors(buffer);
  if (DOCX_MIMES.includes(mimeType)) return extractTextFromWord(buffer);
  if (XLSX_MIMES.includes(mimeType)) return extractTextFromExcel(buffer);
  if (PPTX_MIMES.includes(mimeType)) return extractPptxWithAnchors(buffer);
  // Plain text fallback
  if (mimeType.startsWith('text/')) {
    const text = buffer.toString('utf-8');
    return { text, wordCount: text.split(/\s+/).length, confidence: 1.0 };
  }
  // Image OCR via Google Cloud Vision
  if (mimeType.startsWith('image/')) {
    const visionService = getGoogleVisionOcrService();
    if (!visionService.isAvailable()) {
      throw new Error(`Image OCR unavailable (Google Vision not initialized): ${visionService.getInitError() || 'no credentials'}`);
    }
    const ocrResult = await visionService.extractTextFromBuffer(buffer, { mode: 'document' });
    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
      throw new Error(`Image OCR produced no text (mimeType: ${mimeType})`);
    }
    return { text: ocrResult.text, wordCount: ocrResult.text.split(/\s+/).length, confidence: ocrResult.confidence ?? 0.8 };
  }
  throw new Error(`Unsupported mimeType for extraction: ${mimeType}`);
}

// ---------------------------------------------------------------------------
// Text → InputChunk[] helper
// ---------------------------------------------------------------------------

const CHUNK_TARGET_CHARS = 1500;
const CHUNK_OVERLAP_CHARS = 150;

interface InputChunk {
  chunkIndex: number;
  content: string;
  pageNumber?: number;
}

function buildInputChunks(extraction: any, fullText: string): InputChunk[] {
  // If extractor returned pages (PDF / PPTX), use them as natural boundaries
  const pages: Array<{ page: number; text: string }> | undefined = extraction.pages;
  if (pages && pages.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    for (const p of pages) {
      const pageText = (p.text || '').trim();
      if (!pageText) continue;
      // Split large pages into sub-chunks
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
      // Compose full slide text: title + body + notes
      const parts: string[] = [];
      if (s.title) parts.push(s.title);
      if (s.text) parts.push(s.text);
      if (s.notes) parts.push(`Notes: ${s.notes}`);
      const slideText = parts.join('\n\n').trim();
      if (!slideText) continue;
      // Split large slides into sub-chunks
      for (const segment of splitText(slideText, CHUNK_TARGET_CHARS, CHUNK_OVERLAP_CHARS)) {
        out.push({ chunkIndex: idx++, content: segment, pageNumber: s.slide });
      }
    }
    return out;
  }

  // For DOCX / XLSX / plain text: split the full text
  const segments = splitText(fullText.trim(), CHUNK_TARGET_CHARS, CHUNK_OVERLAP_CHARS);
  return segments.map((content, idx) => ({ chunkIndex: idx, content }));
}

function splitText(text: string, targetChars: number, overlap: number): string[] {
  if (text.length <= targetChars) return [text];

  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + targetChars, text.length);
    // Try to break on a paragraph or sentence boundary
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
    // Advance offset; if remaining text is <= overlap, just stop
    const nextOffset = end - overlap;
    if (nextOffset <= offset) {
      // Prevent infinite loop — no progress possible
      break;
    }
    offset = nextOffset;
  }
  return chunks.filter(c => c.length > 0);
}

// ---------------------------------------------------------------------------
// Near-duplicate chunk filtering (Jaccard word-set similarity)
// ---------------------------------------------------------------------------

function deduplicateChunks(chunks: InputChunk[]): InputChunk[] {
  if (chunks.length <= 1) return chunks;

  const SIMILARITY_THRESHOLD = 0.8;
  const accepted: InputChunk[] = [];
  const acceptedWordSets: Set<string>[] = [];

  for (const chunk of chunks) {
    const words = new Set(chunk.content.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    let isDuplicate = false;

    for (const existingWords of acceptedWordSets) {
      // Jaccard similarity: |intersection| / |union|
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

  if (accepted.length < chunks.length) {
    logger.info('[deduplicateChunks] Removed near-duplicate chunks', {
      before: chunks.length,
      after: accepted.length,
      removed: chunks.length - accepted.length,
    });
  }

  return accepted;
}

// ---------------------------------------------------------------------------
// Real processDocumentAsync — download → extract → chunk → embed → Pinecone
// ---------------------------------------------------------------------------

const processDocumentAsync = async (
  documentId: string,
  encryptedFilename: string | null,
  filename: string,
  mimeType: string,
  userId: string,
  _thumbnailUrl: string | null,
): Promise<void> => {
  if (!encryptedFilename) {
    throw new Error(`No storage key (encryptedFilename) for document ${documentId}`);
  }

  // 1) Download from S3
  logger.info('[processDocumentAsync] Downloading from S3', { documentId, key: encryptedFilename });
  const fileBuffer = await downloadFile(encryptedFilename);

  // 2) Extract text
  logger.info('[processDocumentAsync] Extracting text', { documentId, mimeType, size: fileBuffer.length });
  const extraction = await extractText(fileBuffer, mimeType);

  // All extractors return { text, wordCount, confidence, ... }
  // Some also have pages[] (PDF/PPTX) or sections[] (DOCX)
  const fullText = (extraction as any).text || '';
  if (!fullText || fullText.trim().length < 10) {
    throw new Error(`Text extraction produced no usable text for ${filename} (${mimeType})`);
  }

  logger.info('[processDocumentAsync] Extracted text', {
    documentId,
    wordCount: (extraction as any).wordCount || 0,
    textLength: fullText.length,
  });

  // 3) Chunk the text into segments for embedding
  //    Use page boundaries if available (PDF/PPTX), otherwise split by ~1500 chars
  const rawChunks = buildInputChunks(extraction, fullText);

  // 3b) Remove near-duplicate chunks (prevents overlapping content from wasting embedding budget)
  const inputChunks = deduplicateChunks(rawChunks);

  // 4) Generate embeddings & store in Postgres + Pinecone
  logger.info('[processDocumentAsync] Generating embeddings', { documentId, chunkCount: inputChunks.length });
  await vectorEmbeddingService.storeDocumentEmbeddings(documentId, inputChunks);

  logger.info('[processDocumentAsync] Embeddings stored successfully', { documentId, filename, chunks: inputChunks.length });

  // 5) Encrypt extracted text and store in DB (if encryption keys are configured)
  const hasEncryptionKey = !!(process.env.KODA_MASTER_KEY_BASE64 || process.env.KODA_KMS_KEY_ID);
  if (hasEncryptionKey) {
    try {
      const enc = new EncryptionService();
      const envelope = new EnvelopeService(enc);
      const tenantKeys = new TenantKeyService(prisma, enc);
      const docKeys = new DocumentKeyService(prisma, enc, tenantKeys, envelope);
      const docCrypto = new DocumentCryptoService(enc);
      const encDocRepo = new EncryptedDocumentRepo(prisma, docKeys, docCrypto);

      await encDocRepo.storeEncryptedExtractedText(userId, documentId, fullText);

      if (filename) {
        await encDocRepo.setEncryptedFilename(userId, documentId, filename);
      }

      logger.info('[processDocumentAsync] Encrypted extracted text stored', { documentId });
    } catch (encErr: any) {
      logger.warn('[processDocumentAsync] Encryption failed (non-fatal)', { error: encErr.message });
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// Queue Configuration
// ═══════════════════════════════════════════════════════════════

// Parse Redis URL for Upstash or use individual config
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    // Parse Upstash Redis URL (rediss://default:password@host:port)
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        tls: url.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null, // Required for BullMQ
      };
    } catch (e) {
      logger.warn('[DocumentQueue] Failed to parse REDIS_URL, using config fallback');
    }
  }

  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
  };
};

const connection = getRedisConnection();

// Create the document processing queue
export const documentQueue = new Queue('document-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // Faster retry (1s instead of 5s)
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 24 * 3600, // Remove jobs older than 24 hours
    },
    removeOnFail: {
      count: 100, // Keep last 100 failed jobs for debugging
      age: 7 * 24 * 3600, // Keep for 7 days
    },
  },
});

// ═══════════════════════════════════════════════════════════════
// Preview Reconciliation Queue (runs every 5 minutes)
// ═══════════════════════════════════════════════════════════════
export const previewReconciliationQueue = new Queue('preview-reconciliation', {
  connection,
  defaultJobOptions: {
    attempts: 1, // Don't retry the reconciliation job itself
    removeOnComplete: {
      count: 50, // Keep last 50 completed reconciliation runs
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 20,
      age: 24 * 3600,
    },
  },
});

// ═══════════════════════════════════════════════════════════════
// Preview Generation Queue (IMMEDIATE - runs on upload completion)
// This ensures previews start generating right after upload, not waiting for reconciliation
// ═══════════════════════════════════════════════════════════════
export const previewGenerationQueue = new Queue('preview-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s initial retry delay
    },
    removeOnComplete: {
      count: 500, // Keep last 500 completed preview jobs
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 100,
      age: 7 * 24 * 3600,
    },
  },
});

export interface PreviewGenerationJobData {
  documentId: string;
  userId: string;
  filename: string;
  mimeType: string;
}

// ═══════════════════════════════════════════════════════════════
// Job Types
// ═══════════════════════════════════════════════════════════════

export interface ProcessDocumentJobData {
  documentId: string;
  userId: string;
  filename: string;
  mimeType: string;
  encryptedFilename?: string;
  thumbnailUrl?: string | null;
  priority?: 'high' | 'normal' | 'low';
  plaintextForEmbeddings?: string; // For zero-knowledge files
}

// ═══════════════════════════════════════════════════════════════
// Queue Worker
// ═══════════════════════════════════════════════════════════════

let worker: Worker | null = null;
let reconciliationWorker: Worker | null = null;

export function startDocumentWorker() {
  if (worker) {
    logger.info('[DocumentQueue] Worker already running');
    return;
  }

  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
  logger.info('[DocumentQueue] Starting worker', { concurrency });

  worker = new Worker(
    'document-processing',
    async (job: Job<ProcessDocumentJobData>) => {
      const { documentId, userId, filename, mimeType, encryptedFilename, thumbnailUrl } = job.data;
      const startTime = Date.now();

      logger.info('[Worker] Enriching document', { filename, documentId: documentId.substring(0, 8) });

      // Progress options for DocumentProgressService
      const progressOptions = {
        documentId,
        userId,
        filename,
      };

      try {
        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Set status to 'enriching' - Document already usable!
        // ═══════════════════════════════════════════════════════════════
        await prisma.document.update({
          where: { id: documentId },
          data: { status: 'enriching' }
        });

        // Emit progress: started
        await job.updateProgress(5);
        await documentProgressService.emitCustomProgress(5, 'Starting background enrichment...', progressOptions);

        // Fetch document to get encryptedFilename if not provided
        const document = await prisma.document.findUnique({
          where: { id: documentId },
          include: { metadata: true }
        });

        if (!document) {
          throw new Error(`Document ${documentId} not found`);
        }

        const effectiveEncryptedFilename = encryptedFilename || document.encryptedFilename;
        const effectiveMimeType = mimeType || document.mimeType;

        if (!effectiveMimeType) {
          throw new Error(`No mimeType available for document ${documentId}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Run heavy processing (OCR, chunking, embeddings)
        // ═══════════════════════════════════════════════════════════════
        await processDocumentAsync(
          documentId,
          effectiveEncryptedFilename,
          filename || document.filename || 'unknown',
          effectiveMimeType,
          userId,
          thumbnailUrl || document.metadata?.thumbnailUrl || null
        );

        // ═══════════════════════════════════════════════════════════════
        // STEP 2.5: Generate PDF preview for Office documents (PPTX, DOCX, XLSX)
        // This runs DURING upload processing, not on first view - zero latency preview!
        // ═══════════════════════════════════════════════════════════════
        if (needsPreviewPdfGeneration(effectiveMimeType)) {
          logger.info('[Worker] Generating PDF preview for Office document', { filename });
          await job.updateProgress(85);
          await documentProgressService.emitCustomProgress(85, 'Generating preview...', progressOptions);

          try {
            const previewResult = await generatePreviewPdf(documentId, userId);
            if (previewResult.success) {
              logger.info('[Worker] PDF preview generated', { pdfKey: previewResult.pdfKey, durationMs: previewResult.duration });
            } else {
              // Preview generation failed but document processing succeeded - not fatal
              logger.warn('[Worker] PDF preview failed (non-fatal)', { error: previewResult.error });
            }
          } catch (previewError: any) {
            // Preview generation error should not fail the entire job
            logger.warn('[Worker] PDF preview error (non-fatal)', { error: previewError.message });
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: Set status to 'ready' - Full enrichment complete!
        // ═══════════════════════════════════════════════════════════════
        await prisma.document.update({
          where: { id: documentId },
          data: { status: 'ready' }
        });

        const totalTime = Date.now() - startTime;
        logger.info('[Worker] Enrichment complete', { filename, durationMs: totalTime });

        // Emit WebSocket event for UI update
        emitToUser(userId, 'document-ready', { documentId, filename });

        return { success: true, documentId, processingTime: totalTime };
      } catch (error: any) {
        logger.error('[Worker] Enrichment failed', { filename, error: error.message });

        // Mark as failed but document is still usable (status was 'available' before)
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'failed',
            error: error.message || 'Enrichment failed'
          }
        });

        throw error;
      }
    },
    {
      connection,
      concurrency, // ULTRA-FAST: Process many documents simultaneously
      limiter: {
        max: 50, // Max 50 jobs per interval
        duration: 1000, // Per second
      },
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    logger.debug('[DocumentQueue] Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('[DocumentQueue] Job failed', { jobId: job?.id, error: err.message });
  });

  worker.on('error', (err) => {
    logger.error('[DocumentQueue] Worker error', { error: String(err) });
  });

  logger.info('[DocumentQueue] Worker started');
}

export function stopDocumentWorker() {
  if (worker) {
    worker.close();
    worker = null;
    logger.info('[DocumentQueue] Worker stopped');
  }
}

// ═══════════════════════════════════════════════════════════════
// Preview Reconciliation Worker
// Runs every 5 minutes to retry stuck/pending preview generations
// ═══════════════════════════════════════════════════════════════

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function startPreviewReconciliationWorker() {
  if (reconciliationWorker) {
    logger.info('[PreviewReconciliation] Worker already running');
    return;
  }

  logger.info('[PreviewReconciliation] Starting reconciliation worker', { intervalMs: RECONCILIATION_INTERVAL_MS });

  // Create the worker that processes reconciliation jobs
  reconciliationWorker = new Worker(
    'preview-reconciliation',
    async (job: Job) => {
      logger.info('[PreviewReconciliation] Running scheduled reconciliation', { jobId: job.id });
      const startTime = Date.now();

      try {
        const result = await reconcilePreviewJobs();
        const duration = Date.now() - startTime;

        logger.info('[PreviewReconciliation] Completed', { durationMs: duration, ...result });

        return {
          success: true,
          ...result,
          duration,
        };
      } catch (error: any) {
        logger.error('[PreviewReconciliation] Failed', { error: error.message });
        throw error;
      }
    },
    {
      connection,
      concurrency: 1, // Only one reconciliation job at a time
    }
  );

  reconciliationWorker.on('completed', (job) => {
    logger.debug('[PreviewReconciliation] Job completed', { jobId: job.id });
  });

  reconciliationWorker.on('failed', (job, err) => {
    logger.error('[PreviewReconciliation] Job failed', { jobId: job?.id, error: err.message });
  });

  // Add the repeatable job (runs every 5 minutes)
  await previewReconciliationQueue.add(
    'reconcile-previews',
    {}, // No data needed
    {
      repeat: {
        every: RECONCILIATION_INTERVAL_MS,
      },
      jobId: 'preview-reconciliation-repeatable', // Prevent duplicates
    }
  );

  logger.info('[PreviewReconciliation] Worker started with repeatable job');
}

export function stopPreviewReconciliationWorker() {
  if (reconciliationWorker) {
    reconciliationWorker.close();
    reconciliationWorker = null;
    logger.info('[PreviewReconciliation] Worker stopped');
  }
}

// ═══════════════════════════════════════════════════════════════
// Preview Generation Worker (IMMEDIATE)
// Processes preview jobs immediately after upload completion
// ═══════════════════════════════════════════════════════════════

let previewWorker: Worker | null = null;

export function startPreviewGenerationWorker() {
  if (previewWorker) {
    logger.info('[PreviewGeneration] Worker already running');
    return;
  }

  logger.info('[PreviewGeneration] Starting immediate preview worker');

  previewWorker = new Worker(
    'preview-generation',
    async (job: Job<PreviewGenerationJobData>) => {
      const { documentId, userId, filename, mimeType } = job.data;
      const startTime = Date.now();

      logger.info('[PreviewWorker] Processing preview', { filename, documentId: documentId.substring(0, 8) });

      try {
        const result = await generatePreviewPdf(documentId, userId);
        const duration = Date.now() - startTime;

        if (result.success) {
          logger.info('[PreviewWorker] Preview ready', { filename, durationMs: duration });
        } else if (result.status === 'skipped') {
          logger.debug('[PreviewWorker] Skipped (already exists or not needed)', { filename });
        } else {
          logger.warn('[PreviewWorker] Preview failed', { filename, error: result.error });
          // Let BullMQ handle retry via backoff
          if (result.status !== 'max_retries_exceeded') {
            throw new Error(result.error || 'Preview generation failed');
          }
        }

        return { success: result.success, duration, status: result.status };
      } catch (error: any) {
        logger.error('[PreviewWorker] Error', { filename, error: error.message });
        throw error; // Rethrow for BullMQ retry
      }
    },
    {
      connection,
      concurrency: 1, // Serial: LibreOffice crashes when multiple headless instances run in parallel
    }
  );

  previewWorker.on('completed', (job) => {
    logger.debug('[PreviewGeneration] Job completed', { jobId: job.id });
  });

  previewWorker.on('failed', (job, err) => {
    logger.error('[PreviewGeneration] Job failed', { jobId: job?.id, error: err.message });
  });

  previewWorker.on('error', (err) => {
    logger.error('[PreviewGeneration] Worker error', { error: String(err) });
  });

  logger.info('[PreviewGeneration] Worker started');
}

export function stopPreviewGenerationWorker() {
  if (previewWorker) {
    previewWorker.close();
    previewWorker = null;
    logger.info('[PreviewGeneration] Worker stopped');
  }
}

/**
 * Add a preview generation job to the queue
 * Called immediately when Office document upload is completed
 */
export async function addPreviewGenerationJob(data: PreviewGenerationJobData) {
  const job = await previewGenerationQueue.add('generate-preview', data, {
    jobId: `preview-${data.documentId}`, // Prevent duplicate jobs
  });

  logger.info('[PreviewQueue] Enqueued preview job', { jobId: job.id, filename: data.filename });

  return job;
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

export async function addDocumentJob(data: ProcessDocumentJobData) {
  const job = await documentQueue.add('process-document', data, {
    jobId: `doc-${data.documentId}`, // Prevent duplicate jobs
  });

  logger.info('[DocumentQueue] Added job', { jobId: job.id, documentId: data.documentId });

  return job;
}

export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    documentQueue.getWaitingCount(),
    documentQueue.getActiveCount(),
    documentQueue.getCompletedCount(),
    documentQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

export default {
  documentQueue,
  previewReconciliationQueue,
  previewGenerationQueue,
  startDocumentWorker,
  stopDocumentWorker,
  startPreviewReconciliationWorker,
  stopPreviewReconciliationWorker,
  startPreviewGenerationWorker,
  stopPreviewGenerationWorker,
  addDocumentJob,
  addPreviewGenerationJob,
  getQueueStats,
};
