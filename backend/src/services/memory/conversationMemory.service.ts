/**
 * Conversation Memory Service
 *
 * Bounded in-memory cache with TTL plus database fallback.
 */

import prisma from "../../config/database";
import { getBankLoaderInstance } from "../core/banks/bankLoader.service";

export interface MessageMetadata {
  intent?: string;
  confidence?: number;
  sourceDocumentIds?: string[];
}

export interface ConversationContext {
  conversationId: string;
  userId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    metadata?: MessageMetadata;
  }>;
  metadata: {
    lastIntent?: string;
    lastDocumentIds?: string[];
    lastFolderIds?: string[];
  };
}

type CacheEntry = {
  context: ConversationContext;
  expiresAtMs: number;
  touchedAtMs: number;
};

export class ConversationMemoryService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxMessages: number;
  private readonly maxConversations: number;
  private readonly cacheTtlMs: number;

  constructor() {
    const bank = getBankLoaderInstance().getBank<any>("memory_policy");
    const runtime = bank?.config?.runtimeTuning || {};

    const maxMessages = Number(runtime.inMemoryMessageCacheLimit);
    if (!Number.isFinite(maxMessages) || maxMessages <= 0) {
      throw new Error(
        "memory_policy.config.runtimeTuning.inMemoryMessageCacheLimit is required",
      );
    }
    this.maxMessages = Math.floor(maxMessages);

    const maxConversations = Number(runtime.inMemoryConversationCacheLimit);
    this.maxConversations =
      Number.isFinite(maxConversations) && maxConversations > 0
        ? Math.floor(maxConversations)
        : 1200;

    const ttlSeconds = Number(runtime.inMemoryCacheTtlSeconds);
    this.cacheTtlMs =
      Number.isFinite(ttlSeconds) && ttlSeconds > 0
        ? Math.floor(ttlSeconds * 1000)
        : 15 * 60 * 1000;
  }

  private cacheKey(userId: string, conversationId: string): string {
    return `${String(userId || "").trim()}:${String(conversationId || "").trim()}`;
  }

  private readCache(cacheKey: string): ConversationContext | null {
    const now = Date.now();
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAtMs <= now) {
      this.cache.delete(cacheKey);
      return null;
    }
    entry.touchedAtMs = now;
    return entry.context;
  }

  private writeCache(cacheKey: string, context: ConversationContext): void {
    const now = Date.now();
    this.cache.set(cacheKey, {
      context,
      expiresAtMs: now + this.cacheTtlMs,
      touchedAtMs: now,
    });
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxConversations) return;
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].touchedAtMs - b[1].touchedAtMs,
    );
    while (this.cache.size > this.maxConversations && entries.length > 0) {
      const next = entries.shift();
      if (!next) break;
      this.cache.delete(next[0]);
    }
  }

  async getContext(
    conversationId: string,
    userId = "",
  ): Promise<ConversationContext | null> {
    const key = this.cacheKey(userId, conversationId);
    const cached = this.readCache(key);
    if (cached) return cached;

    try {
      const messages = await prisma.message.findMany({
        where: userId
          ? {
              conversationId,
              conversation: { userId },
            }
          : { conversationId },
        orderBy: { createdAt: "desc" },
        take: this.maxMessages,
        select: {
          content: true,
          role: true,
          createdAt: true,
          metadata: true,
          conversation: {
            select: { userId: true },
          },
        },
      });

      if (messages.length === 0) return null;

      const parsedMessages = messages.reverse().map((m) => {
        let parsedMetadata: any = undefined;
        if (m.metadata) {
          try {
            parsedMetadata =
              typeof m.metadata === "string"
                ? JSON.parse(m.metadata)
                : m.metadata;
          } catch (err: unknown) {
            console.warn("[conversation-memory] metadata parse failed", { error: (err as Error)?.message ?? String(err) });
          }
        }

        return {
          role: m.role as "user" | "assistant",
          content: m.content ?? "",
          timestamp: m.createdAt,
          metadata: parsedMetadata
            ? {
                intent: parsedMetadata.primaryIntent,
                confidence: parsedMetadata.confidence,
                sourceDocumentIds:
                  parsedMetadata.sourceDocuments ||
                  parsedMetadata.sourceDocumentIds,
              }
            : undefined,
        };
      });

      let lastIntent: string | undefined;
      let lastDocumentIds: string[] | undefined;
      for (let i = parsedMessages.length - 1; i >= 0; i--) {
        const msg = parsedMessages[i];
        if (msg.role !== "assistant" || !msg.metadata) continue;
        lastIntent = msg.metadata.intent;
        lastDocumentIds = msg.metadata.sourceDocumentIds;
        break;
      }

      const context: ConversationContext = {
        conversationId,
        userId: userId || messages[0].conversation?.userId || "",
        messages: parsedMessages,
        metadata: {
          lastIntent,
          lastDocumentIds,
        },
      };

      this.writeCache(key, context);
      return context;
    } catch (err: unknown) {
      console.error("[conversation-memory] DB query failed", { conversationId, error: (err as Error)?.message ?? String(err) });
      return null;
    }
  }

  async addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    messageMetadata?: {
      intent?: string;
      confidence?: number;
      sourceDocumentIds?: string[];
    },
    userId = "",
  ): Promise<void> {
    let context = await this.getContext(conversationId, userId);
    if (!context) {
      context = {
        conversationId,
        userId,
        messages: [],
        metadata: {},
      };
    }

    context.messages.push({
      role,
      content,
      timestamp: new Date(),
      metadata: messageMetadata,
    });

    if (context.messages.length > this.maxMessages) {
      context.messages = context.messages.slice(-this.maxMessages);
    }

    this.writeCache(this.cacheKey(userId, conversationId), context);
  }

  invalidateCache(conversationId: string, userId = ""): void {
    if (userId) {
      this.cache.delete(this.cacheKey(userId, conversationId));
      return;
    }
    for (const key of Array.from(this.cache.keys())) {
      if (key.endsWith(`:${conversationId}`)) {
        this.cache.delete(key);
      }
    }
  }

  async updateMetadata(
    conversationId: string,
    metadata: Partial<ConversationContext["metadata"]>,
    userId = "",
  ): Promise<void> {
    const context = await this.getContext(conversationId, userId);
    if (!context) return;
    context.metadata = { ...context.metadata, ...metadata };
    this.writeCache(this.cacheKey(userId, conversationId), context);
  }

  clearContext(conversationId: string, userId = ""): void {
    this.invalidateCache(conversationId, userId);
  }

  getStats(): {
    activeConversations: number;
    maxConversations: number;
    maxMessages: number;
    cacheTtlMs: number;
  } {
    return {
      activeConversations: this.cache.size,
      maxConversations: this.maxConversations,
      maxMessages: this.maxMessages,
      cacheTtlMs: this.cacheTtlMs,
    };
  }
}

export default ConversationMemoryService;
