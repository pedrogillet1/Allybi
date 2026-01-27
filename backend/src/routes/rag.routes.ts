/**
 * RAG Routes
 * Uses the singleton ragController which resolves its orchestrator from app.locals.
 */
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { ragController } from '../controllers/rag.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// RAG query (non-streaming)
router.post('/query', ragController.query);

// RAG query (SSE streaming)
router.post('/query/stream', ragController.stream);

export default router;
