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
  context?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export type AnswerMode =
  | 'doc_grounded_single'
  | 'doc_grounded_multi'
  | 'doc_grounded_quote'
  | 'nav_pills'
  | 'fallback'
  | 'general_answer';

export type NavType = 'open' | 'discover' | 'where' | null;

export interface ChatResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  assistantText: string;
  attachmentsPayload?: unknown;
  assistantTelemetry?: Record<string, unknown>;
  sources?: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>;
  answerMode?: AnswerMode;
  navType?: NavType;
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
  }): Promise<ChatMessageDTO> {
    const now = new Date();

    // If encrypted repo is available and userId is known, store encrypted
    if (this.encryptedRepo && params.userId) {
      const saved = await this.encryptedRepo.saveMessage(
        params.userId,
        params.conversationId,
        params.role,
        params.content ?? "",
      );

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

    // 3) RAG: Expand query with conversation context for follow-up questions
    const contextualQuery = this.expandQueryFromHistory(req.message, history);

    // Extract document focus and topic entities from conversation for targeted retrieval
    const focusFilenames = this.extractDocumentFocusFromHistory(history);
    const topicEntities = this.extractTopicEntitiesFromHistory(history);

    // Retrieve relevant document chunks (higher topK for better coverage)
    let chunks = await this.retrieveRelevantChunks(req.userId, contextualQuery, 15, { boostFilenames: focusFilenames, boostTopicEntities: topicEntities });

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

    // Derive routing before building RAG context (context is mode-aware)
    const sources = this.buildSourcesFromChunks(chunks);
    const answerMode = this.deriveAnswerMode(req.message, sources);
    const navType = this.deriveNavType(req.message, answerMode);
    const ragContext = this.buildRAGContext(chunks, answerMode);

    // 4) Persist user message
    const userMsg = await this.createMessage({
      conversationId,
      role: "user",
      content: req.message,
      userId: req.userId,
    });

    // 5) Build messages with RAG context
    const messagesWithContext: Array<{ role: ChatRole; content: string }> = [
      ...history,
    ];
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
    let cleanedText = sources.length > 0
      ? this.stripInlineCitations(engineOut.text ?? "")
      : (engineOut.text ?? "");
    cleanedText = this.guardForbiddenPhrases(cleanedText, answerMode);
    cleanedText = this.fixCurrencyArtifacts(cleanedText);
    cleanedText = this.linkifyTableSources(cleanedText, sources);

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

    // Build stored text with source attribution for conversation history context.
    // The frontend never sees this — it uses cleanedText (no attribution) + structured sources payload.
    let storedText = cleanedText;
    if (sources.length > 0 && !(/[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)/i.test(storedText))) {
      const attrSources = answerMode === 'nav_pills' ? sources.slice(0, 1) : sources;
      const sourceAttribution = attrSources.map(s => s.filename).filter(Boolean).join(', ');
      if (sourceAttribution) storedText += `\n\n— ${sourceAttribution}`;
    }

    // 8) Persist assistant message (with attribution for history context)
    const assistantMsg = await this.createMessage({
      conversationId,
      role: "assistant",
      content: storedText,
      userId: req.userId,
    });

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: cleanedText,
      attachmentsPayload: engineOut.attachmentsPayload,
      assistantTelemetry: engineOut.telemetry,
      sources,
      answerMode,
      navType,
    };
  }

  /* ---------------- RAG: Document Retrieval ---------------- */

  /**
   * Simple text-based document chunk retrieval using PostgreSQL keyword matching.
   * Returns relevant chunks from the user's documents, scored by keyword match count.
   * Also boosts chunks from documents whose filename matches keywords.
   */
  private async retrieveRelevantChunks(
    userId: string,
    query: string,
    maxChunks: number = 10,
    opts?: { boostFilenames?: string[]; boostTopicEntities?: string[] },
  ): Promise<Array<{ text: string; filename: string | null; page: number | null; documentId: string; mimeType: string | null }>> {
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

    const chunks = await prisma.$queryRaw<Array<{
      text: string;
      filename: string | null;
      encryptedFilename: string | null;
      filenameEncrypted: string | null;
      page: number | null;
      documentId: string;
      mimeType: string | null;
    }>>`
      SELECT dc."text", d."filename", d."encryptedFilename", d."filenameEncrypted", dc."page",
             d."id" AS "documentId", d."mimeType",
             (${Prisma.join(textScoreExprs, ' + ')} + ${Prisma.join(filenameScoreExprs, ' + ')} + ${filenameBoost} + ${topicBoost}) AS score
      FROM "document_chunks" dc
      JOIN "documents" d ON dc."documentId" = d."id"
      WHERE d."userId" = ${userId}
        AND dc."text" IS NOT NULL
        AND (
          (${Prisma.join(textConditions, ' OR ')})
          OR (${Prisma.join(filenameConditions, ' OR ')})
        )
      ORDER BY score DESC, dc."createdAt" DESC
      LIMIT ${maxChunks}
    `;

    // Batch-decrypt filenames for documents where filename is NULL but filenameEncrypted is set
    const decryptedFilenames = new Map<string, string>();
    const hasEncryptionKey = !!(process.env.KODA_MASTER_KEY_BASE64 || process.env.KODA_KMS_KEY_ID);

    if (hasEncryptionKey) {
      // Collect unique documentIds that need decryption
      const needsDecryption = new Map<string, string>();
      for (const c of chunks) {
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
    return chunks.filter(c => c.text).map(c => ({
      text: c.text,
      filename: c.filename
        || decryptedFilenames.get(c.documentId)
        || this.extractFilenameFromPath(c.encryptedFilename),
      page: c.page,
      documentId: c.documentId,
      mimeType: c.mimeType,
    }));
  }

  /** Extract filename from S3 path like users/.../docs/.../myfile.pdf */
  private extractFilenameFromPath(path: string | null): string | null {
    if (!path) return null;
    const segments = path.split('/');
    return segments[segments.length - 1] || null;
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
   * Build context string from retrieved chunks, with mode-specific instructions.
   */
  private buildRAGContext(
    chunks: Array<{ text: string; filename: string | null; page: number | null; documentId?: string; mimeType?: string | null }>,
    answerMode: AnswerMode,
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
      '- TABLE SOURCE COLUMNS (MANDATORY): Every markdown table you produce MUST have a "Source" column as the last column. Each Source cell MUST be a markdown link in this EXACT format — no exceptions, no plain text:',
      '  [ShortName · p.PAGE](koda://source?docId=DOCID&filename=FILENAME&page=PAGE&mime=MIMETYPE)',
      '  RULES:',
      '  - Copy the docId value exactly from the {docId=..., mime=...} metadata shown in each excerpt header above.',
      '  - Copy the mime value exactly from the same metadata.',
      '  - ShortName = a short human-readable label (e.g. "Ranch P&L 2024").',
      '  - If no page number, omit &page= and " · p.PAGE" from the display label.',
      '  - WRONG: [Ranch P&L 2024 · Row 17] (missing URL — this is plain text, NOT a link)',
      '  - CORRECT: [Ranch P&L 2024 · p.17](koda://source?docId=abc123&filename=Ranch.xlsx&page=17&mime=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)',
      '',
      '- CURRENCY FORMATTING: Never use LaTeX-style $...$ wrapping. For negative values use accounting parentheses: ($383,893.23). For positive values: $24,972,043.79. Always include a single $ sign before the number.',
      '',
      '- CALCULATION / RATIO QUESTIONS: When the user asks for a ratio, margin, percentage, or computed value, use this exact structure:',
      '  1. One-sentence answer with the result bolded.',
      '  2. An "Inputs" markdown table with columns: Input | Value | Source (use koda://source links).',
      '  3. **Formula:** line showing the formula name.',
      '  4. **Calculation:** line with actual numbers plugged in.',
      '  5. **Result:** line with the final computed value.',
      '',
      '- ABSOLUTELY FORBIDDEN phrases (never use these under any circumstances): "I cannot", "I can\'t", "I\'m sorry", "I apologize", "I\'m unable", "does not contain", "cannot find", "no relevant information", "the provided excerpts do not", "the excerpts do not". If you catch yourself starting a sentence with any of these, STOP and rewrite it.',
      '- When quoting text from a document, use markdown blockquote format (no attribution line — the UI handles it):',
      '  > exact quoted text here',
      '- If the excerpts don\'t fully cover the topic, state what you DID find and suggest 2-4 related search terms. Example: "Based on these excerpts, here\'s what I found: [content]. For more details, try searching for: \'X\', \'Y\', or \'Z\'."',
      '- Be direct, concise, and helpful. No unnecessary preambles.',
      '- For list questions (roles, events, artifacts, steps, etc.), provide ALL items mentioned in the documents. Do not stop at one or two — be exhaustive.',
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

    return [
      `Here are relevant excerpts from the user's documents:\n\n${contextParts.join('\n\n---\n\n')}`,
      '',
      'INSTRUCTIONS:',
      ...baseInstructions,
      ...modeInstructions,
    ].join('\n');
  }

  /**
   * Derive answerMode from query + retrieval results.
   */
  private deriveAnswerMode(
    query: string,
    sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>,
  ): AnswerMode {
    const q = query.toLowerCase().trim();

    // Navigation queries → nav_pills
    if (/\b(open|show me|find|discover|locate|where is)\b.*\b(document|file|pdf|doc)\b/i.test(q)) {
      return 'nav_pills';
    }
    if (/\bopen\b/i.test(q) && sources.length > 0) {
      return 'nav_pills';
    }

    // Quote queries → doc_grounded_quote
    if (/\b(quote|exact (?:words?|sentence|line|text)|verbatim|cite)\b/i.test(q)) {
      return sources.length > 0 ? 'doc_grounded_quote' : 'fallback';
    }

    // Doc-grounded when we have sources
    if (sources.length > 0) {
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

  /* ---------------- Chat (streamed) ---------------- */

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const traceId = mkTraceId();

    const conversationId = await this.ensureConversation(params.req.userId, params.req.conversationId);
    const history = await this.loadRecentForEngine(conversationId, 60, params.req.userId);

    // RAG: Expand query with conversation context for follow-up questions
    const contextualQuery = this.expandQueryFromHistory(params.req.message, history);

    // Extract document focus and topic entities from conversation for targeted retrieval
    const focusFilenames = this.extractDocumentFocusFromHistory(history);
    const topicEntities = this.extractTopicEntitiesFromHistory(history);

    // Retrieve relevant document chunks (higher topK for better coverage)
    let chunks = await this.retrieveRelevantChunks(params.req.userId, contextualQuery, 15, { boostFilenames: focusFilenames, boostTopicEntities: topicEntities });

    // Retry with expanded query if initial retrieval looks thin
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

    // Derive routing before building RAG context (context is mode-aware)
    const sources = this.buildSourcesFromChunks(chunks);
    const answerMode = this.deriveAnswerMode(params.req.message, sources);
    const navType = this.deriveNavType(params.req.message, answerMode);
    const ragContext = this.buildRAGContext(chunks, answerMode);

    // Emit meta event (answerMode, navType) before streaming starts
    if (params.sink.isOpen()) {
      params.sink.write({ event: "meta", data: { answerMode, navType } } as any);
    }

    // Emit sources event before streaming starts (so frontend can render pills during stream)
    if (sources.length > 0 && params.sink.isOpen()) {
      params.sink.write({ event: "sources", data: { sources } } as any);
    }

    // Persist user message first
    const userMsg = await this.createMessage({
      conversationId,
      role: "user",
      content: params.req.message,
      userId: params.req.userId,
    });

    // Build messages with RAG context
    const messagesWithContext: Array<{ role: ChatRole; content: string }> = [
      ...history,
    ];

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
    let cleanedText = sources.length > 0
      ? this.stripInlineCitations(streamed.finalText ?? "")
      : (streamed.finalText ?? "");
    cleanedText = this.guardForbiddenPhrases(cleanedText, answerMode);
    cleanedText = this.fixCurrencyArtifacts(cleanedText);
    cleanedText = this.linkifyTableSources(cleanedText, sources);

    // Apply ChatGPT-style semantic bolding (skip for nav_pills — those are minimal)
    if (answerMode !== 'nav_pills') {
      const bolding = getBoldingNormalizer();
      const boldResult = bolding.normalize({
        text: cleanedText,
        userQuery: params.req.message,
        lang: 'en',
      });
      cleanedText = boldResult.text;
    }

    // Build stored text with source attribution for conversation history context.
    // The frontend never sees this — it uses cleanedText (no attribution) + structured sources payload.
    let storedText = cleanedText;
    if (sources.length > 0 && !(/[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)/i.test(storedText))) {
      const attrSources = answerMode === 'nav_pills' ? sources.slice(0, 1) : sources;
      const sourceAttribution = attrSources.map(s => s.filename).filter(Boolean).join(', ');
      if (sourceAttribution) storedText += `\n\n— ${sourceAttribution}`;
    }

    // Persist assistant message after stream finishes (with attribution for history context)
    const assistantMsg = await this.createMessage({
      conversationId,
      role: "assistant",
      content: storedText,
      userId: params.req.userId,
    });

    return {
      conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: cleanedText,
      attachmentsPayload: streamed.attachmentsPayload,
      assistantTelemetry: streamed.telemetry,
      sources,
      answerMode,
      navType,
    };
  }

  /* ---------------------------------------------
   * Internal helpers
   * -------------------------------------------- */

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
  return {
    id: String(row.id),
    role: row.role as ChatRole,
    content: String(row.content ?? row.contentDecrypted ?? ""),
    attachments: (row as any).attachments ?? null,
    telemetry: (row as any).telemetry ?? null,
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
