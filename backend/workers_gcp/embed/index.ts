/**
 * Embed Worker
 *
 * Cloud Run worker for generating embeddings from extracted text.
 * Receives Pub/Sub push messages and processes documents.
 *
 * Pipeline: Fetch chunks → Generate embeddings → Store in Pinecone + Postgres → Mark queryable
 */

import express, { Request, Response } from 'express';
import { getConfig } from '../shared/config';
import { getPrisma, disconnectPrisma } from '../shared/db';
import { logger, createLogger } from '../shared/logger';
import { decodePubSubMessage, isValidPubSubEnvelope } from '../shared/pubsub';
import { parseWorkerPayload, validateJobType } from '../shared/validate';
import { withRetry } from '../shared/retry';
import {
  markStageStarted,
  markStageCompleted,
  markStageFailed,
  markQueryableIfEmbedded,
  markReadyIfComplete,
} from '../shared/pipeline/documentStatus';
import { PipelineError, wrapError, fatalError, retryableError } from '../shared/pipeline/errors';
import type { WorkerJobPayload, WorkerResult } from '../shared/types/jobs';
import OpenAI from 'openai';

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const config = getConfig();
    openaiClient = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Pinecone client (lazy init)
let pineconeIndex: any = null;

async function getPineconeIndex() {
  if (!pineconeIndex) {
    const config = getConfig();
    const { Pinecone } = await import('@pinecone-database/pinecone');
    const client = new Pinecone({
      apiKey: config.PINECONE_API_KEY,
    });
    pineconeIndex = client.index(config.PINECONE_INDEX_NAME);
  }
  return pineconeIndex;
}

interface ChunkToEmbed {
  chunkIndex: number;
  content: string;
  pageNumber?: number;
}

interface EmbeddingResult {
  chunkIndex: number;
  embedding: number[];
}

/**
 * Generate embeddings for a batch of texts using OpenAI
 */
async function generateEmbeddings(
  texts: string[],
  jobLogger: ReturnType<typeof createLogger>
): Promise<EmbeddingResult[]> {
  const config = getConfig();
  const openai = getOpenAI();

  // OpenAI supports up to 2048 texts per batch
  const MAX_BATCH_SIZE = 256;
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const batchIndices = batch.map((_, idx) => i + idx);

    jobLogger.info('Generating embeddings batch', {
      batchStart: i,
      batchSize: batch.length,
      totalTexts: texts.length,
    });

    const response = await withRetry(
      async () => {
        return openai.embeddings.create({
          model: config.OPENAI_EMBEDDING_MODEL,
          input: batch,
          dimensions: config.OPENAI_EMBEDDING_DIMENSIONS,
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        maxDelayMs: 30000,
        onRetry: (attempt, error) => {
          jobLogger.warn(`OpenAI embedding retry ${attempt}`, { error: error.message });
        },
      }
    );

    for (let j = 0; j < response.data.length; j++) {
      results.push({
        chunkIndex: batchIndices[j],
        embedding: response.data[j].embedding,
      });
    }
  }

  return results;
}

/**
 * Store embeddings in Pinecone
 */
async function storeInPinecone(
  documentId: string,
  userId: string,
  chunks: ChunkToEmbed[],
  embeddings: EmbeddingResult[],
  documentMeta: { filename?: string; mimeType?: string; folderId?: string },
  jobLogger: ReturnType<typeof createLogger>
): Promise<void> {
  const index = await getPineconeIndex();

  // Build vectors for upsert
  const vectors = embeddings.map((emb, idx) => {
    const chunk = chunks[emb.chunkIndex];
    return {
      id: `${documentId}-${emb.chunkIndex}`,
      values: emb.embedding,
      metadata: {
        documentId,
        userId,
        chunkIndex: emb.chunkIndex,
        pageNumber: chunk?.pageNumber,
        filename: documentMeta.filename || '',
        mimeType: documentMeta.mimeType || '',
        folderId: documentMeta.folderId || '',
        // Truncate content for metadata (Pinecone has 40KB limit)
        content: chunk?.content?.slice(0, 1000) || '',
      },
    };
  });

  // Upsert in batches of 100
  const PINECONE_BATCH_SIZE = 100;
  for (let i = 0; i < vectors.length; i += PINECONE_BATCH_SIZE) {
    const batch = vectors.slice(i, i + PINECONE_BATCH_SIZE);

    await withRetry(
      async () => {
        await index.upsert(batch);
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          jobLogger.warn(`Pinecone upsert retry ${attempt}`, { error: error.message });
        },
      }
    );

    jobLogger.info('Pinecone batch upserted', {
      batchStart: i,
      batchSize: batch.length,
      totalVectors: vectors.length,
    });
  }
}

/**
 * Store embeddings in Postgres
 */
async function storeInPostgres(
  documentId: string,
  chunks: ChunkToEmbed[],
  embeddings: EmbeddingResult[],
  jobLogger: ReturnType<typeof createLogger>
): Promise<void> {
  const prisma = getPrisma();

  // Clear old embeddings
  await prisma.documentEmbedding.deleteMany({
    where: { documentId },
  });

  // Insert new embeddings in batches
  const BATCH_SIZE = 100;
  const records = embeddings.map(emb => {
    const chunk = chunks[emb.chunkIndex];
    return {
      documentId,
      chunkIndex: emb.chunkIndex,
      content: chunk?.content || '',
      embedding: JSON.stringify(emb.embedding),
      metadata: JSON.stringify({
        pageNumber: chunk?.pageNumber,
      }),
      pageNumber: chunk?.pageNumber,
    };
  });

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await prisma.documentEmbedding.createMany({
      data: batch,
      skipDuplicates: true,
    });

    jobLogger.info('Postgres batch inserted', {
      batchStart: i,
      batchSize: batch.length,
      totalRecords: records.length,
    });
  }
}

