import { Router, Request, Response } from 'express';
// REMOVED: memory.service - deleted service
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Stub routes - service removed
const stubResponse = (req: Request, res: Response) => {
  res.status(501).json({ error: 'Memory service removed' });
};

router.get('/', stubResponse);
router.post('/', stubResponse);
router.delete('/:id', stubResponse);

export default router;
