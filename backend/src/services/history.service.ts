/**
 * Chat History Service - World-Class UX
 *
 * Implements Manus AI Integration Guide #8:
 * - Automatic conversation titling using LLM
 * - Full-text search across all conversations
 * - Pinning important conversations
 * - Soft delete with recovery
 * - AI-generated summaries
 */

import prisma from '../config/database';
import geminiGateway from './geminiGateway.service';

/**
 * Generate an AI title for a conversation based on its messages
 * Uses Gemini for fast, cost-effective title generation
 */
export async function generateConversationTitle(
  conversationId: string
): Promise<string> {
  try {
    // Get the first 3-4 messages of the conversation
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 4,
      select: {
        role: true,
        content: true,
      },
    });

    if (messages.length === 0) {
      return 'New Chat';
    }

    // Build a prompt for the LLM
    const conversationText = messages
      .map((msg) => `${msg.role}: ${msg.content.substring(0, 200)}`)
      .join('\n');


    const prompt = `Generate a concise, descriptive title (3-6 words) for this conversation. Be specific and capture the main topic. Do not use quotes or punctuation at the end.

Conversation:
${conversationText}`;
    const title = await geminiGateway.quickGenerate(prompt, { temperature: 0.3, maxTokens: 20 });
    if (!title) return 'New Chat';


    // Update the conversation with the generated title
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });

    console.log(`✅ Generated title for conversation ${conversationId}: "${title}"`);
    return title;
  } catch (error) {
    console.error('❌ Failed to generate conversation title:', error);
    return 'New Chat';
  }
}

/**
 * Generate an AI summary for a conversation
 * Called when a conversation has many messages to help with search and organization
 */
export async function generateConversationSummary(
  conversationId: string
): Promise<string | null> {
  try {
    // Get all messages in the conversation
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        content: true,
      },
    });

    if (messages.length < 5) {
      return null; // Don't generate summary for short conversations
    }

    // Build conversation text (limit to ~2000 characters)
    const conversationText = messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n')
      .substring(0, 2000);


    const prompt = `Summarize this conversation in 1-2 sentences. Focus on the key topics, questions, and outcomes. Be concise and factual.

${conversationText}`;
    const summary = await geminiGateway.quickGenerate(prompt, { temperature: 0.3, maxTokens: 100 });


    if (summary) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { summary },
      });

      console.log(`✅ Generated summary for conversation ${conversationId}`);
    }

    return summary;
  } catch (error) {
    console.error('❌ Failed to generate conversation summary:', error);
    return null;
  }
}

/**
 * Search conversations using full-text search
 * Uses PostgreSQL's pg_trgm extension for trigram similarity search
 */
export async function searchConversations(
  userId: string,
  query: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  title: string;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  relevance: number;
}>> {
  try {
    // Search in conversation titles, summaries, and message content
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        summary: string | null;
        createdAt: Date;
        updatedAt: Date;
        messageCount: bigint;
        relevance: number;
      }>
    >`
      SELECT DISTINCT ON (c.id)
        c.id,
        c.title,
        c.summary,
        c."createdAt",
        c."updatedAt",
        COUNT(m.id) as "messageCount",
        GREATEST(
          similarity(c.title, ${query}),
          COALESCE(similarity(c.summary, ${query}), 0),
          MAX(similarity(m.content, ${query}))
        ) as relevance
      FROM conversations c
      LEFT JOIN messages m ON m."conversationId" = c.id
      WHERE c."userId" = ${userId}
        AND c."isDeleted" = false
        AND (
          c.title % ${query}
          OR c.summary % ${query}
          OR m.content % ${query}
        )
      GROUP BY c.id, c.title, c.summary, c."createdAt", c."updatedAt"
      HAVING GREATEST(
        similarity(c.title, ${query}),
        COALESCE(similarity(c.summary, ${query}), 0),
        MAX(similarity(m.content, ${query}))
      ) > 0.1
      ORDER BY c.id, relevance DESC
      LIMIT ${limit};
    `;

    return results.map((r) => ({
      ...r,
      messageCount: Number(r.messageCount),
    }));
  } catch (error) {
    console.error('❌ Search conversations failed:', error);
    return [];
  }
}

/**
 * Get conversation history with smart filtering
 * Returns pinned conversations first, then sorted by recent activity
 */
export async function getConversationHistory(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    includeDeleted?: boolean;
  } = {}
): Promise<Array<{
  id: string;
  title: string;
  summary: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  lastMessage?: {
    role: string;
    content: string;
    createdAt: Date;
  };
}>> {
  const { limit = 50, offset = 0, includeDeleted = false } = options;

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        userId,
        isDeleted: includeDeleted ? undefined : false,
      },
      orderBy: [
        { isPinned: 'desc' }, // Pinned conversations first
        { updatedAt: 'desc' }, // Then by most recent
      ],
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        summary: true,
        isPinned: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            role: true,
            content: true,
            createdAt: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    return conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      summary: conv.summary,
      isPinned: conv.isPinned,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv._count.messages,
      lastMessage: conv.messages[0],
    }));
  } catch (error) {
    console.error('❌ Failed to get conversation history:', error);
    return [];
  }
}

/**
 * Pin a conversation to the top
 */
export async function pinConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  try {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        userId,
      },
      data: {
        isPinned: true,
      },
    });

    console.log(`📌 Pinned conversation ${conversationId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to pin conversation:', error);
    return false;
  }
}

/**
 * Unpin a conversation
 */
export async function unpinConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  try {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        userId,
      },
      data: {
        isPinned: false,
      },
    });

    console.log(`📌 Unpinned conversation ${conversationId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to unpin conversation:', error);
    return false;
  }
}

/**
 * Soft delete a conversation
 * Sets isDeleted flag and deletedAt timestamp without actually removing data
 */
export async function softDeleteConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  try {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        userId,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    console.log(`🗑️ Soft deleted conversation ${conversationId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to soft delete conversation:', error);
    return false;
  }
}

/**
 * Restore a soft-deleted conversation
 */
export async function restoreConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  try {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        userId,
      },
      data: {
        isDeleted: false,
        deletedAt: null,
      },
    });

    console.log(`♻️ Restored conversation ${conversationId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to restore conversation:', error);
    return false;
  }
}

/**
 * Permanently delete old conversations
 * Should be called by a cron job to clean up conversations deleted > 30 days ago
 */
export async function permanentlyDeleteOldConversations(
  daysOld: number = 30
): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.conversation.deleteMany({
      where: {
        isDeleted: true,
        deletedAt: {
          lte: cutoffDate,
        },
      },
    });

    console.log(`🗑️ Permanently deleted ${result.count} old conversations`);
    return result.count;
  } catch (error) {
    console.error('❌ Failed to permanently delete old conversations:', error);
    return 0;
  }
}

/**
 * Auto-title conversations after a few messages
 * Called automatically after the 3rd message in a conversation
 */
export async function autoTitleConversation(
  conversationId: string
): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        title: true,
        _count: {
          select: { messages: true },
        },
      },
    });

    // Only auto-title if still has default title and has 3+ messages
    if (
      conversation &&
      conversation.title === 'New Chat' &&
      conversation._count.messages >= 3
    ) {
      await generateConversationTitle(conversationId);
    }
  } catch (error) {
    console.error('❌ Failed to auto-title conversation:', error);
  }
}

export default {
  generateConversationTitle,
  generateConversationSummary,
  searchConversations,
  getConversationHistory,
  pinConversation,
  unpinConversation,
  softDeleteConversation,
  restoreConversation,
  permanentlyDeleteOldConversations,
  autoTitleConversation,
};
