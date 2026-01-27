/**
 * Chat History Routes
 * Uses the singleton historyController which resolves its service from app.locals.
 */
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { historyController } from '../controllers/history.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// List conversations
router.get('/', historyController.listConversations);

// Search conversations
router.get('/search', historyController.searchConversations);

// Get single conversation
router.get('/:conversationId', historyController.getConversation);

// Update conversation (title, pinned, visibility)
router.patch('/:conversationId', historyController.updateConversation);

// Delete conversation
router.delete('/:conversationId', historyController.deleteConversation);

// Generate title for conversation
router.post('/:conversationId/title', historyController.generateTitle);

export default router;
