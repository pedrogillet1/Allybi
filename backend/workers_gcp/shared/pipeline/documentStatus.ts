/**
 * Document Status Management
 *
 * Manages per-stage status updates for documents in the processing pipeline.
 */

import { getPrisma } from '../db';
import { logger } from '../logger';
import type { StageStatus } from '../types/jobs';

export type ProcessingStage = 'extract' | 'embed' | 'preview' | 'ocr';

/**
 * Update a specific stage status for a document
 */
export async function setStageStatus(
  documentId: string,
  stage: ProcessingStage,
  status: StageStatus,
  options?: {
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
  }
): Promise<void> {
  const prisma = getPrisma();

  const updateData: Record<string, unknown> = {};

  // Stage-specific fields (extractStatus, embedStatus, etc.) may not exist
  // in the current Prisma schema.  Log the transition and only write fields
  // that are guaranteed to exist.
  if (options?.error && status === 'failed') {
    updateData.error = options.error;
  }

  logger.info('Stage status transition', { documentId, stage, status });

  // Only write to DB if we have schema-safe fields (e.g. error)
  if (Object.keys(updateData).length === 0) return;

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: updateData,
    });
  } catch (error) {
    logger.warn('Failed to update stage status (field may not exist in schema)', {
      documentId,
      stage,
      status,
      error: error instanceof Error ? error.message : String(error),
    });
    // Do not throw — stage-level fields are optional enhancements
  }
}

/**
 * Mark a stage as started (running)
 */
export async function markStageStarted(
  documentId: string,
  stage: ProcessingStage
): Promise<void> {
  await setStageStatus(documentId, stage, 'running', {
    startedAt: new Date(),
  });
}

/**
 * Mark a stage as completed (ready)
 */
export async function markStageCompleted(
  documentId: string,
  stage: ProcessingStage
): Promise<void> {
  await setStageStatus(documentId, stage, 'ready', {
    completedAt: new Date(),
  });
}

/**
 * Mark a stage as failed
 */
export async function markStageFailed(
  documentId: string,
  stage: ProcessingStage,
  error: string
): Promise<void> {
  await setStageStatus(documentId, stage, 'failed', {
    error,
    completedAt: new Date(),
  });
}

/**
 * Mark a stage as skipped (e.g., no OCR needed for text documents)
 */
export async function markStageSkipped(
  documentId: string,
  stage: ProcessingStage
): Promise<void> {
  await setStageStatus(documentId, stage, 'skipped', {
    completedAt: new Date(),
  });
}

/**
 * Update document to indexed status when embeddings are ready
 * This makes the document queryable by AI
 */
export async function markQueryableIfEmbedded(documentId: string): Promise<void> {
  const prisma = getPrisma();

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { embeddingsGenerated: true, status: true },
    });

    if (!doc) {
      logger.warn('Document not found for queryable check', { documentId });
      return;
    }

    if (doc.embeddingsGenerated && doc.status !== 'ready' && doc.status !== 'indexed') {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'indexed' },
      });
      logger.info('Document marked as indexed (queryable)', { documentId });
    }
  } catch (error) {
    logger.error('Failed to mark document as queryable', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Update document to ready status when all stages complete
 */
export async function markReadyIfComplete(documentId: string): Promise<void> {
  const prisma = getPrisma();

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { status: true, embeddingsGenerated: true, chunksCount: true },
    });

    if (!doc) {
      logger.warn('Document not found for ready check', { documentId });
      return;
    }

    // Use existing schema fields to determine readiness
    const hasChunks = (doc.chunksCount ?? 0) > 0;
    const hasEmbeddings = doc.embeddingsGenerated;

    if (hasChunks && hasEmbeddings && doc.status !== 'ready') {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'ready' },
      });
      logger.info('Document marked as ready', { documentId });
    }
  } catch (error) {
    logger.error('Failed to mark document as ready', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Atomically claim a document for processing (prevents duplicate processing)
 */
export async function claimDocumentForProcessing(
  documentId: string,
  fromStatus: string
): Promise<boolean> {
  const prisma = getPrisma();

  try {
    const result = await prisma.document.updateMany({
      where: {
        id: documentId,
        status: fromStatus,
      },
      data: {
        status: 'enriching',
      },
    });

    return result.count > 0;
  } catch (error) {
    logger.error('Failed to claim document', {
      documentId,
      fromStatus,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
