/**
 * Chat Controller V1
 *
 * Clean REST API endpoints for chat functionality
 */

import { Request, Response } from 'express';
import chatService from '../services/chat.service';
import prisma from '../config/database';
import { getContainer } from '../bootstrap/container';
// cacheService now accessed via getContainer().getCache()

// ============================================================================
// Conversation Endpoints
// ============================================================================

/**
 * POST /api/chat/conversations
 * Create a new conversation
 */
export const createConversation = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { title } = req.body;

    const conversation = await chatService.createConversation({
      userId,
      title,
    });

    res.status(201).json(conversation);
  } catch (error: any) {
    console.error('[Chat] Create conversation error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/chat/conversations
 * Get all conversations for user
 */
export const getConversations = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Try cache first
    const cacheKey = getContainer().getCache().generateKey('conversations_list', userId);
    const cached = await getContainer().getCache().get<any>(cacheKey);

    if (cached) {
      res.json(cached);
      return;
    }

    const conversations = await chatService.getUserConversations(userId);

    // Cache for 2 minutes
    await getContainer().getCache().set(cacheKey, conversations, { ttl: 120 });

    res.json(conversations);
  } catch (error: any) {
    console.error('[Chat] Get conversations error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/chat/conversations/:conversationId
 * Get single conversation with messages
 */
export const getConversation = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;

    // Try cache first
    const cacheKey = getContainer().getCache().generateKey('conversation', conversationId, userId);
    const cached = await getContainer().getCache().get<any>(cacheKey);

    if (cached) {
      res.json(cached);
      return;
    }

    const conversation = await chatService.getConversation(conversationId, userId);

    // Cache for 1 minute
    await getContainer().getCache().set(cacheKey, conversation, { ttl: 60 });

    res.json(conversation);
  } catch (error: any) {
    console.error('[Chat] Get conversation error:', error);
    if (error.message === 'Conversation not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

/**
 * DELETE /api/chat/conversations/:conversationId
 * Delete a conversation
 */
export const deleteConversation = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;

    await chatService.deleteConversation(conversationId, userId);

    // Invalidate caches
    const cacheKey = getContainer().getCache().generateKey('conversation', conversationId, userId);
    const listCacheKey = getContainer().getCache().generateKey('conversations_list', userId);
    await getContainer().getCache().set(cacheKey, null, { ttl: 0 });
    await getContainer().getCache().set(listCacheKey, null, { ttl: 0 });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Chat] Delete conversation error:', error);
    if (error.message === 'Conversation not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

/**
 * DELETE /api/chat/conversations
 * Delete all conversations for user
 */
export const deleteAllConversations = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await chatService.deleteAllConversations(userId);

    // Invalidate cache
    const listCacheKey = getContainer().getCache().generateKey('conversations_list', userId);
    await getContainer().getCache().set(listCacheKey, null, { ttl: 0 });

    res.json(result);
  } catch (error: any) {
    console.error('[Chat] Delete all conversations error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// Message Endpoints
// ============================================================================

/**
 * POST /api/chat/conversations/:conversationId/messages
 * Send a message
 */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;
    const { content, attachedDocumentId, answerLength } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const result = await chatService.sendMessage({
      userId,
      conversationId,
      content,
      attachedDocumentId,
    });

    // Invalidate cache
    const cacheKey = getContainer().getCache().generateKey('conversation', conversationId, userId);
    await getContainer().getCache().set(cacheKey, null, { ttl: 0 });

    res.json(result);
  } catch (error: any) {
    console.error('[Chat] Send message error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/chat/conversations/:conversationId/messages
 * Get messages for a conversation
 */
export const getMessages = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;

    // Verify access
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (error: any) {
    console.error('[Chat] Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// Utility Endpoints
// ============================================================================

/**
 * POST /api/chat/regenerate-titles
 * Regenerate conversation titles
 */
export const regenerateTitles = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await chatService.regenerateConversationTitles(userId);

    res.json(result);
  } catch (error: any) {
    console.error('[Chat] Regenerate titles error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// Export
// ============================================================================

export default {
  createConversation,
  getConversations,
  getConversation,
  deleteConversation,
  deleteAllConversations,
  sendMessage,
  getMessages,
  regenerateTitles,
};
