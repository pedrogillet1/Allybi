import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import type { DocumentStatus } from "@prisma/client";
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
import { ScopeService } from "./ScopeService";
import { ScopeIntentInterpreter } from "./scopeIntentInterpreter";
import { resolveScopeRuntimeConfig } from "./scopeRuntimeConfig";
import { TurnFinalizationService } from "./TurnFinalizationService";
import type { TurnExecutionDraft } from "./turnExecutionDraft";

type ScopeRuntimeMentionConfig = {
  tokenMinLength: number;
  docNameMinLength: number;
  tokenOverlapThreshold: number;
  candidateFilenameRegex: RegExp[];
  candidateDocRefRegex: RegExp[];
  docStatusesAllowed: string[];
  stopWords: Set<string>;
};

const KNOWN_DOCUMENT_STATUSES: ReadonlySet<DocumentStatus> = new Set([
  "ready",
  "indexed",
  "enriching",
  "available",
  "completed",
]);
const GENERIC_FILE_TOKENS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
]);

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

function resetRegex(pattern: RegExp): void {
  pattern.lastIndex = 0;
}

function matchRegexPatterns(patterns: RegExp[], input: string): string[] {
  const matches: string[] = [];
  for (const pattern of patterns) {
    resetRegex(pattern);
    if (pattern.global) {
      let result: RegExpExecArray | null = null;
      while ((result = pattern.exec(input)) !== null) {
        for (const chunk of result) {
          const value = normSpace(String(chunk || ""));
          if (value) matches.push(value);
        }
        if (result[0] === "") {
          pattern.lastIndex += 1;
        }
      }
    } else {
      const result = pattern.exec(input);
      if (!result) continue;
      for (const chunk of result) {
        const value = normSpace(String(chunk || ""));
        if (value) matches.push(value);
      }
    }
  }
  return matches;
}

function tokenizeForScope(
  input: string,
  config: Pick<ScopeRuntimeMentionConfig, "tokenMinLength" | "stopWords">,
): string[] {
  const normalized = lower(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= config.tokenMinLength &&
        !config.stopWords.has(token) &&
        !GENERIC_FILE_TOKENS.has(token),
    );
}

function lexicalOverlapScore(
  messageTokens: Set<string>,
  docTokens: string[],
): number {
  if (docTokens.length === 0 || messageTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of docTokens) {
    if (messageTokens.has(token)) overlap += 1;
  }
  return overlap / docTokens.length;
}

