import { Router, Request, Response } from 'express';
// REMOVED: tagController - deleted controller
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Stub routes - service removed
const stubResponse = (req: Request, res: Response) => {
  res.status(501).json({ error: 'Tag service removed' });
};

router.post('/', stubResponse);
router.get('/', stubResponse);
router.post('/add-to-document', stubResponse);
router.post('/remove-from-document', stubResponse);
router.delete('/:id', stubResponse);
router.get('/:id/documents', stubResponse);

export default router;