/**
 * Process an embedding job
 */
async function processEmbedJob(payload: WorkerJobPayload): Promise<WorkerResult> {
  const startTime = Date.now();
  const jobLogger = createLogger({ traceId: payload.jobId });
  const prisma = getPrisma();

  jobLogger.info('Starting embed job', {
    documentId: payload.documentId,
  });

  try {
    // Mark stage as started
    await markStageStarted(payload.documentId, 'embed');

    // Fetch document and chunks
    const doc = await prisma.document.findUnique({
      where: { id: payload.documentId },
      select: {
        id: true,
        userId: true,
        filename: true,
        mimeType: true,
        folderId: true,
        status: true,
      },
    });

    if (!doc) {
      throw fatalError('DOCUMENT_NOT_FOUND', `Document ${payload.documentId} not found`);
    }

    // Fetch chunks from database
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: payload.documentId },
      orderBy: { chunkIndex: 'asc' },
      select: {
        chunkIndex: true,
        text: true,
        page: true,
      },
    });

    if (chunks.length === 0) {
      jobLogger.info('No chunks to embed, skipping');
      await markStageCompleted(payload.documentId, 'embed');
      await markQueryableIfEmbedded(payload.documentId);

      return {
        success: true,
        documentId: payload.documentId,
        jobType: 'embed',
        durationMs: Date.now() - startTime,
        embeddingsGenerated: 0,
      };
    }

    // Prepare chunks for embedding
    const chunksToEmbed: ChunkToEmbed[] = chunks
      .filter(c => c.text && c.text.trim().length > 0)
      .map(c => ({
        chunkIndex: c.chunkIndex,
        content: c.text!,
        pageNumber: c.page || undefined,
      }));

    if (chunksToEmbed.length === 0) {
      jobLogger.info('No valid text to embed');
      await markStageCompleted(payload.documentId, 'embed');
      await markQueryableIfEmbedded(payload.documentId);

      return {
        success: true,
        documentId: payload.documentId,
        jobType: 'embed',
        durationMs: Date.now() - startTime,
        embeddingsGenerated: 0,
      };
    }

    jobLogger.info('Generating embeddings', { chunkCount: chunksToEmbed.length });

    // Generate embeddings
    const embeddingStart = Date.now();
    const texts = chunksToEmbed.map(c => c.content);
    const embeddings = await generateEmbeddings(texts, jobLogger);
    const embeddingMs = Date.now() - embeddingStart;

    jobLogger.info('Embeddings generated', {
      count: embeddings.length,
      durationMs: embeddingMs,
    });

    // Store in both Pinecone and Postgres in parallel
    const storeStart = Date.now();
    await Promise.all([
      storeInPinecone(
        payload.documentId,
        doc.userId,
        chunksToEmbed,
        embeddings,
        { filename: doc.filename || undefined, mimeType: doc.mimeType, folderId: doc.folderId || undefined },
        jobLogger
      ).catch(err => {
        // Pinecone is optional - log but don't fail
        jobLogger.warn('Pinecone storage failed (continuing)', { error: err.message });
      }),
      storeInPostgres(payload.documentId, chunksToEmbed, embeddings, jobLogger),
    ]);
    const storeMs = Date.now() - storeStart;

    jobLogger.info('Embeddings stored', { durationMs: storeMs });

    // Update document status
    await prisma.document.update({
      where: { id: payload.documentId },
      data: {
        embeddingsGenerated: true,
      },
    });

    // Mark stage complete
    await markStageCompleted(payload.documentId, 'embed');

    // Mark document as queryable (indexed status)
    await markQueryableIfEmbedded(payload.documentId);

    // Check if document is fully ready
    await markReadyIfComplete(payload.documentId);

    const durationMs = Date.now() - startTime;
    jobLogger.info('Embed job completed', {
      documentId: payload.documentId,
      durationMs,
      embeddingsGenerated: embeddings.length,
    });

    return {
      success: true,
      documentId: payload.documentId,
      jobType: 'embed',
      durationMs,
      embeddingsGenerated: embeddings.length,
    };
  } catch (error) {
    const pipelineError = wrapError(error, 'EMBEDDING_FAILED');

    jobLogger.error('Embed job failed', {
      documentId: payload.documentId,
      error: pipelineError.message,
      code: pipelineError.code,
      retryable: pipelineError.retryable,
    });

    await markStageFailed(payload.documentId, 'embed', pipelineError.message);

    return {
      success: false,
      documentId: payload.documentId,
      jobType: 'embed',
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
  res.status(200).json({ status: 'ok', worker: 'embed' });
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
    validateJobType(payload, 'embed');

    logger.info('Received embed job', {
      messageId: decoded.messageId,
      documentId: payload.documentId,
    });

    // Process the job
    const result = await processEmbedJob(payload);

    // Return appropriate status code based on result
    // - 200: Success, ACK the message
    // - 500: Retryable failure, NACK to trigger Pub/Sub retry
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('Embed job error', {
      error: err.message,
      durationMs: Date.now() - startTime,
    });

    const isValidationError = err.message.includes('Invalid') || err.message.includes('Expected job type');
    const isNotFound = err.message.includes('not found');
    // ACK validation errors and not-found (don't retry), NACK transient errors (retry)
    res.status(isValidationError || isNotFound ? 400 : 500).json({
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
  logger.info(`Embed worker listening on port ${config.PORT}`);
});

export default app;
