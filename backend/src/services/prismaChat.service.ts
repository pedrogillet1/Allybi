/**
 * prismaChat.service.ts
 *
 * PrismaChatService (ChatService implementation)
 * ----------------------------------------------
 * This version:
 * - Implements a ChatService-like interface (CRUD + chat + streamChat)
 * - Uses Prisma for persistence
 * - Delegates AI generation to an injected ChatEngine (or Orchestrator)
 * - Keeps responsibilities clean:
 *    - This service coordinates: persistence + calling the engine + saving results
 *    - It does NOT contain provider-specific code (Gemini/OpenAI/local)
 *    - It does NOT contain microcopy or UX formatting rules
 */

import prisma from '../config/database';
import { Prisma } from '@prisma/client';

// Encryption imports for filename decryption in retrieval path
import { EncryptionService } from './security/encryption.service';
import { EnvelopeService } from './security/envelope.service';
import { TenantKeyService } from './security/tenantKey.service';
import { DocumentKeyService } from '../services/documents/documentKey.service';
import { DocumentCryptoService } from '../services/documents/documentCrypto.service';
import { EncryptedDocumentRepo } from '../services/documents/encryptedDocumentRepo.service';

import type {
  StreamSink,
  LLMStreamingConfig,
} from './llm/types/llmStreaming.types';

import type { EncryptedChatRepo } from './chat/encryptedChatRepo.service';
import type { EncryptedChatContextService } from './chat/encryptedChatContext.service';

// Semantic bolding (ChatGPT-style emphasis)
import { getBoldingNormalizer } from './core/inputs/boldingNormalizer.service';

// Folder tree rendering for document inventory context
import { buildFolderTreeFromRecords, renderFolderTreeWithDocs } from './files/utils/buildFolderTree';
import { getFileActionExecutor } from './core/execution/fileActionExecutor.service';

/* ---------------------------------------------
 * Minimal service contracts (align with controller)
 * -------------------------------------------- */

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessageDTO {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  updatedAt: string;
  attachments?: unknown | null;
  telemetry?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationDTO {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessagesDTO extends ConversationDTO {
  messages: ChatMessageDTO[];
}

export interface ChatRequest {
  userId: string;
  conversationId?: string;
  message: string;
  attachedDocumentIds?: string[];
  preferredLanguage?: "en" | "pt" | "es";
  confirmationToken?: string;
  context?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  isRegenerate?: boolean;
}

export type AnswerMode =
  | 'doc_grounded_single'
  | 'doc_grounded_multi'
  | 'doc_grounded_quote'
  | 'nav_pills'
  | 'fallback'
  | 'general_answer'
  | 'action_confirmation'
  | 'action_receipt';

export type AnswerClass = 'DOCUMENT' | 'NAVIGATION' | 'GENERAL';

function deriveAnswerClass(answerMode: AnswerMode): AnswerClass {
  if (answerMode.startsWith('doc_grounded')) return 'DOCUMENT';
  if (answerMode === 'nav_pills') return 'NAVIGATION';
  if (answerMode === 'action_confirmation' || answerMode === 'action_receipt') return 'NAVIGATION';
  return 'GENERAL';
}

export type NavType = 'open' | 'discover' | 'where' | null;

export interface ChatResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  assistantText: string;
  attachmentsPayload?: unknown;
  assistantTelemetry?: Record<string, unknown>;
  sources?: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>;
  listing?: Array<{ kind: 'file' | 'folder'; id: string; title: string; mimeType?: string; itemCount?: number; depth?: number }>;
  breadcrumb?: Array<{ id: string; name: string }>;
  answerMode?: AnswerMode;
  answerClass?: AnswerClass;
  navType?: NavType;
  generatedTitle?: string;
}

/**
 * The AI engine contract PrismaChatService expects.
 * Wrap your orchestrator or LLM client behind this interface.
 */
export interface ChatEngine {
  generate(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{ role: ChatRole; content: string; attachments?: unknown | null }>;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }): Promise<{
    text: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }>;

  stream(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{ role: ChatRole; content: string; attachments?: unknown | null }>;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<{
    finalText: string;
    attachmentsPayload?: unknown;
    telemetry?: Record<string, unknown>;
  }>;
}

/* ---------------------------------------------
 * Stop words filtered from queries to prevent
 * generic terms from diluting retrieval scoring
 * -------------------------------------------- */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'was',
  'one', 'our', 'out', 'has', 'have', 'been', 'some', 'them', 'than', 'its',
  'will', 'how', 'what', 'when', 'where', 'which', 'who', 'why', 'does', 'did',
  'that', 'this', 'these', 'those', 'there', 'here', 'with', 'from', 'about',
  'give', 'gave', 'show', 'tell', 'just', 'also', 'only', 'very', 'much',
  'more', 'most', 'other', 'any', 'full', 'short', 'long', 'main',
  'please', 'could', 'would', 'should', 'need', 'want', 'like', 'know',
]);

/* ---------------------------------------------
 * File Action Types (chat-driven file management)
 * -------------------------------------------- */

type FileActionType = 'create_folder' | 'rename_folder' | 'delete_folder' | 'move_document' | 'delete_document';

interface FileAction {
  type: FileActionType;
  folderName?: string;
  newName?: string;       // for rename
  filename?: string;      // for move/delete document
  targetFolder?: string;  // for move document
}

/* ---------------------------------------------
 * PrismaChatService
 * -------------------------------------------- */

export class PrismaChatService {
  private encryptedRepo?: EncryptedChatRepo;
  private encryptedContext?: EncryptedChatContextService;

  constructor(
    private readonly engine: ChatEngine,
    opts?: {
      encryptedRepo?: EncryptedChatRepo;
      encryptedContext?: EncryptedChatContextService;
    },
  ) {
    this.encryptedRepo = opts?.encryptedRepo;
    this.encryptedContext = opts?.encryptedContext;
  }

  /* ---------------- Conversations (CRUD) ---------------- */

  async createConversation(params: { userId: string; title?: string }): Promise<ConversationDTO> {
    const now = new Date();
    const created = await prisma.conversation.create({
      data: {
        userId: params.userId,
        title: params.title ?? "New Chat",
        createdAt: now,
        updatedAt: now,
      },
    });

    return toConversationDTO(created);
  }

  async listConversations(userId: string, opts: { limit?: number; cursor?: string } = {}): Promise<ConversationDTO[]> {
    const limit = clampLimit(opts.limit, 50);

    const rows = await prisma.conversation.findMany({
      where: { userId, isDeleted: false },
      orderBy: { updatedAt: "desc" },
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });

    return rows.map(toConversationDTO);
  }

