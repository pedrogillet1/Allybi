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
import { emitToUser } from '../services/websocket.service';
import documentProgressService from '../services/documentProgress.service';
// ⚡ PERF: Static import instead of dynamic import for faster job processing
import { processDocumentAsync } from '../services/document.service';
// 📄 Preview PDF generation for Office documents (PPTX, DOCX, XLSX)
import { generatePreviewPdf, needsPreviewPdfGeneration, reconcilePreviewJobs } from '../services/previewPdfGenerator.service';

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
      console.warn('[DocumentQueue] Failed to parse REDIS_URL, using config fallback');
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
    console.log('[DocumentQueue] Worker already running');
    return;
  }

  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '20', 10);
  console.log(`🚀 [DocumentQueue] Starting ULTRA-FAST worker with ${concurrency} concurrent jobs`);

  worker = new Worker(
    'document-processing',
    async (job: Job<ProcessDocumentJobData>) => {
      const { documentId, userId, filename, mimeType, encryptedFilename, thumbnailUrl } = job.data;
      const startTime = Date.now();

      console.log(`🔄 [Worker] Enriching: ${filename} (${documentId.substring(0, 8)}...)`);

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
          filename || document.filename,
          effectiveMimeType,
          userId,
          thumbnailUrl || document.metadata?.thumbnailUrl || null
        );

        // ═══════════════════════════════════════════════════════════════
        // STEP 2.5: Generate PDF preview for Office documents (PPTX, DOCX, XLSX)
        // This runs DURING upload processing, not on first view - zero latency preview!
        // ═══════════════════════════════════════════════════════════════
        if (needsPreviewPdfGeneration(effectiveMimeType)) {
          console.log(`📄 [Worker] Generating PDF preview for Office document: ${filename}`);
          await job.updateProgress(85);
          await documentProgressService.emitCustomProgress(85, 'Generating preview...', progressOptions);

          try {
            const previewResult = await generatePreviewPdf(documentId, userId);
            if (previewResult.success) {
              console.log(`✅ [Worker] PDF preview generated: ${previewResult.pdfKey} (${previewResult.duration}ms)`);
            } else {
              // Preview generation failed but document processing succeeded - not fatal
              console.warn(`⚠️ [Worker] PDF preview failed (non-fatal): ${previewResult.error}`);
            }
          } catch (previewError: any) {
            // Preview generation error should not fail the entire job
            console.warn(`⚠️ [Worker] PDF preview error (non-fatal): ${previewError.message}`);
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
        console.log(`✅ [Worker] Enriched in ${(totalTime / 1000).toFixed(1)}s: ${filename}`);

        // Emit WebSocket event for UI update
        emitToUser(userId, 'document-ready', { documentId, filename });

        return { success: true, documentId, processingTime: totalTime };
      } catch (error: any) {
        console.error(`❌ [Worker] Enrichment failed: ${filename}`, error.message);

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
    console.log(`[DocumentQueue] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[DocumentQueue] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[DocumentQueue] Worker error:', err);
  });

  console.log('[DocumentQueue] Worker started');
}

export function stopDocumentWorker() {
  if (worker) {
    worker.close();
    worker = null;
    console.log('[DocumentQueue] Worker stopped');
  }
}

// ═══════════════════════════════════════════════════════════════
// Preview Reconciliation Worker
// Runs every 5 minutes to retry stuck/pending preview generations
// ═══════════════════════════════════════════════════════════════

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function startPreviewReconciliationWorker() {
  if (reconciliationWorker) {
    console.log('[PreviewReconciliation] Worker already running');
    return;
  }

  console.log('🔄 [PreviewReconciliation] Starting reconciliation worker (every 5 minutes)');

  // Create the worker that processes reconciliation jobs
  reconciliationWorker = new Worker(
    'preview-reconciliation',
    async (job: Job) => {
      console.log(`🔄 [PreviewReconciliation] Running scheduled reconciliation (job ${job.id})...`);
      const startTime = Date.now();

      try {
        const result = await reconcilePreviewJobs();
        const duration = Date.now() - startTime;

        console.log(`✅ [PreviewReconciliation] Completed in ${duration}ms: ${result.processed} processed, ${result.succeeded} succeeded, ${result.failed} failed`);

        return {
          success: true,
          ...result,
          duration,
        };
      } catch (error: any) {
        console.error('❌ [PreviewReconciliation] Failed:', error.message);
        throw error;
      }
    },
    {
      connection,
      concurrency: 1, // Only one reconciliation job at a time
    }
  );

  reconciliationWorker.on('completed', (job) => {
    console.log(`[PreviewReconciliation] Job ${job.id} completed`);
  });

  reconciliationWorker.on('failed', (job, err) => {
    console.error(`[PreviewReconciliation] Job ${job?.id} failed:`, err.message);
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

  console.log('[PreviewReconciliation] Worker started with 5-minute repeatable job');
}

export function stopPreviewReconciliationWorker() {
  if (reconciliationWorker) {
    reconciliationWorker.close();
    reconciliationWorker = null;
    console.log('[PreviewReconciliation] Worker stopped');
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

export async function addDocumentJob(data: ProcessDocumentJobData) {
  const job = await documentQueue.add('process-document', data, {
    jobId: `doc-${data.documentId}`, // Prevent duplicate jobs
  });

  console.log(`[DocumentQueue] Added job ${job.id} for document ${data.documentId}`);

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
  startDocumentWorker,
  stopDocumentWorker,
  startPreviewReconciliationWorker,
  stopPreviewReconciliationWorker,
  addDocumentJob,
  getQueueStats,
};