function normalizeForExactMention(value: string): string {
  return lower(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RuntimeDelegate = {
  chat(req: ChatRequest): Promise<TurnExecutionDraft>;
  streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<TurnExecutionDraft>;
  persistFinalizedTurn(params: {
    draft: TurnExecutionDraft;
    finalized: ChatResult;
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
  private readonly scopeService: ScopeService;
  private readonly scopeIntentInterpreter: ScopeIntentInterpreter;
  private readonly finalizationService: TurnFinalizationService;
  private readonly scopeRuntime: ScopeRuntimeMentionConfig;

  constructor(
    private readonly delegate: RuntimeDelegate,
    deps: {
      scopeService?: ScopeService;
      scopeIntentInterpreter?: ScopeIntentInterpreter;
      finalizationService?: TurnFinalizationService;
      scopeRuntime?: ScopeRuntimeMentionConfig;
    } = {},
  ) {
    const scopeRuntimeConfig =
      deps.scopeService && deps.scopeIntentInterpreter
        ? null
        : resolveScopeRuntimeConfig(getBankLoaderInstance());
    this.scopeService =
      deps.scopeService ||
      new ScopeService({
        prismaClient: prisma as any,
        runtimeConfig: scopeRuntimeConfig!,
      });
    this.scopeIntentInterpreter =
      deps.scopeIntentInterpreter ||
      new ScopeIntentInterpreter(scopeRuntimeConfig!);
    this.finalizationService =
      deps.finalizationService || new TurnFinalizationService();
    this.scopeRuntime = deps.scopeRuntime || resolveScopeRuntimeMentionConfig();
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const preparedReq = await this.prepareRequest(req);
    const draft = await this.delegate.chat(preparedReq);
    return this.runTurnPipeline(preparedReq, draft);
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const preparedReq = await this.prepareRequest(params.req);
    const draft = await this.delegate.streamChat({
      ...params,
      req: preparedReq,
    });
    return this.runTurnPipeline(preparedReq, draft);
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
    if (conversationId && this.scopeIntentInterpreter.shouldClearScope(req)) {
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
    const mentionSignals = [
      ...matchRegexPatterns(this.scopeRuntime.candidateFilenameRegex, message),
      ...matchRegexPatterns(this.scopeRuntime.candidateDocRefRegex, message),
    ];
    if (mentionSignals.length === 0) return [];
    const restrictedDocIds = Array.isArray(options?.restrictToDocumentIds)
      ? options?.restrictToDocumentIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      : [];

    if (options?.restrictToDocumentIds && restrictedDocIds.length === 0) {
      return [];
    }
    const allowedStatuses = this.scopeRuntime.docStatusesAllowed
      .map((status) =>
        String(status || "")
          .trim()
          .toLowerCase(),
      )
      .filter((status): status is DocumentStatus =>
        KNOWN_DOCUMENT_STATUSES.has(status as DocumentStatus),
      );
    if (allowedStatuses.length === 0) return [];

    // Fetch user's ready/indexed documents
    const docs = await prisma.document.findMany({
      where: {
        userId,
        status: { in: allowedStatuses },
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
    const scopeTokens = new Set(
      tokenizeForScope(`${message}\n${mentionSignals.join(" ")}`, this.scopeRuntime),
    );
    const lexicalMatches = referenceDocs
      .map((doc) => {
        const docText = normSpace(`${doc.filename || ""} ${doc.title || ""}`);
        if (docText.length < this.scopeRuntime.docNameMinLength) return null;
        const docTokens = tokenizeForScope(docText, this.scopeRuntime);
        const score = lexicalOverlapScore(scopeTokens, docTokens);
        if (score < this.scopeRuntime.tokenOverlapThreshold) return null;
        return { docId: doc.docId, score };
      })
      .filter(
        (entry): entry is { docId: string; score: number } =>
          Boolean(entry?.docId),
      )
      .sort((a, b) => b.score - a.score);

    const lexicalMatchedDocIds = new Set(lexicalMatches.map((entry) => entry.docId));
    const resolverCandidates = (resolution.matchedDocIds || []).filter(Boolean);
    const mentionSignalCorpus = normalizeForExactMention(
      `${message}\n${mentionSignals.join(" ")}`,
    );
    const resolverQualifiedDocIds = resolverCandidates.filter((docId) => {
      const doc = referenceDocs.find((item) => item.docId === docId);
      if (!doc) return false;
      const names = [doc.filename, doc.title]
        .map((value) => normalizeForExactMention(String(value || "")))
        .filter(Boolean);
      if (names.length === 0) return false;
      return names.some((name) => mentionSignalCorpus.includes(name));
    });

    // Strict acceptance: lexical threshold wins; resolver-only fallback is
    // allowed only for explicit high-confidence exact mentions.
    let matched: string[] = Array.from(lexicalMatchedDocIds);
    if (matched.length === 0) {
      const resolverOnlyAllowed =
        resolution.explicitDocRef &&
        resolution.method === "exact" &&
        resolution.confidence >= 0.9 &&
        resolverQualifiedDocIds.length > 0;
      if (!resolverOnlyAllowed) return [];
      matched = resolverQualifiedDocIds;
    }

    logger.debug("[Scope] document mention matches", {
      matchedIds: matched,
      lexicalMatches: lexicalMatches.map((entry) => ({
        docId: entry.docId,
        score: entry.score,
      })),
      docsChecked: docs.length,
      confidence: resolution.confidence,
      method: resolution.method,
      candidates: resolution.candidates,
      mentionSignals,
    });

    return matched;
  }

  private async runTurnPipeline(
    req: ChatRequest,
    draft: TurnExecutionDraft,
  ): Promise<ChatResult> {
    const conversationId = String(draft.conversationId || "").trim();
    if (!conversationId) {
      const finalizedWithoutConversation = await this.finalizationService.finalize(
        draft,
        {
          request: req,
          scopeDocumentIds: this.scopeService.attachedScope(req),
        },
      );
      return this.delegate.persistFinalizedTurn({
        draft,
        finalized: finalizedWithoutConversation,
      });
    }

    if (this.scopeIntentInterpreter.shouldClearScope(req)) {
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
    const finalized = await this.finalizationService.finalize(draft, {
      request: req,
      scopeDocumentIds: scopeForValidation,
    });
    return this.delegate.persistFinalizedTurn({
      draft,
      finalized,
    });
  }
}
