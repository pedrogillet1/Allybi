/**
 * Unified Conversation Context Service
 *
 * SINGLE SOURCE OF TRUTH for all conversation context needs.
 * Combines:
 * - ConversationContextService (DB-persisted docs, messageCount, lastReferencedFile)
 * - ConversationMemoryService (in-memory lastIntent, lastDocumentIds)
 *
 * USAGE: All endpoints that answer queries MUST use this service to ensure
 * conversation follow-ups work correctly.
 *
 * GUARDRAIL: This service logs when it's used so we can verify all paths use it.
 */

import { PrismaClient } from '@prisma/client';
import { getContainer } from '../bootstrap/container';
import { getConversationContextService, ConversationContext as DBContext } from './conversationContext.service';

export interface UnifiedConversationContext {
  // From ConversationContextService (DB)
  documents: DBContext['documents'];
  documentCount: number;
  lastReferencedFileId: string | null;
  lastReferencedFileName: string | null;
  last2ReferencedFileIds: string[];
  messageCount: number;

  // From ConversationMemoryService (Cache)
  lastDocumentIds: string[];
  lastIntent: string | null;

  // Metadata
  conversationId: string;
  userId: string;
  loadTimeMs: number;
}

/**
 * Load unified context from both services.
 * This is the ONLY function that should be used to load conversation context.
 */
export async function loadUnifiedContext(
  prisma: PrismaClient,
  conversationId: string,
  userId: string
): Promise<UnifiedConversationContext> {
  const startTime = Date.now();

  // Load from BOTH services in parallel
  const contextService = getConversationContextService(prisma);
  const memoryService = getContainer().getConversationMemory();

  const [dbContext, memoryContext] = await Promise.all([
    contextService.loadOrHydrateContext(conversationId, userId),
    memoryService.getContext(conversationId),
  ]);

  // Extract memory fields
  const lastDocumentIds = (memoryContext?.metadata?.lastDocumentIds as string[]) || [];
  const lastIntent = (memoryContext?.metadata?.lastIntent as string) || null;

  const loadTimeMs = Date.now() - startTime;

  // GUARDRAIL LOG: This helps verify all paths use unified context
  console.log(`[UNIFIED_CONTEXT] conversationId=${conversationId.substring(0, 8)}... docs=${dbContext.documents.length} lastDocIds=${lastDocumentIds.length} lastIntent=${lastIntent || 'none'} loadMs=${loadTimeMs}`);

  return {
    // DB fields
    documents: dbContext.documents,
    documentCount: dbContext.documents.length,
    lastReferencedFileId: dbContext.lastReferencedFileId,
    lastReferencedFileName: dbContext.lastReferencedFileName,
    last2ReferencedFileIds: dbContext.last2ReferencedFileIds || [],
    messageCount: dbContext.messageCount,

    // Memory fields
    lastDocumentIds,
    lastIntent,

    // Metadata
    conversationId,
    userId,
    loadTimeMs,
  };
}

/**
 * Build orchestrator context object from unified context.
 * Use this to pass context to KodaOrchestratorV3.
 */
export function buildOrchestratorContext(unified: UnifiedConversationContext): Record<string, unknown> {
  return {
    documents: unified.documents,
    documentCount: unified.documentCount,
    lastReferencedFileId: unified.lastReferencedFileId,
    lastReferencedFileName: unified.lastReferencedFileName,
    lastDocumentIds: unified.lastDocumentIds,
    lastIntent: unified.lastIntent,
  };
}
