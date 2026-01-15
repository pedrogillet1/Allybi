/**
 * Multipart Upload Routes
 * API routes for S3 multipart upload operations
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { uploadLimiter } from '../middleware/rateLimit.middleware';
import {
  initMultipartUpload,
  completeMultipartUploadHandler,
  abortMultipartUploadHandler,
  getUploadConfig,
  getUploadStatus,
  getPartUrls,
} from '../controllers/multipart-upload.controller';

const router = Router();

// Get upload configuration (public - needed before auth for client setup)
router.get('/config', getUploadConfig);

// All other routes require authentication
router.use(authenticateToken);

// Initialize multipart upload
router.post('/init', uploadLimiter, initMultipartUpload);

// Complete multipart upload
router.post('/complete', completeMultipartUploadHandler);

// Abort multipart upload
router.post('/abort', abortMultipartUploadHandler);

// Get upload status (for resumable uploads)
router.get('/status/:documentId', getUploadStatus);

// Get presigned URLs for specific parts (for resumable uploads)
router.post('/urls', getPartUrls);

export default router;
