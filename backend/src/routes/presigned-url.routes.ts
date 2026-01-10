import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  generateBulkPresignedUrls,
  completeBatchUpload,
  completeSingleDocument,
  retriggerStuckDocuments,
  reconcileOrphanedUploads
} from '../controllers/presigned-url.controller';

const router = express.Router();

// Generate presigned URLs for bulk upload
router.post('/bulk', authenticateToken, generateBulkPresignedUrls);

// Mark batch upload as complete
router.post('/complete', authenticateToken, completeBatchUpload);

// Complete single document and immediately enqueue for processing
// This enables per-file pipeline: upload finishes → processing starts immediately
router.post('/complete/:documentId', authenticateToken, completeSingleDocument);

// Retrigger processing for stuck documents
router.post('/retrigger-stuck', authenticateToken, retriggerStuckDocuments);

// Reconcile orphaned uploads after session ends
// INVARIANT: No DB records left in 'uploading' status after session ends
// - discovered = confirmed + failed + skipped
router.post('/reconcile', authenticateToken, reconcileOrphanedUploads);

export default router;
