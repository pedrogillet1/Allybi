import prisma from "../../../config/database";
import { getBankLoaderInstance } from "../../../services/core/banks/bankLoader.service";
import type { ChatRequest } from "../domain/chat.contracts";

type ScopeRuntimeConfig = {
  maxScopeDocs: number;
  clearScopeRegex: RegExp[];
};

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

  return {
    maxScopeDocs: Math.floor(maxScopeDocs),
    clearScopeRegex,
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
    const normalized = this.normalizeDocIds(docIds);
    await prisma.conversation.updateMany({
      where: { id: conversationId, userId, isDeleted: false },
      data: { scopeDocumentIds: normalized, updatedAt: new Date() },
    });
  }

  async clearConversationScope(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    await prisma.conversation.updateMany({
      where: { id: conversationId, userId, isDeleted: false },
      data: { scopeDocumentIds: [], updatedAt: new Date() },
    });
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
