/**
 * Presentation Routes - STUBBED (controller removed)
 */

import express, { Request, Response } from 'express';
// REMOVED: presentationController - deleted controller
import { authenticateToken } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Stub routes - service removed
const stubResponse = (req: Request, res: Response) => {
  res.status(501).json({ error: 'Presentation service removed' });
};

router.post('/initialize', stubResponse);
router.get('/', stubResponse);
router.get('/:presentationId', stubResponse);
router.get('/:presentationId/view', stubResponse);
router.post('/:presentationId/slides/:slideId', stubResponse);
router.get('/:presentationId/export/:format', stubResponse);
router.delete('/:presentationId', stubResponse);

export default router;
