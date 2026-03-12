import type { ChatRequest } from "../domain/chat.contracts";
import { ConversationNotFoundError } from "../domain/chat.contracts";
import { logger } from "../../../utils/logger";
import type { PrismaClient } from "@prisma/client";
import type { ScopeRuntimeConfig } from "./scopeRuntimeConfig";

export type ScopeServiceDependencies = {
  prismaClient: Pick<PrismaClient, "conversation" | "document">;
  runtimeConfig: ScopeRuntimeConfig;
};

export class ScopeService {
  constructor(private readonly deps: ScopeServiceDependencies) {}

  private normalizeDocIds(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids || []) {
      const id = String(raw || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= this.deps.runtimeConfig.maxScopeDocs) break;
    }
    return out;
  }

  async getConversationScope(
    userId: string,
    conversationId: string,
  ): Promise<string[]> {
    const row = await this.deps.prismaClient.conversation.findFirst({
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
    const updated = await this.deps.prismaClient.conversation.updateMany({
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
    const rows = await this.deps.prismaClient.document.findMany({
      where: {
        userId,
        id: { in: normalized },
        status: { in: this.deps.runtimeConfig.docStatusesAllowed },
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
    const updated = await this.deps.prismaClient.conversation.updateMany({
      where: { id: conversationId, userId, isDeleted: false },
      data: { scopeDocumentIds: [], updatedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new ConversationNotFoundError(
        "Conversation not found for this account.",
      );
    }
  }

  attachedScope(req: ChatRequest): string[] {
    return this.normalizeDocIds(
      Array.isArray(req.attachedDocumentIds) ? req.attachedDocumentIds : [],
    );
  }
}
