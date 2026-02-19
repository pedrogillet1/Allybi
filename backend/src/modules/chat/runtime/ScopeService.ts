import prisma from "../../../config/database";
import type { ChatRequest } from "../domain/chat.contracts";

const MAX_SCOPE_DOCS = 20;

function normalizeDocIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids || []) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_SCOPE_DOCS) break;
  }
  return out;
}

export class ScopeService {
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
    return normalizeDocIds(ids);
  }

  async setConversationScope(
    userId: string,
    conversationId: string,
    docIds: string[],
  ): Promise<void> {
    const normalized = normalizeDocIds(docIds);
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
    return (
      /\b(clear|reset|remove)\s+(scope|context|attachments?)\b/.test(q) ||
      /\b(use|search)\s+(all|entire)\s+(documents?|library)\b/.test(q)
    );
  }

  attachedScope(req: ChatRequest): string[] {
    return normalizeDocIds(Array.isArray(req.attachedDocumentIds) ? req.attachedDocumentIds : []);
  }
}
