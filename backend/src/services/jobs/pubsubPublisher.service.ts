/**
 * Pub/Sub Publisher Service
 *
 * Publishes document processing jobs to GCP Pub/Sub topics.
 * Used when USE_GCP_WORKERS is enabled to route jobs to Cloud Run workers
 * instead of local BullMQ workers.
 */

import { PubSub, Topic } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';

// Job types
export type JobType = 'extract' | 'embed' | 'preview' | 'ocr';

// Storage location for GCS
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
    topicCache.set(topicName, pubsub.topic(topicName));
  }
  return topicCache.get(topicName)!;
}

/**
 * Publish a job to a Pub/Sub topic
 */
export async function publishJob(
  topicName: string,
  payload: WorkerJobPayload
): Promise<string> {
  const topic = getTopic(topicName);
  const data = Buffer.from(JSON.stringify(payload));

  const messageId = await topic.publishMessage({
    data,
    attributes: {
      jobType: payload.jobType,
      documentId: payload.documentId,
      userId: payload.userId,
    },
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

// Document info for bulk publishing
export interface DocumentJobInfo {
  documentId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
  filename?: string;
}

/**
 * Publish extract jobs for multiple documents (bulk upload)
 */
export async function publishExtractJobsBulk(
  documents: DocumentJobInfo[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Publish all jobs in parallel (Pub/Sub handles rate limiting)
  const publishPromises = documents.map(async doc => {
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
  });

  await Promise.all(publishPromises);
  return results;
}

/**
 * Check if Pub/Sub is available/configured
 */
export function isPubSubAvailable(): boolean {
  // Note: on Cloud Run / GCE, Application Default Credentials come from the
  // metadata server and do not require GOOGLE_APPLICATION_CREDENTIALS.
  return Boolean(env.USE_GCP_WORKERS && env.GCP_PROJECT_ID);
}
