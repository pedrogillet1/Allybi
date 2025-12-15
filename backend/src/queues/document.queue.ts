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
// Job Types
// ═══════════════════════════════════════════════════════════════

export interface ProcessDocumentJobData {
  documentId: string;
  userId: string;
  filename: string;
  mimeType: string;
}

// ═══════════════════════════════════════════════════════════════
// Queue Worker
// ═══════════════════════════════════════════════════════════════

let worker: Worker | null = null;

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
      const { documentId, userId, filename, mimeType } = job.data;
      const startTime = Date.now();

      console.log(`🚀 [Worker] Processing: ${filename} (${documentId.substring(0, 8)}...)`);

      // Progress options for DocumentProgressService
      const progressOptions = {
        documentId,
        userId,
        filename,
      };

      try {
        // Emit progress: started using DocumentProgressService for consistency
        await job.updateProgress(5);
        await documentProgressService.emitCustomProgress(5, 'Starting queue processing...', progressOptions);

        // ⚡ PERF: Using static import instead of dynamic import
        // Fetch document to get encryptedFilename for processDocumentAsync
        const document = await prisma.document.findUnique({
          where: { id: documentId },
          include: { metadata: true }
        });

        if (!document) {
          throw new Error(`Document ${documentId} not found`);
        }

        // 🔥 FIX: Use processDocumentAsync instead of reprocessDocument
        // processDocumentAsync has granular progress emissions (22-100%)
        // while reprocessDocument was silent (jumped from 22% to 100%)
        await processDocumentAsync(
          documentId,
          document.encryptedFilename,
          filename,
          mimeType,
          userId,
          document.metadata?.thumbnailUrl || null
        );

        // processDocumentAsync already emits COMPLETE (100%), no need to emit again

        const totalTime = Date.now() - startTime;
        console.log(`✅ [Worker] Completed in ${(totalTime / 1000).toFixed(1)}s: ${filename}`);

        return { success: true, documentId, processingTime: totalTime };
      } catch (error: any) {
        console.error(`❌ [Worker] Failed: ${filename}`, error.message);

        // processDocumentAsync already:
        // 1. Updated document status to 'failed'
        // 2. Emitted error via documentProgressService
        // Just re-throw to trigger BullMQ retry logic
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
  startDocumentWorker,
  stopDocumentWorker,
  addDocumentJob,
  getQueueStats,
};
