/**
 * Chat Service V3
 *
 * Clean implementation using V3 RAG pipeline:
 * - Conversation management (CRUD)
 * - Message handling via KodaOrchestratorV3
 * - Title generation
 */

import prisma from '../config/database';
import { generateConversationTitle } from './openai.service';
import { OrchestratorRequest } from './core/kodaOrchestratorV3.service';
import { getOrchestrator } from '../bootstrap/container';
import { LanguageCode } from '../types/intentV3.types';
import cacheService from './cache.service';

// V3 Orchestrator - get from container (properly injected)
const getOrchestratorInstance = () => getOrchestrator();

// ============================================================================
// Types
// ============================================================================

interface CreateConversationParams {
  userId: string;
  title?: string;
}

interface SendMessageParams {
  userId: string;
  conversationId: string;
  content: string;
  attachedDocumentId?: string;
  language?: 'en' | 'pt' | 'es';
}

interface MessageResult {
  userMessage: any;
  assistantMessage: any;
  sources?: any[];
}

// ============================================================================
// Conversation Management
// ============================================================================

/**
 * Create a new conversation
 */
async function createConversation(params: CreateConversationParams) {
  const { userId, title = 'New Chat' } = params;

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return conversation;
}

/**
 * Get user's conversations
 */
async function getUserConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { messages: true } },
    },
  });

  return conversations;
}

/**
 * Get single conversation with messages
 */
async function getConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  return conversation;
}

/**
 * Delete a conversation
 */
async function deleteConversation(conversationId: string, userId: string) {
  // Verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Delete messages first (cascade)
  await prisma.message.deleteMany({
    where: { conversationId },
  });

  // Delete conversation
  await prisma.conversation.delete({
    where: { id: conversationId },
  });

  return { success: true };
}

/**
 * Delete all conversations for user
 */
async function deleteAllConversations(userId: string) {
  // Get all conversation IDs
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    select: { id: true },
  });

  const conversationIds = conversations.map((c) => c.id);

  // Delete all messages
  await prisma.message.deleteMany({
    where: { conversationId: { in: conversationIds } },
  });

  // Delete all conversations
  await prisma.conversation.deleteMany({
    where: { userId },
  });

  return { success: true, deletedCount: conversationIds.length };
}

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Send a message and get AI response
 */
async function sendMessage(params: SendMessageParams): Promise<MessageResult> {
  const { userId, conversationId, content, attachedDocumentId, language = 'en' } = params;

  // Save user message
  const userMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'user',
      content,
      metadata: attachedDocumentId ? JSON.stringify({ attachedFiles: [attachedDocumentId] }) : null,
    },
  });

  // Build V3 RAG request
  const request: OrchestratorRequest = {
    userId,
    text: content,
    language: language as LanguageCode,
    conversationId,
    context: attachedDocumentId ? { attachedDocumentIds: [attachedDocumentId] } : undefined,
  };

  // Get AI response via V3 orchestrator
  const response = await getOrchestrator().orchestrate(request);

  // Extract sources from response - FIX: actually use the citation data
  const sourceDocumentIds = response.metadata?.sourceDocumentIds || [];
  const citations = response.citations || [];
  const documentsUsed = response.metadata?.documentsUsed || 0;

  // Save assistant message with full citation metadata
  const assistantMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'assistant',
      content: response.answer,
      metadata: JSON.stringify({
        primaryIntent: response.metadata?.intent,
        language: request.language,
        sourceDocuments: sourceDocumentIds,
        citations,
        documentsUsed,
        confidenceScore: response.metadata?.confidence,
      }),
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Generate title if first message
  const messageCount = await prisma.message.count({ where: { conversationId } });
  if (messageCount <= 2) {
    try {
      const title = await generateConversationTitle(content);
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      });
    } catch (err) {
      console.warn('[Chat] Title generation failed:', err);
    }
  }

  // Invalidate cache
  const cacheKey = cacheService.generateKey('conversation', conversationId, userId);
  await cacheService.set(cacheKey, null, { ttl: 0 });

  return {
    userMessage,
    assistantMessage,
    sources: citations,
  };
}

