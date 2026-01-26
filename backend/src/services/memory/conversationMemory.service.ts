/**
 * Conversation Memory Service - MVP Implementation
 *
 * Stores and retrieves conversation context for multi-turn conversations.
 * MVP: In-memory storage with database fallback
 */

import prisma from '../../config/database';

/**
 * Per-message metadata for intent inheritance
 */
export interface MessageMetadata {
  intent?: string;
  confidence?: number;
  sourceDocumentIds?: string[];
}

export interface ConversationContext {
  conversationId: string;
  userId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    // P0 FIX: Per-message metadata for follow-up intent inheritance
    metadata?: MessageMetadata;
  }>;
  metadata: {
    lastIntent?: string;
    lastDocumentIds?: string[];
    lastFolderIds?: string[];
  };
}

export class ConversationMemoryService {
  private cache = new Map<string, ConversationContext>();
  private readonly maxMessages = 10; // Keep last 10 messages in context

  /**
   * Get conversation context
   */
  async getContext(conversationId: string): Promise<ConversationContext | null> {
    // Check cache first
    if (this.cache.has(conversationId)) {
      return this.cache.get(conversationId)!;
    }

    // Try to load from database
    try {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: this.maxMessages,
        select: {
          content: true,
          role: true,
          createdAt: true,
          metadata: true, // P0 FIX: Include metadata for follow-up intent inheritance
          conversation: {
            select: { userId: true },
          },
        },
      });

      if (messages.length === 0) {
        return null;
      }

      // P0 FIX: Parse metadata JSON string to object for intent retrieval
      const parsedMessages = messages.reverse().map(m => {
        // Parse metadata if it's a string (stored as JSON in DB)
        let parsedMetadata: any = undefined;
        if (m.metadata) {
          try {
            parsedMetadata = typeof m.metadata === 'string'
              ? JSON.parse(m.metadata)
              : m.metadata;
          } catch {
            // Ignore parse errors, metadata will be undefined
          }
        }
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.createdAt,
          // P0 FIX: Include intent in message for getLastIntentFromConversation
          metadata: parsedMetadata ? {
            intent: parsedMetadata.primaryIntent,
            confidence: parsedMetadata.confidence,
            sourceDocumentIds: parsedMetadata.sourceDocuments || parsedMetadata.sourceDocumentIds,
          } : undefined,
        };
      });

      // P1 FIX: Extract lastIntent and lastDocumentIds from the most recent assistant message
      // This ensures follow-up queries can access the previous turn's context
      let lastIntent: string | undefined;
      let lastDocumentIds: string[] | undefined;
      for (let i = parsedMessages.length - 1; i >= 0; i--) {
        const msg = parsedMessages[i];
        if (msg.role === 'assistant' && msg.metadata) {
          lastIntent = msg.metadata.intent;
          lastDocumentIds = msg.metadata.sourceDocumentIds;
          break; // Only need the most recent assistant message
        }
      }

      const context: ConversationContext = {
        conversationId,
        userId: messages[0].conversation?.userId || '',
        messages: parsedMessages,
        // P1 FIX: Populate metadata.lastIntent and lastDocumentIds from DB messages
        metadata: {
          lastIntent,
          lastDocumentIds,
        },
      };

      console.log(`[ConversationMemory] Loaded from DB: lastIntent=${lastIntent}, lastDocIds=${lastDocumentIds?.length || 0}`);

      this.cache.set(conversationId, context);
      return context;
    } catch {
      return null;
    }
  }

  /**
   * Update conversation context with new message
   * P0 FIX: Now accepts optional metadata for intent inheritance
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    messageMetadata?: { intent?: string; confidence?: number; sourceDocumentIds?: string[] }
  ): Promise<void> {
    let context = await this.getContext(conversationId);

    if (!context) {
      context = {
        conversationId,
        userId: '',
        messages: [],
        metadata: {},
      };
    }

    context.messages.push({
      role,
      content,
      timestamp: new Date(),
      // P0 FIX: Include metadata for follow-up intent inheritance
      metadata: messageMetadata,
    });

    // Keep only last N messages
    if (context.messages.length > this.maxMessages) {
      context.messages = context.messages.slice(-this.maxMessages);
    }

    this.cache.set(conversationId, context);
  }

  /**
   * P0 FIX: Invalidate cache to force fresh load from DB
   * Call this when messages are saved to DB to ensure next getContext loads fresh data
   */
  invalidateCache(conversationId: string): void {
    this.cache.delete(conversationId);
  }

  /**
   * Update metadata for conversation
   */
  async updateMetadata(
    conversationId: string,
    metadata: Partial<ConversationContext['metadata']>
  ): Promise<void> {
    const context = await this.getContext(conversationId);
    if (context) {
      context.metadata = { ...context.metadata, ...metadata };
      this.cache.set(conversationId, context);
    }
  }

  /**
   * Clear conversation context
   */
  clearContext(conversationId: string): void {
    this.cache.delete(conversationId);
  }
}

// Singleton removed - use container.getConversationMemory() instead

export default ConversationMemoryService;
