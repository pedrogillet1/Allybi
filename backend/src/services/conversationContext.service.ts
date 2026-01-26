/**
 * ConversationContextStore - Single Source of Truth for Conversation State
 *
 * This service ensures context is NEVER lost by:
 * 1. Persisting all conversation state to DB (not memory)
 * 2. Providing a single loadOrHydrateContext() used by ALL endpoints
 * 3. Tracking file references for follow-up queries
 * 4. Maintaining document snapshot version to detect changes
 */

import { PrismaClient } from '@prisma/client';

// Types for conversation context
export interface ConversationContext {
  // Core identifiers
  conversationId: string;
  userId: string;

  // File reference tracking (for "it", "that one", "the other one")
  lastReferencedFileId: string | null;
  lastReferencedFileName: string | null;
  last2ReferencedFileIds: string[];  // For "compare it to the other one"

  // Document state tracking
  workspaceDocCount: number;         // Doc count at last turn
  workspaceDocVersion: string;       // Hash of doc IDs - detects adds/deletes

  // Message tracking
  messageCount: number;
  lastMessageAt: Date;

  // Loaded documents (hydrated on each request)
  documents: DocumentReference[];
}

export interface DocumentReference {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  folderPath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationContextRow {
  id: string;
  conversationId: string;
  userId: string;
  lastReferencedFileId: string | null;
  lastReferencedFileName: string | null;
  last2ReferencedFileIds: string;  // JSON array
  workspaceDocCount: number;
  workspaceDocVersion: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class ConversationContextService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * CRITICAL: This is the ONLY function that should load context.
   * Used by BOTH streaming and non-streaming endpoints.
   *
   * Guarantees:
   * - Always loads documents from DB (never memory cache alone)
   * - Creates context record if missing
   * - Returns hydrated context with all documents
   */
  async loadOrHydrateContext(
    conversationId: string,
    userId: string
  ): Promise<ConversationContext> {
    const startTime = Date.now();

    // STEP 1: Load or create conversation context from DB
    let contextRow = await this.getContextFromDB(conversationId);

    if (!contextRow) {
      // New conversation - create context
      contextRow = await this.createContext(conversationId, userId);
      console.log(`[ConversationContext] Created new context for ${conversationId}`);
    }

    // STEP 2: ALWAYS load documents from DB (source of truth)
    const documents = await this.loadDocumentsFromDB(userId);

    // STEP 3: Check for document changes
    const currentDocVersion = this.computeDocVersion(documents);
    const docsChanged = currentDocVersion !== contextRow.workspaceDocVersion;

    if (docsChanged) {
      console.log(`[ConversationContext] Docs changed: ${contextRow.workspaceDocCount} -> ${documents.length}`);
      // Update the context with new doc state
      await this.updateDocState(conversationId, documents.length, currentDocVersion);
    }

    // STEP 4: Build folder paths for all documents
    const documentsWithPaths = await this.enrichWithFolderPaths(documents);

    // STEP 5: Return hydrated context
    const context: ConversationContext = {
      conversationId,
      userId,
      lastReferencedFileId: contextRow.lastReferencedFileId,
      lastReferencedFileName: contextRow.lastReferencedFileName,
      last2ReferencedFileIds: JSON.parse(contextRow.last2ReferencedFileIds || '[]'),
      workspaceDocCount: documents.length,
      workspaceDocVersion: currentDocVersion,
      messageCount: contextRow.messageCount,
      lastMessageAt: contextRow.lastMessageAt,
      documents: documentsWithPaths
    };

    const loadTime = Date.now() - startTime;
    console.log(`[ConversationContext] Loaded context in ${loadTime}ms: ${documents.length} docs, ${contextRow.messageCount} messages`);

    // CRITICAL LOG: This helps debug context loss
    console.log(`[CONTEXT_HYDRATED]`, {
      conversationId,
      userId,
      documentCount: documents.length,
      messageCount: contextRow.messageCount,
      loadTimeMs: loadTime
    });

    return context;
  }

  /**
   * Update file reference when user references a file.
   * Call this when user asks about a specific file.
   */
  async updateFileReference(
    conversationId: string,
    fileId: string,
    fileName: string
  ): Promise<void> {
    // Get current context
    const context = await this.getContextFromDB(conversationId);
    if (!context) return;

    // Build new last2 array (shift current last to last2)
    const newLast2 = [context.lastReferencedFileId, ...JSON.parse(context.last2ReferencedFileIds || '[]')]
      .filter(Boolean)
      .slice(0, 2) as string[];

    // Update in DB
    await this.prisma.$executeRaw`
      UPDATE conversation_contexts
      SET
        "lastReferencedFileId" = ${fileId},
        "lastReferencedFileName" = ${fileName},
        "last2ReferencedFileIds" = ${JSON.stringify(newLast2)},
        "updatedAt" = NOW()
      WHERE "conversationId" = ${conversationId}
    `;

    console.log(`[ConversationContext] Updated file ref: ${fileName} (${fileId})`);
  }

