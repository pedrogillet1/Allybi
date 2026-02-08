/**
 * Pub/Sub Publisher Service
 *
 * Publishes document processing jobs to GCP Pub/Sub topics.
 * Used when USE_GCP_WORKERS is enabled to route jobs to Cloud Run workers
 * instead of local BullMQ workers.
 */

import { PubSub, Topic } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';
import { env } from '../../config/env';

// Job types
export type JobType = 'extract' | 'extract_fanout' | 'embed' | 'preview' | 'ocr';

// Storage location — Cloud Run workers use GCS natively.
export interface StorageLocation {
  provider: 'gcs';
  bucket: string;
  key: string;
}

// Job payload structure (matches worker expectations)
export interface WorkerJobPayload {
  jobType: JobType;
  jobId: string;
  userId: string;
  documentId: string;
  mimeType: string;
  storage: StorageLocation;
  langHint?: string;
  attempt?: number;
  filename?: string;
}

// Document info for bulk publishing
export interface DocumentJobInfo {
  documentId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
  filename?: string;
}

// Fanout payload: publish one message containing many documents, then a fanout
// worker publishes individual extract messages (so heavy processing can scale-out safely).
export interface ExtractFanoutPayload {
  jobType: 'extract_fanout';
  jobId: string;
  requestId?: string;
  uploadSessionId?: string;
  documents: DocumentJobInfo[];
}

// Pub/Sub client singleton
let pubsubClient: PubSub | null = null;
const topicCache = new Map<string, Topic>();

/**
 * Get or create Pub/Sub client
 */
function getPubSub(): PubSub {
  if (!pubsubClient) {
    const projectId = env.GCP_PROJECT_ID;

    // Support multiple credential methods
    if (env.GOOGLE_VISION_CREDENTIALS_B64) {
      const decoded = Buffer.from(env.GOOGLE_VISION_CREDENTIALS_B64, 'base64').toString('utf8');
      const creds = JSON.parse(decoded);
      pubsubClient = new PubSub({
        projectId: projectId || creds.project_id,
        credentials: creds,
      });
    } else if (env.GOOGLE_VISION_CREDENTIALS_JSON) {
      const creds = JSON.parse(env.GOOGLE_VISION_CREDENTIALS_JSON);
      pubsubClient = new PubSub({
        projectId: projectId || creds.project_id,
        credentials: creds,
      });
    } else {
      // Default credentials chain
      pubsubClient = new PubSub({ projectId });
    }
  }
  return pubsubClient;
}

/**
 * Get cached topic reference
 */
function getTopic(topicName: string): Topic {
  if (!topicCache.has(topicName)) {
    const pubsub = getPubSub();
    // Enable client-side batching for higher throughput with fewer RPCs.
    // These env vars are optional and safe in all environments.
    const maxMessages = Number(process.env.PUBSUB_BATCH_MAX_MESSAGES || 100);
    const maxMilliseconds = Number(process.env.PUBSUB_BATCH_MAX_MS || 10);
    const maxBytes = Number(process.env.PUBSUB_BATCH_MAX_BYTES || 1024 * 1024); // 1 MiB

    topicCache.set(
      topicName,
      pubsub.topic(topicName, {
        batching: { maxMessages, maxMilliseconds, maxBytes },
      })
    );
  }
  return topicCache.get(topicName)!;
}

/**
 * Publish a job to a Pub/Sub topic
 */
export async function publishJob(
  topicName: string,
  payload: WorkerJobPayload | ExtractFanoutPayload
): Promise<string> {
  const topic = getTopic(topicName);
  const data = Buffer.from(JSON.stringify(payload));

  const attributes: Record<string, string> = {
    jobType: payload.jobType,
  };

  if ((payload as any).requestId) attributes.requestId = String((payload as any).requestId);
  if ((payload as any).uploadSessionId) attributes.uploadSessionId = String((payload as any).uploadSessionId);

  if ((payload as any).documentId) {
    attributes.documentId = String((payload as any).documentId);
    attributes.userId = String((payload as any).userId);
  } else if ((payload as any).documents?.length) {
    // Best-effort attributes for fanout batches (use first doc for userId).
    attributes.batchSize = String((payload as any).documents.length);
    const first = (payload as any).documents[0];
    if (first?.userId) attributes.userId = String(first.userId);
  }

  const messageId = await topic.publishMessage({
    data,
    attributes,
  });

  return messageId;
}

/**
 * Create storage location from a storage key
 */
function createStorageLocation(storageKey: string): StorageLocation {
  return {
    provider: 'gcs',
    bucket: env.GCS_BUCKET_NAME,
    key: storageKey,
  };
}

/**
 * Publish an extract job
 */
