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

type ConversationCursor = { id: string; updatedAt: Date };

function encodeConversationCursor(row: {
  id: string;
  updatedAt: Date | string;
}): string {
  const payload = JSON.stringify({
    id: row.id,
    updatedAt: new Date(row.updatedAt).toISOString(),
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeConversationCursor(raw: string): ConversationCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { id?: unknown; updatedAt?: unknown };
    if (typeof parsed?.id !== "string") return null;
    if (typeof parsed?.updatedAt !== "string") return null;
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return null;
    return { id: parsed.id, updatedAt };
  } catch {
    return null;
  }
}

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
    const filters: any[] = [{ userId: args.userId }];

    if (!args.includeArchived) filters.push({ isDeleted: false });
    if (args.pinnedOnly) filters.push({ isPinned: true });
    if (args.q) {
      filters.push({ title: { contains: args.q, mode: "insensitive" } });
    }

    let decodedCursor = args.cursor
      ? decodeConversationCursor(args.cursor)
      : null;
    if (args.cursor && !decodedCursor) {
      const anchor = await prisma.conversation.findFirst({
        where: {
          userId: args.userId,
          id: args.cursor,
          ...(args.includeArchived ? {} : { isDeleted: false }),
        },
        select: { id: true, updatedAt: true },
      });
      if (anchor) decodedCursor = { id: anchor.id, updatedAt: anchor.updatedAt };
    }
    if (decodedCursor) {
      filters.push({
        OR: [
          { updatedAt: { lt: decodedCursor.updatedAt } },
          {
            AND: [
              { updatedAt: decodedCursor.updatedAt },
              { id: { lt: decodedCursor.id } },
            ],
          },
        ],
      });
    }

    const conversations = await prisma.conversation.findMany({
      where: { AND: filters },
      take: limit + 1,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
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
    const page = hasMore ? conversations.slice(0, limit) : conversations;
    const items: ConversationSummary[] = page.map((c) => ({
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
      nextCursor:
        hasMore && page.length > 0
          ? encodeConversationCursor(page[page.length - 1])
          : undefined,
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
