/**
 * Conversation Memory Service - MVP Implementation
 *
 * Stores and retrieves conversation context for multi-turn conversations.
 * MVP: In-memory storage with database fallback
 */

import prisma from '../../config/database';

export interface ConversationContext {
  conversationId: string;
  userId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
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
          conversation: {
            select: { userId: true },
          },
        },
      });

      if (messages.length === 0) {
        return null;
      }

      const context: ConversationContext = {
        conversationId,
        userId: messages[0].conversation?.userId || '',
        messages: messages.reverse().map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.createdAt,
        })),
        metadata: {},
      };

      this.cache.set(conversationId, context);
      return context;
    } catch {
      return null;
    }
  }

  /**
   * Update conversation context with new message
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
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
    });

    // Keep only last N messages
    if (context.messages.length > this.maxMessages) {
      context.messages = context.messages.slice(-this.maxMessages);
    }

    this.cache.set(conversationId, context);
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