  async getConversation(userId: string, conversationId: string): Promise<ConversationDTO | null> {
    const row = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
    });
    return row ? toConversationDTO(row) : null;
  }

  async getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts: { limit?: number; order?: "asc" | "desc" } = {}
  ): Promise<ConversationWithMessagesDTO | null> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
    });
    if (!conv) return null;

    const limit = clampLimit(opts.limit, 200);

    // When encryption is enabled, use the encrypted repo to get decrypted messages
    if (this.encryptedRepo) {
      const decrypted = await this.encryptedRepo.listMessagesDecrypted(userId, conversationId, limit);
      // listMessagesDecrypted always returns ASC order; reverse if DESC requested
      const ordered = opts.order === "desc" ? [...decrypted].reverse() : decrypted;
      return {
        ...toConversationDTO(conv),
        messages: ordered.map(toMessageDTO),
      };
    }

    const msgs = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: opts.order === "desc" ? "desc" : "asc" },
      take: limit,
    });

    return {
      ...toConversationDTO(conv),
      messages: msgs.map(toMessageDTO),
    };
  }

  async updateTitle(userId: string, conversationId: string, title: string): Promise<ConversationDTO | null> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
    });
    if (!conv) return null;

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { title, updatedAt: new Date() },
    });

    return toConversationDTO(updated);
  }

  async deleteConversation(userId: string, conversationId: string): Promise<{ ok: boolean }> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!conv) return { ok: false };

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { ok: true };
  }

  async deleteAllConversations(userId: string): Promise<{ ok: boolean; deleted: number }> {
    const result = await prisma.conversation.updateMany({
      where: { userId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { ok: true, deleted: result.count };
  }

  /* ---------------- Messages (CRUD) ---------------- */

  async listMessages(
    userId: string,
    conversationId: string,
    opts: { limit?: number; order?: "asc" | "desc" } = {}
  ): Promise<ChatMessageDTO[]> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!conv) return [];

    const limit = clampLimit(opts.limit, 200);

    // When encryption is enabled, use the encrypted repo to get decrypted messages
    if (this.encryptedRepo) {
      const decrypted = await this.encryptedRepo.listMessagesDecrypted(userId, conversationId, limit);
      const ordered = opts.order === "desc" ? [...decrypted].reverse() : decrypted;
      return ordered.map(toMessageDTO);
    }

    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: opts.order === "desc" ? "desc" : "asc" },
      take: limit,
    });

    return rows.map(toMessageDTO);
  }

  async createMessage(params: {
    conversationId: string;
    role: ChatRole;
    content: string;
    userId?: string;
    attachments?: unknown | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<ChatMessageDTO> {
    const now = new Date();
    const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;

    // If encrypted repo is available and userId is known, store encrypted
    if (this.encryptedRepo && params.userId) {
      const saved = await this.encryptedRepo.saveMessage(
        params.userId,
        params.conversationId,
        params.role,
        params.content ?? "",
      );

      // Store metadata on the message row if provided
      if (metadataJson) {
        await prisma.message.update({
          where: { id: saved.id },
          data: { metadata: metadataJson },
        }).catch(() => {});
      }

      await prisma.conversation.update({
        where: { id: params.conversationId },
        data: { updatedAt: now },
      });

      return {
        id: saved.id,
        role: saved.role as ChatRole,
        content: params.content ?? "",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        attachments: null,
        telemetry: null,
      };
    }

    // Fallback: plaintext (backward compatible)
    const msg = await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: params.role,
        content: params.content ?? "",
        createdAt: now,
        ...(metadataJson ? { metadata: metadataJson } : {}),
      },
    });

    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: { updatedAt: now },
    });

    return toMessageDTO(msg);
  }

  /* ---------------- Chat (non-streamed) ---------------- */

  async chat(req: ChatRequest): Promise<ChatResult> {
    const traceId = mkTraceId();

    // 1) Ensure conversation exists
    const conversationId = await this.ensureConversation(req.userId, req.conversationId);

    // 2) Load recent messages (context for the engine)
    const history = await this.loadRecentForEngine(conversationId, 60, req.userId);

    // --- File Action Detection (bank-driven; safe confirmation for destructive ops) ---
    const fileOp = getFileActionExecutor().detectOperator(req.message);
    if (fileOp) {
      const lang = req.preferredLanguage ?? 'en';
      const result = await getFileActionExecutor().execute({
        userId: req.userId,
        operator: fileOp,
        message: req.message,
        language: lang,
        confirmationToken: req.confirmationToken,
        attachedDocumentIds: req.attachedDocumentIds ?? [],
      });

      const answerMode: AnswerMode = result.requiresConfirmation ? 'action_confirmation' : 'action_receipt';
      const answerClass: AnswerClass = 'NAVIGATION';
      const attachmentsPayload = result.attachments ?? [];
      const sourceAttachments = attachmentsPayload.filter((a: any) => a?.type === 'folder' || a?.type === 'document');
      const sources = sourceAttachments.map((a: any) => ({
        documentId: a.docId || a.documentId || a.id || '',
        filename: a.filename || a.title || '',
        mimeType: a.mimeType ?? null,
        page: a.page ?? null,
      }));

      // Persist user message
      const userMsg = await this.createMessage({
        conversationId, role: 'user', content: req.message, userId: req.userId,
      });

      // Persist assistant message (attachments live in metadata; Message model has no attachments column)
      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: result.message, userId: req.userId,
        metadata: { sources, attachments: attachmentsPayload, answerMode, answerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: result.message,
        attachmentsPayload,
        sources,
        answerMode,
        answerClass,
        navType: null,
      };
    }

    // --- Intent Classification (BEFORE RAG and navigation handlers) ---
    const intent = this.classifyIntent(req.message);

    // Null sink for non-streaming handlers that share code with streaming path
    const nullSink: StreamSink = {
      transport: 'sse' as any,
      write() {},
      flush() {},
      close() {},
      isOpen() { return false; },
    };
    const nullStreamConfig: LLMStreamingConfig = { chunking: { maxCharsPerDelta: 64 }, markerHold: { enabled: false, flushAt: 'final', maxBufferedMarkers: 0 } };

    // --- Navigation intent dispatching ---
    if (intent.intent === 'FIND_DOCUMENT_LOCATION' || intent.intent === 'FIND_FOLDER_LOCATION') {
      return this.handleDocumentLocationQuery(req.userId, req.message, conversationId, nullSink, nullStreamConfig);
    }

    if (intent.intent === 'OPEN_DOCUMENT') {
      return this.handleOpenDocumentQuery(req.userId, req.message, conversationId, nullSink, nullStreamConfig);
    }

    if (intent.intent === 'LIST_FOLDER_CONTENTS') {
      return this.handleFolderContentsQuery(req.userId, req.message, conversationId, nullSink, nullStreamConfig);
    }

    if (intent.intent === 'NAVIGATE_TREE') {
      return this.handleNavigateTreeQuery(req.userId, req.message, conversationId, nullSink, nullStreamConfig);
    }

    if (intent.intent === 'NAVIGATE_REASONING') {
      return this.handleNavigateReasoningQuery(req.userId, req.message, conversationId, nullSink, nullStreamConfig, history);
    }

    // SCOPED_SEARCH: resolve folder → get recursive doc IDs → fall through to RAG with scope
    let scopedSearchDocIds: string[] | null = null;
    if (intent.intent === 'SCOPED_SEARCH') {
      const targetFolder = await this.resolveFolderByFuzzyName(req.userId, req.message);
      if (targetFolder) {
        scopedSearchDocIds = await this.getRecursiveDocumentIds(req.userId, targetFolder.id);
      }
    }

    // --- File Listing Detection (before RAG, non-streaming) ---
    const listingCheckSync = this.isFileListingQuery(req.message);
    if (listingCheckSync.isListing) {
      const listing = await this.buildFileListingPayload(req.userId);
      // Filter items by scope
      const scope = listingCheckSync.scope;
      const filteredItems = scope === 'documents'
        ? listing.items.filter(i => i.kind === 'file')
        : scope === 'folders'
          ? listing.items.filter(i => i.kind === 'folder')
          : listing.items;
      if (filteredItems.length > 0) {
        const userMsg = await this.createMessage({
          conversationId, role: 'user', content: req.message, userId: req.userId,
        });
        const lang = listingCheckSync.lang;
        const fCount = filteredItems.filter(i => i.kind === 'folder').length;
        const dCount = filteredItems.filter(i => i.kind === 'file').length;
        const introText = this.buildListingIntro(lang, fCount, dCount);
        const assistantMsg = await this.createMessage({
          conversationId, role: 'assistant', content: introText, userId: req.userId,
          metadata: { listing: filteredItems, sources: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass },
        });
        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: introText,
          listing: filteredItems,
          sources: [],
          answerMode: 'general_answer' as AnswerMode,
          answerClass: 'NAVIGATION' as AnswerClass,
          navType: null,
        };
      }
    }

    // --- Normal RAG flow continues below ---

    // --- Attachment scoping: if user attached documents, use those as hard scope ---
    const attachedDocumentIds = req.attachedDocumentIds ?? [];
    const hasAttachments = attachedDocumentIds.length > 0;

    if (hasAttachments) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { scopeDocumentIds: attachedDocumentIds },
      });
    }

    // --- Document Scoping: load persisted scope ---
    const ragScopeEnabled = (process.env.RAG_SCOPE_ENABLED ?? 'true') !== 'false';
    const ragScopeMinChunks = parseInt(process.env.RAG_SCOPE_MIN_CHUNKS ?? '2', 10) || 2;

    let scopeDocIds: string[] = [];
    if (hasAttachments) {
      scopeDocIds = attachedDocumentIds;
    } else if (ragScopeEnabled) {
      const convScope = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: req.userId },
        select: { scopeDocumentIds: true },
      });
      scopeDocIds = (convScope?.scopeDocumentIds as string[]) ?? [];
    }

    // SCOPED_SEARCH override: use folder-scoped doc IDs
    if (scopedSearchDocIds && scopedSearchDocIds.length > 0) {
      scopeDocIds = scopedSearchDocIds;
    }

    // Decide scoping: if user names a new document, clear scope and go global
    let useScope = scopeDocIds.length > 0;
    let scopeCleared = false;
    if (!hasAttachments && !scopedSearchDocIds && useScope && await this.queryNamesNewDocument(req.message, scopeDocIds)) {
      scopeDocIds = [];
      useScope = false;
      scopeCleared = true;
    }

    // 3) Query expansion: skip when scoped (hard filter already constrains to right doc)
    const contextualQuery = useScope
      ? req.message
      : this.expandQueryFromHistory(req.message, history);

    // Extract document focus and topic entities from conversation for targeted retrieval
    const focusFilenames = this.extractDocumentFocusFromHistory(history);
    const topicEntities = this.extractTopicEntitiesFromHistory(history);

    // Retrieve relevant document chunks (higher topK for better coverage)
    let chunks = await this.retrieveRelevantChunks(req.userId, contextualQuery, 15, {
      boostFilenames: focusFilenames,
      boostTopicEntities: topicEntities,
      ...(useScope ? { scopeDocumentIds: scopeDocIds } : {}),
    });

    // Fallback: if scoped retrieval is too thin, retry globally without clearing scope
    if (useScope && chunks.length < ragScopeMinChunks) {
      const globalQuery = this.expandQueryFromHistory(req.message, history);
      chunks = await this.retrieveRelevantChunks(req.userId, globalQuery, 15, {
        boostFilenames: focusFilenames,
        boostTopicEntities: topicEntities,
      });
    }

    // Retry with expanded query if initial retrieval looks thin
    if (chunks.length < 3 && req.message.trim().length > 5) {
      const expandedQuery = this.expandQueryForRetry(contextualQuery);
      if (expandedQuery !== contextualQuery) {
        const retryChunks = await this.retrieveRelevantChunks(req.userId, expandedQuery, 15, { boostFilenames: focusFilenames, boostTopicEntities: topicEntities });
        const seen = new Set(chunks.map(c => `${c.documentId}:${c.page}:${c.text.slice(0, 50)}`));
        for (const rc of retryChunks) {
          const key = `${rc.documentId}:${rc.page}:${rc.text.slice(0, 50)}`;
          if (!seen.has(key)) { chunks.push(rc); seen.add(key); }
        }
      }
    }

    // --- Persist scope after retrieval ---
    if (ragScopeEnabled && chunks.length > 0) {
      const retrievedDocIds = [...new Set(chunks.map(c => c.documentId))];
      if (scopeDocIds.length === 0 || scopeCleared) {
        // First turn or scope cleared (new doc named): set scope from retrieved docs
        const newScopeDocIds = retrievedDocIds.slice(0, 3);
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { scopeDocumentIds: newScopeDocIds },
        });
      }
      // If scope was active and used: keep existing scope (don't narrow further)
    }

    // Derive routing before building RAG context (context is mode-aware)
    const sources = this.buildSourcesFromChunks(chunks);
    const chunkScores = chunks.map(c => c.score ?? 0);
    const answerMode = this.deriveAnswerMode(req.message, sources, chunkScores);
    const navType = this.deriveNavType(req.message, answerMode);
    const ragContext = this.buildRAGContext(chunks, answerMode);

    // Log retrieval telemetry (fire-and-forget, never fail the request)
    this.logRetrievalTelemetry({
      userId: req.userId,
      conversationId,
      chunks,
      chunkScores,
      answerMode,
      useScope,
      scopeDocIds,
    }).catch(() => {});

    // 4) Persist user message (with attachment metadata if present)
    let chatAttachmentMeta: Record<string, unknown> | undefined;
    if (attachedDocumentIds.length > 0) {
      const attachedDocs = await prisma.document.findMany({
        where: { id: { in: attachedDocumentIds }, userId: req.userId },
        select: { id: true, filename: true, mimeType: true },
      });
      chatAttachmentMeta = {
        attachments: attachedDocs.map(d => ({
          type: 'attached_file',
          id: d.id,
          filename: d.filename || 'Document',
          mimeType: d.mimeType || 'application/octet-stream',
        })),
      };
    }
    const userMsg = await this.createMessage({
      conversationId,
      role: "user",
      content: req.message,
      userId: req.userId,
      ...(chatAttachmentMeta ? { metadata: chatAttachmentMeta } : {}),
    });

    // 5) Build messages with RAG context + folder tree
    const folderTreeContext = await this.buildFolderTreeContext(req.userId);
    const messagesWithContext: Array<{ role: ChatRole; content: string }> = [
      ...history,
    ];
    if (folderTreeContext) {
      messagesWithContext.push({ role: "system" as ChatRole, content: folderTreeContext });
    }
    if (ragContext) {
      messagesWithContext.push({ role: "system" as ChatRole, content: ragContext });
    }
    messagesWithContext.push({ role: "user" as ChatRole, content: req.message });

    // 6) Call engine
    const engineOut = await this.engine.generate({
      traceId,
      userId: req.userId,
      conversationId,
      messages: messagesWithContext,
      context: req.context,
      meta: req.meta,
    });

    // 7) Strip inline citations + guard forbidden phrases + fix currency + linkify sources + semantic bolding
    const rawLLMText = engineOut.text ?? "";
    let cleanedText = sources.length > 0
      ? this.stripInlineCitations(rawLLMText)
      : rawLLMText;
    cleanedText = this.guardForbiddenPhrases(cleanedText, answerMode);
    cleanedText = this.fixCurrencyArtifacts(cleanedText);
    cleanedText = this.stripRawFilenames(cleanedText);
    cleanedText = this.stripRawPaths(cleanedText);

    // Empty response safety net
    if (!cleanedText.trim()) {
      cleanedText = answerMode === 'nav_pills'
        ? "I found the document you're looking for."
        : "I found some relevant information, but couldn't generate a clear summary. Try rephrasing your question.";
    }

    // Reorder sources so documents the LLM actually cited come first
    let reorderedSources = this.reorderSourcesByLLMUsage(rawLLMText, sources);

    // Limit sources to top N most relevant (already sorted by retrieval score)
    // Text-based filtering is disabled as it produces false positives with paraphrased content
    const maxSources = 3;
    if (reorderedSources.length > maxSources) {
      reorderedSources = reorderedSources.slice(0, maxSources);
    }

    // Negative answer kill switch: if the LLM says "not mentioned" / "no information",
    // suppress sources to avoid misleading the user with irrelevant document pills.
    if (this.isNegativeAnswer(rawLLMText)) {
      reorderedSources = [];
    }

    cleanedText = this.linkifyTableSources(cleanedText, reorderedSources);

    // Apply ChatGPT-style semantic bolding (skip for nav_pills — those are minimal)
    if (answerMode !== 'nav_pills') {
      const bolding = getBoldingNormalizer();
      const boldResult = bolding.normalize({
        text: cleanedText,
        userQuery: req.message,
        lang: 'en',
      });
      cleanedText = boldResult.text;
    }

    // Sources are now persisted in message metadata — no need for text attribution
    const storedText = cleanedText;

    // 8) Persist assistant message with sources in metadata
    const answerClass = deriveAnswerClass(answerMode);
    const assistantMsg = await this.createMessage({
      conversationId,
      role: "assistant",
      content: storedText,
      userId: req.userId,
      metadata: answerMode === 'nav_pills'
        ? { listing: this.sourcesToListingItems(reorderedSources), sources: [], answerMode, answerClass, navType }
        : answerClass === 'DOCUMENT'
          ? { sources: reorderedSources, answerMode, answerClass, navType }
          : { sources: [], answerMode, answerClass, navType },
    });

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: cleanedText,
      attachmentsPayload: engineOut.attachmentsPayload,
      assistantTelemetry: engineOut.telemetry,
      sources: answerClass === 'DOCUMENT' ? reorderedSources : [],
      answerMode,
      answerClass,
      navType,
    };
  }

  /* ---------------- RAG: Document Retrieval ---------------- */

  /**
   * Log retrieval event to telemetry (fire-and-forget).
   * Populates RetrievalEvent table for Answer Quality and Queries dashboards.
   */
  private async logRetrievalTelemetry(params: {
    userId: string;
    conversationId: string;
    chunks: Array<{ text: string; filename: string | null; page: number | null; documentId: string; mimeType: string | null; score: number }>;
    chunkScores: number[];
    answerMode: AnswerMode;
    useScope: boolean;
    scopeDocIds: string[];
  }): Promise<void> {
    const { userId, conversationId, chunks, chunkScores, answerMode, useScope, scopeDocIds } = params;

    // Calculate evidence strength: highest chunk score (0-1 scale, assume scores are already normalized)
    const topScore = chunkScores.length > 0 ? Math.max(...chunkScores) : 0;
    // Normalize to 0-1 range (scores typically 0-100, cap at 100)
    const evidenceStrength = Math.min(topScore / 100, 1);

    // Determine if this is weak evidence (< 35%) or no evidence
    const isWeakEvidence = evidenceStrength < 0.35;
    const isNoEvidence = chunks.length === 0;

    // Derive domain from mimeTypes of top chunks
    const mimeTypes = chunks.slice(0, 3).map(c => c.mimeType).filter(Boolean);
    let domain = 'unknown';
    if (mimeTypes.some(m => m?.includes('spreadsheet') || m?.includes('excel'))) domain = 'finance';
    else if (mimeTypes.some(m => m?.includes('presentation') || m?.includes('powerpoint'))) domain = 'presentation';
    else if (mimeTypes.some(m => m?.includes('pdf'))) domain = 'document';
    else if (mimeTypes.some(m => m?.includes('word'))) domain = 'document';

    // Map answerMode to operator
    const operator = answerMode.startsWith('doc_grounded') ? 'answer' :
                     answerMode === 'nav_pills' ? 'navigate' :
                     answerMode === 'fallback' ? 'fallback' : 'answer';

    // Generate trace ID
    const traceId = `ret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      await prisma.retrievalEvent.create({
        data: {
          userId,
          traceId,
          conversationId,
          operator,
          intent: answerMode === 'nav_pills' ? 'navigate' : 'answer',
          domain,
          docLockEnabled: useScope && scopeDocIds.length > 0,
          strategy: useScope ? 'scoped' : 'global',
          candidates: chunks.length,
          selected: Math.min(chunks.length, 5),
          evidenceStrength,
          refined: false,
          wrongDocPrevented: false,
          sourcesCount: chunks.length,
          navPillsUsed: answerMode === 'nav_pills',
          fallbackReasonCode: isNoEvidence ? 'NO_EVIDENCE' : isWeakEvidence ? 'WEAK_EVIDENCE' : null,
          at: new Date(),
        },
      });
    } catch (err) {
      // Fail silently - telemetry should never break the request
      console.warn('[Telemetry] Failed to log retrieval event:', (err as Error).message);
    }
  }

  /**
   * Simple text-based document chunk retrieval using PostgreSQL keyword matching.
   * Returns relevant chunks from the user's documents, scored by keyword match count.
   * Also boosts chunks from documents whose filename matches keywords.
   */
  private async retrieveRelevantChunks(
    userId: string,
    query: string,
    maxChunks: number = 10,
    opts?: { boostFilenames?: string[]; boostTopicEntities?: string[]; scopeDocumentIds?: string[]; minScore?: number },
  ): Promise<Array<{ text: string; filename: string | null; page: number | null; documentId: string; mimeType: string | null; score: number }>> {
    if (!query.trim()) return [];

    // Extract keywords with stop word filtering to prevent generic terms from diluting results
    const rawKeywords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
      .slice(0, 10);

    if (rawKeywords.length === 0) return [];

    // Expand keywords with common English-Portuguese variations
    const keywords = this.expandKeywordsWithTranslations(rawKeywords);

    // Build ILIKE conditions for text content
    const textConditions = keywords.map(
      (_, i) => Prisma.sql`dc."text" ILIKE ${'%' + keywords[i] + '%'}`
    );

    // Build ILIKE conditions for filename/path matching (high boost)
    const filenameConditions = keywords.map(
      (_, i) => Prisma.sql`(COALESCE(d."filename", '') || COALESCE(d."encryptedFilename", '')) ILIKE ${'%' + keywords[i] + '%'}`
    );

    // Score: text matches + filename matches (filename matches get 5x weight)
    const textScoreExprs = keywords.map(
      (_, i) => Prisma.sql`CASE WHEN dc."text" ILIKE ${'%' + keywords[i] + '%'} THEN 1 ELSE 0 END`
    );
    const filenameScoreExprs = keywords.map(
      (_, i) => Prisma.sql`CASE WHEN (COALESCE(d."filename", '') || COALESCE(d."encryptedFilename", '')) ILIKE ${'%' + keywords[i] + '%'} THEN 5 ELSE 0 END`
    );

    // Document focus boost: strongly prefer documents referenced in conversation context
    const boostFilenames = opts?.boostFilenames ?? [];
    const boostExprs = boostFilenames.map(fn => {
      const name = fn.replace(/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i, '');
      return Prisma.sql`CASE WHEN (COALESCE(d."filename", '') || ' ' || COALESCE(d."encryptedFilename", '')) ILIKE ${'%' + name + '%'} THEN 50 ELSE 0 END`;
    });
    const filenameBoost = boostExprs.length > 0
      ? Prisma.join(boostExprs, ' + ')
      : Prisma.sql`0`;

    // Content-based topic boost: prefer chunks mentioning conversation topic entities
    // This handles cases where topic content spans multiple documents (e.g., "Parque Global"
    // content embedded in Koda docs). +30 per matching topic phrase in chunk text.
    const boostTopics = opts?.boostTopicEntities ?? [];
    const topicBoostExprs = boostTopics.map(entity =>
      Prisma.sql`CASE WHEN dc."text" ILIKE ${'%' + entity + '%'} THEN 30 ELSE 0 END`
    );
    const topicBoost = topicBoostExprs.length > 0
      ? Prisma.join(topicBoostExprs, ' + ')
      : Prisma.sql`0`;

    // Hard scope filter: restrict retrieval to specific documents when scope is set
    const scopeDocumentIds = opts?.scopeDocumentIds ?? [];
    const scopeFilter = scopeDocumentIds.length > 0
      ? Prisma.sql`AND d."id" IN (${Prisma.join(scopeDocumentIds)})`
      : Prisma.empty;

    // Minimum score threshold: chunks below this are too weakly matched to be useful.
    // Default 2 = at least 2 keyword matches (or 1 filename match which gives 5).
    // Boosted chunks (filename=50, topic=30) always pass.
    const minScore = opts?.minScore ?? 2;

    const chunks = await prisma.$queryRaw<Array<{
      text: string;
      filename: string | null;
      encryptedFilename: string | null;
      filenameEncrypted: string | null;
      page: number | null;
      documentId: string;
      mimeType: string | null;
      score: number;
    }>>`
      SELECT dc."text", d."filename", d."encryptedFilename", d."filenameEncrypted", dc."page",
             d."id" AS "documentId", d."mimeType",
             (${Prisma.join(textScoreExprs, ' + ')} + ${Prisma.join(filenameScoreExprs, ' + ')} + ${filenameBoost} + ${topicBoost}) AS score
      FROM "document_chunks" dc
      JOIN "documents" d ON dc."documentId" = d."id"
      WHERE d."userId" = ${userId}
        AND dc."text" IS NOT NULL
        ${scopeFilter}
        AND (
          (${Prisma.join(textConditions, ' OR ')})
          OR (${Prisma.join(filenameConditions, ' OR ')})
        )
      ORDER BY score DESC, dc."createdAt" DESC
      LIMIT ${maxChunks}
    `;

    // Filter out chunks below the minimum score threshold
    const scoredChunks = chunks.filter(c => Number(c.score) >= minScore);

    // Batch-decrypt filenames for documents where filename is NULL but filenameEncrypted is set
    const decryptedFilenames = new Map<string, string>();
    const hasEncryptionKey = !!process.env.KODA_MASTER_KEY_BASE64;

    if (hasEncryptionKey) {
      // Collect unique documentIds that need decryption
      const needsDecryption = new Map<string, string>();
      for (const c of scoredChunks) {
        if (!c.filename && c.filenameEncrypted && !needsDecryption.has(c.documentId)) {
          needsDecryption.set(c.documentId, c.filenameEncrypted);
        }
      }

      if (needsDecryption.size > 0) {
        try {
          const enc = new EncryptionService();
          const envelope = new EnvelopeService(enc);
          const tenantKeys = new TenantKeyService(prisma, enc);
          const docKeys = new DocumentKeyService(prisma, enc, tenantKeys, envelope);
          const docCrypto = new DocumentCryptoService(enc);
          const encDocRepo = new EncryptedDocumentRepo(prisma, docKeys, docCrypto);

          for (const [docId] of needsDecryption) {
            try {
              const decrypted = await encDocRepo.getDecryptedFilename(userId, docId);
              if (decrypted) {
                decryptedFilenames.set(docId, decrypted);
              }
            } catch {
              // Decryption failed for this doc — fall through to S3 path extraction
            }
          }
        } catch {
          // Encryption service init failed — fall through to S3 path extraction
        }
      }
    }

    // Build results with fallback chain: filename → decrypted filenameEncrypted → S3 path extraction
    return scoredChunks.filter(c => c.text).map(c => ({
      text: c.text,
      filename: c.filename
        || decryptedFilenames.get(c.documentId)
        || this.extractFilenameFromPath(c.encryptedFilename),
      page: c.page,
      documentId: c.documentId,
      mimeType: c.mimeType,
      score: Number(c.score),
    }));
  }

  /** Extract filename from S3 path like users/.../docs/.../myfile.pdf and clean for display */
  private extractFilenameFromPath(path: string | null): string | null {
    if (!path) return null;
    const segments = path.split('/');
    const raw = segments[segments.length - 1] || null;
    if (!raw) return null;
    return this.cleanFilenameForDisplay(raw);
  }

  /**
   * Clean S3-encoded filenames for human-readable display.
   * Converts underscores to spaces and restores parentheses from double-underscore encoding.
   * Example: "Capítulo_8__Framework_Scrum_.pdf" → "Capítulo 8 (Framework Scrum).pdf"
   */
  private cleanFilenameForDisplay(name: string): string {
    // Separate extension
    const dotIdx = name.lastIndexOf('.');
    const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
    let base = dotIdx > 0 ? name.slice(0, dotIdx) : name;

    // Remove trailing underscore before extension (closing paren artifact)
    base = base.replace(/_$/, '');

    // Restore parentheses: double-underscore → opening/closing parens
    // Pattern: __word1_word2_ represents (word1 word2)
    // We detect __..._ blocks and convert them
    base = base.replace(/__([^_](?:[^_]*[^_])?)_(?=_|$)/g, '($1)');
    // Handle remaining double-underscores as opening paren
    base = base.replace(/__/g, ' (');
    // If we opened a paren but didn't close it, add closing
    const openCount = (base.match(/\(/g) || []).length;
    const closeCount = (base.match(/\)/g) || []).length;
    if (openCount > closeCount) {
      base += ')';
    }

    // Convert remaining single underscores to spaces
    base = base.replace(/_/g, ' ');

    // Clean up extra spaces
    base = base.replace(/\s+/g, ' ').trim();

    return base + ext;
  }

  /** Expand keywords with common English-Portuguese translations */
  private expandKeywordsWithTranslations(keywords: string[]): string[] {
    const translations: Record<string, string[]> = {
      // Building/construction
      mezzanine: ['mezanino'],
      mezanino: ['mezzanine'],
      investment: ['investimento'],
      investimento: ['investment'],
      cost: ['custo'],
      custo: ['cost'],
      budget: ['orçamento', 'orcamento'],
      revenue: ['receita', 'faturamento'],
      receita: ['revenue'],
      profit: ['lucro'],
      lucro: ['profit'],
      analysis: ['analise', 'análise'],
      analise: ['analysis'],
      project: ['projeto'],
      projeto: ['project'],
      total: ['total'],
      // Finance
      payback: ['retorno'],
      retorno: ['payback', 'return'],
      roi: ['retorno'],
      return: ['retorno'],
      // General
      document: ['documento'],
      documento: ['document'],
      area: ['área'],
      price: ['preço', 'preco'],

      // ── Scrum / Agile framework terms (EN→PT, PT→EN) ──
      // Pillars
      pillars: ['pilares', 'pilar'],
      pilares: ['pillars', 'pilar'],
      pilar: ['pillar', 'pillars', 'pilares'],
      transparency: ['transparência', 'transparencia'],
      transparência: ['transparency'],
      transparencia: ['transparency'],
      inspection: ['inspeção', 'inspecao'],
      inspeção: ['inspection'],
      inspecao: ['inspection'],
      adaptation: ['adaptação', 'adaptacao'],
      adaptação: ['adaptation'],
      adaptacao: ['adaptation'],

      // Values
      values: ['valores'],
      valores: ['values'],
      focus: ['foco'],
      foco: ['focus'],
      respect: ['respeito'],
      respeito: ['respect'],
      commitment: ['comprometimento', 'compromisso'],
      comprometimento: ['commitment'],
      compromisso: ['commitment'],
      courage: ['coragem'],
      coragem: ['courage'],
      openness: ['abertura'],
      abertura: ['openness'],

      // Roles
      roles: ['papéis', 'papeis'],
      papéis: ['roles'],
      papeis: ['roles'],
      scrum: ['scrum'],
      master: ['master'],
      owner: ['dono', 'proprietário'],
      dono: ['owner'],
      team: ['time', 'equipe'],
      time: ['team'],
      equipe: ['team'],
      developer: ['desenvolvedor', 'desenvolvimento'],
      desenvolvimento: ['development'],
      development: ['desenvolvimento'],

      // Events / Ceremonies
      events: ['eventos', 'cerimônias', 'cerimonias'],
      eventos: ['events', 'ceremonies'],
      ceremonies: ['cerimônias', 'cerimonias', 'eventos'],
      cerimônias: ['ceremonies', 'events'],
      cerimonias: ['ceremonies', 'events'],
      sprint: ['sprint'],
      planning: ['planejamento'],
      planejamento: ['planning'],
      daily: ['diária', 'diaria', 'reunião'],
      diária: ['daily'],
      diaria: ['daily'],
      review: ['revisão', 'revisao'],
      revisão: ['review'],
      revisao: ['review'],
      retrospective: ['retrospectiva'],
      retrospectiva: ['retrospective'],
      meeting: ['reunião', 'reuniao'],
      reunião: ['meeting'],
      reuniao: ['meeting'],

      // Artifacts
      artifacts: ['artefatos'],
      artefatos: ['artifacts'],
      artifact: ['artefato'],
      artefato: ['artifact'],
      backlog: ['backlog'],
      increment: ['incremento'],
      incremento: ['increment'],
      definition: ['definição', 'definicao'],
      definição: ['definition'],
      definicao: ['definition'],
      done: ['pronto', 'concluído'],
      pronto: ['done'],

      // General Scrum terms
      framework: ['framework'],
      methodology: ['metodologia'],
      metodologia: ['methodology'],
      goal: ['meta', 'objetivo'],
      meta: ['goal'],
      objetivo: ['goal', 'objective'],
      purpose: ['propósito', 'proposito', 'objetivo'],
      impediment: ['impedimento'],
      impedimento: ['impediment'],
      timebox: ['timebox'],
      selforganization: ['autoorganização', 'autoorganizacao'],

      // ── Financial / spreadsheet terms ──
      ebitda: ['ebitda', 'earnings'],
      operating: ['operacional'],
      operacional: ['operating'],
      expenses: ['despesas', 'gastos'],
      despesas: ['expenses'],
      gastos: ['expenses', 'costs'],
      income: ['renda', 'receita'],
      renda: ['income'],
      payroll: ['folha'],
      folha: ['payroll'],
      salaries: ['salários', 'salarios'],
      wages: ['salários', 'salarios'],
      margin: ['margem'],
      margem: ['margin'],
      deductions: ['deduções', 'deducoes'],
      allowances: ['provisões', 'provisoes'],
      depreciation: ['depreciação', 'depreciacao'],
      amortization: ['amortização', 'amortizacao'],
      monthly: ['mensal'],
      mensal: ['monthly'],
      annual: ['anual'],
      anual: ['annual'],
      departmental: ['departamental'],

      // ── Storage / furniture / household terms ──
      guarda: ['storage', 'closet', 'wardrobe', 'guard'],
      storage: ['guarda', 'armazenamento'],
      armazenamento: ['storage'],
      moveis: ['furniture', 'móveis'],
      furniture: ['moveis', 'móveis'],
      'móveis': ['furniture', 'moveis'],
      wardrobe: ['guarda-roupa', 'armário'],
      closet: ['armário', 'closet'],
      'armário': ['closet', 'wardrobe'],
    };

    const expanded = new Set<string>(keywords);
    for (const kw of keywords) {
      const variants = translations[kw];
      if (variants) {
        for (const v of variants) expanded.add(v);
      }
    }

    // Also expand multi-word Scrum concepts from input phrase
    const phrase = keywords.join(' ');
    const conceptExpansions: Array<{ trigger: RegExp; terms: string[] }> = [
      { trigger: /pillars?/i, terms: ['transparência', 'inspeção', 'adaptação', 'pilares'] },
      { trigger: /events?|ceremonies?/i, terms: ['planejamento', 'sprint', 'diária', 'revisão', 'retrospectiva', 'eventos', 'reunião'] },
      { trigger: /artifacts?/i, terms: ['backlog', 'incremento', 'artefatos', 'definição', 'pronto'] },
      { trigger: /roles?/i, terms: ['scrum', 'master', 'owner', 'time', 'desenvolvimento', 'papéis'] },
      { trigger: /values?/i, terms: ['foco', 'respeito', 'comprometimento', 'coragem', 'abertura', 'valores'] },
      // Financial concept expansions
      { trigger: /ebitda|earnings.*before/i, terms: ['ebitda', 'earnings', 'depreciation', 'amortization', 'operating', 'income', 'profit'] },
      { trigger: /revenue.*stream|income.*source/i, terms: ['revenue', 'income', 'receita', 'faturamento', 'operating', 'room', 'food', 'beverage', 'spa'] },
      { trigger: /expense|cost.*categor/i, terms: ['expenses', 'despesas', 'costs', 'custos', 'departmental', 'operating', 'payroll'] },
      { trigger: /payroll|salar|wage/i, terms: ['payroll', 'salaries', 'wages', 'labor', 'compensation', 'folha'] },
      { trigger: /\bf.b\b|food.*bev/i, terms: ['food', 'beverage', 'dining', 'restaurant', 'bar', 'culinary'] },
      { trigger: /profit|bottom.*line|net.*income/i, terms: ['profit', 'net', 'income', 'lucro', 'resultado', 'bottom'] },
      { trigger: /\bmonth|monthly|highest.*month|lowest.*month/i, terms: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'monthly'] },
    ];

    for (const { trigger, terms } of conceptExpansions) {
      if (trigger.test(phrase)) {
        for (const t of terms) expanded.add(t);
      }
    }

    return Array.from(expanded).slice(0, 25);
  }

  /**
   * Build a hierarchical folder tree + document inventory for the user.
   * Uses the buildFolderTree utility for clean, indented tree output.
   * Injected as a system message so the LLM can answer folder-related questions.
   */
  private async buildFolderTreeContext(userId: string): Promise<string> {
    const folders = await prisma.folder.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, parentFolderId: true },
      orderBy: { createdAt: "asc" },
    });

    const documents = await prisma.document.findMany({
      where: {
        userId,
        status: { notIn: ["failed", "uploading"] },
      },
      select: { filename: true, encryptedFilename: true, folderId: true },
      orderBy: { createdAt: "asc" },
    });

    if (folders.length === 0 && documents.length === 0) return "";

    // Resolve display filenames: prefer plaintext, fallback to S3 path extraction
    const resolvedDocs = documents.map(d => ({
      filename: d.filename
        || this.extractFilenameFromPath(d.encryptedFilename),
      folderId: d.folderId,
    }));

    const tree = buildFolderTreeFromRecords(folders, resolvedDocs);
    const treeText = renderFolderTreeWithDocs(tree, { maxDepth: 6 });

    if (!treeText) return "";

    return [
      "DOCUMENT INVENTORY — The user's complete folder tree and file list:",
      "",
      treeText,
      "",
      `Total: ${documents.length} document(s) in ${folders.length} folder(s).`,
    ].join("\n");
  }

  /**
   * Pre-RAG intent classifier. Runs BEFORE retrieval to short-circuit the
   * pipeline for navigation / action queries that don't need RAG context.
   * Priority order — first match wins.
   */
  private classifyIntent(message: string): {
    intent: 'FIND_DOCUMENT_LOCATION' | 'FIND_FOLDER_LOCATION' | 'OPEN_DOCUMENT'
          | 'LIST_LIBRARY' | 'LIST_FOLDERS' | 'LIST_FILES' | 'LIST_FOLDER_CONTENTS'
          | 'NAVIGATE_TREE' | 'NAVIGATE_REASONING' | 'SCOPED_SEARCH'
          | 'FILE_ACTION' | 'RAG_QUERY' | 'GENERAL_CHAT';
    allowSources: boolean;
    allowLocation: boolean;
    skipRAG: boolean;
  } {
    const q = message.toLowerCase().trim();

    // 1. FIND_FOLDER_LOCATION (check before FIND_DOCUMENT_LOCATION — more specific)
    if (
      /\bwhere\s+is\s+the\s+.+\s+folder\b/i.test(q) ||
      /\bem\s+qual\s+pasta\s+fica\b/i.test(q)
    ) {
      return { intent: 'FIND_FOLDER_LOCATION', allowSources: false, allowLocation: true, skipRAG: true };
    }

    // 2. FIND_DOCUMENT_LOCATION
    // Guard: exclude abstract folder reasoning queries (most, each, every, financial, etc.)
    const isFolderReasoningQuery = /\b(most|each|every|all|compare|financial|budget|recent|raw|summarized|redundant|overlapping|purpose|incomplete|missing)\b/i.test(q);
    if (
      !isFolderReasoningQuery && (
        /\bwhere\s+(is|are|did\s+i\s+save)\b/i.test(q) ||
        /\b(which|what)\s+folder\s+(contains?|has)\b/i.test(q) ||
        /\bwhich\s+folder\s+does\b/i.test(q) ||
        /\bbelongs?\s+to\b.*\bfolder\b/i.test(q) ||
        /\bonde\s+est[áa]\b/i.test(q) ||
        /\bem\s+qual\s+pasta\b/i.test(q) ||
        /\b(locate|find)\b.*\b(document|file)\b/i.test(q) ||
        /\bis\s+there\s+any\s+(document|file)\b.*\b(outside|in|inside|under|within|across)\b/i.test(q) ||
        /\bany\s+(document|file)s?\s+(related|about|regarding)\b.*\b(outside|in|inside|under|across|other)\b/i.test(q)
      )
    ) {
      return { intent: 'FIND_DOCUMENT_LOCATION', allowSources: false, allowLocation: true, skipRAG: true };
    }

    // 3. OPEN_DOCUMENT (exclude folder/tree/structure queries)
    if (
      /\b(open|abrir|abra|show\s+me)\b/i.test(q) &&
      /\b(document|file|pdf|doc|arquivo|documento|the\s+\w+)\b/i.test(q) &&
      !/\b(folder|tree|structure|root|hierarchy|subfolders?|all\s+folders?|every\s+folder)\b/i.test(q)
    ) {
      return { intent: 'OPEN_DOCUMENT', allowSources: false, allowLocation: false, skipRAG: true };
    }

    // 4. LIST_FOLDER_CONTENTS
    if (
      /\b(list|show)\s+(everything|all|files?|documents?)\s+(in|inside|under|within)\s+/i.test(q) ||
      /\bwhat('s|s)?\s+(in|inside)\s+(the\s+)?.+\s+folder\b/i.test(q) ||
      /\bwhat\s+files?\s+(are\s+)?(in|inside)\b/i.test(q) ||
      /\bcontents?\s+of\s+.+\s+folder\b/i.test(q) ||
      /\b(listar?|mostrar?)\s+(tudo|arquivos?|documentos?)\s+(dentro|em|na|no)\s+/i.test(q)
    ) {
      return { intent: 'LIST_FOLDER_CONTENTS', allowSources: false, allowLocation: false, skipRAG: true };
    }

    // 5. SCOPED_SEARCH — "search only inside folder X for…", "inside X subfolders, which mention…"
    if (
      /\b(search|find|look)\s+(only\s+)?in(side)?\s+.*\bfolder\b/i.test(q) ||
      /\binside\s+.*\bsub\s*folders?\b.*\b(which|what|mention|contain)\b/i.test(q) ||
      /\bignore\s+.*\b(root|top)\b.*\bsearch\b/i.test(q) ||
      /\b(search|find|look)\s+(only\s+)?in(side)?\s+(the\s+)?\w+\s+(for|mentioning)\b/i.test(q) ||
      /\bignore\b.*\b(root|top)\b.*\b(search|find|only)\b/i.test(q) ||
      /\binside\s+(the\s+)?\w+\s+sub\s*folders?\b/i.test(q)
    ) {
      return { intent: 'SCOPED_SEARCH', allowSources: true, allowLocation: false, skipRAG: false };
    }

    // 5b. NAVIGATE_TREE — deterministic folder structure queries (no LLM)
    if (
      /\bfull\s+folder\s+tree\b/i.test(q) ||
      /\bshow\s+me\s+the\s+full\s+folder/i.test(q) ||
      /\bfolder\s+tree\b/i.test(q) ||
      /\bfull\s+path\s+of\s+(every|all|each)\b/i.test(q) ||
      /\bsame\s+name\s+in\s+different\s+folder/i.test(q) ||
      /\bdeepest\s+sub\s*folder/i.test(q) ||
      /\bdeepest\b/i.test(q) ||
      /\blist\s+all\s+sub\s*folders?\s+inside\b/i.test(q) ||
      /\bhow\s+many\s+files?\s+each\b/i.test(q) ||
      /\bwhich\s+folder\s+contains?\s+the\s+most\s+files\b/i.test(q)
    ) {
      return { intent: 'NAVIGATE_TREE', allowSources: false, allowLocation: true, skipRAG: true };
    }

    // 6. NAVIGATE_REASONING — complex folder questions needing LLM + structure context
    if (
      /\bwhich\s+folder\s+contains?\s+\w+\s+\w+/i.test(q) ||
      /\bcompare\b.*\bfolder/i.test(q) ||
      /\bredundant\b.*\bfolder/i.test(q) ||
      /\bfolder\b.*\bredundant\b/i.test(q) ||
      /\boverlapping\b.*\bfolder/i.test(q) ||
      /\bfolder\b.*\boverlapping\b/i.test(q) ||
      /\bpurpose\s+of\s+(each|every)\s+folder\b/i.test(q) ||
      /\bwhich\s+folder\s+should\b/i.test(q) ||
      /\b(most\s+recent|newest)\s+data\b/i.test(q) ||
      /\braw\s+data\s+vs\b/i.test(q) ||
      /\bdifferent\s+versions?\b/i.test(q) ||
      /\bfolder\b.*\bincomplete\b/i.test(q) ||
      /\bincomplete\b.*\bfolder/i.test(q) ||
      /\bfolder\b.*\bmissing\b/i.test(q) ||
      /\bmissing\b.*\b(expected|documents?)\b/i.test(q) ||
      /\bfolders?\b.*\b(that\s+)?(seem|look)\b/i.test(q) ||
      /\bcompare\s+(the\s+)?spreadsheets?\s+in\s+each\b/i.test(q) ||
      /\bwhat\s+is\s+the\s+purpose\s+of\s+each\s+folder\b/i.test(q) ||
      /\bif\s+i\s+(am\s+)?analyz/i.test(q) ||
      /\bif\s+i\s+upload\b/i.test(q) ||
      /\bwhich\s+folder\b.*\b(focus|start|begin)\b/i.test(q) ||
      /\bfolder\b.*\b(raw\s+data|summarized)\b/i.test(q) ||
      /\bshow\s+me\b.*\b(source|file)\b.*\b(deep|subfolder)\b/i.test(q)
    ) {
      return { intent: 'NAVIGATE_REASONING', allowSources: false, allowLocation: true, skipRAG: true };
    }

    // 7. FILE_ACTION — delegate to existing detectFileAction
    if (getFileActionExecutor().detectOperator(message)) {
      return { intent: 'FILE_ACTION', allowSources: false, allowLocation: false, skipRAG: true };
    }

    // 8. LIST_LIBRARY / LIST_FOLDERS / LIST_FILES — delegate to isFileListingQuery
    const listingCheck = this.isFileListingQuery(message);
    if (listingCheck.isListing) {
      const listIntent = listingCheck.scope === 'folders' ? 'LIST_FOLDERS'
        : listingCheck.scope === 'documents' ? 'LIST_FILES'
        : 'LIST_LIBRARY';
      return { intent: listIntent as any, allowSources: false, allowLocation: false, skipRAG: true };
    }

    // 9. RAG_QUERY — content-oriented questions
    if (
      /\b(what|explain|analyze|summarize|compare|quote|how\s+much|how\s+many|describe|tell\s+me\s+about)\b/i.test(q) &&
      /\b[a-záàâãéêíóôõúç]{3,}\b/i.test(q)
    ) {
      return { intent: 'RAG_QUERY', allowSources: true, allowLocation: false, skipRAG: false };
    }

    // 10. GENERAL_CHAT — fallback
    return { intent: 'GENERAL_CHAT', allowSources: false, allowLocation: false, skipRAG: false };
  }

  /**
   * Detect whether a user query is asking to list their files/folders/documents.
   * Returns the detected language and the scope of what was asked for:
   * - 'all': files + folders (generic "what do I have", "my files")
   * - 'documents': documents/files only (no folders)
   * - 'folders': folders only (no files)
   */
  private isFileListingQuery(message: string): { isListing: boolean; lang: 'en' | 'pt' | 'es'; scope: 'all' | 'documents' | 'folders' } {
    const q = message.toLowerCase().trim();

    // --- Scope detection helper: inspect matched text for what the user asked about ---
    const detectScope = (text: string): 'all' | 'documents' | 'folders' => {
      const hasFolderWord = /\b(folders?|pastas?|carpetas?|folder\s+structure|folder\s+tree)\b/.test(text);
      const hasDocWord = /\b(documents?|documentos?|files?|arquivos?|archivos?|pdfs?|uploads?)\b/.test(text);
      if (hasFolderWord && !hasDocWord) return 'folders';
      if (hasDocWord && !hasFolderWord) return 'documents';
      return 'all';
    };

    // Portuguese patterns (check first — many PT users have EN UI)
    const ptPatterns = [
      /\b(quais?|mostrar?|listar?|exibir)\b.{0,30}\b(arquivos?|documentos?|pastas?)\b/,
      /\b(meus?|minhas?|todos?\s+os?)\s+(arquivos?|documentos?|pastas?)\b/,
      /\bquantos?\b.{0,20}\b(arquivos?|documentos?|pastas?)\b/,
      // Folder-specific listing patterns (PT)
      /\b(listar?|mostrar?)\s+(tudo|arquivos?|documentos?)\s+(dentro|em|na|no)\s+/,
    ];
    if (ptPatterns.some(p => p.test(q))) return { isListing: true, lang: 'pt', scope: detectScope(q) };

    // Spanish patterns
    const esPatterns = [
      /\b(cuáles?|mostrar|listar|enseñar)\b.{0,30}\b(archivos?|documentos?|carpetas?)\b/,
      /\b(mis|todos?\s+los?)\s+(archivos?|documentos?|carpetas?)\b/,
      /\bcuántos?\b.{0,20}\b(archivos?|documentos?|carpetas?)\b/,
    ];
    if (esPatterns.some(p => p.test(q))) return { isListing: true, lang: 'es', scope: detectScope(q) };

    // English patterns
    const enPatterns = [
      /\b(what|which|show|list|display|give me|tell me)\b.{0,30}\b(files?|documents?|folders?|pdfs?|uploads?)\b/,
      /\b(my|all)\s+(files?|documents?|folders?|uploads?)\b/,
      /\bhow many\b.{0,20}\b(files?|documents?|folders?)\b/,
      /\b(files?|documents?|folders?)\s+(do i have|i have|i('ve)?\s+uploaded)\b/,
      /\b(folder\s+structure|file\s+tree|document\s+tree|folder\s+tree)\b/,
      /\b(what('s)?\s+in\s+my\s+(library|storage|account))\b/,
      /\b(everything\s+i('ve)?\s+(uploaded|stored|saved))\b/,
      // Folder-specific listing patterns
      /\b(list|show|what('s)?)\s+(everything|files?|documents?)\s+(in|inside|under|within)\s+/,
      /\b(what('s)?\s+in(side)?)\s+the\s+.+\s+folder\b/,
      /\bcontents?\s+of\s+.+\s+folder\b/,
    ];
    if (enPatterns.some(p => p.test(q))) return { isListing: true, lang: 'en', scope: detectScope(q) };

    return { isListing: false, lang: 'en', scope: 'all' };
  }

  /**
   * Build structured file/folder listing payload for SSE emission.
   * Returns ONLY root folders (with recursive item counts) and root-level files.
   * Nested folders/files are accessible via FolderPreviewModal when the user clicks a folder card.
   */
  private async buildFileListingPayload(userId: string): Promise<{
    items: Array<{
      kind: 'file' | 'folder';
      id: string;
      title: string;
      mimeType?: string;
      itemCount?: number; // recursive total for folders
    }>;
    totalFiles: number;
    totalFolders: number;
  }> {
    const [allFolders, allDocs] = await Promise.all([
      prisma.folder.findMany({
        where: { userId, isDeleted: false },
        select: { id: true, name: true, parentFolderId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.document.findMany({
        where: { userId, status: { notIn: ['failed', 'uploading'] } },
        select: { id: true, filename: true, encryptedFilename: true, mimeType: true, folderId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Separate root folders vs nested
    const rootFolders = allFolders.filter(f => f.parentFolderId === null);
    // Root-level files (not inside any folder)
    const rootFiles = allDocs.filter(d => d.folderId === null);

    // Build children map for recursive counting
    const childrenMap = new Map<string, string[]>();
    for (const f of allFolders) {
      if (f.parentFolderId) {
        const siblings = childrenMap.get(f.parentFolderId) || [];
        siblings.push(f.id);
        childrenMap.set(f.parentFolderId, siblings);
      }
    }

    // Build doc-per-folder map
    const docsPerFolder = new Map<string, number>();
    for (const d of allDocs) {
      if (d.folderId) {
        docsPerFolder.set(d.folderId, (docsPerFolder.get(d.folderId) || 0) + 1);
      }
    }

    // Direct children count (subfolders + docs immediately inside this folder)
    const getDirectItemCount = (folderId: string): number => {
      const directChildren = childrenMap.get(folderId) || [];
      const directDocs = docsPerFolder.get(folderId) || 0;
      return directDocs + directChildren.length;
    };

    const items: Array<{
      kind: 'file' | 'folder';
      id: string;
      title: string;
      mimeType?: string;
      itemCount?: number;
    }> = [];

    // Add root folders with recursive item counts
    for (const f of rootFolders) {
      items.push({
        kind: 'folder',
        id: f.id,
        title: f.name || 'Unnamed Folder',
        itemCount: getDirectItemCount(f.id),
      });
    }

    // Add root-level files
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      csv: 'text/csv', txt: 'text/plain',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
      mp3: 'audio/mpeg', mp4: 'video/mp4', mov: 'video/quicktime',
    };
    for (const d of rootFiles) {
      const filename = d.filename || this.extractFilenameFromPath(d.encryptedFilename) || 'Untitled';
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeType = (d.mimeType && d.mimeType !== 'application/octet-stream')
        ? d.mimeType
        : (mimeMap[ext] || 'application/octet-stream');
      items.push({
        kind: 'file',
        id: d.id,
        title: filename,
        mimeType,
      });
    }

    return { items, totalFiles: allDocs.length, totalFolders: rootFolders.length };
  }

  /**
   * Build full hierarchical tree listing payload for SSE emission.
   * Returns ALL folders and files with a `depth` field for frontend indentation.
   * DFS order: folders before files at each level, sorted alphabetically.
   */
  private async buildFullTreeListingPayload(userId: string): Promise<{
    items: Array<{
      kind: 'file' | 'folder'; id: string; title: string;
      mimeType?: string; itemCount?: number; depth: number;
    }>;
    totalFiles: number; totalFolders: number;
  }> {
    const [allFolders, allDocs] = await Promise.all([
      prisma.folder.findMany({
        where: { userId, isDeleted: false },
        select: { id: true, name: true, parentFolderId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.document.findMany({
        where: { userId, status: { notIn: ['failed', 'uploading'] } },
        select: { id: true, filename: true, encryptedFilename: true, mimeType: true, folderId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Build parentFolderId → children[] map
    const childrenMap = new Map<string, typeof allFolders>();
    for (const f of allFolders) {
      const parentId = f.parentFolderId || '__root__';
      const siblings = childrenMap.get(parentId) || [];
      siblings.push(f);
      childrenMap.set(parentId, siblings);
    }

    // Build folderId → docs[] map
    const docsMap = new Map<string, typeof allDocs>();
    const rootDocs: typeof allDocs = [];
    for (const d of allDocs) {
      if (d.folderId) {
        const arr = docsMap.get(d.folderId) || [];
        arr.push(d);
        docsMap.set(d.folderId, arr);
      } else {
        rootDocs.push(d);
      }
    }

    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      csv: 'text/csv', txt: 'text/plain',
    };

    const items: Array<{
      kind: 'file' | 'folder'; id: string; title: string;
      mimeType?: string; itemCount?: number; depth: number;
    }> = [];

    // Recursive DFS traversal
    const traverse = (parentId: string, depth: number) => {
      const children = childrenMap.get(parentId) || [];
      // Sort folders alphabetically
      const sortedFolders = [...children].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      for (const folder of sortedFolders) {
        const directChildren = (childrenMap.get(folder.id) || []).length;
        const directDocs = (docsMap.get(folder.id) || []).length;
        items.push({
          kind: 'folder',
          id: folder.id,
          title: folder.name || 'Unnamed Folder',
          itemCount: directChildren + directDocs,
          depth,
        });
        // Recurse into subfolder
        traverse(folder.id, depth + 1);
        // Emit files inside this folder
        const folderDocs = docsMap.get(folder.id) || [];
        const sortedDocs = [...folderDocs].sort((a, b) => {
          const nameA = a.filename || this.extractFilenameFromPath(a.encryptedFilename) || '';
          const nameB = b.filename || this.extractFilenameFromPath(b.encryptedFilename) || '';
          return nameA.localeCompare(nameB);
        });
        for (const d of sortedDocs) {
          const filename = d.filename || this.extractFilenameFromPath(d.encryptedFilename) || 'Untitled';
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          const mimeType = (d.mimeType && d.mimeType !== 'application/octet-stream')
            ? d.mimeType
            : (mimeMap[ext] || 'application/octet-stream');
          items.push({ kind: 'file', id: d.id, title: filename, mimeType, depth: depth + 1 });
        }
      }
    };

    // Start from root (parentFolderId === null → key '__root__')
    traverse('__root__', 0);

    // Add root-level files (not inside any folder)
    const sortedRootDocs = [...rootDocs].sort((a, b) => {
      const nameA = a.filename || this.extractFilenameFromPath(a.encryptedFilename) || '';
      const nameB = b.filename || this.extractFilenameFromPath(b.encryptedFilename) || '';
      return nameA.localeCompare(nameB);
    });
    for (const d of sortedRootDocs) {
      const filename = d.filename || this.extractFilenameFromPath(d.encryptedFilename) || 'Untitled';
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeType = (d.mimeType && d.mimeType !== 'application/octet-stream')
        ? d.mimeType
        : (mimeMap[ext] || 'application/octet-stream');
      items.push({ kind: 'file', id: d.id, title: filename, mimeType, depth: 0 });
    }

    return { items, totalFiles: allDocs.length, totalFolders: allFolders.length };
  }

  /**
   * Build a natural-language intro line for file/folder listings.
   * Adapts to whether only documents, only folders, or both are shown.
   */
  private buildListingIntro(lang: string, folderCount: number, docCount: number): string {
    const f = folderCount;
    const d = docCount;
    const hasFolders = f > 0;
    const hasDocs = d > 0;

    if (lang === 'pt') {
      if (hasFolders && hasDocs) return `Aqui estão suas **${f}** pasta${f !== 1 ? 's' : ''} e **${d}** documento${d !== 1 ? 's' : ''}:`;
      if (hasFolders) return `Aqui estão suas **${f}** pasta${f !== 1 ? 's' : ''}:`;
      return `Aqui estão seus **${d}** documento${d !== 1 ? 's' : ''}:`;
    }
    if (lang === 'es') {
      if (hasFolders && hasDocs) return `Aquí están tus **${f}** carpeta${f !== 1 ? 's' : ''} y **${d}** documento${d !== 1 ? 's' : ''}:`;
      if (hasFolders) return `Aquí están tus **${f}** carpeta${f !== 1 ? 's' : ''}:`;
      return `Aquí están tus **${d}** documento${d !== 1 ? 's' : ''}:`;
    }
    // English
    if (hasFolders && hasDocs) return `Here are your **${f}** folder${f !== 1 ? 's' : ''} and **${d}** document${d !== 1 ? 's' : ''}:`;
    if (hasFolders) return `Here are your **${f}** folder${f !== 1 ? 's' : ''}:`;
    return `Here are your **${d}** document${d !== 1 ? 's' : ''}:`;
  }

  /**
   * Build context string from retrieved chunks, with mode-specific instructions.
   */
  private buildRAGContext(
    chunks: Array<{ text: string; filename: string | null; page: number | null; documentId?: string; mimeType?: string | null }>,
    answerMode: AnswerMode,
    language?: "en" | "pt" | "es",
  ): string {
    if (chunks.length === 0) return '';

    const contextParts = chunks.map((c, i) => {
      const source = c.filename ? `[${c.filename}${c.page ? `, p.${c.page}` : ''}]` : `[Document ${i + 1}]`;
      // Include docId and mimeType as metadata so the LLM can emit koda://source links
      const meta = c.documentId ? ` {docId=${c.documentId}, mime=${c.mimeType || 'application/octet-stream'}}` : '';
      return `${source}${meta}:\n${c.text.slice(0, 1500)}`;
    });

    const baseInstructions = [
      '- Answer the user\'s question using ONLY the document excerpts above.',
      '- SOURCE ATTRIBUTION IS FULLY HANDLED BY THE UI. You must NEVER include source references in your answer text. Specifically:',
      '  - NEVER write filenames in backticks like `filename.pdf`',
      '  - NEVER append attribution lines like "— Filename.pdf" or "— Filename.pdf, p. X" at the end',
      '  - NEVER add inline citations like "(Filename.pdf, p.4)"',
      '  - NEVER list filenames as bullet points or numbered items',
      '  - The UI renders interactive source pills below your answer automatically.',
      '',
      '- CURRENCY FORMATTING: Never use LaTeX-style $...$ wrapping. For negative values use accounting parentheses: ($383,893.23). For positive values: $24,972,043.79. Always include a single $ sign before the number.',
      '',
      '- CALCULATION / RATIO QUESTIONS: When the user asks for a ratio, margin, percentage, or computed value, use this exact structure:',
      '  1. One-sentence answer with the result bolded.',
      '  2. An "Inputs" markdown table with columns: Input | Value (NO Source column - the UI renders sources separately).',
      '  3. **Formula:** line showing the formula name.',
      '  4. **Calculation:** line with actual numbers plugged in.',
      '  5. **Result:** line with the final computed value.',
      '',
      '- ABSOLUTELY FORBIDDEN phrases (never use these under any circumstances): "I cannot", "I can\'t", "I\'m sorry", "I apologize", "I\'m unable", "does not contain", "cannot find", "no relevant information", "the provided excerpts do not", "the excerpts do not". If you catch yourself starting a sentence with any of these, STOP and rewrite it.',
      '- When quoting text from a document, use markdown blockquote format (no attribution line — the UI handles it):',
      '  > exact quoted text here',
      '- If the excerpts don\'t fully cover the topic, state what you DID find and suggest 2-4 related search terms. Example: "Based on these excerpts, here\'s what I found: [content]. For more details, try searching for: \'X\', \'Y\', or \'Z\'."',
      '- Be direct, concise, and helpful. No unnecessary preambles.',
      '',
      '- WRITING STYLE — PARAGRAPHS FIRST (CRITICAL):',
      '  - Use flowing paragraphs as your PRIMARY structure. Write clean, readable prose.',
      '  - Use **bold** to emphasize key values, names, dates, and numbers within paragraphs.',
      '  - Use bullet points ONLY when listing 3+ discrete items that have no narrative dependency (e.g., a list of names, roles, or distinct features).',
      '  - If the user explicitly asks for "list", "bullet points", "enumerate", or "top N items", then use bullets.',
      '  - NEVER use bullets as a default format. If in doubt, write a paragraph.',
      '  - For list questions (roles, events, artifacts, steps, etc.), you MAY use bullets but provide ALL items mentioned in the documents — be exhaustive.',
      '  - Long explanations should use short paragraphs (2-3 sentences each) with bold lead-ins, not chains of bullets.',
      '  - WRONG: "- The project covers X\\n- The budget is Y\\n- The timeline is Z"',
      '  - CORRECT: "The project covers **X** with a budget of **Y**. The timeline extends to **Z**, encompassing three distinct phases."',
      '',
      '- FOLDER LISTING RULE (MANDATORY):',
      '  When the user asks to list folders or show folder structure, you MUST output a hierarchical tree, not full repeated paths.',
      '  - Do NOT print raw path strings like "root/subfolder/child/" on separate lines.',
      '  - Group by top-level folders and show nested structure with indentation.',
      '  - Show each folder name only once in the tree.',
      '  - Use simple tree characters (\u251C\u2500, \u2514\u2500) or indentation, and append "/" to folder names.',
      '  - Use a folder icon prefix "\u{1F4C1}" for folders and "\u{1F4C4}" for documents.',
      '  - Keep the output compact: show at most 3\u20134 levels deep by default. If deeper levels exist, offer to expand.',
      '  - Do NOT wrap the tree in a code block. Output as plain text.',
    ];

    // Mode-specific instructions
    const modeInstructions: string[] = [];
    if (answerMode === 'nav_pills') {
      modeInstructions.push(
        '- NAVIGATION MODE: The user wants to find or open a document. Write ONLY 1-2 sentences confirming you found it and what it covers. Do NOT list filenames, do NOT use backticks, do NOT number documents. The UI automatically renders clickable document pills. Example: "Here\'s the document you\'re looking for — it covers the budgeted P&L for 2025 including revenue streams and expense categories."',
      );
    } else if (answerMode === 'doc_grounded_quote') {
      modeInstructions.push(
        '- QUOTE MODE: The user wants an exact quote. Use blockquote format. Include the original language text and page number.',
      );
    }

    // Language enforcement instruction
    const langInstructions: string[] = [];
    if (language && language !== 'en') {
      const langName = language === 'pt' ? 'Portuguese' : language === 'es' ? 'Spanish' : 'English';
      langInstructions.push(
        '',
        `- LANGUAGE: You MUST respond entirely in ${langName}. Every word of your answer must be in ${langName}. Do not mix languages.`,
      );
    }

    return [
      `Here are relevant excerpts from the user's documents:\n\n${contextParts.join('\n\n---\n\n')}`,
      '',
      'INSTRUCTIONS:',
      ...baseInstructions,
      ...modeInstructions,
      ...langInstructions,
    ].join('\n');
  }

  /**
   * Derive answerMode from query + retrieval results.
   */
  private deriveAnswerMode(
    query: string,
    sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>,
    chunkScores?: number[],
  ): AnswerMode {
    const q = query.toLowerCase().trim();

    // Navigation queries → nav_pills (safety net for queries that slip past classifyIntent)
    if (/\b(open|show me|find|discover|locate|where is)\b.*\b(document|file|pdf|doc)\b/i.test(q)) {
      return 'nav_pills';
    }
    if (/\b(which|what)\s+folder\s+(contains?|has)\b/i.test(q)) {
      return 'nav_pills';
    }
    if (/\bwhere\s+(is|are|did\s+i\s+save)\b/i.test(q)) {
      return 'nav_pills';
    }
    if (/\b(em\s+qual\s+pasta|onde\s+est[áa]|onde\s+fica)\b/i.test(q)) {
      return 'nav_pills';
    }
    if (/\b(locate|find)\b.*\b(folder|document|file)\b/i.test(q)) {
      return 'nav_pills';
    }
    if (/\bopen\b/i.test(q) && sources.length > 0) {
      return 'nav_pills';
    }

    // Quote queries → doc_grounded_quote
    if (/\b(quote|exact (?:words?|sentence|line|text)|verbatim|cite)\b/i.test(q)) {
      return sources.length > 0 ? 'doc_grounded_quote' : 'fallback';
    }

    // Doc-grounded when we have sources — but only if retrieval quality is adequate.
    // If the best chunk score is too low, the retrieval is weak noise and
    // we should fall back to general_answer (no source pills).
    if (sources.length > 0) {
      const scores = chunkScores ?? [];
      const topScore = scores.length > 0 ? Math.max(...scores) : Infinity;
      // Adequacy threshold: top chunk must have score >= 3 (at least 3 keyword hits,
      // or 1 filename match which gives 5). This prevents single-keyword noise
      // from triggering doc_grounded mode with irrelevant source pills.
      if (topScore < 3) {
        return 'general_answer';
      }
      const uniqueDocs = new Set(sources.map(s => s.documentId));
      return uniqueDocs.size > 1 ? 'doc_grounded_multi' : 'doc_grounded_single';
    }

    return 'general_answer';
  }

  /**
   * Derive navType from query when answerMode is nav_pills.
   */
  private deriveNavType(query: string, answerMode: AnswerMode): NavType {
    if (answerMode !== 'nav_pills') return null;

    const q = query.toLowerCase();
    if (/\bopen\b/.test(q)) return 'open';
    if (/\b(where|locate|find)\b/.test(q)) return 'where';
    return 'discover';
  }

  /**
   * Build deduplicated sources array from retrieved chunks.
   * Deduplicates by documentId (first occurrence = highest score), limited to 5.
   */
  private buildSourcesFromChunks(
    chunks: Array<{ text: string; filename: string | null; page: number | null; documentId: string; mimeType: string | null }>,
  ): Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }> {
    const seen = new Set<string>();
    const sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }> = [];

    for (const chunk of chunks) {
      if (seen.has(chunk.documentId)) continue;
      if (!chunk.filename) continue;
      seen.add(chunk.documentId);
      sources.push({
        documentId: chunk.documentId,
        filename: chunk.filename,
        mimeType: chunk.mimeType,
        page: chunk.page,
      });
      if (sources.length >= 5) break;
    }

    return sources;
  }

  /**
   * Convert source objects to listing items (for nav_pills mode).
   * Listing items use the same shape as folder/file listing events.
   */
  private sourcesToListingItems(
    sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>
  ): Array<{ kind: 'file'; id: string; title: string; mimeType: string }> {
    return sources.map(s => ({
      kind: 'file' as const,
      id: s.documentId,
      title: s.filename,
      mimeType: s.mimeType || 'application/octet-stream',
    }));
  }

  /**
   * Resolve a document by fuzzy name from a natural language query.
   * Strips stop words and verbs, expands with translations, and queries
   * the documents table with ILIKE. Returns the best match or null.
   */
  /**
   * Resolve document candidates by fuzzy name from a natural language query.
   * Returns scored array sorted by score descending, capped at topN.
   */
  private async resolveDocumentCandidates(
    userId: string, query: string, topN: number = 5
  ): Promise<Array<{ id: string; filename: string; folderId: string | null; mimeType: string | null; score: number }>> {
    const q = query.toLowerCase();
    // Strip common verbs and stop words to isolate the document name
    const stripped = q.replace(
      /\b(where|is|are|the|which|folder|contains?|has|did|i|save|find|locate|open|show|me|abrir|abra|onde|está|esta|em|qual|pasta|fica|my|a|an|in|to|of|document|file|that)\b/gi, ' '
    ).replace(/[?!.,;:'"]/g, ' ').replace(/\s+/g, ' ').trim();

    const words = stripped.split(' ').filter(w => w.length >= 2);
    if (words.length === 0) return [];

    // Expand with translations
    const expanded = this.expandKeywordsWithTranslations(words);
    const searchTerms = [...new Set([...words, ...expanded])];

    // Extract year tokens from query
    const queryYears = searchTerms.filter(t => /^20\d{2}$/.test(t));

    // Query documents with ILIKE for each search term (check both filename and encryptedFilename/S3 path)
    const allDocs = await prisma.document.findMany({
      where: {
        userId,
        status: { notIn: ['failed', 'uploading'] },
        OR: searchTerms.flatMap(term => [
          { filename: { contains: term, mode: 'insensitive' as const } },
          { encryptedFilename: { contains: term, mode: 'insensitive' as const } },
        ]),
      },
      select: { id: true, filename: true, encryptedFilename: true, folderId: true, mimeType: true },
    });

    if (allDocs.length === 0) return [];

    // Score each doc by how many search terms appear in its resolved filename
    const scored: Array<{ id: string; filename: string; folderId: string | null; mimeType: string | null; score: number }> = [];
    for (const doc of allDocs) {
      const resolvedName = doc.filename || this.extractFilenameFromPath(doc.encryptedFilename) || '';
      const fn = resolvedName.toLowerCase();
      let score = 0;
      for (const term of searchTerms) {
        if (fn.includes(term)) {
          score += /^20\d{2}$/.test(term) ? 3 : 1;  // Years worth 3x
        }
      }
      // Penalize docs with wrong year
      if (queryYears.length > 0) {
        const fileYears: string[] = fn.match(/20\d{2}/g) || [];
        for (const qy of queryYears) {
          if (!fileYears.includes(qy) && fileYears.length > 0) {
            score -= 2;  // Has a year, but not the one we want
          }
        }
      }
      if (score > 0) {
        scored.push({
          id: doc.id,
          filename: resolvedName || 'Document',
          folderId: doc.folderId,
          mimeType: doc.mimeType,
          score,
        });
      }
    }

    // Sort by score descending, cap at topN
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN);
  }

  private async resolveDocumentByFuzzyName(
    userId: string, query: string
  ): Promise<{ id: string; filename: string; folderId: string | null; mimeType: string | null } | null> {
    const candidates = await this.resolveDocumentCandidates(userId, query, 1);
    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * Resolve the full folder hierarchy path for a given folderId.
   * Returns path from root to leaf, e.g. [{name: "trabalhos"}, {name: "stress test"}, {name: "pdf"}].
   */
  private async resolveFolderPath(
    userId: string, folderId: string
  ): Promise<Array<{ id: string; name: string }>> {
    const path: Array<{ id: string; name: string }> = [];
    let currentId: string | null = folderId;

    // Walk up the folder tree (max 20 levels to prevent infinite loops)
    for (let i = 0; i < 20 && currentId; i++) {
      const folder: { id: string; name: string | null; parentFolderId: string | null } | null = await prisma.folder.findFirst({
        where: { id: currentId, userId, isDeleted: false },
        select: { id: true, name: true, parentFolderId: true },
      });
      if (!folder) break;
      path.unshift({ id: folder.id, name: folder.name || 'Unnamed' });
      currentId = folder.parentFolderId;
    }

    return path;
  }

  /**
   * Resolve a folder by fuzzy name extracted from a natural language query.
   * Looks for patterns like "inside X folder", "in the X folder", etc.
   */
  private async resolveFolderByFuzzyName(
    userId: string, query: string
  ): Promise<{ id: string; name: string } | null> {
    const q = query.toLowerCase();

    // Extract folder name from common patterns
    let folderName: string | null = null;

    // Pattern: "in/inside/within/of folder X" or "in/inside X folder"
    const patterns = [
      /\b(?:in|inside|within|of|into)\s+(?:the\s+)?(?:folder\s+)["']?([^"'\n,]{2,40})["']?(?:\s+folder)?\b/i,
      /\b(?:in|inside|within|into)\s+(?:the\s+)?["']?([^"'\n,]{2,40})["']?\s+(?:folder|subfolders?)\b/i,
      /\bfolder\s+["']?([^"'\n,]{2,40})["']?\b/i,
      /\bpasta\s+["']?([^"'\n,]{2,40})["']?\b/i,
    ];

    for (const pat of patterns) {
      const m = q.match(pat);
      if (m) {
        // Clean up: remove trailing stop words
        folderName = m[1].trim().replace(/\s+(for|mentioning|that|which|files?|documents?)\s*$/i, '').trim();
        break;
      }
    }

    if (!folderName || folderName.length < 2) return null;

    // Query folders with case-insensitive contains
    const folder = await prisma.folder.findFirst({
      where: {
        userId,
        isDeleted: false,
        name: { contains: folderName, mode: 'insensitive' as const },
      },
      select: { id: true, name: true },
    });

    return folder ? { id: folder.id, name: folder.name || 'Unnamed' } : null;
  }

  /**
   * Build scoped folder listing payload — direct children of a given folder.
   */
  private async buildScopedFolderListingPayload(
    userId: string, folderId: string
  ): Promise<Array<{ kind: 'file' | 'folder'; id: string; title: string; mimeType?: string; itemCount?: number }>> {
    const [childFolders, childDocs] = await Promise.all([
      prisma.folder.findMany({
        where: { userId, parentFolderId: folderId, isDeleted: false },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.document.findMany({
        where: { userId, folderId, status: { notIn: ['failed', 'uploading'] } },
        select: { id: true, filename: true, encryptedFilename: true, mimeType: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Count docs per child folder for itemCount
    const folderDocCounts = await Promise.all(
      childFolders.map(async (f) => {
        const count = await prisma.document.count({
          where: { userId, folderId: f.id, status: { notIn: ['failed', 'uploading'] } },
        });
        return { folderId: f.id, count };
      })
    );
    const countMap = new Map(folderDocCounts.map(fc => [fc.folderId, fc.count]));

    const items: Array<{ kind: 'file' | 'folder'; id: string; title: string; mimeType?: string; itemCount?: number }> = [];

    for (const f of childFolders) {
      items.push({
        kind: 'folder',
        id: f.id,
        title: f.name || 'Unnamed Folder',
        itemCount: countMap.get(f.id) || 0,
      });
    }

    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      csv: 'text/csv', txt: 'text/plain',
    };

    for (const d of childDocs) {
      const filename = d.filename || this.extractFilenameFromPath(d.encryptedFilename) || 'Untitled';
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeType = (d.mimeType && d.mimeType !== 'application/octet-stream')
        ? d.mimeType
        : (mimeMap[ext] || 'application/octet-stream');
      items.push({ kind: 'file', id: d.id, title: filename, mimeType });
    }

    return items;
  }

  /**
   * Recursively collect all document IDs within a folder tree.
   */
  private async getRecursiveDocumentIds(userId: string, folderId: string): Promise<string[]> {
    const docIds: string[] = [];
    const queue: string[] = [folderId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      // Get docs in this folder
      const docs = await prisma.document.findMany({
        where: { userId, folderId: currentId, status: { notIn: ['failed', 'uploading'] } },
        select: { id: true },
      });
      for (const d of docs) docIds.push(d.id);

      // Get child folders
      const children = await prisma.folder.findMany({
        where: { userId, parentFolderId: currentId, isDeleted: false },
        select: { id: true },
      });
      for (const c of children) queue.push(c.id);
    }

    return docIds;
  }

  /**
   * Handle FIND_DOCUMENT_LOCATION and FIND_FOLDER_LOCATION intents.
   * Uses DB lookups (NOT RAG) to locate documents and their folder paths.
   */
  private async handleDocumentLocationQuery(
    userId: string, message: string, conversationId: string,
    sink: StreamSink, streamingConfig: LLMStreamingConfig,
    existingUserMsgId?: string,
  ): Promise<ChatResult> {
    // Persist user message (skip on regenerate — reuse existing)
    const userMsg = existingUserMsgId
      ? { id: existingUserMsgId }
      : await this.createMessage({ conversationId, role: 'user', content: message, userId });

    // Try to find the document
    const doc = await this.resolveDocumentByFuzzyName(userId, message);

    let responseText: string;
    let listingItems: Array<{ kind: 'file'; id: string; title: string; mimeType: string }> = [];
    let breadcrumb: Array<{ id: string; name: string }> = [];

    if (doc) {
      listingItems = [{
        kind: 'file' as const,
        id: doc.id,
        title: doc.filename,
        mimeType: doc.mimeType || 'application/octet-stream',
      }];

      if (doc.folderId) {
        breadcrumb = await this.resolveFolderPath(userId, doc.folderId);
        const leafFolder = breadcrumb[breadcrumb.length - 1];
        responseText = `**${doc.filename}** is in the **${leafFolder.name}** folder.`;
      } else {
        responseText = `**${doc.filename}** is at the top level of your library.`;
      }
    } else {
      responseText = "I couldn't find a document matching that name in your library. Try checking the exact name or listing your files.";
    }

    // Safety net: strip any raw paths
    responseText = this.stripRawPaths(responseText);

    // Emit meta
    if (sink.isOpen()) {
      sink.write({ event: 'meta', data: { answerMode: 'nav_pills', answerClass: 'NAVIGATION', navType: 'where' } } as any);
    }

    // Emit listing with breadcrumb
    if (listingItems.length > 0 && sink.isOpen()) {
      sink.write({ event: 'listing', data: { items: listingItems, breadcrumb } } as any);
    }

    // Emit response text
    if (sink.isOpen()) {
      sink.write({ event: 'delta', data: { text: responseText } } as any);
    }

    // Persist assistant message
    const assistantMsg = await this.createMessage({
      conversationId, role: 'assistant', content: responseText, userId,
      metadata: { listing: listingItems, breadcrumb, sources: [], answerMode: 'nav_pills' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: 'where' as NavType },
    });

    // Auto-generate conversation title if needed
    let generatedTitle: string | undefined;
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { title: true },
    });
    if (conv && (!conv.title || conv.title === 'New Chat')) {
      generatedTitle = this.generateTitleFromMessage(message);
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: generatedTitle, updatedAt: new Date() },
      });
    }

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: responseText,
      sources: [],
      listing: listingItems,
      breadcrumb,
      answerMode: 'nav_pills' as AnswerMode,
      answerClass: 'NAVIGATION' as AnswerClass,
      navType: 'where' as NavType,
      generatedTitle,
    };
  }

  /**
   * Handle OPEN_DOCUMENT intent. Finds the document by fuzzy name
   * and emits nav_pills so the frontend can open it.
   */
  private async handleOpenDocumentQuery(
    userId: string, message: string, conversationId: string,
    sink: StreamSink, streamingConfig: LLMStreamingConfig,
    existingUserMsgId?: string,
  ): Promise<ChatResult> {
    const userMsg = existingUserMsgId
      ? { id: existingUserMsgId }
      : await this.createMessage({ conversationId, role: 'user', content: message, userId });

    const candidates = await this.resolveDocumentCandidates(userId, message, 5);

    let responseText: string;
    let listingItems: Array<{ kind: 'file'; id: string; title: string; mimeType: string }> = [];

    if (candidates.length === 1) {
      // Single match — existing behavior
      const doc = candidates[0];
      listingItems = [{
        kind: 'file' as const,
        id: doc.id,
        title: doc.filename,
        mimeType: doc.mimeType || 'application/octet-stream',
      }];
      responseText = `Here's **${doc.filename}** — click to open it.`;

    } else if (candidates.length > 1) {
      // Multiple matches — show candidates as pills
      listingItems = candidates.map(doc => ({
        kind: 'file' as const,
        id: doc.id,
        title: doc.filename,
        mimeType: doc.mimeType || 'application/octet-stream',
      }));
      responseText = `I found ${candidates.length} files that could match. Which one did you mean?`;

    } else {
      // Zero matches — show full file listing as fallback
      const rootListing = await this.buildFileListingPayload(userId);
      listingItems = rootListing.items.filter(i => i.kind === 'file') as any;
      responseText = "I couldn't find an exact match. Here are your files:";
    }

    if (sink.isOpen()) {
      sink.write({ event: 'meta', data: { answerMode: 'nav_pills', answerClass: 'NAVIGATION', navType: 'open' } } as any);
    }
    if (listingItems.length > 0 && sink.isOpen()) {
      sink.write({ event: 'listing', data: { items: listingItems } } as any);
    }
    if (sink.isOpen()) {
      sink.write({ event: 'delta', data: { text: responseText } } as any);
    }

    const assistantMsg = await this.createMessage({
      conversationId, role: 'assistant', content: responseText, userId,
      metadata: { listing: listingItems, sources: [], answerMode: 'nav_pills' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: 'open' as NavType },
    });

    let generatedTitle: string | undefined;
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { title: true },
    });
    if (conv && (!conv.title || conv.title === 'New Chat')) {
      generatedTitle = this.generateTitleFromMessage(message);
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: generatedTitle, updatedAt: new Date() },
      });
    }

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: responseText,
      sources: [],
      listing: listingItems,
      answerMode: 'nav_pills' as AnswerMode,
      answerClass: 'NAVIGATION' as AnswerClass,
      navType: 'open' as NavType,
      generatedTitle,
    };
  }

  /**
   * Handle NAVIGATE_TREE intent — fully deterministic, no LLM call.
   * Returns a one-liner intro + hierarchical pill listing with depth info.
   */
  private async handleNavigateTreeQuery(
    userId: string, message: string, conversationId: string,
    sink: StreamSink, streamingConfig: LLMStreamingConfig,
    existingUserMsgId?: string,
  ): Promise<ChatResult> {
    const userMsg = existingUserMsgId
      ? { id: existingUserMsgId }
      : await this.createMessage({ conversationId, role: 'user', content: message, userId });

    // Build full tree listing
    const treeListing = await this.buildFullTreeListingPayload(userId);
    const introText = `Here's your complete folder tree — **${treeListing.totalFolders}** folders and **${treeListing.totalFiles}** files:`;

    // Emit SSE events
    if (sink.isOpen()) {
      sink.write({ event: 'meta', data: { answerMode: 'nav_pills', answerClass: 'NAVIGATION', navType: 'discover' } } as any);
    }
    if (treeListing.items.length > 0 && sink.isOpen()) {
      sink.write({ event: 'listing', data: { items: treeListing.items } } as any);
    }
    if (sink.isOpen()) {
      sink.write({ event: 'delta', data: { text: introText } } as any);
    }

    // Persist
    const assistantMsg = await this.createMessage({
      conversationId, role: 'assistant', content: introText, userId,
      metadata: { listing: treeListing.items, sources: [], answerMode: 'nav_pills' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: 'discover' as NavType },
    });

    // Auto-generate title
    let generatedTitle: string | undefined;
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { title: true },
    });
    if (conv && (!conv.title || conv.title === 'New Chat')) {
      generatedTitle = this.generateTitleFromMessage(message);
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: generatedTitle, updatedAt: new Date() },
      });
    }

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: introText,
      sources: [],
      listing: treeListing.items,
      answerMode: 'nav_pills' as AnswerMode,
      answerClass: 'NAVIGATION' as AnswerClass,
      navType: 'discover' as NavType,
      generatedTitle,
    };
  }

  /**
   * Handle NAVIGATE_REASONING intent — complex folder questions needing LLM + structure context.
   * Provides folder tree to LLM with instructions to avoid raw paths, then emits folder pills.
   */
  private async handleNavigateReasoningQuery(
    userId: string, message: string, conversationId: string,
    sink: StreamSink, streamingConfig: LLMStreamingConfig,
    history: Array<{ role: ChatRole; content: string }>,
    existingUserMsgId?: string,
  ): Promise<ChatResult> {
    const userMsg = existingUserMsgId
      ? { id: existingUserMsgId }
      : await this.createMessage({ conversationId, role: 'user', content: message, userId });

    // Build folder tree context
    const folderTreeContext = await this.buildFolderTreeContext(userId);
    const messagesWithContext: Array<{ role: ChatRole; content: string }> = [...history];
    if (folderTreeContext) {
      messagesWithContext.push({ role: 'system' as ChatRole, content: folderTreeContext });
    }
    messagesWithContext.push({
      role: 'system' as ChatRole,
      content: [
        'You are answering a question about the user\'s folder structure.',
        'Rules:',
        '- Answer in ONE short paragraph (2-3 sentences max).',
        '- Do NOT use bullet lists, numbered lists, or markdown lists.',
        '- Do NOT output raw file paths like `folder/subfolder/file.ext`.',
        '- Do NOT wrap filenames in backticks or bold — the UI shows interactive pills.',
        '- Refer to folders and files by name only (e.g. "the Finance folder").',
        '- Focus on insight, not enumeration.',
      ].join('\n'),
    });
    messagesWithContext.push({ role: 'user' as ChatRole, content: message });

    // Call LLM
    const traceId = `nav_reason_${Date.now().toString(36)}`;

    let cleanedText: string;
    if (sink.isOpen()) {
      // Buffer LLM output — don't stream raw text to client
      const chunks: string[] = [];
      const bufferSink: StreamSink = {
        transport: 'sse' as any,
        write(event: any) { if (event.event === 'delta' && event.data?.text) chunks.push(event.data.text); },
        flush() {}, close() {}, isOpen() { return true; },
      };
      const streamed = await this.engine.stream({
        traceId, userId, conversationId, messages: messagesWithContext,
        sink: bufferSink, streamingConfig,
      });
      cleanedText = streamed.finalText ?? chunks.join('');
    } else {
      // Non-streaming path — use engine.generate
      const engineOut = await this.engine.generate({
        traceId, userId, conversationId, messages: messagesWithContext,
      });
      cleanedText = engineOut.text ?? '';
    }

    // Post-process: strip raw paths + guard forbidden phrases + lists + truncation
    cleanedText = this.stripRawPaths(cleanedText);
    cleanedText = this.guardForbiddenPhrases(cleanedText, 'nav_pills');
    cleanedText = this.stripRawFilenames(cleanedText);
    cleanedText = this.stripMarkdownLists(cleanedText);
    // Strip bold markers — LLM keeps wrapping folder names in ** despite instructions
    cleanedText = cleanedText.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
    // Safety net: truncate to first 2 sentences if too long
    if (cleanedText.length > 300) {
      const sentences = cleanedText.match(/[^.!?]+[.!?]+/g) || [cleanedText];
      cleanedText = sentences.slice(0, 2).join(' ').trim();
    }
    if (!cleanedText.trim()) cleanedText = "Here's what I found about your folder structure.";

    // Build folder pills: only show folders the LLM actually mentioned
    const allFolders = await prisma.folder.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, parentFolderId: true },
    });
    const textLower = cleanedText.toLowerCase();
    const mentionedFolders = allFolders.filter(f =>
      f.name && textLower.includes(f.name.toLowerCase())
    );
    const listingItems: Array<{ kind: 'file' | 'folder'; id: string; title: string; mimeType?: string; itemCount?: number }> =
      mentionedFolders.map(f => ({
        kind: 'folder' as const,
        id: f.id,
        title: f.name || 'Unnamed Folder',
      }));

    // Emit SSE events
    if (sink.isOpen()) {
      sink.write({ event: 'meta', data: { answerMode: 'nav_pills', answerClass: 'NAVIGATION', navType: 'discover' } } as any);
    }
    if (listingItems.length > 0 && sink.isOpen()) {
      sink.write({ event: 'listing', data: { items: listingItems } } as any);
    }
    if (sink.isOpen()) {
      sink.write({ event: 'delta', data: { text: cleanedText } } as any);
    }

    // Persist
    const assistantMsg = await this.createMessage({
      conversationId, role: 'assistant', content: cleanedText, userId,
      metadata: { listing: listingItems, sources: [], answerMode: 'nav_pills' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: 'discover' as NavType },
    });

    // Auto-generate title
    let generatedTitle: string | undefined;
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { title: true },
    });
    if (conv && (!conv.title || conv.title === 'New Chat')) {
      generatedTitle = this.generateTitleFromMessage(message);
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: generatedTitle, updatedAt: new Date() },
      });
    }

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: cleanedText,
      sources: [],
      listing: listingItems,
      answerMode: 'nav_pills' as AnswerMode,
      answerClass: 'NAVIGATION' as AnswerClass,
      navType: 'discover' as NavType,
      generatedTitle,
    };
  }

  /**
   * Handle LIST_FOLDER_CONTENTS intent — scoped folder listing with breadcrumb.
   * Resolves the target folder, lists its contents, and emits pills with breadcrumb.
   */
  private async handleFolderContentsQuery(
    userId: string, message: string, conversationId: string,
    sink: StreamSink, streamingConfig: LLMStreamingConfig,
    existingUserMsgId?: string,
  ): Promise<ChatResult> {
    const userMsg = existingUserMsgId
      ? { id: existingUserMsgId }
      : await this.createMessage({ conversationId, role: 'user', content: message, userId });

    // Resolve target folder
    const targetFolder = await this.resolveFolderByFuzzyName(userId, message);

    let listingItems: Array<{ kind: 'file' | 'folder'; id: string; title: string; mimeType?: string; itemCount?: number }>;
    let breadcrumb: Array<{ id: string; name: string }> = [];
    let introText: string;

    if (targetFolder) {
      // Get scoped contents
      listingItems = await this.buildScopedFolderListingPayload(userId, targetFolder.id);
      breadcrumb = await this.resolveFolderPath(userId, targetFolder.id);

      const fCount = listingItems.filter(i => i.kind === 'folder').length;
      const dCount = listingItems.filter(i => i.kind === 'file').length;

      if (listingItems.length === 0) {
        introText = `The **${targetFolder.name}** folder is empty.`;
      } else {
        introText = `Here are the contents of **${targetFolder.name}** — ${fCount > 0 ? `**${fCount}** subfolder${fCount !== 1 ? 's' : ''}` : ''}${fCount > 0 && dCount > 0 ? ' and ' : ''}${dCount > 0 ? `**${dCount}** file${dCount !== 1 ? 's' : ''}` : ''}:`;
      }
    } else {
      // Fallback to root listing
      const rootListing = await this.buildFileListingPayload(userId);
      listingItems = rootListing.items;
      const fCount = listingItems.filter(i => i.kind === 'folder').length;
      const dCount = listingItems.filter(i => i.kind === 'file').length;
      introText = this.buildListingIntro('en', fCount, dCount);
    }

    // Emit SSE events
    if (sink.isOpen()) {
      sink.write({ event: 'meta', data: { answerMode: 'nav_pills', answerClass: 'NAVIGATION', navType: 'discover' } } as any);
    }
    if (listingItems.length > 0 && sink.isOpen()) {
      sink.write({ event: 'listing', data: { items: listingItems, breadcrumb } } as any);
    }
    if (sink.isOpen()) {
      sink.write({ event: 'delta', data: { text: introText } } as any);
    }

    // Persist
    const assistantMsg = await this.createMessage({
      conversationId, role: 'assistant', content: introText, userId,
      metadata: { listing: listingItems, breadcrumb, sources: [], answerMode: 'nav_pills' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: 'discover' as NavType },
    });

    // Auto-generate title
    let generatedTitle: string | undefined;
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { title: true },
    });
    if (conv && (!conv.title || conv.title === 'New Chat')) {
      generatedTitle = this.generateTitleFromMessage(message);
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: generatedTitle, updatedAt: new Date() },
      });
    }

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: introText,
      sources: [],
      listing: listingItems,
      breadcrumb,
      answerMode: 'nav_pills' as AnswerMode,
      answerClass: 'NAVIGATION' as AnswerClass,
      navType: 'discover' as NavType,
      generatedTitle,
    };
  }

  /**
   * Reorder sources so documents the LLM actually referenced come first.
   * The LLM output may contain [filename] citations or inline filename mentions.
   * Sources whose filename appears in the LLM text get promoted to the front.
   */
  private reorderSourcesByLLMUsage(
    llmText: string,
    sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>,
  ): Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }> {
    if (sources.length <= 1 || !llmText) return sources;

    const lower = llmText.toLowerCase();
    const cited: typeof sources = [];
    const uncited: typeof sources = [];

    for (const s of sources) {
      // Match full filename or base name (without extension)
      const full = s.filename.toLowerCase();
      const base = full.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      if (lower.includes(full) || lower.includes(base)) {
        cited.push(s);
      } else {
        uncited.push(s);
      }
    }

    // If nothing matched by name, try matching chunk content: leave order as-is
    if (cited.length === 0) return sources;

    return [...cited, ...uncited];
  }

  /**
   * Expand query with topic terms from conversation history.
   * This helps follow-up queries like "what are the key takeaways?" retrieve
   * the correct document when the conversation established context earlier.
   */
  private expandQueryFromHistory(
    query: string,
    history: Array<{ role: ChatRole; content: string }>,
  ): string {
    if (history.length === 0) return query;

    // Extract document/topic mentions from recent history (last 20 messages)
    const recentHistory = history.slice(-20);
    const docTerms = new Set<string>();
    const topicTerms = new Set<string>();

    for (const msg of recentHistory) {
      const content = msg.content || '';

      // Extract document filenames (e.g., "Lone_Mountain_Ranch_2025_Budget.xlsx")
      const filenameMatches = content.match(/[\w_]+\.(pdf|docx?|xlsx?|pptx?)/gi);
      if (filenameMatches) {
        for (const fn of filenameMatches) {
          // Extract meaningful words from filename
          const words = fn.replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, '')
            .replace(/[_-]+/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
          for (const w of words) docTerms.add(w.toLowerCase());
        }
      }

      // Extract capitalized topic words (likely proper nouns / key concepts)
      const topicWords = content.match(/\b[A-Z][a-z]{3,}\b/g);
      if (topicWords) {
        for (const w of topicWords) {
          if (!['Here', 'This', 'That', 'These', 'Those', 'Based', 'When', 'Also', 'Each', 'They', 'Their', 'From', 'Before', 'After', 'During'].includes(w)) {
            topicTerms.add(w.toLowerCase());
          }
        }
      }
    }

    // Always add document name terms if the conversation references specific documents
    // This ensures follow-up queries stay scoped to the focused document
    const parts: string[] = [query];
    if (docTerms.size > 0) {
      parts.push(Array.from(docTerms).slice(0, 6).join(' '));
    }

    // Add topic terms whenever the conversation has established document context
    // (not just for explicitly context-dependent queries like "this document").
    // In a multi-turn conversation about a specific topic, ALL queries are implicitly
    // about that topic even if they don't say "this" or "the document".
    const hasDocumentContext = docTerms.size > 0;
    const isContextDependent = /\b(this|the chapter|the document|it |here|mentioned|listed)\b/i.test(query);
    if ((hasDocumentContext || isContextDependent) && topicTerms.size > 0) {
      parts.push(Array.from(topicTerms).slice(0, 6).join(' '));
    }

    return parts.join(' ');
  }

  /**
   * Extract document filenames from conversation history to establish document focus.
   * When a conversation has been discussing specific documents, follow-up queries
   * should strongly prefer chunks from those documents.
   */
  private extractDocumentFocusFromHistory(
    history: Array<{ role: ChatRole; content: string }>,
  ): string[] {
    if (history.length === 0) return [];

    const filenames: string[] = [];
    const recentHistory = history.slice(-20);

    for (const msg of recentHistory) {
      const content = msg.content || '';
      // Match filenames with extensions
      const matches = content.match(/[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)/gi);
      if (matches) {
        for (const fn of matches) {
          if (!filenames.includes(fn)) filenames.push(fn);
        }
      }
    }

    return filenames;
  }

  /**
   * Extract multi-word topic entities (proper nouns, project names) from conversation.
   * Used for content-based boosting: chunks mentioning these entities score higher.
   * E.g., "Parque Global", "Lone Mountain Ranch", "São Paulo"
   */
  private extractTopicEntitiesFromHistory(
    history: Array<{ role: ChatRole; content: string }>,
  ): string[] {
    if (history.length === 0) return [];

    const entities: string[] = [];
    const skipPhrases = ['here is', 'this is', 'that is', 'based on', 'year one', 'year two',
      'year three', 'step one', 'step two', 'step three', 'pass one', 'pass two', 'pass three'];

    for (const msg of history.slice(-20)) {
      const content = msg.content || '';
      // Match 2-3 word capitalized phrases (proper nouns / project names / location names)
      const matches = content.match(/\b[A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+){1,2}\b/g);
      if (matches) {
        for (const m of matches) {
          const lower = m.toLowerCase();
          if (!skipPhrases.some(s => lower.includes(s)) && !entities.includes(lower)) {
            entities.push(lower);
          }
        }
      }
    }

    return entities.slice(0, 5);
  }

  /**
   * Detect referential follow-up queries that implicitly refer to the current document scope.
   * Returns true when:
   * - Query has referential patterns ("this document", "in here", "it says", etc.)
   * - Query is short (<= 10 words) with no specific document name
   * - History has at least 1 prior user+assistant exchange
   */
  private isReferentialFollowUp(
    query: string,
    history: Array<{ role: ChatRole; content: string }>,
  ): boolean {
    // Need at least 1 prior exchange (user + assistant)
    const hasExchange = history.some(m => m.role === 'user') && history.some(m => m.role === 'assistant');
    if (!hasExchange) return false;

    const q = query.trim();

    // Referential patterns
    if (/\b(this|the|that)\s+(document|file|pdf|analysis|report|spreadsheet|presentation|doc)\b/i.test(q)) return true;
    if (/\b(in here|it says|it mentions|mentioned|listed|above)\b/i.test(q)) return true;

    // Short query with no specific document name
    const wordCount = q.split(/\s+/).length;
    const hasDocName = /[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/i.test(q);
    if (wordCount <= 10 && !hasDocName) return true;

    return false;
  }

  /**
   * Detect when a query explicitly names a document NOT in the current scope.
   * Returns true when the query mentions a file (e.g., "summary.pdf") that doesn't
   * match any filename from the current scope documents.
   */
  private async queryNamesNewDocument(
    query: string,
    scopeDocIds: string[],
  ): Promise<boolean> {
    // Extract file references from the query
    const fileRefs = query.match(/[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/gi);
    if (!fileRefs || fileRefs.length === 0) return false;
    if (scopeDocIds.length === 0) return false;

    // Load filenames for the scoped documents
    const scopedDocs = await prisma.document.findMany({
      where: { id: { in: scopeDocIds } },
      select: { filename: true, encryptedFilename: true },
    });

    const scopedNames = scopedDocs.map(d => {
      const name = d.filename || this.extractFilenameFromPath(d.encryptedFilename) || '';
      return name.toLowerCase();
    }).filter(Boolean);

    // Check if any referenced file is NOT in the current scope
    for (const ref of fileRefs) {
      const refLower = ref.toLowerCase();
      const refBase = refLower.replace(/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i, '');
      const inScope = scopedNames.some(name => {
        const nameBase = name.replace(/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i, '');
        return name.includes(refBase) || nameBase.includes(refBase) || refBase.includes(nameBase);
      });
      if (!inScope) return true;
    }

    return false;
  }

  /**
   * Strip raw file paths from LLM output.
   * Converts backtick-wrapped paths and bare inline paths to bold leaf name.
   */
  private stripRawPaths(text: string): string {
    // 1. Backtick-wrapped paths: `trabalhos/stress test/xlsx/` → **xlsx**
    text = text.replace(/`([^`]*\/[^`]*)`/g, (_match, inner: string) => {
      const parts = inner.replace(/\/$/, '').split('/');
      return `**${parts[parts.length - 1]}**`;
    });
    // 2. Bare inline paths (word/word/word) not inside backticks or links
    text = text.replace(/(?<![`[\w])(\b[\w][\w .'-]*(?:\/[\w][\w .'-]*){1,}\/?)(?![`\]])/g, (_match, path: string) => {
      const parts = path.replace(/\/$/, '').split('/');
      return `**${parts[parts.length - 1]}**`;
    });
    return text;
  }

  /**
   * Expand query for retry retrieval by extracting key nouns and adding synonyms.
   */
  private expandQueryForRetry(query: string): string {
    const q = query.toLowerCase();
    // Remove question words and common filler
    const stripped = q
      .replace(/\b(what|which|how|does|do|is|are|the|this|that|can|you|give|me|tell|about|please|it|say|says)\b/g, '')
      .replace(/[?!.,;:'"]/g, '')
      .trim();

    if (!stripped || stripped === q) return query;

    // Combine original + stripped for broader matching
    return `${query} ${stripped}`;
  }

  /**
   * Strip inline citation patterns like (Filename.pdf, p.4) from LLM output.
   * Prevents double-display when source pills are shown separately.
   * Preserves koda://source links (those are intentional for in-table pill rendering).
   */
  private stripInlineCitations(text: string): string {
    return text
      // Remove parenthesized citations: (Filename.pdf, p.4)
      .replace(/\s*\([^)]*\.(pdf|docx?|xlsx?|pptx?|csv|txt)[^)]*\)/gi, '')
      // Remove em-dash attribution lines: "— Filename.xlsx, Row 30" or "— Filename.pdf, p. X"
      .replace(/\n+—\s+[\w_.,\-() ]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b[^\n]*/gi, '')
      // Remove backtick-wrapped filenames: `Filename.xlsx` (but NOT inside markdown links)
      .replace(/(?<!\[)(`[\w_.,\-() ]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)`)(?!\])/gi, '');
  }

  /**
   * Strip bare filename mentions from LLM output.
   * Targets known doc extensions. Protects markdown links, koda:// URLs, and table cells.
   */
  private stripRawFilenames(text: string): string {
    // First pass: remove bold-wrapped filenames entirely (prevents **** artifacts)
    text = text.replace(/\*{1,2}([\w_.,\-() ]{2,80}\.(pdf|docx?|xlsx?|pptx?|csv))\*{1,2}/gi, (match, _name, _ext, offset) => {
      const before = text.slice(Math.max(0, offset - 120), offset);
      if (/\]\([^)]*$/.test(before)) return match;          // inside markdown link
      if (/koda:\/\/source[^)]*$/.test(before)) return match; // inside koda:// URL
      if (/\|[^|\n]*$/.test(before)) return match;           // inside table cell
      if (/\[[^\]]*$/.test(before)) return match;             // inside link label
      return '';
    });

    // Second pass: remove bare filenames (existing logic)
    const docExtPattern = /\b[\w_.,\-() ]{2,80}\.(pdf|docx?|xlsx?|pptx?|csv)\b/gi;
    text = text.replace(docExtPattern, (match, _ext, offset) => {
      const before = text.slice(Math.max(0, offset - 120), offset);
      if (/\]\([^)]*$/.test(before)) return match;          // inside markdown link
      if (/koda:\/\/source[^)]*$/.test(before)) return match; // inside koda:// URL
      if (/\|[^|\n]*$/.test(before)) return match;           // inside table cell
      if (/\[[^\]]*$/.test(before)) return match;             // inside link label [...]
      return '';
    });

    return text.replace(/  +/g, ' ');
  }

  /**
   * Strip markdown list items from LLM output.
   * Removes unordered (- or *) and ordered (1.) list lines.
   */
  private stripMarkdownLists(text: string): string {
    // Remove unordered list items: "- item" or "* item"
    let result = text.replace(/^\s*[-*]\s+.+$/gm, '');
    // Remove ordered list items: "1. item"
    result = result.replace(/^\s*\d+\.\s+.+$/gm, '');
    // Clean up resulting blank lines
    return result.replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Fix currency formatting artifacts from LLM output.
   * Models sometimes wrap currency in LaTeX-style $...$ or produce $(383,893.23)$
   * instead of the correct accounting format ($383,893.23).
   */
  private fixCurrencyArtifacts(text: string): string {
    let t = text;

    // 1) Remove LaTeX-style wrapping around negative amounts: $(383,893.23)$ → ($383,893.23)
    t = t.replace(/\$\s*\(([\d,]+(?:\.\d{1,2})?)\)\s*\$/g, '(\\$$1)');

    // 2) Fix accidental "$ (123.45)$" pattern
    t = t.replace(/\$\s*\(\$?([\d,]+(?:\.\d{1,2})?)\)\s*\$/g, '(\\$$1)');

    // 3) Ensure negative amounts in parentheses have dollar sign: (383.00) → ($383.00) when in financial context
    // Only apply in table cells (after | or at line start after |)
    t = t.replace(/(\|\s*)\(([\d,]+(?:\.\d{1,2})?)\)/g, '$1(\\$$2)');

    // 4) Remove stray LaTeX $...$ around single numbers (not negative): $24,972,043.79$ → $24,972,043.79
    t = t.replace(/\$(\d[\d,]*(?:\.\d{1,2})?)\$/g, '\\$$1');

    return t;
  }

  /**
   * Linkify plain-text source references in table cells.
   * Converts patterns like `[Ranch P&L 2024 · p.17]` or `[Ranch P&L 2024 · Row 17]`
   * into koda://source markdown links using the known sources array.
   * This is a deterministic post-processor — it doesn't rely on the LLM emitting full URLs.
   */
  private linkifyTableSources(
    text: string,
    sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>,
  ): string {
    if (!sources.length || !text.includes('|')) return text;

    // Build a lookup: for each source, create matching patterns from the filename
    const sourceIndex = sources.map(s => {
      const name = s.filename || '';
      // Create short name variants for matching: "Lone_Mountain_Ranch_P_L_2024.xlsx" → "Ranch P&L 2024" etc.
      const baseName = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      return { ...s, baseName, lowerBase: baseName.toLowerCase() };
    });

    // Match bracketed references NOT already inside markdown links:
    // [Some Label · p.17] or [Some Label · Row 17] or [Some Label]
    // but NOT [...](koda://source?...) which are already linked
    return text.replace(
      /(?<!\]\()(\[([^\]]+?)(?:\s*·\s*(?:p\.|Row\s*)(\d+))?\])(?!\()/g,
      (match, _fullBracket, label, pageStr) => {
        const lowerLabel = label.toLowerCase().trim();

        // Find the best matching source
        let bestSource = sourceIndex.find(s => lowerLabel.includes(s.lowerBase));
        if (!bestSource) {
          // Try partial match: any source whose name words overlap significantly
          bestSource = sourceIndex.find(s => {
            const srcWords = s.lowerBase.split(/\s+/).filter((w: string) => w.length > 2);
            const labelWords = lowerLabel.split(/\s+/).filter((w: string) => w.length > 2);
            const overlap = srcWords.filter((w: string) => labelWords.some((lw: string) => lw.includes(w) || w.includes(lw)));
            return overlap.length >= Math.min(2, srcWords.length);
          });
        }
        if (!bestSource) {
          // Fallback: if there's only one source, use it
          if (sourceIndex.length === 1) bestSource = sourceIndex[0];
          else return match; // Can't determine source — leave as-is
        }

        const page = pageStr || (bestSource.page ? String(bestSource.page) : '');
        const params = new URLSearchParams({
          docId: bestSource.documentId,
          filename: bestSource.filename,
          ...(page ? { page } : {}),
          mime: bestSource.mimeType || 'application/octet-stream',
        });

        const displayLabel = label.trim() + (pageStr ? ` · p.${pageStr}` : '');
        return `[${displayLabel}](koda://source?${params.toString()})`;
      },
    );
  }

  /**
   * Post-LLM safety net: rewrite or remove forbidden phrases the LLM
   * may produce despite system prompt instructions.
   */
  private guardForbiddenPhrases(text: string, answerMode: AnswerMode): string {
    let result = text;

    // For nav_pills mode: rewrite "I cannot open" type responses
    if (answerMode === 'nav_pills') {
      result = result.replace(
        /I (?:cannot|can't|am unable to|'m unable to) (?:open|access|display|show|view)[^.]*\./gi,
        'I found this document for you.',
      );
    }

    // Remove full sentences that start with forbidden patterns.
    // We match the sentence from the forbidden phrase to the next period/newline.
    const forbiddenStarters = [
      /(?:^|\n)[\s]*I (?:cannot|can't) (?:find|provide|access|locate|determine)[^.\n]*[.\n]/gi,
      /(?:^|\n)[\s]*I (?:apologize|'m sorry)[^.\n]*[.\n]/gi,
      /(?:^|\n)[\s]*(?:The |the )?(?:provided |available )?excerpts? (?:do(?:es)? not|don't) (?:contain|include|mention|cover|have)[^.\n]*[.\n]/gi,
      /(?:^|\n)[\s]*(?:Unfortunately|Regrettably),?[^.\n]*(?:cannot|can't|unable|not (?:able|possible))[^.\n]*[.\n]/gi,
      /(?:^|\n)[\s]*(?:No relevant|There is no|I (?:could|couldn't|was unable))[^.\n]*(?:information|content|data)[^.\n]*[.\n]/gi,
    ];

    for (const pattern of forbiddenStarters) {
      result = result.replace(pattern, '\n');
    }

    // Clean up extra whitespace / blank lines left by removals
    result = result.replace(/\n{3,}/g, '\n\n').trim();

    return result;
  }

  /**
   * Detect whether the LLM response indicates it found NO relevant information.
   * When true, sources should be suppressed — showing source pills alongside
   * "not mentioned" or "no information found" responses is misleading.
   */
  private isNegativeAnswer(llmText: string): boolean {
    const t = llmText.toLowerCase();
    const negativePatterns = [
      /\bnot\s+mention/i,
      /\bnot\s+(?:specifically\s+)?(?:discussed?|addressed?|covered|included|referenced|found)\b/i,
      /\bno\s+(?:information|mention|reference|data|content|details?|discussion)\b/i,
      /\bdoes\s+not\s+(?:contain|include|mention|discuss|address|cover|reference)\b/i,
      /\bdo\s+not\s+(?:contain|include|mention|discuss|address|cover|reference)\b/i,
      /\bnão\s+(?:menciona|contém|inclui|aborda|discute|fala\s+sobre)\b/i,
      /\bnenhuma?\s+(?:informação|menção|referência|dado)\b/i,
      /\bcouldn't\s+find\b/i,
      /\bcould\s+not\s+find\b/i,
      /\bthere\s+is\s+no\s+(?:mention|information|data|reference)\b/i,
    ];
    return negativePatterns.some(p => p.test(t));
  }

  /* ---------------- File Actions (chat-driven) ---------------- */

  /**
   * Detect file/folder management intent from a chat message using regex patterns.
   * Returns null if no action is detected, allowing normal RAG flow to proceed.
   */
  private detectFileAction(message: string): FileAction | null {
    const msg = message.trim();

    // 1. create_folder
    const createMatch = msg.match(
      /\b(create|make|add|new)\b.{0,20}\b(folder|directory)\b\s+(?:(?:called|named|titled)\s+)?["']?([^"'\n]{2,60})["']?\s*$/i
    );
    if (createMatch) {
      return { type: 'create_folder', folderName: createMatch[3].trim() };
    }

    // 2. rename_folder
    const renameMatch = msg.match(
      /\b(rename|change\s+(?:the\s+)?name\s+of)\b.*?\b(folder)\b\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?\s*$/i
    );
    if (renameMatch) {
      return { type: 'rename_folder', folderName: renameMatch[3].trim(), newName: renameMatch[4].trim() };
    }

    // 3. delete_folder
    const deleteFolderMatch = msg.match(
      /\b(delete|remove|trash)\b.*?\b(folder|directory)\b\s+["']?([^"'\n]{2,60})["']?\s*$/i
    );
    if (deleteFolderMatch) {
      return { type: 'delete_folder', folderName: deleteFolderMatch[3].trim() };
    }

    // 4. move_document — supports both "file.ext" and extensionless references
    const moveMatch = msg.match(
      /\b(move|transfer|put)\b\s+["']?(.+?)["']?\s+(?:to|into|in)\s+(?:the\s+)?(?:folder\s+)?["']?([^"'\n]{2,60}?)["']?(?:\s+folder)?\s*$/i
    );
    if (moveMatch) {
      return { type: 'move_document', filename: moveMatch[2].trim(), targetFolder: moveMatch[3].trim() };
    }

    // 5. delete_document — supports both "file.ext" and extensionless references
    const deleteDocMatch = msg.match(
      /\b(delete|remove|trash)\b\s+(?:the\s+)?(?:file\s+|document\s+)?["']?(.+?)["']?\s*$/i
    );
    if (deleteDocMatch) {
      return { type: 'delete_document', filename: deleteDocMatch[2].trim() };
    }

    return null;
  }

  /**
   * Execute a detected file action via Prisma DB operations.
   * All operations verify userId ownership. Returns success/failure with a user-facing message.
   */
  private async executeFileAction(
    action: FileAction,
    userId: string,
  ): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
    switch (action.type) {
      case 'create_folder': {
        const name = action.folderName!;
        // Check for duplicate
        const existing = await prisma.folder.findFirst({
          where: { userId, name: { equals: name, mode: 'insensitive' }, isDeleted: false },
        });
        if (existing) {
          return { success: false, message: `A folder named **${name}** already exists.` };
        }
        const folder = await prisma.folder.create({
          data: { userId, name, parentFolderId: null },
        });
        return {
          success: true,
          message: `Done — I created the folder **${name}**.`,
          data: { folderId: folder.id, folderName: name },
        };
      }

      case 'rename_folder': {
        const oldName = action.folderName!;
        const newName = action.newName!;
        const folder = await prisma.folder.findFirst({
          where: { userId, name: { equals: oldName, mode: 'insensitive' }, isDeleted: false },
        });
        if (!folder) {
          return { success: false, message: `I couldn't find a folder named **${oldName}**.` };
        }
        await prisma.folder.update({
          where: { id: folder.id },
          data: { name: newName },
        });
        return {
          success: true,
          message: `Done — renamed **${oldName}** to **${newName}**.`,
          data: { folderId: folder.id, oldName, newName },
        };
      }

      case 'delete_folder': {
        const name = action.folderName!;
        const folder = await prisma.folder.findFirst({
          where: { userId, name: { equals: name, mode: 'insensitive' }, isDeleted: false },
        });
        if (!folder) {
          return { success: false, message: `I couldn't find a folder named **${name}**.` };
        }
        // Move documents in folder to root (unfiled)
        await prisma.document.updateMany({
          where: { folderId: folder.id, userId },
          data: { folderId: null },
        });
        // Soft delete the folder
        await prisma.folder.update({
          where: { id: folder.id },
          data: { isDeleted: true, deletedAt: new Date() },
        });
        return {
          success: true,
          message: `Done — I deleted the folder **${name}** and moved its files to the root.`,
          data: { folderId: folder.id, folderName: name },
        };
      }

      case 'move_document': {
        const filename = action.filename!;
        const targetFolderName = action.targetFolder!;

        // Find document by filename (case-insensitive match on filename or encryptedFilename)
        const doc = await prisma.document.findFirst({
          where: {
            userId,
            status: { not: 'deleted' },
            OR: [
              { filename: { contains: filename, mode: 'insensitive' } },
              { encryptedFilename: { contains: filename, mode: 'insensitive' } },
            ],
          },
        });
        if (!doc) {
          return { success: false, message: `I couldn't find **${filename}** in your documents.` };
        }

        // Find target folder
        const targetFolder = await prisma.folder.findFirst({
          where: { userId, name: { equals: targetFolderName, mode: 'insensitive' }, isDeleted: false },
        });
        if (!targetFolder) {
          return { success: false, message: `I couldn't find a folder named **${targetFolderName}**.` };
        }

        await prisma.document.update({
          where: { id: doc.id },
          data: { folderId: targetFolder.id },
        });
        const displayName = doc.filename || filename;
        return {
          success: true,
          message: `Done — I moved **${displayName}** to the **${targetFolderName}** folder.`,
          data: { documentId: doc.id, folderId: targetFolder.id, filename: displayName, folderName: targetFolderName },
        };
      }

      case 'delete_document': {
        const filename = action.filename!;
        const doc = await prisma.document.findFirst({
          where: {
            userId,
            status: { not: 'deleted' },
            OR: [
              { filename: { contains: filename, mode: 'insensitive' } },
              { encryptedFilename: { contains: filename, mode: 'insensitive' } },
            ],
          },
        });
        if (!doc) {
          return { success: false, message: `I couldn't find **${filename}** in your documents.` };
        }

        await prisma.document.update({
          where: { id: doc.id },
          data: { status: 'deleted' },
        });
        const displayName = doc.filename || filename;
        return {
          success: true,
          message: `Done — I deleted **${displayName}**.`,
          data: { documentId: doc.id, filename: displayName },
        };
      }

      default:
        return { success: false, message: 'Unknown file action.' };
    }
  }

  /* ---------------- Chat (streamed) ---------------- */

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const traceId = mkTraceId();

    const conversationId = await this.ensureConversation(params.req.userId, params.req.conversationId);

    // --- Regenerate: delete old assistant message, reuse existing user message ---
    let existingUserMsgId: string | undefined;
    if (params.req.isRegenerate && params.req.conversationId) {
      // Find the last assistant message in this conversation and delete it
      const lastAssistant = await prisma.message.findFirst({
        where: { conversationId, role: 'assistant' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (lastAssistant) {
        await prisma.message.delete({ where: { id: lastAssistant.id } });
      }
      // Find the existing user message (now the last message) to reuse its ID
      const lastUser = await prisma.message.findFirst({
        where: { conversationId, role: 'user' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (lastUser) {
        existingUserMsgId = lastUser.id;
      }
    }

    const history = await this.loadRecentForEngine(conversationId, 60, params.req.userId);

    // --- File Action Detection (bank-driven; safe confirmation for destructive ops) ---
    const fileOp = getFileActionExecutor().detectOperator(params.req.message);
    if (fileOp) {
      const lang = params.req.preferredLanguage ?? 'en';
      const result = await getFileActionExecutor().execute({
        userId: params.req.userId,
        operator: fileOp,
        message: params.req.message,
        language: lang,
        confirmationToken: params.req.confirmationToken,
        attachedDocumentIds: params.req.attachedDocumentIds ?? [],
      });

      const answerMode: AnswerMode = result.requiresConfirmation ? 'action_confirmation' : 'action_receipt';
      const answerClass: AnswerClass = 'NAVIGATION';
      const attachmentsPayload = result.attachments ?? [];
      const sourceAttachments = attachmentsPayload.filter((a: any) => a?.type === 'folder' || a?.type === 'document');
      const sources = sourceAttachments.map((a: any) => ({
        documentId: a.docId || a.documentId || a.id || '',
        filename: a.filename || a.title || '',
        mimeType: a.mimeType ?? null,
        page: a.page ?? null,
      }));

      // Persist user message (skip on regenerate — reuse existing)
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode, answerClass, navType: null } } as any);
      }

      // Best-effort action event (used by some UI flows)
      if (params.sink.isOpen()) {
        params.sink.write({ event: 'action', data: { actionType: fileOp, success: result.success, operator: fileOp } } as any);
      }

      // Folder/document pills (optional)
      if (sources.length && params.sink.isOpen()) {
        params.sink.write({ event: 'sources', data: { sources } } as any);
      }

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'delta', data: { text: result.message } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: result.message, userId: params.req.userId,
        metadata: { sources, attachments: attachmentsPayload, answerMode, answerClass, navType: null },
      });

      // Auto-generate conversation title if needed
      let generatedTitle: string | undefined;
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: params.req.userId, isDeleted: false },
        select: { title: true },
      });
      if (conv && (!conv.title || conv.title === 'New Chat')) {
        generatedTitle = this.generateTitleFromMessage(params.req.message);
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { title: generatedTitle, updatedAt: new Date() },
        });
      }

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: result.message,
        attachmentsPayload,
        sources,
        answerMode,
        answerClass,
        navType: null,
        generatedTitle,
      };
    }

    // --- Intent Classification (BEFORE everything) ---
    const intent = this.classifyIntent(params.req.message);

    // --- Navigation Query Handlers (short-circuit RAG) ---
    if (intent.intent === 'FIND_DOCUMENT_LOCATION' || intent.intent === 'FIND_FOLDER_LOCATION') {
      return this.handleDocumentLocationQuery(
        params.req.userId, params.req.message, conversationId,
        params.sink, params.streamingConfig, existingUserMsgId
      );
    }

    if (intent.intent === 'OPEN_DOCUMENT') {
      return this.handleOpenDocumentQuery(
        params.req.userId, params.req.message, conversationId,
        params.sink, params.streamingConfig, existingUserMsgId
      );
    }

    if (intent.intent === 'LIST_FOLDER_CONTENTS') {
      return this.handleFolderContentsQuery(
        params.req.userId, params.req.message, conversationId,
        params.sink, params.streamingConfig, existingUserMsgId
      );
    }

    if (intent.intent === 'NAVIGATE_TREE') {
      return this.handleNavigateTreeQuery(
        params.req.userId, params.req.message, conversationId,
        params.sink, params.streamingConfig, existingUserMsgId
      );
    }

    if (intent.intent === 'NAVIGATE_REASONING') {
      return this.handleNavigateReasoningQuery(
        params.req.userId, params.req.message, conversationId,
        params.sink, params.streamingConfig, history, existingUserMsgId
      );
    }

    // SCOPED_SEARCH: resolve folder → get recursive doc IDs → fall through to RAG with scope
    let streamScopedSearchDocIds: string[] | null = null;
    if (intent.intent === 'SCOPED_SEARCH') {
      const targetFolder = await this.resolveFolderByFuzzyName(params.req.userId, params.req.message);
      if (targetFolder) {
        streamScopedSearchDocIds = await this.getRecursiveDocumentIds(params.req.userId, targetFolder.id);
      }
    }

    // --- File Listing Detection (before RAG) ---
    const listingCheck = this.isFileListingQuery(params.req.message);
    if (listingCheck.isListing) {
      const listing = await this.buildFileListingPayload(params.req.userId);
      // Filter items by scope
      const scope = listingCheck.scope;
      const filteredItems = scope === 'documents'
        ? listing.items.filter(i => i.kind === 'file')
        : scope === 'folders'
          ? listing.items.filter(i => i.kind === 'folder')
          : listing.items;

      if (filteredItems.length > 0) {
        // Persist user message (skip on regenerate — reuse existing)
        const userMsg = existingUserMsgId
          ? { id: existingUserMsgId }
          : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

        // Emit meta event
        if (params.sink.isOpen()) {
          params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'NAVIGATION', navType: null } } as any);
        }

        // Emit structured listing via SSE
        if (params.sink.isOpen()) {
          params.sink.write({ event: 'listing', data: { items: filteredItems } } as any);
        }

        // Use language detected from the message itself (not UI preference)
        const lang = listingCheck.lang;
        const fCount = filteredItems.filter(i => i.kind === 'folder').length;
        const dCount = filteredItems.filter(i => i.kind === 'file').length;
        const introText = this.buildListingIntro(lang, fCount, dCount);

        if (params.sink.isOpen()) {
          params.sink.write({ event: 'delta', data: { text: introText } } as any);
        }

        // Persist assistant message with listing metadata
        const assistantMsg = await this.createMessage({
          conversationId, role: 'assistant', content: introText, userId: params.req.userId,
          metadata: { listing: filteredItems, sources: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass },
        });

        // Auto-generate conversation title if needed
        let generatedTitle: string | undefined;
        const conv = await prisma.conversation.findFirst({
          where: { id: conversationId, userId: params.req.userId, isDeleted: false },
          select: { title: true },
        });
        if (conv && (!conv.title || conv.title === 'New Chat')) {
          generatedTitle = this.generateTitleFromMessage(params.req.message);
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { title: generatedTitle, updatedAt: new Date() },
          });
        }

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: introText,
          listing: filteredItems,
          sources: [],
          answerMode: 'general_answer' as AnswerMode,
          answerClass: 'NAVIGATION' as AnswerClass,
          navType: null,
          generatedTitle,
        };
      }
    }

    // --- Normal RAG flow continues below ---

    // --- Attachment scoping: if user attached documents, use those as hard scope ---
    const attachedDocumentIds = params.req.attachedDocumentIds ?? [];
    const hasAttachments = attachedDocumentIds.length > 0;

    if (hasAttachments) {
      // Persist attached doc IDs into conversation scope so follow-up questions stay scoped
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          scopeDocumentIds: attachedDocumentIds,
        },
      });
    }

    // --- Document Scoping: load persisted scope ---
    const ragScopeEnabled = (process.env.RAG_SCOPE_ENABLED ?? 'true') !== 'false';
    const ragScopeMinChunks = parseInt(process.env.RAG_SCOPE_MIN_CHUNKS ?? '2', 10) || 2;

    let scopeDocIds: string[] = [];
    if (hasAttachments) {
      // Attachments override any persisted scope
      scopeDocIds = attachedDocumentIds;
    } else if (ragScopeEnabled) {
      const convScope = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: params.req.userId },
        select: { scopeDocumentIds: true },
      });
      scopeDocIds = (convScope?.scopeDocumentIds as string[]) ?? [];
    }

    // SCOPED_SEARCH override: use folder-scoped doc IDs
    if (streamScopedSearchDocIds && streamScopedSearchDocIds.length > 0) {
      scopeDocIds = streamScopedSearchDocIds;
    }

    // Decide scoping: if user names a new document, clear scope and go global
    let useScope = scopeDocIds.length > 0;
    let scopeCleared = false;
    if (!hasAttachments && !streamScopedSearchDocIds && useScope && await this.queryNamesNewDocument(params.req.message, scopeDocIds)) {
      scopeDocIds = [];
      useScope = false;
      scopeCleared = true;
    }

    // If user attached documents, wait for their chunks to be available (processing is async)
    if (hasAttachments) {
      const maxWaitMs = 15000;
      const pollMs = 1000;
      const startWait = Date.now();
      let chunksReady = false;

      while (Date.now() - startWait < maxWaitMs) {
        const chunkCount = await prisma.documentChunk.count({
          where: { documentId: { in: attachedDocumentIds } },
        });
        if (chunkCount > 0) { chunksReady = true; break; }

        // Emit processing stage so frontend shows "Processing document..."
        if (params.sink.isOpen()) {
          params.sink.write({ event: 'progress', data: { stage: 'processing', message: 'Processing your document…' } } as any);
        }
        await new Promise(r => setTimeout(r, pollMs));
      }

      if (!chunksReady) {
        console.warn('[Chat] Attached documents have no chunks after wait', attachedDocumentIds);
      }
    }

    // Query expansion: skip when scoped (hard filter already constrains to right doc)
    const contextualQuery = useScope
      ? params.req.message
      : this.expandQueryFromHistory(params.req.message, history);

    // Extract document focus and topic entities from conversation for targeted retrieval
    const focusFilenames = this.extractDocumentFocusFromHistory(history);
    const topicEntities = this.extractTopicEntitiesFromHistory(history);

    // Retrieve relevant document chunks (higher topK for better coverage)
    let chunks = await this.retrieveRelevantChunks(params.req.userId, contextualQuery, 15, {
      boostFilenames: focusFilenames,
      boostTopicEntities: topicEntities,
      ...(useScope ? { scopeDocumentIds: scopeDocIds } : {}),
    });

    // Fallback: if scoped retrieval is too thin, retry globally without clearing scope
    if (useScope && chunks.length < ragScopeMinChunks) {
      const globalQuery = this.expandQueryFromHistory(params.req.message, history);
      chunks = await this.retrieveRelevantChunks(params.req.userId, globalQuery, 15, {
        boostFilenames: focusFilenames,
        boostTopicEntities: topicEntities,
      });
    }

    // Retry with expanded query if initial retrieval looks thin (existing logic)
    if (chunks.length < 3 && params.req.message.trim().length > 5) {
      const expandedQuery = this.expandQueryForRetry(contextualQuery);
      if (expandedQuery !== contextualQuery) {
        const retryChunks = await this.retrieveRelevantChunks(params.req.userId, expandedQuery, 15, { boostFilenames: focusFilenames, boostTopicEntities: topicEntities });
        // Merge and deduplicate
        const seen = new Set(chunks.map(c => `${c.documentId}:${c.page}:${c.text.slice(0, 50)}`));
        for (const rc of retryChunks) {
          const key = `${rc.documentId}:${rc.page}:${rc.text.slice(0, 50)}`;
          if (!seen.has(key)) { chunks.push(rc); seen.add(key); }
        }
      }
    }

    // --- Persist scope after retrieval ---
    if (ragScopeEnabled && chunks.length > 0) {
      const retrievedDocIds = [...new Set(chunks.map(c => c.documentId))];
      if (scopeDocIds.length === 0 || scopeCleared) {
        // First turn or scope cleared (new doc named): set scope from retrieved docs
        const newScopeDocIds = retrievedDocIds.slice(0, 3);
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { scopeDocumentIds: newScopeDocIds },
        });
      }
      // If scope was active and used: keep existing scope (don't narrow further)
    }

    // Derive routing before building RAG context (context is mode-aware)
    const sources = this.buildSourcesFromChunks(chunks);
    const chunkScores = chunks.map(c => c.score ?? 0);
    const answerMode = this.deriveAnswerMode(params.req.message, sources, chunkScores);
    const navType = this.deriveNavType(params.req.message, answerMode);
    const preferredLanguage = params.req.preferredLanguage;
    const ragContext = this.buildRAGContext(chunks, answerMode, preferredLanguage);

    // Log retrieval telemetry (fire-and-forget, never fail the request)
    this.logRetrievalTelemetry({
      userId: params.req.userId,
      conversationId,
      chunks,
      chunkScores,
      answerMode,
      useScope,
      scopeDocIds,
    }).catch(() => {});

    // Emit meta event (answerMode, answerClass, navType) before streaming starts
    const answerClass = deriveAnswerClass(answerMode);
    if (params.sink.isOpen()) {
      params.sink.write({ event: "meta", data: { answerMode, answerClass, navType } } as any);
    }

    // Emit sources — strictly gated to doc_grounded_* modes
    // Limit early sources to top 3 (final event will have the definitive list)
    const isDocGrounded = answerMode.startsWith('doc_grounded');
    const earlySources = sources.slice(0, 3);
    if (answerMode === 'nav_pills' && earlySources.length > 0 && params.sink.isOpen()) {
      const listingItems = this.sourcesToListingItems(earlySources);
      params.sink.write({ event: 'listing', data: { items: listingItems } } as any);
    } else if (isDocGrounded && earlySources.length > 0 && params.sink.isOpen()) {
      params.sink.write({ event: "sources", data: { sources: earlySources } } as any);
    }
    // general_answer, fallback → NO sources emitted

    // Persist user message (skip on regenerate — reuse existing)
    let userMsg: { id: string };
    if (existingUserMsgId) {
      userMsg = { id: existingUserMsgId };
    } else {
      let attachmentMeta: Record<string, unknown> | undefined;
      if (attachedDocumentIds.length > 0) {
        const attachedDocs = await prisma.document.findMany({
          where: { id: { in: attachedDocumentIds }, userId: params.req.userId },
          select: { id: true, filename: true, mimeType: true },
        });
        attachmentMeta = {
          attachments: attachedDocs.map(d => ({
            type: 'attached_file',
            id: d.id,
            filename: d.filename || 'Document',
            mimeType: d.mimeType || 'application/octet-stream',
          })),
        };
      }
      userMsg = await this.createMessage({
        conversationId,
        role: "user",
        content: params.req.message,
        userId: params.req.userId,
        ...(attachmentMeta ? { metadata: attachmentMeta } : {}),
      });
    }

    // Build folder tree context (so Koda knows about the user's document inventory)
    const folderTreeContext = await this.buildFolderTreeContext(params.req.userId);

    // Build messages with RAG context
    const messagesWithContext: Array<{ role: ChatRole; content: string }> = [
      ...history,
    ];

    // Language enforcement system message (always present when language !== en)
    if (preferredLanguage && preferredLanguage !== 'en') {
      const langName = preferredLanguage === 'pt' ? 'Portuguese' : preferredLanguage === 'es' ? 'Spanish' : 'English';
      messagesWithContext.unshift({
        role: "system" as ChatRole,
        content: `LANGUAGE RULE: You MUST respond entirely in ${langName}. All your output must be in ${langName}. Do not respond in English unless the user explicitly asks for English.`,
      });
    }

    // Inject folder tree so the LLM can answer folder/document inventory questions
    if (folderTreeContext) {
      messagesWithContext.push({ role: "system" as ChatRole, content: folderTreeContext });
    }

    // Insert RAG context as a system message if we have relevant chunks
    if (ragContext) {
      messagesWithContext.push({ role: "system" as ChatRole, content: ragContext });
    }

    messagesWithContext.push({ role: "user" as ChatRole, content: params.req.message });

    // Stream from engine
    const streamed = await this.engine.stream({
      traceId,
      userId: params.req.userId,
      conversationId,
      messages: messagesWithContext,
      context: params.req.context,
      meta: params.req.meta,
      sink: params.sink,
      streamingConfig: params.streamingConfig,
    });

    // Strip inline citations + guard forbidden phrases + fix currency + linkify sources + semantic bolding
    const rawLLMText = streamed.finalText ?? "";
    let cleanedText = sources.length > 0
      ? this.stripInlineCitations(rawLLMText)
      : rawLLMText;
    cleanedText = this.guardForbiddenPhrases(cleanedText, answerMode);
    cleanedText = this.fixCurrencyArtifacts(cleanedText);
    cleanedText = this.stripRawFilenames(cleanedText);
    cleanedText = this.stripRawPaths(cleanedText);

    // Empty response safety net
    if (!cleanedText.trim()) {
      cleanedText = answerMode === 'nav_pills'
        ? "I found the document you're looking for."
        : "I found some relevant information, but couldn't generate a clear summary. Try rephrasing your question.";
    }

    // Reorder sources so documents the LLM actually cited come first.
    // This must happen AFTER the LLM runs because sources were initially ranked
    // by retrieval score, which may not match what the LLM chose to reference.
    let reorderedSources = this.reorderSourcesByLLMUsage(rawLLMText, sources);

    // Limit sources to top N most relevant (already sorted by retrieval score)
    // Text-based filtering is disabled as it produces false positives with paraphrased content
    const maxSources = 3;
    if (reorderedSources.length > maxSources) {
      reorderedSources = reorderedSources.slice(0, maxSources);
    }

    // Negative answer kill switch: if the LLM says "not mentioned" / "no information",
    // suppress sources to avoid misleading the user with irrelevant document pills.
    if (this.isNegativeAnswer(rawLLMText)) {
      reorderedSources = [];
    }

    cleanedText = this.linkifyTableSources(cleanedText, reorderedSources);

    // Apply ChatGPT-style semantic bolding (skip for nav_pills — those are minimal)
    if (answerMode !== 'nav_pills') {
      const bolding = getBoldingNormalizer();
      const boldResult = bolding.normalize({
        text: cleanedText,
        userQuery: params.req.message,
        lang: preferredLanguage || 'en',
      });
      cleanedText = boldResult.text;
    }

    // Sources are now persisted in message metadata — no need for text attribution
    const storedText = cleanedText;

    // Persist assistant message with sources in metadata
    const assistantMsg = await this.createMessage({
      conversationId,
      role: "assistant",
      content: storedText,
      userId: params.req.userId,
      metadata: answerMode === 'nav_pills'
        ? { listing: this.sourcesToListingItems(reorderedSources), sources: [], answerMode, answerClass, navType }
        : answerClass === 'DOCUMENT'
          ? { sources: reorderedSources, answerMode, answerClass, navType }
          : { sources: [], answerMode, answerClass, navType },
    });

    // Auto-generate conversation title from the first user message
    let generatedTitle: string | undefined;
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: params.req.userId, isDeleted: false },
      select: { title: true },
    });
    if (conv && (!conv.title || conv.title === "New Chat")) {
      generatedTitle = this.generateTitleFromMessage(params.req.message);
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: generatedTitle, updatedAt: new Date() },
      });
    }

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: cleanedText,
      attachmentsPayload: streamed.attachmentsPayload,
      assistantTelemetry: streamed.telemetry,
      sources: answerClass === 'DOCUMENT' ? reorderedSources : [],
      answerMode,
      answerClass,
      navType,
      generatedTitle,
    };
  }

  /* ---------------------------------------------
   * Internal helpers
   * -------------------------------------------- */

  private generateTitleFromMessage(message: string): string {
    // Clean up the message: trim, collapse whitespace
    const cleaned = message.replace(/\s+/g, " ").trim();
    if (!cleaned) return "New Chat";

    // If short enough, use as-is (capitalize first letter)
    if (cleaned.length <= 50) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    // Truncate at last word boundary before 50 chars
    const truncated = cleaned.slice(0, 50);
    const lastSpace = truncated.lastIndexOf(" ");
    const title = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
    return title.charAt(0).toUpperCase() + title.slice(1) + "…";
  }

  private async ensureConversation(userId: string, conversationId?: string): Promise<string> {
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId, isDeleted: false },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    const created = await this.createConversation({ userId, title: "New Chat" });
    return created.id;
  }

  private async loadRecentForEngine(conversationId: string, limit: number, userId?: string) {
    // If encrypted context is available, decrypt messages for the LLM
    if (this.encryptedContext && userId) {
      return this.encryptedContext.buildLLMContext(userId, conversationId, clampLimit(limit, 60));
    }

    // Fallback: read plaintext
    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: clampLimit(limit, 60),
      select: { role: true, content: true },
    });

    return rows.map((m) => ({
      role: m.role as ChatRole,
      content: String(m.content ?? ""),
    }));
  }
}

/* ---------------------------------------------
 * DTO mappers
 * -------------------------------------------- */

function toConversationDTO(row: any): ConversationDTO {
  return {
    id: String(row.id),
    title: String(row.title ?? "New Chat"),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function toMessageDTO(row: any): ChatMessageDTO {
  // For encrypted rows, content may be null — return empty string (decryption happens via EncryptedChatRepo)
  let metadata: Record<string, unknown> | null = null;
  try {
    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || null);
  } catch {}
  return {
    id: String(row.id),
    role: row.role as ChatRole,
    content: String(row.content ?? row.contentDecrypted ?? ""),
    attachments: (row as any).attachments ?? null,
    telemetry: (row as any).telemetry ?? null,
    metadata,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt ?? row.createdAt).toISOString(),
  };
}

/* ---------------------------------------------
 * Utils
 * -------------------------------------------- */

function clampLimit(n: unknown, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.max(v, 1), 500);
}

function mkTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
