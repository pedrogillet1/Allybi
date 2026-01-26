import express from 'express';
import { getInitialData, batchUpdateDocuments } from '../controllers/batch.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = express.Router();

/**
 * Batch API Routes
 * Combines multiple API calls into single requests
 */

// Get all initial data (documents + folders + recent) in one request
router.get('/initial-data', authenticateToken, getInitialData);

// Batch update multiple documents
router.post('/update-documents', authenticateToken, batchUpdateDocuments);

export default router;
