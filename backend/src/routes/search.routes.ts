import { Router, Request, Response } from 'express';
// REMOVED: searchController - deleted controller
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Semantic search endpoint - stubbed
router.post('/semantic', authenticateToken, (req: Request, res: Response) => {
  res.status(501).json({ error: 'Search service removed' });
});

export default router;
