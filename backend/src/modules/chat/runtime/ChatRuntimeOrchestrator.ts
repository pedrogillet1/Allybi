import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import prisma from "../../../config/database";
import { getBankLoaderInstance } from "../../../services/core/banks/bankLoader.service";
import { logger } from "../../../utils/logger";
import {
  resolveDocumentReference,
  type DocumentReferenceDoc,
} from "../../../services/core/scope/documentReferenceResolver.service";
import type {
  ChatMessageDTO,
  ChatRequest,
  ChatResult,
  ConversationDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  ConversationWithMessagesDTO,
  CreateMessageParams,
} from "../domain/chat.contracts";
import { ContractNormalizer } from "./ContractNormalizer";
import { EvidenceValidator } from "./EvidenceValidator";
import { ScopeService } from "./ScopeService";

type ScopeRuntimeMentionConfig = {
  tokenMinLength: number;
  docNameMinLength: number;
  tokenOverlapThreshold: number;
  candidateFilenameRegex: RegExp[];
  candidateDocRefRegex: RegExp[];
  docStatusesAllowed: string[];
  stopWords: Set<string>;
};

function filenameFromStorageKey(
  storageKey: string | null | undefined,
): string | null {
  const key = String(storageKey || "").trim();
  if (!key) return null;
  const tail = key.split("/").pop();
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

function resolveScopeRuntimeMentionConfig(): ScopeRuntimeMentionConfig {
  const bank = getBankLoaderInstance().getBank<any>("memory_policy");
  const runtime = bank?.config?.runtimeTuning?.scopeRuntime;
  if (!runtime || typeof runtime !== "object") {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime is required",
    );
  }

  const tokenMinLength = Number(runtime.tokenMinLength);
  const docNameMinLength = Number(runtime.docNameMinLength);
  const tokenOverlapThreshold = Number(runtime.tokenOverlapThreshold);

  if (!Number.isFinite(tokenMinLength) || tokenMinLength < 1) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.tokenMinLength is required",
    );
  }
  if (!Number.isFinite(docNameMinLength) || docNameMinLength < 1) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.docNameMinLength is required",
    );
  }
  if (
    !Number.isFinite(tokenOverlapThreshold) ||
    tokenOverlapThreshold <= 0 ||
    tokenOverlapThreshold > 1
  ) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.tokenOverlapThreshold is required",
    );
  }

  const filenamePatterns = Array.isArray(runtime?.candidatePatterns?.filename)
    ? runtime.candidatePatterns.filename
    : [];
  const phrasePatterns = Array.isArray(
    runtime?.candidatePatterns?.docReferencePhrase,
  )
    ? runtime.candidatePatterns.docReferencePhrase
    : [];
  if (filenamePatterns.length === 0 || phrasePatterns.length === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.candidatePatterns is required",
    );
  }

  const candidateFilenameRegex = filenamePatterns.map((pattern: unknown) => {
    const source = String(pattern || "").trim();
    if (!source) {
      throw new Error(
        "memory_policy scopeRuntime candidate filename regex cannot be empty",
      );
    }
    try {
      return new RegExp(source, "gi");
    } catch {
      throw new Error(`Invalid scopeRuntime filename regex: ${source}`);
    }
  });
  const candidateDocRefRegex = phrasePatterns.map((pattern: unknown) => {
    const source = String(pattern || "").trim();
    if (!source) {
      throw new Error(
        "memory_policy scopeRuntime doc reference regex cannot be empty",
      );
    }
    try {
      return new RegExp(source, "gi");
    } catch {
      throw new Error(`Invalid scopeRuntime doc reference regex: ${source}`);
    }
  });

  const docStatusesAllowed = (
    Array.isArray(runtime.docStatusesAllowed) ? runtime.docStatusesAllowed : []
  )
    .map((value: unknown) => String(value || "").trim())
    .filter(Boolean);
  if (docStatusesAllowed.length === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.docStatusesAllowed is required",
    );
  }

  const stopWords = new Set<string>(
    (Array.isArray(runtime.docStopWords) ? runtime.docStopWords : [])
      .map((value: unknown) => lower(String(value || "")))
      .filter((value: string): value is string => value.length > 0),
  );
  if (stopWords.size === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.docStopWords is required",
    );
  }

  return {
    tokenMinLength: Math.floor(tokenMinLength),
    docNameMinLength: Math.floor(docNameMinLength),
    tokenOverlapThreshold,
    candidateFilenameRegex,
    candidateDocRefRegex,
    docStatusesAllowed,
    stopWords,
  };
}

