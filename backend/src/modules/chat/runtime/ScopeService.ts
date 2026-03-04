import type { DocumentStatus } from "@prisma/client";
import prisma from "../../../config/database";
import { getBankLoaderInstance } from "../../../services/core/banks/bankLoader.service";
import type { ChatRequest } from "../domain/chat.contracts";
import { ConversationNotFoundError } from "../domain/chat.contracts";
import { logger } from "../../../utils/logger";

type ScopeRuntimeConfig = {
  maxScopeDocs: number;
  clearScopeRegex: RegExp[];
  docStatusesAllowed: DocumentStatus[];
};

const KNOWN_DOCUMENT_STATUSES: ReadonlySet<DocumentStatus> = new Set([
  "ready",
  "indexed",
  "enriching",
  "available",
  "completed",
]);

function resolveScopeRuntimeConfig(): ScopeRuntimeConfig {
  const policyBank = getBankLoaderInstance().getBank<any>("memory_policy");
  const runtime = policyBank?.config?.runtimeTuning?.scopeRuntime;
  if (!runtime || typeof runtime !== "object") {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime is required",
    );
  }

  const maxScopeDocs = Number(runtime.maxScopeDocs);
  if (!Number.isFinite(maxScopeDocs) || maxScopeDocs <= 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.maxScopeDocs is required",
    );
  }

  const patterns = runtime.clearScopePatterns;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.clearScopePatterns is required",
    );
  }

  const clearScopeRegex = patterns.map((pattern: unknown) => {
    const source = String(pattern || "").trim();
    if (!source) {
      throw new Error(
        "memory_policy.config.runtimeTuning.scopeRuntime.clearScopePatterns contains an empty pattern",
      );
    }
    try {
      return new RegExp(source, "i");
    } catch {
      throw new Error(
        `Invalid clear scope regex in memory_policy scopeRuntime: ${source}`,
      );
    }
  });

  const docStatusesAllowed = (
    Array.isArray(runtime.docStatusesAllowed) ? runtime.docStatusesAllowed : []
  )
    .map((status: unknown) =>
      String(status || "")
        .trim()
        .toLowerCase(),
    )
    .filter((status: string): status is DocumentStatus =>
      KNOWN_DOCUMENT_STATUSES.has(status as DocumentStatus),
    );
  if (docStatusesAllowed.length === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.docStatusesAllowed is required",
    );
  }

  return {
    maxScopeDocs: Math.floor(maxScopeDocs),
    clearScopeRegex,
    docStatusesAllowed,
  };
}

export class ScopeService {
  private readonly runtimeConfig = resolveScopeRuntimeConfig();

  private normalizeDocIds(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids || []) {
      const id = String(raw || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= this.runtimeConfig.maxScopeDocs) break;
    }
    return out;
  }

  async getConversationScope(
    userId: string,
    conversationId: string,
  ): Promise<string[]> {
    const row = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { scopeDocumentIds: true },
    });
    const ids = Array.isArray(row?.scopeDocumentIds)
      ? (row?.scopeDocumentIds as string[])
      : [];
    return this.normalizeDocIds(ids);
  }

  async setConversationScope(
    userId: string,
    conversationId: string,
    docIds: string[],
  ): Promise<void> {
    const requested = this.normalizeDocIds(docIds);
    const normalized = await this.getValidatedScopeDocIds(userId, requested);
    if (requested.length > normalized.length) {
      logger.warn("[scope-service] dropped invalid scope document ids", {
        userId,
        conversationId,
        requested: requested.length,
        accepted: normalized.length,
      });
    }
    const updated = await prisma.conversation.updateMany({
      where: { id: conversationId, userId, isDeleted: false },
      data: { scopeDocumentIds: normalized, updatedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new ConversationNotFoundError(
        "Conversation not found for this account.",
      );
    }
  }

  private async getValidatedScopeDocIds(
    userId: string,
    docIds: string[],
  ): Promise<string[]> {
    const normalized = this.normalizeDocIds(docIds);
    if (normalized.length === 0) return [];
    const rows = await prisma.document.findMany({
      where: {
        userId,
        id: { in: normalized },
        status: { in: this.runtimeConfig.docStatusesAllowed },
      },
      select: { id: true },
    });
    const allowed = new Set(
      rows
        .map((row) => String(row.id || "").trim())
        .filter((id): id is string => id.length > 0),
    );
    return normalized.filter((id) => allowed.has(id));
  }

  async clearConversationScope(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const updated = await prisma.conversation.updateMany({
      where: { id: conversationId, userId, isDeleted: false },
      data: { scopeDocumentIds: [], updatedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new ConversationNotFoundError(
        "Conversation not found for this account.",
      );
    }
  }

  shouldClearScope(req: ChatRequest): boolean {
    const explicit = Boolean((req.meta as any)?.clearScope);
    if (explicit) return true;

    const q = String(req.message || "").toLowerCase();
    return this.runtimeConfig.clearScopeRegex.some((pattern) =>
      pattern.test(q),
    );
  }

  attachedScope(req: ChatRequest): string[] {
    return this.normalizeDocIds(
      Array.isArray(req.attachedDocumentIds) ? req.attachedDocumentIds : [],
    );
  }
}
