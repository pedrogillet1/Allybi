import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import prisma from "../../../config/database";
import { getBankLoaderInstance } from "../../../services/core/banks/bankLoader.service";
import { logger } from "../../../utils/logger";
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

function simpleTokens(s: string): string[] {
  return lower(s)
    .replace(/["""]/g, " ")
    .split(/[\s,;:.!?()]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function tokenOverlap(
  aTokens: string[],
  bTokens: string[],
  minTokenLength: number,
): number {
  const a = new Set(aTokens.filter((t) => t.length >= minTokenLength));
  const b = new Set(bTokens.filter((t) => t.length >= minTokenLength));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.max(a.size, b.size);
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

  private docnameTokens(s: string): string[] {
    return simpleTokens(s).filter((t) => !this.scopeRuntime.stopWords.has(t));
  }

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

    // Check if the message has explicit doc-reference phrases (e.g., "Usando os documentos X, Y e Z").
    // When present, always re-detect — even if attachedDocumentIds is pre-populated from
    // persisted scope — so multi-doc queries resolve all mentioned documents.
    const hasExplicitDocPhrase = this.scopeRuntime.candidateDocRefRegex.some(
      (re: RegExp) => {
        re.lastIndex = 0; // reset stateful regex
        return re.test(req.message);
      },
    );

    if (hasExplicitDocPhrase || (next.attachedDocumentIds || []).length === 0) {
      const detected = await this.detectDocumentMentions(
        req.userId,
        req.message,
      );
      if (detected.length > 0) {
        logger.debug("[Scope] detected document mentions", {
          detected,
          hadExplicitDocPhrase: hasExplicitDocPhrase,
          previousIds: next.attachedDocumentIds,
          userId: req.userId,
        });
        next.attachedDocumentIds = detected;
      }
    }

    const conversationId = String(req.conversationId || "").trim();
    if (!conversationId) return next;

    // 1. Clear scope if requested
    if (this.scopeService.shouldClearScope(req)) {
      await this.scopeService.clearConversationScope(
        req.userId,
        conversationId,
      );
      next.attachedDocumentIds = [];
      return next;
    }

    // 2. If explicit attachedDocumentIds from UI → use them
    if ((next.attachedDocumentIds || []).length > 0) {
      return next;
    }

    // 3. Fall back to conversation-persisted scope
    const persisted = await this.scopeService.getConversationScope(
      req.userId,
      conversationId,
    );
    if (persisted.length > 0) {
      next.attachedDocumentIds = persisted;
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
  ): Promise<string[]> {
    if (!message || !userId) return [];

    const candidates = new Set<string>();

    for (const pattern of this.scopeRuntime.candidateFilenameRegex) {
      const extMatches = message.matchAll(pattern);
      for (const m of extMatches) {
        const matched = lower(m[0]);
        if (matched.length >= this.scopeRuntime.docNameMinLength) {
          candidates.add(matched);
        }
      }
    }

    for (const pattern of this.scopeRuntime.candidateDocRefRegex) {
      const phraseMatches = message.matchAll(pattern);
      for (const m of phraseMatches) {
        const raw = String(m[1] || "").trim();
        if (raw.length >= this.scopeRuntime.docNameMinLength) {
          candidates.add(lower(raw));
        }
      }
    }

    if (candidates.size === 0) return [];

    logger.debug("[Scope] document mention candidates", {
      candidates: Array.from(candidates),
      userId,
    });

    // Fetch user's ready/indexed documents
    const docs = await prisma.document.findMany({
      where: {
        userId,
        status: { in: this.scopeRuntime.docStatusesAllowed },
      },
      select: { id: true, filename: true },
    });
    if (!docs.length) return [];

    logger.debug("[Scope] user indexed documents", {
      filenames: docs.map((d) => d.filename || "(none)"),
      count: docs.length,
    });

    const matched = new Set<string>();
    const candidateResults: Record<string, { matchedDocId?: string; matchType?: string; failed?: boolean }> = {};

    for (const candidate of candidates) {
      const candidateTokens = this.docnameTokens(candidate);
      let candidateMatched = false;

      for (const doc of docs) {
        const fn = lower(doc.filename ?? "");
        if (!fn) continue;

        // Exact or substring match
        if (
          fn === candidate ||
          fn.includes(candidate) ||
          candidate.includes(fn)
        ) {
          matched.add(doc.id);
          candidateResults[candidate] = { matchedDocId: doc.id, matchType: "exact/substring" };
          candidateMatched = true;
          break;
        }

        // Token overlap match (threshold 0.5 — same family as ScopeGateService)
        const fnTokens = this.docnameTokens(doc.filename ?? "");
        const overlap = tokenOverlap(
          candidateTokens,
          fnTokens,
          this.scopeRuntime.tokenMinLength,
        );
        if (overlap >= this.scopeRuntime.tokenOverlapThreshold) {
          matched.add(doc.id);
          candidateResults[candidate] = { matchedDocId: doc.id, matchType: `token-overlap(${overlap.toFixed(2)})` };
          candidateMatched = true;
          break;
        }
      }

      if (!candidateMatched) {
        candidateResults[candidate] = { failed: true };
      }
    }

    logger.debug("[Scope] document mention matches", {
      matchedIds: Array.from(matched),
      docsChecked: docs.length,
      candidateResults,
    });

    return Array.from(matched);
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
