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

// S3 download concurrency limiter — prevents bandwidth starvation
// Configurable via env for VPS deployments with different network conditions
const pLimit = require('p-limit');
const s3DownloadConcurrency = parseInt(process.env.S3_DOWNLOAD_CONCURRENCY || '12', 10);
const s3DownloadLimit = pLimit(s3DownloadConcurrency) as <T>(fn: () => Promise<T>) => Promise<T>;
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

// ---------------------------------------------------------------------------
// Smart Image OCR Filter - Skip likely non-text images to save 80%+ OCR time
// ---------------------------------------------------------------------------
const SKIP_OCR_FILENAME_PATTERNS = [
  // Removed IMG_, DSC_, DCIM patterns - users may have screenshots/scanned docs with these names
  /photoroom/i,                // Photoroom edited images (product photos)
  /logo/i,                     // Logo images
  /icon/i,                     // Icon images
  /avatar/i,                   // Avatar/profile images
  /thumbnail/i,                // Thumbnails
  /banner/i,                   // Banner images
  /background/i,               // Background images
  /^copy_[A-F0-9-]+/i,         // iOS copy patterns (copy_3E9736B7...)
  /\.(svg|gif|webp)$/i,        // Vector/animated formats (even if mistyped mime)
];

const MIN_IMAGE_SIZE_FOR_OCR = 10 * 1024; // 10KB - smaller images rarely have useful text

function shouldSkipImageOcr(filename: string, bufferSize: number): { skip: boolean; reason?: string } {
  // Check filename patterns
  for (const pattern of SKIP_OCR_FILENAME_PATTERNS) {
    if (pattern.test(filename)) {
      return { skip: true, reason: `filename matches skip pattern: ${pattern}` };
    }
  }

  // Check file size (very small images are usually icons/logos)
  if (bufferSize < MIN_IMAGE_SIZE_FOR_OCR) {
    return { skip: true, reason: `image too small (${(bufferSize / 1024).toFixed(1)}KB < 10KB)` };
  }

  return { skip: false };
}

