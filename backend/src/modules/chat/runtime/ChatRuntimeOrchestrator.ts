import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import prisma from "../../../config/database";
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

/* ── Filename-detection helpers (borrowed from ScopeGateService) ─── */

const FILE_EXT_RE =
  /\b[\w][\w\-_. ]{0,160}\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp)\b/gi;

const DOC_REF_PHRASES_RE =
  /(?:usando\s+(?:o\s+)?documento|using\s+(?:the\s+)?(?:document|file)|no\s+(?:documento|arquivo)|from\s+(?:the\s+)?(?:document|file)|about\s+(?:the\s+)?(?:document|file)|(?:documento|arquivo)\s+chamado)\s+[""]?([^"""\n]{3,120})[""]?/gi;

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

function tokenOverlap(aTokens: string[], bTokens: string[]): number {
  const a = new Set(aTokens.filter((t) => t.length >= 2));
  const b = new Set(bTokens.filter((t) => t.length >= 2));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.max(a.size, b.size);
}

const DOC_STOPWORDS = new Set([
  "file",
  "document",
  "doc",
  "report",
  "spreadsheet",
  "sheet",
  "arquivo",
  "documento",
  "relatório",
  "relatorio",
  "planilha",
  "usando",
  "using",
  "from",
  "about",
  "the",
  "no",
]);

function docnameTokens(s: string): string[] {
  return simpleTokens(s).filter((t) => !DOC_STOPWORDS.has(t));
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

    // Always try explicit document-name detection first, even on the first turn
    // before a conversationId exists. This prevents cross-document retrieval on
    // opening queries like "using document X...".
    if ((next.attachedDocumentIds || []).length === 0) {
      const detected = await this.detectDocumentMentions(
        req.userId,
        req.message,
      );
      if (detected.length > 0) {
        console.log("[Scope] detected document mentions:", detected);
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

    // Strategy 1: match file-extension tokens (e.g. "OBA_marketing.pdf")
    const extMatches = message.matchAll(FILE_EXT_RE);
    for (const m of extMatches) {
      candidates.add(lower(m[0]));
    }

    // Strategy 2: match "using document X" / "usando o documento X" phrases
    const phraseMatches = message.matchAll(DOC_REF_PHRASES_RE);
    for (const m of phraseMatches) {
      const raw = (m[1] || "").trim();
      if (raw.length >= 3) candidates.add(lower(raw));
    }

    if (candidates.size === 0) return [];

    // Fetch user's ready/indexed documents
    const docs = await prisma.document.findMany({
      where: {
        userId,
        status: {
          in: ["ready", "indexed", "available", "enriching", "completed"],
        },
      },
      select: { id: true, filename: true },
    });
    if (!docs.length) return [];

    const matched = new Set<string>();

    for (const candidate of candidates) {
      const candidateTokens = docnameTokens(candidate);

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
          continue;
        }

        // Token overlap match (threshold 0.5 — same family as ScopeGateService)
        const fnTokens = docnameTokens(doc.filename ?? "");
        const overlap = tokenOverlap(candidateTokens, fnTokens);
        if (overlap >= 0.5) {
          matched.add(doc.id);
        }
      }
    }

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
      console.log("[Scope] persisted scope:", scopeForValidation);
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
