/**
 * Prisma-based ChatHistoryService implementation.
 * Implements the interface expected by HistoryController.
 */

import prisma from "../config/database";
import type {
  ChatHistoryService,
  ConversationSummary,
  ConversationDetail,
  ListConversationsResult,
} from "../controllers/history.controller";

export class PrismaHistoryService implements ChatHistoryService {
  async listConversations(args: {
    userId: string;
    limit: number;
    cursor?: string;
    pinnedOnly?: boolean;
    includeArchived?: boolean;
    q?: string;
  }): Promise<ListConversationsResult> {
    const limit = Math.min(args.limit, 50);
    const where: any = { userId: args.userId, isDeleted: false };

    if (args.pinnedOnly) where.isPinned = true;
    if (args.q) {
      where.title = { contains: args.q, mode: "insensitive" };
    }

    const conversations = await prisma.conversation.findMany({
      where,
      take: limit + 1,
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { content: true },
        },
      },
    });

    const hasMore = conversations.length > limit;
    const items: ConversationSummary[] = (
      hasMore ? conversations.slice(0, limit) : conversations
    ).map((c) => ({
      id: c.id,
      title: c.title ?? "New Chat",
      updatedAt: c.updatedAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      pinned: c.isPinned,
      visibility: c.isDeleted ? ("deleted" as const) : ("active" as const),
      messageCount: c._count.messages,
      lastMessagePreview:
        (c.messages[0]?.content ?? "")?.slice(0, 120) || undefined,
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    };
  }

  async getConversation(args: {
    userId: string;
    conversationId: string;
  }): Promise<ConversationDetail | null> {
    const convo = await prisma.conversation.findFirst({
      where: { id: args.conversationId, userId: args.userId, isDeleted: false },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, role: true, content: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
    });

    if (!convo) return null;

    return {
      id: convo.id,
      title: convo.title ?? "New Chat",
      updatedAt: convo.updatedAt.toISOString(),
      createdAt: convo.createdAt.toISOString(),
      pinned: convo.isPinned,
      visibility: "active",
      messageCount: convo._count.messages,
      messages: convo.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: m.content ?? "",
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async updateConversation(args: {
    userId: string;
    conversationId: string;
    patch: Partial<
      Pick<ConversationSummary, "title" | "pinned" | "visibility">
    >;
  }): Promise<ConversationSummary> {
    // Verify ownership
    const existing = await prisma.conversation.findFirst({
      where: { id: args.conversationId, userId: args.userId },
    });
    if (!existing) throw new Error("Conversation not found");

    const data: any = {};
    if (args.patch.title !== undefined) data.title = args.patch.title;
    if (args.patch.pinned !== undefined) data.isPinned = args.patch.pinned;
    if (args.patch.visibility === "deleted") {
      data.isDeleted = true;
      data.deletedAt = new Date();
    } else if (args.patch.visibility === "active") {
      data.isDeleted = false;
      data.deletedAt = null;
    }

    const updated = await prisma.conversation.update({
      where: { id: args.conversationId },
      data,
      include: { _count: { select: { messages: true } } },
    });

    return {
      id: updated.id,
      title: updated.title ?? "New Chat",
      updatedAt: updated.updatedAt.toISOString(),
      createdAt: updated.createdAt.toISOString(),
      pinned: updated.isPinned,
      visibility: updated.isDeleted ? "deleted" : "active",
      messageCount: updated._count.messages,
    };
  }

  async deleteConversation(args: {
    userId: string;
    conversationId: string;
  }): Promise<{ deleted: true }> {
    const existing = await prisma.conversation.findFirst({
      where: { id: args.conversationId, userId: args.userId },
    });
    if (!existing) throw new Error("Conversation not found");

    // Soft delete
    await prisma.conversation.update({
      where: { id: args.conversationId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { deleted: true };
  }

  async searchConversations(args: {
    userId: string;
    q: string;
    limit: number;
  }): Promise<ConversationSummary[]> {
    const limit = Math.min(args.limit, 50);

    // Search in titles and message content
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: args.userId,
        isDeleted: false,
        OR: [
          { title: { contains: args.q, mode: "insensitive" } },
          {
            messages: {
              some: { content: { contains: args.q, mode: "insensitive" } },
            },
          },
        ],
      },
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title ?? "New Chat",
      updatedAt: c.updatedAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      pinned: c.isPinned,
      visibility: "active" as const,
      messageCount: c._count.messages,
    }));
  }
}
