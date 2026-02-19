// src/services/app/historyApp.service.ts
import type { Request } from "express";
import type { Attachment } from "../../types/handlerResult.types";

import { ConversationContextService } from "../memory/conversationContext.service";
import { ConversationMemoryService } from "../memory/conversationMemory.service";

/**
 * HistoryAppService
 * Controller-facing facade for chat history.
 *
 * Goals:
 * - Provide ChatGPT-like thread list (title, last message preview, updatedAt, pinned)
 * - Provide message list per thread (for ChatScreen hydration)
 * - Provide search across history (titles + message text)
 *
 * NOTE: This service reads/writes through ConversationContextService / ConversationMemoryService.
 * If your storage is DB-based, swap the implementations there — keep this API stable.
 */

export interface HistoryThreadSummary {
  conversationId: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  pinned?: boolean;
  messageCount: number;
  lastMessagePreview?: string;
}

export interface HistoryMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  answerMode?: string | null;
  attachments?: Attachment[];
  meta?: Record<string, any>;
}

export interface ListThreadsParams {
  limit?: number;
  offset?: number;
  query?: string;
  pinnedOnly?: boolean;
}

export interface ListThreadsResult {
  total: number;
  threads: HistoryThreadSummary[];
}

export interface SearchHistoryParams {
  query: string;
  limit?: number;
  offset?: number;
  includeMessages?: boolean;
}

export interface SearchHistoryHit {
  conversationId: string;
  title: string;
  updatedAt: string;
  score: number;
  snippet: string;
  messageId?: string;
  role?: "user" | "assistant";
}

export interface SearchHistoryResult {
  total: number;
  hits: SearchHistoryHit[];
}

function sanitizeQuery(q: unknown, max = 300): string {
  return String(q ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function getActor(req: Request): { userId: string } {
  const anyReq: any = req as any;
  const userId =
    anyReq.user?.id ||
    anyReq.user?.userId ||
    anyReq.auth?.userId ||
    anyReq.session?.userId ||
    "guest";
  return { userId: String(userId) };
}

export class HistoryAppService {
  private readonly conversationContext =
    new ConversationContextService() as any;
  private readonly memory = new ConversationMemoryService() as any;

  /**
   * List conversation threads with ChatGPT-like titles.
   * - If title missing: derive from first user message (or a memory-derived label).
   * - updatedAt = last message timestamp.
   */
  async listThreads(
    req: Request,
    params: ListThreadsParams = {},
  ): Promise<ListThreadsResult> {
    const actor = getActor(req);

    const limit = clampInt(params.limit ?? 30, 1, 100);
    const offset = clampInt(params.offset ?? 0, 0, 10_000);
    const query = sanitizeQuery(params.query);
    const pinnedOnly = !!params.pinnedOnly;

    const threads = await this.conversationContext.listThreads({
      actor,
      limit,
      offset,
      query: query || null,
      pinnedOnly,
    });

    return {
      total: threads.total,
      threads: threads.items.map((t: any) => ({
        conversationId: t.conversationId,
        title: t.title,
        updatedAt: t.updatedAt,
        createdAt: t.createdAt,
        pinned: t.pinned,
        messageCount: t.messageCount,
        lastMessagePreview: t.lastMessagePreview,
      })),
    };
  }

  /**
   * Fetch all messages for a thread (for ChatScreen hydration).
   * - Returns in chronological order.
   * - Ensures each assistant message carries answerMode + attachments for UI rules.
   */
  async getThreadMessages(
    req: Request,
    conversationId: string,
  ): Promise<HistoryMessage[]> {
    const actor = getActor(req);
    const id = String(conversationId || "").trim();
    if (!id) return [];

    const thread = await this.conversationContext.getThread({
      actor,
      conversationId: id,
    });

    if (!thread) return [];

    return (thread.messages || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      answerMode: m.answerMode ?? null,
      attachments: m.attachments || [],
      meta: m.meta || {},
    }));
  }

  /**
   * Search across thread titles + message text.
   * - Uses ConversationMemoryService for search index if available.
   * - Falls back to ConversationContextService scan if memory index not built.
   */
  async search(
    req: Request,
    params: SearchHistoryParams,
  ): Promise<SearchHistoryResult> {
    const actor = getActor(req);

    const q = sanitizeQuery(params.query, 400);
    if (!q) return { total: 0, hits: [] };

    const limit = clampInt(params.limit ?? 30, 1, 100);
    const offset = clampInt(params.offset ?? 0, 0, 10_000);
    const includeMessages = params.includeMessages !== false;

    // Prefer memory index search (fast + ranked)
    const memIndex = await this.memory.searchHistory({
      actor,
      query: q,
      limit,
      offset,
      includeMessages,
    });

    if (memIndex && memIndex.hits) {
      return memIndex;
    }

    // Fallback: linear scan via context service
    const scan = await this.conversationContext.searchThreadsAndMessages({
      actor,
      query: q,
      limit,
      offset,
      includeMessages,
    });

    return scan;
  }

  /**
   * Pin/unpin a thread (ChatGPT-like).
   */
  async setPinned(
    req: Request,
    conversationId: string,
    pinned: boolean,
  ): Promise<{ ok: true }> {
    const actor = getActor(req);
    const id = String(conversationId || "").trim();
    if (!id) return { ok: true };

    await this.conversationContext.setPinned({
      actor,
      conversationId: id,
      pinned: !!pinned,
    });

    return { ok: true };
  }

  /**
   * Rename a thread (manual user rename).
   * ChatGPT-like: allow user override.
   */
  async rename(
    req: Request,
    conversationId: string,
    title: string,
  ): Promise<{ ok: true }> {
    const actor = getActor(req);
    const id = String(conversationId || "").trim();
    const t = sanitizeQuery(title, 90);

    if (!id || !t) return { ok: true };

    await this.conversationContext.renameThread({
      actor,
      conversationId: id,
      title: t,
    });

    return { ok: true };
  }

  /**
   * Delete a thread.
   */
  async deleteThread(
    req: Request,
    conversationId: string,
  ): Promise<{ ok: true }> {
    const actor = getActor(req);
    const id = String(conversationId || "").trim();
    if (!id) return { ok: true };

    await this.conversationContext.deleteThread({
      actor,
      conversationId: id,
    });

    // Also remove memory index artifacts (if any)
    await this.memory.deleteConversationMemory({
      actor,
      conversationId: id,
    });

    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clampInt(value: number, min: number, max: number): number {
  const v = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, v));
}

// Export singleton getter
let _historyApp: HistoryAppService | null = null;
export function getHistoryAppService(): HistoryAppService {
  if (!_historyApp) _historyApp = new HistoryAppService();
  return _historyApp;
}
