import { Router } from 'express';

import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';
import { createEditingController } from '../controllers/editing.controller';

const router = Router();
const controller = createEditingController();

// Optional non-chat editing endpoints.
router.post('/plan', authMiddleware, rateLimitMiddleware, (req, res) => controller.plan(req, res));
router.post('/preview', authMiddleware, rateLimitMiddleware, (req, res) => controller.preview(req, res));
router.post('/apply', authMiddleware, rateLimitMiddleware, (req, res) => controller.apply(req, res));
router.post('/undo', authMiddleware, rateLimitMiddleware, (req, res) => controller.undo(req, res));

export default router;
