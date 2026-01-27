/**
 * Prisma-based ChatService implementation.
 * Implements the interface expected by ChatController.
 *
 * - listConversations / listMessages / setTitle: fully functional via Prisma
 * - chat / streamChat: stub until orchestrator is wired
 */

import prisma from '../config/database';
import type {
  ChatService,
  ChatTurnResult,
  ChatStreamEvent,
  AnswerMode,
  Lang,
} from '../controllers/chat.controller';

export class PrismaChatService implements ChatService {
  async chat(input: {
    userId: string;
    conversationId?: string;
    message: string;
    regenCount?: number;
    clientMessageId?: string;
    lang?: Lang;
  }): Promise<ChatTurnResult> {
    // Ensure conversation exists
    let conversationId = input.conversationId;
    if (!conversationId) {
      const convo = await prisma.conversation.create({
        data: {
          userId: input.userId,
          title: input.message.slice(0, 60) || 'New Chat',
        },
      });
      conversationId = convo.id;
    }

    // Persist user message
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: input.message,
      },
    });

    // Stub assistant response (orchestrator not wired yet)
    const assistantMsg = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: 'The AI engine is not yet connected. This is a placeholder response.',
      },
    });

    // Touch conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      conversationId,
      messageId: assistantMsg.id,
      answerMode: 'general_answer' as AnswerMode,
      content: assistantMsg.content,
      attachments: [],
      meta: {},
    };
  }

  async *streamChat(input: {
    userId: string;
    conversationId?: string;
    message: string;
    regenCount?: number;
    clientMessageId?: string;
    lang?: Lang;
    signal?: AbortSignal;
  }): AsyncGenerator<ChatStreamEvent> {
    // For now, do a non-streaming call and emit as final
    const result = await this.chat(input);

    yield {
      type: 'final',
      data: {
        conversationId: result.conversationId,
        messageId: result.messageId,
        content: result.content,
        answerMode: result.answerMode,
        attachments: result.attachments ?? [],
      },
    };
  }

  async listConversations(input: {
    userId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    items: Array<{ conversationId: string; title: string; updatedAt: string }>;
    nextCursor?: string;
  }> {
    const limit = Math.min(input.limit ?? 30, 100);

    const conversations = await prisma.conversation.findMany({
      where: { userId: input.userId, isDeleted: false },
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
    });

    const hasMore = conversations.length > limit;
    const items = (hasMore ? conversations.slice(0, limit) : conversations).map((c) => ({
      conversationId: c.id,
      title: c.title,
      updatedAt: c.updatedAt.toISOString(),
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.conversationId : undefined,
    };
  }

  async listMessages(input: {
    userId: string;
    conversationId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    items: Array<{
      messageId: string;
      role: 'user' | 'assistant';
      content: string;
      createdAt: string;
      answerMode?: AnswerMode;
      attachments?: any[];
    }>;
    nextCursor?: string;
  }> {
    const limit = Math.min(input.limit ?? 50, 200);

    // Verify conversation belongs to user
    const convo = await prisma.conversation.findFirst({
      where: { id: input.conversationId, userId: input.userId, isDeleted: false },
    });
    if (!convo) return { items: [] };

    const messages = await prisma.message.findMany({
      where: { conversationId: input.conversationId },
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true, metadata: true },
    });

    const hasMore = messages.length > limit;
    const items = (hasMore ? messages.slice(0, limit) : messages).map((m) => ({
      messageId: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.messageId : undefined,
    };
  }

  async setTitle(input: {
    userId: string;
    conversationId: string;
    title: string;
  }): Promise<{ conversationId: string; title: string }> {
    const convo = await prisma.conversation.findFirst({
      where: { id: input.conversationId, userId: input.userId, isDeleted: false },
    });
    if (!convo) throw new Error('Conversation not found');

    const updated = await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { title: input.title },
    });

    return { conversationId: updated.id, title: updated.title };
  }
}