/**
 * Send message with streaming callback
 */
async function sendMessageStreaming(
  params: SendMessageParams,
  onChunk: (chunk: string) => void
): Promise<MessageResult> {
  const { userId, conversationId, content, attachedDocumentId, language = 'en' } = params;

  // Save user message
  const userMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'user',
      content,
    },
  });

  // Build V3 RAG request
  const request: OrchestratorRequest = {
    userId,
    text: content,
    language: language as LanguageCode,
    conversationId,
    context: attachedDocumentId ? { attachedDocumentIds: [attachedDocumentId] } : undefined,
  };

  // TRUE STREAMING: Use orchestrator's async generator
  const stream = getOrchestrator().orchestrateStream(request);

  let fullAnswer = '';
  let streamResult: {
    intent?: string;
    confidence?: number;
    documentsUsed?: number;
    citations?: any[];
    sourceDocumentIds?: string[];
  } = {};

  // Use manual iteration to capture the 'done' event with full metadata
  // (for await...of doesn't give access to events other than content)
  let iterResult = await stream.next();
  while (!iterResult.done) {
    const event = iterResult.value;
    if (event.type === 'content') {
      fullAnswer += (event as any).content;
      onChunk((event as any).content);  // Forward to callback immediately
    } else if (event.type === 'done') {
      // Capture done event metadata including citations - FIX: persist all metadata
      const doneEvent = event as any;
      fullAnswer = doneEvent.fullAnswer || fullAnswer;
      streamResult = {
        intent: doneEvent.intent,
        confidence: doneEvent.confidence,
        documentsUsed: doneEvent.documentsUsed,
        citations: doneEvent.citations,
        sourceDocumentIds: doneEvent.sourceDocumentIds,
      };
    }
    iterResult = await stream.next();
  }

  // Also capture generator return value as fallback
  if (iterResult.done && iterResult.value) {
    const returnValue = iterResult.value;
    fullAnswer = returnValue.fullAnswer || fullAnswer;
    if (!streamResult.intent) {
      streamResult = {
        ...streamResult,
        intent: returnValue.intent,
        confidence: returnValue.confidence,
        documentsUsed: returnValue.documentsUsed,
        citations: returnValue.citations,
      };
    }
  }

  // Save assistant message with full citation metadata - FIX: include citations
  const assistantMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'assistant',
      content: fullAnswer,
      metadata: JSON.stringify({
        primaryIntent: streamResult.intent,
        confidence: streamResult.confidence,
        sourceDocuments: streamResult.sourceDocumentIds || [],
        citations: streamResult.citations || [],
        documentsUsed: streamResult.documentsUsed || 0,
      }),
    },
  });

  // Update conversation
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return {
    userMessage,
    assistantMessage,
    sources: streamResult.citations || [],
  };
}

/**
 * Regenerate conversation titles
 */
async function regenerateConversationTitles(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      userId,
      title: 'New Chat',
    },
    include: {
      messages: {
        where: { role: 'user' },
        take: 1,
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  let regenerated = 0;

  for (const conv of conversations) {
    if (conv.messages.length > 0) {
      try {
        const title = await generateConversationTitle(conv.messages[0].content || '');
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { title },
        });
        regenerated++;
      } catch (err) {
        console.warn(`[Chat] Failed to regenerate title for ${conv.id}:`, err);
      }
    }
  }

  return { regenerated, total: conversations.length };
}

// ============================================================================
// Export
// ============================================================================

const chatService = {
  createConversation,
  getUserConversations,
  getConversation,
  deleteConversation,
  deleteAllConversations,
  sendMessage,
  sendMessageStreaming,
  regenerateConversationTitles,
};

export default chatService;
export {
  createConversation,
  getUserConversations,
  getConversation,
  deleteConversation,
  deleteAllConversations,
  sendMessage,
  sendMessageStreaming,
  regenerateConversationTitles,
};