async function extractText(buffer: Buffer, mimeType: string, filename?: string) {
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
    // SMART FILTER: Skip OCR for likely non-text images (logos, product photos, etc.)
    // Return empty content instead of failing - document will be saved with no searchable text
    if (filename) {
      const skipCheck = shouldSkipImageOcr(filename, buffer.length);
      if (skipCheck.skip) {
        logger.info('[OCR] Skipping image OCR, saving with empty content', { filename, reason: skipCheck.reason });
        return { text: '', wordCount: 0, confidence: 1.0, skipped: true, skipReason: skipCheck.reason };
      }
    }

    const visionService = getGoogleVisionOcrService();
    if (!visionService.isAvailable()) {
      throw new Error(`Image OCR unavailable (Google Vision not initialized): ${visionService.getInitError() || 'no credentials'}`);
    }
    const ocrResult = await visionService.extractTextFromBuffer(buffer, { mode: 'document' });
    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
      logger.info('[OCR] Image OCR produced no text, saving with empty content', { filename, mimeType });
      return { text: '', wordCount: 0, confidence: 1.0, skipped: true, skipReason: 'OCR produced no text' };
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

interface PipelineTimings {
  s3DownloadMs: number;
  extractionMs: number;
  extractionMethod: string;
  ocrUsed: boolean;
  textLength: number;
  rawChunkCount: number;
  chunkCount: number;
  embeddingMs: number;
  pageCount: number | null;
}

const processDocumentAsync = async (
  documentId: string,
  encryptedFilename: string | null,
  filename: string,
  mimeType: string,
  userId: string,
  _thumbnailUrl: string | null,
): Promise<PipelineTimings> => {
  if (!encryptedFilename) {
    throw new Error(`No storage key (encryptedFilename) for document ${documentId}`);
  }

  // 1) Download from S3 (concurrency-limited to avoid bandwidth starvation)
  const tDownload = Date.now();
  logger.info('[processDocumentAsync] Downloading from S3', { documentId, key: encryptedFilename });
  const fileBuffer = await s3DownloadLimit(() => downloadFile(encryptedFilename));
  console.log(`⏱️ [Pipeline] S3 download: ${Date.now() - tDownload}ms (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB) — ${filename}`);

  // 2) Extract text
  const tExtract = Date.now();
  logger.info('[processDocumentAsync] Extracting text', { documentId, mimeType, size: fileBuffer.length });
  const extraction = await extractText(fileBuffer, mimeType, filename);
  console.log(`⏱️ [Pipeline] Text extraction: ${Date.now() - tExtract}ms — ${filename}`);

  // All extractors return { text, wordCount, confidence, ... }
  // Some also have pages[] (PDF/PPTX) or sections[] (DOCX)
  // Skipped files return { text: '', skipped: true, skipReason: '...' }
  const fullText = (extraction as any).text || '';
  const wasSkipped = (extraction as any).skipped === true;

  if (!fullText || fullText.trim().length < 10) {
    const skipReason = wasSkipped
      ? (extraction as any).skipReason
      : 'No extractable text content';

    logger.info('[processDocumentAsync] File skipped, no usable content', {
      documentId,
      filename,
      reason: skipReason,
    });
    console.log(`[Skipped] ${filename}: ${skipReason}`);

    // Return early with skipped flag - caller will set status to 'skipped'
    return {
      s3DownloadMs: tExtract - tDownload,
      extractionMs: Date.now() - tExtract,
      extractionMethod: mimeType.startsWith('image/') ? 'ocr' : 'text',
      ocrUsed: mimeType.startsWith('image/'),
      textLength: 0,
      rawChunkCount: 0,
      chunkCount: 0,
      embeddingMs: 0,
      pageCount: null,
      skipped: true,
      skipReason,
    } as PipelineTimings & { skipped: true; skipReason: string };
  }

  let inputChunks: InputChunk[] = [];
  let rawChunks: InputChunk[] = [];
  let tEmbed = Date.now(); // Default to now for skipped files

  if (fullText && fullText.trim().length >= 10) {
    logger.info('[processDocumentAsync] Extracted text', {
      documentId,
      wordCount: (extraction as any).wordCount || 0,
      textLength: fullText.length,
    });
    console.log(`[Chunking] ${filename}: extracted ${fullText.length} chars, ${(extraction as any).wordCount || 0} words`);

    // 3) Chunk the text into segments for embedding
    //    Use page boundaries if available (PDF/PPTX), otherwise split by ~1500 chars
    rawChunks = buildInputChunks(extraction, fullText);

    // 3b) Remove near-duplicate chunks (prevents overlapping content from wasting embedding budget)
    inputChunks = deduplicateChunks(rawChunks);

    // 4) Generate embeddings & store in Postgres + Pinecone
    tEmbed = Date.now();
    console.log(`[Chunking] ${filename}: ${rawChunks.length} raw chunks → ${inputChunks.length} after dedup`);
    logger.info('[processDocumentAsync] Generating embeddings', { documentId, chunkCount: inputChunks.length });
    await vectorEmbeddingService.storeDocumentEmbeddings(documentId, inputChunks);
    console.log(`⏱️ [Pipeline] Embed+store: ${Date.now() - tEmbed}ms (${inputChunks.length} chunks) — ${filename}`);
    logger.info('[processDocumentAsync] Embeddings stored successfully', { documentId, filename, chunks: inputChunks.length });
  }

  // 5) Encrypt extracted text and store in DB (fire-and-forget — non-blocking)
  const hasEncryptionKey = !!(process.env.KODA_MASTER_KEY_BASE64 || process.env.KODA_KMS_KEY_ID);
  if (hasEncryptionKey && (fullText || filename)) {
    // Don't block the pipeline — encryption is a best-effort post-step
    (async () => {
      try {
        const enc = new EncryptionService();
        const envelope = new EnvelopeService(enc);
        const tenantKeys = new TenantKeyService(prisma, enc);
        const docKeys = new DocumentKeyService(prisma, enc, tenantKeys, envelope);
        const docCrypto = new DocumentCryptoService(enc);
        const encDocRepo = new EncryptedDocumentRepo(prisma, docKeys, docCrypto);

        // Run both encryption writes in parallel (only encrypt text if there's content)
        await Promise.all([
          fullText ? encDocRepo.storeEncryptedExtractedText(userId, documentId, fullText) : Promise.resolve(),
          filename ? encDocRepo.setEncryptedFilename(userId, documentId, filename) : Promise.resolve(),
        ]);

        logger.info('[processDocumentAsync] Encrypted extracted text stored', { documentId });
      } catch (encErr: any) {
        logger.warn('[processDocumentAsync] Encryption failed (non-fatal)', { error: encErr.message });
      }
    })();
  }

  // Determine extraction method from mimeType
  const isOcr = mimeType.startsWith('image/');
  let extractionMethod = 'text';
  if (PDF_MIMES.includes(mimeType)) extractionMethod = 'pdf';
  else if (DOCX_MIMES.includes(mimeType)) extractionMethod = 'docx';
  else if (XLSX_MIMES.includes(mimeType)) extractionMethod = 'xlsx';
  else if (PPTX_MIMES.includes(mimeType)) extractionMethod = 'pptx';
  else if (isOcr) extractionMethod = 'ocr';

  return {
    s3DownloadMs: tExtract - tDownload,
    extractionMs: tEmbed - tExtract,
    extractionMethod,
    ocrUsed: isOcr,
    textLength: fullText.length,
    rawChunkCount: rawChunks.length,
    chunkCount: inputChunks.length,
    embeddingMs: Date.now() - tEmbed,
    pageCount: (extraction as any).pageCount ?? (extraction as any).slideCount ?? null,
  };
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

// Namespace queues by environment to prevent local/production workers from stealing each other's jobs
// Use QUEUE_PREFIX env var for local dev to avoid conflicts with deployed workers sharing same Redis
const QUEUE_PREFIX = process.env.QUEUE_PREFIX || (process.env.NODE_ENV === 'production' ? '' : 'dev-');

// Create the document processing queue
export const documentQueue = new Queue(`${QUEUE_PREFIX}document-processing`, {
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
export const previewReconciliationQueue = new Queue(`${QUEUE_PREFIX}preview-reconciliation`, {
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
export const previewGenerationQueue = new Queue(`${QUEUE_PREFIX}preview-generation`, {
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

  const concurrency = config.WORKER_CONCURRENCY;
  logger.info('[DocumentQueue] Starting worker', { concurrency });

  worker = new Worker(
    `${QUEUE_PREFIX}document-processing`,
    async (job: Job<ProcessDocumentJobData>) => {
      const { documentId, userId, filename, mimeType, encryptedFilename, thumbnailUrl } = job.data;
      const startTime = Date.now();

      const dbHost = config.DATABASE_URL?.match(/@([^:/]+)/)?.[1] || 'unknown';
      logger.info('[Worker] Enriching document', { filename, documentId: documentId.substring(0, 8), dbHost });

      // Progress options for DocumentProgressService
      const progressOptions = {
        documentId,
        userId,
        filename,
      };

      try {
        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Set status to 'enriching' — single DB round-trip
        // FIX: Use $queryRaw to bypass Prisma cache and force fresh DB read
        // ═══════════════════════════════════════════════════════════════
        logger.info('[Worker] Looking up document', { documentId: documentId.substring(0, 8), filename });

        // Direct lookup - now using local queue so no remote worker stealing jobs
        let document = await prisma.document.findUnique({
          where: { id: documentId },
          include: { metadata: true }
        });

        if (!document) {
          // Document may not have committed yet — retry with increasing delays
          for (let i = 0; i < 8; i++) {
            const delay = Math.min(500 * (i + 1), 2000); // 500ms, 1s, 1.5s, 2s, 2s, 2s, 2s, 2s
            await new Promise(r => setTimeout(r, delay));
            document = await prisma.document.findUnique({
              where: { id: documentId },
              include: { metadata: true }
            });
            if (document) {
              logger.info('[Worker] Document found on retry', { retry: i + 1, documentId: documentId.substring(0, 8) });
              break;
            }
          }
          if (!document) {
            logger.error('[Worker] Document not found after retries', { documentId, filename });
            throw new Error(`Document ${documentId} not found after retries — may have been deleted`);
          }
        }
        await prisma.document.update({
          where: { id: documentId },
          data: { status: 'enriching' }
        });

        // Emit progress: started
        job.updateProgress(5).catch(() => {});
        documentProgressService.emitCustomProgress(5, 'Starting background enrichment...', progressOptions).catch(() => {});

        const effectiveEncryptedFilename = encryptedFilename || document.encryptedFilename;
        const effectiveMimeType = mimeType || document.mimeType;

        if (!effectiveMimeType) {
          throw new Error(`No mimeType available for document ${documentId}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Run heavy processing (OCR, chunking, embeddings)
        // ═══════════════════════════════════════════════════════════════
        const timings = await processDocumentAsync(
          documentId,
          effectiveEncryptedFilename,
          filename || document.filename || 'unknown',
          effectiveMimeType,
          userId,
          thumbnailUrl || document.metadata?.thumbnailUrl || null
        );

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: Check if document was skipped (no extractable content)
        // ═══════════════════════════════════════════════════════════════
        const wasSkipped = (timings as any).skipped === true;
        const skipReason = (timings as any).skipReason;

        if (wasSkipped) {
          // Mark as 'skipped' - document has no searchable content
          await prisma.document.update({
            where: { id: documentId },
            data: {
              status: 'skipped',
              chunksCount: 0,
              error: skipReason || 'No extractable content',
            }
          });

          const totalTime = Date.now() - startTime;
          logger.info('[Worker] Document skipped (no content)', { filename, reason: skipReason, durationMs: totalTime });

          // Emit WebSocket event
          emitToUser(userId, 'document-skipped', { documentId, filename, reason: skipReason });

          return { success: true, documentId, skipped: true, processingTime: totalTime };
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: Check if we have any chunks - if not, mark as skipped
        // ═══════════════════════════════════════════════════════════════
        if (timings.chunkCount === 0) {
          await prisma.document.update({
            where: { id: documentId },
            data: {
              status: 'skipped',
              chunksCount: 0,
              error: 'No extractable text content',
            }
          });

          const totalTime = Date.now() - startTime;
          logger.info('[Worker] Document skipped (0 chunks after processing)', { filename, durationMs: totalTime });
          emitToUser(userId, 'document-skipped', { documentId, filename, reason: 'No extractable content' });

          return { success: true, documentId, skipped: true, processingTime: totalTime };
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: Set status to 'indexed' — embeddings complete, AI can query!
        // Also save chunksCount and pageCount for dashboard display
        // ═══════════════════════════════════════════════════════════════
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'indexed',
            chunksCount: timings.chunkCount,
          }
        });

        // Save pageCount to DocumentMetadata (fire-and-forget)
        if (timings.pageCount && timings.pageCount > 0) {
          prisma.documentMetadata.upsert({
            where: { documentId },
            create: { documentId, pageCount: timings.pageCount },
            update: { pageCount: timings.pageCount },
          }).catch(err => logger.warn('[Worker] Failed to save pageCount', { err: err.message }));
        }

        const totalTime = Date.now() - startTime;
        logger.info('[Worker] Indexing complete', { filename, durationMs: totalTime });

        // Persist per-stage metrics (fire-and-forget)
        const metricsData = {
          uploadStartedAt: document.createdAt,
          processingStartedAt: new Date(startTime),
          processingCompletedAt: new Date(),
          processingDuration: totalTime,
          textExtractionMethod: timings.extractionMethod,
          textExtractionSuccess: true,
          textExtractionTime: timings.extractionMs,
          textLength: timings.textLength,
          ocrUsed: timings.ocrUsed,
          embeddingDuration: timings.embeddingMs,
          embeddingsCreated: timings.chunkCount,
          chunksCreated: timings.chunkCount,
        };
        prisma.documentProcessingMetrics.upsert({
          where: { documentId },
          create: { documentId, ...metricsData },
          update: metricsData,
        }).catch(err => logger.warn('[Worker] Failed to persist metrics', { err: err.message }));

        // Log ingestion telemetry (fire-and-forget)
        prisma.ingestionEvent.create({
          data: {
            userId,
            documentId,
            filename: filename || document.filename || 'unknown',
            mimeType: effectiveMimeType,
            sizeBytes: document.fileSize || null,
            status: 'ok',
            extractionMethod: timings.extractionMethod || 'unknown',
            pages: timings.pageCount || null,
            ocrUsed: timings.ocrUsed || false,
            extractedTextLength: timings.textLength || null,
            chunkCount: timings.chunkCount || null,
            embeddingProvider: 'google',
            embeddingModel: 'text-embedding-004',
            durationMs: totalTime,
            at: new Date(),
          },
        }).catch(err => logger.warn('[Worker] Failed to log ingestion telemetry', { err: err.message }));

        // Emit WebSocket event - document is now AI-usable
        emitToUser(userId, 'document-indexed', { documentId, filename });

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: Preview generation (updates status to 'ready' when done)
        // ═══════════════════════════════════════════════════════════════
        if (needsPreviewPdfGeneration(effectiveMimeType)) {
          logger.info('[Worker] Queueing background preview generation', { filename });
          generatePreviewPdf(documentId, userId).then(result => {
            // Update to 'ready' only after preview completes
            prisma.document.update({
              where: { id: documentId },
              data: { status: 'ready' }
            }).then(() => {
              emitToUser(userId, 'document-ready', { documentId, filename, hasPreview: result.success });
            }).catch(err => logger.warn('[Worker] Failed to set ready status', { err: err.message }));
          }).catch(err => {
            // Preview failed - keep 'indexed' status (still AI-usable)
            logger.warn('[Worker] Preview failed, document stays indexed', { filename, error: err.message });
            emitToUser(userId, 'document-ready', { documentId, filename, hasPreview: false });
          });
        } else {
          // No preview needed - immediately set to 'ready'
          await prisma.document.update({
            where: { id: documentId },
            data: { status: 'ready' }
          });
          emitToUser(userId, 'document-ready', { documentId, filename });
        }

        return { success: true, documentId, processingTime: totalTime };
      } catch (error: any) {
        logger.error('[Worker] Enrichment failed', { filename, error: error.message });

        // Mark as failed (best-effort — doc may have been deleted)
        try {
          await prisma.document.update({
            where: { id: documentId },
            data: {
              status: 'failed',
              error: error.message || 'Enrichment failed'
            }
          });
        } catch (updateErr: any) {
          logger.warn('[Worker] Could not mark document as failed (may be deleted)', { documentId, err: updateErr.message });
        }

        // Persist failure metrics (fire-and-forget)
        const failData = {
          uploadStartedAt: new Date(startTime),
          processingStartedAt: new Date(startTime),
          processingCompletedAt: new Date(),
          processingDuration: Date.now() - startTime,
          processingFailed: true,
          processingError: (error.message || 'Unknown error').slice(0, 500),
        };
        prisma.documentProcessingMetrics.upsert({
          where: { documentId },
          create: { documentId, ...failData },
          update: failData,
        }).catch(err => logger.warn('[Worker] Failed to persist failure metrics', { err: err.message }));

        // Log failed ingestion telemetry (fire-and-forget)
        prisma.ingestionEvent.create({
          data: {
            userId,
            documentId,
            filename: filename || 'unknown',
            mimeType: mimeType || 'unknown',
            status: 'fail',
            errorCode: (error.code || error.name || 'UNKNOWN').slice(0, 50),
            extractionMethod: 'unknown',
            durationMs: Date.now() - startTime,
            at: new Date(),
          },
        }).catch(err => logger.warn('[Worker] Failed to log ingestion telemetry', { err: err.message }));

        throw error;
      }
    },
    {
      connection,
      concurrency, // ULTRA-FAST: Process many documents simultaneously
      limiter: {
        max: 100, // Max 100 jobs per interval
        duration: 1000, // Per second
      },
      // Increase lock duration to prevent stalling on large documents
      // Default is 30s which causes "job stalled" errors for slow processing
      lockDuration: 300000, // 5 minutes
      stalledInterval: 60000, // Check for stalled jobs every 60s
      maxStalledCount: 2, // Allow 2 stalls before marking as failed
    }
  );

  // Worker event handlers
  worker.on('ready', () => {
    console.log('[DocumentQueue] Worker READY and listening for jobs');
  });

  worker.on('active', (job) => {
    console.log(`[DocumentQueue] Job ${job.id} ACTIVE - processing ${job.data?.filename}`);
  });

  worker.on('completed', (job) => {
    console.log(`[DocumentQueue] Job ${job.id} COMPLETED`);
    logger.debug('[DocumentQueue] Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    console.log(`[DocumentQueue] Job ${job?.id} FAILED: ${err.message}`);
    logger.error('[DocumentQueue] Job failed', { jobId: job?.id, error: err.message });
  });

  worker.on('error', (err) => {
    console.log(`[DocumentQueue] Worker ERROR: ${String(err)}`);
    logger.error('[DocumentQueue] Worker error', { error: String(err) });
  });

  console.log('[DocumentQueue] Worker created, waiting for ready event...');
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
    `${QUEUE_PREFIX}preview-reconciliation`,
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
    `${QUEUE_PREFIX}preview-generation`,
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
      concurrency: parseInt(process.env.PREVIEW_WORKER_CONCURRENCY || '4', 10), // CloudConvert parallelism
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
  const job = await previewGenerationQueue.add('generate-preview', data);

  logger.info('[PreviewQueue] Enqueued preview job', { jobId: job.id, filename: data.filename });

  return job;
}

// ═══════════════════════════════════════════════════════════════
// Stuck Document Sweeper (runs every 2 minutes)
// Re-enqueues documents stuck in 'uploaded' or 'enriching'
// ═══════════════════════════════════════════════════════════════

export const stuckDocSweepQueue = new Queue(`${QUEUE_PREFIX}stuck-doc-sweep`, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 50, age: 24 * 3600 },
    removeOnFail: { count: 20, age: 24 * 3600 },
  },
});

let stuckDocSweepWorker: Worker | null = null;

const SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const UPLOADED_STUCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const ENRICHING_STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const SWEEP_BATCH_LIMIT = 50;

export async function startStuckDocSweeper() {
  if (stuckDocSweepWorker) {
    logger.info('[StuckDocSweeper] Already running');
    return;
  }

  logger.info('[StuckDocSweeper] Starting sweeper', { intervalMs: SWEEP_INTERVAL_MS });

  stuckDocSweepWorker = new Worker(
    `${QUEUE_PREFIX}stuck-doc-sweep`,
    async (job: Job) => {
      const now = new Date();
      const uploadedCutoff = new Date(now.getTime() - UPLOADED_STUCK_THRESHOLD_MS);
      const enrichingCutoff = new Date(now.getTime() - ENRICHING_STUCK_THRESHOLD_MS);

      // Find docs stuck in 'uploaded' (missed by queue)
      const stuckUploaded = await prisma.document.findMany({
        where: {
          status: 'uploaded',
          updatedAt: { lt: uploadedCutoff },
        },
        select: { id: true, userId: true, filename: true, mimeType: true, encryptedFilename: true },
        take: SWEEP_BATCH_LIMIT,
      });

      // Find docs stuck in 'enriching' (worker crashed mid-processing)
      const stuckEnriching = await prisma.document.findMany({
        where: {
          status: 'enriching',
          updatedAt: { lt: enrichingCutoff },
        },
        select: { id: true, userId: true, filename: true, mimeType: true, encryptedFilename: true },
        take: SWEEP_BATCH_LIMIT - stuckUploaded.length,
      });

      // Reset enriching → uploaded so they get reprocessed cleanly
      if (stuckEnriching.length > 0) {
        await prisma.document.updateMany({
          where: { id: { in: stuckEnriching.map(d => d.id) } },
          data: { status: 'uploaded' },
        });
      }

      const allStuck = [...stuckUploaded, ...stuckEnriching];
      let requeued = 0;

      for (const doc of allStuck) {
        try {
          await addDocumentJob({
            documentId: doc.id,
            userId: doc.userId,
            filename: doc.filename || 'unknown',
            mimeType: doc.mimeType || 'application/octet-stream',
            encryptedFilename: doc.encryptedFilename || undefined,
          });
          requeued++;
        } catch (err: any) {
          logger.warn('[StuckDocSweeper] Failed to requeue', { documentId: doc.id, error: err.message });
        }
      }

      logger.info('[StuckDocSweeper] Sweep complete', {
        found: allStuck.length,
        stuckUploaded: stuckUploaded.length,
        stuckEnriching: stuckEnriching.length,
        requeued,
      });

      return { found: allStuck.length, requeued };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  stuckDocSweepWorker.on('failed', (job, err) => {
    logger.error('[StuckDocSweeper] Job failed', { jobId: job?.id, error: err.message });
  });

  // Add the repeatable job
  await stuckDocSweepQueue.add(
    'sweep-stuck-docs',
    {},
    {
      repeat: { every: SWEEP_INTERVAL_MS },
      jobId: 'stuck-doc-sweep-repeatable',
    }
  );

  logger.info('[StuckDocSweeper] Sweeper started');
}

export function stopStuckDocSweeper() {
  if (stuckDocSweepWorker) {
    stuckDocSweepWorker.close();
    stuckDocSweepWorker = null;
    logger.info('[StuckDocSweeper] Sweeper stopped');
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

export async function addDocumentJob(data: ProcessDocumentJobData) {
  const job = await documentQueue.add('process-document', data);
  logger.info('[DocumentQueue] Added job', { jobId: job.id, documentId: data.documentId });
  return job;
}

/**
 * Bulk-enqueue documents in a single Redis round-trip.
 */
export async function addDocumentJobsBulk(items: ProcessDocumentJobData[]) {
  if (items.length === 0) return [];

  const bulkJobs = items.map(data => ({
    name: 'process-document' as const,
    data,
  }));

  const jobs = await documentQueue.addBulk(bulkJobs);
  logger.info('[DocumentQueue] Bulk added jobs', { count: jobs.length });
  return jobs;
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
  stuckDocSweepQueue,
  startDocumentWorker,
  stopDocumentWorker,
  startPreviewReconciliationWorker,
  stopPreviewReconciliationWorker,
  startPreviewGenerationWorker,
  stopPreviewGenerationWorker,
  startStuckDocSweeper,
  stopStuckDocSweeper,
  addDocumentJob,
  addDocumentJobsBulk,
  addPreviewGenerationJob,
  getQueueStats,
};