  /**
   * Increment message count after each turn.
   */
  async incrementMessageCount(conversationId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE conversation_contexts
      SET
        "messageCount" = "messageCount" + 1,
        "lastMessageAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "conversationId" = ${conversationId}
    `;
  }

  /**
   * Resolve "it", "that file", "the other one" references.
   */
  resolveFileReference(
    context: ConversationContext,
    reference: 'it' | 'that' | 'this' | 'the_other' | 'previous'
  ): DocumentReference | null {
    if (!context.documents.length) return null;

    switch (reference) {
      case 'it':
      case 'that':
      case 'this':
        // Return last referenced file
        if (context.lastReferencedFileId) {
          return context.documents.find(d => d.id === context.lastReferencedFileId) || null;
        }
        return null;

      case 'the_other':
      case 'previous':
        // Return the second-to-last referenced file
        if (context.last2ReferencedFileIds.length > 0) {
          const otherId = context.last2ReferencedFileIds[0];
          return context.documents.find(d => d.id === otherId) || null;
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Check if context appears to be lost (doc count dropped unexpectedly).
   */
  isContextLost(context: ConversationContext, previousDocCount: number): boolean {
    // If we had docs before but now have none, context is lost
    return previousDocCount > 0 && context.documents.length === 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════

  private async getContextFromDB(conversationId: string): Promise<ConversationContextRow | null> {
    const rows = await this.prisma.$queryRaw<ConversationContextRow[]>`
      SELECT * FROM conversation_contexts
      WHERE "conversationId" = ${conversationId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  private async createContext(conversationId: string, userId: string): Promise<ConversationContextRow> {
    const id = this.generateUUID();
    const now = new Date();

    await this.prisma.$executeRaw`
      INSERT INTO conversation_contexts (
        id, "conversationId", "userId",
        "lastReferencedFileId", "lastReferencedFileName", "last2ReferencedFileIds",
        "workspaceDocCount", "workspaceDocVersion",
        "messageCount", "lastMessageAt",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${conversationId}, ${userId},
        NULL, NULL, '[]',
        0, '',
        0, ${now},
        ${now}, ${now}
      )
      ON CONFLICT ("conversationId") DO NOTHING
    `;

    return {
      id,
      conversationId,
      userId,
      lastReferencedFileId: null,
      lastReferencedFileName: null,
      last2ReferencedFileIds: '[]',
      workspaceDocCount: 0,
      workspaceDocVersion: '',
      messageCount: 0,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now
    };
  }

  private async loadDocumentsFromDB(userId: string): Promise<any[]> {
    // CRITICAL: Always fetch from DB, never rely on cache as source of truth
    const documents = await this.prisma.document.findMany({
      where: {
        userId,
        status: 'available'  // Only available documents
      },
      include: {
        folder: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return documents;
  }

  private async enrichWithFolderPaths(documents: any[]): Promise<DocumentReference[]> {
    const folderPathCache = new Map<string, string>();

    const enriched: DocumentReference[] = [];

    for (const doc of documents) {
      let folderPath = '/';

      if (doc.folderId) {
        // Check cache first
        if (folderPathCache.has(doc.folderId)) {
          folderPath = folderPathCache.get(doc.folderId)!;
        } else {
          // Build path
          folderPath = await this.buildFolderPath(doc.folderId);
          folderPathCache.set(doc.folderId, folderPath);
        }
      }

      enriched.push({
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        size: doc.size || 0,
        folderId: doc.folderId,
        folderPath,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      });
    }

    return enriched;
  }

  private async buildFolderPath(folderId: string): Promise<string> {
    const parts: string[] = [];
    let currentId: string | null = folderId;

    // Walk up the folder tree (max 10 levels to prevent infinite loops)
    for (let depth = 0; depth < 10 && currentId; depth++) {
      const folderResult: { name: string; parentFolderId: string | null } | null =
        await this.prisma.folder.findUnique({
          where: { id: currentId },
          select: { name: true, parentFolderId: true }
        });

      if (!folderResult) break;

      parts.unshift(folderResult.name);
      currentId = folderResult.parentFolderId;
    }

    return '/' + parts.join('/');
  }

  private async updateDocState(
    conversationId: string,
    docCount: number,
    docVersion: string
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE conversation_contexts
      SET
        "workspaceDocCount" = ${docCount},
        "workspaceDocVersion" = ${docVersion},
        "updatedAt" = NOW()
      WHERE "conversationId" = ${conversationId}
    `;
  }

  private computeDocVersion(documents: any[]): string {
    // Simple hash of document IDs - changes when docs added/removed
    const ids = documents.map(d => d.id).sort().join(',');
    return this.simpleHash(ids);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Singleton instance
let instance: ConversationContextService | null = null;

export function getConversationContextService(prisma: PrismaClient): ConversationContextService {
  if (!instance) {
    instance = new ConversationContextService(prisma);
  }
  return instance;
}
