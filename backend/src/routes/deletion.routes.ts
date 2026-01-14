/**
 * ═══════════════════════════════════════════════════════════════
 * DELETION ROUTES
 * ═══════════════════════════════════════════════════════════════
 *
 * Routes for the PERFECT DELETE system:
 * - POST /api/delete-jobs - Create deletion job
 * - GET /api/delete-jobs - List user's jobs
 * - GET /api/delete-jobs/:id - Get job progress
 * - POST /api/delete-jobs/:id/retry - Retry failed job
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import * as deletionController from '../controllers/deletion.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Create a deletion job (idempotent)
router.post('/', deletionController.createDeletionJob);

// List user's deletion jobs
router.get('/', deletionController.listJobs);

// Get specific job progress
router.get('/:id', deletionController.getJobProgress);

// Retry a failed job
router.post('/:id/retry', deletionController.retryJob);

export default router;
