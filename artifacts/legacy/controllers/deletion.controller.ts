/**
 * ═══════════════════════════════════════════════════════════════
 * DELETION CONTROLLER
 * ═══════════════════════════════════════════════════════════════
 *
 * Handles HTTP endpoints for the PERFECT DELETE system:
 * - POST /api/delete-jobs - Create deletion job (returns 202)
 * - GET /api/delete-jobs/:id - Get job progress
 * - GET /api/delete-jobs - List user's jobs
 * - POST /api/delete-jobs/:id/retry - Retry failed job
 */

import { Request, Response } from 'express';
import deletionService from '../services/deletion.service';
import { DeletionTargetType } from '@prisma/client';

/**
 * Create a deletion job (idempotent)
 * Returns 202 Accepted with jobId for async processing
 */
export const createDeletionJob = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { targetType, targetId, targetName } = req.body;

    if (!targetType || !targetId) {
      res.status(400).json({ error: 'targetType and targetId are required' });
      return;
    }

    if (targetType !== 'document' && targetType !== 'folder') {
      res.status(400).json({ error: 'targetType must be "document" or "folder"' });
      return;
    }

    const { job, isExisting } = await deletionService.createDeletionJob(
      req.user.id,
      targetType as DeletionTargetType,
      targetId,
      targetName
    );

    // Return 202 Accepted for new jobs, 200 for existing
    const statusCode = isExisting ? 200 : 202;

    res.status(statusCode).json({
      message: isExisting ? 'Deletion job already exists' : 'Deletion job created',
      jobId: job.id,
      status: job.status,
      targetType: job.targetType,
      targetId: job.targetId,
      targetName: job.targetName,
      progress: {
        docsTotal: job.docsTotal,
        docsDone: job.docsDone,
        foldersTotal: job.foldersTotal,
        foldersDone: job.foldersDone,
      },
      isExisting,
    });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [DeletionController] Create job error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get deletion job progress
 */
export const getJobProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const progress = await deletionService.getJobProgress(id, req.user.id);

    if (!progress) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.status(200).json(progress);
  } catch (error) {
    const err = error as Error;
    console.error('❌ [DeletionController] Get progress error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * List user's deletion jobs
 */
export const listJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { status } = req.query;

    const jobs = await deletionService.getUserJobs(
      req.user.id,
      status as any
    );

    res.status(200).json({ jobs });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [DeletionController] List jobs error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Retry a failed deletion job
 */
export const retryJob = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const job = await deletionService.retryJob(id, req.user.id);

    if (!job) {
      res.status(404).json({ error: 'Job not found or not in failed state' });
      return;
    }

    res.status(202).json({
      message: 'Retry scheduled',
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    const err = error as Error;
    console.error('❌ [DeletionController] Retry job error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

export default {
  createDeletionJob,
  getJobProgress,
  listJobs,
  retryJob,
};