export async function publishExtractJob(
  documentId: string,
  userId: string,
  storageKey: string,
  mimeType: string,
  filename?: string
): Promise<string> {
  const payload: WorkerJobPayload = {
    jobType: 'extract',
    jobId: uuidv4(),
    userId,
    documentId,
    mimeType,
    storage: createStorageLocation(storageKey),
    filename,
  };

  const topicName = env.PUBSUB_EXTRACT_TOPIC || 'koda-doc-extract';
  return publishJob(topicName, payload);
}

/**
 * Publish a fanout batch (one message containing many documents).
 */
export async function publishExtractFanoutBatch(
  documents: DocumentJobInfo[],
  opts?: { requestId?: string; uploadSessionId?: string }
): Promise<string> {
  const payload: ExtractFanoutPayload = {
    jobType: 'extract_fanout',
    jobId: uuidv4(),
    requestId: opts?.requestId,
    uploadSessionId: opts?.uploadSessionId,
    documents,
  };

  const topicName = env.PUBSUB_EXTRACT_FANOUT_TOPIC || 'koda-doc-extract-fanout';
  return publishJob(topicName, payload);
}

/**
 * Publish an embed job
 */
export async function publishEmbedJob(
  documentId: string,
  userId: string
): Promise<string> {
  const payload: WorkerJobPayload = {
    jobType: 'embed',
    jobId: uuidv4(),
    userId,
    documentId,
    mimeType: '', // Not needed for embed - chunks already in DB
    storage: createStorageLocation(''), // Not needed for embed
  };

  const topicName = env.PUBSUB_EMBED_TOPIC || 'koda-doc-embed';
  return publishJob(topicName, payload);
}

/**
 * Publish a preview job
 */
export async function publishPreviewJob(
  documentId: string,
  userId: string,
  storageKey: string,
  mimeType: string,
  filename?: string
): Promise<string> {
  const payload: WorkerJobPayload = {
    jobType: 'preview',
    jobId: uuidv4(),
    userId,
    documentId,
    mimeType,
    storage: createStorageLocation(storageKey),
    filename,
  };

  const topicName = env.PUBSUB_PREVIEW_TOPIC || 'koda-doc-preview';
  return publishJob(topicName, payload);
}

/**
 * Publish an OCR job
 */
export async function publishOcrJob(
  documentId: string,
  userId: string,
  storageKey: string,
  mimeType: string,
  langHint?: string
): Promise<string> {
  const payload: WorkerJobPayload = {
    jobType: 'ocr',
    jobId: uuidv4(),
    userId,
    documentId,
    mimeType,
    storage: createStorageLocation(storageKey),
    langHint,
  };

  const topicName = env.PUBSUB_OCR_TOPIC || 'koda-doc-ocr';
  return publishJob(topicName, payload);
}

/**
 * Publish extract jobs for multiple documents (bulk upload)
 */
export async function publishExtractJobsBulk(
  documents: DocumentJobInfo[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  const publishConcurrency = Number(process.env.PUBSUB_PUBLISH_CONCURRENCY || 25);
  const limit = pLimit(Math.max(1, publishConcurrency));

  await Promise.all(
    documents.map((doc) =>
      limit(async () => {
        try {
          const messageId = await publishExtractJob(
            doc.documentId,
            doc.userId,
            doc.storageKey,
            doc.mimeType,
            doc.filename
          );
          results.set(doc.documentId, messageId);
        } catch (error) {
          console.error(`[PubSub] Failed to publish extract job for ${doc.documentId}:`, error);
          results.set(doc.documentId, 'error');
        }
      })
    )
  );

  return results;
}

/**
 * Publish extract fanout jobs in batches (recommended for large folder uploads).
 * Reduces API-server publish overhead dramatically.
 */
export async function publishExtractFanoutJobsBulk(
  documents: DocumentJobInfo[],
  opts?: { requestId?: string; uploadSessionId?: string }
): Promise<{ publishedBatches: number; publishedDocs: number; messageIds: string[] }> {
  if (documents.length === 0) return { publishedBatches: 0, publishedDocs: 0, messageIds: [] };

  const batchSize = Number(process.env.PUBSUB_FANOUT_BATCH_SIZE || 200);
  const publishConcurrency = Number(process.env.PUBSUB_FANOUT_PUBLISH_CONCURRENCY || 10);
  const limit = pLimit(Math.max(1, publishConcurrency));

  const batches: DocumentJobInfo[][] = [];
  for (let i = 0; i < documents.length; i += batchSize) {
    batches.push(documents.slice(i, i + batchSize));
  }

  const messageIds = await Promise.all(
    batches.map((batch) =>
      limit(() => publishExtractFanoutBatch(batch, opts))
    )
  );

  return { publishedBatches: batches.length, publishedDocs: documents.length, messageIds };
}

/**
 * Check if Pub/Sub is available/configured
 */
export function isPubSubAvailable(): boolean {
  // Note: on Cloud Run / GCE, Application Default Credentials come from the
  // metadata server and do not require GOOGLE_APPLICATION_CREDENTIALS.
  return Boolean(env.USE_GCP_WORKERS && env.GCP_PROJECT_ID);
}