function normSpace(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function lower(s: string): string {
  return normSpace(s).toLowerCase();
}

export type RuntimeDelegate = {
  chat(req: ChatRequest): Promise<ChatResult>;
  streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult>;
  createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO>;
  listConversations(
    userId: string,
    opts?: ConversationListOptions,
  ): Promise<ConversationDTO[]>;
  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null>;
  getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ConversationWithMessagesDTO | null>;
  updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null>;
  deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }>;
  deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }>;
  listMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ChatMessageDTO[]>;
  createMessage(params: CreateMessageParams): Promise<ChatMessageDTO>;
};

export class ChatRuntimeOrchestrator {
  private readonly normalizer = new ContractNormalizer();
  private readonly evidenceValidator = new EvidenceValidator();
  private readonly scopeService = new ScopeService();
  private readonly scopeRuntime = resolveScopeRuntimeMentionConfig();

  constructor(private readonly delegate: RuntimeDelegate) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const preparedReq = await this.prepareRequest(req);
    const raw = await this.delegate.chat(preparedReq);
    return this.postProcess(preparedReq, raw);
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const preparedReq = await this.prepareRequest(params.req);
    const raw = await this.delegate.streamChat({
      ...params,
      req: preparedReq,
    });
    return this.postProcess(preparedReq, raw);
  }

  async createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO> {
    return this.delegate.createConversation(params);
  }

  async listConversations(
    userId: string,
    opts?: ConversationListOptions,
  ): Promise<ConversationDTO[]> {
    return this.delegate.listConversations(userId, opts);
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null> {
    return this.delegate.getConversation(userId, conversationId);
  }

  async getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ConversationWithMessagesDTO | null> {
    return this.delegate.getConversationWithMessages(
      userId,
      conversationId,
      opts,
    );
  }

  async updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null> {
    return this.delegate.updateTitle(userId, conversationId, title);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }> {
    return this.delegate.deleteConversation(userId, conversationId);
  }

  async deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }> {
    return this.delegate.deleteAllConversations(userId);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ChatMessageDTO[]> {
    return this.delegate.listMessages(userId, conversationId, opts);
  }

  async createMessage(params: CreateMessageParams): Promise<ChatMessageDTO> {
    return this.delegate.createMessage(params);
  }

  private async prepareRequest(req: ChatRequest): Promise<ChatRequest> {
    const next: ChatRequest = {
      ...req,
      attachedDocumentIds: Array.isArray(req.attachedDocumentIds)
        ? [...req.attachedDocumentIds]
        : [],
    };
    const conversationId = String(req.conversationId || "").trim();

    // 1. Clear scope if requested
    if (conversationId && this.scopeService.shouldClearScope(req)) {
      await this.scopeService.clearConversationScope(
        req.userId,
        conversationId,
      );
      next.attachedDocumentIds = [];
      return next;
    }

    const explicitScope = this.scopeService.attachedScope(next);
    if (explicitScope.length > 0) {
      const narrowedFromExplicit = await this.detectDocumentMentions(
        req.userId,
        req.message,
        {
          restrictToDocumentIds: explicitScope,
        },
      );
      if (narrowedFromExplicit.length > 0) {
        logger.debug("[Scope] narrowed explicit scope from semantic mention", {
          detected: narrowedFromExplicit,
          previousIds: explicitScope,
          userId: req.userId,
        });
        next.attachedDocumentIds = narrowedFromExplicit;
      } else {
        next.attachedDocumentIds = explicitScope;
      }
      return next;
    }

    if (!conversationId) {
      const detected = await this.detectDocumentMentions(
        req.userId,
        req.message,
      );
      if (detected.length > 0) {
        logger.debug("[Scope] detected document mentions", {
          detected,
          previousIds: [],
          userId: req.userId,
        });
        next.attachedDocumentIds = detected;
      }
      return next;
    }

    // 3. Fall back to conversation-persisted scope
    const persisted = await this.scopeService.getConversationScope(
      req.userId,
      conversationId,
    );
    if (persisted.length > 0) {
      const narrowedFromPersisted = await this.detectDocumentMentions(
        req.userId,
        req.message,
        {
          restrictToDocumentIds: persisted,
        },
      );
      if (narrowedFromPersisted.length > 0) {
        logger.debug("[Scope] narrowed persisted scope from semantic mention", {
          detected: narrowedFromPersisted,
          previousIds: persisted,
          userId: req.userId,
        });
        next.attachedDocumentIds = narrowedFromPersisted;
      } else {
        next.attachedDocumentIds = persisted;
      }
      return next;
    }

    const detected = await this.detectDocumentMentions(req.userId, req.message);
    if (detected.length > 0) {
      logger.debug("[Scope] detected document mentions", {
        detected,
        previousIds: [],
        userId: req.userId,
      });
      next.attachedDocumentIds = detected;
    }
    return next;
  }

  /**
   * Extract document filenames mentioned in the user's message and resolve
   * them to document IDs by matching against the user's indexed documents.
   */
  private async detectDocumentMentions(
    userId: string,
    message: string,
    options?: {
      restrictToDocumentIds?: string[];
    },
  ): Promise<string[]> {
    if (!message || !userId) return [];
    const restrictedDocIds = Array.isArray(options?.restrictToDocumentIds)
      ? options?.restrictToDocumentIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      : [];

    if (options?.restrictToDocumentIds && restrictedDocIds.length === 0) {
      return [];
    }

    // Fetch user's ready/indexed documents
    const docs = await prisma.document.findMany({
      where: {
        userId,
        status: { in: this.scopeRuntime.docStatusesAllowed },
        ...(restrictedDocIds.length > 0
          ? { id: { in: restrictedDocIds } }
          : {}),
      },
      select: {
        id: true,
        filename: true,
        displayTitle: true,
        encryptedFilename: true,
      },
    });
    if (!docs.length) return [];

    const referenceDocs: DocumentReferenceDoc[] = docs.map((doc) => ({
      docId: doc.id,
      filename:
        doc.filename ||
        doc.displayTitle ||
        filenameFromStorageKey(doc.encryptedFilename),
      title:
        doc.displayTitle ||
        doc.filename ||
        filenameFromStorageKey(doc.encryptedFilename),
    }));
    const resolution = resolveDocumentReference(message, referenceDocs);
    if (!resolution.explicitDocRef) return [];

    logger.debug("[Scope] document mention matches", {
      matchedIds: resolution.matchedDocIds,
      docsChecked: docs.length,
      confidence: resolution.confidence,
      method: resolution.method,
      candidates: resolution.candidates,
    });

    return resolution.matchedDocIds;
  }

  private async postProcess(
    req: ChatRequest,
    result: ChatResult,
  ): Promise<ChatResult> {
    const normalized = this.normalizer.normalize(result);
    const conversationId = String(result.conversationId || "").trim();
    if (!conversationId) return normalized;

    if (this.scopeService.shouldClearScope(req)) {
      await this.scopeService.clearConversationScope(
        req.userId,
        conversationId,
      );
    }

    const attachedScope = this.scopeService.attachedScope(req);
    if (attachedScope.length > 0) {
      await this.scopeService.setConversationScope(
        req.userId,
        conversationId,
        attachedScope,
      );
    }

    const persistedScope = await this.scopeService.getConversationScope(
      req.userId,
      conversationId,
    );

    const scopeForValidation =
      attachedScope.length > 0 ? attachedScope : persistedScope;
    if (scopeForValidation.length > 0) {
      logger.debug("[Scope] persisted scope", {
        scopeForValidation,
        userId: req.userId,
        conversationId,
      });
    }
    const scoped = this.evidenceValidator.enforceScope(
      normalized,
      scopeForValidation,
    );

    // Keep compatibility flags coherent.
    if (
      scoped.status !== "success" &&
      !scoped.fallbackReasonCode &&
      scoped.failureCode
    ) {
      scoped.fallbackReasonCode = scoped.failureCode;
    }

    return scoped;
  }
}
