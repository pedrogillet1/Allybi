import { Queue, Worker, type Job } from 'bullmq';

import { config } from '../../config/env';
import type { EditorPatch } from './editorState.service';

export interface EditorPatchJobData {
  sessionId: string;
  userId: string;
  documentId: string;
  patch: EditorPatch;
  correlationId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

function buildConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password || undefined,
        tls: url.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      // fall through
    }
  }

  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

const connection = buildConnection();
const prefix = process.env.QUEUE_PREFIX || (process.env.NODE_ENV === 'production' ? '' : 'dev-');
const queueName = `${prefix}editor-patch`;

export class EditorPatchQueueService {
  private readonly queue = new Queue<EditorPatchJobData>(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 2000, age: 24 * 3600 },
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  });

  private worker: Worker<EditorPatchJobData> | null = null;

  async enqueue(data: EditorPatchJobData): Promise<{ jobId: string }> {
    const job = await this.queue.add('apply-editor-patch', data, {
      jobId: `editorPatch:${data.sessionId}:${data.patch.patchId}:${Date.now()}`,
    });
    return { jobId: job.id as string };
  }

  startWorker(handler: (job: Job<EditorPatchJobData>) => Promise<void>): void {
    if (this.worker) return;
    this.worker = new Worker<EditorPatchJobData>(queueName, handler, {
      connection,
      concurrency: Number(process.env.EDITOR_PATCH_WORKER_CONCURRENCY || 3),
    });
  }

  async stopWorker(): Promise<void> {
    if (!this.worker) return;
    await this.worker.close();
    this.worker = null;
  }

  async getStats(): Promise<{ waiting: number; active: number; completed: number; failed: number }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }
}

