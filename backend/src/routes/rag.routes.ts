import express from 'express';
import * as ragController from '../controllers/rag.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// RAG query endpoints
router.post('/query', ragController.queryWithRAG);
router.post('/query/stream', ragController.queryWithRAGStreaming); // SSE streaming endpoint
router.post('/follow-up', ragController.answerFollowUp);
router.get('/context/:contextId', ragController.getContext);

// Debug endpoints
// GET /api/rag/classify?text=your+query&language=en
// POST /api/rag/classify { query: "your query", language: "en" }
router.get('/classify', ragController.classifyIntent);
router.post('/classify', ragController.classifyIntent);

export default router;
