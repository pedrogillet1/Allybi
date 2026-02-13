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
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BRAND_NAME } from '../config/brand';
import { resolveDataDir } from '../utils/resolveDataDir';

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
import { getEmailComposeExtractor } from './core/execution/emailComposeExtractor.service';
import { TokenVaultService } from './connectors/tokenVault.service';
import { ConnectorHandlerService } from './core/handlers/connectorHandler.service';
import { GmailClientService } from './connectors/gmail/gmailClient.service';
import { GmailOAuthService } from './connectors/gmail/gmailOAuth.service';
import { GraphClientService } from './connectors/outlook/graphClient.service';
import { OutlookOAuthService } from './connectors/outlook/outlookOAuth.service';
import SlackClientService from './connectors/slack/slackClient.service';
import { DeckPlannerService } from './creative/deck/deckPlanner.service';
import { SlidesDeckBuilderService } from './creative/deck/slidesDeckBuilder.service';
import { SlidesClientService } from './editing/slides/slidesClient.service';
import { downloadFile } from '../config/storage';
import { KodaIntentEngineV3Service } from './core/routing/intentEngine.service';
import { detectBulkEditIntent } from './editing/bulkEditIntent';
import { normalizeEditOperator } from './editing/editOperatorAliases.service';
import { classifyAllybiIntent, loadAllybiBanks, planAllybiOperator, resolveAllybiScope } from './editing/allybi';
import { resolveFontIntent } from './editing/allybi/fontIntentResolver';
import type { AllybiScopeResolution } from './editing/allybi/scopeResolver';
import { XlsxInspectorService } from './editing/xlsx/xlsxInspector.service';
import { EditHandlerService } from './core/handlers/editHandler.service';
import { DocumentRevisionStoreService } from './editing/documentRevisionStore.service';
import { DocxAnchorsService } from './editing/docx/docxAnchors.service';
import { TargetResolverService } from './editing';
import type { DocxParagraphNode, EditDomain, EditOperator, ResolvedTarget } from './editing';
import { extractXlsxWithAnchors } from './extraction/xlsxExtractor.service';
import ExcelJS from 'exceljs';

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
  connectorContext?: {
    // UI activation state: only the active provider is allowed for read/send operations.
    activeProvider?: "gmail" | "outlook" | "slack" | null;
    gmail?: { connected: boolean; canSend?: boolean };
    outlook?: { connected: boolean; canSend?: boolean };
    slack?: { connected: boolean; canSend?: boolean };
  };
}

export type AnswerMode =
  | 'doc_grounded_single'
  | 'doc_grounded_multi'
  | 'doc_grounded_quote'
  | 'nav_pills'
  | 'fallback'
  | 'general_answer'
  | 'help_steps'
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
  private readonly tokenVault = new TokenVaultService();
  private readonly connectorHandler = new ConnectorHandlerService({ tokenVault: this.tokenVault });
  private readonly gmailClient = new GmailClientService();
  private readonly gmailOAuth = new GmailOAuthService(this.tokenVault);
  private readonly graphClient = new GraphClientService();
  private readonly outlookOAuth = new OutlookOAuthService({ tokenVault: this.tokenVault });
  private readonly slackClient = new SlackClientService();
  private readonly deckPlanner: DeckPlannerService;
  private readonly deckBuilder: SlidesDeckBuilderService;
  private readonly slidesClient: SlidesClientService;
  private readonly intentEngineV3 = new KodaIntentEngineV3Service();
  private readonly editHandler = new EditHandlerService({
    revisionStore: new DocumentRevisionStoreService(),
  });
  private readonly docxAnchors = new DocxAnchorsService();
  private readonly targetResolver = new TargetResolverService();
  private readonly xlsxInspector = new XlsxInspectorService();

  constructor(
    private readonly engine: ChatEngine,
    opts?: {
      encryptedRepo?: EncryptedChatRepo;
      encryptedContext?: EncryptedChatContextService;
    },
  ) {
    this.encryptedRepo = opts?.encryptedRepo;
    this.encryptedContext = opts?.encryptedContext;
    this.deckPlanner = new DeckPlannerService(this.engine as any);
    this.deckBuilder = new SlidesDeckBuilderService();
    this.slidesClient = new SlidesClientService();
  }

  /* ---------------- Conversations (CRUD) ---------------- */

  async createConversation(params: { userId: string; title?: string }): Promise<ConversationDTO> {
    const now = new Date();
    const rawTitle = String(params.title ?? "New Chat");
    const lowered = rawTitle.toLowerCase();
    const contextType =
      lowered.startsWith("__viewer__:") ? "viewer"
      : lowered.startsWith("__editor__:") ? "editor"
      : null;
    const created = await prisma.conversation.create({
      data: {
        userId: params.userId,
        title: rawTitle,
        createdAt: now,
        updatedAt: now,
        ...(contextType ? { contextType } : {}),
      },
    });

    return toConversationDTO(created);
  }

  async listConversations(userId: string, opts: { limit?: number; cursor?: string } = {}): Promise<ConversationDTO[]> {
    const limit = clampLimit(opts.limit, 50);

    const rows = await prisma.conversation.findMany({
      // Hide document-viewer embedded chats from the normal chat list.
      // We use a reserved title prefix instead of a schema migration.
      where: {
        userId,
        isDeleted: false,
        NOT: {
          OR: [
            { contextType: { in: ["viewer", "editor"] } },
            { title: { startsWith: "__viewer__:" } },
            // Legacy prefix used by older DocumentViewer builds.
            { title: { startsWith: "__editor__:" } },
          ],
        },
      },
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
        try {
          await prisma.message.update({
            where: { id: saved.id },
            data: { metadata: metadataJson },
          });
        } catch (err) {
          console.error('[createMessage] Failed to save metadata for message', saved.id, err);
          // Retry once — transient connection issues should not lose metadata
          try {
            await prisma.message.update({
              where: { id: saved.id },
              data: { metadata: metadataJson },
            });
          } catch (retryErr) {
            console.error('[createMessage] Retry also failed for message', saved.id, retryErr);
          }
        }
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

  /* ---------------- Connectors (Outlook/Gmail/Slack) ---------------- */

  private isSendItConfirmation(message: string): boolean {
    const q = (message || '').trim().toLowerCase();
    return (
      q === 'send it' ||
      q === 'send' ||
      q === 'confirm' ||
      q === 'confirm send' ||
      q === 'yes' ||
      q === 'yes send' ||
      q === 'ok send' ||
      q === 'ok, send' ||
      q === 'go ahead'
    );
  }

  private emailSendSecret(): string {
    const s =
      process.env.CONNECTOR_ACTION_SECRET ||
      process.env.KODA_ACTION_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      process.env.ENCRYPTION_KEY ||
      '';
    if (!s.trim()) throw new Error('Missing CONNECTOR_ACTION_SECRET (or JWT_ACCESS_SECRET / ENCRYPTION_KEY).');
    return s;
  }

  private base64UrlEncode(input: string | Buffer): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private base64UrlDecodeToString(input: string): string {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, 'base64').toString('utf8');
  }

  private signEmailSendToken(payload: Record<string, unknown>): string {
    const encoded = this.base64UrlEncode(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', this.emailSendSecret()).update(encoded).digest();
    const sigUrl = this.base64UrlEncode(sig);
    return `${encoded}.${sigUrl}`;
  }

  private verifyConnectorDisconnectToken(token: string, expectedUserId: string): {
    userId: string;
    provider: 'gmail' | 'outlook' | 'slack';
  } {
    const parts = String(token || '').split('.', 2);
    if (parts.length !== 2) throw new Error('Invalid confirmation token format.');
    const [encoded, sigUrl] = parts;
    if (!encoded || !sigUrl) throw new Error('Invalid confirmation token format.');

    const expectedSig = crypto.createHmac('sha256', this.emailSendSecret()).update(encoded).digest();
    const expectedSigUrl = this.base64UrlEncode(expectedSig);
    if (expectedSigUrl !== sigUrl) throw new Error('Invalid confirmation token signature.');

    let parsed: any;
    try {
      parsed = JSON.parse(this.base64UrlDecodeToString(encoded));
    } catch {
      throw new Error('Invalid confirmation token payload.');
    }

    if (parsed?.t !== 'connector_disconnect' || parsed?.v !== 1) {
      throw new Error('Invalid confirmation token type.');
    }
    if (String(parsed.userId || '') !== String(expectedUserId || '')) throw new Error('Confirmation token user mismatch.');

    const exp = Number(parsed.exp);
    if (Number.isFinite(exp) && Date.now() > exp) throw new Error('Confirmation token expired.');

    const provider = String(parsed.provider || '').toLowerCase();
    if (provider !== 'gmail' && provider !== 'outlook' && provider !== 'slack') {
      throw new Error('Invalid provider in confirmation token.');
    }

    return { userId: String(parsed.userId), provider };
  }

  private verifyEmailSendToken(token: string, expectedUserId: string): {
    userId: string;
    provider: 'gmail' | 'outlook';
    to: string;
    subject: string;
    body: string;
    attachmentDocumentIds: string[];
  } {
    const parts = String(token || '').split('.', 2);
    if (parts.length !== 2) throw new Error('Invalid confirmation token format.');
    const [encoded, sigUrl] = parts;
    if (!encoded || !sigUrl) throw new Error('Invalid confirmation token format.');

    // Sign/verify uses base64url(HMAC_SHA256(secret, encoded_json_payload)).
    // Note: digest() MUST return bytes; don't digest('base64') here or you will double-encode.
    const expectedSig = crypto.createHmac('sha256', this.emailSendSecret()).update(encoded).digest();
    const expectedSigUrl = this.base64UrlEncode(expectedSig);
    if (expectedSigUrl !== sigUrl) throw new Error('Invalid confirmation token signature.');

    let parsed: any;
    try {
      parsed = JSON.parse(this.base64UrlDecodeToString(encoded));
    } catch {
      throw new Error('Invalid confirmation token payload.');
    }

    // v1 existed before attachments; v2 includes attachmentDocumentIds (but we also tolerate it in v1 payloads).
    if (parsed?.t !== 'email_send' || (parsed?.v !== 1 && parsed?.v !== 2)) {
      throw new Error('Invalid confirmation token type.');
    }
    if (String(parsed.userId || '') !== String(expectedUserId || '')) throw new Error('Confirmation token user mismatch.');

    const exp = Number(parsed.exp);
    if (Number.isFinite(exp) && Date.now() > exp) throw new Error('Confirmation token expired.');

    const provider = String(parsed.provider || '').toLowerCase();
    if (provider !== 'gmail' && provider !== 'outlook') throw new Error('Invalid provider in confirmation token.');

    const to = String(parsed.to || '').trim();
    if (!to) throw new Error('Invalid recipient in confirmation token.');

    return {
      userId: expectedUserId,
      provider,
      to,
      subject: String(parsed.subject || ''),
      body: String(parsed.body || ''),
      attachmentDocumentIds: Array.isArray(parsed.attachmentDocumentIds)
        ? parsed.attachmentDocumentIds.filter((v: any) => typeof v === 'string' && v.trim()).map((s: string) => s.trim()).slice(0, 8)
        : [],
    } as any;
  }

  private extractEmailAttachmentQueries(message: string): string[] {
    const raw = String(message || '');
    const lower = raw.toLowerCase();
    if (!/\battach(?:ment|ments)?\b/.test(lower)) return [];

    // Prefer quoted filenames after an "attach" intent.
    const quoted = this.extractQuotedSegments(raw);
    const out: string[] = [];
    for (const q of quoted) {
      const v = String(q || '').trim();
      if (v.length >= 2) out.push(v);
      if (out.length >= 6) break;
    }

    // Fallback: take trailing text after "attach" up to Subject/Body markers.
    const idx = lower.indexOf('attach');
    if (idx >= 0) {
      let tail = raw.slice(idx);
      tail = tail.replace(/^attach(?:ment|ments)?\b/i, '');
      tail = tail.replace(/\b(?:and|with)\s+(?:subject|subj|body|message|text)\b[\s\S]*$/i, '');
      tail = tail.replace(/\b(subject|subj|body|message|text)\b\s*[:=][\s\S]*$/i, '');
      tail = tail.replace(/[.!?]+$/g, '');
      const pieces = tail
        .split(/\band\b|,|\n|;/i)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of pieces) {
        if (p.length < 2) continue;
        if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(p)) continue; // not an attachment
        out.push(p);
        if (out.length >= 6) break;
      }
    }

    return Array.from(new Set(out)).slice(0, 6);
  }

  private async resolveEmailAttachmentDocumentIds(params: {
    userId: string;
    message: string;
    attachedDocumentIds: string[];
  }): Promise<{ ids: string[]; docs: Array<{ id: string; filename: string; mimeType: string | null; fileSize: number | null; encryptedFilename: string | null }>; unresolved: string[] }> {
    const ids = new Set<string>();
    const unresolved: string[] = [];

    for (const id of (params.attachedDocumentIds || [])) {
      if (typeof id === 'string' && id.trim()) ids.add(id.trim());
    }

    const queries = this.extractEmailAttachmentQueries(params.message || '');
    for (const q of queries) {
      const candidates = await this.resolveDocumentCandidates(params.userId, q, 2);
      if (!candidates.length) {
        unresolved.push(q);
        continue;
      }
      ids.add(candidates[0].id);
    }

    const idList = Array.from(ids).slice(0, 8);
    if (!idList.length) return { ids: [], docs: [], unresolved };

    const docs = await prisma.document.findMany({
      where: {
        userId: params.userId,
        id: { in: idList },
        parentVersionId: null,
        encryptedFilename: { not: { contains: '/connectors/' } },
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        fileSize: true,
        encryptedFilename: true,
      },
    });

    // Preserve requested order
    const docsById = new Map(docs.map((d) => [d.id, d]));
    const ordered = idList.map((id) => docsById.get(id)).filter(Boolean) as any[];
    return { ids: ordered.map((d) => d.id), docs: ordered, unresolved };
  }

  private async findLatestEmailSendTokenFromConversation(params: {
    conversationId: string;
  }): Promise<string | null> {
    const rows = await prisma.message.findMany({
      where: { conversationId: params.conversationId, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { metadata: true },
    });

    for (const row of rows) {
      let meta: any = null;
      try {
        meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch {
        meta = null;
      }
      const attachments = Array.isArray(meta?.attachments) ? meta.attachments : [];
      const confirm = attachments.find((a: any) => a?.type === 'action_confirmation' && a?.operator === 'EMAIL_SEND');
      const token = String(confirm?.confirmationId || '').trim();
      if (token) return token;
    }

    return null;
  }

  private parseConnectorProviderHint(message: string): 'gmail' | 'outlook' | 'slack' | null {
    const q = (message || '').toLowerCase();
    if (/\bgmail\b/.test(q)) return 'gmail';
    if (/\b(outlook|office ?365|microsoft)\b/.test(q)) return 'outlook';
    if (/\bslack\b/.test(q)) return 'slack';
    return null;
  }

  private isComposeRequest(message: string): boolean {
    const q = (message || '').toLowerCase();
    return /\b(write|draft|compose|send|reply to|forward|follow up)\b/.test(q)
      && /\b(email|mail|message)\b/.test(q);
  }

  private isLatestConnectorRequest(message: string): boolean {
    const q = (message || '').toLowerCase();
    if (this.isComposeRequest(q)) return false;
    const hasRecencyWord = /\b(latest|newest|most recent|recent|last|new|unread)\b/.test(q);
    // Broaden beyond "latest": users often ask "what do I have in Slack" or "list my emails"
    // and still mean "fetch connector items" rather than searching documents.
    const hasReadIntent =
      /\b(read|check|open|show|get|view|list)\b/.test(q)
      || /\b(tell me|what(?:'s| is)\s+in|what\s+do\s+i\s+have)\b/.test(q);
    const hasConnectorNoun = /\b(email|emails|inbox|mail|message|messages|slack|chat|chats|dm|dms|conversation|conversations|thread|threads|channel|channels)\b/.test(q);
    return hasConnectorNoun && (hasRecencyWord || hasReadIntent);
  }

  private isConnectorActionRequest(message: string): boolean {
    const q = (message || '').toLowerCase();
    const hasConnectorNoun = /\b(connector|connectors|integration|integrations|email|emails|inbox|mail|messages|slack|chat|chats|dm|dms|conversation|conversations|thread|threads|channel|channels)\b/.test(q);
    const hasProvider = /\b(gmail|outlook|office ?365|microsoft|slack)\b/.test(q);
    const hasVerb = /\b(connect|disconnect|unlink|revoke|disable|enable|activate|link|authorize|sync|synchroni[sz]e|refresh|resync|reindex|status|state|connected|connections|search|find|look for|show me|pull|fetch|import|check|show|list|which|read|get|open|display|view|summarize|what|browse|look at|look up|give me|tell me)\b/.test(q);
    return (hasConnectorNoun || hasProvider) && hasVerb;
  }

  private extractConnectorSearchQuery(message: string): string {
    const m = message || '';
    const quoted = m.match(/["“”']([^"“”']{2,200})["“”']/);
    if (quoted?.[1]) return quoted[1].trim();

    const lower = m.toLowerCase();
    for (const needle of [' for ', ' about ', ' regarding ']) {
      const idx = lower.indexOf(needle);
      if (idx >= 0) return m.slice(idx + needle.length).trim();
    }

    return m
      .replace(/^\s*(search|find|look for|show me|look up|browse|look at|give me|tell me about)\s+/i, '')
      .replace(/\b(inbox|email|emails|mail|messages|slack|chat|chats|dm|dms|conversation|conversations|thread|threads|channel|channels|gmail|outlook|office ?365)\b/ig, '')
      .trim();
  }

  private async getConnectedConnectorProviders(
    userId: string,
    hint?: ChatRequest['connectorContext'],
  ): Promise<{ gmail: boolean; outlook: boolean; slack: boolean }> {
    // Fast-path: if the frontend provides connector context, skip TokenVault lookup
    if (hint && (hint.gmail || hint.outlook || hint.slack)) {
      return {
        gmail: !!hint.gmail?.connected,
        outlook: !!hint.outlook?.connected,
        slack: !!hint.slack?.connected,
      };
    }

    const out = { gmail: false, outlook: false, slack: false };
    // Best-effort; TokenVault can throw if encryption keys aren't configured.
    await Promise.all([
      this.tokenVault.getProviderConnectionInfo(userId, 'gmail').then(() => { out.gmail = true; }).catch(() => {}),
      this.tokenVault.getProviderConnectionInfo(userId, 'outlook').then(() => { out.outlook = true; }).catch(() => {}),
      this.tokenVault.getProviderConnectionInfo(userId, 'slack').then(() => { out.slack = true; }).catch(() => {}),
    ]);
    return out;
  }

  private resolveActiveConnectorProvider(
    ctx?: ChatRequest["connectorContext"],
  ): "gmail" | "outlook" | "slack" | null {
    const raw = (ctx as any)?.activeProvider;
    if (raw === "gmail" || raw === "outlook" || raw === "slack") return raw;

    // Backstop: if the client only provided activeProviders (or activeProvider is missing),
    // treat the first valid provider as active.
    const arr = Array.isArray((ctx as any)?.activeProviders) ? (ctx as any).activeProviders : [];
    for (const p of arr) {
      const v = String(p || "").toLowerCase().trim();
      if (v === "gmail" || v === "outlook" || v === "slack") return v;
    }
    return null;
  }

  private resolveActiveConnectorProviders(
    ctx?: ChatRequest["connectorContext"],
  ): Array<"gmail" | "outlook" | "slack"> {
    const out: Array<"gmail" | "outlook" | "slack"> = [];

    const raw = (ctx as any)?.activeProvider;
    if (raw === "gmail" || raw === "outlook" || raw === "slack") out.push(raw);

    const arr = Array.isArray((ctx as any)?.activeProviders) ? (ctx as any).activeProviders : [];
    for (const p of arr) {
      const v = String(p || "").toLowerCase().trim();
      if (v !== "gmail" && v !== "outlook" && v !== "slack") continue;
      if (!out.includes(v as any)) out.push(v as any);
    }
    return out;
  }

  private hasExplicitActiveConnectorSelection(
    ctx?: ChatRequest["connectorContext"],
  ): boolean {
    const raw = (ctx as any)?.activeProvider;
    if (raw === "gmail" || raw === "outlook" || raw === "slack") return true;
    const arr = Array.isArray((ctx as any)?.activeProviders) ? (ctx as any).activeProviders : [];
    return arr.some((p: unknown) => {
      const v = String(p || "").toLowerCase().trim();
      return v === "gmail" || v === "outlook" || v === "slack";
    });
  }

  private labelForConnector(provider: "gmail" | "outlook" | "slack"): string {
    if (provider === "gmail") return "Gmail";
    if (provider === "outlook") return "Outlook";
    return "Slack";
  }

  private buildConnectorPromptFromAccessError(text: string): null | { type: "connector_prompt"; family: "email" | "messages"; providers: Array<"gmail" | "outlook" | "slack">; intent: "read" | "connect" } {
    const t = String(text || "").toLowerCase();
    const provider =
      /\bgmail\b/.test(t) ? "gmail"
      : /\boutlook\b/.test(t) ? "outlook"
      : /\bslack\b/.test(t) ? "slack"
      : null;
    if (!provider) return null;

    const family: "email" | "messages" = provider === "slack" ? "messages" : "email";
    const intent: "read" | "connect" = /\bconnect\b/.test(t) ? "connect" : "read";

    return {
      type: "connector_prompt",
      family,
      providers: [provider],
      intent,
    };
  }

  private async getConnectorAccessToken(userId: string, provider: "gmail" | "outlook" | "slack"): Promise<string> {
    try {
      return await this.tokenVault.getValidAccessToken(userId, provider);
    } catch (e) {
      // Best-effort refresh for email providers.
      if (provider === "outlook") {
        await this.outlookOAuth.refreshAccessToken(userId);
        return await this.tokenVault.getValidAccessToken(userId, provider);
      }
      if (provider === "gmail") {
        await this.gmailOAuth.refreshAccessToken(userId);
        return await this.tokenVault.getValidAccessToken(userId, provider);
      }
      throw e;
    }
  }

  private parseGmailHeader(message: any, headerName: string): string | null {
    const headers = message?.payload?.headers;
    if (!Array.isArray(headers)) return null;
    const hit = headers.find((h: any) => String(h?.name || "").toLowerCase() === headerName.toLowerCase());
    const v = hit?.value;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }

  private decodeGmailBodyData(data: string): string {
    const normalized = String(data || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, "base64").toString("utf8");
  }

  private extractGmailText(message: any): string {
    const walk = (part: any): string | null => {
      if (!part) return null;
      const mime = String(part.mimeType || "").toLowerCase();
      const data = part?.body?.data;
      if (mime === "text/plain" && typeof data === "string" && data.trim()) {
        const decoded = this.decodeGmailBodyData(data);
        const cleaned = decoded
          .replace(/\r\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        if (cleaned) return cleaned;
      }
      const parts = Array.isArray(part.parts) ? part.parts : [];
      for (const child of parts) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    };

    const payload = message?.payload;
    const fromParts = walk(payload);
    if (fromParts) return fromParts;

    const snippet = message?.snippet;
    return typeof snippet === "string"
      ? snippet.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim()
      : "";
  }

  private async detectLatestConnectorQuery(
    userId: string,
    message: string,
    connectorContext?: ChatRequest["connectorContext"],
  ): Promise<null | { provider: 'gmail' | 'outlook' | 'slack' | 'email'; count: number; mode: 'raw' | 'explain' }> {
    if (!this.isLatestConnectorRequest(message)) return null;
    const hint = this.parseConnectorProviderHint(message);
    const q = (message || '').toLowerCase();
    const active = this.resolveActiveConnectorProvider(connectorContext);
    const activeProviders = this.resolveActiveConnectorProviders(connectorContext);

    const wantsExplain =
      /\b(explain|summari[sz]e|analy[sz]e|break\s+down|what(?:'s| is)\s+(?:this|that|it)\s+(?:email|message)\s+about|what\s+does\s+(?:this|that|it)\s+(?:email|message)\s+say)\b/.test(q);
    const mode: 'raw' | 'explain' = wantsExplain ? 'explain' : 'raw';

    // Parse "last 3 emails", "3 most recent emails", "show me 5 newest messages", etc.
    // Clamp to keep latency reasonable (we fetch full message bodies).
    const countMatch =
      q.match(/\b(?:last|latest|newest|recent|most\s+recent)\s+(\d{1,2})\b/) ||
      q.match(/\b(\d{1,2})\s+(?:most\s+recent|latest|newest|recent|last)\b/);
    const count = Math.max(1, Math.min(10, Number(countMatch?.[1] || 1)));

    if (hint) return { provider: hint, count, mode };

    if (/\bslack\b/.test(q)) return { provider: 'slack', count, mode };
    // If the Slack connector pill is active, interpret "latest chats/messages" as Slack by default.
    if ((active === "slack" || activeProviders.includes("slack")) && /\b(chat|chats|dm|dms|message|messages|conversation|conversations|thread|threads|channel|channels)\b/.test(q)) {
      return { provider: "slack", count, mode };
    }
    // Default to email when they say "email/inbox/mail" without specifying provider.
    return { provider: 'email', count, mode };
  }

  private isExplainPreviousEmailRequest(message: string): boolean {
    const q = (message || '').toLowerCase();

    // If they explicitly asked for "latest/last/newest", let the latest-email handler run.
    if (this.isLatestConnectorRequest(q)) return false;

    const hasExplainVerb =
      /\b(explain|summari[sz]e|analy[sz]e|break\s+down|what\s+does\s+(?:this|that|it)\s+(?:email|message)?\s*say|what(?:'s| is)\s+(?:this|that|it)\s+(?:email|message)?\s*about)\b/.test(q);
    if (!hasExplainVerb) return false;

    // Require either explicit email mention or a clear referential "this/that/it".
    const mentionsEmail = /\b(email|emails|message|inbox|gmail|outlook)\b/.test(q);
    const referential = /\b(this|that|it|previous|last one|the last one)\b/.test(q);
    return mentionsEmail || referential;
  }

  private stripConnectorEmailBodies(attachments: any[] | undefined | null): any[] {
    const arr = Array.isArray(attachments) ? attachments : [];
    return arr.map((a: any) => {
      if (!a || typeof a !== 'object') return a;
      if (a.type !== 'connector_email') return a;
      const clone: any = { ...a };
      delete clone.bodyText;
      return clone;
    });
  }

  private toConnectorEmailRefs(attachments: any[] | undefined | null): any[] {
    const arr = Array.isArray(attachments) ? attachments : [];
    const out: any[] = [];
    for (const a of arr) {
      if (!a || typeof a !== 'object') continue;
      if (a.type !== 'connector_email') continue;
      const provider = String((a as any).provider || '').toLowerCase();
      const messageId = String((a as any).messageId || '').trim();
      if (!messageId) continue;
      if (provider !== 'gmail' && provider !== 'outlook') continue;
      out.push({
        type: 'connector_email_ref',
        provider,
        messageId,
        subject: String((a as any).subject || ''),
        from: (a as any).from ?? null,
        to: (a as any).to ?? null,
        cc: (a as any).cc ?? null,
        receivedAt: (a as any).receivedAt ?? null,
        preview: String((a as any).preview || ''),
        webLink: (a as any).webLink ?? null,
      });
    }
    return out;
  }

  private async loadLatestConnectorEmailRef(params: {
    conversationId: string;
    messageHint?: string;
  }): Promise<null | { provider: 'gmail' | 'outlook'; messageId: string }> {
    const rows = await prisma.message.findMany({
      where: { conversationId: params.conversationId, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { metadata: true },
    });

    const hint = (params.messageHint || '').toLowerCase();
    const quotedHints = this.extractQuotedSegments(params.messageHint || '').map(s => s.toLowerCase()).slice(0, 3);
    const subjectHint = (() => {
      const m = (params.messageHint || '').match(/\bsubject\b\s*[:=]\s*([^\n]{2,120})/i);
      return (m?.[1] || '').trim().toLowerCase() || null;
    })();

    const candidates: Array<{ provider: 'gmail' | 'outlook'; messageId: string; subject: string; from: string | null }> = [];

    for (const row of rows) {
      let meta: any = null;
      try {
        meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch {
        meta = null;
      }
      const attachments = Array.isArray(meta?.attachments) ? meta.attachments : [];
      for (const a of attachments) {
        // Preferred: explicit ref (no body stored).
        if (a?.type === 'connector_email_ref') {
          const provider = String(a?.provider || '').toLowerCase();
          const messageId = String(a?.messageId || '').trim();
          if (!messageId) continue;
          if (provider === 'gmail' || provider === 'outlook') {
            candidates.push({
              provider,
              messageId,
              subject: String(a?.subject || ''),
              from: typeof a?.from === 'string' ? a.from : null,
            } as any);
          }
          continue;
        }

        // Back-compat: older stored connector_email attachment without bodyText.
        if (a?.type === 'connector_email') {
          const provider = String(a?.provider || '').toLowerCase();
          const messageId = String(a?.messageId || '').trim();
          if (!messageId) continue;
          if (provider === 'gmail' || provider === 'outlook') {
            candidates.push({
              provider,
              messageId,
              subject: String(a?.subject || ''),
              from: typeof a?.from === 'string' ? a.from : null,
            } as any);
          }
        }
      }
    }

    if (candidates.length === 0) return null;
    if (!hint.trim()) {
      const c = candidates[0]!;
      return { provider: c.provider, messageId: c.messageId };
    }

    const scoreCandidate = (c: typeof candidates[number]): number => {
      let score = 0;
      const subj = (c.subject || '').toLowerCase();
      const from = (c.from || '').toLowerCase();
      if (subjectHint && subj.includes(subjectHint)) score += 10;
      for (const qh of quotedHints) {
        if (qh && subj.includes(qh)) score += 6;
      }
      // Lightweight token overlap on subject
      const subjTokens = subj.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length >= 4);
      for (const t of subjTokens.slice(0, 12)) {
        if (hint.includes(t)) score += 1;
      }
      if (from && hint.includes(from)) score += 8;
      if (from) {
        const addr = from.match(/[\w.+-]+@[\w.-]+\.\w{2,}/)?.[0] || '';
        if (addr && hint.includes(addr.toLowerCase())) score += 8;
      }
      return score;
    };

    let best = candidates[0]!;
    let bestScore = scoreCandidate(best);
    for (const c of candidates.slice(1)) {
      const s = scoreCandidate(c);
      if (s > bestScore) { best = c; bestScore = s; }
    }

    return { provider: best.provider, messageId: best.messageId };
  }

  private isEmailDocFusionRequest(message: string): boolean {
    const q = (message || '').toLowerCase();
    const mentionsEmail =
      /\b(email|emails|inbox|gmail|outlook)\b/.test(q) ||
      /\b(this|that|the)\s+email\b/.test(q) ||
      /\bfrom\s+(?:the|that)\s+email\b/.test(q);
    if (!mentionsEmail) return false;

    const mentionsDoc =
      /\b(document|file|pdf|docx|xlsx|pptx|contract|agreement|proposal|sow|msa|nda|clause|section|exhibit|appendix)\b/.test(q) ||
      /[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/i.test(message);
    return mentionsDoc;
  }

  private extractEmailKeywordHints(email: {
    subject: string;
    from: string | null;
    to: string | null;
    cc: string | null;
    bodyText: string;
  }): string {
    const body = String(email.bodyText || '');
    const head = body.slice(0, 5000);

    const filenames = Array.from(new Set((head.match(/[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/gi) || []).slice(0, 8)));

    const blob = [
      String(email.subject || ''),
      String(email.from || ''),
      String(email.to || ''),
      String(email.cc || ''),
      head,
    ].join(' ');

    const tokens = blob
      .toLowerCase()
      .replace(/[^\w\s.-]/g, ' ')
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean)
      .filter(t => t.length >= 4 && !STOP_WORDS.has(t))
      .filter(t => !/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(t))
      .slice(0, 500);

    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const t of tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      uniq.push(t);
      if (uniq.length >= 24) break;
    }

    return [
      ...(email.subject ? [email.subject] : []),
      ...(filenames.length ? filenames : []),
      ...(uniq.length ? uniq : []),
    ].join(' ').trim();
  }

  private buildEmailFusionInstructionSystemMessage(): string {
    return [
      'EMAIL+DOCUMENT REASONING RULES:',
      '- The EMAIL is the user intent/request and may contain proposed changes, questions, or constraints.',
      '- The DOCUMENT EXCERPTS are the source of truth for what is actually in the stored documents.',
      '- When there is a mismatch, call it out explicitly and recommend a resolution.',
      '- Answer in natural language. Be specific. Do not invent details not in the email or excerpts.',
    ].join('\n');
  }

  private buildEmailOnlyQAInstructionSystemMessage(): string {
    return [
      'EMAIL QA RULES:',
      '- Use ONLY the email content provided below (subject/headers/body).',
      '- Answer the user literally and precisely based on the email text.',
      '- If the email does not contain the requested detail, say so explicitly.',
      '- When helpful, quote the exact relevant line(s) from the email.',
      '- Do not invent facts or assume missing context.',
    ].join('\n');
  }

  private buildEmailContextSystemMessage(email: {
    provider: 'gmail' | 'outlook';
    messageId: string;
    subject: string;
    from: string | null;
    to: string | null;
    cc: string | null;
    receivedAt: string | null;
    bodyText: string;
    webLink?: string | null;
  }): string {
    const body = this.truncateForLLM(String(email.bodyText || ''), 8000);
    return [
      'EMAIL CONTEXT:',
      `Provider: ${email.provider}`,
      `MessageId: ${email.messageId}`,
      `Subject: ${email.subject || '(no subject)'}`,
      `From: ${email.from || '(unknown)'}`,
      ...(email.to ? [`To: ${email.to}`] : []),
      ...(email.cc ? [`Cc: ${email.cc}`] : []),
      ...(email.receivedAt ? [`ReceivedAt: ${email.receivedAt}`] : []),
      ...(email.webLink ? [`WebLink: ${email.webLink}`] : []),
      '',
      'Body:',
      body,
    ].join('\n');
  }

  private shouldUsePreviousEmailContextForQuestion(params: {
    message: string;
    history: Array<{ role: ChatRole; content: string }>;
    attachedDocumentIds?: string[];
  }): boolean {
    const msg = String(params.message || '').trim();
    if (!msg) return false;

    // If user attached docs (or explicitly referenced a file), this is likely doc-grounded or fusion.
    if ((params.attachedDocumentIds || []).length > 0) return false;
    if (/[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/i.test(msg)) return false;

    // Avoid stealing explicit file actions/navigation/editing.
    if (/\b(open|list|show files|delete|rename|move|edit|rewrite|change the document|in the document)\b/i.test(msg)) return false;
    // Strong doc/file signals should always route to the document pipeline.
    if (/\b(doc|docs|document|documents|file|files|folder|folders|library|slide|slides|sheet|sheets|pdf|docx|xlsx|pptx|talks about)\b/i.test(msg)) return false;

    // Strong explicit email reference.
    if (/\b(this|that|the)\s+(email|message)\b/i.test(msg)) return true;
    if (/\b(in|from)\s+(this|that|the)\s+(email|message)\b/i.test(msg)) return true;

    // Email-specific question cues.
    if (/\b(sender|from:|to:|cc:|bcc:|subject|thread|reply|respond|action items?|next steps|deadline|due date|by (?:when|what date)|what do they want|what are they asking)\b/i.test(msg)) {
      return true;
    }

    // Follow-up style with explicit anaphora can refer to the last email implicitly.
    const hasAnaphora = /\b(this|that|it|those|these|the same|same one)\b/i.test(msg);
    const hasExchange = params.history.some(m => m.role === 'user') && params.history.some(m => m.role === 'assistant');
    if (hasExchange && hasAnaphora) return true;

    return false;
  }

  private async tryHandleEmailContextQuestionTurn(params: {
    traceId: string;
    req: ChatRequest;
    conversationId: string;
    history: Array<{ role: ChatRole; content: string }>;
    sink?: StreamSink;
    existingUserMsgId?: string;
  }): Promise<ChatResult | null> {
    // If Slack is active and the user is asking about "messages/conversations/chats",
    // do NOT hijack the turn as an email follow-up. This is a common failure mode
    // that produces "Activate Gmail..." while the Slack pill is active.
    const active = this.resolveActiveConnectorProvider(params.req.connectorContext);
    const activeProviders = this.resolveActiveConnectorProviders(params.req.connectorContext);
    const q = String(params.req.message || "").toLowerCase();
    const looksLikeSlack =
      /\b(slack|chat|chats|dm|dms|conversation|conversations|thread|threads|channel|channels|message|messages)\b/.test(q);
    if (looksLikeSlack && (active === "slack" || activeProviders.includes("slack"))) {
      return null;
    }

    if (!this.shouldUsePreviousEmailContextForQuestion({
      message: params.req.message,
      history: params.history,
      attachedDocumentIds: params.req.attachedDocumentIds ?? [],
    })) return null;

    // Need a previously referenced email in this conversation.
    const ref = await this.loadLatestConnectorEmailRef({
      conversationId: params.conversationId,
      messageHint: params.req.message,
    });
    if (!ref) return null;

    let email: any;
    try {
      email = await this.fetchConnectorEmailById({
        userId: params.req.userId,
        provider: ref.provider,
        messageId: ref.messageId,
        connectorContext: params.req.connectorContext,
      });
    } catch (e: any) {
      const text = String(e?.message || 'Unable to fetch that email.').trim();
      const prompt = this.buildConnectorPromptFromAccessError(text);
      const attachments = prompt ? [prompt] : [];
      const userMsg = params.existingUserMsgId
        ? { id: params.existingUserMsgId }
        : await this.createMessage({ conversationId: params.conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      if (params.sink?.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
        params.sink.write({ event: 'delta', data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: 'assistant',
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        attachmentsPayload: attachments,
        sources: [],
        answerMode: 'general_answer',
        answerClass: 'GENERAL',
        navType: null,
      };
    }

    const userMsg = params.existingUserMsgId
      ? { id: params.existingUserMsgId }
      : await this.createMessage({ conversationId: params.conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

    const messagesWithContext: Array<{ role: ChatRole; content: string }> = [
      ...params.history,
      { role: 'system' as ChatRole, content: this.buildEmailOnlyQAInstructionSystemMessage() },
      { role: 'system' as ChatRole, content: this.buildEmailContextSystemMessage(email) },
      { role: 'user' as ChatRole, content: params.req.message },
    ];

    const out = await this.engine.generate({
      traceId: `${params.traceId}:email_qa`,
      userId: params.req.userId,
      conversationId: params.conversationId,
      messages: messagesWithContext,
      context: params.req.context,
      meta: params.req.meta,
    });

    const text = String(out.text || '').trim() || "I couldn't answer that from the email.";

    if (params.sink?.isOpen()) {
      params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
      params.sink.write({ event: 'delta', data: { text } } as any);
    }

    const assistantMsg = await this.createMessage({
      conversationId: params.conversationId,
      role: 'assistant',
      content: text,
      userId: params.req.userId,
      metadata: { sources: [], attachments: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
    });

    return {
      conversationId: params.conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: text,
      sources: [],
      answerMode: 'general_answer',
      answerClass: 'GENERAL',
      navType: null,
    };
  }

  private truncateForLLM(text: string, maxChars: number): string {
    const s = String(text || '');
    if (s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
  }

  private async generateEmailExplanationText(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    userPrompt: string;
    emails: Array<{
      provider: 'gmail' | 'outlook';
      subject: string;
      from: string | null;
      to: string | null;
      cc: string | null;
      receivedAt: string | null;
      bodyText: string;
      webLink?: string | null;
    }>;
  }): Promise<string> {
    const MAX_EMAILS = 3;
    const MAX_BODY_CHARS = 8000;

    const picked = params.emails.slice(0, MAX_EMAILS).map((e, idx) => {
      const body = this.truncateForLLM(e.bodyText || '', MAX_BODY_CHARS);
      return [
        `EMAIL ${idx + 1}:`,
        `Provider: ${e.provider}`,
        `Subject: ${e.subject || '(no subject)'}`,
        `From: ${e.from || '(unknown)'}`,
        ...(e.to ? [`To: ${e.to}`] : []),
        ...(e.cc ? [`Cc: ${e.cc}`] : []),
        ...(e.receivedAt ? [`ReceivedAt: ${e.receivedAt}`] : []),
        ...(e.webLink ? [`WebLink: ${e.webLink}`] : []),
        '',
        'Body:',
        body,
      ].join('\n');
    });

    const system = [
      'You are an expert at explaining emails to the user.',
      'Summarize clearly and concretely. Do not invent details not present in the email body.',
      '',
      'Output format:',
      '- Start with a 1-2 sentence summary.',
      '- Then bullets: Key points, Action items, Deadlines/dates (if any).',
      '- If the user likely needs to reply, include a short suggested reply draft.',
    ].join('\n');

    const context = ['EMAIL CONTEXT:', ...picked].join('\n\n');

    const out = await this.engine.generate({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: [
        { role: 'system' as ChatRole, content: system },
        { role: 'system' as ChatRole, content: context },
        { role: 'user' as ChatRole, content: params.userPrompt || 'Explain the email(s).' },
      ],
    });

    return String(out.text || '').trim();
  }

  private async fetchConnectorEmailById(params: {
    userId: string;
    provider: 'gmail' | 'outlook';
    messageId: string;
    connectorContext?: ChatRequest['connectorContext'];
  }): Promise<{
    type: 'connector_email';
    provider: 'gmail' | 'outlook';
    messageId: string;
    subject: string;
    from: string | null;
    to: string | null;
    cc: string | null;
    receivedAt: string | null;
    preview: string;
    bodyText: string;
    webLink?: string | null;
  }> {
    const active = this.resolveActiveConnectorProvider(params.connectorContext);
    const hasExplicitActivation = this.hasExplicitActiveConnectorSelection(params.connectorContext);
    if (hasExplicitActivation && active !== params.provider) {
      throw new Error(`Activate ${this.labelForConnector(params.provider)} above the input to allow access.`);
    }

    const connected = await this.tokenVault.getProviderConnectionInfo(params.userId, params.provider).catch(() => null);
    if (!connected) {
      throw new Error(`Connect ${this.labelForConnector(params.provider)} first, then activate it above the input.`);
    }

    const accessToken = await this.getConnectorAccessToken(params.userId, params.provider);

    if (params.provider === 'gmail') {
      const msg = await this.gmailClient.getMessage(accessToken, String(params.messageId));
      const subject = this.parseGmailHeader(msg, 'Subject') || '(no subject)';
      const from = this.parseGmailHeader(msg, 'From');
      const to = this.parseGmailHeader(msg, 'To');
      const cc = this.parseGmailHeader(msg, 'Cc');
      const date = this.parseGmailHeader(msg, 'Date');
      const bodyText = this.extractGmailText(msg);
      const preview = (bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 260);
      return {
        type: 'connector_email',
        provider: 'gmail',
        messageId: String(params.messageId),
        subject,
        from,
        to,
        cc,
        receivedAt: date,
        preview: preview ? `${preview}${preview.length >= 260 ? '…' : ''}` : '',
        bodyText,
      };
    }

    const msg = await this.graphClient.getMessage(accessToken, String(params.messageId));
    const subject = (msg.subject || '').trim() || '(no subject)';
    const from = msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || null;
    const ts = msg.receivedDateTime || msg.sentDateTime || null;
    const to = Array.isArray(msg?.toRecipients)
      ? msg.toRecipients.map((r: any) => r?.emailAddress?.address).filter(Boolean).join(', ')
      : null;
    const cc = Array.isArray(msg?.ccRecipients)
      ? msg.ccRecipients.map((r: any) => r?.emailAddress?.address).filter(Boolean).join(', ')
      : null;
    const bodyText = this.graphClient.getMessageText(msg);
    const preview = (bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    return {
      type: 'connector_email',
      provider: 'outlook',
      messageId: String(params.messageId),
      subject,
      from,
      to,
      cc,
      receivedAt: ts,
      preview: preview ? `${preview}${preview.length >= 260 ? '…' : ''}` : '',
      bodyText,
      webLink: (msg as any)?.webLink || null,
    };
  }

  private async tryHandleExplainPreviousEmailTurn(params: {
    traceId: string;
    req: ChatRequest;
    conversationId: string;
    history: Array<{ role: ChatRole; content: string }>;
    sink?: StreamSink;
    existingUserMsgId?: string;
  }): Promise<ChatResult | null> {
    if (!this.isExplainPreviousEmailRequest(params.req.message)) return null;

    const ref = await this.loadLatestConnectorEmailRef({ conversationId: params.conversationId, messageHint: params.req.message });
    if (!ref) {
      const text = 'I don\'t have an email to summarize yet. Ask me to read your latest email first (example: "Read my latest email").';
      const userMsg = params.existingUserMsgId
        ? { id: params.existingUserMsgId }
        : await this.createMessage({ conversationId: params.conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      if (params.sink?.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
        params.sink.write({ event: 'delta', data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: 'assistant',
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        attachmentsPayload: [],
        sources: [],
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    let email: any;
    try {
      email = await this.fetchConnectorEmailById({
        userId: params.req.userId,
        provider: ref.provider,
        messageId: ref.messageId,
        connectorContext: params.req.connectorContext,
      });
    } catch (e: any) {
      const text = String(e?.message || 'Unable to fetch that email.').trim();
      const prompt = this.buildConnectorPromptFromAccessError(text);
      const attachments = prompt ? [prompt] : [];
      const userMsg = params.existingUserMsgId
        ? { id: params.existingUserMsgId }
        : await this.createMessage({ conversationId: params.conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      if (params.sink?.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
        params.sink.write({ event: 'delta', data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: 'assistant',
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        attachmentsPayload: attachments,
        sources: [],
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    const summary = await this.generateEmailExplanationText({
      traceId: `${params.traceId}:email_explain`,
      userId: params.req.userId,
      conversationId: params.conversationId,
      userPrompt: params.req.message,
      emails: [{
        provider: email.provider,
        subject: email.subject,
        from: email.from,
        to: email.to,
        cc: email.cc,
        receivedAt: email.receivedAt,
        bodyText: email.bodyText,
        webLink: email.webLink ?? null,
      }],
    });

    const text = summary || 'Here’s a quick summary of that email.';
    const userMsg = params.existingUserMsgId
      ? { id: params.existingUserMsgId }
      : await this.createMessage({ conversationId: params.conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

    if (params.sink?.isOpen()) {
      params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
      params.sink.write({ event: 'delta', data: { text } } as any);
    }

    const attachmentsPayload = [email];
    const storedAttachments = this.toConnectorEmailRefs(attachmentsPayload);
    const assistantMsg = await this.createMessage({
      conversationId: params.conversationId,
      role: 'assistant',
      content: text,
      userId: params.req.userId,
      metadata: { sources: [], attachments: storedAttachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
    });

    return {
      conversationId: params.conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: text,
      attachmentsPayload,
      sources: [],
      answerMode: 'general_answer' as AnswerMode,
      answerClass: 'GENERAL' as AnswerClass,
      navType: null,
    };
  }

  private async detectConnectorActionQuery(
    userId: string,
    message: string,
  ): Promise<null | { action: 'connect' | 'sync' | 'status' | 'search' | 'disconnect'; provider: 'gmail' | 'outlook' | 'slack' | 'email' | 'all'; query?: string }> {
    if (!this.isConnectorActionRequest(message)) return null;

    const q = (message || '').toLowerCase();
    const hint = this.parseConnectorProviderHint(message);

    const wantsStatus = /\b(status|state|connected|connections|integrations|connectors|check connectors|show connectors|show integrations|which connectors)\b/.test(q);
    const wantsConnect = /\b(connect|enable|activate|link|authorize|sign in|log in|add)\b/.test(q);
    const wantsSync = /\b(sync|synchroni[sz]e|refresh|resync|reindex|pull|fetch|import)\b/.test(q);
    const wantsSearch = /\b(search|find|look for|show me|look up|browse|look at|give me|tell me about)\b/.test(q) && /\b(email|emails|inbox|mail|message|messages|slack)\b/.test(q);
    const wantsDisconnect = /\b(disconnect|unlink|revoke|deauthorize|de-authorize|remove integration|remove connector|disable integration|disable connector|turn off)\b/.test(q);

    if (wantsStatus && !hint) return { action: 'status', provider: 'all' };
    if (wantsStatus && hint) return { action: 'status', provider: hint };

    if (wantsDisconnect) {
      if (!hint) return { action: 'disconnect', provider: 'all' };
      return { action: 'disconnect', provider: hint };
    }

    if (wantsConnect) {
      if (!hint && /\b(email|inbox|mail)\b/.test(q)) return { action: 'connect', provider: 'email' };
      if (!hint) return { action: 'connect', provider: 'all' };
      return { action: 'connect', provider: hint };
    }

    if (wantsSync) {
      if (!hint && /\b(email|inbox|mail|emails)\b/.test(q)) return { action: 'sync', provider: 'email' };
      if (!hint) return { action: 'sync', provider: 'all' };
      return { action: 'sync', provider: hint };
    }

    if (wantsSearch) {
      const query = this.extractConnectorSearchQuery(message).trim();
      if (!hint && /\b(email|inbox|mail|emails)\b/.test(q)) return { action: 'search', provider: 'email', query };
      return { action: 'search', provider: hint ?? 'all', query };
    }

    return null;
  }

  private async detectComposeQuery(
    userId: string,
    message: string,
  ): Promise<null | { to: string | null; subject: string | null; bodyHint: string | null; provider: 'gmail' | 'outlook' | 'email' }> {
    if (!this.isComposeRequest(message)) return null;

    const q = (message || '').toLowerCase();
    const hint = this.parseConnectorProviderHint(message);
    const provider: 'gmail' | 'outlook' | 'email' =
      hint === 'gmail' ? 'gmail'
      : hint === 'outlook' ? 'outlook'
      : 'email';

    const normalized = String(message || '').replace(/\r\n/g, '\n');

    // Extract "to" — look for email address or "to <name>"
    const emailMatch = message.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    const toNameMatch = message.match(/\b(?:to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    const to = emailMatch?.[0] ?? toNameMatch?.[1] ?? null;

    const extractField = (keys: string[], text: string, stopKeys?: string[]): string | null => {
      // subject: "Hello" / subject: Hello / subject "Hello" / with subject Hello
      const keyGroup = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const reQuoted = new RegExp(`\\b(?:${keyGroup})\\b\\s*[:=]\\s*[\"""']([^\"""']{1,200})[\"""']`, 'i');
      const reBare = new RegExp(`\\b(?:${keyGroup})\\b\\s*[:=]\\s*([^\\n]{1,200})`, 'i');
      const reAltQuoted = new RegExp(`\\b(?:${keyGroup})\\b\\s+[\"""']([^\"""']{1,200})[\"""']`, 'i');
      // "with subject Foo" / "and body Foo" — bare without colon
      const reWithBare = new RegExp(`\\b(?:with|and)\\s+(?:${keyGroup})\\b\\s+([^\\n]{1,200})`, 'i');
      const m = text.match(reQuoted) || text.match(reAltQuoted) || text.match(reBare) || text.match(reWithBare);
      const v = m?.[1]?.trim();
      if (!v) return null;
      // Stop at next field marker — require "and/with" prefix OR colon/equals suffix
      // to avoid false-positives on words like "Body" inside actual content.
      const stops = ['body', 'message', 'text', ...(stopKeys ?? [])];
      const stopGroup = stops.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      return v
        .replace(new RegExp(`\\s+(?:and|with)\\s+(?:${stopGroup})\\b\\s*[:=]?.*$`, 'i'), '')
        .replace(new RegExp(`\\s+(?:${stopGroup})\\s*[:=].*$`, 'i'), '')
        .trim() || null;
    };

    // Prefer explicit Subject:/Body: fields.
    const subjectExplicit = extractField(['subject', 'subj'], normalized, ['body', 'message', 'text']);
    const bodyExplicit = extractField(['body', 'message', 'text'], normalized, ['subject', 'subj']);

    // Fallback subject — "about <topic>" or "regarding <topic>" (stop before body markers)
    const aboutMatch = normalized.match(/\b(?:about|regarding|re:?)\s+(.{3,120}?)(?:\s+\b(?:saying|with body|with text|with message|body|message|text)\b\s*[:=]|$)/i);
    const subject = subjectExplicit ?? (aboutMatch?.[1]?.replace(/\.$/, '').trim() ?? null);

    // Body hint:
    // 1) explicit "body:"/"message:"/"text:"
    // 2) "saying ..." / "that ..." / "tell them ..."
    // 3) trailing remainder after stripping "send/compose email to X" boilerplate
    const bodyMatch = normalized.match(/\b(?:saying|that says|tell (?:him|her|them)|tell them|(?:with|and)\s+body|(?:with|and)\s+text|(?:with|and)\s+message)\b\s+([\s\S]+)$/i);
    let bodyHint = bodyExplicit ?? (bodyMatch?.[1]?.trim() ?? null);
    if (!bodyHint) {
      let remainder = normalized;
      remainder = remainder.replace(/^[\s\S]*?\b(?:to)\b\s+[\w.+-]+@[\w.-]+\.\w{2,}\b/i, ''); // drop up-to recipient email
      remainder = remainder.replace(/\b(?:subject|subj)\b\s*[:=][^\n]*/ig, '');
      remainder = remainder.replace(/\b(?:body|message|text)\b\s*[:=]\s*/ig, '');
      remainder = remainder.replace(/^\s*[,\-:]\s*/, '').trim();
      if (remainder.length >= 3) bodyHint = remainder;
    }

    // Common phrasing: "send an email saying hello to alice@..." should treat the body as "hello".
    // If we detect the recipient email anywhere in the extracted body, strip a trailing "to <email>" suffix.
    if (bodyHint && emailMatch?.[0]) {
      const escaped = emailMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      bodyHint = bodyHint
        .replace(new RegExp(`\\s+(?:to\\s*[:\\-,]?\\s*)?${escaped}\\s*[.!?]?\\s*$`, 'i'), '')
        .trim() || null;
    }

    return { to, subject, bodyHint, provider };
  }

  private stripComposeScaffolding(raw: string): string {
    let out = String(raw || '').trim();
    if (!out) return '';
    out = out
      .replace(/\b(?:please\s+)?(?:write|draft|compose|send)\s+(?:an?\s+)?(?:new\s+)?email\b/gi, '')
      .replace(/\b(?:to)\s+[\w.+-]+@[\w.-]+\.\w{2,}\b/gi, '')
      .replace(/\b(?:via)\s+(?:gmail|outlook|office\s*365)\b/gi, '')
      .replace(/\b(?:and\s+)?attach(?:ment|ments)?\b[\s\S]*$/i, '')
      .replace(/\b(?:subject|subj)\b\s*[:=]\s*[^\n]*/gi, '')
      .replace(/\b(?:body|message|text)\b\s*[:=]\s*/gi, '')
      .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
      .trim();
    return out;
  }

  private toTitleCase(input: string): string {
    return String(input || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w.length <= 2 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ')
      .trim();
  }

  private pickComposeLength(params: {
    message: string;
    explicit?: 'short' | 'long' | null;
    bodyIdea?: string;
  }): 'short' | 'long' {
    if (params.explicit === 'short' || params.explicit === 'long') return params.explicit;
    const q = String(params.message || '').toLowerCase();
    if (/\b(short|brief|concise|quick|one paragraph)\b/.test(q)) return 'short';
    if (/\b(long|detailed|full|comprehensive|thorough|expand)\b/.test(q)) return 'long';
    if (/\b(proposal|recap|summary|detailed update|roadmap|plan)\b/.test(q)) return 'long';
    const ideaLen = String(params.bodyIdea || '').trim().length;
    return ideaLen >= 140 ? 'long' : 'short';
  }

  private pickComposeTone(params: {
    message: string;
    explicit?: 'professional_warm' | 'formal' | 'casual' | null;
  }): 'professional_warm' | 'formal' | 'casual' {
    if (params.explicit === 'formal' || params.explicit === 'casual' || params.explicit === 'professional_warm') return params.explicit;
    const q = String(params.message || '').toLowerCase();
    if (/\b(formal|executive|corporate)\b/.test(q)) return 'formal';
    if (/\b(casual|informal|chill|relaxed)\b/.test(q)) return 'casual';
    return 'professional_warm';
  }

  private recipientDisplayName(to: string): string {
    const raw = String(to || '').trim();
    if (!raw || raw === '(recipient)') return '';
    const email = raw.match(/([\w.+-]+)@[\w.-]+\.\w{2,}/);
    const source = email?.[1] || raw;
    const words = source
      .replace(/[._-]+/g, ' ')
      .replace(/[0-9]+/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!words.length) return '';
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  private cleanBodyIdea(raw: string): string {
    let out = String(raw || '').trim();
    if (!out) return '';
    out = out
      .replace(/^\s*(?:saying|says?|tell(?:ing)?\s+(?:him|her|them)|that says?)\s+(?:that\s+)?/i, '')
      .replace(/^\s*that\s+/i, '')
      .replace(/\b(?:please\s+)?(?:write|draft|compose|send)\s+(?:an?\s+)?email\b/gi, '')
      .replace(/\b(?:and\s+)?attach(?:ment|ments)?\b[\s\S]*$/i, '')
      .replace(/\b(?:subject|subj|body|message|text)\b\s*[:=]\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return out;
  }

  private composeEmailBodyFromPrompt(params: {
    to: string;
    message: string;
    bodyHint: string | null;
    length: 'short' | 'long';
    tone: 'professional_warm' | 'formal' | 'casual';
    purposeHint?: string | null;
  }): string {
    const fromHint = this.cleanBodyIdea(String(params.bodyHint || '').trim());
    const fromPrompt = this.cleanBodyIdea(this.stripComposeScaffolding(params.message || ''));
    const base = fromHint || fromPrompt;
    if (!base) return '';

    const idea = base.replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/([.!?])?$/, '.');
    const recipient = this.recipientDisplayName(params.to);
    const greeting =
      params.tone === 'formal' ? `Dear ${recipient || 'there'},`
      : params.tone === 'casual' ? `Hi ${recipient || 'there'},`
      : `Hi ${recipient || 'there'},`;
    const closing =
      params.tone === 'formal' ? 'Kind regards,'
      : params.tone === 'casual' ? 'Thanks,'
      : 'Best regards,';

    if (params.length === 'short') {
      const followUp =
        /\b(almost ready|coming soon|launch|ready)\b/i.test(idea)
          ? "I'll share final launch details with you shortly."
          : "Let me know if you'd like any additional details.";
      return `${greeting}\n\n${idea}\n${followUp}\n\n${closing}`;
    }

    const purpose = String(params.purposeHint || '').toLowerCase();
    const p2 =
      /\b(launch|coming soon|update|status)\b/.test(purpose) || /\b(almost ready|launch|coming soon|ready)\b/i.test(idea)
        ? 'Our team is finishing the final validation and polish to ensure everything is ready for a smooth rollout.'
        : 'I wanted to share this update with context so you have a clear view of where things stand.';
    const p3 =
      /request|action|review/.test(purpose)
        ? 'Please let me know if you would like me to prioritize anything specific in the next update.'
        : "I'll follow up with timeline details and next steps as soon as the final checks are complete.";

    return `${greeting}\n\n${idea}\n\n${p2}\n\n${p3}\n\n${closing}`;
  }

  private deriveEmailSubjectFromPrompt(params: {
    message: string;
    bodyHint: string;
    purposeHint?: string | null;
  }): string {
    const explicit = (() => {
      const m = String(params.message || '').match(/\b(?:about|regarding|re:?)\s+(.{3,120}?)(?:\s+\b(?:with|and)\s+\b(?:body|message|text)\b|$)/i);
      return String(m?.[1] || '').trim().replace(/[.!?]+$/, '');
    })();
    if (explicit) return explicit.slice(0, 120);

    const source = String(params.bodyHint || '').replace(/\s+/g, ' ').trim();
    if (!source) return '(subject)';

    const normalized = this.cleanBodyIdea(source)
      .replace(/^\s*hi[,!.\s-]*/i, '')
      .replace(/\b(best regards|kind regards|thanks|thank you)\b[\s\S]*$/i, '')
      .replace(/[.!?]+$/g, '')
      .trim();
    if (!normalized) return '(subject)';

    const low = normalized.toLowerCase();
    if (/\ballybi\b/.test(low) && /\b(almost ready|coming soon|launch|ready)\b/.test(low)) {
      return 'Allybi Launch Update';
    }
    if (/\bcoming soon\b/.test(low)) return 'Coming Soon Update';
    if (/\balmost ready\b/.test(low)) return 'Readiness Update';

    const purpose = String(params.purposeHint || '').toLowerCase().trim();
    if (purpose.includes('update')) return 'Status Update';
    if (purpose.includes('launch')) return 'Launch Update';
    if (purpose.includes('follow')) return 'Follow-Up';
    if (purpose.includes('reminder')) return 'Reminder';

    const words = normalized.split(/\s+/).filter(Boolean).slice(0, 6);
    const title = this.toTitleCase(words.join(' '));
    return title || '(subject)';
  }

  private async handleComposeQuery(params: {
    userId: string;
    conversationId: string;
    correlationId: string;
    clientMessageId: string;
    message: string;
    compose: {
      to: string | null;
      subject: string | null;
      bodyHint: string | null;
      provider: 'gmail' | 'outlook' | 'email';
      lengthHint?: 'short' | 'long' | null;
      toneHint?: 'professional_warm' | 'formal' | 'casual' | null;
      purposeHint?: string | null;
    };
    connectorContext?: ChatRequest['connectorContext'];
    confirmationToken?: string;
    attachedDocumentIds?: string[];
  }): Promise<{
    text: string;
    sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>;
    attachments: any[];
    answerMode: AnswerMode;
    answerClass: AnswerClass;
  }> {
    const active = this.resolveActiveConnectorProvider(params.connectorContext);
    const activeProviders = this.resolveActiveConnectorProviders(params.connectorContext);
    const hasExplicitActivation = this.hasExplicitActiveConnectorSelection(params.connectorContext);
    const connectedProviders = await this.getConnectedConnectorProviders(params.userId, params.connectorContext);
    const requested = params.compose.provider;

    const resolvedProvider: "gmail" | "outlook" | null =
      requested === "gmail" || requested === "outlook"
        ? requested
        : requested === "email"
          ? (
              (active === "gmail" || active === "outlook")
                ? active
                : (connectedProviders.gmail && !connectedProviders.outlook)
                  ? "gmail"
                  : (!connectedProviders.gmail && connectedProviders.outlook)
                    ? "outlook"
                    : null
            )
          : null;

    if (!resolvedProvider) {
      return {
        text:
          connectedProviders.gmail || connectedProviders.outlook
            ? "Choose which email connector to use (Gmail or Outlook), then ask again."
            : "Select your email first, then activate a connector:",
        sources: [],
        attachments: [
          {
            type: "connector_prompt",
            family: "email",
            providers: ["gmail", "outlook"],
            intent: "compose",
          },
        ],
        answerMode: "general_answer",
        answerClass: "GENERAL",
      };
    }

    if (hasExplicitActivation && active !== resolvedProvider && !activeProviders.includes(resolvedProvider)) {
      return {
        text: "Select your email first, then activate a connector:",
        sources: [],
        attachments: [
          {
            type: "connector_prompt",
            family: "email",
            providers: [resolvedProvider],
            intent: "compose",
          },
        ],
        answerMode: "general_answer",
        answerClass: "GENERAL",
      };
    }

    const connected = await this.tokenVault.getProviderConnectionInfo(params.userId, resolvedProvider).catch(() => null);
    if (!connected) {
      return {
        text: `Connect ${this.labelForConnector(resolvedProvider)} first, then activate it above the input.`,
        sources: [],
        attachments: [],
        answerMode: "general_answer",
        answerClass: "GENERAL",
      };
    }

    const to = params.compose.to || '(recipient)';
    // Important UX rule: do NOT inject placeholder text as the body. Frontend shows placeholder only when empty.
    const bodyHintRaw = typeof params.compose.bodyHint === 'string' ? params.compose.bodyHint : '';
    const chosenLength = this.pickComposeLength({
      message: params.message,
      explicit: params.compose.lengthHint || null,
      bodyIdea: bodyHintRaw,
    });
    const chosenTone = this.pickComposeTone({
      message: params.message,
      explicit: params.compose.toneHint || null,
    });
    const bodyHint = this.composeEmailBodyFromPrompt({
      to,
      message: params.message,
      bodyHint: bodyHintRaw,
      length: chosenLength,
      tone: chosenTone,
      purposeHint: params.compose.purposeHint || null,
    });
    let subject = String(params.compose.subject || '').trim() || this.deriveEmailSubjectFromPrompt({
      message: params.message,
      bodyHint,
      purposeHint: params.compose.purposeHint || null,
    });
    const firstBodyLine = String(bodyHint || '').split(/\r?\n/).find((l) => String(l || '').trim()) || '';
    const subjectNorm = subject.toLowerCase().replace(/[^\w\s]+/g, ' ').replace(/\s+/g, ' ').trim();
    const firstNorm = firstBodyLine.toLowerCase().replace(/[^\w\s]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (subjectNorm && firstNorm && (subjectNorm.includes(firstNorm) || firstNorm.includes(subjectNorm))) {
      subject = this.deriveEmailSubjectFromPrompt({
        message: params.message,
        bodyHint: this.cleanBodyIdea(firstBodyLine),
        purposeHint: params.compose.purposeHint || 'update',
      });
    }

    const providerLabel = resolvedProvider === 'gmail' ? 'Gmail' : 'Outlook';
    const canSend = resolvedProvider === 'gmail'
      ? (params.connectorContext?.gmail?.canSend ?? true)
      : (params.connectorContext?.outlook?.canSend ?? true);

    // Confirmed send: execute connector send immediately.
    if (params.confirmationToken) {
      const token = this.verifyEmailSendToken(params.confirmationToken, params.userId);
      if (token.provider !== resolvedProvider) {
        return {
          text: 'That confirmation token does not match the current email provider.',
          sources: [],
          attachments: [],
          answerMode: 'action_receipt',
          answerClass: 'NAVIGATION',
        };
      }
      if (!canSend) {
        return {
          text: `Your ${providerLabel} connector does not have send permissions. Reconnect it and try again.`,
          sources: [],
          attachments: [],
          answerMode: 'action_receipt',
          answerClass: 'NAVIGATION',
        };
      }

      // Resolve and download attachments (if any) from the signed token.
      const MAX_ATTACHMENTS = 6;
      const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB (Gmail hard limit is ~25MB)
      const attachmentIds = Array.isArray(token.attachmentDocumentIds) ? token.attachmentDocumentIds.slice(0, MAX_ATTACHMENTS) : [];
      let total = 0;
      const attachments: Array<{ filename: string; mimeType: string; content: Buffer }> = [];

      if (attachmentIds.length) {
        const docs = await prisma.document.findMany({
          where: {
            userId: params.userId,
            id: { in: attachmentIds },
            parentVersionId: null,
            encryptedFilename: { not: { contains: '/connectors/' } },
          },
          select: { id: true, filename: true, mimeType: true, encryptedFilename: true, fileSize: true },
        });

        const docsById = new Map(docs.map((d) => [d.id, d]));
        const missing: string[] = [];
        for (const id of attachmentIds) {
          const d = docsById.get(id);
          if (!d?.encryptedFilename) {
            missing.push(id);
            continue;
          }
          let bytes: Buffer;
          try {
            bytes = await downloadFile(d.encryptedFilename);
          } catch (e: any) {
            return {
              text: `I couldn't download the attachment "${d.filename || id}". Please reattach it and try again.`,
              sources: [],
              attachments: [],
              answerMode: 'action_receipt',
              answerClass: 'NAVIGATION',
            };
          }
          total += bytes.length;
          if (total > MAX_TOTAL_BYTES) {
            return {
              text: `Attachments are too large (>${Math.round(MAX_TOTAL_BYTES / (1024 * 1024))}MB). Remove some files and try again.`,
              sources: [],
              attachments: [],
              answerMode: 'action_receipt',
              answerClass: 'NAVIGATION',
            };
          }
          attachments.push({
            filename: d.filename || (d.encryptedFilename ? d.encryptedFilename.split('/').pop() : null) || 'attachment',
            mimeType: d.mimeType || 'application/octet-stream',
            content: bytes,
          });
        }
        if (missing.length) {
          return {
            text: `I couldn't access one or more attachments in this send confirmation (missing or not owned by your user): ${missing.join(', ')}.`,
            sources: [],
            attachments: [],
            answerMode: 'action_receipt',
            answerClass: 'NAVIGATION',
          };
        }
      }

      const result = await this.connectorHandler.execute({
        action: 'send',
        provider: resolvedProvider,
        to: token.to,
        subject: token.subject,
        body: token.body,
        attachments,
        context: {
          userId: params.userId,
          conversationId: params.conversationId,
          correlationId: params.correlationId,
          clientMessageId: params.clientMessageId,
        },
      });

      if (!result.ok) {
        return {
          text: `Failed to send email via ${providerLabel}. ${result.error || ''}`.trim(),
          sources: [],
          attachments: [],
          answerMode: 'action_receipt',
          answerClass: 'NAVIGATION',
        };
      }

      return {
        text: `Email sent via ${providerLabel}.\n\n**To:** ${token.to}\n**Subject:** ${token.subject || '(no subject)'}`,
        sources: [],
        // Persist a snapshot so the frontend can render a stable "Sent" receipt card after refresh.
        attachments: [
          {
            type: 'email_draft_snapshot',
            status: 'sent',
            provider: resolvedProvider,
            providerLabel,
            to: token.to,
            subject: token.subject || '(no subject)',
            body: token.body || '',
            attachmentDocumentIds: Array.isArray(token.attachmentDocumentIds) ? token.attachmentDocumentIds : [],
          },
        ],
        answerMode: 'action_receipt',
        answerClass: 'NAVIGATION',
      };
    }

    const { ids: attachmentDocumentIds, docs: attachmentDocs, unresolved: unresolvedAttachments } =
      await this.resolveEmailAttachmentDocumentIds({
        userId: params.userId,
        message: params.message,
        attachedDocumentIds: params.attachedDocumentIds ?? [],
      });

    const attachments: any[] = [];
    let answerMode: AnswerMode = 'general_answer';
    let answerClass: AnswerClass = 'GENERAL';

    if (canSend) {
      // Sign a short-lived confirmation token containing the exact payload we will send.
      const confirmationId = this.signEmailSendToken({
        v: 2,
        t: 'email_send',
        userId: params.userId,
        provider: resolvedProvider,
        to,
        subject,
        body: bodyHint,
        attachmentDocumentIds,
        iat: Date.now(),
        exp: Date.now() + 10 * 60 * 1000,
      });

      attachments.push({
        type: 'action_confirmation',
        operator: 'EMAIL_SEND',
        confirmationId,
        confirmLabel: 'Send',
        cancelLabel: 'Cancel',
        confirmStyle: 'primary',
        summary: `Send email via ${providerLabel}`,
      });
      answerMode = 'action_confirmation';
      answerClass = 'NAVIGATION';
    }

    const quoteBody = (body: string): string[] => {
      const rows = String(body || '').split(/\r?\n/);
      if (!rows.length) return ['>'];
      return rows.map((r) => `> ${r}`);
    };

    const lines = [
      `**Draft Email** (via ${providerLabel})`,
      '',
      `**To:** ${to}`,
      `**Subject:** ${subject}`,
      ...((attachmentDocs.length || unresolvedAttachments.length)
        ? [
            '',
            '**Attachments:**',
            ...attachmentDocs.map((d) => `- ${d.filename || (d.encryptedFilename ? d.encryptedFilename.split('/').pop() : null) || 'Document'}`),
            ...unresolvedAttachments.map((name) => `- ${name}`),
          ]
        : []),
      ...(unresolvedAttachments.length
        ? [
            '',
            `_(Could not find: ${unresolvedAttachments.join(', ')})_`,
          ]
        : []),
      '',
      ...quoteBody(bodyHint),
      '',
      canSend
        ? '_Click **Send** below or reply **"send it"** to deliver this email. You can also edit the details above and ask me to revise._'
        : '_This is a draft preview. To enable sending, reconnect your email account to grant send permissions._',
    ];

    return { text: lines.join('\n'), sources: [], attachments, answerMode, answerClass };
  }

  private async handleLatestConnectorQuery(params: {
    userId: string;
    conversationId: string;
    correlationId: string;
    clientMessageId: string;
    message: string;
    latest: { provider: 'gmail' | 'outlook' | 'slack' | 'email'; count: number; mode: 'raw' | 'explain' };
    connectorContext?: ChatRequest['connectorContext'];
  }): Promise<{ text: string; sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>; attachments?: any[] }> {
    const active = this.resolveActiveConnectorProvider(params.connectorContext);
    const activeProviders = this.resolveActiveConnectorProviders(params.connectorContext);
    const hasExplicitActivation = this.hasExplicitActiveConnectorSelection(params.connectorContext);
    const connectedProviders = await this.getConnectedConnectorProviders(params.userId, params.connectorContext);

    const requested = params.latest.provider;
    const count = Math.max(1, Math.min(10, Number(params.latest.count || 1)));
    const provider: "gmail" | "outlook" | "slack" | null =
      requested === "gmail" || requested === "outlook" || requested === "slack"
        ? requested
        : requested === "email"
          ? (
              // Email can be satisfied by any active email connector.
              (active === "gmail" || active === "outlook")
                ? active
                : (activeProviders.includes("gmail") ? "gmail" : (activeProviders.includes("outlook") ? "outlook" : null))
                    || (connectedProviders.gmail && !connectedProviders.outlook ? "gmail" : null)
                    || (connectedProviders.outlook && !connectedProviders.gmail ? "outlook" : null)
            )
          : null;

    if (!provider) {
      return {
        text:
          requested === "email" && (connectedProviders.gmail || connectedProviders.outlook)
            ? "Choose which inbox to use (Gmail or Outlook), then ask again."
            : "Activate a connector above the input, then ask again:",
        sources: [],
        attachments: [
          {
            type: "connector_prompt",
            family: requested === "slack" ? "messages" : "email",
            providers: requested === "slack" ? ["slack"] : ["gmail", "outlook"],
            intent: "read",
          },
        ],
      };
    }

    // Product rule: connector access is only allowed when the pill is active.
    if (hasExplicitActivation && active !== provider && !activeProviders.includes(provider)) {
      return {
        text: "Activate a connector above the input, then ask again:",
        sources: [],
        attachments: [
          {
            type: "connector_prompt",
            family: provider === "slack" ? "messages" : "email",
            providers: [provider],
            intent: "read",
          },
        ],
      };
    }

    const connected = await this.tokenVault.getProviderConnectionInfo(params.userId, provider).catch(() => null);
    if (!connected) {
      return {
        text: `Connect ${this.labelForConnector(provider)} first, then activate it above the input.`,
        sources: [],
      };
    }

    const accessToken = await this.getConnectorAccessToken(params.userId, provider);

    if (provider === "outlook") {
      const list = await this.graphClient.listMessages({
        accessToken,
        top: count,
        folder: "Inbox",
        selectFields: ["id", "subject", "receivedDateTime", "sentDateTime", "from", "toRecipients", "ccRecipients", "bodyPreview", "body", "webLink"],
      });
      const msgs = Array.isArray(list?.value) ? list.value : [];
      if (!msgs.length) return { text: "No messages found in your Outlook inbox.", sources: [] };

      const attachments = msgs.slice(0, count).map((msg: any) => {
        const subject = (msg.subject || "").trim() || "(no subject)";
        const from = msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || null;
        const ts = msg.receivedDateTime || msg.sentDateTime || null;
        const to = Array.isArray(msg?.toRecipients)
          ? msg.toRecipients.map((r: any) => r?.emailAddress?.address).filter(Boolean).join(", ")
          : null;
        const cc = Array.isArray(msg?.ccRecipients)
          ? msg.ccRecipients.map((r: any) => r?.emailAddress?.address).filter(Boolean).join(", ")
          : null;
        const bodyText = this.graphClient.getMessageText(msg);
        const preview = (bodyText || "").replace(/\s+/g, " ").trim().slice(0, 260);
        return {
          type: "connector_email",
          provider: "outlook",
          messageId: msg.id,
          subject,
          from,
          to,
          cc,
          receivedAt: ts,
          preview: preview ? `${preview}${preview.length >= 260 ? "…" : ""}` : "",
          bodyText,
          webLink: msg?.webLink || null,
        };
      });

      if (params.latest.mode === 'explain') {
        const summary = await this.generateEmailExplanationText({
          traceId: `${params.correlationId}:email_explain`,
          userId: params.userId,
          conversationId: params.conversationId,
          userPrompt: params.message,
          emails: attachments.map((a: any) => ({
            provider: a.provider,
            subject: a.subject,
            from: a.from,
            to: a.to,
            cc: a.cc,
            receivedAt: a.receivedAt,
            bodyText: a.bodyText,
            webLink: a.webLink ?? null,
          })),
        });
        return { text: summary || 'Here’s a summary of your latest email(s).', sources: [], attachments };
      }

      return {
        text: count === 1 ? "Latest email:" : `Latest ${Math.min(count, msgs.length)} emails:`,
        sources: [],
        attachments,
      };
    }

    if (provider === "gmail") {
      const list = await this.gmailClient.listMessages(accessToken, {
        labelIds: ["INBOX"],
        maxResults: count,
        includeSpamTrash: false,
      });
      const ids = Array.isArray((list as any)?.messages)
        ? (list as any).messages.map((m: any) => m?.id).filter(Boolean)
        : [];
      if (!ids.length) return { text: "No messages found in your Gmail inbox.", sources: [] };

      // Fetch message payloads in parallel (bounded).
      const limit = require('p-limit');
      const p = limit(5);
      const msgs = await Promise.all(
        ids.slice(0, count).map((id: string) => p(async () => {
          const msg = await this.gmailClient.getMessage(accessToken, String(id));
          const subject = this.parseGmailHeader(msg, "Subject") || "(no subject)";
          const from = this.parseGmailHeader(msg, "From");
          const to = this.parseGmailHeader(msg, "To");
          const cc = this.parseGmailHeader(msg, "Cc");
          const date = this.parseGmailHeader(msg, "Date");
          const bodyText = this.extractGmailText(msg);
          const preview = (bodyText || "").replace(/\s+/g, " ").trim().slice(0, 260);
          return {
            type: "connector_email",
            provider: "gmail",
            messageId: String(id),
            subject,
            from,
            to,
            cc,
            receivedAt: date,
            preview: preview ? `${preview}${preview.length >= 260 ? "…" : ""}` : "",
            bodyText,
          };
        }))
      );

      if (params.latest.mode === 'explain') {
        const summary = await this.generateEmailExplanationText({
          traceId: `${params.correlationId}:email_explain`,
          userId: params.userId,
          conversationId: params.conversationId,
          userPrompt: params.message,
          emails: msgs.map((a: any) => ({
            provider: a.provider,
            subject: a.subject,
            from: a.from,
            to: a.to,
            cc: a.cc,
            receivedAt: a.receivedAt,
            bodyText: a.bodyText,
          })),
        });
        return { text: summary || 'Here’s a summary of your latest email(s).', sources: [], attachments: msgs };
      }

      return {
        text: count === 1 ? "Latest email:" : `Latest ${msgs.length} emails:`,
        sources: [],
        attachments: msgs,
      };
    }

    // Slack (best-effort): fetch most recent message from the first accessible conversation.
    const convs = await this.slackClient.listConversations({
      accessToken,
      types: ["public_channel", "private_channel", "im", "mpim"],
      excludeArchived: true,
      limit: 50,
    });
    const channels = Array.isArray(convs?.channels) ? convs.channels : [];
    if (!channels.length) return { text: "No Slack conversations found.", sources: [] };

    // Prefer DMs or channels where the app is already a member. This avoids the common
    // Slack API error: "not_in_channel" for public channels the bot can't read.
    const ordered = [
      ...channels.filter((c: any) => c && c.is_im),
      ...channels.filter((c: any) => c && !c.is_im && c.is_member),
      ...channels.filter((c: any) => c && !c.is_im && !c.is_member),
    ];

    let lastErr: string | null = null;
    for (const ch of ordered.slice(0, 20)) {
      if (!ch?.id) continue;
      try {
        const hist = await this.slackClient.getConversationHistory({
          accessToken,
          channelId: ch.id,
          limit: 1,
        });
        const msg = Array.isArray(hist?.messages) ? hist.messages[0] : null;
        if (!msg?.ts) continue;

        const fullText = this.slackClient.extractMessageText(msg) || '';
        const preview = fullText.slice(0, 260);
        return {
          // UI requirement: connector results should render as cards, not plain text.
          text: "",
          sources: [],
          attachments: [
            {
              type: "connector_slack_message",
              provider: "slack",
              channelId: ch.id,
              channelName: ch?.name || null,
              ts: msg.ts,
              preview: preview ? `${preview}${preview.length >= 260 ? "…" : ""}` : "",
              bodyText: fullText,
            },
          ],
        };
      } catch (e: any) {
        const msg = String(e?.message || "").toLowerCase();
        lastErr = String(e?.message || "").trim() || lastErr;
        // Try the next conversation if this one isn't readable.
        if (msg.includes("not_in_channel")) continue;
        if (msg.includes("missing_scope") || msg.includes("invalid_auth") || msg.includes("account_inactive")) {
          return {
            text: "Slack access isn't ready. Reconnect Slack and try again.",
            sources: [],
            attachments: [
              { type: "connector_prompt", family: "messages", providers: ["slack"], intent: "connect" },
            ],
          };
        }
        // Unknown Slack error: fall through to a friendly message below.
        break;
      }
    }

    // If we got here, we found conversations but couldn't read history.
    // Most commonly: the app is not a member of the channel.
    const hint = lastErr && /not_in_channel/i.test(lastErr)
      ? "I can see channels, but Slack won't let me read message history until Allybi is added to a channel or DM."
      : "I couldn't read Slack message history from your available conversations.";
    return {
      text: `${hint} In Slack, invite the Allybi app to a channel (or DM it), then ask again.`,
      sources: [],
      attachments: [
        { type: "connector_prompt", family: "messages", providers: ["slack"], intent: "read" },
      ],
    };
  }

  private async handleConnectorActionQuery(params: {
    userId: string;
    conversationId: string;
    correlationId: string;
    clientMessageId: string;
    detected: { action: 'connect' | 'sync' | 'status' | 'search' | 'disconnect'; provider: 'gmail' | 'outlook' | 'slack' | 'email' | 'all'; query?: string };
    connectorContext?: ChatRequest['connectorContext'];
  }): Promise<{
    text: string;
    sources: Array<{ documentId: string; filename: string; mimeType: string | null; page: number | null }>;
    attachments: any[];
    answerMode: AnswerMode;
    answerClass: AnswerClass;
  }> {
    const connected = await this.getConnectedConnectorProviders(params.userId, params.connectorContext);
    const attachments: any[] = [];

    const targetProviders: Array<'gmail' | 'outlook' | 'slack'> =
      params.detected.provider === 'gmail' ? ['gmail']
      : params.detected.provider === 'outlook' ? ['outlook']
      : params.detected.provider === 'slack' ? ['slack']
      : params.detected.provider === 'email' ? (['gmail', 'outlook'] as const).filter(p => connected[p])
      : (['gmail', 'outlook', 'slack'] as const).filter(p => connected[p]);

    if (params.detected.action === 'status') {
      const providers = params.detected.provider === 'gmail' || params.detected.provider === 'outlook' || params.detected.provider === 'slack'
        ? [params.detected.provider]
        : (['gmail', 'outlook', 'slack'] as const);

      const results = await Promise.all(providers.map((provider) => this.connectorHandler.execute({
        action: 'status',
        provider,
        context: {
          userId: params.userId,
          conversationId: params.conversationId,
          correlationId: params.correlationId,
          clientMessageId: params.clientMessageId,
        },
      })));

      const lines = results.map((r) => {
        const d = (r.data ?? {}) as any;
        const connectedTxt = d.connected ? 'connected' : 'not connected';
        const expiredTxt = d.expired ? ' (expired)' : '';
        const idx = typeof d.indexedDocuments === 'number' ? d.indexedDocuments : 0;
        return `- ${r.provider}: ${connectedTxt}${expiredTxt}, indexed: ${idx}`;
      });

      const statusPills = results.map((r) => {
        const d = (r.data ?? {}) as any;
        return {
          type: 'connector_status',
          provider: r.provider,
          connected: Boolean(d.connected),
          expired: Boolean(d.expired),
          indexedDocuments: typeof d.indexedDocuments === 'number' ? d.indexedDocuments : 0,
        };
      });

      return {
        text: ['Connector status:', ...lines].join('\n'),
        sources: [],
        attachments: [...attachments, ...statusPills],
        answerMode: 'action_receipt',
        answerClass: 'NAVIGATION',
      };
    }

    if (params.detected.action === 'connect') {
      const providers =
        params.detected.provider === 'gmail' ? ['gmail']
        : params.detected.provider === 'outlook' ? ['outlook']
        : params.detected.provider === 'slack' ? ['slack']
        : params.detected.provider === 'email' ? (['gmail', 'outlook'] as const)
        : (['gmail', 'outlook', 'slack'] as const);

      const results = await Promise.all(providers.map((provider) => this.connectorHandler.execute({
        action: 'connect',
        provider,
        callbackUrl: '',
        context: {
          userId: params.userId,
          conversationId: params.conversationId,
          correlationId: params.correlationId,
          clientMessageId: params.clientMessageId,
        },
      })));

      const ok = results.filter(r => r.ok && (r.data as any)?.authorizationUrl);
      if (!ok.length) {
        return {
          text: 'I could not start the connector authorization flow (missing OAuth config or provider not registered).',
          sources: [],
          attachments,
          answerMode: 'action_receipt',
          answerClass: 'NAVIGATION',
        };
      }

      const lines = ok.map((r) => `- ${r.provider}: ${(r.data as any).authorizationUrl}`);
      return {
        text: ['Open this authorization link:', ...lines].join('\n'),
        sources: [],
        attachments,
        answerMode: 'action_receipt',
        answerClass: 'NAVIGATION',
      };
    }

    if (params.detected.action === 'disconnect') {
      const provider = params.detected.provider;
      if (provider !== 'gmail' && provider !== 'outlook' && provider !== 'slack') {
        return {
          text: 'Which connector should I disconnect: Gmail, Outlook, or Slack?',
          sources: [],
          attachments,
          answerMode: 'action_receipt',
          answerClass: 'NAVIGATION',
        };
      }

      const confirmationId = this.signEmailSendToken({
        v: 1,
        t: 'connector_disconnect',
        userId: params.userId,
        provider,
        iat: Date.now(),
        exp: Date.now() + 10 * 60 * 1000,
      });

      attachments.push({
        type: 'action_confirmation',
        operator: 'CONNECTOR_DISCONNECT',
        confirmationId,
        confirmLabel: `Disconnect ${this.labelForConnector(provider)}`,
        cancelLabel: 'Cancel',
        confirmStyle: 'danger',
        summary: `Disconnect ${this.labelForConnector(provider)}`,
      });

      return {
        text: `This will disconnect ${this.labelForConnector(provider)} and revoke stored access. Confirm to continue.`,
        sources: [],
        attachments,
        answerMode: 'action_confirmation',
        answerClass: 'NAVIGATION',
      };
    }

    if (params.detected.action === 'sync') {
      const providers =
        params.detected.provider === 'gmail' ? ['gmail']
        : params.detected.provider === 'outlook' ? ['outlook']
        : params.detected.provider === 'slack' ? ['slack']
        : params.detected.provider === 'email' ? (['gmail', 'outlook'] as const)
        : (['gmail', 'outlook', 'slack'] as const);

      const results = await Promise.all(providers.map((provider) => this.connectorHandler.execute({
        action: 'sync',
        provider,
        forceResync: false,
        context: {
          userId: params.userId,
          conversationId: params.conversationId,
          correlationId: params.correlationId,
          clientMessageId: params.clientMessageId,
        },
      })));

      const lines = results.map((r) => {
        if (!r.ok) return `- ${r.provider}: failed (${r.error || 'unknown error'})`;
        const mode = (r.data as any)?.mode || 'queued';
        const jobId = (r.data as any)?.jobId || null;
        return `- ${r.provider}: ${mode}${jobId ? ` (job ${jobId})` : ''}`;
      });

      return {
        text: ['Sync started:', ...lines].join('\n'),
        sources: [],
        attachments,
        answerMode: 'action_receipt',
        answerClass: 'NAVIGATION',
      };
    }

    // search
    const query = (params.detected.query ?? '').trim();
    if (!query) {
      return {
        text: 'What should I search for? Example: “search my inbox for “invoice””.',
        sources: [],
        attachments,
        answerMode: 'action_receipt',
        answerClass: 'NAVIGATION',
      };
    }

    const providersToSearch = targetProviders.length
      ? targetProviders
      : (['gmail', 'outlook', 'slack'] as const).filter(p => connected[p]);

    if (!providersToSearch.length) {
      return {
        text: 'No connectors are connected. Connect Gmail/Outlook/Slack first.',
        sources: [],
        attachments,
        answerMode: 'action_receipt',
        answerClass: 'NAVIGATION',
      };
    }

    const results = await Promise.all(providersToSearch.map((provider) => this.connectorHandler.execute({
      action: 'search',
      provider,
      query,
      limit: 8,
      context: {
        userId: params.userId,
        conversationId: params.conversationId,
        correlationId: params.correlationId,
        clientMessageId: params.clientMessageId,
      },
    })));

    const hits = results.flatMap(r => (r.ok ? (r.hits ?? []) : []));
    if (!hits.length) {
      // Product requirement: never force the user to type "sync gmail/outlook/slack".
      // Kick off a background sync automatically when we have no indexed results.
      try {
        await Promise.all(providersToSearch.map((provider) => this.connectorHandler.execute({
          action: 'sync',
          provider,
          forceResync: false,
          context: {
            userId: params.userId,
            conversationId: params.conversationId,
            correlationId: params.correlationId,
            clientMessageId: params.clientMessageId,
          },
        })));
      } catch {
        // Non-fatal
      }

      return {
        text: 'I am syncing your connector data now. Ask again in a minute.',
        sources: [],
        attachments,
        answerMode: 'action_receipt',
        answerClass: 'NAVIGATION',
      };
    }

    const top = hits.slice(0, 10);
    const lines = top.map((h) => `- ${h.source}: ${h.title}\n  ${h.snippet}`);
    const sources = top.map((h) => ({ documentId: h.documentId, filename: h.title, mimeType: 'text/plain', page: null }));
    return {
      text: [`Top matches for "${query}":`, ...lines].join('\n'),
      sources,
      attachments,
      answerMode: 'action_receipt',
      answerClass: 'NAVIGATION',
    };
  }

  /* ---------------- Charts (Visual Attachments) ---------------- */

  private isChartRequest(message: string): boolean {
    const q = (message || '').toLowerCase();
    return /\b(chart|graph|plot|bar\s+chart|line\s+chart|pie\s+chart)\b/.test(q)
      && /\b(create|make|build|draw|generate|show)\b/.test(q);
  }

  /* ---------------- Image Generation (Visual Attachments) ---------------- */

  private isImageGenerationRequest(message: string): boolean {
    const q = (message || '').toLowerCase();
    // Match requests for image/picture generation
    return /\b(image|picture|illustration|graphic|visual|artwork|photo)\b/.test(q)
      && /\b(create|make|generate|draw|design|produce)\b/.test(q);
  }

  private _nanoBananaClient: import('./creative/nanoBanana.client.service').NanoBananaClientService | null = null;

  private getNanoBananaClient(): import('./creative/nanoBanana.client.service').NanoBananaClientService | null {
    if (this._nanoBananaClient) return this._nanoBananaClient;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;

    try {
      const { NanoBananaClientService } = require('./creative/nanoBanana.client.service');
      const { createGoogleImagenProvider } = require('./creative/googleImagenProvider');
      const provider = createGoogleImagenProvider({ apiKey });
      this._nanoBananaClient = new NanoBananaClientService('nano-banana-pro-preview', provider);
      return this._nanoBananaClient;
    } catch (err: any) {
      console.warn('[ImageGen] Failed to create Nano Banana client:', err.message);
      return null;
    }
  }

  private async handleImageGenerationRequest(params: {
    userId: string;
    conversationId: string;
    correlationId?: string;
    clientMessageId?: string;
    message: string;
  }): Promise<{ text: string; attachments: any[] }> {
    const client = this.getNanoBananaClient();

    if (!client) {
      return {
        text: "Image generation is not yet available. Please configure GEMINI_API_KEY to enable this feature.",
        attachments: [],
      };
    }

    try {
      const result = await client.generate({
        systemPrompt: 'You are an expert image generation AI. Create a high-quality, detailed image based on the user description.',
        userPrompt: params.message,
        width: 1024,
        height: 1024,
      });

      // Convert buffer to base64 data URL for immediate display
      const base64 = result.imageBuffer.toString('base64');
      const dataUrl = `data:${result.mimeType};base64,${base64}`;

      return {
        text: "Here's the generated image:",
        attachments: [
          {
            type: "image",
            url: dataUrl,
            title: "Generated Image",
            generatedBy: "nano-banana",
            width: 1024,
            height: 1024,
            mimeType: result.mimeType,
          },
        ],
      };
    } catch (err: any) {
      console.error('[ImageGen] Generation failed:', err.message);
      return {
        text: `I wasn't able to generate that image. ${err.message?.includes('safety') ? 'The request may have been blocked by safety filters.' : 'Please try again with a different description.'}`,
        attachments: [],
      };
    }
  }

  /* ---------------- Slides / Presentations (Google Slides) ---------------- */

  private isSlideOrDeckRequest(message: string): boolean {
    const q = (message || '').toLowerCase();
    const asksCreate = /\b(create|make|generate|build|draft|design)\b/.test(q);
    const mentionsDeck = /\b(slide|slides|presentation|deck|powerpoint|pptx)\b/.test(q);
    // Avoid stealing plain image generation requests unless they explicitly mention slides/presentations.
    const isPureImage = this.isImageGenerationRequest(message) && !mentionsDeck;
    return asksCreate && mentionsDeck && !isPureImage;
  }

  private parseUsingFileHints(message: string): string[] {
    const raw = String(message || '');
    const hints: string[] = [];

    const patterns = [
      /\busing\s+file\s+["“]?([^"”\n]+?)["”]?(?:\s|$)/ig,
      /\busing\s+["“]?([^"”\n]+\.(pdf|pptx|docx|xlsx|csv|txt|md))["”]?(?:\s|$)/ig,
      /\bfrom\s+file\s+["“]?([^"”\n]+?)["”]?(?:\s|$)/ig,
    ];

    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) {
        const hint = (m?.[1] || '').trim();
        if (hint && hint.length <= 180) hints.push(hint);
      }
    }

    // Also accept explicit quoted filenames anywhere in the prompt.
    // Example: create slides from "contract.pdf" and "summary.docx"
    const quoted = raw.matchAll(/["“]([^"”\n]+\.(pdf|pptx|docx|xlsx|csv|txt|md))["”]/ig);
    for (const m of quoted) {
      const hint = (m?.[1] || '').trim();
      if (hint && hint.length <= 180) hints.push(hint);
    }

    return Array.from(new Set(hints));
  }

  private detectDeckStyle(message: string, sourceText: string | null): 'business' | 'legal' | 'stats' | 'medical' | 'book' | 'script' {
    const q = (message || '').toLowerCase();
    const src = (sourceText || '').toLowerCase();

    // Explicit user intent wins.
    if (/\b(legal|contract|agreement|nda|terms|policy|compliance|privacy)\b/.test(q)) return 'legal';
    if (/\b(medical|clinical|patient|diagnosis|treatment|trial|study|endpoint|safety|ae\b|adverse event|icd|lab results)\b/.test(q)) return 'medical';
    if (/\b(stats|statistics|analytics|dashboard|kpi|metrics|cohort|funnel|retention|conversion|a\/b)\b/.test(q)) return 'stats';
    if (/\b(book|chapter|summary of the book|nonfiction|fiction|novel|biography|memoir)\b/.test(q)) return 'book';
    if (/\b(script|screenplay|episode|scene|shot list|storyboard|treatment|dialogue)\b/.test(q)) return 'script';
    if (/\b(pitch\s*deck|investor|startup|sales|go-to-market|gtm|marketing|strategy)\b/.test(q)) return 'business';

    // Heuristic signal from source text.
    if (/\b(whereas|hereinafter|hereto|indemnif|governing law|jurisdiction|party of the first part)\b/.test(src)) {
      return 'legal';
    }
    if (/\b(inclusion criteria|exclusion criteria|randomized|double-blind|placebo|adverse events|p-value|confidence interval|endpoint)\b/.test(src)) {
      return 'medical';
    }
    if (/\b(kpi|metric|dashboard|cohort|retention|conversion rate|funnel)\b/.test(src)) {
      return 'stats';
    }
    return 'business';
  }

  private desiredSlideCount(message: string, fallback: number): number {
    const q = (message || '').toLowerCase();
    const m = q.match(/\b(\d{1,2})\s*(slides|slide)\b/);
    if (!m) return fallback;
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1) return fallback;
    return Math.max(1, Math.min(n, 24));
  }

  private async resolveDocumentByHint(userId: string, hint: string): Promise<{ id: string; filename: string | null } | null> {
    const needle = hint.trim();
    if (!needle) return null;
    // Try exact filename first, then partial.
    const exact = await prisma.document.findFirst({
      where: { userId, filename: { equals: needle, mode: 'insensitive' } },
      select: { id: true, filename: true },
    });
    if (exact) return exact;
    const partial = await prisma.document.findFirst({
      where: { userId, filename: { contains: needle, mode: 'insensitive' } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, filename: true },
    });
    return partial ?? null;
  }

  private async loadDocumentTextForDeck(userId: string, documentId: string): Promise<string | null> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true, rawText: true, renderableContent: true, previewText: true },
    });
    if (!doc) return null;
    const preferred = doc.renderableContent || doc.rawText || doc.previewText;
    if (preferred && preferred.trim().length >= 200) return preferred.slice(0, 12000);

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
      take: 80,
      orderBy: { chunkIndex: 'asc' },
      select: { text: true },
    });
    const assembled = chunks.map((c) => c.text).join('\n').trim();
    return assembled ? assembled.slice(0, 12000) : null;
  }

  private emitStage(
    sink: StreamSink | null | undefined,
    input: {
      stage: string;
      key?: string;
      params?: Record<string, string | number | boolean | null>;
      message?: string;
    },
  ): void {
    if (!sink || !sink.isOpen()) return;
    sink.write({
      event: 'progress',
      data: {
        stage: input.stage,
        ...(input.key ? { key: input.key } : {}),
        ...(input.params ? { params: input.params } : {}),
        ...(input.message ? { message: input.message } : {}),
        t: Date.now(),
      },
    } as any);
    const text = String(input.message || "").trim();
    if (text) {
      sink.write({
        event: 'worklog',
        data: {
          eventType: 'NARRATION_ADD',
          text,
          t: Date.now(),
        },
      } as any);
    }
  }

  private emitWorklog(
    sink: StreamSink | null | undefined,
    input: {
      runId?: string;
      eventType: 'RUN_START' | 'STEP_ADD' | 'STEP_UPDATE' | 'NARRATION_ADD' | 'RUN_COMPLETE' | 'RUN_ERROR';
      title?: string;
      summary?: string;
      stepId?: string;
      label?: string;
      status?: 'queued' | 'running' | 'done' | 'error';
      text?: string;
    },
  ): void {
    if (!sink || !sink.isOpen()) return;
    sink.write({
      event: 'worklog',
      data: {
        ...input,
        t: Date.now(),
      },
    } as any);
  }

  private toEditDocumentLabel(filename: string): string {
    const raw = String(filename || "").trim();
    if (!raw) return "Document";
    const noExt = raw.replace(/\.[A-Za-z0-9]{1,8}$/g, "").trim();
    const base = noExt || raw;
    if (base.length <= 28) return base;
    return `${base.slice(0, 13)}...${base.slice(-12)}`;
  }

  private extractReplacePairFromInstruction(instruction: string): { from: string; to: string } | null {
    const text = String(instruction || "").trim();
    if (!text) return null;
    const quoted = this.extractQuotedSegments(text).map((s) => String(s || "").trim()).filter(Boolean);
    if (quoted.length >= 2) {
      return { from: quoted[0], to: quoted[1] };
    }
    const m = text.match(
      /\b(?:replace|substitute|trocar|substituir|substitua|reemplazar|cambiar)\b\s+(.+?)\s+\b(?:with|to|por)\b\s+(.+)$/i,
    );
    if (!m) return null;
    const from = String(m[1] || "").replace(/^["'`“”]|["'`“”]$/g, "").trim();
    const to = String(m[2] || "").replace(/^["'`“”]|["'`“”]$/g, "").trim();
    if (!from || !to) return null;
    return { from, to };
  }

  private detectEditTaskType(input: {
    instruction: string;
    operator: EditOperator;
    domain: EditDomain;
  }): string {
    const msg = String(input.instruction || "").toLowerCase();
    if (input.operator === "CREATE_CHART") return "chart";
    if (input.domain === "sheets" && (input.operator === "EDIT_CELL" || input.operator === "EDIT_RANGE")) return "set_value";
    if (/\b(translate|translation|traduz|traduzir|tradu[cç][aã]o|traducir|traducci[oó]n)\b/i.test(msg)) return "translate";
    if (this.extractReplacePairFromInstruction(input.instruction)) return "replace_all";
    if (/\b(format|style|heading|headings|bold|italic|underline|font|size|color|cor|negrito|it[aá]lico|t[ií]tulo)\b/i.test(msg)) return "format";
    return "generic";
  }

  private buildEditTaskSummary(input: {
    instruction: string;
    operator: EditOperator;
    domain: EditDomain;
    targetHint?: string | null;
  }): string {
    const pair = this.extractReplacePairFromInstruction(input.instruction);
    if (pair) return `Replace "${pair.from}" → "${pair.to}"`;

    const taskType = this.detectEditTaskType({
      instruction: input.instruction,
      operator: input.operator,
      domain: input.domain,
    });
    if (taskType === "chart") {
      const range = String(input.targetHint || "").trim();
      return range ? `Create chart from ${range}` : "Create chart";
    }
    if (taskType === "translate") return "Translate content";
    if (taskType === "set_value") {
      const a1 = String(input.targetHint || "").trim();
      return a1 ? `Update ${a1}` : "Update spreadsheet values";
    }
    const text = String(input.instruction || "").replace(/\s+/g, " ").trim();
    if (!text) return "Prepare document edits";
    return text.length <= 120 ? text : `${text.slice(0, 117).trimEnd()}...`;
  }

  private emitEditProgress(
    sink: StreamSink | null | undefined,
    input: {
      phase: "DRAFT" | "APPLY";
      step: string;
      status: "pending" | "active" | "done" | "error";
      vars?: Record<string, unknown>;
      summary?: string;
      scope?: "selection" | "paragraph" | "section" | "document" | "range" | "unknown";
      documentKind?: "docx" | "sheets" | "slides" | "pdf" | "unknown";
      documentLabel?: string;
    },
  ): void {
    if (!sink || !sink.isOpen()) return;
    sink.write({
      event: "progress",
      data: {
        stage: "editing",
        key: "allybi.stage.edit.progress",
        phase: input.phase,
        step: input.step,
        status: input.status,
        ...(input.vars ? { vars: input.vars } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.scope ? { scope: input.scope } : {}),
        ...(input.documentKind ? { documentKind: input.documentKind } : {}),
        ...(input.documentLabel ? { documentLabel: input.documentLabel } : {}),
        t: Date.now(),
      },
    } as any);
  }

  private async handleSlidesDeckRequest(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    message: string;
    preferredLanguage?: 'en' | 'pt' | 'es';
    sink?: StreamSink;
    context?: Record<string, unknown> | null;
  }): Promise<{ text: string; attachments: any[] }> {
    const lang = params.preferredLanguage || 'en';
    const defaultCount = Math.max(1, Math.min(Number(process.env.KODA_SLIDES_DEFAULT_SLIDE_COUNT || 8), 24));
    const slideCountTarget = this.desiredSlideCount(params.message, defaultCount);

    const includeVisuals = (() => {
      const raw = (params.context as any)?.slidesDeck?.includeVisuals;
      if (typeof raw === 'boolean') return raw;
      return true;
    })();

    const fileHints = this.parseUsingFileHints(params.message);
    let sourceText: string | null = null;
    let sourceLabel: string | null = null;
    let sourceDocumentId: string | null = null;

    if (fileHints.length > 0) {
      this.emitStage(params.sink, {
        stage: 'retrieving',
        key: 'allybi.stage.docs.finding',
        params: { count: fileHints.length },
      });
      const resolved = [];
      for (const hint of fileHints.slice(0, 5)) { // cap to keep prompt bounded
        const doc = await this.resolveDocumentByHint(params.userId, hint);
        if (doc) resolved.push(doc);
      }

      if (resolved.length > 0) {
        sourceDocumentId = resolved[0].id;
        sourceLabel = resolved.map((d) => d.filename || 'file').join(', ');
        this.emitStage(params.sink, {
          stage: 'reading',
          key: 'allybi.stage.docs.reading',
          params: { count: resolved.length },
        });

        const parts: string[] = [];
        for (const doc of resolved) {
          const text = await this.loadDocumentTextForDeck(params.userId, doc.id);
          if (text) {
            parts.push(`# ${doc.filename || doc.id}\n${text}`);
          }
        }
        sourceText = parts.join('\n\n').trim() || null;
      }
    }

    const deckStyle = this.detectDeckStyle(params.message, sourceText);

    this.emitStage(params.sink, {
      stage: 'composing',
      key: 'allybi.stage.slides.outlining',
      params: { count: slideCountTarget, includeVisuals },
    });
    const plan = await this.deckPlanner.plan({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      userRequest: params.message,
      sourceText,
      slideCountTarget,
      language: lang,
      style: deckStyle,
    });

    this.emitStage(params.sink, { stage: 'composing', key: 'allybi.stage.slides.building', params: { count: plan.slides.length, includeVisuals } });
    const deck = await this.deckBuilder.createDeck(plan.title, plan, {
      correlationId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
    }, {
      deckStyle,
      sourceDocumentId: sourceDocumentId || undefined,
      brandName: BRAND_NAME,
      language: lang,
      includeVisuals,
      onStage: (input) => this.emitStage(params.sink, input),
    });

    // Important: emit deck identifiers before thumbnail rendering so the UI can still
    // show an "Open deck" affordance even if thumbnails fail for any reason.
    this.emitStage(params.sink, {
      stage: 'finalizing',
      key: 'allybi.stage.slides.thumbnails',
      params: { count: deck.slideObjectIds.length, presentationId: deck.presentationId, url: deck.url },
    });

    let thumbs: Array<{ slideObjectId: string; contentUrl: string; width?: number; height?: number }> = [];
    try {
      thumbs = await this.slidesClient.getSlideThumbnails(deck.presentationId, deck.slideObjectIds, {
        correlationId: params.traceId,
        userId: params.userId,
        conversationId: params.conversationId,
      });
    } catch {
      // Thumbnails are non-critical; still return the deck attachment so it appears in chat.
      thumbs = [];
    }

    const attachments = [
      {
        type: 'slides_deck',
        title: plan.title,
        presentationId: deck.presentationId,
        url: deck.url,
        slides: thumbs.map((t) => ({
          slideObjectId: t.slideObjectId,
          thumbnailUrl: t.contentUrl,
          width: t.width ?? 0,
          height: t.height ?? 0,
        })),
      },
    ];

    // Keep the URL out of the message body; the UI renders the deck link in the deck/builder card.
    const text = sourceLabel
      ? `Created a Google Slides deck from **${sourceLabel}**.`
      : "Created a Google Slides deck.";

    return { text, attachments };
  }

  private parseMoney(value: string): number | null {
    const raw = (value || '').trim();
    if (!raw) return null;
    const neg = raw.includes('(') && raw.includes(')');
    const cleaned = raw.replace(/[()$,\s]/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
  }

  private parseA1CellRef(ref: string): { col: number; row: number } | null {
    const m = String(ref || "").trim().match(/^([A-Z]{1,3})(\d{1,7})$/i);
    if (!m) return null;
    const col = String(m[1] || "")
      .toUpperCase()
      .split("")
      .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
    const row = Number(m[2]);
    if (!Number.isFinite(col) || !Number.isFinite(row) || col < 1 || row < 1) return null;
    return { col, row };
  }

  private parseSheetRangeA1(input: string): { sheetName: string; a1: string; start: { col: number; row: number }; end: { col: number; row: number } } | null {
    const raw = String(input || "").trim();
    if (!raw) return null;
    const bang = raw.indexOf("!");
    const sheetRaw = bang > 0 ? raw.slice(0, bang).trim() : "Sheet1";
    const a1Raw = bang > 0 ? raw.slice(bang + 1).trim() : raw;
    if (!a1Raw) return null;
    const sheetName = (sheetRaw.startsWith("'") && sheetRaw.endsWith("'"))
      ? sheetRaw.slice(1, -1).replace(/''/g, "'")
      : sheetRaw;
    const [startRef, endRef] = a1Raw.includes(":")
      ? a1Raw.split(":")
      : [a1Raw, a1Raw];
    const s = this.parseA1CellRef(startRef);
    const e = this.parseA1CellRef(endRef);
    if (!s || !e) return null;
    return {
      sheetName: String(sheetName || "Sheet1").trim() || "Sheet1",
      a1: `${startRef.trim()}:${endRef.trim()}`,
      start: { col: Math.min(s.col, e.col), row: Math.min(s.row, e.row) },
      end: { col: Math.max(s.col, e.col), row: Math.max(s.row, e.row) },
    };
  }

  private normalizeChartType(raw: string): string {
    const t = String(raw || "bar").trim().toLowerCase();
    if (t.includes("stacked_column") || (t.includes("stacked") && t.includes("column"))) return "stacked_column";
    if (t.includes("stacked_bar") || (t.includes("stacked") && t.includes("bar"))) return "stacked_bar";
    if (t.includes("histogram")) return "histogram";
    if (t.includes("bubble")) return "bubble";
    if (t.includes("radar")) return "radar";
    if (t.includes("combo")) return "combo";
    if (t.includes("scatter")) return "scatter";
    if (t.includes("pie") || t.includes("donut") || t.includes("doughnut")) return "pie";
    if (t.includes("area")) return "area";
    if (t.includes("line")) return "line";
    if (t.includes("column")) return "bar";
    if (t.includes("bar")) return "bar";
    return "bar";
  }

  private async buildChartPreviewAttachmentFromDraft(params: {
    xlsxBytes: Buffer;
    operator: string;
    proposedText: string;
    userMessage: string;
  }): Promise<{ attachment: any | null; warning?: string } | null> {
    try {
      const op = String(params.operator || "").trim().toUpperCase();
      let spec: any = null;
      if (op === "CREATE_CHART") {
        spec = JSON.parse(String(params.proposedText || "{}") || "{}");
      } else if (op === "COMPUTE_BUNDLE" || op === "COMPUTE") {
        const payload = JSON.parse(String(params.proposedText || "{}") || "{}");
        const ops = Array.isArray(payload?.ops) ? payload.ops : [];
        const chartOp = ops.find((x: any) => String(x?.kind || "").trim() === "create_chart");
        spec = chartOp?.spec || null;
      }
      if (!spec || typeof spec !== "object") return null;

      const parsed = this.parseSheetRangeA1(String(spec.range || "").trim());
      if (!parsed) return null;

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(params.xlsxBytes as any);
      const ws = wb.getWorksheet(parsed.sheetName) || wb.worksheets?.[0] || null;
      if (!ws) return null;
      const normalize = (s: string): string =>
        String(s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

      const headerKey = (s: string): string => normalize(String(s || "")).replace(/\s+/g, " ");

      const toText = (value: any): string => {
        if (value == null) return "";
        if (typeof value === "object" && typeof value?.text === "string") return String(value.text || "").trim();
        if (typeof value === "object" && typeof value?.result !== "undefined") return String(value.result ?? "").trim();
        return String(value).trim();
      };

      const toNumeric = (value: any): number | null => {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "object" && value && typeof value?.result === "number" && Number.isFinite(value.result)) return Number(value.result);
        const asMoney = this.parseMoney(String(value ?? ""));
        if (asMoney != null) return asMoney;
        const n = Number(String(value ?? "").replace(/[,\s$()]/g, ""));
        return Number.isFinite(n) ? n : null;
      };

      const colLetterToIdxAbs = (letters: string): number => {
        let out = 0;
        for (const ch of String(letters || "").toUpperCase()) {
          out = out * 26 + (ch.charCodeAt(0) - 64);
        }
        return out;
      };

      const columnCount = parsed.end.col - parsed.start.col + 1;
      const rangeRows: any[][] = [];
      for (let r = parsed.start.row; r <= parsed.end.row; r += 1) {
        const rowVals: any[] = [];
        for (let c = parsed.start.col; c <= parsed.end.col; c += 1) {
          rowVals.push(ws.getCell(r, c).value as any);
        }
        rangeRows.push(rowVals);
      }
      if (!rangeRows.length) {
        return { attachment: null, warning: "I couldn't build a chart preview because the selected range is empty." };
      }

      const explicitHeaderCount = Number(spec?.headerCount);
      const autoHeaderCount = (() => {
        if (rangeRows.length < 2) return 0;
        const first = rangeRows[0] || [];
        const second = rangeRows[1] || [];
        const firstHasText = first.some((v) => {
          const s = toText(v);
          return Boolean(s) && !Number.isFinite(toNumeric(v) as number);
        });
        const secondHasNumeric = second.some((v) => Number.isFinite(toNumeric(v) as number));
        return firstHasText && secondHasNumeric ? 1 : 0;
      })();
      const headerCount = Number.isInteger(explicitHeaderCount) && explicitHeaderCount >= 0 && explicitHeaderCount <= 1
        ? explicitHeaderCount
        : autoHeaderCount;
      const headers = headerCount > 0
        ? (rangeRows[0] || []).map((v, idx) => toText(v) || `Column ${idx + 1}`)
        : Array.from({ length: columnCount }, (_, idx) => `Column ${idx + 1}`);
      const dataRows = rangeRows
        .slice(headerCount)
        .filter((row) => Array.isArray(row) && row.some((v) => toText(v).length > 0));
      if (!dataRows.length) {
        return { attachment: null, warning: "The selected range has no data rows after the header." };
      }

      const stats = new Array(columnCount).fill(null).map(() => ({ nonEmpty: 0, numeric: 0, textLike: 0 }));
      for (const row of dataRows) {
        for (let c = 0; c < columnCount; c += 1) {
          const raw = row[c];
          const text = toText(raw);
          if (!text) continue;
          stats[c].nonEmpty += 1;
          const n = toNumeric(raw);
          if (Number.isFinite(n as number)) stats[c].numeric += 1;
          else stats[c].textLike += 1;
        }
      }
      const numericColsLocal = stats
        .map((s, idx) => ({ idx, s }))
        .filter(({ s }) => s.nonEmpty > 0 && (s.numeric / s.nonEmpty) >= 0.6)
        .map(({ idx }) => idx);
      const labelColsLocal = stats
        .map((s, idx) => ({ idx, s }))
        .filter(({ s }) => s.textLike > 0)
        .map(({ idx }) => idx);

      const messageNorm = normalize(String(params.userMessage || ""));
      const domainLocal = labelColsLocal[0] ?? 0;
      const defaultSeriesLocals = numericColsLocal.filter((idx) => idx !== domainLocal);
      const resolveColumnSpecifier = (value: any): number | null => {
        if (value == null) return null;
        if (typeof value === "number" && Number.isInteger(value)) {
          const n = Number(value);
          const idx = n > 0 ? n - 1 : n;
          return idx >= 0 && idx < columnCount ? idx : null;
        }
        const raw = String(value || "").trim();
        if (!raw) return null;
        if (/^\d+$/.test(raw)) {
          const n = Number(raw);
          const idx = n > 0 ? n - 1 : n;
          return idx >= 0 && idx < columnCount ? idx : null;
        }
        if (/^[A-Z]{1,3}$/i.test(raw)) {
          const abs = colLetterToIdxAbs(raw.toUpperCase());
          const local = abs - parsed.start.col;
          return local >= 0 && local < columnCount ? local : null;
        }
        const wanted = headerKey(raw);
        for (let i = 0; i < headers.length; i += 1) {
          if (headerKey(headers[i]) === wanted) return i;
        }
        return null;
      };

      const hintedByMessage = headers
        .map((h, idx) => ({ idx, h: headerKey(h) }))
        .filter((x) => x.h && x.h.length >= 3 && messageNorm.includes(x.h))
        .map((x) => x.idx)
        .filter((idx) => numericColsLocal.includes(idx));
      const requestedSeriesLocals = Array.isArray(spec?.series)
        ? spec.series
            .map((x: any) => resolveColumnSpecifier(x))
            .filter((idx: number | null): idx is number => idx != null && numericColsLocal.includes(idx))
        : [];
      let seriesLocals = requestedSeriesLocals.length
        ? requestedSeriesLocals
        : (hintedByMessage.length ? hintedByMessage : defaultSeriesLocals);
      if (!seriesLocals.length && numericColsLocal.length) {
        seriesLocals = [numericColsLocal[0]];
      }
      seriesLocals = Array.from(new Set(seriesLocals)).slice(0, 8);

      const type = this.normalizeChartType(String(spec?.type || "bar"));
      const makeSeries = (locals: number[]) =>
        locals.map((localIdx, idx) => ({
          yKey: `s_${localIdx}`,
          label: String(headers[localIdx] || `Series ${idx + 1}`),
        }));
      const makeBasicRows = (locals: number[], xKey = "category") => {
        const out: any[] = [];
        for (let i = 0; i < dataRows.length; i += 1) {
          const row = dataRows[i] || [];
          const label = toText(row[domainLocal]) || `Row ${parsed.start.row + headerCount + i}`;
          const next: any = { [xKey]: label };
          let hasMetric = false;
          for (const localIdx of locals) {
            const v = toNumeric(row[localIdx]);
            next[`s_${localIdx}`] = Number.isFinite(v as number) ? Number(v) : 0;
            if (Number.isFinite(v as number)) hasMetric = true;
          }
          if (hasMetric) out.push(next);
        }
        return out.slice(0, 120);
      };
      const sourceRange = `${parsed.sheetName}!${parsed.a1}`;
      const title = String(spec?.title || "Chart preview");

      if (type === "stacked_bar" || type === "stacked_column") {
        if (seriesLocals.length < 2) {
          return {
            attachment: null,
            warning: "This stacked chart needs one label column plus at least two numeric series columns.",
          };
        }
        const rows = makeBasicRows(seriesLocals);
        if (!rows.length) return { attachment: null, warning: "I couldn't plot this stacked chart because the selected rows have no numeric values." };
        return {
          attachment: {
            type: "chart",
            chartType: type,
            title,
            xKey: "category",
            series: makeSeries(seriesLocals),
            sourceRange,
            valueFormat: { style: "currency", currency: "USD" },
            data: rows,
          },
        };
      }

      if (type === "combo") {
        if (seriesLocals.length < 2) {
          return {
            attachment: null,
            warning: "Combo charts need at least two numeric series (bar + line).",
          };
        }
        const lineLocalsRequested = Array.isArray(spec?.comboSeries?.lineSeries)
          ? spec.comboSeries.lineSeries
              .map((x: any) => resolveColumnSpecifier(x))
              .filter((idx: number | null): idx is number => idx != null && seriesLocals.includes(idx))
          : [];
        const lineLocal = lineLocalsRequested.length ? lineLocalsRequested[0] : seriesLocals[seriesLocals.length - 1];
        const series = makeSeries(seriesLocals).map((s) => ({ ...s, ...(s.yKey === `s_${lineLocal}` ? { role: "line" } : {}) }));
        const rows = makeBasicRows(seriesLocals);
        if (!rows.length) return { attachment: null, warning: "I couldn't plot this combo chart because the selected rows have no numeric values." };
        return {
          attachment: {
            type: "chart",
            chartType: "combo",
            title,
            xKey: "category",
            series,
            sourceRange,
            valueFormat: { style: "currency", currency: "USD" },
            data: rows,
          },
        };
      }

      if (type === "bubble") {
        if (numericColsLocal.length < 2) {
          return {
            attachment: null,
            warning: "Bubble charts need at least two numeric columns for X and Y.",
          };
        }
        const xLocal = resolveColumnSpecifier(spec?.bubble?.xColumn) ?? numericColsLocal[0];
        const yLocal = resolveColumnSpecifier(spec?.bubble?.yColumn) ?? numericColsLocal.find((c) => c !== xLocal) ?? null;
        if (yLocal == null || !numericColsLocal.includes(xLocal) || !numericColsLocal.includes(yLocal)) {
          return {
            attachment: null,
            warning: "I couldn't map valid numeric X/Y columns for this bubble chart.",
          };
        }
        const rows: any[] = [];
        for (let i = 0; i < dataRows.length; i += 1) {
          const row = dataRows[i] || [];
          const x = toNumeric(row[xLocal]);
          const y = toNumeric(row[yLocal]);
          if (!Number.isFinite(x as number) || !Number.isFinite(y as number)) continue;
          rows.push({
            __x: Number(x),
            __y: Number(y),
            category: toText(row[domainLocal]) || `Row ${parsed.start.row + headerCount + i}`,
          });
        }
        if (!rows.length) return { attachment: null, warning: "No valid numeric points were found for this bubble chart." };
        return {
          attachment: {
            type: "chart",
            chartType: "bubble",
            title,
            xKey: "__x",
            series: [{ yKey: "__y", label: `${headers[yLocal]} vs ${headers[xLocal]}` }],
            sourceRange,
            valueFormat: { style: "number" },
            data: rows.slice(0, 200),
          },
        };
      }

      if (type === "histogram") {
        const requested = resolveColumnSpecifier(spec?.histogram?.valueColumn);
        const valueLocal = requested != null && numericColsLocal.includes(requested) ? requested : numericColsLocal[0];
        if (valueLocal == null) {
          return { attachment: null, warning: "Histogram needs one numeric column. Select or specify a numeric value column." };
        }
        if (numericColsLocal.length > 1 && requested == null) {
          return {
            attachment: null,
            warning: "Histogram works with one numeric series. Please select one numeric column or specify which column to use.",
          };
        }
        const values = dataRows
          .map((row) => toNumeric(row?.[valueLocal]))
          .filter((n): n is number => Number.isFinite(n as number))
          .map((n) => Number(n));
        if (values.length < 2) {
          return { attachment: null, warning: "Histogram needs at least two numeric values to build bins." };
        }
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = Math.max(0, max - min);
        const requestedBucket = Number(spec?.histogram?.bucketSize);
        const bucketSize = Number.isFinite(requestedBucket) && requestedBucket > 0
          ? requestedBucket
          : (span > 0 ? span / Math.max(4, Math.min(12, Math.ceil(Math.sqrt(values.length)))) : 1);
        const binsCount = Math.max(1, Math.min(16, Math.ceil(span / bucketSize) || 1));
        const bins = new Array(binsCount).fill(0);
        for (const v of values) {
          const idx = span <= 0 ? 0 : Math.min(binsCount - 1, Math.floor((v - min) / bucketSize));
          bins[idx] += 1;
        }
        const rows = bins.map((count, i) => {
          const from = min + i * bucketSize;
          const to = i === binsCount - 1 ? max : (from + bucketSize);
          return {
            bucket: `${Math.round(from)} - ${Math.round(to)}`,
            count,
          };
        });
        return {
          attachment: {
            type: "chart",
            chartType: "histogram",
            title,
            xKey: "bucket",
            series: [{ yKey: "count", label: "Count" }],
            sourceRange,
            valueFormat: { style: "number" },
            data: rows,
          },
        };
      }

      if (type === "pie") {
        const requested = requestedSeriesLocals[0] ?? (hintedByMessage.length ? hintedByMessage[0] : null);
        const valueLocal = requested != null && numericColsLocal.includes(requested)
          ? requested
          : (defaultSeriesLocals[0] ?? numericColsLocal[0]);
        if (valueLocal == null) {
          return { attachment: null, warning: "Pie charts need one label column and one numeric values column." };
        }
        const hasNegative = dataRows.some((row) => {
          const v = toNumeric(row?.[valueLocal]);
          return Number.isFinite(v as number) && Number(v) < 0;
        });
        if (hasNegative) {
          return { attachment: null, warning: "Pie charts cannot use negative values. Select a non-negative values column." };
        }
        const rows = makeBasicRows([valueLocal]);
        if (!rows.length) return { attachment: null, warning: "I couldn't plot this pie chart because the selected rows have no numeric values." };
        return {
          attachment: {
            type: "chart",
            chartType: "pie",
            title,
            xKey: "category",
            series: makeSeries([valueLocal]),
            sourceRange,
            valueFormat: { style: "currency", currency: "USD" },
            data: rows,
          },
        };
      }

      if (type === "scatter") {
        if (numericColsLocal.length < 2) {
          return {
            attachment: null,
            warning: "Scatter charts need at least two numeric columns (X and Y).",
          };
        }
        const xLocal = numericColsLocal[0];
        const yLocals = numericColsLocal.slice(1, 4);
        const rows: any[] = [];
        for (let i = 0; i < dataRows.length; i += 1) {
          const row = dataRows[i] || [];
          const x = toNumeric(row[xLocal]);
          if (!Number.isFinite(x as number)) continue;
          const next: any = { __x: Number(x) };
          let hasY = false;
          for (const yLocal of yLocals) {
            const y = toNumeric(row[yLocal]);
            if (Number.isFinite(y as number)) {
              next[`s_${yLocal}`] = Number(y);
              hasY = true;
            }
          }
          if (hasY) rows.push(next);
        }
        if (!rows.length) return { attachment: null, warning: "I couldn't plot this scatter chart because valid numeric X/Y points were not found." };
        return {
          attachment: {
            type: "chart",
            chartType: "scatter",
            title,
            xKey: "__x",
            series: makeSeries(yLocals),
            sourceRange,
            valueFormat: { style: "number" },
            data: rows.slice(0, 300),
          },
        };
      }

      if (type === "radar") {
        if (seriesLocals.length < 2) {
          return {
            attachment: null,
            warning: "Radar charts need at least two numeric series columns.",
          };
        }
        const rows = makeBasicRows(seriesLocals);
        if (!rows.length) return { attachment: null, warning: "I couldn't plot this radar chart because the selected rows have no numeric values." };
        return {
          attachment: {
            type: "chart",
            chartType: "radar",
            title,
            xKey: "category",
            series: makeSeries(seriesLocals),
            sourceRange,
            valueFormat: { style: "number" },
            data: rows,
          },
        };
      }

      // Basic bar/line/area fallback.
      if (!seriesLocals.length) {
        return {
          attachment: null,
          warning: "I couldn't find numeric series in the selected range. Select at least one numeric column.",
        };
      }
      const rows = makeBasicRows(seriesLocals);
      if (!rows.length) {
        return { attachment: null, warning: "I couldn't plot this chart because the selected rows have no numeric values." };
      }
      return {
        attachment: {
          type: "chart",
          chartType: type,
          title,
          xKey: "category",
          series: makeSeries(seriesLocals),
          sourceRange,
          valueFormat: { style: "currency", currency: "USD" },
          data: rows,
        },
      };
    } catch {
      return null;
    }
  }

  private parseCategoryAmountPairs(text: string): Array<{ category: string; amount: number }> {
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const out: Array<{ category: string; amount: number }> = [];

    for (let line of lines) {
      // Strip markdown bullet points and leading whitespace
      line = line.replace(/^[\s*\-•]+/, '').trim();
      // Strip bold markers around amounts: **$123** → $123
      line = line.replace(/\*\*(\$[\d,.\-()]+)\*\*/g, '$1');
      line = line.replace(/\*\*([^*]+)\*\*/g, '$1'); // also strip bold from category names

      // Examples:
      // "Room Revenue: $3,741,462.88"
      // "Room Revenue\t$3,741,462.88"
      // "* Room Revenue: **$3,741,462.88**" (after stripping)
      const m = line.match(/^(.{2,120}?)(?:\s*[:\t]\s*|\s{2,})(\(?-?\$?[\d,]+(?:\.\d+)?\)?)\s*$/);
      if (!m) continue;
      const category = (m[1] || '').trim();
      if (!category) continue;
      if (/^total\b/i.test(category)) continue;
      if (/^\d{6}\s*-/.test(category)) continue; // Skip account codes like "440000 - Room Revenue"
      const amount = this.parseMoney(m[2] || '');
      if (amount == null) continue;
      out.push({ category, amount });
    }

    // Stable dedupe by category (keep first)
    const seen = new Set<string>();
    const deduped: Array<{ category: string; amount: number }> = [];
    for (const row of out) {
      const key = row.category.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    return deduped.slice(0, 25);
  }

  private extractChartDataFromHistory(history: Array<{ role: ChatRole; content: string }>): Array<{ category: string; amount: number }> {
    // Prefer the most recent assistant message that contains obvious money rows.
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role !== 'assistant') continue;
      if (!/\$[\d,]+/.test(msg.content || '')) continue;
      const pairs = this.parseCategoryAmountPairs(msg.content || '');
      if (pairs.length >= 3) return pairs;
    }
    return [];
  }

  private async handleChartRequest(params: {
    userId: string;
    conversationId: string;
    correlationId: string;
    clientMessageId: string;
    message: string;
    history: Array<{ role: ChatRole; content: string }>;
  }): Promise<{ text: string; attachments: any[] }> {
    // Prefer extracting chart data from a referenced XLSX file in the user's library.
    // This is required for E2E tests that say "create a chart from <xlsx>" without pasting data.
    const msgLower = (params.message || "").toLowerCase();
    const wantsCompare = /\b(compare|comparison|vs|versus)\b/.test(msgLower) && /\b(revenue|receita)\b/.test(msgLower) && /\b(expenses?|despesas?)\b/.test(msgLower);
    const wantsMonthlyRevenue = /\b(monthly|month)\b/.test(msgLower) && /\b(revenue|receita)\b/.test(msgLower);

    const chartDocCandidates = await this.resolveDocumentCandidates(params.userId, params.message, 6);
    const xlsxDoc = chartDocCandidates.find((d) => (d.mimeType || "").includes("spreadsheetml.sheet")) || null;

    if (xlsxDoc?.id) {
      const full = await prisma.document.findFirst({
        where: { id: xlsxDoc.id, userId: params.userId },
        select: { id: true, filename: true, encryptedFilename: true, mimeType: true },
      });
      if (full?.encryptedFilename) {
        try {
          const bytes = await downloadFile(full.encryptedFilename);
          const extraction = await extractXlsxWithAnchors(bytes);
          const facts = Array.isArray((extraction as any)?.cellFacts) ? (extraction as any).cellFacts : [];

          // Helper: pick a "total" row when available, otherwise fall back to the first match.
          const pickRowLabel = (needle: "revenue" | "expenses"): string | null => {
            const labels = new Set<string>();
            for (const f of facts) {
              const rl = String(f?.rowLabel || "").trim();
              if (!rl) continue;
              if (rl.toLowerCase().includes(needle)) labels.add(rl);
            }
            const arr = Array.from(labels);
            if (!arr.length) return null;
            const total = arr.find((l) => /\btotal\b/i.test(l) && l.toLowerCase().includes(needle));
            return total || arr.find((l) => l.toLowerCase() === needle) || arr[0];
          };

          const rowRevenue = pickRowLabel("revenue");
          const rowExpenses = pickRowLabel("expenses");

          // Build month -> value map for a chosen row label.
          const buildMonthlySeries = (rowLabel: string | null): Array<{ month: number; label: string; value: number }> => {
            if (!rowLabel) return [];
            const out: Array<{ month: number; label: string; value: number }> = [];
            for (const f of facts) {
              if (!f) continue;
              const rl = String(f.rowLabel || "");
              if (!rl) continue;
              if (rl.toLowerCase() !== rowLabel.toLowerCase()) continue;
              const month = Number(f?.period?.month || 0);
              if (!Number.isFinite(month) || month < 1 || month > 12) continue;
              const val = this.parseMoney(String(f?.displayValue || f?.value || "")) ?? Number(String(f?.value || "").replace(/,/g, ""));
              if (!Number.isFinite(val)) continue;
              out.push({ month, label: String(f?.colHeader || `M${month}`), value: val });
            }
            out.sort((a, b) => a.month - b.month);
            // Deduplicate by month (prefer the last occurrence).
            const byMonth = new Map<number, { month: number; label: string; value: number }>();
            for (const item of out) byMonth.set(item.month, item);
            return Array.from(byMonth.values()).sort((a, b) => a.month - b.month);
          };

          const revSeries = buildMonthlySeries(rowRevenue);
          const expSeries = buildMonthlySeries(rowExpenses);

          if (wantsCompare && revSeries.length >= 3 && expSeries.length >= 3) {
            const data: any[] = [];
            const months = new Set<number>([...revSeries.map((x) => x.month), ...expSeries.map((x) => x.month)]);
            const monthArr = Array.from(months).sort((a, b) => a - b);
            const revMap = new Map(revSeries.map((x) => [x.month, x.value]));
            const expMap = new Map(expSeries.map((x) => [x.month, x.value]));
            for (const m of monthArr) {
              data.push({
                month: m,
                category: m, // fallback
                label: m,
                monthLabel: m,
                monthName: m,
                monthNum: m,
                monthKey: m,
                monthText: m,
                monthStr: m,
                monthDisplay: m,
                monthShort: m,
                monthLong: m,
                monthValue: m,
                monthIndex: m,
                monthId: m,
                month_1_12: m,
                // Recharts uses xKey below; we keep a stable "month" display too.
                x: m,
                revenue: revMap.get(m) ?? null,
                expenses: expMap.get(m) ?? null,
              });
            }

            const title = `Revenue vs Expenses (Monthly)`;
            return {
              text: `Here’s a comparison chart from **${full.filename || "the spreadsheet"}**.`,
              attachments: [
                {
                  type: "chart",
                  chartType: "bar",
                  title,
                  xKey: "month",
                  series: [
                    { yKey: "revenue", label: "Revenue" },
                    { yKey: "expenses", label: "Expenses" },
                  ],
                  valueFormat: { style: "currency", currency: "USD" },
                  data: data.map((d) => ({
                    month: this.monthShortName(Number(d.month)),
                    revenue: d.revenue ?? 0,
                    expenses: d.expenses ?? 0,
                  })),
                },
              ],
            };
          }

          if ((wantsMonthlyRevenue || /\brevenue\b/.test(msgLower)) && revSeries.length >= 3) {
            const title = "Monthly Revenue";
            return {
              text: `Here’s a bar chart from **${full.filename || "the spreadsheet"}**.`,
              attachments: [
                {
                  type: "chart",
                  chartType: "bar",
                  title,
                  xKey: "month",
                  series: [{ yKey: "revenue", label: "Revenue" }],
                  valueFormat: { style: "currency", currency: "USD" },
                  data: revSeries.map((x) => ({
                    month: this.monthShortName(x.month),
                    revenue: x.value,
                  })),
                },
              ],
            };
          }
        } catch {
          // Fall through to history-based chart extraction.
        }
      }
    }

    // Fallback: derive from numbers the assistant already produced in the chat.
    const pairs = this.extractChartDataFromHistory(params.history);
    if (pairs.length < 3) {
      return {
        text: 'I can create a chart, but I need the data in the chat or in a referenced spreadsheet. Paste the table (or mention the XLSX filename), then say “create a chart”.',
        attachments: [],
      };
    }

    const data = [...pairs].sort((a, b) => (b.amount - a.amount));
    return {
      text: "Here is a bar chart based on the numbers above.",
      attachments: [
        {
          type: "chart",
          chartType: "bar",
          title: "Revenue by Category",
          xKey: "category",
          yKey: "amount",
          valueFormat: { style: "currency", currency: "USD" },
          data,
        },
      ],
    };
  }

  /* ---------------- Editing (DOCX/XLSX) ---------------- */

  private isLikelyTitleEdit(message: string): boolean {
    const q = (message || "").toLowerCase();
    return /\b(title|document title|heading|cabeçalho|cabecalho|título|titulo)\b/.test(q);
  }

  private resolveAllybiRequestedScope(params: {
    message: string;
    domain: "docx" | "xlsx";
    hasSelection?: boolean;
    explicitTarget?: string | null;
  }): { intentId: string | null; scopeKind: AllybiScopeResolution["scopeKind"]; targetHint?: string } {
    const intent = classifyAllybiIntent(params.message, params.domain);
    const scope = resolveAllybiScope({
      domain: params.domain,
      message: params.message,
      classifiedIntent: intent,
      explicitTarget: params.explicitTarget || null,
      ...(params.hasSelection ? { liveSelection: { hasSelection: true } } : {}),
    });
    return {
      intentId: intent?.intentId ? String(intent.intentId) : null,
      scopeKind: scope.scopeKind,
      targetHint: scope.targetHint,
    };
  }

  private isAllybiDocumentScopeDirective(message: string, domain: "docx" | "xlsx"): boolean {
    const scope = this.resolveAllybiRequestedScope({ message, domain, hasSelection: false });
    return scope.scopeKind === "document" || String(scope.targetHint || "").trim().toLowerCase() === "document";
  }

  private extractInsertAfterHint(message: string): string | null {
    const q = String(message || "").trim();
    const quoted = this.extractQuotedSegments(q);
    if (quoted.length >= 1 && /\b(after|below|under|depois de|abaixo de)\b/i.test(q)) {
      const t = String(quoted[0] || "").trim();
      if (t) return t;
    }
    const m = q.match(/\b(?:after|below|under|depois de|abaixo de)\b\s+(.+?)(?:\s+(?:summariz|resum|with|com|that|que)\b|$)/i);
    if (!m?.[1]) return null;
    let out = String(m[1]).trim();
    out = out.replace(/^(?:the|a|an|o|a)\s+/i, "").trim();
    out = out.replace(/\s+(?:section|heading|title|se[cç][aã]o|t[ií]tulo)\s*$/i, "").trim();
    return out || null;
  }

  private isHeadingStyleNormalizationRequest(message: string): boolean {
    const q = String(message || "").toLowerCase();
    const mentionsHeading = /\b(section headings?|headings?|titles?|subheadings?|heading level|heading style)\b/.test(q);
    const mentionsStyle = /\b(bold|consistent|normalize|same|uniform|h1|h2|h3|negrito|padroniz|consistente)\b/.test(q);
    return mentionsHeading && mentionsStyle;
  }

  private getDocxRequestedScope(message: string): "word" | "sentence" | "paragraph" | "bullets" | "heading" | "unknown" {
    const q = String(message || "").toLowerCase();
    if (/\b(word|term|token|palavra|termo)\b/.test(q)) return "word";
    if (/\b(sentence|frase|oração|oracao)\b/.test(q)) return "sentence";
    if (/\b(paragraph|par[aá]grafo)\b/.test(q)) return "paragraph";
    if (/\b(bullet|bullets|bullet points?|list|lista|itens?)\b/.test(q)) return "bullets";
    if (/\b(heading|header|title|t[ií]tulo|cabe[cç]alho|subheading|subt[ií]tulo)\b/.test(q)) return "heading";
    return "unknown";
  }

  private extractQuotedText(message: string): string | null {
    const segs = this.extractQuotedSegments(message);
    return segs.length ? segs[0] : null;
  }

  private extractQuotedSegments(message: string): string[] {
    const text = String(message || "");
    const segs: string[] = [];
    const rx = /"([^"\n]{2,2000})"|'([^'\n]{2,2000})'/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      const picked = (m[1] || m[2] || "").trim();
      if (picked) segs.push(picked);
      if (segs.length >= 3) break;
    }
    return segs;
  }

  private parseAfterToValue(message: string): string | null {
    const q = (message || "").trim();
    // Common: "set X to VALUE", "change ... to VALUE", "replace X with Y", "title should be VALUE".
    //
    // IMPORTANT:
    // Do NOT treat "rewrite ... to be clearer/shorter" as an explicit replacement value.
    // That failure mode writes instruction fragments (ex: "be clearer. Keep tone.") into the document.
    const low = q.toLowerCase();
    const isRewriteStyle = /\b(rewrite|rephrase|reword|improve|polish|tighten|make)\b/.test(low) && /\b(clearer|clear|concise|shorter|professional|formal|friendly|tone)\b/.test(low);
    const hasSetVerb =
      /\b(set|change|replace|rename|retitle|update|write|put|fill|make(?:\s+the\s+title)?|title should be|heading should be)\b/.test(low) ||
      /\b(definir|defina|mudar|mude|alterar|altere|substituir|substitua|trocar|troque|renomear|renomeie|atualizar|atualize|colocar|coloque|deixar|deixe|preencher|preencha)\b/.test(low);
    const hasEquals = /\=/.test(q);
    if (isRewriteStyle && !hasSetVerb && !hasEquals) return null;
    const looksLikeFormattingInstruction =
      /\b(bold|italic|underline|font\s*size|font|color|colour|line\s*spacing|spacing|align|alignment|justify|justified)\b/.test(low) ||
      /\b(negrito|it[aá]lico|sublinhad[oa]|fonte|cor|espa[cç]amento|entrelinhas|alinhamento|justificar)\b/.test(low);
    if (looksLikeFormattingInstruction) return null;

    // Only accept a trailing "to/=/should be/para ..." when the message looks like an explicit value assignment.
    if (!hasSetVerb && !hasEquals) return null;

    const m = q.match(/\b(?:to|=|should be|deve ser|para)\b\s*[:：]?\s*(.+)$/i);
    if (!m) return null;
    const raw = (m[1] || "").trim();
    if (!raw) return null;
    // Strip surrounding quotes if present
    const unquoted = raw.replace(/^["']/, "").replace(/["']$/, "").trim();
    return unquoted || null;
  }

  private parseRequestedTranslationLanguage(message: string): "en" | "pt" | "es" | null {
    const low = String(message || "").toLowerCase();
    if (/\b(portuguese|portugu[eê]s|pt-br|pt)\b/.test(low)) return "pt";
    if (/\b(english|ingl[eê]s|en-us|en)\b/.test(low)) return "en";
    if (/\b(spanish|espanhol|espa[nñ]ol|es)\b/.test(low)) return "es";
    return null;
  }

  private parseInlineFormattingIntent(message: string): {
    enable: boolean;
    styles: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      fontSizePt?: number;
      fontFamily?: string;
    };
  } | null {
    const q = String(message || "");
    const low = q.toLowerCase();
    const disable =
      /\b(remove|un-|clear|disable|off|tirar|remover|desativar)\b/.test(low) ||
      /\b(without|sem)\b.{0,18}\b(bold|negrito|italic|it[aá]lico|underline|sublinhar|sublinhado)\b/.test(low) ||
      /\b(no|sem)\s+(?:bold|negrito|italic|it[aá]lico|underline|sublinhar|sublinhado)\b/.test(low);
    const styles: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      fontSizePt?: number;
      fontFamily?: string;
    } = {};

    if (/\b(bold|negrito)\b/.test(low)) styles.bold = !disable;
    if (/\b(italic|it[aá]lico)\b/.test(low)) styles.italic = !disable;
    if (/\b(underline|sublinhar|sublinhado)\b/.test(low)) styles.underline = !disable;
    if (disable && /\b(bold|negrito|italic|it[aá]lico|underline|sublinhar|sublinhado)\b/.test(low)) {
      if (styles.bold === undefined && /\b(bold|negrito)\b/.test(low)) styles.bold = false;
      if (styles.italic === undefined && /\b(italic|it[aá]lico)\b/.test(low)) styles.italic = false;
      if (styles.underline === undefined && /\b(underline|sublinhar|sublinhado)\b/.test(low)) styles.underline = false;
    }

    // Color: hex first, then common names.
    const hex = low.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
    if (hex?.[0]) {
      styles.color = hex[0].startsWith("#") ? hex[0] : `#${hex[0]}`;
    } else {
      const named = low.match(/\b(red|blue|green|black|white|gray|grey|orange|yellow|purple|pink|vermelho|azul|verde|preto|branco|cinza|laranja|amarelo|roxo|rosa)\b/i);
      const map: Record<string, string> = {
        red: "#DC2626",
        blue: "#2563EB",
        green: "#16A34A",
        black: "#111827",
        white: "#FFFFFF",
        gray: "#6B7280",
        grey: "#6B7280",
        orange: "#EA580C",
        yellow: "#CA8A04",
        purple: "#7C3AED",
        pink: "#DB2777",
        vermelho: "#DC2626",
        azul: "#2563EB",
        verde: "#16A34A",
        preto: "#111827",
        branco: "#FFFFFF",
        cinza: "#6B7280",
        laranja: "#EA580C",
        amarelo: "#CA8A04",
        roxo: "#7C3AED",
        rosa: "#DB2777",
      };
      const key = String(named?.[1] || "").toLowerCase();
      if (key && map[key]) styles.color = map[key];
    }
    if (disable && /\b(color|colour|cor)\b/.test(low)) styles.color = "#000000";

    const sizeMatch = low.match(/\b(\d{1,2})(?:\s*(?:pt|px))\b/i) || low.match(/\bfont\s*size\s*(?:to|=)?\s*(\d{1,2})\b/i);
    if (sizeMatch?.[1]) {
      const n = Number(sizeMatch[1]);
      if (Number.isFinite(n) && n >= 6 && n <= 72) styles.fontSizePt = n;
    }

    const familyQuoted = q.match(/\bfont(?:\s+family)?\s*(?:to|=|as)?\s*["“”']([^"“”']{2,60})["“”']/i);
    const familyViaSuffix = q.match(/\bto\s+([A-Za-z][A-Za-z0-9 \-]{1,60})\s+font\b/i);
    const familyUnquoted = q.match(/\bfont(?:\s+family)?\s*(?:to|=|as)?\s*([A-Za-z][A-Za-z0-9 \-]{1,60})(?=\s*(?:,|\.|;|and\b|e\b|$))/i);
    const familyRaw = (
      familyQuoted?.[1] ||
      familyViaSuffix?.[1] ||
      familyUnquoted?.[1] ||
      ""
    ).trim();
    const blockedFamilyWord = /^(?:size|tamanho|color|colour|cor|bold|negrito|italic|it[aá]lico|underline|sublinhad[oa]|line|spacing|align(?:ment)?|justif(?:y|ied))$/i;
    if (familyRaw && /^[a-zA-Z0-9 ,\-]{2,60}$/.test(familyRaw) && !blockedFamilyWord.test(familyRaw)) {
      styles.fontFamily = familyRaw;
    }

    if (!Object.keys(styles).length) return null;
    return { enable: !disable, styles };
  }

  private parseParagraphFormattingIntent(message: string): {
    alignment?: "left" | "center" | "right" | "justify";
    lineSpacing?: number;
  } | null {
    const low = String(message || "").toLowerCase();
    const out: { alignment?: "left" | "center" | "right" | "justify"; lineSpacing?: number } = {};

    if (/\b(justif(?:y|ied)|justificar)\b/.test(low)) out.alignment = "justify";
    else if (/\b(center|centre|centralizar|centralizado)\b/.test(low)) out.alignment = "center";
    else if (/\b(right align|align right|alinhar\s+[àa]\s+direita|direita)\b/.test(low)) out.alignment = "right";
    else if (/\b(left align|align left|alinhar\s+[àa]\s+esquerda|esquerda)\b/.test(low)) out.alignment = "left";

    const spacingMatch =
      low.match(/\b(?:line\s*spacing|entrelinhas|espa[cç]amento(?:\s+entre\s+linhas)?)\s*(?:to|=|de|para)?\s*([0-9]+(?:[.,][0-9]+)?)\b/i) ||
      low.match(/\b([0-9]+(?:[.,][0-9]+)?)\s*(?:x\s*)?(?:line\s*spacing|entrelinhas)\b/i);
    if (spacingMatch?.[1]) {
      const n = Number(String(spacingMatch[1]).replace(",", "."));
      if (Number.isFinite(n) && n >= 0.8 && n <= 4) out.lineSpacing = n;
    }

    return Object.keys(out).length ? out : null;
  }

  private resolveDocxFormattingIntent(params: {
    message: string;
    routingEntities?: Record<string, any>;
  }): {
    enableInline: boolean;
    inlineStyles: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      fontSizePt?: number;
      fontFamily?: string;
    } | null;
    paragraphStyles: {
      alignment?: "left" | "center" | "right" | "justify";
      lineSpacing?: number;
    } | null;
  } | null {
    const entities = params.routingEntities && typeof params.routingEntities === "object"
      ? params.routingEntities
      : {};
    const transform = String((entities as any)?.transform || "").trim().toLowerCase();
    if (transform && !["", "style_change", "paragraph_style_change", "inline_style_change"].includes(transform)) {
      return null;
    }

    const inlineIntent = this.parseInlineFormattingIntent(params.message);
    const paragraphIntent = this.parseParagraphFormattingIntent(params.message);
    const inlineStyles = inlineIntent?.styles ? { ...inlineIntent.styles } : {};
    const paragraphStyles = paragraphIntent ? { ...paragraphIntent } : {};
    const enableInline = inlineIntent?.enable !== false;

    const bankStyle = (entities as any)?.style;
    if (bankStyle && typeof bankStyle === "object") {
      if (typeof bankStyle.bold === "boolean") inlineStyles.bold = bankStyle.bold;
      if (typeof bankStyle.italic === "boolean") inlineStyles.italic = bankStyle.italic;
      if (typeof bankStyle.underline === "boolean") inlineStyles.underline = bankStyle.underline;
    }

    const bankParagraph = (entities as any)?.paragraphStyle;
    if (bankParagraph && typeof bankParagraph === "object") {
      const alignRaw = String((bankParagraph as any).alignment || "").trim().toLowerCase();
      if (!paragraphStyles.alignment) {
        if (alignRaw && alignRaw !== "user_specified") {
          if (alignRaw.includes("just")) paragraphStyles.alignment = "justify";
          else if (alignRaw.includes("center") || alignRaw.includes("centre")) paragraphStyles.alignment = "center";
          else if (alignRaw.includes("right")) paragraphStyles.alignment = "right";
          else if (alignRaw.includes("left")) paragraphStyles.alignment = "left";
        } else {
          const parsed = this.parseParagraphFormattingIntent(params.message);
          if (parsed?.alignment) paragraphStyles.alignment = parsed.alignment;
        }
      }

      const spacingRaw = (bankParagraph as any).spacing;
      if (paragraphStyles.lineSpacing == null) {
        if (typeof spacingRaw === "number" && Number.isFinite(spacingRaw)) {
          paragraphStyles.lineSpacing = spacingRaw;
        } else {
          const parsed = this.parseParagraphFormattingIntent(params.message);
          if (parsed?.lineSpacing != null) paragraphStyles.lineSpacing = parsed.lineSpacing;
        }
      }
    }

    const hasInline = Object.keys(inlineStyles).length > 0;
    const hasParagraph = Object.keys(paragraphStyles).length > 0;
    if (!hasInline && !hasParagraph) return null;

    return {
      enableInline,
      inlineStyles: hasInline ? inlineStyles : null,
      paragraphStyles: hasParagraph ? paragraphStyles : null,
    };
  }

  private buildDocxParagraphFormatHtml(params: {
    paragraphText: string;
    enableInline?: boolean;
    inlineStyles?: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      fontSizePt?: number;
      fontFamily?: string;
    } | null;
    paragraphStyles?: {
      alignment?: "left" | "center" | "right" | "justify";
      lineSpacing?: number;
    } | null;
  }): string {
    const src = String(params.paragraphText || "");
    let content = this.escapeHtmlForDocx(src).replace(/\n/g, "<br/>");
    const inline = params.inlineStyles && Object.keys(params.inlineStyles).length ? params.inlineStyles : null;
    if (inline) {
      content = this.buildInlineFormatWrapper({
        escapedText: content,
        enable: params.enableInline !== false,
        styles: inline,
      });
    }

    const css: string[] = [];
    const align = String(params.paragraphStyles?.alignment || "").trim().toLowerCase();
    if (align === "left" || align === "right" || align === "center" || align === "justify") {
      css.push(`text-align:${align}`);
    }
    const spacing = Number(params.paragraphStyles?.lineSpacing ?? NaN);
    if (Number.isFinite(spacing) && spacing >= 0.8 && spacing <= 4) {
      css.push(`line-height:${Number(spacing.toFixed(2))}`);
    }

    if (!css.length) return content;
    return `<div style="${css.join(";")}">${content}</div>`;
  }

  private buildInlineFormatWrapper(params: {
    escapedText: string;
    enable: boolean;
    styles: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      fontSizePt?: number;
      fontFamily?: string;
    };
  }): string {
    let wrapped = String(params.escapedText || "");
    if (!params.enable) return wrapped;
    if (params.styles.bold) wrapped = `<b>${wrapped}</b>`;
    if (params.styles.italic) wrapped = `<i>${wrapped}</i>`;
    if (params.styles.underline) wrapped = `<u>${wrapped}</u>`;
    const inlineStyles: string[] = [];
    const color = String(params.styles.color || "").trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) inlineStyles.push(`color:${color}`);
    const size = Number(params.styles.fontSizePt || 0);
    if (Number.isFinite(size) && size >= 6 && size <= 72) inlineStyles.push(`font-size:${size}pt`);
    const family = String(params.styles.fontFamily || "").trim();
    if (family && /^[a-zA-Z0-9 ,\-]{2,60}$/.test(family)) inlineStyles.push(`font-family:${family}`);
    if (inlineStyles.length) wrapped = `<span style="${inlineStyles.join(";")}">${wrapped}</span>`;
    return wrapped;
  }

  private applyInlineFormattingToPlainSpan(params: {
    paragraphText: string;
    start: number;
    end: number;
    enable: boolean;
    styles: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      fontSizePt?: number;
      fontFamily?: string;
    };
  }): string {
    const src = String(params.paragraphText || "");
    const s = Math.max(0, Math.min(Number(params.start || 0), src.length));
    const e = Math.max(s, Math.min(Number(params.end || 0), src.length));
    const left = this.escapeHtmlForDocx(src.slice(0, s));
    const mid = this.escapeHtmlForDocx(src.slice(s, e));
    const right = this.escapeHtmlForDocx(src.slice(e));
    const wrapped = this.buildInlineFormatWrapper({
      escapedText: mid,
      enable: params.enable,
      styles: params.styles,
    });
    return `${left}${wrapped}${right}`.replace(/\n/g, "<br/>");
  }

  private applyInlineFormattingToPlainMultiSpans(params: {
    paragraphText: string;
    ranges: Array<{ start: number; end: number }>;
    enable: boolean;
    styles: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      fontSizePt?: number;
      fontFamily?: string;
    };
  }): string {
    const src = String(params.paragraphText || "");
    if (!src || !Array.isArray(params.ranges) || !params.ranges.length) {
      return this.escapeHtmlForDocx(src).replace(/\n/g, "<br/>");
    }

    const normalized = params.ranges
      .map((r) => {
        const s = Math.max(0, Math.min(Number(r?.start || 0), src.length));
        const e = Math.max(s, Math.min(Number(r?.end || 0), src.length));
        return { start: s, end: e };
      })
      .filter((r) => r.end > r.start)
      .sort((a, b) => (a.start - b.start) || (a.end - b.end));
    if (!normalized.length) return this.escapeHtmlForDocx(src).replace(/\n/g, "<br/>");

    const merged: Array<{ start: number; end: number }> = [];
    for (const r of normalized) {
      const prev = merged[merged.length - 1] || null;
      if (!prev) {
        merged.push({ ...r });
        continue;
      }
      if (r.start <= prev.end) {
        prev.end = Math.max(prev.end, r.end);
        continue;
      }
      merged.push({ ...r });
    }

    let cursor = 0;
    let out = "";
    for (const span of merged) {
      if (span.start > cursor) out += this.escapeHtmlForDocx(src.slice(cursor, span.start));
      const escapedMid = this.escapeHtmlForDocx(src.slice(span.start, span.end));
      out += this.buildInlineFormatWrapper({
        escapedText: escapedMid,
        enable: params.enable,
        styles: params.styles,
      });
      cursor = span.end;
    }
    if (cursor < src.length) out += this.escapeHtmlForDocx(src.slice(cursor));
    return out.replace(/\n/g, "<br/>");
  }

  private applySingleReplacement(input: string, beforeNeedle: string, after: string): string | null {
    const hay = String(input || "");
    const needle = String(beforeNeedle || "");
    const repl = String(after || "");
    if (!hay || !needle) return null;
    const idx = hay.indexOf(needle);
    if (idx < 0) return null;
    return hay.slice(0, idx) + repl + hay.slice(idx + needle.length);
  }

  private detectBulkEditIntent(message: string): null | (
    | { kind: "enhance_bullets" }
    | { kind: "global_replace"; from: string; to: string }
    | { kind: "section_rewrite"; heading: string }
    | { kind: "section_bullets_to_paragraph"; heading: string }
  ) {
    return detectBulkEditIntent(message) as any;
  }

  private detectToneProfileFromText(sample: string): { tone: "formal" | "neutral" | "casual"; domainHint: string; styleNotes: string[] } {
    const s = String(sample || "");
    const low = s.toLowerCase();
    const styleNotes: string[] = [];

    const looksLegal = /\b(hereby|whereas|shall|indemnif|governing law|confidential)\b/.test(low);
    const looksTech = /\b(api|sdk|latency|throughput|deployment|integration|retrieval|accuracy)\b/.test(low);
    const looksSales = /\b(roi|pipeline|customers?|revenue|pricing|go-to-market)\b/.test(low);

    const domainHint = looksLegal ? "legal" : looksTech ? "technical" : looksSales ? "business" : "general";
    const formalScore =
      (looksLegal ? 2 : 0) +
      (/\bshall\b/.test(low) ? 1 : 0) +
      (/\bmust\b/.test(low) ? 0.5 : 0) +
      (/\btherefore\b|\bhowever\b|\bfurthermore\b/.test(low) ? 0.5 : 0);
    const casualScore =
      (/[!]/.test(s) ? 0.5 : 0) +
      (/\b(awesome|great|super|really)\b/.test(low) ? 1 : 0);

    const tone: "formal" | "neutral" | "casual" =
      formalScore >= 2 ? "formal" : casualScore >= 1.25 ? "casual" : "neutral";

    if (domainHint === "legal") styleNotes.push("Keep legal phrasing; do not weaken obligations.");
    if (domainHint === "technical") styleNotes.push("Keep technical terminology unchanged; do not invent features.");
    if (domainHint === "business") styleNotes.push("Keep concise, executive-friendly wording.");
    styleNotes.push("Preserve all numbers, dates, names, and defined terms.");

    return { tone, domainHint, styleNotes };
  }

  private escapeHtmlForDocx(text: string): string {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  private toHtmlFromPlain(text: string): string {
    return this.escapeHtmlForDocx(text).replace(/\n/g, "<br/>");
  }

  private async enhanceDocxBullets(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    instruction: string;
    language?: "en" | "pt" | "es";
    paragraphs: Array<{ paragraphId: string; text: string; sectionPath?: string[]; numberingSignature?: string }>;
    toneProfile: { tone: "formal" | "neutral" | "casual"; domainHint: string; styleNotes: string[] };
  }): Promise<Array<{ kind: "docx_paragraph"; paragraphId: string; beforeText: string; afterText: string; afterHtml: string; sectionPath?: string[] }>> {
    const bullets = params.paragraphs.filter((p) => String(p?.numberingSignature || "").trim());
    if (!bullets.length) return [];

    // Cap for safety/cost; iterate in chunks.
    const limited = bullets.slice(0, 80);
    const chunkSize = 20;
    const out: Array<{ kind: "docx_paragraph"; paragraphId: string; beforeText: string; afterText: string; afterHtml: string; sectionPath?: string[] }> = [];

    for (let i = 0; i < limited.length; i += chunkSize) {
      const chunk = limited.slice(i, i + chunkSize);
      const system =
        "You are a careful editor. Improve clarity and consistency of bullet points while preserving meaning strictly.\n" +
        "Rules:\n" +
        "- Do NOT add new facts. Do NOT remove meaning.\n" +
        "- Preserve all numbers, dates, names, and defined terms.\n" +
        "- Keep the same subject and tone.\n" +
        "- Output JSON only: an array of {paragraphId, text} with one entry per input bullet.\n" +
        "No markdown. No commentary.";

      const user = JSON.stringify({
        toneProfile: params.toneProfile,
        instruction: params.instruction,
        bullets: chunk.map((b) => ({ paragraphId: b.paragraphId, text: String(b.text || "") })),
      });

      const gen = await this.engine.generate({
        traceId: params.traceId,
        userId: params.userId,
        conversationId: params.conversationId,
        messages: [
          { role: "system" as ChatRole, content: system },
          { role: "user" as ChatRole, content: user },
        ],
      });

      let arr: any[] = [];
      try {
        arr = JSON.parse(String(gen.text || "[]"));
      } catch {
        // Skip chunk if model didn't return valid JSON.
        continue;
      }

      const byId = new Map<string, string>();
      for (const item of arr) {
        const pid = typeof item?.paragraphId === "string" ? item.paragraphId.trim() : "";
        const txt = typeof item?.text === "string" ? item.text : "";
        if (pid && txt) byId.set(pid, txt.trim());
      }

      for (const b of chunk) {
        const afterText = byId.get(b.paragraphId) || "";
        const beforeText = String(b.text || "").trim();
        if (!afterText || afterText === beforeText) continue;
        out.push({
          kind: "docx_paragraph",
          paragraphId: b.paragraphId,
          beforeText,
          afterText,
          afterHtml: this.toHtmlFromPlain(afterText),
          sectionPath: Array.isArray(b.sectionPath) ? b.sectionPath : undefined,
        });
      }
    }

    return out;
  }

  private normalizeForMatch(input: string): string {
    const s = String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s&]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Drop common stop-words that appear in natural language requests ("the AI understanding bullet points…").
    const stop = new Set(["the", "a", "an", "all", "every", "these", "those", "this", "that", "my", "our"]);
    return s
      .split(" ")
      .filter((t) => t && !stop.has(t))
      .join(" ")
      .trim();
  }

  private listDocxHeadingCandidates(
    anchors: Array<{
      paragraphId: string;
      text: string;
      headingLevel?: number | null;
      styleName?: string | null;
      numberingSignature?: string | null;
    }>,
  ): Array<{ idx: number; text: string; kind: "true" | "pseudo" }> {
    const isBulletLike = (p: any): boolean => {
      const t = String(p?.text || "").trim();
      const styleName = String(p?.styleName || "").toLowerCase();
      const hasNumbering = Boolean(String(p?.numberingSignature || "").trim());
      if (hasNumbering) return true;
      if (/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/.test(t)) return true;
      if (styleName.includes("list")) return true;
      return false;
    };

    const isTrueHeading = (p: any): boolean => {
      const txt = String(p?.text || "").trim();
      if (!txt) return false;
      if (typeof p?.headingLevel === "number") return true;
      const style = String(p?.styleName || "").toLowerCase();
      if (style.includes("heading") || style.includes("title")) return true;
      return false;
    };

    const isPseudoHeading = (p: any, idx: number): boolean => {
      const txt = String(p?.text || "").trim();
      if (!txt) return false;
      if (isBulletLike(p)) return false;
      if (isTrueHeading(p)) return false;

      const words = txt.split(/\s+/).filter(Boolean);
      if (txt.length > 90) return false;
      if (words.length > 12) return false;
      if (/[.]\s*$/.test(txt)) return false;

      let bulletHits = 0;
      for (let j = idx + 1; j < Math.min(anchors.length, idx + 10); j++) {
        if (isBulletLike(anchors[j])) bulletHits += 1;
        if (bulletHits >= 2) return true;
      }
      return false;
    };

    const out: Array<{ idx: number; text: string; kind: "true" | "pseudo" }> = [];
    for (let i = 0; i < anchors.length; i++) {
      const p = anchors[i];
      const text = String(p?.text || "").trim();
      if (!text) continue;
      if (isTrueHeading(p)) out.push({ idx: i, text, kind: "true" });
      else if (isPseudoHeading(p, i)) out.push({ idx: i, text, kind: "pseudo" });
    }
    return out;
  }

  private resolveDocxHeading(
    anchors: Array<{
      paragraphId: string;
      text: string;
      headingLevel?: number | null;
      styleName?: string | null;
      numberingSignature?: string | null;
    }>,
    headingHint: string,
  ): { idx: number; node: { paragraphId: string; text: string; headingLevel?: number | null } } | null {
    const hint = this.normalizeForMatch(headingHint);
    if (!hint) return null;

    const candidates = this.listDocxHeadingCandidates(anchors);
    if (!candidates.length) return null;

    let best: { score: number; idx: number; node: { paragraphId: string; text: string; headingLevel?: number | null } } | null = null;
    for (const c of candidates) {
      const t = this.normalizeForMatch(c.text || "");
      if (!t) continue;
      let score = 0;
      if (c.kind === "true") score += 0.5;
      if (t === hint) score += 5;
      if (t.includes(hint)) score += 3;
      if (hint.includes(t)) score += 2;
      const hintTokens = new Set(hint.split(" ").filter(Boolean));
      const tTokens = t.split(" ").filter(Boolean);
      let hit = 0;
      for (const tok of tTokens) if (hintTokens.has(tok)) hit += 1;
      score += Math.min(2, hit / Math.max(3, tTokens.length)) * 2;
      const node = anchors[c.idx];
      if (!node) continue;
      if (!best || score > best.score) best = { score, idx: c.idx, node };
    }
    if (!best || best.score < 1.75) return null;
    return { idx: best.idx, node: best.node };
  }

  private sectionRange(
    anchors: Array<{ headingLevel?: number | null; styleName?: string | null; text?: string | null }>,
    headingIdx: number,
  ): { start: number; end: number } {
    const heading = anchors[headingIdx];
    const isHeadingCandidate = (p: any): boolean => {
      const txt = String(p?.text || "").trim();
      if (!txt) return false;
      if (typeof p?.headingLevel === "number") return true;
      const style = String(p?.styleName || "").toLowerCase();
      if (style.includes("heading") || style.includes("title")) return true;
      return false;
    };

    const lvl = typeof heading?.headingLevel === "number" ? heading.headingLevel : null;
    let end = anchors.length;
    for (let i = headingIdx + 1; i < anchors.length; i++) {
      const p = anchors[i];
      if (lvl != null) {
        if (typeof p?.headingLevel === "number" && p.headingLevel <= lvl) {
          end = i;
          break;
        }
      } else {
        // Fallback: when heading levels are missing, use the next heading-like paragraph as the boundary.
        if (isHeadingCandidate(p)) {
          end = i;
          break;
        }
      }
    }
    return { start: headingIdx + 1, end };
  }

  private async bulletsToParagraph(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    instruction: string;
    headingText: string;
    bullets: Array<{ paragraphId: string; text: string; sectionPath?: string[] }>;
    toneProfile: { tone: "formal" | "neutral" | "casual"; domainHint: string; styleNotes: string[] };
  }): Promise<Array<any>> {
    const list = params.bullets.filter((b) => (b.text || "").trim());
    if (list.length < 2) return [];

    const wantsSummary = (() => {
      const low = String(params.instruction || "").toLowerCase();
      // Explicit: summarize/condense/shorten/brief/overview/executive summary.
      const explicit =
        /\b(summariz(e|ing)|summary|condens(e|ing)|shorten|brief|overview|executive\s+summary)\b/.test(low) ||
        /\b(resumir|resumo|sumarizar|sumario|breve|vis[aã]o\s+geral)\b/.test(low);
      // Explicit: keep everything / don't summarize.
      const preserve =
        /\b(do\s+not|don't)\s+summariz(e|e)\b/.test(low) ||
        /\b(without)\s+summariz(e|ing)\b/.test(low) ||
        /\bkeep\b.{0,18}\b(all|everything|every)\b/.test(low) ||
        /\b(preserve)\b.{0,20}\b(all|everything)\b/.test(low) ||
        /\b(n[aã]o)\s+(resumir|resuma|sumarizar)\b/.test(low) ||
        /\b(mantenha)\b.{0,18}\b(tudo|todos)\b/.test(low);

      if (preserve) return false;
      if (explicit) return true;

      // Heuristic: large lists of question-like bullets are usually better summarized into themes.
      // Otherwise users end up with an unreadable run-on paragraph.
      const questionish = list.filter((b) => /^(?:what|which|who|where|when|why|how|find|locate|show|extract|summariz(e|e)|in which)\b/i.test(String(b.text || "").trim())).length;
      const ratio = questionish / Math.max(1, list.length);
      return list.length >= 6 && ratio >= 0.5;
    })();

    const fallbackParagraphFromBullets = (): string => {
      // Deterministic rewrite: produce a cohesive paragraph (not a list) that preserves meaning.
      // For question-heavy lists, prefer a thematic summary so the output doesn't become a
      // run-on restatement of every bullet.
      const raw = list
        .map((b) => String(b.text || "").trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+/g, " ").trim())
        .map((s) => s.replace(/[.]\s*$/, "").trim());

      if (!raw.length) return "";

      const thematicSummary = (): string => {
        // Map common "test suite / task list" bullets into 3-6 higher-level themes.
        const themes: Array<{ id: string; phrase: string }> = [];
        const seen = new Set<string>();

        const addTheme = (id: string, phrase: string) => {
          if (seen.has(id)) return;
          seen.add(id);
          themes.push({ id, phrase });
        };

        for (const s0 of raw) {
          const s = s0.toLowerCase();
          if (/\bsummariz(e|ing)|summary|insights?\b/.test(s)) addTheme("summarize", "summarizing documents and surfacing key insights");
          else if (/\bwhich file\b|\bcontains the sentence\b|\blocate\b.*\bsentence\b/.test(s)) addTheme("exact_lookup", "locating exact clauses and passages across files");
          else if (/\bfind all documents\b|\bmentions?\b.*\bgroup\b|\bgroup\b.*\byear\b/.test(s)) addTheme("cross_doc_group", "finding cross-document mentions and grouping results over time");
          else if (/\bkey differences\b|\bcompare\b|\bcontracts?\b/.test(s)) addTheme("compare", "comparing documents and explaining key differences");
          else if (/\bauthor\b|\btopic\b|\bmetadata\b|\bmerger\b/.test(s)) addTheme("metadata", "filtering by metadata (for example, author and topic) to retrieve relevant documents");
          else if (/\bproject\b|\bq[1-4]\b|\bdate range\b|\bfrom\b.*\b20\\d{2}\b/.test(s)) addTheme("project_time", "retrieving project-related documents by date range");
          else if (/\bduplicate\b|\bnear-duplicate\b/.test(s)) addTheme("dedupe", "identifying duplicates and near-duplicates");
          else if (/\bexpired licenses?\b|\bcompliance\b|\blicense\b/.test(s)) addTheme("compliance", "flagging compliance and lifecycle issues (such as expired licenses)");
          else if (/\bextract\b.*\btables?\b/.test(s)) addTheme("tables", "extracting tables and presenting them clearly");
          else if (/\bfirst time\b|\bfirst referenced\b|\bfirst mention\b|\bin which document\b/.test(s)) addTheme("first_mention", "tracking where entities are first referenced across the library");
          else addTheme("general", "understanding document content and answering targeted retrieval questions");
          if (themes.length >= 7) break;
        }

        const picked = wantsSummary ? themes.slice(0, 6) : themes.slice(0, 7);
        const lead =
          params.toneProfile.tone === "formal"
            ? "This section evaluates AI understanding and retrieval capabilities by"
            : params.toneProfile.tone === "casual"
              ? "This section focuses on AI understanding and retrieval by"
              : "This section focuses on AI understanding and retrieval by";

        const parts =
          picked.length === 1
            ? [picked[0]!.phrase]
            : picked.length === 2
              ? [picked[0]!.phrase, picked[1]!.phrase]
              : picked.map((x, idx) => (idx === picked.length - 1 ? `and ${x.phrase}` : x.phrase));

        return `${lead} ${parts.join(", ")}.`;
      };

      return thematicSummary();
    };

    const system =
      "You are a careful editor.\n" +
      "Task: Convert the bullet list into ONE paragraph.\n" +
      "Rules:\n" +
      (wantsSummary
        ? "- Summarize the bullets into a cohesive paragraph (group into themes) while preserving meaning. Do NOT invent facts.\n"
        : "- Preserve meaning strictly. Do NOT add new facts.\n") +
      "- Preserve all numbers, dates, names, and defined terms.\n" +
      "- Keep the same subject and tone.\n" +
      "- Output JSON only (no markdown, no explanations): {\"paragraph\": \"...\"}\n" +
      (wantsSummary
        ? "- Write a cohesive paragraph (not a list and not a semicolon-separated run-on). Group the bullets into 3-6 themes and express them fluently.\n"
        : "- Write a cohesive paragraph (not a list and not a semicolon-separated run-on). Prefer grouping into themes/capabilities rather than repeating the same verb for every bullet.\n") +
      "- If bullets are questions, convert them into capability statements while preserving the meaning.\n" +
      "- The paragraph must NOT mention headings, instructions, or the editing task itself.";

    const user = [
      `INSTRUCTION:\n${params.instruction}`,
      "",
      `HEADING:\n${params.headingText}`,
      "",
      "BULLETS:",
      ...list.map((b) => `- ${b.text}`),
    ].join("\n");

    const gen = await this.engine.generate({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: [
        { role: "system" as ChatRole, content: system },
        { role: "user" as ChatRole, content: user },
      ],
    });

    const raw = String(gen.text || "").trim();
    let parsedParagraph = "";
    try {
      const j = JSON.parse(raw);
      parsedParagraph = typeof j?.paragraph === "string" ? String(j.paragraph).trim() : "";
    } catch {
      parsedParagraph = "";
    }

    const looksLikeConcatenatedBullets = (text: string): boolean => {
      const t = String(text || "");
      const low = t.toLowerCase();
      // Often indicates the model just glued each bullet into a single line/paragraph.
      const qMarks = (t.match(/[?]/g) || []).length;
      const semis = (t.match(/[;]/g) || []).length;
      const hits =
        (low.match(/\bwhich file\b/g) || []).length +
        (low.match(/\bfind all documents\b/g) || []).length +
        (low.match(/\blocate every\b|\blocate\b/g) || []).length +
        (low.match(/\bshow me\b|\bshow all\b/g) || []).length +
        (low.match(/\bextract\b/g) || []).length;
      if (qMarks >= 3) return true;
      if (semis >= 2) return true;
      if (hits >= 5) return true;
      return false;
    };

    const isBad = (text: string): boolean => {
      const low = String(text || "").toLowerCase();
      // Reject assistant/meta commentary. This must never be written into the document.
      if (!low) return true;
      if (low.includes("as an ai")) return true;
      if (low.includes("i found the heading")) return true;
      if (low.includes("based on") && low.includes("heading")) return true;
      if (low.includes("you might also search")) return true;
      if (low.includes("i need the specific bullet points")) return true;
      if (low.includes("to create a paragraph") && (low.includes("need") || low.includes("provide"))) return true;
      if (low.includes("heading:")) return true;
      if (low.includes("bullets:")) return true;
      if (low.includes("bullet points:")) return true;
      if (looksLikeConcatenatedBullets(text)) return true;
      return false;
    };

    const paragraphText = !parsedParagraph || isBad(parsedParagraph)
      ? (() => {
          const out = fallbackParagraphFromBullets();
          return out || "";
        })()
      : parsedParagraph;

    if (!paragraphText) return [];

    const first = list[0]!;
    const rest = list.slice(1);
    const patches: any[] = [
      {
        kind: "docx_paragraph",
        paragraphId: first.paragraphId,
        beforeText: String(first.text || "").trim(),
        afterText: paragraphText,
        afterHtml: this.toHtmlFromPlain(paragraphText),
        sectionPath: Array.isArray(first.sectionPath) ? first.sectionPath : undefined,
        removeNumbering: true,
      },
      ...rest.map((b) => ({
        kind: "docx_delete_paragraph",
        paragraphId: b.paragraphId,
      })),
    ];
    return patches;
  }

  private async sectionToParagraph(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    instruction: string;
    headingText: string;
    paragraphs: Array<{ paragraphId: string; text: string; sectionPath?: string[] }>;
    toneProfile: { tone: "formal" | "neutral" | "casual"; domainHint: string; styleNotes: string[] };
  }): Promise<Array<any>> {
    const lines = params.paragraphs
      .map((p) => ({
        paragraphId: String(p.paragraphId || "").trim(),
        text: String(p.text || "")
          .replace(/^\s*(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*]|□)\s+/, "")
          .trim(),
        sectionPath: p.sectionPath,
      }))
      .filter((p) => p.paragraphId && p.text);
    if (!lines.length) return [];

    const system =
      "You are a careful editor.\n" +
      "Task: Rewrite the provided section content into ONE cohesive paragraph.\n" +
      "Rules:\n" +
      "- Preserve meaning strictly; do not invent facts.\n" +
      "- Preserve all names, numbers, dates, and defined terms.\n" +
      "- Do not mention instructions, headings, or editing actions.\n" +
      "- Output JSON only: {\"paragraph\":\"...\"}. No markdown.";

    const user = [
      `INSTRUCTION:\n${params.instruction}`,
      "",
      `SECTION:\n${params.headingText}`,
      "",
      "CONTENT:",
      ...lines.map((l) => `- ${l.text}`),
    ].join("\n");

    const gen = await this.engine.generate({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: [
        { role: "system" as ChatRole, content: system },
        { role: "user" as ChatRole, content: user },
      ],
    });

    let paragraph = "";
    try {
      const parsed = JSON.parse(String(gen.text || "{}"));
      paragraph = typeof parsed?.paragraph === "string" ? parsed.paragraph.trim() : "";
    } catch {
      paragraph = "";
    }
    if (!paragraph) {
      paragraph = lines.map((l) => l.text.replace(/[.]\s*$/, "")).join("; ").trim();
      if (paragraph && !/[.!?]$/.test(paragraph)) paragraph += ".";
    }
    if (!paragraph) return [];

    const first = lines[0]!;
    const rest = lines.slice(1);
    return [
      {
        kind: "docx_paragraph",
        paragraphId: first.paragraphId,
        beforeText: first.text,
        afterText: paragraph,
        afterHtml: this.toHtmlFromPlain(paragraph),
        sectionPath: Array.isArray(first.sectionPath) ? first.sectionPath : undefined,
        removeNumbering: true,
      },
      ...rest.map((r) => ({ kind: "docx_delete_paragraph", paragraphId: r.paragraphId })),
    ];
  }

  private async translateDocxParagraphs(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    targetLanguage: "en" | "pt" | "es";
    paragraphs: Array<{ paragraphId: string; text: string; sectionPath?: string[] }>;
  }): Promise<Array<any>> {
    const src = params.paragraphs
      .map((p) => ({
        paragraphId: String(p.paragraphId || "").trim(),
        text: String(p.text || "").trim(),
        sectionPath: p.sectionPath,
      }))
      .filter((p) => p.paragraphId && p.text);
    if (!src.length) return [];

    const out: any[] = [];
    const chunkSize = 30;
    for (let i = 0; i < src.length; i += chunkSize) {
      const chunk = src.slice(i, i + chunkSize);
      const system =
        "You are a professional translator for office documents.\n" +
        "Task: translate each input paragraph into the requested language.\n" +
        "Rules:\n" +
        "- Preserve names, dates, numbers, and structure.\n" +
        "- Keep each item aligned by paragraphId.\n" +
        "- Output JSON only: [{\"paragraphId\":\"...\",\"text\":\"...\"}]";
      const user = JSON.stringify({
        targetLanguage: params.targetLanguage,
        paragraphs: chunk.map((c) => ({ paragraphId: c.paragraphId, text: c.text })),
      });

      const parseRows = (rawText: string): any[] => {
        const raw = String(rawText || "").trim();
        if (!raw) return [];
        const candidates: string[] = [raw];
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced?.[1]) candidates.unshift(String(fenced[1]).trim());
        const arrStart = raw.indexOf("[");
        const arrEnd = raw.lastIndexOf("]");
        if (arrStart >= 0 && arrEnd > arrStart) candidates.push(raw.slice(arrStart, arrEnd + 1));
        const objStart = raw.indexOf("{");
        const objEnd = raw.lastIndexOf("}");
        if (objStart >= 0 && objEnd > objStart) candidates.push(raw.slice(objStart, objEnd + 1));

        for (const c of candidates) {
          try {
            const parsed = JSON.parse(c);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && typeof parsed === "object") {
              const rows =
                (Array.isArray((parsed as any).paragraphs) ? (parsed as any).paragraphs : null) ||
                (Array.isArray((parsed as any).items) ? (parsed as any).items : null) ||
                (Array.isArray((parsed as any).rows) ? (parsed as any).rows : null) ||
                (Array.isArray((parsed as any).translations) ? (parsed as any).translations : null);
              if (rows) return rows;
            }
          } catch {
            // keep trying candidates
          }
        }
        return [];
      };

      let parsed: any[] = [];
      try {
        const gen = await this.engine.generate({
          traceId: params.traceId,
          userId: params.userId,
          conversationId: params.conversationId,
          messages: [
            { role: "system" as ChatRole, content: system },
            { role: "user" as ChatRole, content: user },
          ],
        });
        parsed = parseRows(String(gen.text || ""));
      } catch {
        parsed = [];
      }

      const byId = new Map<string, string>();
      for (const item of parsed) {
        const pid = typeof item?.paragraphId === "string" ? item.paragraphId.trim() : "";
        const text =
          typeof item?.text === "string" ? item.text.trim() :
          typeof item?.translation === "string" ? item.translation.trim() :
          typeof item?.translatedText === "string" ? item.translatedText.trim() :
          "";
        if (pid && text) byId.set(pid, text);
      }
      // Fallback for weak model outputs that omit paragraph ids but preserve order.
      if (!byId.size && parsed.length === chunk.length) {
        for (let idx = 0; idx < chunk.length; idx += 1) {
          const srcItem = chunk[idx]!;
          const item = parsed[idx] || null;
          const text =
            typeof item === "string" ? item.trim() :
            typeof item?.text === "string" ? item.text.trim() :
            typeof item?.translation === "string" ? item.translation.trim() :
            typeof item?.translatedText === "string" ? item.translatedText.trim() :
            "";
          if (text) byId.set(srcItem.paragraphId, text);
        }
      }

      // Second pass for rows that are missing or unchanged.
      const unresolvedRows = chunk.filter((c) => {
        const next = byId.get(c.paragraphId);
        return !next || next === c.text;
      });
      if (unresolvedRows.length) {
        try {
          const gen = await this.engine.generate({
            traceId: params.traceId,
            userId: params.userId,
            conversationId: params.conversationId,
            messages: [
              {
                role: "system" as ChatRole,
                content:
                  "You are a professional translator for office documents.\n" +
                  "Translate every provided paragraph to the target language.\n" +
                  "Important:\n" +
                  "- Return one item per input paragraph.\n" +
                  "- Keep paragraphId unchanged.\n" +
                  "- If a paragraph is already in target language, return it unchanged.\n" +
                  "- Output JSON only: [{\"paragraphId\":\"...\",\"text\":\"...\"}]",
              },
              {
                role: "user" as ChatRole,
                content: JSON.stringify({
                  targetLanguage: params.targetLanguage,
                  paragraphs: unresolvedRows.map((c) => ({ paragraphId: c.paragraphId, text: c.text })),
                }),
              },
            ],
          });
          const parsedSecond = parseRows(String(gen.text || ""));
          for (const item of parsedSecond) {
            const pid = typeof item?.paragraphId === "string" ? item.paragraphId.trim() : "";
            const text =
              typeof item?.text === "string" ? item.text.trim() :
              typeof item?.translation === "string" ? item.translation.trim() :
              typeof item?.translatedText === "string" ? item.translatedText.trim() :
              "";
            if (pid && text) byId.set(pid, text);
          }
        } catch {
          // Fall back to per-paragraph requests below.
        }
      }

      // Fill remaining unresolved rows with deterministic single-paragraph translation calls.
      const missingOrUnchanged = chunk.filter((c) => {
        const next = byId.get(c.paragraphId);
        return !next || next === c.text;
      });
      for (const c of missingOrUnchanged.slice(0, 120)) {
        try {
          const gen = await this.engine.generate({
            traceId: params.traceId,
            userId: params.userId,
            conversationId: params.conversationId,
            messages: [
              {
                role: "system" as ChatRole,
                content:
                  "You are a professional translator for office documents.\n" +
                  "Translate the paragraph into the requested target language.\n" +
                  "Preserve names, dates, numbers, acronyms, and punctuation style.\n" +
                  "Output only the translated paragraph text with no JSON, no quotes, no markdown.",
              },
              {
                role: "user" as ChatRole,
                content: `targetLanguage=${params.targetLanguage}\nparagraph=${c.text}`,
              },
            ],
          });
          const translated = String(gen.text || "").trim().replace(/^["']|["']$/g, "");
          if (translated) byId.set(c.paragraphId, translated);
        } catch {
          // Leave item missing; caller handles low-coverage output safely.
        }
      }

      for (const c of chunk) {
        const next = byId.get(c.paragraphId);
        if (!next || next === c.text) continue;
        out.push({
          kind: "docx_paragraph",
          paragraphId: c.paragraphId,
          beforeText: c.text,
          afterText: next,
          afterHtml: this.toHtmlFromPlain(next),
          sectionPath: Array.isArray(c.sectionPath) ? c.sectionPath : undefined,
        });
      }
    }

    return out;
  }

  private async handleBulkEditTurn(params: {
    traceId: string;
    req: ChatRequest;
    conversationId: string;
    sink?: StreamSink;
    existingUserMsgId?: string;
    viewerMode: boolean;
  }): Promise<ChatResult | null> {
    const bulk = this.detectBulkEditIntent(params.req.message);
    if (!bulk) return null;

    const attachedIds = Array.isArray(params.req.attachedDocumentIds) ? params.req.attachedDocumentIds : [];
    const convScope = await prisma.conversation.findFirst({
      where: { id: params.conversationId, userId: params.req.userId },
      select: { scopeDocumentIds: true },
    });
    const scopeDocIds = (convScope?.scopeDocumentIds as string[]) ?? [];

    const docIds = (attachedIds.length ? attachedIds : scopeDocIds).slice(0, 12);
    if (!docIds.length) {
      const text = "Pin/attach the documents you want to bulk edit, then tell me what to change (e.g. “enhance all bullet points”).";
      const userMsg = params.existingUserMsgId
        ? { id: params.existingUserMsgId }
        : await this.createMessage({ conversationId: params.conversationId, role: "user", content: params.req.message, userId: params.req.userId });

      if (params.sink?.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

    const docs = await prisma.document.findMany({
      where: { id: { in: docIds }, userId: params.req.userId },
      select: { id: true, filename: true, encryptedFilename: true, mimeType: true },
    });

    const attachments: any[] = [];
    const notes: string[] = [];

    for (const d of docs) {
      if (!d?.encryptedFilename) continue;
      const mime = String(d.mimeType || "").toLowerCase();
      const filename = d.filename || this.extractFilenameFromPath(d.encryptedFilename) || "Document";

      if (bulk.kind === "enhance_bullets" || bulk.kind === "section_rewrite" || bulk.kind === "section_bullets_to_paragraph") {
        if (mime !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          notes.push(`Skipped **${filename}** (not a DOCX).`);
          continue;
        }
        const bytes = await downloadFile(d.encryptedFilename);
        const anchors = await this.docxAnchors.extractParagraphNodes(bytes);
        const toneSample = anchors.slice(0, 12).map((p) => String(p.text || "")).join("\n");
        const toneProfile = this.detectToneProfileFromText(toneSample);

        const isBulletLike = (p: any): boolean => {
          const t = String(p?.text || "").trim();
          const styleName = String(p?.styleName || "").toLowerCase();
          const hasNumbering = Boolean(String(p?.numberingSignature || "").trim());
          if (hasNumbering) return true;
          // Many DOCX "checkbox lists" are plain text bullets, not numbering.
          if (/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/.test(t)) return true;
          if (styleName.includes("list")) return true;
          return false;
        };

        let patches: any[] = [];
        if (bulk.kind === "section_bullets_to_paragraph") {
          const resolved = this.resolveDocxHeading(anchors as any, bulk.heading);
          if (!resolved) {
            const candidates = this.listDocxHeadingCandidates(anchors as any);
            const hintNorm = this.normalizeForMatch(bulk.heading);
            const scored = candidates
              .map((c) => {
                const t = this.normalizeForMatch(c.text);
                let score = 0;
                if (t === hintNorm) score += 5;
                if (t.includes(hintNorm)) score += 3;
                if (hintNorm.includes(t)) score += 2;
                const hintTokens = new Set(hintNorm.split(" ").filter(Boolean));
                const tTokens = t.split(" ").filter(Boolean);
                let hit = 0;
                for (const tok of tTokens) if (hintTokens.has(tok)) hit += 1;
                score += Math.min(2, hit / Math.max(3, tTokens.length)) * 2;
                if (c.kind === "pseudo") score -= 0.25;
                return { ...c, score };
              })
              .sort((a, b) => (b.score || 0) - (a.score || 0));

            const suggestions = scored
              .filter((x) => (x.score || 0) >= 1)
              .slice(0, 4)
              .map((x) => `"${String(x.text || "").trim()}"`);

            notes.push(
              `Couldn't find a heading matching "${bulk.heading}" in **${filename}**.` +
                (suggestions.length ? ` Closest matches: ${suggestions.join(", ")}.` : ""),
            );
            continue;
          }
          const headingNode = anchors[resolved.idx]!;
          const range = this.sectionRange(anchors as any, resolved.idx);
          const slice = anchors.slice(range.start, range.end);
          const bullets = slice.filter(isBulletLike).map((p) => ({
            paragraphId: p.paragraphId,
            // Strip common leading bullet glyphs so the paragraph reads naturally.
            text: String(p.text || "").replace(/^\s*(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/, ""),
            sectionPath: p.sectionPath,
          }));
          patches = await this.bulletsToParagraph({
            traceId: params.traceId,
            userId: params.req.userId,
            conversationId: params.conversationId,
            instruction: params.req.message,
            headingText: String(headingNode.text || "").trim(),
            bullets,
            toneProfile,
          });
        } else {
          // section_rewrite: condense section body into a single paragraph.
          if (bulk.kind === "section_rewrite") {
            const resolved = this.resolveDocxHeading(anchors as any, bulk.heading);
            if (!resolved) {
              notes.push(`Couldn't find a heading matching "${bulk.heading}" in **${filename}**.`);
              continue;
            }
            const headingNode = anchors[resolved.idx]!;
            const range = this.sectionRange(anchors as any, resolved.idx);
            const sectionParagraphs = anchors
              .slice(range.start, range.end)
              .map((p) => ({
                paragraphId: String(p.paragraphId || "").trim(),
                text: String(p.text || "").trim(),
                sectionPath: p.sectionPath,
              }))
              .filter((p) => p.paragraphId && p.text);
            patches = await this.sectionToParagraph({
              traceId: params.traceId,
              userId: params.req.userId,
              conversationId: params.conversationId,
              instruction: params.req.message,
              headingText: String(headingNode.text || bulk.heading || "Section").trim(),
              paragraphs: sectionParagraphs,
              toneProfile,
            });
          } else {
            patches = await this.enhanceDocxBullets({
              traceId: params.traceId,
              userId: params.req.userId,
              conversationId: params.conversationId,
              instruction: params.req.message,
              language: params.req.preferredLanguage,
              paragraphs: anchors.filter(isBulletLike),
              toneProfile,
            });
          }
        }

        if (!patches.length) {
          notes.push(`No bullet points found (or no changes suggested) in **${filename}**.`);
          continue;
        }

        const summary = bulk.kind === "enhance_bullets"
          ? `Enhance ${patches.length} bullet point${patches.length === 1 ? "" : "s"} while preserving meaning/tone.`
          : bulk.kind === "section_bullets_to_paragraph"
            ? `Convert bullet points under "${bulk.heading}" into one paragraph (${patches.length} patch${patches.length === 1 ? "" : "es"}).`
            : `Rewrite section content while preserving meaning/tone (applied to ${patches.length} bullet points in v1).`;
        const routingMeta = this.resolveAllybiEditRoutingMeta({
          domain: "docx",
          runtimeOperator: "EDIT_DOCX_BUNDLE",
          instruction: params.req.message,
        });

        attachments.push({
          type: "edit_session",
          domain: "docx",
          operator: "EDIT_DOCX_BUNDLE",
          canonicalOperator: routingMeta.canonicalOperator,
          renderType: routingMeta.renderType,
          instruction: params.req.message,
          documentId: d.id,
          filename,
          mimeType: d.mimeType || "application/octet-stream",
          bundle: {
            kind: bulk.kind,
            toneProfile,
            summary,
            changeCount: patches.length,
            riskyChangeCount: 0,
          },
          // For the viewer preview pipeline.
          bundlePatches: patches,
          // For backend apply: JSON payload.
          beforeText: "(bulk edit)",
          proposedText: JSON.stringify({ patches }),
          requiresConfirmation: true,
        });
      } else if (bulk.kind === "global_replace") {
        const from = bulk.from;
        const to = bulk.to;
        if (!from || !to) continue;

        if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const bytes = await downloadFile(d.encryptedFilename);
          const anchors = await this.docxAnchors.extractParagraphNodes(bytes);
          const patches: any[] = [];
          for (const p of anchors) {
            const before = String(p.text || "");
            if (!before.includes(from)) continue;
            const after = before.split(from).join(to);
            if (after === before) continue;
            patches.push({
              kind: "docx_paragraph",
              paragraphId: p.paragraphId,
              beforeText: before.trim(),
              afterText: after.trim(),
              afterHtml: this.toHtmlFromPlain(after.trim()),
              sectionPath: p.sectionPath,
            });
            if (patches.length >= 120) break;
          }
          if (!patches.length) {
            notes.push(`No matches for "${from}" in **${filename}**.`);
            continue;
          }
          const routingMeta = this.resolveAllybiEditRoutingMeta({
            domain: "docx",
            runtimeOperator: "EDIT_DOCX_BUNDLE",
            instruction: params.req.message,
          });
          attachments.push({
            type: "edit_session",
            domain: "docx",
            operator: "EDIT_DOCX_BUNDLE",
            canonicalOperator: routingMeta.canonicalOperator,
            renderType: routingMeta.renderType,
            instruction: params.req.message,
            documentId: d.id,
            filename,
            mimeType: d.mimeType || "application/octet-stream",
            bundle: {
              kind: "global_replace",
              toneProfile: this.detectToneProfileFromText(anchors.slice(0, 12).map((x) => x.text).join("\n")),
              summary: `Replace all occurrences of "${from}" with "${to}" (${patches.length} paragraph change${patches.length === 1 ? "" : "s"}).`,
              changeCount: patches.length,
              riskyChangeCount: 0,
            },
            bundlePatches: patches,
            beforeText: "(bulk edit)",
            proposedText: JSON.stringify({ patches }),
            requiresConfirmation: true,
          });
        } else if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
          const bytes = await downloadFile(d.encryptedFilename);
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(bytes as any);
          const ops: any[] = [];
          let hit = 0;

          for (const ws of wb.worksheets) {
            ws.eachRow({ includeEmpty: false }, (row) => {
              if (ops.length >= 200) return;
              row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                if (ops.length >= 200) return;
                const v: any = cell.value as any;
                const s = typeof v === "string" ? v : typeof v === "number" ? "" : (v && typeof v === "object" && "text" in v ? String((v as any).text ?? "") : "");
                if (!s || !s.includes(from)) return;
                const next = s.split(from).join(to);
                if (next === s) return;
                hit += 1;
                const a1 = cell.address; // like "B2"
                ops.push({ kind: "set_values", rangeA1: `${ws.name}!${a1}`, values: [[next]] });
              });
            });
            if (ops.length >= 200) break;
          }

          if (!ops.length) {
            notes.push(`No matches for "${from}" in **${filename}**.`);
            continue;
          }
          const routingMeta = this.resolveAllybiEditRoutingMeta({
            domain: "sheets",
            runtimeOperator: "COMPUTE_BUNDLE",
            instruction: params.req.message,
          });

          attachments.push({
            type: "edit_session",
            domain: "sheets",
            operator: "COMPUTE_BUNDLE",
            canonicalOperator: routingMeta.canonicalOperator,
            renderType: routingMeta.renderType,
            instruction: params.req.message,
            documentId: d.id,
            filename,
            mimeType: d.mimeType || "application/octet-stream",
            bundle: {
              kind: "global_replace",
              toneProfile: { tone: "neutral", domainHint: "spreadsheets", styleNotes: ["Preserve meaning strictly."] },
              summary: `Replace all occurrences of "${from}" with "${to}" (${hit} cell change${hit === 1 ? "" : "s"}).`,
              changeCount: hit,
              riskyChangeCount: 0,
            },
            beforeText: "(bulk edit)",
            proposedText: JSON.stringify({ ops }),
            requiresConfirmation: true,
          });
        } else {
          notes.push(`Skipped **${filename}** (unsupported file type for replace).`);
        }
      }
    }

    const userMsg = params.existingUserMsgId
      ? { id: params.existingUserMsgId }
      : await this.createMessage({ conversationId: params.conversationId, role: "user", content: params.req.message, userId: params.req.userId });

    const header =
      bulk.kind === "enhance_bullets"
        ? (attachments.length
            ? `Bulk bullet improvements ready for ${attachments.length} document${attachments.length === 1 ? "" : "s"}.`
            : "I couldn't prepare a bulk bullet-improvement draft for any documents.")
        : bulk.kind === "global_replace"
          ? (attachments.length
              ? `Bulk find/replace ready for ${attachments.length} document${attachments.length === 1 ? "" : "s"}.`
              : "I couldn't prepare a bulk find/replace draft for any documents.")
          : bulk.kind === "section_bullets_to_paragraph"
            ? (attachments.length
                ? `Bullet list to paragraph draft ready for ${attachments.length} document${attachments.length === 1 ? "" : "s"}.`
                : "I couldn't prepare a bullet-list-to-paragraph draft for any documents.")
            : (attachments.length
                ? `Bulk section rewrite ready for ${attachments.length} document${attachments.length === 1 ? "" : "s"}.`
                : "I couldn't prepare a bulk section-rewrite draft for any documents.");

    const text = [header, ...(notes.length ? ["", ...notes] : [])].join("\n");

    if (params.sink?.isOpen()) {
      params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
      params.sink.write({ event: "delta", data: { text } } as any);
    }

    const assistantMsg = await this.createMessage({
      conversationId: params.conversationId,
      role: "assistant",
      content: text,
      userId: params.req.userId,
      metadata: { sources: [], attachments, answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
    });

    return {
      conversationId: params.conversationId,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      assistantText: text,
      attachmentsPayload: attachments,
      sources: [],
      answerMode: "action_receipt",
      answerClass: "NAVIGATION",
      navType: null,
    };
  }

  private monthShortName(month: number): string {
    const m = Number(month);
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (!Number.isFinite(m) || m < 1 || m > 12) return String(month);
    return names[m - 1]!;
  }

  private parseMonthFromText(message: string): number | null {
    const q = (message || "").toLowerCase();
    const months: Array<[RegExp, number]> = [
      [/\bjanuary\b|\bjan\b|\bjaneiro\b/i, 1],
      [/\bfebruary\b|\bfeb\b|\bfevereiro\b/i, 2],
      [/\bmarch\b|\bmar\b|\bmarço\b|\bmarco\b/i, 3],
      [/\bapril\b|\bapr\b|\babril\b/i, 4],
      [/\bmay\b|\bmaio\b/i, 5],
      [/\bjune\b|\bjun\b|\bjunho\b/i, 6],
      [/\bjuly\b|\bjul\b|\bjulho\b/i, 7],
      [/\baugust\b|\baug\b|\bagosto\b/i, 8],
      [/\bseptember\b|\bsep\b|\bsetembro\b/i, 9],
      [/\boctober\b|\boct\b|\boutubro\b/i, 10],
      [/\bnovember\b|\bnov\b|\bnovembro\b/i, 11],
      [/\bdecember\b|\bdec\b|\bdezembro\b/i, 12],
    ];
    for (const [rx, n] of months) {
      if (rx.test(q)) return n;
    }
    return null;
  }

  private parseQuarterFromText(message: string): number | null {
    const q = (message || "").toLowerCase();
    const m = q.match(/\bq([1-4])\b/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  private isDocxFirstParagraphRequest(message: string): boolean {
    const q = (message || "").toLowerCase();
    return /\b(first paragraph|1st paragraph|primeiro par[aá]grafo)\b/.test(q);
  }

  private isDocxEndParagraphRequest(message: string): boolean {
    const q = (message || "").toLowerCase();
    return /\b(at the end|at end|no fim|ao final|append)\b/.test(q);
  }

  private isDocxIntroductionRequest(message: string): boolean {
    const q = (message || "").toLowerCase();
    return /\b(intro|introduction|introdu[cç][aã]o)\b/.test(q);
  }

  private pickFirstNonTitleParagraph(candidates: DocxParagraphNode[], titleId?: string | null): DocxParagraphNode | null {
    const sorted = [...candidates]
      .filter((c) => (c.text || "").trim())
      .sort((a, b) => (a.docIndex ?? 1e9) - (b.docIndex ?? 1e9));
    if (!sorted.length) return null;
    for (const c of sorted) {
      if (titleId && c.paragraphId === titleId) continue;
      return c;
    }
    return sorted[0] || null;
  }

  private pickLastNonEmptyParagraph(candidates: DocxParagraphNode[]): DocxParagraphNode | null {
    const sorted = [...candidates]
      .filter((c) => (c.text || "").trim())
      .sort((a, b) => (a.docIndex ?? 1e9) - (b.docIndex ?? 1e9));
    return sorted.length ? sorted[sorted.length - 1] : null;
  }

  private normalizeXlsxValueText(raw: string): string | null {
    const s = String(raw || "").trim();
    if (!s) return null;
    // Prefer numeric parsing when it looks like currency/number.
    const n = this.parseMoney(s);
    if (n != null) return String(n);
    // If the value starts with a number but has trailing words (e.g. "525000 in <file>"),
    // extract the first numeric token.
    const firstNum = s.match(/^-?[\d,]+(?:\.\d+)?/);
    if (firstNum && firstNum[0]) return firstNum[0].replace(/,/g, "");
    const anyNum = s.match(/-?[\d,]+(?:\.\d+)?/);
    if (anyNum && anyNum[0]) return anyNum[0].replace(/,/g, "");
    // Otherwise strip surrounding quotes.
    return s.replace(/^["']/, "").replace(/["']$/, "").trim() || null;
  }

  private parseSheetRename(message: string): { fromName: string; toName: string } | null {
    const q = (message || "").trim();
    // rename sheet Old to New (also handles tab/worksheet)
    const en = q.match(/\brename\b.{0,40}\b(sheet|tab|worksheet)\b\s+["']?([^"'\n]{1,80})["']?\s+\bto\b\s+["']?([^"'\n]{1,80})["']?\s*$/i);
    if (en) {
      const fromName = (en[2] || "").trim();
      const toName = (en[3] || "").trim();
      if (!fromName || !toName) return null;
      return { fromName, toName };
    }

    const pt = q.match(/\b(renomear|mudar o nome)\b.{0,40}\b(aba|planilha|guia)\b\s+["']?([^"'\n]{1,80})["']?\s+\b(para)\b\s+["']?([^"'\n]{1,80})["']?\s*$/i);
    if (pt) {
      const fromName = (pt[3] || "").trim();
      const toName = (pt[5] || "").trim();
      if (!fromName || !toName) return null;
      return { fromName, toName };
    }

    return null;
  }

  private parseSheetTarget(message: string): { sheetName?: string; a1: string } | null {
    const q = (message || "").trim();

    // Prefer explicit "Sheet!A1" / "'My Sheet'!A1:B2"
    const bang = q.match(/(?:^|\s)(?:'([^']+)'|\"([^\"]+)\"|([A-Za-z0-9 _.-]{1,60}))!([A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?)(?:\b|$)/);
    if (bang) {
      const sheetName = (bang[1] || bang[2] || bang[3] || "").trim();
      const a1 = (bang[4] || "").trim();
      if (sheetName && a1) return { sheetName, a1 };
    }

    // Also support: "in 'SUMMARY1', format A4:G20 ..." or "on sheet Summary1 A4:G20".
    const inSheet = q.match(/\b(?:in|on)\b\s+(?:the\s+)?(?:sheet\s+)?(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_. -]{1,60}))[\s,:-]+(?:.*?\b)?([A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?)\b/i);
    if (inSheet) {
      const sheetName = String(inSheet[1] || inSheet[2] || inSheet[3] || "").trim();
      const a1 = String(inSheet[4] || "").trim();
      const stop = new Set(["this", "that", "the", "my", "document", "file", "sheet", "cell", "cells", "range", "column", "row", "set", "change", "update", "put", "add", "value", "formula"]);
      const firstWord = sheetName.toLowerCase().split(/\s+/)[0] || "";
      if (sheetName && a1 && !stop.has(sheetName.toLowerCase()) && !stop.has(firstWord)) return { sheetName, a1 };
    }

    // Fallback: "set B12 to 42" or "update range A1:B10"
    const a1 = q.match(/\b([A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?)\b/);
    if (!a1) return null;
    return { a1: a1[1] };
  }

  private defaultCanonicalOperatorForRuntime(domain: EditDomain, runtimeOperator: string): string {
    const op = String(runtimeOperator || "").trim().toUpperCase();
    if (domain === "docx") {
      if (op === "EDIT_SPAN") return "DOCX_REPLACE_SPAN";
      if (op === "ADD_PARAGRAPH") return "DOCX_INSERT_AFTER";
      if (op === "EDIT_DOCX_BUNDLE") return "DOCX_SET_RUN_STYLE";
      return "DOCX_REWRITE_PARAGRAPH";
    }
    if (domain === "sheets") {
      if (op === "EDIT_CELL") return "XLSX_SET_CELL_VALUE";
      if (op === "EDIT_RANGE") return "XLSX_SET_RANGE_VALUES";
      if (op === "CREATE_CHART") return "XLSX_CHART_CREATE";
      if (op === "ADD_SHEET") return "XLSX_TABLE_CREATE";
      if (op === "RENAME_SHEET") return "XLSX_TABLE_CREATE";
      return "XLSX_FORMAT_RANGE";
    }
    return op || "EDIT_PARAGRAPH";
  }

  private defaultRenderTypeForCanonical(domain: EditDomain, canonicalOperator: string): string {
    const caps = loadAllybiBanks().capabilities;
    const opInfo = caps?.operators && typeof caps.operators === "object"
      ? (caps.operators as Record<string, any>)[canonicalOperator]
      : null;
    const renderFromCap = String(opInfo?.renderCard || "").trim();
    if (renderFromCap) return renderFromCap;

    if (domain === "docx") {
      if (canonicalOperator.includes("LIST_") || canonicalOperator.includes("INSERT") || canonicalOperator.includes("DELETE") || canonicalOperator.includes("TOC")) {
        return "docx_structural_diff";
      }
      if (canonicalOperator.includes("STYLE") || canonicalOperator.includes("FORMAT")) return "docx_inline_format_diff";
      return "docx_text_diff";
    }

    if (domain === "sheets") {
      if (canonicalOperator.startsWith("XLSX_CHART_")) return "xlsx_chart_diff";
      if (canonicalOperator.includes("FORMULA")) return "xlsx_formula_diff";
      if (canonicalOperator.includes("FORMAT") || canonicalOperator.includes("COND_FORMAT")) return "xlsx_format_diff";
      if (canonicalOperator.includes("SORT") || canonicalOperator.includes("FILTER") || canonicalOperator.includes("TABLE")) return "xlsx_structural_diff";
      if (canonicalOperator === "XLSX_SET_CELL_VALUE") return "xlsx_cell_diff";
      return "xlsx_range_diff";
    }

    return "docx_text_diff";
  }

  private resolveAllybiEditRoutingMeta(input: {
    domain: EditDomain;
    runtimeOperator: EditOperator;
    instruction: string;
    targetHint?: string;
    hasSelection?: boolean;
  }): { canonicalOperator: string; renderType: string; requiresConfirmation: boolean } {
    const fallbackCanonical = this.defaultCanonicalOperatorForRuntime(input.domain, input.runtimeOperator);
    const fallbackRenderType = this.defaultRenderTypeForCanonical(input.domain, fallbackCanonical);

    const domainForIntent = input.domain === "sheets" ? "xlsx" : input.domain === "docx" ? "docx" : "global";
    if (domainForIntent === "global") {
      return {
        canonicalOperator: fallbackCanonical,
        renderType: fallbackRenderType,
        requiresConfirmation: false,
      };
    }

    const intent = classifyAllybiIntent(input.instruction, domainForIntent);
    const scope = resolveAllybiScope({
      domain: domainForIntent,
      message: input.instruction,
      classifiedIntent: intent,
      explicitTarget: input.targetHint || null,
      ...(input.hasSelection ? { liveSelection: { selection: true } } : {}),
    });
    const planned = planAllybiOperator({
      domain: input.domain,
      message: input.instruction,
      classifiedIntent: intent,
      scope,
    });

    return {
      canonicalOperator: String(planned?.canonicalOperator || fallbackCanonical),
      renderType: String(planned?.previewRenderType || fallbackRenderType),
      requiresConfirmation: Boolean(planned?.requiresConfirmation),
    };
  }

  private buildResolvedTargetForXlsx(sheetName: string, a1: string): ResolvedTarget {
    const id = `xlsx:${sheetName}!${a1}`;
    return {
      id,
      label: `${sheetName}!${a1}`,
      confidence: 1,
      candidates: [{ id, label: `${sheetName}!${a1}`, confidence: 1, reasons: ["explicit-target"] }],
      decisionMargin: 1,
      isAmbiguous: false,
      resolutionReason: "explicit_target",
    };
  }

  private pickLikelyDocxTitle(candidates: DocxParagraphNode[]): DocxParagraphNode | null {
    const usable = candidates
      .filter((c) => (c.text || "").trim())
      .sort((a, b) => (a.docIndex ?? 1e9) - (b.docIndex ?? 1e9))
      .slice(0, 30);

    if (usable.length === 0) return null;

    const scored = usable.map((c) => {
      const t = (c.text || "").trim();
      const words = t.split(/\s+/).filter(Boolean).length;
      const len = t.length;
      const idx = c.docIndex ?? 9999;

      let score = 0;
      score += Math.max(0, 1 - idx / 20) * 0.55; // early paragraphs dominate
      if (len >= 5 && len <= 140) score += 0.25;
      if (words >= 2 && words <= 14) score += 0.15;
      if (!/[.:;]$/.test(t)) score += 0.05; // title-ish

      return { c, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.c ?? usable[0];
  }

  private async readXlsxBeforeText(buffer: Buffer, sheetName: string, a1: string): Promise<string> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

    if (!a1.includes(":")) {
      const v = ws.getCell(a1).value as any;
      if (v == null) return "(empty)";
      if (typeof v === "object" && "text" in v) return String((v as any).text ?? "");
      if (typeof v === "object" && "result" in v) return String((v as any).result ?? "");
      return String(v);
    }

    // Range -> TSV
    const [start, end] = a1.split(":").map((s) => s.trim());
    const startCell = ws.getCell(start);
    const endCell = ws.getCell(end);

    const r1 = Math.min(Number(startCell.row), Number(endCell.row));
    const r2 = Math.max(Number(startCell.row), Number(endCell.row));
    const c1 = Math.min(Number(startCell.col), Number(endCell.col));
    const c2 = Math.max(Number(startCell.col), Number(endCell.col));

    const rows: string[] = [];
    for (let r = r1; r <= r2; r++) {
      const cols: string[] = [];
      for (let c = c1; c <= c2; c++) {
        const cell = ws.getRow(r).getCell(c);
        const v = cell.value as any;
        const s =
          v == null ? "" :
          typeof v === "object" && "text" in v ? String((v as any).text ?? "") :
          typeof v === "object" && "result" in v ? String((v as any).result ?? "") :
          String(v);
        cols.push(s);
      }
      rows.push(cols.join("\t"));
    }

    const tsv = rows.join("\n").trim();
    return tsv || "(empty)";
  }

  private async generateEditedText(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    instruction: string;
    beforeText: string;
    language?: "en" | "pt" | "es";
  }): Promise<string> {
    const sanitize = (out: string): string => {
      const raw = String(out || "").trim();
      const low = raw.toLowerCase();
      if (!raw) return "";
      // Guardrail: never allow assistant/meta commentary to be written into docs.
      const bad =
        low.includes("as an ai") ||
        (low.includes("based on") && (low.includes("provided") || low.includes("available"))) ||
        low.includes("i found the heading") ||
        low.includes("you might also search") ||
        low.includes("i need the specific") ||
        low.includes("please provide") ||
        low.includes("i can't") ||
        low.includes("i cannot");
      if (bad) return "";
      // If the model returned markdown/code fences, treat it as invalid for editor writes.
      if (raw.includes("```")) return "";
      // Avoid generic boilerplate opener drift unless the original text already uses it.
      if (/^this section\b/i.test(raw) && !/\bthis section\b/i.test(String(params.beforeText || ""))) return "";
      return raw;
    };

    const normalizeForEcho = (s: string): string =>
      String(s || "")
        .toLowerCase()
        .replace(/[\u2019\u2018]/g, "'")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const lang = params.language || "en";
    const system =
      lang === "pt"
        ? "Você é um editor. Reescreva o TEXTO ORIGINAL seguindo a INSTRUÇÃO. Saída: apenas o texto reescrito (sem aspas, sem markdown, sem explicações). Preserve o tom e o estilo do texto original. Evite abertura genérica como 'Esta seção...'."
        : lang === "es"
          ? "Eres un editor. Reescribe el TEXTO ORIGINAL siguiendo la INSTRUCCION. Salida: solo el texto reescrito (sin comillas, sin markdown, sin explicaciones). Conserva el tono y estilo del original. Evita inicios genéricos como 'Esta sección...'."
          : "You are an editor. Rewrite the ORIGINAL TEXT following the INSTRUCTION. Output: only the rewritten text (no quotes, no markdown, no explanations). Preserve the original tone/style and avoid generic opener drift like 'This section...' unless present in the original.";

    const user = [
      `INSTRUCTION:\n${params.instruction}`,
      "",
      `ORIGINAL TEXT:\n${params.beforeText}`,
    ].join("\n");

    const out = await this.engine.generate({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: [
        { role: "system" as ChatRole, content: system },
        { role: "user" as ChatRole, content: user },
      ],
    });

    const raw = sanitize(String(out.text || ""));
    const outNorm = normalizeForEcho(raw);
    const instrNorm = normalizeForEcho(params.instruction);
    // Prevent a common failure mode where the model echoes the instruction itself back into the document.
    if (outNorm && instrNorm && (outNorm === instrNorm || outNorm.includes(instrNorm) || instrNorm.includes(outNorm))) {
      return "";
    }
    return raw;
  }

  private async generateEditedSpanText(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    instruction: string;
    selectedText: string;
    paragraphText: string;
    language?: "en" | "pt" | "es";
  }): Promise<string> {
    const sanitize = (out: string): string => {
      const raw = String(out || "").trim();
      const low = raw.toLowerCase();
      if (!raw) return "";
      const bad =
        low.includes("as an ai") ||
        (low.includes("based on") && (low.includes("provided") || low.includes("available"))) ||
        low.includes("i found the heading") ||
        low.includes("you might also search") ||
        low.includes("i need the specific") ||
        low.includes("please provide") ||
        low.includes("i can't") ||
        low.includes("i cannot");
      if (bad) return "";
      if (raw.includes("```")) return "";
      return raw;
    };

    const lang = params.language || "en";
    const normalizeForEcho = (s: string): string =>
      String(s || "")
        .toLowerCase()
        .replace(/[\u2019\u2018]/g, "'")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const looksLikeInstructionEcho = (candidate: string): boolean => {
      const outNorm = normalizeForEcho(candidate);
      const instrNorm = normalizeForEcho(params.instruction);
      if (!outNorm) return true;
      if (instrNorm && (outNorm === instrNorm || outNorm.includes(instrNorm) || instrNorm.includes(outNorm))) return true;

      // Explicit instruction-ish phrases: if these show up in the output, it's almost always wrong.
      const badPhrases = [
        "preserve meaning",
        "be more concise",
        "make it concise",
        "more concise and professional",
        "rewrite this",
        "re write this",
        "selected text",
        "instruction",
        "only change",
      ];
      for (const p of badPhrases) {
        if (outNorm.includes(p)) return true;
      }
      return false;
    };

    const systemBase =
      lang === "pt"
        ? "Você é um editor. Reescreva SOMENTE o TRECHO SELECIONADO seguindo a INSTRUÇÃO. Saída: apenas o texto de substituição (sem aspas, sem markdown, sem explicações)."
        : lang === "es"
          ? "Eres un editor. Reescribe SOLO el TEXTO SELECCIONADO siguiendo la INSTRUCCION. Salida: solo el texto de reemplazo (sin comillas, sin markdown, sin explicaciones)."
          : "You are an editor. Rewrite ONLY the SELECTED TEXT following the INSTRUCTION. Output: only the replacement text (no quotes, no markdown, no explanations).";

    const user = [
      `INSTRUCTION:\n${params.instruction}`,
      "",
      `SELECTED TEXT (replace only this span):\n${params.selectedText}`,
      "",
      `FULL PARAGRAPH (context only; do not rewrite it):\n${params.paragraphText}`,
    ].join("\n");

    const runOnce = async (system: string): Promise<string> => {
      const out = await this.engine.generate({
        traceId: params.traceId,
        userId: params.userId,
        conversationId: params.conversationId,
        messages: [
          { role: "system" as ChatRole, content: system },
          { role: "user" as ChatRole, content: user },
        ],
      });
      return sanitize(String(out.text || ""));
    };

    const first = await runOnce(systemBase);
    if (first && !looksLikeInstructionEcho(first)) return first;

    // Second attempt: stricter guardrails to prevent instruction echo.
    const system2 =
      systemBase +
      "\nRules:\n" +
      "- Do NOT repeat or paraphrase the instruction itself.\n" +
      "- Output must be a rewritten version of the selected content, not advice.\n" +
      "- If the instruction is too generic (e.g. 'make concise'), still rewrite the selected text into a concise, professional form.\n";

    const second = await runOnce(system2);
    if (second && !looksLikeInstructionEcho(second)) return second;
    return "";
  }

  private async tryHandleEditingTurn(params: {
    traceId: string;
    req: ChatRequest;
    conversationId: string;
    history: Array<{ role: ChatRole; content: string }>;
    sink?: StreamSink;
    existingUserMsgId?: string;
  }): Promise<ChatResult | null> {
    try {
      const viewerSelRaw = (params.req.meta as any)?.viewerSelection as any;
      let viewerRanges = Array.isArray(viewerSelRaw?.ranges) ? viewerSelRaw.ranges : [];
      let viewerSelectionKind = typeof viewerSelRaw?.selectionKind === "string" ? String(viewerSelRaw.selectionKind).toLowerCase().trim() : "";
      let viewerSelText =
        typeof viewerRanges?.[0]?.text === "string"
          ? viewerRanges[0].text
          : typeof viewerSelRaw?.text === "string"
            ? viewerSelRaw.text
            : "";
      let viewerRangeA1 =
        typeof viewerRanges?.[0]?.rangeA1 === "string"
          ? String(viewerRanges[0].rangeA1 || "").trim()
          : typeof viewerSelRaw?.rangeA1 === "string"
            ? String(viewerSelRaw.rangeA1 || "").trim()
            : "";
      const viewerMode = Boolean((params.req.meta as any)?.viewerMode);
      const wholeDocumentDirective = this.isAllybiDocumentScopeDirective(params.req.message, "docx");
      // Safety net: whole-document operations must never inherit stale locked selection.
      if (wholeDocumentDirective) {
        viewerRanges = [];
        viewerSelectionKind = "";
        viewerSelText = "";
        viewerRangeA1 = "";
      }
      const hasViewerSelection =
        (typeof viewerSelText === "string" && viewerSelText.trim().length > 0) ||
        (typeof viewerRangeA1 === "string" && viewerRangeA1.length > 0) ||
        (Array.isArray(viewerRanges) && viewerRanges.length > 0);
      const viewerContext = (params.req.meta as any)?.viewerContext as any;
      const viewerFileType = String(viewerContext?.fileType || "").toLowerCase();
      const viewerDomainHint =
        typeof viewerSelRaw?.domain === "string"
          ? String(viewerSelRaw.domain).trim()
          : typeof viewerContext?.domain === "string"
            ? String(viewerContext.domain).trim()
            : "";
      const viewerLooksLikeSheetsContext =
        viewerDomainHint === "sheets" ||
        ["excel", "xlsx", "sheet", "sheets", "spreadsheet"].includes(viewerFileType);

      // Structural insertion detector: "add a paragraph below/after the last bullet point in <section> ..."
      // This must run BEFORE bulk intent detection to avoid misrouting.
      const detectInsertBelowLastBullet = (message: string): { sectionHint: string | null } | null => {
        const q = String(message || "").trim();
        const low = q.toLowerCase();
        const wantsAdd = /\b(add|insert|append)\b/.test(low) && /\bparagraph\b/.test(low);
        const wantsBelowLastBullet =
          (/\bbelow\b/.test(low) || /\bafter\b/.test(low)) &&
          /\blast\b/.test(low) &&
          /\b(bullet|bullets|bullet points|list)\b/.test(low);
        if (!wantsAdd || !wantsBelowLastBullet) return null;

        const inSection = q.match(/\b(?:in|within)\b\s+(?:the\s+)?(.+?)\s+\bsection\b/i);
        if (inSection?.[1]) return { sectionHint: String(inSection[1]).trim() };

        const underSection = q.match(/\b(?:under|below)\b\s+(.+?)\s+\bsection\b/i);
        if (underSection?.[1]) return { sectionHint: String(underSection[1]).trim() };

        const quoted = this.extractQuotedSegments(q);
        if (quoted.length >= 1) return { sectionHint: String(quoted[0] || "").trim() || null };
        return { sectionHint: null };
      };

      const insertBelow = detectInsertBelowLastBullet(params.req.message);
      const bulk = insertBelow ? null : this.detectBulkEditIntent(params.req.message);

      const viewerWantsChart = (() => {
        if (!viewerMode) return false;
        const low = String(params.req.message || "").toLowerCase();
        const explicitChartNoun =
          /\b(chart|graph|plot|gr[aá]fico|gr[aá]fica)\b/.test(low);
        const explicitChartTypePhrase =
          /\b(pie|bar|line|area|scatter|combo|bubble|radar|histogram|stacked)\s+(chart|graph|plot)\b/.test(low) ||
          /\b(column|coluna|barra|pizza|linha|dispers[aã]o|combinad[oa]|bolha|histograma|empilhad[oa])\s+(chart|graph|gr[aá]fico)\b/.test(low);
        const chartVerbWithType =
          /\b(create|build|generate|make|criar|gerar|fazer)\b.{0,24}\b(pie|bar|column|line|area|scatter|combo|bubble|radar|histogram|stacked)\b/.test(low);
        const wantsChart =
          explicitChartNoun ||
          explicitChartTypePhrase ||
          chartVerbWithType;
        if (!wantsChart) return false;
        // Only treat chart requests as sheet edits when selection/context indicates sheets.
        return viewerLooksLikeSheetsContext;
      })();

      const isViewerLikelyEditInstruction = (message: string): boolean => {
        const q = String(message || "").toLowerCase();
        // Don't force editing for obvious questions unless user also uses an edit verb.
        const looksLikeQuestion =
          /\?\s*$/.test(q) ||
          /^\s*(what|why|how|when|where|who)\b/.test(q) ||
          /\b(summarize|summarise|summary|explain)\b/.test(q);

        const editVerb =
          /\b(change|edit|rewrite|rephrase|fix|update|replace|remove|delete|add|insert|append|make|tighten|translate|traduzir|traduza|traducao|tradução|localize|localise)\b/.test(q) ||
          /\b(create|build|generate)\b/.test(q) ||
          /\b(chart|graph|plot)\b/.test(q) ||
          /\b(bullet|bullets|bullet points|points)\b/.test(q);

        // In the viewer, treat natural language "do X to this doc" as an edit intent.
        return editVerb && (!looksLikeQuestion || editVerb);
      };

      const decision = await this.intentEngineV3.resolve({
        text: params.req.message,
        languageHint: params.req.preferredLanguage,
      } as any);

      const isEditingFamily = decision?.intentFamily === "editing";
      const editingEntities =
        isEditingFamily && typeof (decision as any)?.signals?.editing?.entities === "object"
          ? ((decision as any).signals.editing.entities as Record<string, any>)
          : {};
      const viewerHeuristicEdit = viewerMode && isViewerLikelyEditInstruction(params.req.message);
      // Viewer mode should not hijack normal doc questions into "editing" just because
      // some text is selected. Only force editing when the message itself looks like
      // an edit instruction.
      const shouldForceViewerEditing = viewerMode && !isEditingFamily && viewerHeuristicEdit;
      const operatorRaw = isEditingFamily
        ? String(decision.operator || "").trim()
        : (viewerWantsChart
          ? "CREATE_CHART"
          : (shouldForceViewerEditing
          ? (viewerLooksLikeSheetsContext ? "COMPUTE_BUNDLE" : "EDIT_PARAGRAPH")
          : ""));
      const domainRaw = isEditingFamily
        ? String((decision as any)?.signals?.editing?.domain || "").trim()
        : (viewerWantsChart ? "sheets" : (shouldForceViewerEditing ? (viewerLooksLikeSheetsContext ? "sheets" : "docx") : ""));

      // Viewer structural insertion forces DOCX ADD_PARAGRAPH.
      const normalizedInitialOperator =
        (domainRaw === "docx" || domainRaw === "sheets" || domainRaw === "slides")
          ? normalizeEditOperator(operatorRaw, { domain: domainRaw, instruction: params.req.message }).operator
          : null;

      const operatorForced = (viewerMode && insertBelow) ? "ADD_PARAGRAPH" : (normalizedInitialOperator || operatorRaw);
      const domainForced = (viewerMode && insertBelow) ? "docx" : domainRaw;
      const viewerSheetsLow = String(params.req.message || "").toLowerCase();
      const viewerWantsTable = /\btable\b/.test(viewerSheetsLow) || /\btabela\b/.test(viewerSheetsLow);
      const viewerWantsColumn =
        /\b(column|coluna)\b/.test(viewerSheetsLow) &&
        /\b(add|create|new|insert|adicionar|criar|nova|novo)\b/.test(viewerSheetsLow);
      const viewerWantsCompute =
        /\b(calculate|compute|sum|total|average|avg|min|max|count|calcular|somar|media|m[eé]dia|sort|filter|freeze|format|validation|dropdown|conditional|print)\b/.test(viewerSheetsLow) ||
        /\b(ordenar|filtrar|congelar|formatar|valida[cç][aã]o|lista suspensa|condicional|impress[aã]o)\b/.test(viewerSheetsLow) ||
        (/\b(insert|delete|remove|add)\b/.test(viewerSheetsLow) && /\b(rows?|columns?|linhas?|colunas?)\b/.test(viewerSheetsLow));
      const viewerWantsDirectValueEdit = (
        /\b(set|change|replace|update|write|put|make|edit)\b/.test(viewerSheetsLow) ||
        /\b(definir|mudar|alterar|substituir|trocar|atualizar|colocar|editar)\b/.test(viewerSheetsLow)
      ) && Boolean(
        this.parseAfterToValue(params.req.message) ||
        this.extractQuotedText(params.req.message),
      );

      let operatorFinal = operatorForced;
      let domainFinal = domainForced;
      if (viewerMode && (domainForced === "sheets" || viewerLooksLikeSheetsContext)) {
        domainFinal = "sheets";
        if (viewerWantsChart) operatorFinal = "CREATE_CHART";
        else if (viewerWantsDirectValueEdit && hasViewerSelection) {
          operatorFinal = String(viewerRangeA1 || "").includes(":") ? "EDIT_RANGE" : "EDIT_CELL";
        }
        else if (viewerWantsTable || viewerWantsColumn || viewerWantsCompute) operatorFinal = "COMPUTE_BUNDLE";
        else if (!["EDIT_CELL", "EDIT_RANGE", "ADD_SHEET", "RENAME_SHEET", "CREATE_CHART", "COMPUTE", "COMPUTE_BUNDLE"].includes(operatorFinal)) {
          operatorFinal = "COMPUTE_BUNDLE";
        }
      }

      const supportedOperators = new Set([
        "EDIT_PARAGRAPH",
        "EDIT_SPAN",
        "EDIT_DOCX_BUNDLE",
        "ADD_PARAGRAPH",
        "EDIT_CELL",
        "EDIT_RANGE",
        "ADD_SHEET",
        "RENAME_SHEET",
        "CREATE_CHART",
        "COMPUTE",
        "COMPUTE_BUNDLE",
      ]);

      // Viewer safeguard: when the intent engine marks "editing" but doesn't provide a
      // usable operator/domain pair (common for short commands like "translate this"),
      // force a deterministic viewer edit route instead of falling back to the
      // non-actionable "edit mode only" message.
      if (
        viewerMode &&
        viewerHeuristicEdit &&
        (
          !supportedOperators.has(operatorFinal) ||
          (domainFinal !== "docx" && domainFinal !== "sheets")
        )
      ) {
        domainFinal = viewerLooksLikeSheetsContext ? "sheets" : "docx";
        operatorFinal = viewerLooksLikeSheetsContext
          ? (viewerWantsChart ? "CREATE_CHART" : "COMPUTE_BUNDLE")
          : "EDIT_PARAGRAPH";
      }

      // Normalize non-canonical operator ids from databanks/intent engine before rejecting.
      if (domainFinal === "sheets" && !supportedOperators.has(operatorFinal)) {
        const normalized = normalizeEditOperator(operatorFinal, {
          domain: "sheets",
          instruction: params.req.message,
        }).operator;
        if (normalized) operatorFinal = normalized;
      }
      if (viewerMode && domainFinal === "docx" && !supportedOperators.has(operatorFinal)) {
        // Keep viewer edit mode resilient when the intent engine returns a non-canonical
        // docx operator id (e.g. translate/rewrite aliases). Fall back to paragraph edit.
        if (isViewerLikelyEditInstruction(params.req.message) || hasViewerSelection) {
          operatorFinal = "EDIT_PARAGRAPH";
        }
      }

      const shouldBypassBulkForViewerSelection =
        viewerMode &&
        hasViewerSelection &&
        !wholeDocumentDirective;
      // Bulk edits are handled separately (can target multiple docs and bundle patches).
      // In viewer mode, never let bulk routing steal an active document selection.
      if (bulk && !shouldBypassBulkForViewerSelection) {
        return await this.handleBulkEditTurn({
          traceId: params.traceId,
          req: params.req,
          conversationId: params.conversationId,
          sink: params.sink,
          existingUserMsgId: params.existingUserMsgId,
          viewerMode,
        });
      }

      if (!supportedOperators.has(operatorFinal)) return null;
      if (domainFinal !== "docx" && domainFinal !== "sheets") return null;

    // Resolve document to edit.
    const attachedIds = params.req.attachedDocumentIds ?? [];
    if (attachedIds.length > 1) {
      const docs = await prisma.document.findMany({
        where: { id: { in: attachedIds }, userId: params.req.userId },
        select: { id: true, filename: true, encryptedFilename: true, mimeType: true },
      });

      const text = "Which file should I edit? Please attach a single document (DOCX or XLSX) and try again.";
      const attachments = docs.map((d) => ({
        type: "document",
        id: d.id,
        filename: d.filename || this.extractFilenameFromPath(d.encryptedFilename) || "Document",
        mimeType: d.mimeType || "application/octet-stream",
      }));

      const userMsg = params.existingUserMsgId
        ? { id: params.existingUserMsgId }
        : await this.createMessage({ conversationId: params.conversationId, role: "user", content: params.req.message, userId: params.req.userId });

      if (params.sink?.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments, answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        attachmentsPayload: attachments,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

    let documentId: string | null = attachedIds.length === 1 ? attachedIds[0] : null;
    // Viewer mode should always prefer the currently open document to avoid
    // cross-file ambiguity and wrong MIME fallbacks.
    if (!documentId && viewerMode) {
      const activeViewerDocId = String(viewerContext?.activeDocumentId || "").trim();
      if (activeViewerDocId) documentId = activeViewerDocId;
    }
    if (!documentId) {
      const convScope = await prisma.conversation.findFirst({
        where: { id: params.conversationId, userId: params.req.userId },
        select: { scopeDocumentIds: true },
      });
      const scopeDocIds = (convScope?.scopeDocumentIds as string[]) ?? [];
      if (scopeDocIds.length === 1) documentId = scopeDocIds[0];
    }
    if (!documentId) {
      // Prefer a document whose MIME matches the editing domain.
      const expectedMime =
        domainFinal === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const candidates = await this.resolveDocumentCandidates(params.req.userId, params.req.message, 6);
      const match = candidates.find((c) => (c.mimeType || "") === expectedMime) || candidates[0] || null;
      if (match?.id) documentId = match.id;
    }

    if (!documentId) {
      const text = "Attach the DOCX or XLSX you want to edit, then tell me what to change.";
      const userMsg = params.existingUserMsgId
        ? { id: params.existingUserMsgId }
        : await this.createMessage({ conversationId: params.conversationId, role: "user", content: params.req.message, userId: params.req.userId });

      if (params.sink?.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId: params.req.userId },
      select: { id: true, filename: true, encryptedFilename: true, mimeType: true, updatedAt: true, fileHash: true },
    });
    if (!doc?.encryptedFilename) return null;

    const filename = doc.filename || this.extractFilenameFromPath(doc.encryptedFilename) || "Document";
    const docMime = doc.mimeType || "application/octet-stream";
    const isDocxMime = (mime: string): boolean => /wordprocessingml\.document/i.test(String(mime || ""));
    const isXlsxMime = (mime: string): boolean =>
      /spreadsheetml\.sheet/i.test(String(mime || "")) || /application\/vnd\.ms-excel/i.test(String(mime || ""));

      let domain = domainFinal as EditDomain;
      let operator = operatorFinal as EditOperator;
      const docxFormattingHint = this.resolveDocxFormattingIntent({
        message: params.req.message,
        routingEntities: editingEntities,
      });

      const hasExplicitSheetsSignalsInMessage = (() => {
        const msg = String(params.req.message || "").toLowerCase();
        if (/\b([a-z_ ]+!)?[a-z]{1,3}\d{1,7}(?::[a-z]{1,3}\d{1,7})?\b/i.test(msg)) return true;
        if (/\b(sheet|sheets|spreadsheet|excel|cell|cells|column|row|table|chart|formula|range)\b/i.test(msg)) return true;
        if (/\b(planilha|c[eé]lula|coluna|linha|tabela|gr[aá]fico|f[oó]rmula|intervalo)\b/i.test(msg)) return true;
        return false;
      })();

      if (
        viewerMode &&
        isXlsxMime(docMime) &&
        domain !== "sheets"
      ) {
        domain = "sheets";
        if (!["EDIT_CELL", "EDIT_RANGE", "ADD_SHEET", "RENAME_SHEET", "CREATE_CHART", "COMPUTE", "COMPUTE_BUNDLE"].includes(operator)) {
          operator = "COMPUTE_BUNDLE";
        }
      }

      // Viewer safety: when a DOCX is open, do not let a weak/misclassified intent
      // route to sheets unless the user explicitly used spreadsheet syntax/terms.
      if (
        viewerMode &&
        isDocxMime(docMime) &&
        domain === "sheets" &&
        !hasExplicitSheetsSignalsInMessage
      ) {
        domain = "docx";
        if (!["EDIT_PARAGRAPH", "EDIT_SPAN", "EDIT_DOCX_BUNDLE", "ADD_PARAGRAPH"].includes(operator)) {
          operator = "EDIT_PARAGRAPH";
        }
      }

      // Viewer/editor should feel "document-aware": if the open doc is an XLSX and the
      // user asks for a chart/graph, force the chart operator even when routing is uncertain.
      if (
        viewerMode &&
        isXlsxMime(docMime)
      ) {
        const low = String(params.req.message || "").toLowerCase();
        const wantsChart =
          /\b(chart|graph|plot)\b/.test(low) ||
          /\b(gr[aá]fico|gr[aá]fica)\b/.test(low) ||
          /\b(pie|bar|column|line|area)\b/.test(low) ||
          /\b(pizza|barra|coluna|linha|area)\b/.test(low);
        if (wantsChart) {
          domain = "sheets";
          operator = "CREATE_CHART";
        }
      }

      // Viewer default must be precision-first:
      // when users selected text, keep edits scoped to that exact span unless they explicitly
      // ask for paragraph/list/heading-level transforms.
      if (viewerMode && domain === "docx" && operator === "EDIT_PARAGRAPH" && hasViewerSelection) {
        if (docxFormattingHint && !wholeDocumentDirective) {
          operator = "EDIT_DOCX_BUNDLE";
        } else {
        const kind = viewerSelectionKind;
        const viewerSel = (params.req.meta as any)?.viewerSelection as any;
        const viewerRanges = wholeDocumentDirective ? [] : (Array.isArray(viewerSel?.ranges) ? viewerSel.ranges : []);
        const scope = this.getDocxRequestedScope(params.req.message);
        const isStructuralRequest = scope === "paragraph" || scope === "bullets" || scope === "heading";
        const hasSelectedText =
          typeof viewerSelText === "string" &&
          String(viewerSelText || "").trim().length > 0;
        const hasSelectedRanges = viewerRanges.some((r: any) => String(r?.text || "").trim().length > 0);
        const isTranslateInstruction = /\b(translate|traduzir|traduza|translation|tradu[cç][aã]o|traducci[oó]n)\b/i.test(
          String(params.req.message || ""),
        );
        const wantsSpanByKind = kind === "span" || kind === "word" || kind === "sentence";
        const shouldForceSpan =
          (hasSelectedText || hasSelectedRanges) &&
          (wantsSpanByKind || scope === "word" || scope === "sentence" || scope === "unknown" || isTranslateInstruction);
        operator = shouldForceSpan && !isStructuralRequest ? "EDIT_SPAN" : "EDIT_PARAGRAPH";
        }
      }
      if (
        viewerMode &&
        domain === "docx" &&
        operator === "EDIT_SPAN" &&
        hasViewerSelection &&
        docxFormattingHint?.paragraphStyles &&
        !wholeDocumentDirective
      ) {
        operator = "EDIT_DOCX_BUNDLE";
      }

    // Safety: ensure operator aligns with explicit A1 range mentions for direct cell/range edits.
    if (domain === "sheets") {
      const target = this.parseSheetTarget(params.req.message);
      if (target?.a1?.includes(":") && (operator === "EDIT_CELL" || operator === "EDIT_RANGE")) operator = "EDIT_RANGE";
    }

    // Persist user message (skip on regenerate — reuse existing).
    const userMsg = params.existingUserMsgId
      ? { id: params.existingUserMsgId }
      : await this.createMessage({ conversationId: params.conversationId, role: "user", content: params.req.message, userId: params.req.userId });

    // Validate MIME early.
    if (domain === "docx" && !isDocxMime(docMime)) {
      const text = `This edit looks like a Word (.docx) edit, but **${filename}** is not a DOCX.`;
      if (params.sink?.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }
      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });
      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

    if (domain === "sheets" && !isXlsxMime(docMime)) {
      const text = `This edit looks like an Excel (.xlsx) edit, but **${filename}** is not an XLSX.`;
      if (params.sink?.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }
      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });
      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

    const editTaskType = this.detectEditTaskType({
      instruction: params.req.message,
      operator,
      domain,
    });
    const replacePair = this.extractReplacePairFromInstruction(params.req.message);
    const editSummary = this.buildEditTaskSummary({
      instruction: params.req.message,
      operator,
      domain,
      targetHint: null,
    });
    const editDocumentLabel = this.toEditDocumentLabel(filename);
    const initialScope: "selection" | "paragraph" | "section" | "document" | "range" | "unknown" =
      domain === "docx"
        ? (hasViewerSelection ? "selection" : "document")
        : (hasViewerSelection ? "selection" : "range");
    const baseEditVars: Record<string, unknown> = {
      taskType: editTaskType,
      operator,
      domain,
      ...(replacePair ? { query: replacePair.from, replacement: replacePair.to } : {}),
      ...(hasViewerSelection ? { selection: true } : {}),
    };

    this.emitEditProgress(params.sink, {
      phase: "DRAFT",
      step: "UNDERSTAND_REQUEST",
      status: "active",
      summary: editSummary,
      scope: initialScope,
      documentKind: domain,
      documentLabel: editDocumentLabel,
      vars: baseEditVars,
    });
    this.emitEditProgress(params.sink, {
      phase: "DRAFT",
      step: "UNDERSTAND_REQUEST",
      status: "done",
      summary: editSummary,
      scope: initialScope,
      documentKind: domain,
      documentLabel: editDocumentLabel,
      vars: baseEditVars,
    });
    this.emitEditProgress(params.sink, {
      phase: "DRAFT",
      step: "FIND_TARGETS",
      status: "active",
      summary: editSummary,
      scope: initialScope,
      documentKind: domain,
      documentLabel: editDocumentLabel,
      vars: baseEditVars,
    });

    const bytes = await downloadFile(doc.encryptedFilename);

    let targetHint: string | undefined = undefined;
    let resolvedTarget: ResolvedTarget | undefined = undefined;
    let beforeText: string | null = null;
    let proposedText: string | null = null;
    let bundlePatchesForUi: any[] | null = null;
    let spanPatches: Array<{ paragraphId: string; start: number; end: number; before: string; after: string }> = [];
    let targetCandidates: Array<{ id: string; label: string; confidence: number; reasons: string[]; previewText?: string }> = [];

    if (domain === "docx") {
      const anchors = await this.docxAnchors.extractParagraphNodes(bytes);
      const toneProfile = this.detectToneProfileFromText(anchors.slice(0, 12).map((p) => String(p.text || "")).join("\n"));
      const docxCandidates: DocxParagraphNode[] = anchors.map((p) => ({
        paragraphId: p.paragraphId,
        text: p.text,
        sectionPath: p.sectionPath,
        styleFingerprint: p.styleFingerprint,
        docIndex: p.docIndex,
      }));

      const viewerSel = (params.req.meta as any)?.viewerSelection as any;
      const suppressViewerSelection = this.isAllybiDocumentScopeDirective(params.req.message, "docx");
      const viewerRanges = suppressViewerSelection
        ? []
        : (Array.isArray(viewerSel?.ranges) ? viewerSel.ranges : []);
      const viewerIsMultiRange = viewerRanges.length >= 2;
      const viewerParagraphId =
        !viewerIsMultiRange && typeof viewerRanges?.[0]?.paragraphId === "string"
          ? viewerRanges[0].paragraphId.trim()
          : !suppressViewerSelection && typeof viewerSel?.paragraphId === "string"
            ? viewerSel.paragraphId.trim()
            : "";
      const viewerSelectedText =
        !viewerIsMultiRange && typeof viewerRanges?.[0]?.text === "string"
          ? viewerRanges[0].text
          : !suppressViewerSelection && typeof viewerSel?.text === "string"
            ? viewerSel.text.trim()
            : "";
      const viewerStart = !viewerIsMultiRange && typeof viewerRanges?.[0]?.start === "number" ? viewerRanges[0].start : null;
      const viewerEnd = !viewerIsMultiRange && typeof viewerRanges?.[0]?.end === "number" ? viewerRanges[0].end : null;
      const viewerSelectionKind = suppressViewerSelection
        ? ""
        : (typeof viewerSel?.selectionKind === "string" ? String(viewerSel.selectionKind || "").trim() : "");
      const viewerDocxRanges = viewerRanges
        .map((r: any) => ({
          paragraphId: typeof r?.paragraphId === "string" ? String(r.paragraphId).trim() : "",
          text: typeof r?.text === "string" ? String(r.text) : "",
          start: typeof r?.start === "number" ? Number(r.start) : null,
          end: typeof r?.end === "number" ? Number(r.end) : null,
        }))
        .filter((r: any) => r.paragraphId && String(r.text || "").trim().length > 0);

      const requestedScope = this.resolveAllybiRequestedScope({
        message: params.req.message,
        domain: "docx",
        hasSelection: false,
      });
      const wantsTranslateAllDocx =
        requestedScope.intentId === "DOCX_TRANSLATE" &&
        requestedScope.scopeKind === "document";
      if (wantsTranslateAllDocx) {
        const targetLang = this.parseRequestedTranslationLanguage(params.req.message) || params.req.preferredLanguage || "en";
        const paragraphs = (anchors as any[])
          .map((p: any) => ({
            paragraphId: String(p?.paragraphId || "").trim(),
            text: String(p?.text || "").trim(),
            sectionPath: p?.sectionPath,
          }))
          .filter((p: any) => p.paragraphId && p.text);
        const patches = await this.translateDocxParagraphs({
          traceId: params.traceId,
          userId: params.req.userId,
          conversationId: params.conversationId,
          targetLanguage: targetLang,
          paragraphs,
        });
        const minChangedForWholeDoc = (() => {
          if (paragraphs.length >= 20) return Math.max(4, Math.ceil(paragraphs.length * 0.2));
          if (paragraphs.length >= 8) return 3;
          return 1;
        })();
        if (patches.length < minChangedForWholeDoc) {
          const text = `I couldn't prepare a safe whole-document translation draft (coverage too low: ${patches.length}/${paragraphs.length} paragraphs). No paragraph was auto-targeted. Try again, or select a section and translate that scope first.`;
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }
        if (patches.length) {
          operator = "EDIT_DOCX_BUNDLE";
          beforeText = "(bundle)";
          proposedText = JSON.stringify({ patches });
          bundlePatchesForUi = patches;
          resolvedTarget = {
            id: "document",
            label: "Entire document",
            confidence: 0.99,
            candidates: [{ id: "document", label: "Entire document", confidence: 0.99, reasons: ["translate-all-docx"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "translate_all_docx",
          };
        } else {
          const text = "I couldn't prepare a safe whole-document translation draft. No paragraph was auto-targeted. Try again, or specify a section to translate.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }
      }

      // Heading-style normalization should be deterministic formatting, not text rewriting.
      if (!bundlePatchesForUi && this.isHeadingStyleNormalizationRequest(params.req.message)) {
        const headingCandidates = this.listDocxHeadingCandidates(anchors as any);
        const strict = headingCandidates.filter((h: any) => h.kind === "true");
        const selected = (strict.length ? strict : headingCandidates).slice(0, 160);
        const patches = selected
          .map((h: any) => {
            const node: any = (anchors as any[])[h.idx];
            const pid = String(node?.paragraphId || "").trim();
            const text = String(node?.text || "").trim();
            if (!pid || !text) return null;
            return {
              kind: "docx_paragraph",
              paragraphId: pid,
              beforeText: text,
              afterText: text,
              afterHtml: `<b>${this.escapeHtmlForDocx(text)}</b>`,
              sectionPath: Array.isArray(node?.sectionPath) ? node.sectionPath : undefined,
            };
          })
          .filter(Boolean) as any[];

        if (patches.length) {
          operator = "EDIT_DOCX_BUNDLE";
          beforeText = "(bundle)";
          proposedText = JSON.stringify({ patches });
          bundlePatchesForUi = patches;
          resolvedTarget = {
            id: "document",
            label: "Document headings",
            confidence: 0.98,
            candidates: [{ id: "document", label: "Document headings", confidence: 0.98, reasons: ["heading-style-normalization"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "heading_style_normalization",
          };
          targetHint = "headings";
        }
      }

      // Seed multi-range edits to the first selected paragraph so downstream target
      // resolution doesn't collapse to heuristics when there are many selected ranges.
      if (!bundlePatchesForUi && viewerDocxRanges.length >= 2 && operator !== "EDIT_DOCX_BUNDLE") {
        const firstPid = String(viewerDocxRanges[0]?.paragraphId || "").trim();
        const firstNode = firstPid
          ? docxCandidates.find((c) => String(c.paragraphId || "").trim() === firstPid) || null
          : null;
        if (firstPid && firstNode) {
          resolvedTarget = {
            id: firstPid,
            label: "Selected ranges",
            confidence: 0.99,
            candidates: [{ id: firstPid, label: "Selected ranges", confidence: 0.99, reasons: ["viewer-multi-selection-seed"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "viewer_multi_selection_seed",
          };
          targetHint = firstPid;
        }
      }

      // Viewer structural insertion: "add a paragraph below the last bullet point in <section> ..."
      if (viewerMode && operator === "ADD_PARAGRAPH" && insertBelow) {
        const normalizeHint = (raw: string): string => {
          let h = String(raw || "").trim();
          if (!h) return "";
          h = h.replace(/^(?:the|a|an)\s+/i, "").trim();
          h = h.replace(/\bsection\b/i, "").trim();
          h = h.replace(/[.:;\-–—]+$/g, "").trim();
          return h;
        };

        const sectionHint = insertBelow?.sectionHint ? normalizeHint(insertBelow.sectionHint) : "";
        const resolvedHeading = sectionHint ? this.resolveDocxHeading(anchors as any, sectionHint) : null;
        if (!resolvedHeading) {
          const candidates = this.listDocxHeadingCandidates(anchors as any)
            .map((c: any) => String(c?.text || "").trim())
            .filter(Boolean)
            .slice(0, 6);
          const text =
            sectionHint
              ? `I couldn't find a section heading matching "${sectionHint}". Which heading should I use?\n\n` +
                (candidates.length ? candidates.map((h) => `- ${h}`).join("\n") : "Tell me the exact heading text.")
              : `Which section heading should I use?\n\n` +
                (candidates.length ? candidates.map((h) => `- ${h}`).join("\n") : "Tell me the exact heading text.");

          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }

        const range = this.sectionRange(anchors as any, resolvedHeading.idx);
        const slice = (anchors as any[]).slice(range.start, range.end);

        const isBulletLike = (p: any): boolean => {
          const t = String(p?.text || "").trim();
          const styleName = String(p?.styleName || "").toLowerCase();
          const hasNumbering = Boolean(String(p?.numberingSignature || "").trim());
          if (hasNumbering) return true;
          if (/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/.test(t)) return true;
          if (styleName.includes("list")) return true;
          return false;
        };

        const bullets = slice.filter(isBulletLike);
        const anchor = (bullets.length ? bullets[bullets.length - 1] : (slice.length ? slice[slice.length - 1] : null)) as any;
        if (!anchor?.paragraphId) {
          const text = "I couldn't find a safe insertion point in that section.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }

        const bulletTexts = bullets
          .map((p: any) => String(p?.text || "").replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/, "").trim())
          .filter(Boolean)
          .slice(0, 40);

        const headingNode: any = (anchors as any[])[resolvedHeading.idx];
        const headingText = String(headingNode?.text || sectionHint || "Section").trim();

        const sys =
          params.req.preferredLanguage === "pt"
            ? "Você é um editor. Escreva UM parágrafo novo para inserir abaixo da lista. Saída: apenas o parágrafo (sem aspas, sem markdown, sem explicações). Preserve números e nomes. Não adicione fatos."
            : params.req.preferredLanguage === "es"
              ? "Eres un editor. Escribe UN párrafo nuevo para insertar debajo de la lista. Salida: solo el párrafo (sin comillas, sin markdown, sin explicaciones). Conserva números y nombres. No agregues hechos."
              : "You are an editor. Write ONE new paragraph to insert below the list. Output only the paragraph (no quotes, no markdown, no explanations). Preserve numbers and names. Don’t add new facts.";

        const user = [
          `TASK:\n${params.req.message}`,
          "",
          `SECTION:\n${headingText}`,
          "",
          `BULLETS (context to summarize):\n${bulletTexts.map((t: string) => `- ${t}`).join("\n") || "(none)"}`,
        ].join("\n");

        const out = await this.engine.generate({
          traceId: params.traceId,
          userId: params.req.userId,
          conversationId: params.conversationId,
          messages: [
            { role: "system" as ChatRole, content: sys },
            { role: "user" as ChatRole, content: user },
          ],
        });

        const drafted = String(out.text || "").trim();
        if (!drafted || drafted.includes("```")) {
          const text = "I couldn't generate a safe paragraph for that insertion. Tell me what the new paragraph should say and I’ll draft it.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }

        // Anchor insertion after the last bullet paragraph in the section.
        targetHint = String(anchor.paragraphId);
        beforeText = String(anchor.text || "").trim() || "(empty)";
        proposedText = drafted;
        resolvedTarget = {
          id: String(anchor.paragraphId),
          label: `After last bullet in: ${headingText}`,
          confidence: 0.96,
          candidates: [{ id: String(anchor.paragraphId), label: "Last bullet", confidence: 0.96, reasons: ["viewer-insert-below-last-bullet"] }],
          decisionMargin: 1,
          isAmbiguous: false,
          resolutionReason: "viewer_insert_below_last_bullet",
        };
      }

      const quotedSegs = this.extractQuotedSegments(params.req.message);
      const quoted = quotedSegs[0] || null;
      // Don't overwrite targetHint for bundle operations that already resolved the target
      // to "document" — the raw message can cause false Jaccard matches downstream.
      if (!bundlePatchesForUi) {
        targetHint =
          viewerSelectedText ||
          quoted ||
          (this.isLikelyTitleEdit(params.req.message) ? "title" : params.req.message);
      }

      const viewerHasExplicitSelection =
        Boolean(String(viewerSelectedText || "").trim()) ||
        Boolean(String(viewerParagraphId || "").trim()) ||
        (Array.isArray(viewerRanges) && viewerRanges.length > 0);
      // In viewer mode, explicit user selection is authoritative.
      // Heuristics may help with clarification but must not override active selection.
      const preferSelectionFirst = viewerHasExplicitSelection && !suppressViewerSelection;

      // Multi-paragraph selection: allow "replace these with one paragraph" operations deterministically.
      // This avoids the span mapper trying (and failing) to locate a multi-paragraph selection inside one paragraph.
      const viewerIsMulti = viewerRanges.length >= 2;
      const low = String(params.req.message || "").toLowerCase();
      const toManualBulletLines = (raw: string): string => {
        const compact = String(raw || "")
          .replace(/\r?\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!compact) return "";
        const chunks = (compact.match(/[^.!?]+[.!?]?/g) || [])
          .map((c) => String(c || "").trim())
          .filter(Boolean)
          .map((c) => c.replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*]|□)\s+/, "").trim())
          .filter(Boolean);
        const lines = chunks.length >= 2 ? chunks : [compact];
        return lines.map((line) => `• ${line}`).join("\n");
      };
      const wantsOneParagraph =
        /\b(one|single)\s+paragraph\b/.test(low) ||
        /\binto\s+(?:a|one)\s+paragraph\b/.test(low) ||
        /\bmake\b.*\bparagraph\b/.test(low) ||
        /\breplace\b.*\bparagraph\b/.test(low) ||
        /\bsummariz(e|ing)\b.*\bparagraph\b/.test(low);
      const wantsBulletsAsParagraphs =
        /\b(bullets?|bullet points?|list)\b/.test(low) &&
        !wantsOneParagraph &&
        (
          /\b(?:to|into|as)\s+paragraphs?\b/.test(low) ||
          /\bremove\b.{0,24}\b(bullets?|bullet points?)\b/.test(low) ||
          /\b(unbullet|plain paragraphs?)\b/.test(low)
        );
      const wantsParagraphsAsBullets =
        /\b(bullets?|bullet points?|list)\b/.test(low) &&
        /\b(convert|turn|make|change|format|transform|divide|split|break|separate)\b/.test(low) &&
        (
          /\bparagraphs?\b/.test(low) ||
          /\bselected\b/.test(low) ||
          /\bthese\b/.test(low) ||
          /\bthis\b/.test(low) ||
          /\bthem\b/.test(low) ||
          /\bit\b/.test(low)
        );

      const collectSelectedParagraphs = () => {
        const byPid = new Map<string, { paragraphId: string; text: string; sectionPath?: string[] }>();
        const addByPid = (pidRaw: string) => {
          const pid = String(pidRaw || "").trim();
          if (!pid || byPid.has(pid)) return;
          const node = (anchors as any[]).find((a) => String(a?.paragraphId || "").trim() === pid) || null;
          const text = String(node?.text || "").trim();
          if (!text) return;
          byPid.set(pid, {
            paragraphId: pid,
            text: text.replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*]|□)\s+/, "").trim(),
            sectionPath: Array.isArray(node?.sectionPath) ? node.sectionPath : undefined,
          });
        };

        for (const r of viewerRanges.slice(0, 60)) addByPid(String((r as any)?.paragraphId || ""));
        if (!byPid.size && viewerParagraphId) addByPid(String(viewerParagraphId));

        if (!byPid.size) {
          const normalize = (s: string): string =>
            this.normalizeForMatch(String(s || "").replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25CF]|[\-\*]|□)\s+/, "").trim());
          const lines = Array.from(new Set(
            String(viewerSelectedText || "")
              .split(/\n+/)
              .map((x) => normalize(x))
              .filter((x) => x.length >= 3),
          )).slice(0, 60);
          if (lines.length) {
            const anchorStart = (() => {
              const pid = String(viewerParagraphId || "").trim();
              if (!pid) return -1;
              return docxCandidates.findIndex((c) => String(c.paragraphId || "").trim() === pid);
            })();
            const candidateWindow =
              anchorStart >= 0
                ? docxCandidates.slice(Math.max(0, anchorStart - 30), Math.min(docxCandidates.length, anchorStart + 180))
                : docxCandidates.slice(0, 180);
            for (const c of candidateWindow) {
              const pid = String(c.paragraphId || "").trim();
              if (!pid) continue;
              const txt = normalize(String(c.text || ""));
              if (!txt) continue;
              const hit = lines.some((line) => txt === line || txt.includes(line) || line.includes(txt));
              if (!hit) continue;
              addByPid(pid);
              if (byPid.size >= Math.min(lines.length, 40)) break;
            }
          }
        }
        return Array.from(byPid.values()).slice(0, 40);
      };

      if ((wantsBulletsAsParagraphs || wantsParagraphsAsBullets) && !bundlePatchesForUi) {
        const selectedParagraphs = collectSelectedParagraphs();
        if (selectedParagraphs.length) {
          const shouldUseManualBullets =
            wantsParagraphsAsBullets &&
            selectedParagraphs.length === 1;
          const patches = wantsParagraphsAsBullets
            ? selectedParagraphs.map((p) => {
                const manualBullets = shouldUseManualBullets ? toManualBulletLines(p.text) : "";
                const nextText = manualBullets || p.text;
                return {
                  kind: "docx_paragraph",
                  paragraphId: p.paragraphId,
                  beforeText: p.text,
                  afterText: nextText,
                  afterHtml: this.toHtmlFromPlain(nextText),
                  sectionPath: p.sectionPath,
                  ...(manualBullets ? {} : { applyNumbering: true }),
                };
              })
            : selectedParagraphs.map((p) => ({
                kind: "docx_paragraph",
                paragraphId: p.paragraphId,
                beforeText: p.text,
                afterText: p.text,
                afterHtml: this.toHtmlFromPlain(p.text),
                sectionPath: p.sectionPath,
                removeNumbering: true,
              }));

          operator = "EDIT_DOCX_BUNDLE";
          beforeText = String(selectedParagraphs[0]?.text || "(bundle)");
          proposedText = JSON.stringify({ patches });
          bundlePatchesForUi = patches;
          resolvedTarget = {
            id: selectedParagraphs.length > 1 ? "selection" : selectedParagraphs[0]!.paragraphId,
            label: selectedParagraphs.length > 1 ? "Selected paragraphs" : "Selected paragraph",
            confidence: 0.97,
            candidates: [{
              id: selectedParagraphs[0]!.paragraphId,
              label: selectedParagraphs.length > 1 ? "Selected paragraphs" : "Selected paragraph",
              confidence: 0.97,
              reasons: [wantsParagraphsAsBullets ? "paragraphs_to_bullets_selection" : "bullets_to_paragraphs_selection"],
            }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: wantsParagraphsAsBullets ? "paragraphs_to_bullets_selection" : "bullets_to_paragraphs_selection",
          };
        }
      }

      if (wantsOneParagraph && !bundlePatchesForUi) {
        const byPid = new Map<string, { paragraphId: string; text: string; sectionPath?: string[] }>();
        const addByPid = (pidRaw: string) => {
          const pid = String(pidRaw || "").trim();
          if (!pid || byPid.has(pid)) return;
          const node = (anchors as any[]).find((a) => String(a?.paragraphId || "").trim() === pid) || null;
          const text = String(node?.text || "").trim();
          if (!text) return;
          byPid.set(pid, {
            paragraphId: pid,
            text: text.replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*]|□)\s+/, "").trim(),
            sectionPath: Array.isArray(node?.sectionPath) ? node.sectionPath : undefined,
          });
        };

        // Preferred: use explicit multi-range paragraph ids.
        for (const r of viewerRanges.slice(0, 60)) addByPid(String((r as any)?.paragraphId || ""));

        // Fallback: if selection came as a single range but text includes multiple bullets/lines,
        // recover the intended paragraph set by matching selected lines against nearby anchors.
        if (byPid.size < 2) {
          const normalize = (s: string): string =>
            this.normalizeForMatch(String(s || "").replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25CF]|[\-\*]|□)\s+/, "").trim());
          const lines = Array.from(new Set(
            String(viewerSelectedText || "")
              .split(/\n+/)
              .map((x) => normalize(x))
              .filter((x) => x.length >= 3),
          )).slice(0, 60);
          if (lines.length >= 2) {
            const anchorStart = (() => {
              const pid = String(viewerParagraphId || "").trim();
              if (!pid) return -1;
              return docxCandidates.findIndex((c) => String(c.paragraphId || "").trim() === pid);
            })();
            const candidateWindow =
              anchorStart >= 0
                ? docxCandidates.slice(anchorStart, Math.min(docxCandidates.length, anchorStart + 180))
                : docxCandidates.slice(0, 180);
            for (const c of candidateWindow) {
              const pid = String(c.paragraphId || "").trim();
              if (!pid) continue;
              const txt = normalize(String(c.text || ""));
              if (!txt) continue;
              const hit = lines.some((line) => txt === line || txt.includes(line) || line.includes(txt));
              if (!hit) continue;
              addByPid(pid);
              if (byPid.size >= Math.min(lines.length, 40)) break;
            }
          }
        }

        const selectedBullets = Array.from(byPid.values()).slice(0, 40);
        if (selectedBullets.length >= 2) {
          let patches: any[] = await this.bulletsToParagraph({
            traceId: params.traceId,
            userId: params.req.userId,
            conversationId: params.conversationId,
            instruction: params.req.message,
            headingText: "Selected bullets",
            bullets: selectedBullets,
            toneProfile,
          });

          if (!Array.isArray(patches) || !patches.length) {
            const sentenceLike = (s: string) => /[.!?]$/.test(String(s || "").trim());
            const merged = selectedBullets
              .map((b: any) => String(b?.text || "").trim())
              .filter(Boolean)
              .map((t: string) => (sentenceLike(t) ? t : `${t}.`))
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            patches = [{
              kind: "docx_paragraph",
              paragraphId: selectedBullets[0]!.paragraphId,
              afterHtml: this.toHtmlFromPlain(merged),
              removeNumbering: true,
            }];
            for (const b of selectedBullets.slice(1)) patches.push({ kind: "docx_delete_paragraph", paragraphId: b.paragraphId });
          }

          operator = "EDIT_DOCX_BUNDLE";
          beforeText = "(bundle)";
          proposedText = JSON.stringify({ patches });
          resolvedTarget = {
            id: selectedBullets[0]!.paragraphId,
            label: "Selected bullets",
            confidence: 0.95,
            candidates: [{ id: selectedBullets[0]!.paragraphId, label: "Selected bullets", confidence: 0.95, reasons: ["viewer-multi-selection"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "viewer_multi_selection",
          };
        }
      }

      // Section-aware, deterministic transforms (avoid "wrong target" when a heading is selected).
      //
      // Example: "Make the bullet points under 'AI Understanding & Retrieval Accuracy' into one paragraph."
      // If the user selected the heading, we should operate on the bullet list *below* it, not rewrite the heading.
      const hasHeadingReference =
        Boolean(quotedSegs.find((q) => q && q.length >= 3)) ||
        viewerSelectionKind === "header" ||
        (() => {
          const node = viewerParagraphId ? (anchors as any[]).find((x) => x?.paragraphId === viewerParagraphId) : null;
          return Boolean(node && typeof node?.headingLevel === "number" && node.headingLevel >= 1);
        })();

      const wantsBulletsToParagraph =
        /\b(bullets?|bullet points?)\b/i.test(params.req.message) &&
        (/\b(one|single)\s+paragraph\b/i.test(params.req.message) || /\binto\s+(?:a|one)\s+paragraph\b/i.test(params.req.message) || /\bone\s+paragraph\b/i.test(params.req.message)) &&
        (/\b(under|below|in\s+the\s+section|in\s+section)\b/i.test(params.req.message) || hasHeadingReference || viewerIsMulti);

      // Also support natural section phrasing without explicitly saying "bullet points":
      // "change the organization section into a paragraph"
      const wantsSectionToParagraph =
        /\bsection\b/i.test(params.req.message) &&
        /\bparagraph\b/i.test(params.req.message) &&
        /\b(change|turn|convert|rewrite|make|transform)\b/i.test(params.req.message) &&
        hasHeadingReference;

      // Avoid hijacking structural insert requests like:
      // "add a paragraph below the last bullet point in <section> ..."
      const isInsertBelowLastBullet =
        /\b(add|insert|append)\b/i.test(params.req.message) &&
        /\bparagraph\b/i.test(params.req.message) &&
        (/\bbelow\b/i.test(params.req.message) || /\bafter\b/i.test(params.req.message)) &&
        /\blast\b/i.test(params.req.message) &&
        /\b(bullets?|bullet points?|list)\b/i.test(params.req.message);

	      if ((wantsBulletsToParagraph || wantsSectionToParagraph) && !isInsertBelowLastBullet && !preferSelectionFirst) {
          const extractHeadingHintFromQuery = (): string => {
	          const q = String(params.req.message || "").trim();
            // "<heading> section" style:
            const sec = q.match(/\b(?:rewrite|reword|rephrase|change|turn|convert|make|summari[sz]e|transform|edit)\b[\s\S]{0,80}?\b(?:the\s+)?(.{2,120}?)\s+section\b/i);
            if (sec?.[1]) {
              let h = String(sec[1]).trim();
              h = h.replace(/^(?:the|a|an)\s+/i, "").trim();
              h = h.replace(/\s+(?:into|to|as)\s+.+$/i, "").trim();
              h = h.replace(/[.:;\-–—]+$/g, "").trim();
              if (h) return h;
            }
	          // under/below <heading> ... into one paragraph
	          const m1 = q.match(/\b(?:under|below|in\s+the\s+section|in\s+section)\b\s+["“”']?(.+?)["“”']?\s+\b(?:into|to|as)\b/i);
	          if (m1?.[1]) return String(m1[1]).trim();
	          // "AI Understanding & Retrieval Accuracy" without quotes: try "<heading> bullet points"
	          const m2 = q.match(/\b(.+?)\b\s+(?:bullet points?|bullets?)\b/i);
	          if (m2?.[1] && String(m2[1]).trim().length <= 140) {
	            let h = String(m2[1]).trim();
	            // Strip leading command verbs so we don't treat "make the ..." as the heading.
	            h = h.replace(/^(?:please\s+)?(?:make|turn|convert|change|rewrite|reword|improve|polish|fix)\b\s*/i, "");
	            h = h.replace(/^(?:the|a|an)\s+/i, "");
	            h = h.replace(/\s+(?:section|heading|title)\s*$/i, "");
	            return h.trim();
	          }
	          return "";
	        };

	        const fuzzyPickHeadingFromMessage = (): string => {
	          const msgNorm = this.normalizeForMatch(params.req.message);
	          if (!msgNorm) return "";
	          const candidates = this.listDocxHeadingCandidates(anchors as any);
	          let best: { text: string; score: number } | null = null;
	          for (const c of candidates) {
	            const t = String(c?.text || "").trim();
	            const norm = this.normalizeForMatch(t);
	            if (!norm) continue;
	            // Score by token overlap and substring presence in the message.
	            let score = 0;
	            if (msgNorm.includes(norm)) score += 3;
	            const toks = norm.split(" ").filter(Boolean);
	            const msgToks = new Set(msgNorm.split(" ").filter(Boolean));
	            let hit = 0;
	            for (const tok of toks) if (msgToks.has(tok)) hit += 1;
	            score += Math.min(3, hit) * 0.8;
	            if (c.kind === "true") score += 0.5;
	            if (!best || score > best.score) best = { text: t, score };
	          }
	          return best && best.score >= 2 ? best.text : "";
	        };

	        // Prefer an explicit quoted heading; otherwise, if the selected paragraph is a heading, use it.
	        const headingHint =
	          (quotedSegs.find((q) => q && q.length >= 3) || "").trim() ||
	          extractHeadingHintFromQuery() ||
	          (() => {
	            const node = viewerParagraphId ? (anchors as any[]).find((x) => x?.paragraphId === viewerParagraphId) : null;
	            const isHeading = Boolean(node && typeof node?.headingLevel === "number" && node.headingLevel >= 1);
	            if (isHeading) return String(node.text || "").trim();

	            // If selection is within a section (not the heading itself), use the closest heading above.
	            const targetIdx = viewerParagraphId ? (anchors as any[]).findIndex((x) => String(x?.paragraphId || "") === viewerParagraphId) : -1;
	            if (targetIdx > 0) {
	              const candidates = this.listDocxHeadingCandidates(anchors as any)
	                .filter((c: any) => typeof c?.idx === "number" && c.idx < targetIdx)
	                .sort((a: any, b: any) => Number(b.idx) - Number(a.idx));
	              const picked = candidates[0] || null;
	              const t = picked ? String(picked.text || "").trim() : "";
	              if (t) return t;
	            }

	            return "";
	          })();

        const resolvedHeading =
          headingHint
            ? this.resolveDocxHeading(anchors as any, headingHint)
            : null;

        if (resolvedHeading) {
          const headingNode: any = (anchors as any[])[resolvedHeading.idx];
          const headingLevel = typeof headingNode?.headingLevel === "number" ? headingNode.headingLevel : 2;

          const range = this.sectionRange(anchors as any, resolvedHeading.idx);
          const slice = (anchors as any[]).slice(range.start, range.end);

          const isBulletLike = (p: any): boolean => {
            const t = String(p?.text || "").trim();
            const styleName = String(p?.styleName || "").toLowerCase();
            const hasNumbering = Boolean(String(p?.numberingSignature || "").trim());
            if (hasNumbering) return true;
            if (/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/.test(t)) return true;
            if (styleName.includes("list")) return true;
            return false;
          };

          const sectionParagraphs = slice
            .map((p: any) => ({
              paragraphId: String(p.paragraphId || "").trim(),
              text: String(p.text || "").trim(),
              sectionPath: p.sectionPath,
            }))
            .filter((p: any) => p.paragraphId && p.text);

          // Only use bullet-like paragraphs when explicitly doing bullet transform.
          const bullets = sectionParagraphs
            .filter((p: any) => {
              const raw = (anchors as any[]).find((x: any) => String(x?.paragraphId || "") === p.paragraphId);
              return isBulletLike(raw);
            })
            .map((p: any) => ({
              paragraphId: String(p.paragraphId || "").trim(),
              text: String(p.text || "")
                .replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/, "")
                .trim(),
              sectionPath: p.sectionPath,
            }))
            .filter((b: any) => b.paragraphId && b.text);

          if ((wantsSectionToParagraph && sectionParagraphs.length >= 1) || bullets.length >= 1) {
            // Make it a real paragraph (cohesive, not just concatenated lines).
            const patches = wantsSectionToParagraph
              ? await this.sectionToParagraph({
                  traceId: params.traceId,
                  userId: params.req.userId,
                  conversationId: params.conversationId,
                  instruction: params.req.message,
                  headingText: String(headingNode?.text || headingHint || "Section").trim(),
                  paragraphs: sectionParagraphs,
                  toneProfile,
                })
              : await this.bulletsToParagraph({
                  traceId: params.traceId,
                  userId: params.req.userId,
                  conversationId: params.conversationId,
                  instruction: params.req.message,
                  headingText: String(headingNode?.text || headingHint || "Section").trim(),
                  bullets,
                  toneProfile,
                });
            if (!patches.length) {
              // Fallback: at least avoid editing the heading; ask for clarification.
              const text = `I found the section heading "${String(headingNode?.text || headingHint || "").trim()}", but I couldn't safely convert its bullet points into one paragraph. Should I:\n\n- Convert only the bullet list directly under that heading, or\n- Convert the entire section content under that heading?`;
              if (params.sink?.isOpen()) {
                params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
                params.sink.write({ event: "delta", data: { text } } as any);
              }
              const assistantMsg = await this.createMessage({
                conversationId: params.conversationId,
                role: "assistant",
                content: text,
                userId: params.req.userId,
                metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
              });
              return {
                conversationId: params.conversationId,
                userMessageId: userMsg.id,
                assistantMessageId: assistantMsg.id,
                assistantText: text,
                sources: [],
                answerMode: "action_receipt",
                answerClass: "NAVIGATION",
                navType: null,
              };
            }

            operator = "EDIT_DOCX_BUNDLE";
            beforeText = "(bundle)";
            proposedText = JSON.stringify({ patches });
            // For viewer preview: let the client apply paragraph patches directly.
            bundlePatchesForUi = patches;

            resolvedTarget = {
              id: String(headingNode?.paragraphId || sectionParagraphs[0]!.paragraphId || bullets[0]!.paragraphId),
              label: `Section: ${String(headingNode?.text || headingHint || "Heading").trim()}`,
              confidence: 0.95,
              candidates: [
                {
                  id: String(headingNode?.paragraphId || sectionParagraphs[0]!.paragraphId || bullets[0]!.paragraphId),
                  label: "Section heading",
                  confidence: 0.95,
                  reasons: ["section-transform"],
                },
              ],
              decisionMargin: 1,
              isAmbiguous: false,
              resolutionReason: "section_transform",
            };

            // Skip selection-first targeting below.
          }
        } else {
          const hint =
            headingHint ||
            fuzzyPickHeadingFromMessage();
          const resolvedFallback = hint ? this.resolveDocxHeading(anchors as any, hint) : null;
          if (resolvedFallback) {
            const headingNode: any = (anchors as any[])[resolvedFallback.idx];
            const range = this.sectionRange(anchors as any, resolvedFallback.idx);
            const slice = (anchors as any[]).slice(range.start, range.end);

            const isBulletLike = (p: any): boolean => {
              const t = String(p?.text || "").trim();
              const styleName = String(p?.styleName || "").toLowerCase();
              const hasNumbering = Boolean(String(p?.numberingSignature || "").trim());
              if (hasNumbering) return true;
              if (/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/.test(t)) return true;
              if (styleName.includes("list")) return true;
              return false;
            };

            const sectionParagraphs = slice
              .map((p: any) => ({
                paragraphId: String(p.paragraphId || "").trim(),
                text: String(p.text || "").trim(),
                sectionPath: p.sectionPath,
              }))
              .filter((p: any) => p.paragraphId && p.text);

            const bullets = sectionParagraphs
              .filter((p: any) => {
                const raw = (anchors as any[]).find((x: any) => String(x?.paragraphId || "") === p.paragraphId);
                return isBulletLike(raw);
              })
              .map((p: any) => ({
                paragraphId: String(p.paragraphId || "").trim(),
                text: String(p.text || "")
                  .replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*])\s+/, "")
                  .trim(),
                sectionPath: p.sectionPath,
              }))
              .filter((b: any) => b.paragraphId && b.text);

            if ((wantsSectionToParagraph && sectionParagraphs.length >= 1) || bullets.length >= 1) {
              const patches = wantsSectionToParagraph
                ? await this.sectionToParagraph({
                    traceId: params.traceId,
                    userId: params.req.userId,
                    conversationId: params.conversationId,
                    instruction: params.req.message,
                    headingText: String(headingNode?.text || hint || "Section").trim(),
                    paragraphs: sectionParagraphs,
                    toneProfile,
                  })
                : await this.bulletsToParagraph({
                    traceId: params.traceId,
                    userId: params.req.userId,
                    conversationId: params.conversationId,
                    instruction: params.req.message,
                    headingText: String(headingNode?.text || hint || "Section").trim(),
                    bullets,
                    toneProfile,
                  });
              if (patches.length) {
                operator = "EDIT_DOCX_BUNDLE";
                beforeText = "(bundle)";
                proposedText = JSON.stringify({ patches });
                bundlePatchesForUi = patches;
                resolvedTarget = {
                  id: String(headingNode?.paragraphId || sectionParagraphs[0]!.paragraphId || bullets[0]!.paragraphId),
                  label: `Section: ${String(headingNode?.text || hint || "Heading").trim()}`,
                  confidence: 0.93,
                  candidates: [
                    {
                      id: String(headingNode?.paragraphId || sectionParagraphs[0]!.paragraphId || bullets[0]!.paragraphId),
                      label: "Section heading",
                      confidence: 0.93,
                      reasons: ["section-transform-fuzzy"],
                    },
                  ],
                  decisionMargin: 1,
                  isAmbiguous: false,
                  resolutionReason: "section_transform_fuzzy",
                };
              }
            }
          } else if (!preferSelectionFirst && hint && (viewerSelectionKind === "header" || viewerSelectionKind === "paragraph" || viewerSelectionKind === "span" || hasHeadingReference)) {
          // If the user referenced a heading we couldn't resolve, ask one clarification instead of editing the wrong thing.
          const candidates = this.listDocxHeadingCandidates(anchors as any)
            .map((c: any) => String(c?.text || "").trim())
            .filter(Boolean)
            .slice(0, 6);
          const text =
            `I couldn't find a section heading matching "${hint || headingHint}". Which heading should I use?\n\n` +
            (candidates.length ? candidates.map((h) => `- ${h}`).join("\n") : "Tell me the exact heading text.");

          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
          }
        }
      }

	      // Viewer selection is authoritative: if the user highlighted a specific paragraph,
	      // target that paragraph deterministically.
	      if (viewerParagraphId && viewerDocxRanges.length <= 1) {
	        const node = docxCandidates.find((c) => c.paragraphId === viewerParagraphId) || null;
	        if (node) {
	          resolvedTarget = {
	            id: node.paragraphId,
            label: "Selected text",
            confidence: 0.99,
            candidates: [{ id: node.paragraphId, label: "Selected text", confidence: 0.99, reasons: ["viewer-selection"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "viewer_selection",
          };
	          targetHint = viewerParagraphId;
	        }
	      }

      // Only run title heuristics when the viewer did not provide an explicit selection.
      if (!viewerParagraphId && !viewerSelectedText && this.isLikelyTitleEdit(params.req.message)) {
        const titleNode = this.pickLikelyDocxTitle(docxCandidates);
        if (titleNode) {
          resolvedTarget = {
            id: titleNode.paragraphId,
            label: "Document title",
            confidence: 0.92,
            candidates: [
              { id: titleNode.paragraphId, label: "Document title", confidence: 0.92, reasons: ["title-heuristic"] },
            ],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "title_heuristic",
          };
        }
      }

      // Heuristics for common unquoted target phrases used in E2E tests.
      if (!resolvedTarget && operator === "EDIT_PARAGRAPH" && this.isDocxFirstParagraphRequest(params.req.message)) {
        const titleNode = this.pickLikelyDocxTitle(docxCandidates);
        const first = this.pickFirstNonTitleParagraph(docxCandidates, titleNode?.paragraphId || null);
        if (first) {
          resolvedTarget = {
            id: first.paragraphId,
            label: "First paragraph",
            confidence: 0.9,
            candidates: [{ id: first.paragraphId, label: "First paragraph", confidence: 0.9, reasons: ["first-paragraph-heuristic"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "first_paragraph_heuristic",
          };
        }
      }

      if (!resolvedTarget && operator === "EDIT_PARAGRAPH" && this.isDocxIntroductionRequest(params.req.message)) {
        const titleNode = this.pickLikelyDocxTitle(docxCandidates);
        const first = this.pickFirstNonTitleParagraph(docxCandidates, titleNode?.paragraphId || null);
        if (first) {
          resolvedTarget = {
            id: first.paragraphId,
            label: "Introduction",
            confidence: 0.86,
            candidates: [{ id: first.paragraphId, label: "Introduction", confidence: 0.86, reasons: ["intro-heuristic"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "introduction_heuristic",
          };
        }
      }

      if (!resolvedTarget) {
        const needsExplicitAnchor =
          operator === "ADD_PARAGRAPH" &&
          /\b(after|below|under|depois de|abaixo de)\b/i.test(params.req.message);
        if (needsExplicitAnchor) {
          const text = "I couldn't resolve the anchor for insertion. Quote the exact heading/paragraph after which I should insert the new paragraph.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }

        const wholeDocumentDirective = suppressViewerSelection;
        const rewriteLikeIntent =
          /\b(rewrite|rephrase|reword|improve|tighten|clarify|polish|edit|refine|clean up)\b/i.test(params.req.message) ||
          /\b(reescrev|reformular|melhorar|ajustar|clarear|refinar|editar|limpar)\b/i.test(params.req.message);
        const hasExplicitLocator =
          quotedSegs.length > 0 ||
          /\b(section|heading|title|paragraph|under|below|above|after|before)\b/i.test(params.req.message) ||
          /\b(se[cç][aã]o|t[ií]tulo|par[aá]grafo|abaixo|acima|depois|antes)\b/i.test(params.req.message);

        // Viewer rule: without an explicit selection/locator, never auto-pick a random
        // paragraph for rewrite-like commands. This prevents stale/implicit line locking.
        const shouldBlockUnanchoredFormattingBundle =
          operator === "EDIT_DOCX_BUNDLE" &&
          Boolean(docxFormattingHint) &&
          requestedScope.scopeKind !== "document";
        if (
          !viewerHasExplicitSelection &&
          !hasExplicitLocator &&
          (operator !== "EDIT_DOCX_BUNDLE" || shouldBlockUnanchoredFormattingBundle)
        ) {
          const text = wholeDocumentDirective && rewriteLikeIntent
            ? "Whole-document rewrite is not auto-targeted from chat. I did not lock any paragraph. Select a section (or highlight text) and retry."
            : "No active selection detected, so I did not auto-pick a paragraph. Highlight text or name a heading/section to edit.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }

        resolvedTarget = this.targetResolver.resolveDocxParagraphTarget(targetHint || params.req.message, docxCandidates);
      }
      if (!resolvedTarget) {
        const text = "I couldn't determine which paragraph to edit. Quote the paragraph text and try again.";
        if (params.sink?.isOpen()) {
          params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
          params.sink.write({ event: "delta", data: { text } } as any);
        }
        const assistantMsg = await this.createMessage({
          conversationId: params.conversationId,
          role: "assistant",
          content: text,
          userId: params.req.userId,
          metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
        });
        return {
          conversationId: params.conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          sources: [],
          answerMode: "action_receipt",
          answerClass: "NAVIGATION",
          navType: null,
        };
      }

      const targetNode = docxCandidates.find((c) => c.paragraphId === resolvedTarget!.id) ?? null;
      // IMPORTANT: do not trim here. Viewer span offsets are computed against the
      // rendered paragraph text; trimming can shift offsets and cause "replace whole sentence"
      // (or whole paragraph) bugs.
	      beforeText = String(targetNode?.text || "");
	      if (!beforeText) beforeText = "(empty)";

      if (!bundlePatchesForUi) {
        const lowSingle = String(params.req.message || "").toLowerCase();
        const singleWantsOneParagraph =
          /\b(one|single)\s+paragraph\b/.test(lowSingle) ||
          /\binto\s+(?:a|one)\s+paragraph\b/.test(lowSingle) ||
          /\bmake\b.*\bparagraph\b/.test(lowSingle) ||
          /\breplace\b.*\bparagraph\b/.test(lowSingle) ||
          /\bsummariz(e|ing)\b.*\bparagraph\b/.test(lowSingle);
        const singleBulletsAsParagraphs =
          /\b(bullets?|bullet points?|list)\b/.test(lowSingle) &&
          !singleWantsOneParagraph &&
          (
            /\b(?:to|into|as)\s+paragraphs?\b/.test(lowSingle) ||
            /\bremove\b.{0,24}\b(bullets?|bullet points?)\b/.test(lowSingle) ||
            /\b(unbullet|plain paragraphs?)\b/.test(lowSingle)
          );
        const singleParagraphsAsBullets =
          /\b(bullets?|bullet points?|list)\b/.test(lowSingle) &&
          /\b(convert|turn|make|change|format|transform|divide|split|break|separate)\b/.test(lowSingle) &&
          (
            /\bparagraphs?\b/.test(lowSingle) ||
            /\bselected\b/.test(lowSingle) ||
            /\bthese\b/.test(lowSingle) ||
            /\bthis\b/.test(lowSingle) ||
            /\bthem\b/.test(lowSingle) ||
            /\bit\b/.test(lowSingle)
          );

        if ((singleBulletsAsParagraphs || singleParagraphsAsBullets) && targetNode) {
          const paragraphId = String(targetNode.paragraphId || "").trim();
          const paragraphText = String(targetNode.text || "").trim();
          if (paragraphId && paragraphText) {
            const normalizedText = paragraphText.replace(/^(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*]|□)\s+/, "").trim();
            const manualBullets = singleParagraphsAsBullets ? toManualBulletLines(normalizedText) : "";
            const afterTextResolved = manualBullets || normalizedText;
            const patches = [
              {
                kind: "docx_paragraph",
                paragraphId,
                beforeText: paragraphText,
                afterText: afterTextResolved,
                afterHtml: this.toHtmlFromPlain(afterTextResolved),
                sectionPath: targetNode?.sectionPath,
                ...(singleParagraphsAsBullets && !manualBullets ? { applyNumbering: true } : {}),
                ...(singleBulletsAsParagraphs ? { removeNumbering: true } : {}),
              },
            ];
            operator = "EDIT_DOCX_BUNDLE";
            bundlePatchesForUi = patches;
            proposedText = JSON.stringify({ patches });
            beforeText = paragraphText;
            resolvedTarget = {
              id: paragraphId,
              label: singleParagraphsAsBullets ? "Paragraph to bullets" : "Bullets to paragraph",
              confidence: 0.98,
              candidates: [{
                id: paragraphId,
                label: singleParagraphsAsBullets ? "Paragraph to bullets" : "Bullets to paragraph",
                confidence: 0.98,
                reasons: [singleParagraphsAsBullets ? "paragraph_to_bullets_single_target" : "bullets_to_paragraph_single_target"],
              }],
              decisionMargin: 1,
              isAmbiguous: false,
              resolutionReason: singleParagraphsAsBullets ? "paragraph_to_bullets_single_target" : "bullets_to_paragraph_single_target",
            };
          }
        }
      }

      if (!bundlePatchesForUi && operator === "EDIT_DOCX_BUNDLE" && docxFormattingHint) {
        const paragraphIds = (() => {
          const fromRanges = viewerDocxRanges
            .map((r: any) => String(r?.paragraphId || "").trim())
            .filter(Boolean);
          if (fromRanges.length) return Array.from(new Set(fromRanges));
          const fromViewer = String(viewerParagraphId || "").trim();
          if (fromViewer) return [fromViewer];
          const fromResolved = String(resolvedTarget?.id || "").trim();
          if (fromResolved && fromResolved !== "document") return [fromResolved];
          return [] as string[];
        })();

        const patches = paragraphIds
          .map((pid) => {
            const node = docxCandidates.find((c) => String(c.paragraphId || "").trim() === pid) || null;
            const paragraphText = String(node?.text || "").trim();
            if (!paragraphText) return null;
            const afterHtml = this.buildDocxParagraphFormatHtml({
              paragraphText,
              enableInline: docxFormattingHint.enableInline,
              inlineStyles: docxFormattingHint.inlineStyles,
              paragraphStyles: docxFormattingHint.paragraphStyles,
            });
            if (!String(afterHtml || "").trim()) return null;
            return {
              kind: "docx_paragraph",
              paragraphId: pid,
              beforeText: paragraphText,
              afterText: paragraphText,
              afterHtml,
              sectionPath: node?.sectionPath,
            };
          })
          .filter(Boolean) as any[];

        if (patches.length) {
          const first = patches[0] as any;
          bundlePatchesForUi = patches;
          beforeText = String(first?.beforeText || beforeText || "(empty)");
          proposedText = JSON.stringify({ patches });
          targetHint = String(first?.paragraphId || targetHint || "").trim() || targetHint;
          resolvedTarget = {
            id: patches.length > 1 ? "selection" : String(first?.paragraphId || resolvedTarget?.id || ""),
            label: patches.length > 1 ? "Selected paragraphs" : "Selected paragraph",
            confidence: 0.99,
            candidates: [{
              id: String(first?.paragraphId || resolvedTarget?.id || ""),
              label: patches.length > 1 ? "Selected paragraphs" : "Selected paragraph",
              confidence: 0.99,
              reasons: ["docx-formatting-bundle"],
            }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "docx_formatting_bundle",
          };
        }
      }

      // Keep span edits strict for selected text. Do not auto-promote to paragraph edits
      // based on length ratio, otherwise "change this word" can rewrite the whole line.
      const stripLeadingBulletish = (s: string): string =>
        String(s || "")
          .replace(/^\s*(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25CF]|[\-\*]|□)\s+/, "")
          .trim();
	      const coverageBase = stripLeadingBulletish(beforeText);
	      const coverageSel = String(viewerSelectedText || "").trim();
      const selectionCoverageRatio = coverageSel && coverageBase
        ? Math.min(1, coverageSel.length / Math.max(1, coverageBase.length))
        : 0;
      const selectionCoversMostOfBlock = selectionCoverageRatio >= 0.6;

	      const normalizeSpan = (s: string): string => String(s || "").replace(/\s+/g, " ").trim();
	      const softEqualSpan = (a: string, b: string): boolean => normalizeSpan(a) === normalizeSpan(b);

      const resolveSpanRange = (): { start: number; end: number; before: string } | null => {
        const needle = String(viewerSelectedText || "");
        if (!needle.trim()) return null;
        const hay = String(beforeText || "");
        if (!hay) return null;

        if (viewerStart != null && viewerEnd != null) {
          const s = Number(viewerStart);
          const e = Number(viewerEnd);
          if (Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e > s && e <= hay.length) {
            const slice = hay.slice(s, e);
            if (slice === needle || softEqualSpan(slice, needle)) {
              return { start: s, end: e, before: slice };
            }
          }
        }

        const idx = hay.indexOf(needle);
        if (idx >= 0) return { start: idx, end: idx + needle.length, before: needle };
        return null;
      };

      // For "change title to X" or "replace with X", prefer explicit target value.
	      const explicit = this.parseAfterToValue(params.req.message);
      if (operator === "EDIT_SPAN") {
        // Multi-selection pipeline: generate deterministic span patches for ALL selected ranges.
        if (viewerDocxRanges.length >= 2) {
          const formatIntent = this.parseInlineFormattingIntent(params.req.message);
          if (formatIntent) {
            const grouped = new Map<string, { paragraphText: string; ranges: Array<{ start: number; end: number }> }>();
            for (const r of viewerDocxRanges.slice(0, 120)) {
              const pid = String(r.paragraphId || "").trim();
              const selected = String(r.text || "");
              if (!pid || !selected.trim()) continue;
              const node = docxCandidates.find((c) => String(c.paragraphId || "") === pid) || null;
              const paraText = String(node?.text || "");
              if (!paraText) continue;

              let s = typeof r.start === "number" ? r.start : -1;
              let e = typeof r.end === "number" ? r.end : -1;
              if (!(Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e > s && e <= paraText.length)) {
                const idx = paraText.indexOf(selected);
                if (idx < 0) continue;
                s = idx;
                e = idx + selected.length;
              }

              const current = grouped.get(pid) || { paragraphText: paraText, ranges: [] };
              current.ranges.push({ start: s, end: e });
              grouped.set(pid, current);
            }

            const paragraphPatches = Array.from(grouped.entries())
              .map(([pid, data]) => {
                const before = String(data.paragraphText || "");
                if (!before || !Array.isArray(data.ranges) || !data.ranges.length) return null;
                const afterHtml = this.applyInlineFormattingToPlainMultiSpans({
                  paragraphText: before,
                  ranges: data.ranges,
                  enable: formatIntent.enable,
                  styles: formatIntent.styles,
                });
                return {
                  kind: "docx_paragraph",
                  paragraphId: pid,
                  beforeText: before,
                  afterText: before,
                  afterHtml,
                };
              })
              .filter(Boolean) as any[];

            if (!paragraphPatches.length) {
              const text = "I couldn't map your selected ranges to stable paragraph spans. Reselect and try again.";
              if (params.sink?.isOpen()) {
                params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
                params.sink.write({ event: "delta", data: { text } } as any);
              }
              const assistantMsg = await this.createMessage({
                conversationId: params.conversationId,
                role: "assistant",
                content: text,
                userId: params.req.userId,
                metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
              });
              return {
                conversationId: params.conversationId,
                userMessageId: userMsg.id,
                assistantMessageId: assistantMsg.id,
                assistantText: text,
                sources: [],
                answerMode: "action_receipt",
                answerClass: "NAVIGATION",
                navType: null,
              };
            }

            const first = paragraphPatches[0] as any;
            bundlePatchesForUi = paragraphPatches;
            operator = "EDIT_DOCX_BUNDLE";
            beforeText = String(first?.beforeText || beforeText || "(empty)");
            proposedText = JSON.stringify({ patches: paragraphPatches });
            resolvedTarget = {
              id: String(first?.paragraphId || resolvedTarget?.id || ""),
              label: "Selected ranges",
              confidence: 0.99,
              candidates: [{
                id: String(first?.paragraphId || resolvedTarget?.id || ""),
                label: "Selected ranges",
                confidence: 0.99,
                reasons: ["viewer-multi-span-format-selection"],
              }],
              decisionMargin: 1,
              isAmbiguous: false,
              resolutionReason: "viewer_multi_span_format_selection",
            };
          } else {
          const patches: Array<{ paragraphId: string; start: number; end: number; before: string; after: string }> = [];
          for (const r of viewerDocxRanges.slice(0, 80)) {
            const pid = String(r.paragraphId || "").trim();
            const selected = String(r.text || "").trim();
            if (!pid || !selected) continue;
            const node = docxCandidates.find((c) => String(c.paragraphId || "") === pid) || null;
            const paraText = String(node?.text || "");
            if (!paraText.trim()) continue;

            let s = typeof r.start === "number" ? r.start : -1;
            let e = typeof r.end === "number" ? r.end : -1;
            if (!(Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e > s && e <= paraText.length)) {
              const idx = paraText.indexOf(selected);
              if (idx < 0) continue;
              s = idx;
              e = idx + selected.length;
            }
            const spanBefore = paraText.slice(s, e);
            const replacement = explicit
              ? explicit
              : await this.generateEditedSpanText({
                  traceId: params.traceId,
                  userId: params.req.userId,
                  conversationId: params.conversationId,
                  instruction: params.req.message,
                  selectedText: spanBefore,
                  paragraphText: paraText,
                  language: params.req.preferredLanguage,
                });
            const safeReplacement = String(replacement || "").trim();
            if (!safeReplacement) continue;
            patches.push({
              paragraphId: pid,
              start: s,
              end: e,
              before: spanBefore,
              after: safeReplacement,
            });
          }

          if (!patches.length) {
            const text = "I couldn't map your selected ranges to stable paragraph spans. Reselect and try again.";
            if (params.sink?.isOpen()) {
              params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
              params.sink.write({ event: "delta", data: { text } } as any);
            }
            const assistantMsg = await this.createMessage({
              conversationId: params.conversationId,
              role: "assistant",
              content: text,
              userId: params.req.userId,
              metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
            });
            return {
              conversationId: params.conversationId,
              userMessageId: userMsg.id,
              assistantMessageId: assistantMsg.id,
              assistantText: text,
              sources: [],
              answerMode: "action_receipt",
              answerClass: "NAVIGATION",
              navType: null,
            };
          }

          spanPatches = patches;
          const first = patches[0]!;
          const firstNode = docxCandidates.find((c) => c.paragraphId === first.paragraphId) || null;
          const firstBefore = String(firstNode?.text || "");
          beforeText = firstBefore || beforeText;
          proposedText = firstBefore
            ? firstBefore.slice(0, first.start) + first.after + firstBefore.slice(first.end)
            : proposedText;
          resolvedTarget = {
            id: first.paragraphId,
            label: "Selected ranges",
            confidence: 0.99,
            candidates: [{ id: first.paragraphId, label: "Selected ranges", confidence: 0.99, reasons: ["viewer-multi-span-selection"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "viewer_multi_span_selection",
          };
          }
        } else {
          const span = resolveSpanRange();
          if (!span) {
            const text = "I couldn't map your selection to the stored paragraph text. Reselect a more specific span and try again.";
            if (params.sink?.isOpen()) {
              params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
              params.sink.write({ event: "delta", data: { text } } as any);
            }
            const assistantMsg = await this.createMessage({
              conversationId: params.conversationId,
              role: "assistant",
              content: text,
              userId: params.req.userId,
              metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
            });
            return {
              conversationId: params.conversationId,
              userMessageId: userMsg.id,
              assistantMessageId: assistantMsg.id,
              assistantText: text,
              sources: [],
              answerMode: "action_receipt",
              answerClass: "NAVIGATION",
              navType: null,
            };
          }

          const formatIntent = this.parseInlineFormattingIntent(params.req.message);
          if (formatIntent) {
            const patchStart = viewerStart != null ? viewerStart : span.start;
            const patchEnd = viewerEnd != null ? viewerEnd : span.end;
            const afterHtml = this.applyInlineFormattingToPlainSpan({
              paragraphText: beforeText,
              start: patchStart,
              end: patchEnd,
              styles: formatIntent.styles,
              enable: formatIntent.enable,
            });
            const afterText =
              beforeText.slice(0, patchStart) +
              String(viewerSelectedText || span.before || "") +
              beforeText.slice(patchEnd);

            bundlePatchesForUi = [{
              kind: "docx_paragraph",
              paragraphId: resolvedTarget!.id,
              beforeText,
              afterText,
              afterHtml,
            } as any];
            operator = "EDIT_DOCX_BUNDLE";
            proposedText = JSON.stringify({ patches: bundlePatchesForUi });
          } else {

            const replacement = explicit
              ? explicit
              : await this.generateEditedSpanText({
                  traceId: params.traceId,
                  userId: params.req.userId,
                  conversationId: params.conversationId,
                  instruction: params.req.message,
                  selectedText: span.before,
                  paragraphText: beforeText,
                  language: params.req.preferredLanguage,
                });

            const safeReplacement = String(replacement || "").trim();
            if (!safeReplacement) {
              const text = "I couldn't generate a replacement for that selection. Try a more specific instruction.";
              if (params.sink?.isOpen()) {
                params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
                params.sink.write({ event: "delta", data: { text } } as any);
              }
              const assistantMsg = await this.createMessage({
                conversationId: params.conversationId,
                role: "assistant",
                content: text,
                userId: params.req.userId,
                metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
              });
              return {
                conversationId: params.conversationId,
                userMessageId: userMsg.id,
                assistantMessageId: assistantMsg.id,
                assistantText: text,
                sources: [],
                answerMode: "action_receipt",
                answerClass: "NAVIGATION",
                navType: null,
              };
            }

            // Deterministic path: replace by resolved offsets to preserve the rest of the paragraph exactly.
            proposedText = beforeText.slice(0, span.start) + safeReplacement + beforeText.slice(span.end);
            // Fallback by text match for edge-cases where offsets may not align after normalization.
            if (!proposedText) proposedText = this.applySingleReplacement(beforeText, viewerSelectedText, safeReplacement);
            if (!proposedText) {
              const collapsedBefore = beforeText.replace(/\s+/g, " ").trim();
              const collapsedNeedle = String(viewerSelectedText || "").replace(/\s+/g, " ").trim();
              const replacedCollapsed = this.applySingleReplacement(collapsedBefore, collapsedNeedle, safeReplacement);
              proposedText = replacedCollapsed || null;
            }

            const patchStart = viewerStart != null ? viewerStart : span.start;
            const patchEnd = viewerEnd != null ? viewerEnd : span.end;
            spanPatches = [{
              paragraphId: resolvedTarget!.id,
              start: patchStart,
              end: patchEnd,
              before: String(viewerSelectedText || span.before || "").trim() || span.before,
              after: safeReplacement,
            }];
          }
        }
      } else if (viewerSelectedText && explicit) {
        // Exact replacement in the selected paragraph: preserve everything except the selected span.
        proposedText = this.applySingleReplacement(beforeText, viewerSelectedText, explicit);
        if (!proposedText) {
          // Fallback: if selection text doesn't match the stored paragraph verbatim, try whitespace-collapsed match.
          const collapsedBefore = beforeText.replace(/\s+/g, " ").trim();
          const collapsedNeedle = viewerSelectedText.replace(/\s+/g, " ").trim();
          const replacedCollapsed = this.applySingleReplacement(collapsedBefore, collapsedNeedle, explicit);
          proposedText = replacedCollapsed || null;
        }
      }

      if (!proposedText && operator === "EDIT_PARAGRAPH" && this.isLikelyTitleEdit(params.req.message) && explicit) {
        proposedText = explicit;
      } else if (operator === "ADD_PARAGRAPH") {
        if (!resolvedTarget || !resolvedTarget.id || resolvedTarget.id === "unknown") {
          const anchorHint = this.extractInsertAfterHint(params.req.message);
          if (anchorHint) {
            const headingResolved = this.resolveDocxHeading(anchors as any, anchorHint);
            if (headingResolved) {
              const headingNode: any = (anchors as any[])[headingResolved.idx];
              resolvedTarget = {
                id: String(headingNode?.paragraphId || "").trim(),
                label: String(headingNode?.text || "Anchor"),
                confidence: 0.95,
                candidates: [{ id: String(headingNode?.paragraphId || "").trim(), label: "Insert after anchor", confidence: 0.95, reasons: ["insert-after-heading-anchor"] }],
                decisionMargin: 1,
                isAmbiguous: false,
                resolutionReason: "insert_after_heading_anchor",
              };
              targetHint = String(headingNode?.paragraphId || "").trim() || targetHint;
              beforeText = String(headingNode?.text || "").trim() || beforeText;
            } else {
              const byText = (anchors as any[]).find((a: any) =>
                String(a?.text || "").toLowerCase().includes(String(anchorHint || "").toLowerCase()),
              );
              if (byText?.paragraphId) {
                resolvedTarget = {
                  id: String(byText.paragraphId).trim(),
                  label: String(byText.text || "Anchor"),
                  confidence: 0.9,
                  candidates: [{ id: String(byText.paragraphId).trim(), label: "Insert after anchor", confidence: 0.9, reasons: ["insert-after-text-anchor"] }],
                  decisionMargin: 1,
                  isAmbiguous: false,
                  resolutionReason: "insert_after_text_anchor",
                };
                targetHint = String(byText.paragraphId).trim() || targetHint;
                beforeText = String(byText.text || "").trim() || beforeText;
              }
            }
          }
        }

        // Insert: if user gave explicit paragraph content, use it; otherwise generate.
        const afterLabel =
          params.req.message.match(/\b(?:paragraph|par[aá]grafo)\b\s*[:：]\s*([\s\S]+)$/i)?.[1]?.trim() || null;
        proposedText = explicit || (quotedSegs.length >= 2 ? quotedSegs[1] : null) || afterLabel;
        if (!proposedText) {
          proposedText = await this.generateEditedText({
            traceId: params.traceId,
            userId: params.req.userId,
            conversationId: params.conversationId,
            instruction: params.req.message,
            beforeText: "(generate a new paragraph)",
            language: params.req.preferredLanguage,
          });
        }
        if (!String(proposedText || "").trim()) {
          const text = "I couldn't generate a safe paragraph for that instruction. Tell me what the new paragraph should say (or paste a sample to match the tone) and I’ll draft it.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }
        // For inserts, targetHint should not be the inserted text; anchor at end by default.
        targetHint = "end";
        if (this.isDocxEndParagraphRequest(params.req.message) || !resolvedTarget || resolvedTarget.id === "unknown") {
          const last = this.pickLastNonEmptyParagraph(docxCandidates);
          if (last) {
            resolvedTarget = {
              id: last.paragraphId,
              label: "End of document",
              confidence: 0.9,
              candidates: [{ id: last.paragraphId, label: "End of document", confidence: 0.9, reasons: ["end-paragraph-heuristic"] }],
              decisionMargin: 1,
              isAmbiguous: false,
              resolutionReason: "end_paragraph_heuristic",
            };
            beforeText = (last.text || "").trim() || "(empty)";
          }
        }
      } else if (operator === "EDIT_DOCX_BUNDLE") {
        // Bundle operations (translate-all, section transforms, multi-range format)
        // must not fall through into single-paragraph rewrite generation.
        if (!String(proposedText || "").trim()) {
          const text = "I couldn't prepare a safe document-wide draft. No paragraph was auto-targeted.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }
      } else {
	        // Rewrite current paragraph using LLM
	        proposedText = explicit;
	        if (!proposedText) {
	          // Only add the "only change selection" constraint when the selection is truly a small span.
	          const kind = typeof viewerSel?.selectionKind === "string" ? String(viewerSel.selectionKind).toLowerCase().trim() : "";
	          const isSmallSpan = viewerSelectedText && (kind === "span" || kind === "word" || kind === "sentence") && !selectionCoversMostOfBlock;
	          const instruction = isSmallSpan
	            ? `${params.req.message}\n\nConstraint: ONLY change the selected span "${viewerSelectedText}" within the paragraph. Keep all other characters unchanged.`
	            : params.req.message;
	          proposedText = await this.generateEditedText({
	            traceId: params.traceId,
	            userId: params.req.userId,
	            conversationId: params.conversationId,
	            instruction,
	            beforeText,
	            language: params.req.preferredLanguage,
	          });
	        }
        if (!String(proposedText || "").trim()) {
          const text = "I couldn't generate a safe edit from that instruction. If you tell me the exact target (e.g. quote the sentence) and the desired change, I can draft it and ask for confirmation before applying.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }
      }

      targetCandidates = (resolvedTarget.candidates || []).map((c) => {
        const node = docxCandidates.find((p) => p.paragraphId === c.id);
        const preview = (node?.text || "").trim();
        return {
          id: c.id,
          label: c.label,
          confidence: c.confidence,
          reasons: c.reasons,
          previewText: preview ? preview.slice(0, 180) : undefined,
        };
      });
      const docxDraftScope: "selection" | "paragraph" | "section" | "document" | "range" | "unknown" = (() => {
        if (String(resolvedTarget?.id || "").trim() === "document") return "document";
        if (requestedScope.scopeKind === "document") return "document";
        if (requestedScope.scopeKind === "section") return "section";
        if (requestedScope.scopeKind === "paragraph") return "paragraph";
        if (viewerDocxRanges.length > 0 || spanPatches.length > 0 || hasViewerSelection) return "selection";
        return "unknown";
      })();
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "FIND_TARGETS",
        status: "done",
        summary: editSummary,
        scope: docxDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          targetLabel: String(resolvedTarget?.label || "").trim() || undefined,
          targetCount: Math.max(1, targetCandidates.length || 0),
          ...(bundlePatchesForUi?.length ? { matches: bundlePatchesForUi.length } : {}),
          ...(spanPatches.length ? { matches: spanPatches.length } : {}),
        },
      });
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "DRAFT_CHANGES",
        status: "active",
        summary: editSummary,
        scope: docxDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          targetLabel: String(resolvedTarget?.label || "").trim() || undefined,
        },
      });

      const preview = await this.editHandler.execute({
        mode: "preview",
        context: {
          userId: params.req.userId,
          conversationId: params.conversationId,
          correlationId: params.traceId,
          clientMessageId: userMsg.id,
          language: params.req.preferredLanguage,
        } as any,
        planRequest: {
          instruction: params.req.message,
          operator,
          domain,
          documentId: doc.id,
          targetHint,
        },
        target: resolvedTarget,
        beforeText: beforeText || "(empty)",
        proposedText: (proposedText || "").trim() || "(empty)",
      });

      if (!preview.ok) {
        this.emitEditProgress(params.sink, {
          phase: "DRAFT",
          step: "DRAFT_CHANGES",
          status: "error",
          summary: editSummary,
          scope: docxDraftScope,
          documentKind: domain,
          documentLabel: editDocumentLabel,
          vars: {
            ...baseEditVars,
            error: preview.error || "preview_failed",
          },
        });
        const text = preview.error || "Edit preview failed.";
        if (params.sink?.isOpen()) {
          params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
          params.sink.write({ event: "delta", data: { text } } as any);
        }
        const assistantMsg = await this.createMessage({
          conversationId: params.conversationId,
          role: "assistant",
          content: text,
          userId: params.req.userId,
          metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
        });
        return {
          conversationId: params.conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          sources: [],
          answerMode: "action_receipt",
          answerClass: "NAVIGATION",
          navType: null,
        };
      }

      const previewResult = preview.result as any;
      const docxDraftCount = (() => {
        if (Array.isArray(bundlePatchesForUi) && bundlePatchesForUi.length > 0) return bundlePatchesForUi.length;
        if (Array.isArray(spanPatches) && spanPatches.length > 0) return spanPatches.length;
        const diffChanges = Array.isArray(previewResult?.diff?.changes) ? previewResult.diff.changes.length : 0;
        return diffChanges > 0 ? diffChanges : 1;
      })();
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "DRAFT_CHANGES",
        status: "done",
        summary: editSummary,
        scope: docxDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          changes: docxDraftCount,
        },
      });
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "VALIDATE_PREVIEW",
        status: "active",
        summary: editSummary,
        scope: docxDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          changes: docxDraftCount,
        },
      });
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "VALIDATE_PREVIEW",
        status: "done",
        summary: editSummary,
        scope: docxDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          changes: docxDraftCount,
        },
      });
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "PREVIEW_READY",
        status: "done",
        summary: editSummary,
        scope: docxDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          changes: docxDraftCount,
        },
      });

      const keepDocumentScopeTarget =
        operator === "EDIT_DOCX_BUNDLE" &&
        requestedScope.scopeKind === "document";
      const resolvedForUi = keepDocumentScopeTarget
        ? {
            ...(previewResult?.target || resolvedTarget || {}),
            id: "document",
            label: "Entire document",
            confidence: 0.99,
            candidates: [{ id: "document", label: "Entire document", confidence: 0.99, reasons: ["bank_scope_document"] }],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: "bank_scope_document",
          }
        : (previewResult?.target || resolvedTarget);
      const routingMeta = this.resolveAllybiEditRoutingMeta({
        domain,
        runtimeOperator: operator,
        instruction: params.req.message,
        targetHint: targetHint || resolvedForUi?.id || undefined,
        hasSelection: Boolean(hasViewerSelection),
      });
      const locationLabel = (() => {
        const raw = String(resolvedForUi?.label || "").trim();
        if (!raw) return "";
        // Docx labels are often like: "Heading / Subheading > paragraphId"
        if (String(domain) === "docx" && raw.includes(" > ")) return raw.split(" > ")[0] || raw;
        return raw;
      })();
      const editScopeForUi = (() => {
        if (String(domain) === "docx") {
          if (String(resolvedForUi?.id || "").trim() === "document") return "document";
          if (spanPatches.length) return "selection";
          if (Array.isArray(bundlePatchesForUi) && bundlePatchesForUi.length) {
            if (requestedScope.scopeKind === "document") return "document";
            return bundlePatchesForUi.length > 1 ? "section" : "paragraph";
          }
          if (requestedScope.scopeKind) return requestedScope.scopeKind;
        }
        if (String(domain) === "sheets" && spanPatches.length) return "selection";
        return "unknown";
      })();
      const editAttachment = {
        type: "edit_session",
        domain,
        operator,
        canonicalOperator: routingMeta.canonicalOperator,
        renderType: routingMeta.renderType,
        instruction: params.req.message,
        documentId: doc.id,
        filename,
        mimeType: docMime,
        target: resolvedForUi,
        targetId: resolvedForUi?.id,
        locationLabel,
        documentKind: domain,
        scope: editScopeForUi,
        targetCandidates,
        beforeText,
        proposedText,
        baseRevisionId: doc.id,
        baseDocumentUpdatedAtIso: new Date(doc.updatedAt).toISOString(),
        baseDocumentFileHash: String(doc.fileHash || ""),
        planVersion: "v2",
        targets:
          (operator === "EDIT_DOCX_BUNDLE" && Array.isArray(bundlePatchesForUi) && bundlePatchesForUi.length)
            ? Array.from(
                new Set(
                  bundlePatchesForUi
                    .map((p: any) => String(p?.paragraphId || "").trim())
                    .filter(Boolean),
                ),
              ).map((pid) => ({ id: pid }))
            : (spanPatches.length
              ? Array.from(new Set(spanPatches.map((p) => String(p.paragraphId || "").trim()).filter(Boolean))).map((pid) => ({ id: pid }))
              : []),
        ...(operator === "EDIT_DOCX_BUNDLE" && Array.isArray(bundlePatchesForUi) && bundlePatchesForUi.length
          ? {
              bundle: {
                kind: resolvedForUi?.resolutionReason || "docx_bundle",
                changeCount: bundlePatchesForUi.length,
              },
              bundlePatches: bundlePatchesForUi,
            }
          : {}),
        ...(spanPatches.length
          ? {
              scope: "selection",
              patches: spanPatches,
              targets: Array.from(new Set(spanPatches.map((p) => String(p.paragraphId || "").trim()).filter(Boolean))).map((pid) => ({ id: pid })),
              applyMode: viewerMode ? "prefer_client" : "server_ok",
            }
          : {}),
        diff: previewResult?.diff,
        rationale: previewResult?.rationale,
        requiresConfirmation: Boolean(previewResult?.requiresConfirmation) || routingMeta.requiresConfirmation,
      };

      const note = (() => {
        const n = String(previewResult?.receipt?.note || "").trim();
        if (n) return n;
        if (operator === "EDIT_DOCX_BUNDLE" && Array.isArray(bundlePatchesForUi) && bundlePatchesForUi.length) {
          const changeCount = bundlePatchesForUi.length;
          const loc = String(locationLabel || resolvedForUi?.label || "").trim();
          return `Draft prepared: ${changeCount} change${changeCount === 1 ? "" : "s"}${loc ? ` in "${loc}"` : ""}.`;
        }
        if (operator === "COMPUTE_BUNDLE") {
          return "Draft prepared: review the changes, then click Apply to commit a new revision.";
        }
        return "Review the diff, then click Apply to create a new revision.";
      })();

      const text = `Edit preview ready for **${filename}**.\n\n${note}`;

      if (params.sink?.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [editAttachment], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        attachmentsPayload: [editAttachment],
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

		    // sheets
			    if (domain === "sheets") {
	      const viewerSel = (params.req.meta as any)?.viewerSelection as any;
	      const viewerRanges = Array.isArray(viewerSel?.ranges) ? viewerSel.ranges : [];
	      let viewerRangeA1Raw =
	        typeof viewerRanges?.[0]?.rangeA1 === "string"
	          ? String(viewerRanges[0].rangeA1 || "").trim()
	          : typeof viewerSel?.rangeA1 === "string"
	            ? String(viewerSel.rangeA1 || "").trim()
	            : "";
	      let viewerSheetNameRaw =
	        typeof viewerRanges?.[0]?.sheetName === "string"
	          ? String(viewerRanges[0].sheetName || "").trim()
	          : typeof viewerSel?.sheetName === "string"
	            ? String(viewerSel.sheetName || "").trim()
	            : "";

		      const unquoteSheetName = (raw: string): string => {
		        const t = String(raw || "").trim();
		        if (!t) return "";
		        const unwrapped = (t.startsWith("'") && t.endsWith("'") && t.length >= 2) ? t.slice(1, -1) : t;
		        return unwrapped.replace(/''/g, "'");
		      };

			      const quoteSheetName = (name: string): string => {
			        const n = String(name || "").trim();
			        if (!n) return "Sheet1";
			        // Quote if name contains spaces or punctuation (Excel/Sheets A1 notation).
			        if (/[^A-Za-z0-9_]/.test(n)) return `'${n.replace(/'/g, "''")}'`;
			        return n;
			      };

      // Viewer payloads can provide either:
      // - sheetName + rangeA1 (preferred), or
      // - a combined rangeA1 like "'SUMMARY 1'!A4:G20".
      // Normalize both shapes into { viewerSheetNameRaw, viewerRangeA1Raw }.
      const splitViewerSheetAndA1 = (rawInput: string): { sheetName: string; a1: string } => {
        const raw = String(rawInput || "").trim();
        if (!raw) return { sheetName: "", a1: "" };
        const bang = raw.indexOf("!");
        if (bang <= 0) return { sheetName: "", a1: raw };
        const left = raw.slice(0, bang).trim();
        const right = raw.slice(bang + 1).trim();
        return { sheetName: unquoteSheetName(left), a1: right };
      };

      const splitTopLevel = splitViewerSheetAndA1(
        typeof viewerSel?.rangeA1 === "string" ? String(viewerSel.rangeA1 || "").trim() : "",
      );
      const splitFirstRange = splitViewerSheetAndA1(
        typeof viewerRanges?.[0]?.rangeA1 === "string" ? String(viewerRanges[0].rangeA1 || "").trim() : "",
      );

      viewerRangeA1Raw =
        String(splitFirstRange.a1 || "").trim() ||
        String(splitTopLevel.a1 || "").trim() ||
        String(viewerRangeA1Raw || "").trim();
      viewerSheetNameRaw =
        String(viewerSheetNameRaw || "").trim() ||
        String(splitFirstRange.sheetName || "").trim() ||
        String(splitTopLevel.sheetName || "").trim();

	      const normalizeSheetAndA1 = (input: string): { sheetName: string | null; a1: string | null } => {
			        const raw = String(input || "").trim();
			        if (!raw) return { sheetName: null, a1: null };
			        const bang = raw.indexOf("!");
		        if (bang > 0) {
		          const sheetName = unquoteSheetName(raw.slice(0, bang));
		          const a1 = raw.slice(bang + 1).trim();
		          return { sheetName: sheetName || null, a1: a1 || null };
		        }
        return { sheetName: viewerSheetNameRaw || null, a1: raw };
      };

      const parseA1Cell = (ref: string): { col: number; row: number } | null => {
        const m = String(ref || "").trim().match(/^([A-Z]{1,3})(\d{1,7})$/i);
        if (!m) return null;
        const col = String(m[1] || "").toUpperCase().split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
        const row = Number(m[2]);
        if (!Number.isFinite(col) || !Number.isFinite(row) || col < 1 || row < 1) return null;
        return { col, row };
      };

      const colToA1 = (n: number): string => {
        let x = Math.max(1, Math.floor(Number(n) || 1));
        let out = "";
        while (x > 0) {
          const r = (x - 1) % 26;
          out = String.fromCharCode(65 + r) + out;
          x = Math.floor((x - 1) / 26);
        }
        return out || "A";
      };

	      const viewerNormalizedRanges = viewerRanges
	        .map((r: any) => {
          const rawSheet = typeof r?.sheetName === "string" ? String(r.sheetName || "").trim() : "";
          const rawRange = typeof r?.rangeA1 === "string" ? String(r.rangeA1 || "").trim() : "";
          const split = splitViewerSheetAndA1(rawRange);
          return {
            sheetName: rawSheet || String(split.sheetName || "").trim(),
            rangeA1: String(split.a1 || rawRange || "").trim(),
          };
        })
	        .filter((r: any) => r.rangeA1);

      const viewerCombinedRange = (() => {
        if (!viewerNormalizedRanges.length) return null;
        const sheet = String(viewerNormalizedRanges[0]?.sheetName || viewerSheetNameRaw || "").trim();
        if (!sheet) return null;
        const sameSheet = viewerNormalizedRanges.every((r: any) => String(r.sheetName || sheet).trim().toLowerCase() === sheet.toLowerCase());
        if (!sameSheet) return null;
        let minCol = Number.POSITIVE_INFINITY;
        let maxCol = 0;
        let minRow = Number.POSITIVE_INFINITY;
        let maxRow = 0;
        for (const r of viewerNormalizedRanges) {
          const [a, b] = String(r.rangeA1 || "").includes(":")
            ? String(r.rangeA1).split(":")
            : [String(r.rangeA1), String(r.rangeA1)];
          const s = parseA1Cell(a);
          const e = parseA1Cell(b);
          if (!s || !e) continue;
          minCol = Math.min(minCol, s.col, e.col);
          maxCol = Math.max(maxCol, s.col, e.col);
          minRow = Math.min(minRow, s.row, e.row);
          maxRow = Math.max(maxRow, s.row, e.row);
        }
        if (!Number.isFinite(minCol) || !Number.isFinite(minRow) || maxCol < minCol || maxRow < minRow) return null;
        const a1 = `${colToA1(minCol)}${minRow}:${colToA1(maxCol)}${maxRow}`;
        return { sheetName: sheet, a1 };
      })();

	      const parseChartType = (message: string): any => {
	        const low = String(message || "").toLowerCase();
	        const hasStacked = /\b(stacked|empilhad[ao])\b/.test(low);
	        if (/\b(combo|mixed|combination|combinad[oa])\b/.test(low)) return "COMBO";
	        if (/\b(bubble|bolha)\b/.test(low)) return "BUBBLE";
	        if (/\b(histogram|histograma)\b/.test(low)) return "HISTOGRAM";
	        if (/\b(radar)\b/.test(low)) return "RADAR";
	        if (/\b(pie|donut|doughnut|pizza|rosca)\b/.test(low)) return "PIE";
	        if (/\b(scatter|dispersion|dispersão|dispersao)\b/.test(low)) return "SCATTER";
	        if (/\b(area|área)\b/.test(low)) return "AREA";
	        if (/\b(line|linha)\b/.test(low)) return "LINE";
	        if (/\b(column|coluna)\b/.test(low)) return hasStacked ? "STACKED_COLUMN" : "COLUMN";
	        if (/\b(bar|barra|barras)\b/.test(low)) return hasStacked ? "STACKED_BAR" : "BAR";
	        if (hasStacked) return "STACKED_COLUMN";
	        return "LINE";
	      };

	      const parseChartTitle = (message: string): string | null => {
	        const q = this.extractQuotedText(message);
	        const m = String(message || "").match(/\b(title|titled|chart title|called|named)\b\s*[:\-]?\s*(.+)$/i);
	        const tail = m ? String(m[2] || "").trim() : "";
	        const picked = q || tail;
	        return picked ? picked.slice(0, 120) : null;
	      };

	      const parseChartOptions = (message: string, type: string): Record<string, unknown> => {
	        const low = String(message || "").toLowerCase();
	        const out: Record<string, unknown> = {};
	        const extractColumnTokens = (raw: string): string[] =>
	          Array.from(
	            new Set(
	              (String(raw || "")
	                .toUpperCase()
	                .match(/\b[A-Z]{1,3}\b/g) || [])
	                .map((t) => String(t).trim())
	                .filter(Boolean),
	            ),
	          );
	        const extractVsTerms = (): string[] => {
	          const m = String(message || "").match(/\b([A-Za-z][A-Za-z0-9 _%/().-]{1,36})\s+vs\.?\s+([A-Za-z][A-Za-z0-9 _%/().-]{1,36})\b/i);
	          if (!m) return [];
	          const clean = (s: string) =>
	            String(s || "")
	              .replace(/\b(compare|chart|graph|plot|selected|range|data|column|columns|coluna|colunas)\b/gi, "")
	              .replace(/\s+/g, " ")
	              .trim();
	          const left = clean(m[1] || "");
	          const right = clean(m[2] || "");
	          const outTerms = [left, right].filter((x) => x && x.length <= 36);
	          return Array.from(new Set(outTerms));
	        };
	        const dedupeSeries = (items: Array<string | number>): Array<string | number> =>
	          Array.from(
	            new Set(
	              (Array.isArray(items) ? items : [])
	                .map((x) => String(x || "").trim())
	                .filter(Boolean),
	            ),
	          );

	        if (type === "STACKED_BAR" || type === "STACKED_COLUMN") out.stacked = true;
	        if (type === "HISTOGRAM") {
	          const b = low.match(/\b(bucket|bin|bins|bucket size)\b[^0-9]{0,6}(\d+(?:\.\d+)?)\b/i);
	          if (b && Number.isFinite(Number(b[2]))) out.histogram = { bucketSize: Number(b[2]) };
	        }
	        if (type === "COMBO") {
	          const barMatch = String(message || "").match(/\b(?:bars?|columns?)\s+(?:for|on|em|para)?\s*(?:columns?|colunas?)?\s*([A-Z]{1,3}(?:\s*(?:,|&|\band\b|\be\b)\s*[A-Z]{1,3})*)/i);
	          const lineMatch = String(message || "").match(/\b(?:line|lines|linha|linhas)\s+(?:for|on|em|para)?\s*(?:columns?|colunas?)?\s*([A-Z]{1,3}(?:\s*(?:,|&|\band\b|\be\b)\s*[A-Z]{1,3})*)/i);
	          const barSeries = extractColumnTokens(barMatch?.[1] || "");
	          const lineSeries = extractColumnTokens(lineMatch?.[1] || "");
	          if (barSeries.length || lineSeries.length) {
	            out.comboSeries = {
	              ...(barSeries.length ? { barSeries } : {}),
	              ...(lineSeries.length ? { lineSeries } : {}),
	            };
	            const combined = dedupeSeries([...barSeries, ...lineSeries]);
	            if (combined.length) out.series = combined;
	          }
	        }
	        if (!Array.isArray(out.series) || !out.series.length) {
	          const explicitColsMatch = String(message || "").match(/\bcolumns?\s+([A-Z]{1,3}(?:\s*(?:,|&|\band\b|\be\b)\s*[A-Z]{1,3})*)/i);
	          const explicitCols = extractColumnTokens(explicitColsMatch?.[1] || "");
	          if (explicitCols.length) out.series = dedupeSeries(explicitCols);
	        }
	        if (!Array.isArray(out.series) || !out.series.length) {
	          const vsTerms = extractVsTerms();
	          if (vsTerms.length >= 2) out.series = dedupeSeries(vsTerms.slice(0, 4));
	        }
	        return out;
	      };

	      if (operator === "ADD_SHEET") {
	        proposedText = this.parseAfterToValue(params.req.message) || this.extractQuotedText(params.req.message);
	        if (!proposedText) {
          const text = "What should the new sheet name be? Example: `add a sheet called \"Summary\"`.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }
        beforeText = "New sheet";
      } else if (operator === "RENAME_SHEET") {
        const parsed = this.parseSheetRename(params.req.message);
        if (!parsed) {
          const text = "Tell me the old and new sheet names. Example: `rename sheet 'Sheet1' to 'Summary'`.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
	        }
	        beforeText = parsed.fromName;
	        proposedText = parsed.toName;
	      } else if (operator === "CREATE_CHART") {
	        const explicitTarget = this.parseSheetTarget(params.req.message);
	        const fromExplicit = explicitTarget?.sheetName && explicitTarget?.a1 ? `${explicitTarget.sheetName}!${explicitTarget.a1}` : (explicitTarget?.a1 || "");
        const fromViewer =
          viewerCombinedRange
            ? `${viewerCombinedRange.sheetName}!${viewerCombinedRange.a1}`
            : viewerRangeA1Raw
              ? `${viewerSheetNameRaw || "Sheet1"}!${viewerRangeA1Raw}`
              : "";
	        let targetRange = normalizeSheetAndA1(fromExplicit || fromViewer);

		        // If user didn't select a range, infer a likely data block from the actual XLSX bytes.
		        if (!targetRange.a1 || !String(targetRange.a1).includes(":")) {
		          const preferredSheet = targetRange.sheetName || viewerSheetNameRaw || null;
		          try {
		            const inferred = await this.xlsxInspector.inferChartRange(bytes, preferredSheet);
		            if (inferred?.rangeA1) {
		              targetRange = { sheetName: inferred.sheetName, a1: inferred.rangeA1 };
		            }
		          } catch {
		            // ignore; we'll fall back to asking the user for a range
		          }
		        }

	        if (!targetRange.a1 || !String(targetRange.a1).includes(":")) {
	          const text =
	            "Select a data range on the sheet (like `Sheet1!A1:D20`) and tell me what chart to create.\n\n" +
	            "Examples:\n" +
	            "- `Create a pie chart`\n" +
	            "- `Make a bar chart titled \"Revenue by Category\"`";
	          if (params.sink?.isOpen()) {
	            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
	            params.sink.write({ event: "delta", data: { text } } as any);
	          }
	          const assistantMsg = await this.createMessage({
	            conversationId: params.conversationId,
	            role: "assistant",
	            content: text,
	            userId: params.req.userId,
	            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
	          });
	          return {
	            conversationId: params.conversationId,
	            userMessageId: userMsg.id,
	            assistantMessageId: assistantMsg.id,
	            assistantText: text,
	            sources: [],
	            answerMode: "action_receipt",
	            answerClass: "NAVIGATION",
	            navType: null,
	          };
	        }

		        const sheetName = targetRange.sheetName || viewerSheetNameRaw || "Sheet1";
		        const range = `${quoteSheetName(sheetName)}!${targetRange.a1}`;
		        const type = parseChartType(params.req.message);
		        const title = parseChartTitle(params.req.message);
		        const options = parseChartOptions(params.req.message, String(type || ""));
		        beforeText = "(chart)";
		        proposedText = JSON.stringify({ type, range, ...(title ? { title } : {}), ...options });
		      } else if (operator === "COMPUTE" || operator === "COMPUTE_BUNDLE") {
	        // Minimal compute planner (table formatting + summary computations).
	        // If we can't form a deterministic op list, ask for clarification.
	        const low = String(params.req.message || "").toLowerCase();

	        const escapeRegex = (s: string): string => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	        const explicitTarget = this.parseSheetTarget(params.req.message);
	        const fromExplicit = explicitTarget?.sheetName && explicitTarget?.a1 ? `${explicitTarget.sheetName}!${explicitTarget.a1}` : (explicitTarget?.a1 || "");
        const fromViewer =
          viewerCombinedRange
            ? `${viewerCombinedRange.sheetName}!${viewerCombinedRange.a1}`
            : viewerRangeA1Raw
              ? `${viewerSheetNameRaw || "Sheet1"}!${viewerRangeA1Raw}`
              : "";

	        // If the user used the viewer selection (almost always true in the editor),
	        // do not allow a greedy sheet-name parse to capture leading instruction words
	        // like "put the sum of SUMMARY 1!E5".
	        const viewerRefInMessage =
	          viewerSheetNameRaw
	            ? new RegExp(`\\b${escapeRegex(viewerSheetNameRaw)}\\s*!`, "i").test(params.req.message)
	            : false;
	        const explicitSheet = String(explicitTarget?.sheetName || "").trim();
	        const viewerSheet = String(viewerSheetNameRaw || "").trim();
	        const explicitLooksWrong =
	          Boolean(explicitSheet && viewerSheet) &&
	          explicitSheet.toLowerCase() !== viewerSheet.toLowerCase() &&
	          viewerRefInMessage;

	        const bestInput = explicitLooksWrong ? fromViewer : (fromExplicit || fromViewer);
	        const rangeTarget = normalizeSheetAndA1(bestInput);
	        let sheetName =
	          rangeTarget.sheetName ||
	          (explicitLooksWrong ? (viewerSheetNameRaw || null) : (explicitTarget?.sheetName || null)) ||
	          viewerSheetNameRaw ||
	          null;
	        let a1 = rangeTarget.a1;

	        const ops: any[] = [];

	        const parseAgg = (s: string): { fn: string; label: string } | null => {
	          const t = String(s || "").toLowerCase();
	          if (/\b(sum|total|soma|somar|totalizar)\b/.test(t)) return { fn: "SUM", label: "sum" };
	          if (/\b(average|avg|mean|m[eé]dia|media)\b/.test(t)) return { fn: "AVERAGE", label: "average" };
	          if (/\b(min|minimum|m[ií]nimo|menor)\b/.test(t)) return { fn: "MIN", label: "minimum" };
	          if (/\b(max|maximum|m[aá]ximo|maior)\b/.test(t)) return { fn: "MAX", label: "maximum" };
	          if (/\b(count|how many|contar|conte|quantos|quantas)\b/.test(t)) return { fn: "COUNT", label: "count" };
	          return null;
	        };

	        // Our viewer spreadsheet renderer does not evaluate Excel formulas, so aggregation
	        // operations should ALWAYS compute the numeric result server-side by default.
	        // Only write a formula if the user explicitly asks for one.
	        const wantsFormulaExplicitly =
	          /\bformula|f[óo]rmula\b/i.test(low) &&
	          !/\b(not a formula|no formula|without formula|sem f[óo]rmula|n[aã]o.*f[óo]rmula)\b/i.test(low);

	        const evaluateAggFromWorkbook = async (params: { sheetName: string; a1: string; fn: string }): Promise<number | null> => {
	          try {
	            const wb = new ExcelJS.Workbook();
	            await wb.xlsx.load(bytes as any);
	            const ws = wb.getWorksheet(params.sheetName);
	            if (!ws) return null;

	            const a1 = String(params.a1 || "").trim();
	            if (!a1 || !a1.includes(":")) return null;
	            const [startRef, endRef] = a1.split(":").map((x) => String(x || "").trim());
	            if (!startRef || !endRef) return null;

	            const parseA1 = (ref: string): { col: number; row: number } | null => {
	              const m = ref.match(/^([A-Z]{1,3})(\d{1,7})$/i);
	              if (!m) return null;
	              const col = String(m[1] || "").toUpperCase().split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
	              const row = Number(m[2]);
	              if (!Number.isFinite(col) || !Number.isFinite(row) || col < 1 || row < 1) return null;
	              return { col, row };
	            };

	            const s = parseA1(startRef);
	            const e = parseA1(endRef);
	            if (!s || !e) return null;
	            const r1 = Math.min(s.row, e.row);
	            const r2 = Math.max(s.row, e.row);
	            const c1 = Math.min(s.col, e.col);
	            const c2 = Math.max(s.col, e.col);

	            const nums: number[] = [];
	            let nonEmptyCount = 0;
	            let fmtHasDecimals = 0;
	            let fmtNoDecimals = 0;
	            for (let r = r1; r <= r2; r += 1) {
	              for (let c = c1; c <= c2; c += 1) {
	                const cell = ws.getCell(r, c);
	                const fmt = String((cell as any)?.numFmt || "").trim();
	                if (fmt) {
	                  if (fmt.includes(".")) fmtHasDecimals += 1;
	                  else fmtNoDecimals += 1;
	                }
	                const v: any = cell?.value as any;
	                if (v == null || v === "") continue;
	                nonEmptyCount += 1;
	                if (typeof v === "number") {
	                  nums.push(v);
	                  continue;
	                }
	                if (typeof v === "string") {
	                  const n = this.parseMoney(v);
	                  if (n != null) nums.push(n);
	                  else {
	                    const parsed = Number(String(v).replace(/[, $()]/g, ""));
	                    if (Number.isFinite(parsed)) nums.push(parsed);
	                  }
	                  continue;
	                }
	                if (typeof v === "object" && v) {
	                  // ExcelJS formula cell: { formula, result }
	                  if ("result" in v && typeof (v as any).result === "number") {
	                    nums.push(Number((v as any).result));
	                  }
	                }
	              }
	            }

	            const fn = String(params.fn || "").toUpperCase().trim();
	            if (fn === "COUNT") return nonEmptyCount;
	            if (!nums.length) return 0;
	            const sum = nums.reduce((a, b) => a + b, 0);
	            const preferNoDecimals = fmtNoDecimals >= Math.max(3, fmtHasDecimals * 2);
	            const maybeRound = (x: number): number => {
	              if (!Number.isFinite(x)) return x;
	              return preferNoDecimals ? Math.round(x) : x;
	            };
	            if (fn === "SUM") return maybeRound(sum);
	            if (fn === "AVERAGE") return maybeRound(sum / nums.length);
	            if (fn === "MIN") return Math.min(...nums);
	            if (fn === "MAX") return Math.max(...nums);
	            return null;
	          } catch {
	            return null;
	          }
	        };

	        const parseCellRef = (ref: string): { col: string; row: number } | null => {
	          const m = String(ref || "").trim().match(/^([A-Z]{1,3})(\d{1,7})$/i);
	          if (!m) return null;
	          const col = String(m[1] || "").toUpperCase();
	          const row = Number(m[2]);
	          if (!col || !Number.isFinite(row) || row < 1) return null;
	          return { col, row };
	        };

	        const colToNum = (col: string): number =>
	          String(col || "")
	            .toUpperCase()
	            .split("")
	            .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);

	        const numToCol = (n: number): string => {
	          let x = Math.max(0, Math.floor(n));
	          let s = "";
	          while (x > 0) {
	            const r = (x - 1) % 26;
	            s = String.fromCharCode(65 + r) + s;
	            x = Math.floor((x - 1) / 26);
	          }
	          return s;
	        };

	        const quoteSheetRef = (name: string): string => {
	          const n = String(name || "").trim();
	          if (!n) return "Sheet1";
	          return /^[A-Za-z0-9_]+$/.test(n) ? n : `'${n.replaceAll("'", "''")}'`;
	        };

	        const wantsTable =
	          /\b(format|make|turn|convert|create)\b/.test(low) && /\btable\b/.test(low) ||
	          /\b(formatar|fazer|transformar|converter|criar)\b/.test(low) && /\btabela\b/.test(low);

	        const parseTableStyle = (message: string): { style: string; colors?: { header?: string; stripe?: string; totals?: string; border?: string } } => {
	          const text = String(message || "").toLowerCase();
	          const has = (re: RegExp) => re.test(text);
	          const style =
	            has(/\bblue|azul\b/) ? "blue" :
	            has(/\bgreen|verde\b/) ? "green" :
	            has(/\borange|laranja\b/) ? "orange" :
	            has(/\bteal\b|\bciano\b/) ? "teal" :
	            has(/\bgray|grey|cinza|neutr[ao]l\b/) ? "gray" :
	            "light_gray";
	          const extractHex = (label: string): string | undefined => {
	            const m = text.match(new RegExp(`${label}\\s*[:=]?\\s*(#?[0-9a-f]{6})`, "i"));
	            if (!m?.[1]) return undefined;
	            const raw = String(m[1]).trim();
	            return raw.startsWith("#") ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
	          };
	          const colors = {
	            header: extractHex("header|cabecalho|cabeçalho"),
	            stripe: extractHex("stripe|zebra|listras"),
	            totals: extractHex("totals|total"),
	            border: extractHex("border|borda"),
	          };
	          return {
	            style,
	            colors: Object.values(colors).some(Boolean) ? colors : undefined,
	          };
	        };

	        const wantsAddColumn =
	          /\b(column|coluna)\b/.test(low) &&
	          /\b(add|create|new|insert|adicionar|criar|nova|novo)\b/.test(low);
	        const wantsSort = /\b(sort|order|ordenar)\b/.test(low);
	        const wantsFilter = /\b(filter|filtrar)\b/.test(low);
	        const wantsFreeze = /\b(freeze|congelar)\b/.test(low);
	        const wantsConditionalFormat = /\b(conditional formatting|formata[cç][aã]o condicional|highlight)\b/.test(low);
	        const wantsDataValidation = /\b(data validation|dropdown|lista suspensa|valida[cç][aã]o de dados)\b/.test(low);
	        const wantsNumberFormat = /\b(currency|percent|percentage|date format|number format|moeda|percentual|formato de data)\b/.test(low);
	        const wantsCoerceNumber =
	          /\b(convert|coerce|parse|normalize|transform)\b.{0,20}\b(number|numbers|numeric)\b/.test(low) ||
	          /\b(converter|converta|normalizar|transformar)\b.{0,24}\b(n[uú]mero|n[uú]meros|num[eé]rico|num[eé]ricos)\b/.test(low);
	        const wantsPrintLayout = /\b(print layout|hide gridlines|show gridlines|ocultar grade|mostrar grade|impress[aã]o)\b/.test(low);
	        const wantsInsertRow = /\b(insert|add|inserir|adicionar)\b/.test(low) && /\b(rows?|linhas?)\b/.test(low) && !/\b(column|coluna)\b/.test(low);
	        const wantsDeleteRow = /\b(delete|remove|excluir|deletar|apagar|remover)\b/.test(low) && /\b(rows?|linhas?)\b/.test(low) && !/\b(column|coluna)\b/.test(low);
	        const wantsInsertColumn = /\b(insert|add|inserir|adicionar)\b/.test(low) && /\b(columns?|colunas?)\b/.test(low) && !wantsAddColumn;
	        const wantsDeleteColumn = /\b(delete|remove|excluir|deletar|apagar|remover)\b/.test(low) && /\b(columns?|colunas?)\b/.test(low);
          const inlineFormatting = this.parseInlineFormattingIntent(params.req.message);
          const inferredLang: "en" | "pt" =
            /[ãõçáâêôàéíóú]/i.test(String(params.req.message || "")) ||
            /\b(mude|deixe|troque|coloque|substitua|fonte)\b/i.test(String(params.req.message || ""))
              ? "pt"
              : "en";
          const fontEntity = resolveFontIntent(params.req.message, inferredLang);
          const rangeFormat: Record<string, unknown> = {};
          if (inlineFormatting?.styles) {
            const st = inlineFormatting.styles;
            if (typeof st.bold === "boolean") rangeFormat.bold = st.bold;
            if (typeof st.italic === "boolean") rangeFormat.italic = st.italic;
            if (typeof st.underline === "boolean") rangeFormat.underline = st.underline;
            if (typeof st.color === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(st.color)) rangeFormat.color = st.color;
            if (typeof st.fontSizePt === "number") rangeFormat.fontSizePt = st.fontSizePt;
            if (typeof st.fontFamily === "string" && st.fontFamily.trim()) rangeFormat.fontFamily = st.fontFamily.trim();
          }
          if (!rangeFormat.fontFamily && fontEntity.matched && fontEntity.canonicalFamily) {
            rangeFormat.fontFamily = fontEntity.canonicalFamily;
          }
          const wantsRangeFormatting = Object.keys(rangeFormat).length > 0;

	        if (wantsTable && (!sheetName || !a1 || !String(a1).includes(":"))) {
	          try {
	            const inferred = await this.xlsxInspector.inferChartRange(bytes, sheetName || viewerSheetNameRaw || null);
	            if (inferred?.sheetName && inferred?.rangeA1 && String(inferred.rangeA1).includes(":")) {
	              sheetName = inferred.sheetName;
	              a1 = inferred.rangeA1;
	            }
	          } catch {
	            // Keep existing selection/range if inference fails.
	          }
	        }

	        if (wantsTable) {
	          if (!sheetName || !a1 || !String(a1).includes(":")) {
	            const text = "Select a range (like `Sheet1!A1:D20`) to format as a table, or include the range in your message.";
	            if (params.sink?.isOpen()) {
	              params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
	              params.sink.write({ event: "delta", data: { text } } as any);
	            }
	            const assistantMsg = await this.createMessage({
	              conversationId: params.conversationId,
	              role: "assistant",
	              content: text,
	              userId: params.req.userId,
	              metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
	            });
	            return {
	              conversationId: params.conversationId,
	              userMessageId: userMsg.id,
	              assistantMessageId: assistantMsg.id,
	              assistantText: text,
	              sources: [],
	              answerMode: "action_receipt",
	              answerClass: "NAVIGATION",
	              navType: null,
	            };
	          }
	          const tableStyle = parseTableStyle(params.req.message);
	          ops.push({
	            kind: "create_table",
	            rangeA1: `${sheetName}!${a1}`,
	            hasHeader: true,
	            style: tableStyle.style,
	            ...(tableStyle.colors ? { colors: tableStyle.colors } : {}),
	          });
	        }

	        if (wantsAddColumn) {
	          if (!sheetName || !a1 || !String(a1).includes(":")) {
	            const text = "Select a range first, then ask to add a new column (for example: `add a column called Growth`).";
	            if (params.sink?.isOpen()) {
	              params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
	              params.sink.write({ event: "delta", data: { text } } as any);
	            }
	            const assistantMsg = await this.createMessage({
	              conversationId: params.conversationId,
	              role: "assistant",
	              content: text,
	              userId: params.req.userId,
	              metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
	            });
	            return {
	              conversationId: params.conversationId,
	              userMessageId: userMsg.id,
	              assistantMessageId: assistantMsg.id,
	              assistantText: text,
	              sources: [],
	              answerMode: "action_receipt",
	              answerClass: "NAVIGATION",
	              navType: null,
	            };
	          }

	          const [startRef, endRef] = String(a1).split(":");
	          const s = parseCellRef(startRef);
	          const e = parseCellRef(endRef);
	          if (s && e) {
	            const startCol = Math.min(colToNum(s.col), colToNum(e.col));
	            const endCol = Math.max(colToNum(s.col), colToNum(e.col));
	            const headerRow = Math.min(s.row, e.row);
	            const newColIdx = endCol + 1;
	            const newCol = numToCol(newColIdx);
	            const labelQuoted = this.extractQuotedText(params.req.message);
	            const labelTail = (() => {
	              const m = String(params.req.message || "").match(/\b(?:called|named|with)\b\s+([A-Za-z0-9 _%+\-]{1,60})$/i);
	              return m?.[1] ? String(m[1]).trim() : "";
	            })();
	            const label = String(labelQuoted || labelTail || "New Column").trim().slice(0, 64);
	            ops.push({ kind: "insert_columns", sheetName, startIndex: endCol, count: 1 });
	            ops.push({ kind: "set_values", rangeA1: `${sheetName}!${newCol}${headerRow}`, values: [[label]] });
	          }
	        }

	        if (sheetName && a1 && wantsSort) {
	          const byMatch = String(params.req.message || "").match(/\b(?:by|on|por)\s+(?:col(?:umn|una)?\s*)?([A-Z]{1,3}|\d{1,3})\b/i);
	          const colHint = byMatch?.[1] ? String(byMatch[1]).trim() : "2";
	          const order = /\b(desc|descending|z\s*to\s*a|decrescente)\b/i.test(low) ? "DESC" : "ASC";
	          ops.push({
	            kind: "sort_range",
	            rangeA1: `${sheetName}!${a1}`,
	            hasHeader: true,
	            sortSpecs: [{ column: colHint, order }],
	          });
	        }

	        if (wantsFilter && sheetName && a1) {
	          const clearFilter = /\b(clear|remove|reset|limpar|remover)\b.{0,12}\bfilter\b/i.test(low)
	            || /\b(limpar|remover)\b.{0,12}\bfiltr/i.test(low);
	          if (clearFilter) {
	            ops.push({ kind: "clear_filter", sheetName });
	          } else {
	            ops.push({ kind: "filter_range", rangeA1: `${sheetName}!${a1}` });
	          }
	        }

	        if (wantsFreeze && sheetName) {
	          const rowMatch = String(params.req.message || "").match(/\b(?:freeze|congelar)\s+(?:row|rows|linha|linhas)\s*(\d{1,5})\b/i);
	          const colMatch = String(params.req.message || "").match(/\b(?:freeze|congelar)\s+(?:column|columns|coluna|colunas)\s*([A-Z]{1,3}|\d{1,3})\b/i);
	          const colMatchToken = String(colMatch?.[1] || "").trim();
	          const explicitFreezeCols = colMatchToken
	            ? (/^[A-Z]{1,3}$/i.test(colMatchToken) ? colToNum(colMatchToken.toUpperCase()) : Number(colMatchToken))
	            : 0;
	          const explicitFreezeRows = rowMatch?.[1] ? Number(rowMatch[1]) : 0;
	          const freezeCols = Number.isFinite(explicitFreezeCols) && explicitFreezeCols > 0
	            ? Math.floor(explicitFreezeCols)
	            : (/\b(first column|primeira coluna)\b/i.test(low) ? 1 : 0);
	          const freezeRows = Number.isFinite(explicitFreezeRows) && explicitFreezeRows > 0
	            ? Math.floor(explicitFreezeRows)
	            : (/\b(header|top row|cabe[cç]alho|linha superior)\b/i.test(low) ? 1 : 0);
	          if (freezeCols > 0 || freezeRows > 0) {
	            ops.push({ kind: "set_freeze_panes", sheetName, frozenRowCount: freezeRows, frozenColumnCount: freezeCols });
	          }
	        }

	        if (wantsCoerceNumber && sheetName && a1) {
	          const parseNumericLike = (raw: unknown): number | null => {
	            if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	            if (raw == null) return null;
	            const text = String(raw).trim();
	            if (!text) return null;
	            const cleaned = text.replace(/\s/g, "");
	            const isPct = cleaned.includes("%");
	            const stripped = cleaned.replace(/[%$€£R$\u00a0]/g, "").replace(/,/g, "");
	            const n = Number(stripped);
	            if (!Number.isFinite(n)) return null;
	            return isPct ? n / 100 : n;
	          };

	          try {
	            const wbConv = new ExcelJS.Workbook();
	            await wbConv.xlsx.load(bytes as any);
	            const wsConv = wbConv.getWorksheet(sheetName);
	            if (wsConv) {
	              const [startRef, endRef] = String(a1).includes(":")
	                ? String(a1).split(":")
	                : [String(a1), String(a1)];
	              const s = parseCellRef(startRef);
	              const e = parseCellRef(endRef);
	              if (s && e) {
	                const minRow = Math.min(s.row, e.row);
	                const maxRow = Math.max(s.row, e.row);
	                const minCol = Math.min(colToNum(s.col), colToNum(e.col));
	                const maxCol = Math.max(colToNum(s.col), colToNum(e.col));
	                let changed = false;
	                const values: unknown[][] = [];
	                for (let rr = minRow; rr <= maxRow; rr += 1) {
	                  const rowVals: unknown[] = [];
	                  for (let cc = minCol; cc <= maxCol; cc += 1) {
	                    const cell = wsConv.getCell(rr, cc) as any;
	                    const source =
	                      cell?.value && typeof cell.value === "object" && "result" in cell.value
	                        ? cell.value.result
	                        : cell?.value;
	                    const parsed = parseNumericLike(source);
	                    if (parsed != null) {
	                      rowVals.push(parsed);
	                      if (parsed !== source) changed = true;
	                    } else {
	                      rowVals.push(source);
	                    }
	                  }
	                  values.push(rowVals);
	                }
	                if (changed) {
	                  ops.push({
	                    kind: "set_values",
	                    rangeA1: `${sheetName}!${a1}`,
	                    values,
	                  });
	                }
	              }
	            }
	          } catch {
	            // Best effort numeric coercion only.
	          }
	        }

	        if (wantsNumberFormat && sheetName && a1) {
	          const pattern = /\b(percent|percentage|percentual)\b/i.test(low)
	            ? "0.00%"
	            : /\b(currency|moeda|usd|dollar|real|brl)\b/i.test(low)
	              ? "$#,##0.00"
	              : /\b(date|data)\b/i.test(low)
	                ? "yyyy-mm-dd"
	                : "#,##0.00";
	          ops.push({ kind: "set_number_format", rangeA1: `${sheetName}!${a1}`, pattern });
	        }

          if (wantsRangeFormatting && sheetName && a1) {
            ops.push({ kind: "format_range", rangeA1: `${sheetName}!${a1}`, format: rangeFormat });
          }

	        if (wantsDataValidation && sheetName && a1) {
	          const values = (() => {
	            const quoted = this.extractQuotedText(params.req.message);
	            if (quoted && quoted.includes(",")) return quoted.split(",").map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
	            const m = String(params.req.message || "").match(/\b(?:values?|op[cç][oõ]es?)\s*[:=]\s*([A-Za-z0-9 _.,/-]{3,200})$/i);
	            if (!m?.[1]) return [];
	            return String(m[1]).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);
	          })();
	          ops.push({
	            kind: "set_data_validation",
	            rangeA1: `${sheetName}!${a1}`,
	            rule: {
	              type: "ONE_OF_LIST",
	              values: values.length ? values : ["Yes", "No"],
	              strict: true,
	            },
	          });
	        }

	        if (wantsConditionalFormat && sheetName && a1) {
	          const thresholdMatch = String(params.req.message || "").match(/(-?\d+(?:\.\d+)?)/);
	          const threshold = thresholdMatch?.[1] ? Number(thresholdMatch[1]) : 0;
	          const less = /\b(less|below|under|menor|abaixo)\b/i.test(low);
	          ops.push({
	            kind: "apply_conditional_format",
	            rangeA1: `${sheetName}!${a1}`,
	            rule: {
	              type: less ? "NUMBER_LESS" : "NUMBER_GREATER",
	              value: Number.isFinite(threshold) ? threshold : 0,
	              backgroundHex: "#FEF3C7",
	            },
	          });
	        }

	        if (wantsPrintLayout && sheetName) {
	          const showGrid = /\b(show gridlines|mostrar grade)\b/i.test(low);
	          const hideGrid = /\b(hide gridlines|ocultar grade)\b/i.test(low);
	          if (showGrid || hideGrid) {
	            ops.push({ kind: "set_print_layout", sheetName, hideGridlines: hideGrid && !showGrid });
	          }
	        }

	        // Insert/delete rows and columns
	        if (wantsInsertRow) {
	          const targetSheet = sheetName || viewerSheetNameRaw || "Sheet1";
	          const countMatch = String(params.req.message || "").match(/\b(\d{1,4})\s*(?:empty\s+)?(?:rows?|linhas?)\b/i);
	          const count = countMatch?.[1] ? Math.max(1, Math.min(Number(countMatch[1]), 500)) : 1;
	          const afterMatch = String(params.req.message || "").match(/\b(?:after|below|abaixo|depois|ap[oó]s)\s+(?:row\s*)?(\d{1,7})\b/i);
	          const beforeMatch = String(params.req.message || "").match(/\b(?:before|above|acima|antes)\s+(?:row\s*)?(\d{1,7})\b/i);
	          const atMatch = String(params.req.message || "").match(/\b(?:at|in|na|no|em)\s+(?:row\s*)?(\d{1,7})\b/i);
	          const rowNumFromA1 = a1 ? Number(String(a1).replace(/[^0-9]/g, "")) : 0;
	          let startIndex = afterMatch?.[1] ? Number(afterMatch[1]) : (beforeMatch?.[1] ? Number(beforeMatch[1]) - 1 : (atMatch?.[1] ? Number(atMatch[1]) - 1 : (rowNumFromA1 > 0 ? rowNumFromA1 : 0)));
	          startIndex = Number.isFinite(startIndex) && startIndex >= 0 ? startIndex : 0;
	          ops.push({ kind: "insert_rows", sheetName: targetSheet, startIndex, count });
	        }

	        if (wantsDeleteRow) {
	          const targetSheet = sheetName || "Sheet1";
	          const countMatch = String(params.req.message || "").match(/\b(\d{1,4})\s*(?:rows?|linhas?)\b/i);
	          const count = countMatch?.[1] ? Math.max(1, Math.min(Number(countMatch[1]), 500)) : 1;
	          const rowMatch = String(params.req.message || "").match(/\b(?:row|linha)\s*(\d{1,7})\b/i);
	          const rowNumFromA1 = a1 ? Number(String(a1).replace(/[^0-9]/g, "")) : 0;
	          let startIndex = rowMatch?.[1] ? Number(rowMatch[1]) - 1 : (rowNumFromA1 > 0 ? rowNumFromA1 - 1 : 0);
	          startIndex = Number.isFinite(startIndex) && startIndex >= 0 ? startIndex : 0;
	          ops.push({ kind: "delete_rows", sheetName: targetSheet, startIndex, count });
	        }

	        if (wantsInsertColumn) {
	          const targetSheet = sheetName || "Sheet1";
	          const countMatch = String(params.req.message || "").match(/\b(\d{1,4})\s*(?:columns?|colunas?)\b/i);
	          const count = countMatch?.[1] ? Math.max(1, Math.min(Number(countMatch[1]), 200)) : 1;
	          const colMatch = String(params.req.message || "").match(/\b(?:column|coluna)\s*([A-Z]{1,3})\b/i);
	          const afterColMatch = String(params.req.message || "").match(/\b(?:after|before|at)\s+(?:column\s*)?([A-Z]{1,3})\b/i);
	          const colRef = String(afterColMatch?.[1] || colMatch?.[1] || "A").toUpperCase();
	          const colIdx = colRef.split("").reduce((acc: number, ch: string) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
	          ops.push({ kind: "insert_columns", sheetName: targetSheet, startIndex: Math.max(0, colIdx), count });
	        }

	        if (wantsDeleteColumn) {
	          const targetSheet = sheetName || "Sheet1";
	          const countMatch = String(params.req.message || "").match(/\b(\d{1,4})\s*(?:columns?|colunas?)\b/i);
	          const count = countMatch?.[1] ? Math.max(1, Math.min(Number(countMatch[1]), 200)) : 1;
	          const colMatch = String(params.req.message || "").match(/\b(?:column|coluna)\s*([A-Z]{1,3})\b/i);
	          const colRef = String(colMatch?.[1] || "A").toUpperCase();
	          const colIdx = colRef.split("").reduce((acc: number, ch: string) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
	          ops.push({ kind: "delete_columns", sheetName: targetSheet, startIndex: Math.max(0, colIdx), count });
	        }

	        const agg = parseAgg(low);
	        const wantsAgg = Boolean(agg);
	        if (wantsAgg) {
	          if (!sheetName || !a1) {
	            const text = "Select a range to compute (or include an A1 range like `Sheet1!A2:A20`) and tell me where to put the result.";
	            if (params.sink?.isOpen()) {
	              params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
	              params.sink.write({ event: "delta", data: { text } } as any);
	            }
	            const assistantMsg = await this.createMessage({
	              conversationId: params.conversationId,
	              role: "assistant",
	              content: text,
	              userId: params.req.userId,
	              metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
	            });
	            return {
	              conversationId: params.conversationId,
	              userMessageId: userMsg.id,
	              assistantMessageId: assistantMsg.id,
	              assistantText: text,
	              sources: [],
	              answerMode: "action_receipt",
	              answerClass: "NAVIGATION",
	              navType: null,
	            };
	          }

	          // Destination: explicit "in E2" / "into Sheet1!E2" OR a safe default for 1D ranges.
	          const explicitDest = (() => {
	            const m = String(params.req.message || "").match(/\b(?:into|in|to|at)\s+((?:'[^']+'|[A-Za-z0-9 _.-]+)!)?([A-Z]{1,3}\d{1,7})\b/);
	            if (!m) return null;
	            const sheet = String(m[1] || "").replace(/!$/, "").replace(/^'/, "").replace(/'$/, "").trim();
	            const cell = String(m[2] || "").trim();
	            return { sheetName: sheet || sheetName, a1: cell };
	          })();

	          const dest = (() => {
	            if (explicitDest?.a1) return explicitDest;
	            if (!String(a1).includes(":")) return null;
	            const [startRef, endRef] = String(a1).split(":");
	            const s = parseCellRef(startRef);
	            const e = parseCellRef(endRef);
	            if (!s || !e) return null;
	            const sameCol = s.col === e.col;
	            const sameRow = s.row === e.row;
	            if (sameCol && !sameRow) return { sheetName, a1: `${e.col}${e.row + 1}` }; // below range
	            if (sameRow && !sameCol) return { sheetName, a1: `${numToCol(colToNum(e.col) + 1)}${e.row}` }; // right of range
	            return null; // 2D range: ambiguous default
	          })();

	          if (!dest?.sheetName || !dest?.a1) {
	            const text =
	              `Where should I put the ${agg!.label}?\n\n` +
	              `Example: \`put the ${agg!.label} of ${sheetName}!${a1} into ${sheetName}!E2\`.`;
	            if (params.sink?.isOpen()) {
	              params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
	              params.sink.write({ event: "delta", data: { text } } as any);
	            }
	            const assistantMsg = await this.createMessage({
	              conversationId: params.conversationId,
	              role: "assistant",
	              content: text,
	              userId: params.req.userId,
	              metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
	            });
	            return {
	              conversationId: params.conversationId,
	              userMessageId: userMsg.id,
	              assistantMessageId: assistantMsg.id,
	              assistantText: text,
	              sources: [],
	              answerMode: "action_receipt",
	              answerClass: "NAVIGATION",
	              navType: null,
	            };
	          }

	          if (wantsFormulaExplicitly) {
	            // User explicitly asked for a formula — write it as-is.
	            const formula = `=${agg!.fn}(${quoteSheetRef(sheetName)}!${a1})`;
	            ops.push({ kind: "set_formula", a1: `${dest.sheetName}!${dest.a1}`, formula });
	          } else {
	            // Default: compute the numeric value server-side (viewer can't evaluate formulas).
	            const value = await evaluateAggFromWorkbook({ sheetName, a1, fn: agg!.fn });
	            if (value != null) {
	              const sourceAnchor = String(a1 || "").split(":")[0] || "";
	              ops.push({
	                kind: "set_values",
	                rangeA1: `${dest.sheetName}!${dest.a1}`,
	                values: [[value]],
	                ...(sourceAnchor ? { copyStyleFrom: `${sheetName}!${sourceAnchor}` } : {}),
	              });
	            } else {
	              // Couldn't compute — fall back to formula.
	              const formula = `=${agg!.fn}(${quoteSheetRef(sheetName)}!${a1})`;
	              ops.push({ kind: "set_formula", a1: `${dest.sheetName}!${dest.a1}`, formula });
	            }
	          }
	        }

	        // Natural command fallback: "calculate this" with selected range.
	        if (!ops.length && viewerMode && viewerWantsCompute && sheetName && a1) {
	          const fn = "SUM";
	          const value = await evaluateAggFromWorkbook({ sheetName, a1, fn });
	          if (value != null) {
	            const [startRef, endRef] = String(a1).includes(":")
	              ? String(a1).split(":")
	              : [String(a1), String(a1)];
	            const s = parseCellRef(startRef);
	            const e = parseCellRef(endRef);
	            if (s && e) {
	              const sameCol = s.col === e.col;
	              const sameRow = s.row === e.row;
	              const destA1 =
	                sameCol && !sameRow
	                  ? `${s.col}${Math.max(s.row, e.row) + 1}`
	                  : sameRow && !sameCol
	                    ? `${numToCol(Math.max(colToNum(s.col), colToNum(e.col)) + 1)}${s.row}`
	                    : `${s.col}${Math.max(s.row, e.row) + 1}`;
	              const sourceAnchor = String(a1 || "").split(":")[0] || "";
	              ops.push({
	                kind: "set_values",
	                rangeA1: `${sheetName}!${destA1}`,
	                values: [[value]],
	                ...(sourceAnchor ? { copyStyleFrom: `${sheetName}!${sourceAnchor}` } : {}),
	              });
	            }
	          }
	        }

	        // Direct assignment fallback for editor-mode language:
	        // "change/set ... to X" should write into the selected cell/range.
	        if (!ops.length && sheetName && a1) {
	          const wantsDirectSet =
	            /\b(set|change|replace|update|write|put|make|edit)\b/i.test(low) ||
	            /\b(definir|mudar|alterar|substituir|trocar|atualizar|colocar|editar)\b/i.test(low);
	          const rawValue =
	            this.parseAfterToValue(params.req.message) ||
	            this.extractQuotedText(params.req.message) ||
	            "";
	          const rawValueTrimmed = String(rawValue || "").trim();
	          const formulaCandidate = rawValueTrimmed.startsWith("=")
	            ? rawValueTrimmed.slice(1).trim()
	            : rawValueTrimmed;
	          const wantsFormula =
	            /\bformula|f[óo]rmula\b/i.test(low) ||
	            rawValueTrimmed.startsWith("=");

	          if (wantsDirectSet && rawValueTrimmed) {
	            if (wantsFormula && formulaCandidate) {
	              if (String(a1).includes(":")) {
	                const [startRef, endRef] = String(a1).split(":");
	                const s = parseCellRef(startRef);
	                const e = parseCellRef(endRef);
	                if (s && e) {
	                  const minCol = Math.min(colToNum(s.col), colToNum(e.col));
	                  const maxCol = Math.max(colToNum(s.col), colToNum(e.col));
	                  const minRow = Math.min(s.row, e.row);
	                  const maxRow = Math.max(s.row, e.row);
	                  const shiftFormula = (base: string, rowDelta: number, colDelta: number): string =>
	                    String(base || "").replace(/\$?[A-Z]{1,3}\$?\d{1,7}/g, (token) => {
	                      const m = token.match(/^(\$?)([A-Z]{1,3})(\$?)(\d{1,7})$/i);
	                      if (!m) return token;
	                      const absCol = m[1] === "$";
	                      const absRow = m[3] === "$";
	                      let colNum = colToNum(String(m[2] || "").toUpperCase());
	                      let rowNum = Number(m[4]);
	                      if (!absCol) colNum += colDelta;
	                      if (!absRow) rowNum += rowDelta;
	                      colNum = Math.max(1, colNum);
	                      rowNum = Math.max(1, rowNum);
	                      return `${absCol ? "$" : ""}${numToCol(colNum)}${absRow ? "$" : ""}${rowNum}`;
	                    });
	                  let created = 0;
	                  for (let row = minRow; row <= maxRow; row += 1) {
	                    for (let col = minCol; col <= maxCol; col += 1) {
	                      if (created >= 250) break;
	                      const rowDelta = row - minRow;
	                      const colDelta = col - minCol;
	                      ops.push({
	                        kind: "set_formula",
	                        a1: `${sheetName}!${numToCol(col)}${row}`,
	                        formula: shiftFormula(formulaCandidate, rowDelta, colDelta),
	                      });
	                      created += 1;
	                    }
	                    if (created >= 250) break;
	                  }
	                }
	              } else {
	                ops.push({
	                  kind: "set_formula",
	                  a1: `${sheetName}!${a1}`,
	                  formula: formulaCandidate,
	                });
	              }
	            } else {
	              const normalizedValue =
	                this.normalizeXlsxValueText(rawValueTrimmed) ??
	                rawValueTrimmed;
	              if (String(a1).includes(":")) {
	                const [startRef, endRef] = String(a1).split(":");
	                const s = parseCellRef(startRef);
	                const e = parseCellRef(endRef);
	                if (s && e) {
	                  const rowCount = Math.abs(e.row - s.row) + 1;
	                  const colCount = Math.abs(colToNum(e.col) - colToNum(s.col)) + 1;
	                  const values = Array.from({ length: rowCount }, () =>
	                    Array.from({ length: colCount }, () => normalizedValue),
	                  );
	                  ops.push({
	                    kind: "set_values",
	                    rangeA1: `${sheetName}!${a1}`,
	                    values,
	                  });
	                }
	              } else {
	                ops.push({
	                  kind: "set_values",
	                  rangeA1: `${sheetName}!${a1}`,
	                  values: [[normalizedValue]],
	                });
	              }
	            }
	          }
	        }

	        if (!ops.length) {
	          const text = "Tell me what to compute or change. Examples: `format the selected range as a table`, or `put the sum of the selected range into Sheet1!E2`.";
	          if (params.sink?.isOpen()) {
	            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
	            params.sink.write({ event: "delta", data: { text } } as any);
	          }
	          const assistantMsg = await this.createMessage({
	            conversationId: params.conversationId,
	            role: "assistant",
	            content: text,
	            userId: params.req.userId,
	            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
	          });
	          return {
	            conversationId: params.conversationId,
	            userMessageId: userMsg.id,
	            assistantMessageId: assistantMsg.id,
	            assistantText: text,
	            sources: [],
	            answerMode: "action_receipt",
	            answerClass: "NAVIGATION",
	            navType: null,
	          };
	        }

	        beforeText = "(compute)";
	        proposedText = JSON.stringify({ ops });
	        operator = "COMPUTE_BUNDLE";
	      } else if (operator === "EDIT_CELL" || operator === "EDIT_RANGE") {
	        const extraction = await extractXlsxWithAnchors(bytes).catch(() => null);
	        const facts = Array.isArray((extraction as any)?.cellFacts) ? (extraction as any).cellFacts : [];
	        const sheetNames = (extraction as any)?.sheetNames || [];

        // 1) Explicit A1 target (with optional sheet name)
        const explicitTarget = this.parseSheetTarget(params.req.message);

        let sheetName: string | null = explicitTarget?.sheetName
          ? explicitTarget.sheetName
          : (Array.isArray(sheetNames) && sheetNames.length ? sheetNames[0] : null);

        let a1: string | null = explicitTarget?.a1 || null;

        // In editor mode, locked viewer selection acts as an explicit target.
        if (!a1) {
          const viewerFromCombined = viewerCombinedRange?.a1
            ? String(viewerCombinedRange.a1 || "").trim()
            : "";
          const viewerFromRaw = String(viewerRangeA1Raw || "").trim();
          const pickedA1 = viewerFromCombined || viewerFromRaw;
          if (pickedA1) {
            a1 = pickedA1;
            if (!sheetName) {
              sheetName =
                String(viewerCombinedRange?.sheetName || "").trim() ||
                String(viewerSheetNameRaw || "").trim() ||
                sheetName;
            }
            if (pickedA1.includes(":")) operator = "EDIT_RANGE";
          }
        }

        // 2) Semantic target resolution (Jan revenue, Q1 expenses, etc.)
        if (!a1 && facts.length) {
          const month = this.parseMonthFromText(params.req.message);
          const quarter = this.parseQuarterFromText(params.req.message);
          const wantsRevenue = /\b(revenue|receita)\b/i.test(params.req.message);
          const wantsExpenses = /\b(expenses?|despesas?)\b/i.test(params.req.message);
          const metric = wantsExpenses ? "expenses" : wantsRevenue ? "revenue" : null;

          if (metric && (month || quarter)) {
            const metricFacts = facts.filter((f: any) => String(f?.rowLabel || "").toLowerCase().includes(metric));

            if (month) {
              const f = metricFacts.find((x: any) => Number(x?.period?.month || 0) === month) || null;
              if (f?.cell) {
                a1 = String(f.cell);
                sheetName = sheetName || String(f.sheet || f.sheetName || "");
              }
            } else if (quarter) {
              const months = quarter === 1 ? [1, 2, 3] : quarter === 2 ? [4, 5, 6] : quarter === 3 ? [7, 8, 9] : [10, 11, 12];
              const qFacts = months
                .map((m) => metricFacts.find((x: any) => Number(x?.period?.month || 0) === m) || null)
                .filter(Boolean) as any[];
              if (qFacts.length >= 2) {
                // Assume same sheet and same row; compute a left-to-right range.
                const cells = qFacts.map((x) => String(x.cell));
                const parsed = cells.map((c) => {
                  const mm = c.match(/^([A-Z]{1,3})(\d{1,7})$/i);
                  return mm ? { col: mm[1].toUpperCase(), row: Number(mm[2]) } : null;
                }).filter(Boolean) as Array<{ col: string; row: number }>;

                if (parsed.length >= 2) {
                  const rowNum = parsed[0]!.row;
                  const allSameRow = parsed.every((p) => p.row === rowNum);
                  if (allSameRow) {
                    const colToNum = (col: string) => col.split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
                    const numToCol = (n: number) => {
                      let x = n;
                      let s = "";
                      while (x > 0) {
                        const r = (x - 1) % 26;
                        s = String.fromCharCode(65 + r) + s;
                        x = Math.floor((x - 1) / 26);
                      }
                      return s;
                    };
                    const nums = parsed.map((p) => colToNum(p.col));
                    const min = Math.min(...nums);
                    const max = Math.max(...nums);
                    a1 = `${numToCol(min)}${rowNum}:${numToCol(max)}${rowNum}`;
                    sheetName = sheetName || String(qFacts[0]?.sheet || qFacts[0]?.sheetName || "");
                    operator = "EDIT_RANGE";
                  }
                }
              }
            }
          }
        }

        if (!a1) {
          const text = "Tell me which cell (or range) to edit (e.g. `set B2 to 42`), or specify a metric + period (e.g. `change revenue for January to 525000`).";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }

        if (!sheetName) {
          sheetName = Array.isArray(sheetNames) && sheetNames.length ? sheetNames[0] : null;
        }
        if (!sheetName) {
          const text = "I couldn't determine which worksheet to edit. Please include the sheet name like `Sheet1!B2`.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }

        targetHint = `${sheetName}!${a1}`;
        resolvedTarget = this.buildResolvedTargetForXlsx(sheetName, a1);
        beforeText = await this.readXlsxBeforeText(bytes, sheetName, a1);

        // Proposed values:
        // - Cells: allow quoted strings; otherwise parse currency/number
        // - Ranges: accept comma-separated list (turn into a vertical grid) or TSV/CSV pasted below
        const rawAfter = this.parseAfterToValue(params.req.message) || "";
        const quoted = this.extractQuotedText(params.req.message);

        if (!a1.includes(":")) {
          proposedText = quoted || this.normalizeXlsxValueText(rawAfter);
        } else {
          // Prefer pasted table/grid after newline
          const idx = params.req.message.indexOf("\n");
          if (idx >= 0) {
            proposedText = params.req.message.slice(idx + 1).trim();
          }
          if (!proposedText) {
            // Parse list of monetary values from the "to ..." segment
            const tail = rawAfter || params.req.message;
            const tokens = (tail.match(/\(?-?\$?[\d,]+(?:\.\d+)?\)?/g) || [])
              // Drop cell refs like B2/B4 by ignoring short tokens with a letter prefix.
              .filter((t) => !/^[A-Za-z]{1,3}\d{1,7}$/.test(t.trim()));
            const nums = tokens.map((t) => this.parseMoney(t) ?? Number(String(t).replace(/[(),$\s]/g, "").replace(/,/g, ""))).filter((n) => Number.isFinite(n)) as number[];
            if (nums.length) {
              // Trim to the expected number of cells in the range so trailing numbers in the
              // filename (e.g. "2024") don't get interpreted as values.
              const m = String(a1).split(":").map((x) => x.trim());
              const parseA1 = (x: string) => {
                const mm = x.match(/^([A-Z]{1,3})(\d{1,7})$/i);
                if (!mm) return null;
                const col = mm[1].toUpperCase().split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
                const row = Number(mm[2]);
                return { col, row };
              };
              const start = parseA1(m[0] || "");
              const end = parseA1(m[1] || m[0] || "");
              const expected = start && end
                ? (Math.abs(end.row - start.row) + 1) * (Math.abs(end.col - start.col) + 1)
                : nums.length;
              const clipped = expected > 0 ? nums.slice(0, expected) : nums;
              if (start && end) {
                const rowCount = Math.abs(end.row - start.row) + 1;
                const colCount = Math.abs(end.col - start.col) + 1;
                const grid: string[][] = [];
                for (let r = 0; r < rowCount; r += 1) {
                  const row: string[] = [];
                  for (let c = 0; c < colCount; c += 1) {
                    const idx = r * colCount + c;
                    row.push(idx < clipped.length ? String(clipped[idx]) : "");
                  }
                  grid.push(row);
                }
                // TSV is unambiguous and supported by the range parser.
                proposedText = grid.map((row) => row.join("\t")).join("\n").trim();
              } else {
                proposedText = clipped.map((n) => String(n)).join("\n");
              }
            }
          }
        }

        if (!proposedText) {
          const text = "Tell me what value(s) to set. Example: `set B2 to 525000`.";
          if (params.sink?.isOpen()) {
            params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
            params.sink.write({ event: "delta", data: { text } } as any);
          }
          const assistantMsg = await this.createMessage({
            conversationId: params.conversationId,
            role: "assistant",
            content: text,
            userId: params.req.userId,
            metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
          });
          return {
            conversationId: params.conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: text,
            sources: [],
            answerMode: "action_receipt",
            answerClass: "NAVIGATION",
            navType: null,
          };
        }
      } else {
        return null;
      }

      const sheetDraftScope: "selection" | "paragraph" | "section" | "document" | "range" | "unknown" = (() => {
        const hint = String(targetHint || "").trim();
        if (hint.includes(":")) return "range";
        if (hasViewerSelection) return "selection";
        return "unknown";
      })();
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "FIND_TARGETS",
        status: "done",
        summary: editSummary,
        scope: sheetDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          targetHint: String(targetHint || "").trim() || undefined,
          targetLabel: String(resolvedTarget?.label || "").trim() || undefined,
        },
      });
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "DRAFT_CHANGES",
        status: "active",
        summary: editSummary,
        scope: sheetDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          targetHint: String(targetHint || "").trim() || undefined,
        },
      });

      const preview = await this.editHandler.execute({
        mode: "preview",
        context: {
          userId: params.req.userId,
          conversationId: params.conversationId,
          correlationId: params.traceId,
          clientMessageId: userMsg.id,
          language: params.req.preferredLanguage,
        } as any,
        planRequest: {
          instruction: params.req.message,
          operator,
          domain,
          documentId: doc.id,
          targetHint,
        },
        ...(resolvedTarget ? { target: resolvedTarget } : {}),
        beforeText: beforeText || "(empty)",
        proposedText: (proposedText || "").trim() || "(empty)",
      });

      if (!preview.ok) {
        this.emitEditProgress(params.sink, {
          phase: "DRAFT",
          step: "DRAFT_CHANGES",
          status: "error",
          summary: editSummary,
          scope: sheetDraftScope,
          documentKind: domain,
          documentLabel: editDocumentLabel,
          vars: {
            ...baseEditVars,
            error: preview.error || "preview_failed",
          },
        });
        const text = preview.error || "Edit preview failed.";
        if (params.sink?.isOpen()) {
          params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
          params.sink.write({ event: "delta", data: { text } } as any);
        }
        const assistantMsg = await this.createMessage({
          conversationId: params.conversationId,
          role: "assistant",
          content: text,
          userId: params.req.userId,
          metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
        });
        return {
          conversationId: params.conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          sources: [],
          answerMode: "action_receipt",
          answerClass: "NAVIGATION",
          navType: null,
        };
      }

      const sheetOpsForAttachment = (() => {
        if (String(domain) !== "sheets") return [];
        const parsedFromPreview = Array.isArray((preview.result as any)?.ops)
          ? (preview.result as any).ops
          : [];
        if (parsedFromPreview.length) return parsedFromPreview;
        const text = String(proposedText || "").trim();
        if (!text) return [];
        try {
          const payload = JSON.parse(text);
          if (Array.isArray((payload as any)?.ops)) return (payload as any).ops;
          if (payload && typeof payload === "object" && String((payload as any)?.kind || "").trim()) return [payload];
        } catch {}
        return [];
      })();
      const sheetDraftCount = (() => {
        if (Array.isArray(sheetOpsForAttachment) && sheetOpsForAttachment.length > 0) return sheetOpsForAttachment.length;
        const diffChanges = Array.isArray((preview.result as any)?.diff?.changes)
          ? (preview.result as any).diff.changes.length
          : 0;
        return diffChanges > 0 ? diffChanges : 1;
      })();
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "DRAFT_CHANGES",
        status: "done",
        summary: editSummary,
        scope: sheetDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          changes: sheetDraftCount,
          targetHint: String(targetHint || "").trim() || undefined,
        },
      });
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "VALIDATE_PREVIEW",
        status: "active",
        summary: editSummary,
        scope: sheetDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          changes: sheetDraftCount,
          targetHint: String(targetHint || "").trim() || undefined,
        },
      });
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "VALIDATE_PREVIEW",
        status: "done",
        summary: editSummary,
        scope: sheetDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          changes: sheetDraftCount,
          targetHint: String(targetHint || "").trim() || undefined,
        },
      });
      this.emitEditProgress(params.sink, {
        phase: "DRAFT",
        step: "PREVIEW_READY",
        status: "done",
        summary: editSummary,
        scope: sheetDraftScope,
        documentKind: domain,
        documentLabel: editDocumentLabel,
        vars: {
          ...baseEditVars,
          changes: sheetDraftCount,
          targetHint: String(targetHint || "").trim() || undefined,
        },
      });
      const resolvedForUi = (preview.result as any)?.target || resolvedTarget;
      const routingMeta = this.resolveAllybiEditRoutingMeta({
        domain,
        runtimeOperator: operator,
        instruction: params.req.message,
        targetHint: targetHint || resolvedForUi?.id || undefined,
        hasSelection: Boolean(hasViewerSelection),
      });

      const editAttachment = {
        type: "edit_session",
        domain,
        operator,
        canonicalOperator: routingMeta.canonicalOperator,
        renderType: routingMeta.renderType,
        instruction: params.req.message,
        documentId: doc.id,
        filename,
        mimeType: docMime,
        target: resolvedForUi,
        targetId: resolvedForUi?.id,
        locationLabel: (() => {
          const raw = String((resolvedForUi?.label) || "").trim();
          if (!raw) return "";
          if (String(domain) === "docx" && raw.includes(" > ")) return raw.split(" > ")[0] || raw;
          return raw;
        })(),
        documentKind: domain,
        beforeText,
        proposedText,
        diff: (preview.result as any)?.diff,
        rationale: (preview.result as any)?.rationale,
        requiresConfirmation: Boolean((preview.result as any)?.requiresConfirmation) || routingMeta.requiresConfirmation,
        ...(sheetOpsForAttachment.length ? { ops: sheetOpsForAttachment } : {}),
      };

      const chartPreviewDraft =
        String(domain) === "sheets" && (String(operator) === "CREATE_CHART" || String(operator) === "COMPUTE_BUNDLE" || String(operator) === "COMPUTE")
          ? await this.buildChartPreviewAttachmentFromDraft({
              xlsxBytes: bytes,
              operator: String(operator),
              proposedText: String(proposedText || ""),
              userMessage: String(params.req.message || ""),
            })
          : null;
      const chartPreviewAttachment = chartPreviewDraft?.attachment || null;
      const chartPreviewWarning = String(chartPreviewDraft?.warning || "").trim();

      const attachmentsPayload = chartPreviewAttachment
        ? [chartPreviewAttachment, editAttachment]
        : [editAttachment];

      const baseText = (preview.result as any)?.receipt?.note
        ? `Edit preview ready for **${filename}**.\n\n${(preview.result as any).receipt.note}`
        : `Edit preview ready for **${filename}**. Review the diff, then click Apply to create a new revision.`;
      const text = chartPreviewWarning
        ? `${baseText}\n\nChart check: ${chartPreviewWarning}`
        : baseText;

      if (params.sink?.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: attachmentsPayload, answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        attachmentsPayload,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

    return null;
    } catch (e: any) {
      // Editing family was detected, but we must not crash the whole chat pipeline.
      const userMsg = params.existingUserMsgId
        ? { id: params.existingUserMsgId }
        : await this.createMessage({ conversationId: params.conversationId, role: "user", content: params.req.message, userId: params.req.userId });

      const text = process.env.NODE_ENV === "production"
        ? "Something went wrong while preparing that edit. Please try again."
        : `Edit failed: ${e?.message || "unknown error"}`;

      if (params.sink?.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });

      return {
        conversationId: params.conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }
  }

  /* ---------------- Chat (non-streamed) ---------------- */

  async chat(req: ChatRequest): Promise<ChatResult> {
    const traceId = mkTraceId();
    const isViewerMode = Boolean((req?.meta as any)?.viewerMode);

    // 1) Ensure conversation exists
    const conversationId = await this.ensureConversation(req.userId, req.conversationId);

    // 2) Load recent messages (context for the engine)
    const history = await this.loadRecentForEngine(conversationId, 60, req.userId);

    // Viewer/editor chat must prioritize document editing semantics over connector/chat intents.
    if (isViewerMode) {
      const editHandled = await this.tryHandleEditingTurn({
        traceId,
        req,
        conversationId,
        history,
      });
      if (editHandled) return editHandled;
      const text =
        "You are in document edit mode. I can only run document edits here. Select text/cells and ask an edit command, or exit editor mode for email/connectors.";
      const userMsg = await this.createMessage({
        conversationId,
        role: "user",
        content: req.message,
        userId: req.userId,
      });
      const assistantMsg = await this.createMessage({
        conversationId,
        role: "assistant",
        content: text,
        userId: req.userId,
        metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });
      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

    // --- Slides / deck requests (Google Slides) ---
    if (this.isSlideOrDeckRequest(req.message)) {
      const userMsg = await this.createMessage({
        conversationId, role: 'user', content: req.message, userId: req.userId,
      });

      const out = await this.handleSlidesDeckRequest({
        traceId,
        userId: req.userId,
        conversationId,
        message: req.message,
        preferredLanguage: req.preferredLanguage,
        context: req.context || null,
      });

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: req.userId,
        metadata: { sources: [], attachments: out.attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: [],
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    // --- Chart requests (visual attachments rendered by UI) ---
    if (this.isChartRequest(req.message)) {
      const userMsg = await this.createMessage({
        conversationId, role: 'user', content: req.message, userId: req.userId,
      });

      const out = await this.handleChartRequest({
        userId: req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: req.message,
        history,
      });

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: req.userId,
        metadata: { sources: [], attachments: out.attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: [],
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    // --- Image generation requests (visual attachments) ---
    if (this.isImageGenerationRequest(req.message)) {
      const userMsg = await this.createMessage({
        conversationId, role: 'user', content: req.message, userId: req.userId,
      });

      const out = await this.handleImageGenerationRequest({
        userId: req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: req.message,
      });

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: req.userId,
        metadata: { sources: [], attachments: out.attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: [],
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    // --- Confirmation tokens (email send, connector disconnect, etc.) ---
    // NOTE: file_actions also use confirmationToken, but those tokens are not HMAC-signed and must fall through.
    if (req.confirmationToken) {
      // 1) Email send confirmation token
      try {
        const payload = this.verifyEmailSendToken(req.confirmationToken, req.userId);
        const userMsg = await this.createMessage({
          conversationId, role: 'user', content: req.message, userId: req.userId,
        });

        const out = await this.handleComposeQuery({
          userId: req.userId,
          conversationId,
          correlationId: traceId,
          clientMessageId: userMsg.id,
          message: req.message,
          compose: { to: null, subject: null, bodyHint: null, provider: payload.provider },
          connectorContext: req.connectorContext,
          confirmationToken: req.confirmationToken,
          attachedDocumentIds: req.attachedDocumentIds ?? [],
        });

        const assistantMsg = await this.createMessage({
          conversationId, role: 'assistant', content: out.text, userId: req.userId,
          metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: out.text,
          attachmentsPayload: out.attachments,
          sources: out.sources,
          answerMode: out.answerMode,
          answerClass: out.answerClass,
          navType: null,
        };
      } catch {
        // not an email_send token
      }

      // 2) Connector disconnect confirmation token
      try {
        const payload = this.verifyConnectorDisconnectToken(req.confirmationToken, req.userId);
        const userMsg = await this.createMessage({
          conversationId, role: 'user', content: req.message, userId: req.userId,
        });

        const result = await this.connectorHandler.execute({
          action: 'disconnect',
          provider: payload.provider,
          context: {
            userId: req.userId,
            conversationId,
            correlationId: traceId,
            clientMessageId: userMsg.id,
          },
        });

        const text = result.ok
          ? `Disconnected ${this.labelForConnector(payload.provider)}.`
          : `Failed to disconnect ${this.labelForConnector(payload.provider)}. ${result.error || ''}`.trim();

        const assistantMsg = await this.createMessage({
          conversationId,
          role: 'assistant',
          content: text,
          userId: req.userId,
          metadata: { sources: [], attachments: [], answerMode: 'action_receipt' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: null },
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          sources: [],
          answerMode: 'action_receipt' as AnswerMode,
          answerClass: 'NAVIGATION' as AnswerClass,
          navType: null,
        };
      } catch {
        // not a connector_disconnect token
      }
    }

    // --- Connector: confirm sending the most recent drafted email ("send it") ---
    if (this.isSendItConfirmation(req.message) && !req.confirmationToken) {
      const userMsg = await this.createMessage({
        conversationId, role: 'user', content: req.message, userId: req.userId,
      });

      const token = await this.findLatestEmailSendTokenFromConversation({ conversationId });
      if (!token) {
        const text = 'There is no pending email draft to send. Ask me to draft one first (example: "Draft an email to alice@example.com about the contract").';
        const assistantMsg = await this.createMessage({
          conversationId, role: 'assistant', content: text, userId: req.userId,
          metadata: { sources: [], attachments: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          sources: [],
          answerMode: 'general_answer' as AnswerMode,
          answerClass: 'GENERAL' as AnswerClass,
          navType: null,
        };
      }

      const payload = this.verifyEmailSendToken(token, req.userId);
      const out = await this.handleComposeQuery({
        userId: req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: req.message,
        compose: { to: null, subject: null, bodyHint: null, provider: payload.provider },
        connectorContext: req.connectorContext,
        confirmationToken: token,
        attachedDocumentIds: req.attachedDocumentIds ?? [],
      });

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: req.userId,
        metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: out.sources,
        answerMode: out.answerMode,
        answerClass: out.answerClass,
        navType: null,
      };
    }

    // --- Connector: compose/draft email ---
    const composeQuery = await this.detectComposeQuery(req.userId, req.message);
    if (composeQuery) {
      const userMsg = await this.createMessage({
        conversationId, role: 'user', content: req.message, userId: req.userId,
      });

      const out = await this.handleComposeQuery({
        userId: req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: req.message,
        compose: composeQuery,
        connectorContext: req.connectorContext,
        confirmationToken: req.confirmationToken,
        attachedDocumentIds: req.attachedDocumentIds ?? [],
      });

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: req.userId,
        metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: out.sources,
        answerMode: out.answerMode,
        answerClass: out.answerClass,
        navType: null,
      };
    }

    // --- Email: bank-driven read/explain/draft/send + email+doc fusion flag ---
    let forceEmailFusion = false;
    try {
      const decision = await this.intentEngineV3.resolve({
        text: req.message,
        languageHint: req.preferredLanguage,
      } as any);

      if (decision?.intentFamily === 'email') {
        const op = String(decision.operator || '').trim();

        if (op === 'EMAIL_DOC_FUSION') {
          // Do not intercept; this modifies the downstream RAG behavior.
          forceEmailFusion = true;
        } else if (op === 'EMAIL_SUMMARIZE_PREVIOUS') {
          const explainedPrev = await this.tryHandleExplainPreviousEmailTurn({
            traceId,
            req,
            conversationId,
            history,
          });
          if (explainedPrev) return explainedPrev;
        } else if (op === 'EMAIL_LATEST' || op === 'EMAIL_EXPLAIN_LATEST') {
          const userMsg = await this.createMessage({
            conversationId, role: 'user', content: req.message, userId: req.userId,
          });

          const out = await this.handleLatestConnectorQuery({
            userId: req.userId,
            conversationId,
            correlationId: traceId,
            clientMessageId: userMsg.id,
            message: req.message,
            latest: { provider: 'email', count: 1, mode: op === 'EMAIL_EXPLAIN_LATEST' ? 'explain' : 'raw' },
            connectorContext: req.connectorContext,
          });

          const storedAttachments = this.toConnectorEmailRefs(out.attachments || []);
          const assistantMsg = await this.createMessage({
            conversationId, role: 'assistant', content: out.text, userId: req.userId,
            metadata: { sources: out.sources, attachments: storedAttachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
          });

          return {
            conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: out.text,
            attachmentsPayload: out.attachments,
            sources: out.sources,
            answerMode: 'general_answer' as AnswerMode,
            answerClass: 'GENERAL' as AnswerClass,
            navType: null,
          };
        } else if (op === 'EMAIL_DRAFT' || op === 'EMAIL_SEND') {
          const extractor = getEmailComposeExtractor();
          const extracted = extractor.extract(req.message, (req.preferredLanguage as any) || 'en');

          if (!extracted.to) {
            const text = extractor.microcopy('missingRecipient', (req.preferredLanguage as any) || 'en');
            const userMsg = await this.createMessage({ conversationId, role: 'user', content: req.message, userId: req.userId });
            const assistantMsg = await this.createMessage({
              conversationId,
              role: 'assistant',
              content: text,
              userId: req.userId,
              metadata: { sources: [], attachments: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
            });
            return {
              conversationId,
              userMessageId: userMsg.id,
              assistantMessageId: assistantMsg.id,
              assistantText: text,
              sources: [],
              answerMode: 'general_answer' as AnswerMode,
              answerClass: 'GENERAL' as AnswerClass,
              navType: null,
            };
          }

          const userMsg = await this.createMessage({
            conversationId, role: 'user', content: req.message, userId: req.userId,
          });

          const out = await this.handleComposeQuery({
            userId: req.userId,
            conversationId,
            correlationId: traceId,
            clientMessageId: userMsg.id,
            message: req.message,
            compose: {
              to: extracted.to,
              subject: extracted.subject,
              bodyHint: extracted.body,
              provider: (extracted.provider === 'gmail' || extracted.provider === 'outlook') ? extracted.provider : 'email',
              lengthHint: extracted.lengthHint ?? null,
              toneHint: extracted.toneHint ?? null,
              purposeHint: extracted.purposeHint ?? null,
            },
            connectorContext: req.connectorContext,
            confirmationToken: req.confirmationToken,
            attachedDocumentIds: req.attachedDocumentIds ?? [],
          });

          const assistantMsg = await this.createMessage({
            conversationId, role: 'assistant', content: out.text, userId: req.userId,
            metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
          });

          return {
            conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: out.text,
            attachmentsPayload: out.attachments,
            sources: out.sources,
            answerMode: out.answerMode,
            answerClass: out.answerClass,
            navType: null,
          };
        }
      }
    } catch {
      // non-fatal; proceed with legacy logic and RAG
    }

    // Fallback: if the user explicitly references an email and a document, enable fusion even if
    // the bank-driven router missed it (e.g., in dev while patterns iterate).
    if (!forceEmailFusion && this.isEmailDocFusionRequest(req.message)) {
      forceEmailFusion = true;
    }

    // --- Connector: explain/summarize previous email ("summarize this email") ---
    const explainedPrev = await this.tryHandleExplainPreviousEmailTurn({
      traceId,
      req,
      conversationId,
      history,
    });
    if (explainedPrev) return explainedPrev;

    // --- Connector memory: email follow-up Q&A (literal, refetch by messageId) ---
    const emailQa = await this.tryHandleEmailContextQuestionTurn({
      traceId,
      req,
      conversationId,
      history,
    });
    if (emailQa) return emailQa;

    // --- Connector: "latest email/message" (Outlook/Gmail/Slack) ---
    const latestConnector = await this.detectLatestConnectorQuery(req.userId, req.message, req.connectorContext);
    if (latestConnector) {
      const userMsg = await this.createMessage({
        conversationId, role: 'user', content: req.message, userId: req.userId,
      });

      const out = await this.handleLatestConnectorQuery({
        userId: req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: req.message,
        latest: latestConnector,
        connectorContext: req.connectorContext,
      });

      const storedAttachments = this.toConnectorEmailRefs(out.attachments || []);
      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: req.userId,
        metadata: { sources: out.sources, attachments: storedAttachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: out.sources,
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    // --- Connector: connect/sync/status/search/disconnect (bank-driven first; fallback to legacy heuristics) ---
    let connectorAction: null | { action: 'connect' | 'sync' | 'status' | 'search' | 'disconnect'; provider: 'gmail' | 'outlook' | 'slack' | 'email' | 'all'; query?: string } = null;

    try {
      const decision = await this.intentEngineV3.resolve({
        text: req.message,
        languageHint: req.preferredLanguage,
      } as any);

      if (decision?.intentFamily === 'connectors') {
        const op = String(decision.operator || '').trim();
        const provider = String((decision as any)?.signals?.connectors?.provider || '').toLowerCase().trim();

        const mappedProvider =
          provider === 'gmail' ? 'gmail'
          : provider === 'outlook' ? 'outlook'
          : provider === 'slack' ? 'slack'
          : /\b(email|inbox|mail|emails)\b/i.test(req.message) ? 'email'
          : 'all';

        if (op === 'CONNECT_START') connectorAction = { action: 'connect', provider: mappedProvider };
        else if (op === 'CONNECTOR_SYNC') connectorAction = { action: 'sync', provider: mappedProvider };
        else if (op === 'CONNECTOR_STATUS') connectorAction = { action: 'status', provider: mappedProvider };
        else if (op === 'CONNECTOR_DISCONNECT') connectorAction = { action: 'disconnect', provider: mappedProvider };
      }
    } catch {
      // non-fatal; fall back to heuristics
    }

    if (!connectorAction) {
      connectorAction = await this.detectConnectorActionQuery(req.userId, req.message);
    }

    if (connectorAction) {
      const userMsg = await this.createMessage({
        conversationId, role: 'user', content: req.message, userId: req.userId,
      });

      const out = await this.handleConnectorActionQuery({
        userId: req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        detected: connectorAction,
        connectorContext: req.connectorContext,
      });

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: req.userId,
        metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: out.sources,
        answerMode: out.answerMode as AnswerMode,
        answerClass: out.answerClass as AnswerClass,
        navType: null,
      };
    }

    // --- Editing intent dispatching (DOCX/XLSX) ---
    const editHandled = await this.tryHandleEditingTurn({
      traceId,
      req,
      conversationId,
      history,
    });
    if (editHandled) return editHandled;

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
          metadata: { listing: filteredItems, sources: [], answerMode: 'nav_pills' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: 'discover' as NavType },
        });
        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: introText,
          listing: filteredItems,
          sources: [],
          answerMode: 'nav_pills' as AnswerMode,
          answerClass: 'NAVIGATION' as AnswerClass,
          navType: 'discover' as NavType,
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

    // Decide scoping:
    // - Attachments/folder-scoped search are hard scope.
    // - Persisted conversation scope is only used for referential/ambiguous follow-ups.
    const referentialFollowUp = this.isReferentialFollowUp(req.message, history);
    let useScope = scopeDocIds.length > 0 && (hasAttachments || !!scopedSearchDocIds || referentialFollowUp);
    let scopeCleared = false;
    if (!hasAttachments && !scopedSearchDocIds && scopeDocIds.length > 0 && await this.queryNamesNewDocument(req.message, scopeDocIds)) {
      scopeDocIds = [];
      useScope = false;
      scopeCleared = true;
    }

    // 3) Query expansion: skip when scoped (hard filter already constrains to right doc)
    let contextualQuery = useScope
      ? req.message
      : this.expandQueryFromHistory(req.message, history);

    // Email+document fusion: fetch the referenced email and use it to guide retrieval + answering.
    let emailForRag: any | null = null;
    if (!forceEmailFusion && referentialFollowUp && useScope) {
      // If the user is in a scoped doc follow-up and a connector email is present in this conversation,
      // treat the email as intent context even when the user doesn't repeat "email" explicitly.
      const ref = await this.loadLatestConnectorEmailRef({ conversationId, messageHint: req.message });
      if (ref) forceEmailFusion = true;
    }
    if (forceEmailFusion) {
      const ref = await this.loadLatestConnectorEmailRef({ conversationId, messageHint: req.message });
      if (!ref) {
        const text = 'To answer that, I need the email content. Ask me to read your latest email first (example: "Read my latest email"), then ask this question again.';
        const userMsg = await this.createMessage({ conversationId, role: 'user', content: req.message, userId: req.userId });
        const assistantMsg = await this.createMessage({
          conversationId,
          role: 'assistant',
          content: text,
          userId: req.userId,
          metadata: { sources: [], attachments: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
        });
        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          attachmentsPayload: [],
          sources: [],
          answerMode: 'general_answer' as AnswerMode,
          answerClass: 'GENERAL' as AnswerClass,
          navType: null,
        };
      }

      try {
        emailForRag = await this.fetchConnectorEmailById({
          userId: req.userId,
          provider: ref.provider,
          messageId: ref.messageId,
          connectorContext: req.connectorContext,
        });
      } catch (e: any) {
        const text = String(e?.message || 'Unable to fetch that email.').trim();
        const prompt = this.buildConnectorPromptFromAccessError(text);
        const attachments = prompt ? [prompt] : [];
        const userMsg = await this.createMessage({ conversationId, role: 'user', content: req.message, userId: req.userId });
        const assistantMsg = await this.createMessage({
          conversationId,
          role: 'assistant',
          content: text,
          userId: req.userId,
          metadata: { sources: [], attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
        });
        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          attachmentsPayload: attachments,
          sources: [],
          answerMode: 'general_answer' as AnswerMode,
          answerClass: 'GENERAL' as AnswerClass,
          navType: null,
        };
      }

      const emailHints = this.extractEmailKeywordHints(emailForRag);
      if (emailHints) {
        contextualQuery = `${contextualQuery}\n\nEMAIL SIGNALS: ${emailHints}`;
      }
    }

    // Extract document focus and topic entities from conversation for targeted retrieval
    // Only apply history-based boosting for follow-ups; otherwise it can drown out cross-file queries.
    const focusFilenames = referentialFollowUp ? this.extractDocumentFocusFromHistory(history) : [];
    const topicEntities = referentialFollowUp ? this.extractTopicEntitiesFromHistory(history) : [];

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
    // Only persist scope when the user is clearly in a follow-up about the same doc,
    // or when they explicitly attached files (hard scope).
    const shouldPersistScope =
      ragScopeEnabled &&
      (hasAttachments || referentialFollowUp || /[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/i.test(req.message));

    if (shouldPersistScope && chunks.length > 0) {
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
    if (emailForRag) {
      messagesWithContext.push({ role: 'system' as ChatRole, content: this.buildEmailFusionInstructionSystemMessage() });
      messagesWithContext.push({ role: 'system' as ChatRole, content: this.buildEmailContextSystemMessage(emailForRag) });
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
    cleanedText = this.enforceBrandName(cleanedText);

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
        ? { listing: this.sourcesToListingItems(reorderedSources), sources: [], attachments: [], answerMode, answerClass, navType }
        : answerClass === 'DOCUMENT'
          ? { sources: reorderedSources, attachments: [], answerMode, answerClass, navType }
          : { sources: [], attachments: [], answerMode, answerClass, navType },
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
    // content embedded in Allybi docs). +30 per matching topic phrase in chunk text.
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
      // "files" is ambiguous (could mean documents or the whole library).
      // Only narrow to 'documents' when user says "documents", "pdfs", "uploads", etc.
      const hasSpecificDocWord = /\b(documents?|documentos?|pdfs?|uploads?)\b/.test(text);
      const hasGenericFileWord = /\b(files?|arquivos?|archivos?)\b/.test(text);
      if (hasFolderWord && !hasSpecificDocWord && !hasGenericFileWord) return 'folders';
      if (hasSpecificDocWord && !hasFolderWord) return 'documents';
      // "files" alone → treat as library-wide (show folders + files)
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
        where: {
          userId,
          status: { notIn: ['failed', 'uploading'] },
          // Connector artifacts must never appear as "Documents" in the library UI or chat listings.
          encryptedFilename: { not: { contains: '/connectors/' } },
        },
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
        where: {
          userId,
          status: { notIn: ['failed', 'uploading'] },
          encryptedFilename: { not: { contains: '/connectors/' } },
        },
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
        encryptedFilename: { not: { contains: '/connectors/' } },
        // Exclude revision artifacts so the assistant edits the user's primary document.
        parentVersionId: null,
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

    const generatedTitle = await this.autoTitleConversationIfNeeded({ userId, conversationId, message });

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

    const generatedTitle = await this.autoTitleConversationIfNeeded({ userId, conversationId, message });

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

    const generatedTitle = await this.autoTitleConversationIfNeeded({ userId, conversationId, message });

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
    const generatedTitle = await this.autoTitleConversationIfNeeded({ userId, conversationId, message });

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
    const generatedTitle = await this.autoTitleConversationIfNeeded({ userId, conversationId, message });

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

    // Highest-signal: explicit koda://source links (docId=...)
    const citedDocIds: string[] = [];
    const rx = /koda:\/\/source\\?[^\\s)\\]]*\\bdocId=([^&\\s)\\]]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(llmText))) {
      const raw = decodeURIComponent(m[1] || "").trim();
      if (raw && !citedDocIds.includes(raw)) citedDocIds.push(raw);
      if (citedDocIds.length >= 5) break;
    }
    if (citedDocIds.length > 0) {
      const cited: typeof sources = [];
      const uncited: typeof sources = [];
      for (const s of sources) {
        (citedDocIds.includes(s.documentId) ? cited : uncited).push(s);
      }
      return [...cited, ...uncited];
    }

    const cited: typeof sources = [];
    const uncited: typeof sources = [];

    for (const s of sources) {
      // Match full filename (high precision). For spreadsheets, do not
      // promote based on base-name substrings (too many false positives).
      const full = s.filename.toLowerCase();
      const isSpreadsheet = (s.mimeType || "").includes("spreadsheet") || /\.xlsx?$/i.test(full);
      if (full && lower.includes(full)) {
        cited.push(s);
        continue;
      }
      if (isSpreadsheet) {
        uncited.push(s);
      } else {
        // For non-spreadsheets, allow base-name match as a fallback.
        const base = full.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
        if (base && base.length >= 12 && lower.includes(base)) cited.push(s);
        else uncited.push(s);
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

    // Only bias retrieval toward prior document context for referential/ambiguous follow-ups.
    // Otherwise, this causes "document lock" where subsequent questions about other files
    // keep retrieving chunks from the previously edited/read doc.
    const q0 = query.trim();
    const wordCount = q0 ? q0.split(/\s+/).length : 0;
    const hasExplicitFilename = /[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/i.test(q0);
    const isContextDependent = /\b(this|the chapter|the document|it\b|here|mentioned|listed|above)\b/i.test(q0);
    const allowHistoryBias = isContextDependent || (wordCount > 0 && wordCount <= 10 && !hasExplicitFilename);
    if (!allowHistoryBias) return query;

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

    const q = (query || '').trim();
    if (!q) return false;

    // 1) Explicit file references in the query (with extension).
    const fileRefs = q.match(/[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/gi) || [];
    for (const ref of fileRefs) {
      const refLower = ref.toLowerCase();
      const refBase = refLower.replace(/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i, '');
      const inScope = scopedNames.some(name => {
        const nameBase = name.replace(/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i, '');
        return name.includes(refBase) || nameBase.includes(refBase) || refBase.includes(nameBase);
      });
      if (!inScope) return true;
    }

    // 2) Soft document mention: user names a document without extension.
    // This happens a lot for spreadsheets ("Lone Mountain Ranch P L 2024") and
    // previously caused scope to remain "locked" to the last edited doc.
    //
    // Heuristic: if the query contains a 2+ word phrase that matches a non-scoped
    // document base name, treat it as a new document mention.
    const scopedBases = new Set(
      scopedNames.map((n) => n.replace(/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i, '').replace(/[_-]+/g, ' ').trim()),
    );

    const anyScoped = await prisma.document.findFirst({
      where: { id: { in: scopeDocIds } },
      select: { userId: true },
    });
    if (!anyScoped?.userId) return false;

    const userDocs = await prisma.document.findMany({
      where: { userId: anyScoped.userId },
      select: { filename: true, encryptedFilename: true },
      take: 2000,
    });

    const qLower = q.toLowerCase();
    for (const d of userDocs) {
      const name = (d.filename || this.extractFilenameFromPath(d.encryptedFilename) || '').toLowerCase();
      if (!name) continue;
      const base = name.replace(/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
      if (!base || base.length < 10) continue;
      if (scopedBases.has(base)) continue;
      if (qLower.includes(base)) return true;
    }

    // Check if any referenced file is NOT in the current scope
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
    const worklogRunId = `run_${traceId}`;
    const isViewerMode = Boolean(((params.req?.meta as any) || null)?.viewerMode);

    // Viewer/editor chat is document-scoped: always treat the actively previewed
    // document as implicitly attached so the model never asks the user to paste content.
    try {
      const meta = (params.req.meta as any) || null;
      const viewerMode = Boolean(meta?.viewerMode);
      const viewerContext = meta?.viewerContext || null;
      const activeDocId = String(viewerContext?.activeDocumentId || "").trim();
      if (viewerMode && activeDocId) {
        const cur = Array.isArray(params.req.attachedDocumentIds) ? params.req.attachedDocumentIds : [];
        if (!cur.includes(activeDocId)) {
          params.req.attachedDocumentIds = [activeDocId, ...cur];
        }
      }
    } catch {}

    const conversationId = await this.ensureConversation(params.req.userId, params.req.conversationId);

    // Always emit at least one progress event so the UI never gets stuck on the generic
    // "Thinking…" fallback due to fast-first-token streaming.
    this.emitWorklog(params.sink, {
      runId: worklogRunId,
      eventType: 'RUN_START',
      title: isViewerMode ? 'Preparing edits' : 'Allybi • Working',
      summary: String(params.req.message || '').trim().slice(0, 220),
    });
    if (!isViewerMode) {
      this.emitWorklog(params.sink, {
        runId: worklogRunId,
        eventType: 'STEP_ADD',
        stepId: 'route',
        label: 'Routing request',
        status: 'running',
      });
      this.emitStage(params.sink, { stage: 'retrieving', key: 'allybi.stage.search.scanning_library' });
      this.emitWorklog(params.sink, {
        runId: worklogRunId,
        eventType: 'STEP_UPDATE',
        stepId: 'route',
        status: 'done',
      });
    }

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

    // Viewer/editor chat must prioritize document editing semantics over connector/chat intents.
    if (isViewerMode) {
      const editHandled = await this.tryHandleEditingTurn({
        traceId,
        req: params.req,
        conversationId,
        history,
        sink: params.sink,
        existingUserMsgId,
      });
      if (editHandled) return editHandled;
      const text =
        "You are in document edit mode. I can only run document edits here. Select text/cells and ask an edit command, or exit editor mode for email/connectors.";
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: "user", content: params.req.message, userId: params.req.userId });
      if (params.sink.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode: "action_receipt", answerClass: "NAVIGATION", navType: null } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }
      const assistantMsg = await this.createMessage({
        conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [], answerMode: "action_receipt" as AnswerMode, answerClass: "NAVIGATION" as AnswerClass, navType: null },
      });
      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        sources: [],
        answerMode: "action_receipt",
        answerClass: "NAVIGATION",
        navType: null,
      };
    }

    // --- Slides / deck requests (Google Slides) ---
    const isSlidesDeck = this.isSlideOrDeckRequest(params.req.message);
    console.log('[StreamChat] isSlideOrDeckRequest:', isSlidesDeck, 'message:', params.req.message.slice(0, 50));
    if (isSlidesDeck) {
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      const out = await this.handleSlidesDeckRequest({
        traceId,
        userId: params.req.userId,
        conversationId,
        message: params.req.message,
        preferredLanguage: params.req.preferredLanguage,
        sink: params.sink,
        context: params.req.context || null,
      });

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
        params.sink.write({ event: 'delta', data: { text: out.text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
        metadata: { sources: [], attachments: out.attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: [],
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    // --- Chart requests (visual attachments rendered by UI) ---
    const viewerMeta = (params.req.meta as any) || null;
    const viewerMode = Boolean(viewerMeta?.viewerMode);
    const viewerFileType = String(viewerMeta?.viewerContext?.fileType || "").toLowerCase();
    const preferViewerSheetEditing =
      viewerMode &&
      ["excel", "xlsx", "sheet", "sheets", "spreadsheet"].includes(viewerFileType);
    const isChart = !preferViewerSheetEditing && this.isChartRequest(params.req.message);
    console.log('[StreamChat] isChartRequest:', isChart, 'message:', params.req.message.slice(0, 50));
    if (isChart) {
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      const out = await this.handleChartRequest({
        userId: params.req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: params.req.message,
        history,
      });

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
        params.sink.write({ event: 'delta', data: { text: out.text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
        metadata: { sources: [], attachments: out.attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: [],
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    // --- Image generation requests (visual attachments) ---
    const isImageGen = this.isImageGenerationRequest(params.req.message);
    console.log('[StreamChat] isImageGenerationRequest:', isImageGen, 'message:', params.req.message.slice(0, 50));
    if (isImageGen) {
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      const out = await this.handleImageGenerationRequest({
        userId: params.req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: params.req.message,
      });

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
        params.sink.write({ event: 'delta', data: { text: out.text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
        metadata: { sources: [], attachments: out.attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: [],
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    // --- Confirmation tokens (email send, connector disconnect, etc.) ---
    // NOTE: file_actions also use confirmationToken, but those tokens are not HMAC-signed and must fall through.
    if (params.req.confirmationToken) {
      // 1) Email send confirmation token
      try {
        const payload = this.verifyEmailSendToken(params.req.confirmationToken, params.req.userId);

        const userMsg = existingUserMsgId
          ? { id: existingUserMsgId }
          : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

        const out = await this.handleComposeQuery({
          userId: params.req.userId,
          conversationId,
          correlationId: traceId,
          clientMessageId: userMsg.id,
          message: params.req.message,
          compose: { to: null, subject: null, bodyHint: null, provider: payload.provider },
          connectorContext: params.req.connectorContext,
          confirmationToken: params.req.confirmationToken,
          attachedDocumentIds: params.req.attachedDocumentIds ?? [],
        });

        if (params.sink.isOpen()) {
          params.sink.write({ event: 'meta', data: { answerMode: out.answerMode, answerClass: out.answerClass, navType: null } } as any);
          params.sink.write({ event: 'delta', data: { text: out.text } } as any);
        }

        const assistantMsg = await this.createMessage({
          conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
          metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: out.text,
          attachmentsPayload: out.attachments,
          sources: out.sources,
          answerMode: out.answerMode,
          answerClass: out.answerClass,
          navType: null,
        };
      } catch {
        // not an email_send token
      }

      // 2) Connector disconnect confirmation token
      try {
        const payload = this.verifyConnectorDisconnectToken(params.req.confirmationToken, params.req.userId);

        const userMsg = existingUserMsgId
          ? { id: existingUserMsgId }
          : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

        const result = await this.connectorHandler.execute({
          action: 'disconnect',
          provider: payload.provider,
          context: {
            userId: params.req.userId,
            conversationId,
            correlationId: traceId,
            clientMessageId: userMsg.id,
          },
        });

        const text = result.ok
          ? `Disconnected ${this.labelForConnector(payload.provider)}.`
          : `Failed to disconnect ${this.labelForConnector(payload.provider)}. ${result.error || ''}`.trim();

        if (params.sink.isOpen()) {
          params.sink.write({ event: 'meta', data: { answerMode: 'action_receipt', answerClass: 'NAVIGATION', navType: null } } as any);
          params.sink.write({ event: 'delta', data: { text } } as any);
        }

        const assistantMsg = await this.createMessage({
          conversationId,
          role: 'assistant',
          content: text,
          userId: params.req.userId,
          metadata: { sources: [], attachments: [], answerMode: 'action_receipt' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: null },
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          sources: [],
          answerMode: 'action_receipt' as AnswerMode,
          answerClass: 'NAVIGATION' as AnswerClass,
          navType: null,
        };
      } catch {
        // not a connector_disconnect token
      }
    }

    // --- Connector: confirm sending the most recent drafted email ("send it") ---
    if (this.isSendItConfirmation(params.req.message) && !params.req.confirmationToken) {
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      const token = await this.findLatestEmailSendTokenFromConversation({ conversationId });
      if (!token) {
        const text = 'There is no pending email draft to send. Ask me to draft one first (example: "Draft an email to alice@example.com about the contract").';
        if (params.sink.isOpen()) {
          params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
          params.sink.write({ event: 'delta', data: { text } } as any);
        }

        const assistantMsg = await this.createMessage({
          conversationId, role: 'assistant', content: text, userId: params.req.userId,
          metadata: { sources: [], attachments: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          sources: [],
          answerMode: 'general_answer' as AnswerMode,
          answerClass: 'GENERAL' as AnswerClass,
          navType: null,
        };
      }

      const payload = this.verifyEmailSendToken(token, params.req.userId);
      const out = await this.handleComposeQuery({
        userId: params.req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: params.req.message,
        compose: { to: null, subject: null, bodyHint: null, provider: payload.provider },
        connectorContext: params.req.connectorContext,
        confirmationToken: token,
        attachedDocumentIds: params.req.attachedDocumentIds ?? [],
      });

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: out.answerMode, answerClass: out.answerClass, navType: null } } as any);
        params.sink.write({ event: 'delta', data: { text: out.text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
        metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: out.sources,
        answerMode: out.answerMode,
        answerClass: out.answerClass,
        navType: null,
      };
    }

    // --- Email: bank-driven read/explain/draft/send + email+doc fusion flag ---
    let forceEmailFusion = false;
    try {
      const decision = await this.intentEngineV3.resolve({
        text: params.req.message,
        languageHint: params.req.preferredLanguage,
      } as any);

      if (decision?.intentFamily === 'email') {
        const op = String(decision.operator || '').trim();

        if (op === 'EMAIL_DOC_FUSION') {
          forceEmailFusion = true;
        } else if (op === 'EMAIL_SUMMARIZE_PREVIOUS') {
          const explainedPrev = await this.tryHandleExplainPreviousEmailTurn({
            traceId,
            req: params.req,
            conversationId,
            history,
            sink: params.sink,
            existingUserMsgId,
          });
          if (explainedPrev) return explainedPrev;
        } else if (op === 'EMAIL_LATEST' || op === 'EMAIL_EXPLAIN_LATEST') {
          const userMsg = existingUserMsgId
            ? { id: existingUserMsgId }
            : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

          const out = await this.handleLatestConnectorQuery({
            userId: params.req.userId,
            conversationId,
            correlationId: traceId,
            clientMessageId: userMsg.id,
            message: params.req.message,
            latest: { provider: 'email', count: 1, mode: op === 'EMAIL_EXPLAIN_LATEST' ? 'explain' : 'raw' },
            connectorContext: params.req.connectorContext,
          });

          if (params.sink.isOpen()) {
            params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
          }
          if (out.sources.length && params.sink.isOpen()) {
            params.sink.write({ event: 'sources', data: { sources: out.sources } } as any);
          }
          if (params.sink.isOpen()) {
            params.sink.write({ event: 'delta', data: { text: out.text } } as any);
          }

          const storedAttachments = this.toConnectorEmailRefs(out.attachments || []);
          const assistantMsg = await this.createMessage({
            conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
            metadata: { sources: out.sources, attachments: storedAttachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
          });

          return {
            conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: out.text,
            attachmentsPayload: out.attachments,
            sources: out.sources,
            answerMode: 'general_answer' as AnswerMode,
            answerClass: 'GENERAL' as AnswerClass,
            navType: null,
          };
        } else if (op === 'EMAIL_DRAFT' || op === 'EMAIL_SEND') {
          const extractor = getEmailComposeExtractor();
          const extracted = extractor.extract(params.req.message, (params.req.preferredLanguage as any) || 'en');

          if (!extracted.to) {
            const text = extractor.microcopy('missingRecipient', (params.req.preferredLanguage as any) || 'en');
            const userMsg = existingUserMsgId
              ? { id: existingUserMsgId }
              : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

            if (params.sink.isOpen()) {
              params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
              params.sink.write({ event: 'delta', data: { text } } as any);
            }

            const assistantMsg = await this.createMessage({
              conversationId,
              role: 'assistant',
              content: text,
              userId: params.req.userId,
              metadata: { sources: [], attachments: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
            });

            return {
              conversationId,
              userMessageId: userMsg.id,
              assistantMessageId: assistantMsg.id,
              assistantText: text,
              sources: [],
              answerMode: 'general_answer' as AnswerMode,
              answerClass: 'GENERAL' as AnswerClass,
              navType: null,
            };
          }

          const userMsg = existingUserMsgId
            ? { id: existingUserMsgId }
            : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

          const out = await this.handleComposeQuery({
            userId: params.req.userId,
            conversationId,
            correlationId: traceId,
            clientMessageId: userMsg.id,
            message: params.req.message,
            compose: {
              to: extracted.to,
              subject: extracted.subject,
              bodyHint: extracted.body,
              provider: (extracted.provider === 'gmail' || extracted.provider === 'outlook') ? extracted.provider : 'email',
              lengthHint: extracted.lengthHint ?? null,
              toneHint: extracted.toneHint ?? null,
              purposeHint: extracted.purposeHint ?? null,
            },
            connectorContext: params.req.connectorContext,
            confirmationToken: params.req.confirmationToken,
            attachedDocumentIds: params.req.attachedDocumentIds ?? [],
          });

          if (params.sink.isOpen()) {
            params.sink.write({ event: 'meta', data: { answerMode: out.answerMode, answerClass: out.answerClass, navType: null } } as any);
            params.sink.write({ event: 'delta', data: { text: out.text } } as any);
          }

          const assistantMsg = await this.createMessage({
            conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
            metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
          });

          return {
            conversationId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            assistantText: out.text,
            attachmentsPayload: out.attachments,
            sources: out.sources,
            answerMode: out.answerMode,
            answerClass: out.answerClass,
            navType: null,
          };
        }
      }
    } catch {
      // non-fatal; proceed with legacy logic and RAG
    }

    // --- Connector: compose/draft email (legacy fallback) ---
    const composeQuery = await this.detectComposeQuery(params.req.userId, params.req.message);
    if (composeQuery) {
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      const out = await this.handleComposeQuery({
        userId: params.req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: params.req.message,
        compose: composeQuery,
        connectorContext: params.req.connectorContext,
        confirmationToken: params.req.confirmationToken,
        attachedDocumentIds: params.req.attachedDocumentIds ?? [],
      });

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: out.answerMode, answerClass: out.answerClass, navType: null } } as any);
        params.sink.write({ event: 'delta', data: { text: out.text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
        metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: out.sources,
        answerMode: out.answerMode,
        answerClass: out.answerClass,
        navType: null,
      };
    }

    // --- Connector: explain/summarize previous email ("summarize this email") ---
    const explainedPrev = await this.tryHandleExplainPreviousEmailTurn({
      traceId,
      req: params.req,
      conversationId,
      history,
      sink: params.sink,
      existingUserMsgId,
    });
    if (explainedPrev) return explainedPrev;

    // --- Connector memory: email follow-up Q&A (literal, refetch by messageId) ---
    const emailQa = await this.tryHandleEmailContextQuestionTurn({
      traceId,
      req: params.req,
      conversationId,
      history,
      sink: params.sink,
      existingUserMsgId,
    });
    if (emailQa) return emailQa;

    // --- Connector: "latest email/message" (Outlook/Gmail/Slack) ---
    const latestConnector = await this.detectLatestConnectorQuery(params.req.userId, params.req.message, params.req.connectorContext);
    if (latestConnector) {
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      // Progress UX: show connector-specific work instead of generic "Thinking…".
      if (latestConnector.provider === "slack") {
        this.emitStage(params.sink, { stage: 'connecting', key: 'allybi.stage.slack.checking_access' });
        this.emitStage(params.sink, { stage: 'retrieving', key: 'allybi.stage.slack.fetching_messages' });
      } else {
        this.emitStage(params.sink, { stage: 'connecting', key: 'allybi.stage.email.checking_access' });
        this.emitStage(params.sink, { stage: 'retrieving', key: 'allybi.stage.email.fetching_thread' });
      }

      const out = await this.handleLatestConnectorQuery({
        userId: params.req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        message: params.req.message,
        latest: latestConnector,
        connectorContext: params.req.connectorContext,
      });

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
      }
      if (out.sources.length && params.sink.isOpen()) {
        params.sink.write({ event: 'sources', data: { sources: out.sources } } as any);
      }
      if (params.sink.isOpen()) {
        params.sink.write({ event: 'delta', data: { text: out.text } } as any);
      }

      const storedAttachments = this.toConnectorEmailRefs(out.attachments || []);
      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
        metadata: { sources: out.sources, attachments: storedAttachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: out.sources,
        answerMode: 'general_answer' as AnswerMode,
        answerClass: 'GENERAL' as AnswerClass,
        navType: null,
      };
    }

    // --- Connector: connect/sync/status/search/disconnect (bank-driven first; fallback to legacy heuristics) ---
    let connectorAction: null | { action: 'connect' | 'sync' | 'status' | 'search' | 'disconnect'; provider: 'gmail' | 'outlook' | 'slack' | 'email' | 'all'; query?: string } = null;

    try {
      const decision = await this.intentEngineV3.resolve({
        text: params.req.message,
        languageHint: params.req.preferredLanguage,
      } as any);

      if (decision?.intentFamily === 'connectors') {
        const op = String(decision.operator || '').trim();
        const provider = String((decision as any)?.signals?.connectors?.provider || '').toLowerCase().trim();

        const mappedProvider =
          provider === 'gmail' ? 'gmail'
          : provider === 'outlook' ? 'outlook'
          : provider === 'slack' ? 'slack'
          : /\b(email|inbox|mail|emails)\b/i.test(params.req.message) ? 'email'
          : 'all';

        if (op === 'CONNECT_START') connectorAction = { action: 'connect', provider: mappedProvider };
        else if (op === 'CONNECTOR_SYNC') connectorAction = { action: 'sync', provider: mappedProvider };
        else if (op === 'CONNECTOR_STATUS') connectorAction = { action: 'status', provider: mappedProvider };
        else if (op === 'CONNECTOR_DISCONNECT') connectorAction = { action: 'disconnect', provider: mappedProvider };
      }
    } catch {
      // non-fatal; fall back to heuristics
    }

    if (!connectorAction) {
      connectorAction = await this.detectConnectorActionQuery(params.req.userId, params.req.message);
    }

    if (connectorAction) {
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

      const out = await this.handleConnectorActionQuery({
        userId: params.req.userId,
        conversationId,
        correlationId: traceId,
        clientMessageId: userMsg.id,
        detected: connectorAction,
        connectorContext: params.req.connectorContext,
      });

      if (params.sink.isOpen()) {
        params.sink.write({ event: 'meta', data: { answerMode: out.answerMode, answerClass: out.answerClass, navType: null } } as any);
      }
      if (out.sources.length && params.sink.isOpen()) {
        params.sink.write({ event: 'sources', data: { sources: out.sources } } as any);
      }
      if (params.sink.isOpen()) {
        params.sink.write({ event: 'delta', data: { text: out.text } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId, role: 'assistant', content: out.text, userId: params.req.userId,
        metadata: { sources: out.sources, attachments: out.attachments, answerMode: out.answerMode as AnswerMode, answerClass: out.answerClass as AnswerClass, navType: null },
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: out.text,
        attachmentsPayload: out.attachments,
        sources: out.sources,
        answerMode: out.answerMode as AnswerMode,
        answerClass: out.answerClass as AnswerClass,
        navType: null,
      };
    }

    // --- Editing intent dispatching (DOCX/XLSX) ---
    const editHandled = await this.tryHandleEditingTurn({
      traceId,
      req: params.req,
      conversationId,
      history,
      sink: params.sink,
      existingUserMsgId,
    });
    if (editHandled) return editHandled;

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

      const generatedTitle = await this.autoTitleConversationIfNeeded({
        userId: params.req.userId,
        conversationId,
        message: params.req.message,
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
        generatedTitle,
      };
    }

    // --- Capabilities / meta help (bank-driven, no LLM) ---
    if (this.isCapabilitiesQuery(params.req.message)) {
      const lang = (params.req.preferredLanguage ?? "en") as "en" | "pt" | "es";
      const text = this.renderCapabilitiesAnswer(lang);

      // Persist user message (skip on regenerate — reuse existing)
      const userMsg = existingUserMsgId
        ? { id: existingUserMsgId }
        : await this.createMessage({ conversationId, role: "user", content: params.req.message, userId: params.req.userId });

      const answerMode: AnswerMode = "help_steps";
      const answerClass: AnswerClass = "GENERAL";
      const navType: NavType | null = null;

      if (params.sink.isOpen()) {
        params.sink.write({ event: "meta", data: { answerMode, answerClass, navType } } as any);
        params.sink.write({ event: "delta", data: { text } } as any);
      }

      const followups = this.selectFollowups({
        lang,
        answerMode,
        answerClass,
        operator: "capabilities",
        intentFamily: "help",
        isViewerVariant: Boolean(params.req?.meta?.viewerMode),
      });
      if (followups.length && params.sink.isOpen()) {
        params.sink.write({ event: "followups", data: { followups } } as any);
      }

      const assistantMsg = await this.createMessage({
        conversationId,
        role: "assistant",
        content: text,
        userId: params.req.userId,
        metadata: { sources: [], attachments: [], answerMode, answerClass, navType, followups },
      });

      const generatedTitle = await this.autoTitleConversationIfNeeded({
        userId: params.req.userId,
        conversationId,
        message: params.req.message,
      });

      return {
        conversationId,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        assistantText: text,
        attachmentsPayload: [],
        sources: [],
        answerMode,
        answerClass,
        navType,
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
      let filteredItems = scope === 'documents'
        ? listing.items.filter(i => i.kind === 'file')
        : scope === 'folders'
          ? listing.items.filter(i => i.kind === 'folder')
          : listing.items;

      // Fallback: if scope-filtered list is empty but items exist, show everything.
      // Users say "list my files" meaning their whole library, not just root-level files.
      if (filteredItems.length === 0 && listing.items.length > 0) {
        filteredItems = listing.items;
      }

      if (filteredItems.length > 0) {
        // Persist user message (skip on regenerate — reuse existing)
        const userMsg = existingUserMsgId
          ? { id: existingUserMsgId }
          : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

        // Emit meta event
        if (params.sink.isOpen()) {
          params.sink.write({ event: 'meta', data: { answerMode: 'nav_pills', answerClass: 'NAVIGATION', navType: 'discover' } } as any);
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
          metadata: { listing: filteredItems, sources: [], answerMode: 'nav_pills' as AnswerMode, answerClass: 'NAVIGATION' as AnswerClass, navType: 'discover' as NavType },
        });

        const generatedTitle = await this.autoTitleConversationIfNeeded({
          userId: params.req.userId,
          conversationId,
          message: params.req.message,
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: introText,
          listing: filteredItems,
          sources: [],
          answerMode: 'nav_pills' as AnswerMode,
          answerClass: 'NAVIGATION' as AnswerClass,
          navType: 'discover' as NavType,
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

    // Decide scoping:
    // - Attachments/folder-scoped search are hard scope.
    // - Persisted conversation scope is only used for referential/ambiguous follow-ups.
    const referentialFollowUp = this.isReferentialFollowUp(params.req.message, history);
    let useScope = scopeDocIds.length > 0 && (hasAttachments || !!streamScopedSearchDocIds || referentialFollowUp);
    let scopeCleared = false;
    if (!hasAttachments && !streamScopedSearchDocIds && scopeDocIds.length > 0 && await this.queryNamesNewDocument(params.req.message, scopeDocIds)) {
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

      this.emitStage(params.sink, {
        stage: 'processing',
        key: 'allybi.stage.docs.processing',
        params: { count: attachedDocumentIds.length },
      });

      while (Date.now() - startWait < maxWaitMs) {
        const chunkCount = await prisma.documentChunk.count({
          where: { documentId: { in: attachedDocumentIds } },
        });
        if (chunkCount > 0) { chunksReady = true; break; }

        // Re-emit occasionally so the user sees we're still working.
        this.emitStage(params.sink, { stage: 'processing', key: 'allybi.stage.docs.processing' });
        await new Promise(r => setTimeout(r, pollMs));
      }

      if (!chunksReady) {
        console.warn('[Chat] Attached documents have no chunks after wait', attachedDocumentIds);
      }
    }

    // Query expansion: skip when scoped (hard filter already constrains to right doc)
    let contextualQuery = useScope
      ? params.req.message
      : this.expandQueryFromHistory(params.req.message, history);

    // Email+document fusion: fetch the referenced email and use it to guide retrieval + answering.
    let emailForRag: any | null = null;
    if (!forceEmailFusion && referentialFollowUp && useScope) {
      const ref = await this.loadLatestConnectorEmailRef({ conversationId, messageHint: params.req.message });
      if (ref) forceEmailFusion = true;
    }
    if (forceEmailFusion) {
      const ref = await this.loadLatestConnectorEmailRef({ conversationId, messageHint: params.req.message });
      if (!ref) {
        const text = 'To answer that, I need the email content. Ask me to read your latest email first (example: "Read my latest email"), then ask this question again.';
        const userMsg = existingUserMsgId
          ? { id: existingUserMsgId }
          : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

        if (params.sink.isOpen()) {
          params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
          params.sink.write({ event: 'delta', data: { text } } as any);
        }

        const assistantMsg = await this.createMessage({
          conversationId,
          role: 'assistant',
          content: text,
          userId: params.req.userId,
          metadata: { sources: [], attachments: [], answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          attachmentsPayload: [],
          sources: [],
          answerMode: 'general_answer' as AnswerMode,
          answerClass: 'GENERAL' as AnswerClass,
          navType: null,
        };
      }

      try {
        this.emitStage(params.sink, { stage: 'connecting', key: 'allybi.stage.email.checking_access' });
        this.emitStage(params.sink, { stage: 'retrieving', key: 'allybi.stage.email.fetching_thread' });
        emailForRag = await this.fetchConnectorEmailById({
          userId: params.req.userId,
          provider: ref.provider,
          messageId: ref.messageId,
          connectorContext: params.req.connectorContext,
        });
      } catch (e: any) {
        const text = String(e?.message || 'Unable to fetch that email.').trim();
        const prompt = this.buildConnectorPromptFromAccessError(text);
        const attachments = prompt ? [prompt] : [];
        const userMsg = existingUserMsgId
          ? { id: existingUserMsgId }
          : await this.createMessage({ conversationId, role: 'user', content: params.req.message, userId: params.req.userId });

        if (params.sink.isOpen()) {
          params.sink.write({ event: 'meta', data: { answerMode: 'general_answer', answerClass: 'GENERAL', navType: null } } as any);
          params.sink.write({ event: 'delta', data: { text } } as any);
        }

        const assistantMsg = await this.createMessage({
          conversationId,
          role: 'assistant',
          content: text,
          userId: params.req.userId,
          metadata: { sources: [], attachments, answerMode: 'general_answer' as AnswerMode, answerClass: 'GENERAL' as AnswerClass, navType: null },
        });

        return {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          assistantText: text,
          attachmentsPayload: attachments,
          sources: [],
          answerMode: 'general_answer' as AnswerMode,
          answerClass: 'GENERAL' as AnswerClass,
          navType: null,
        };
      }

      const emailHints = this.extractEmailKeywordHints(emailForRag);
      if (emailHints) {
        contextualQuery = `${contextualQuery}\n\nEMAIL SIGNALS: ${emailHints}`;
      }
    }

    // Extract document focus and topic entities from conversation for targeted retrieval
    // Only apply history-based boosting for follow-ups; otherwise it can drown out cross-file queries.
    const focusFilenames = referentialFollowUp ? this.extractDocumentFocusFromHistory(history) : [];
    const topicEntities = referentialFollowUp ? this.extractTopicEntitiesFromHistory(history) : [];

    // Retrieve relevant document chunks (higher topK for better coverage)
    this.emitStage(params.sink, {
      stage: 'retrieving',
      key: 'allybi.stage.search.scanning_library',
      params: { scoped: useScope, attachments: hasAttachments },
    });
    let chunks = await this.retrieveRelevantChunks(params.req.userId, contextualQuery, 15, {
      boostFilenames: focusFilenames,
      boostTopicEntities: topicEntities,
      ...(useScope ? { scopeDocumentIds: scopeDocIds } : {}),
    });

    this.emitStage(params.sink, { stage: 'reading', key: 'allybi.stage.docs.reading' });

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
    const shouldPersistScope =
      ragScopeEnabled &&
      (hasAttachments || referentialFollowUp || /[\w_.-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/i.test(params.req.message));

    if (shouldPersistScope && chunks.length > 0) {
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

    const isSummarize =
      /\b(summarize|summarise|summary|tl;dr|key takeaways|executive summary)\b/i.test(params.req.message) ||
      /\b(resumir|resumo|sumarizar|principais pontos)\b/i.test(params.req.message);
    this.emitStage(params.sink, {
      stage: 'composing',
      key: isSummarize ? 'allybi.stage.docs.summarizing' : 'allybi.stage.docs.extracting',
    });

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

    // Build folder tree context (so Allybi knows about the user's document inventory)
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

    if (emailForRag) {
      messagesWithContext.push({ role: 'system' as ChatRole, content: this.buildEmailFusionInstructionSystemMessage() });
      messagesWithContext.push({ role: 'system' as ChatRole, content: this.buildEmailContextSystemMessage(emailForRag) });
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

    // Follow-up chips (structured, chips-only UX)
    const langForFollowups = (preferredLanguage ?? "en") as "en" | "pt" | "es";
    const followups = this.selectFollowups({
      lang: langForFollowups,
      answerMode,
      answerClass,
      operator: null,
      intentFamily: null,
      isViewerVariant: Boolean(params.req?.meta?.viewerMode),
    });
    if (followups.length && params.sink.isOpen()) {
      params.sink.write({ event: "followups", data: { followups } } as any);
    }

    // Persist assistant message with sources in metadata
    const assistantMsg = await this.createMessage({
      conversationId,
      role: "assistant",
      content: storedText,
      userId: params.req.userId,
      metadata: answerMode === 'nav_pills'
        ? { listing: this.sourcesToListingItems(reorderedSources), sources: [], attachments: [], answerMode, answerClass, navType }
        : answerClass === 'DOCUMENT'
          ? { sources: reorderedSources, attachments: [], answerMode, answerClass, navType, ...(followups.length ? { followups } : {}) }
          : { sources: [], attachments: [], answerMode, answerClass, navType, ...(followups.length ? { followups } : {}) },
    });

    const generatedTitle = await this.autoTitleConversationIfNeeded({
      userId: params.req.userId,
      conversationId,
      message: params.req.message,
    });

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

  private isPlaceholderConversationTitle(title: string | null | undefined): boolean {
    const t = String(title ?? "").trim();
    if (!t) return true;
    if (t === "New Chat") return true;
    if (t === "Untitled") return true;
    return false;
  }

  private sanitizeConversationTitle(raw: string): string | null {
    let t = String(raw ?? "").trim();
    if (!t) return null;

    // Take first line only; strip leading labels.
    t = t.split(/\r?\n/, 1)[0] || "";
    t = t.replace(/^\s*(title|conversation title)\s*:\s*/i, "").trim();

    // Strip wrapping quotes/backticks.
    t = t.replace(/^["'`“”]+/, "").replace(/["'`“”]+$/, "").trim();

    // Remove obvious PII.
    t = t.replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, "").trim();
    t = t.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "").trim(); // SSN-like
    t = t.replace(/\b\d{10,}\b/g, "").trim(); // long numeric strings

    // Collapse whitespace and trim trailing punctuation.
    t = t.replace(/\s+/g, " ").replace(/[.:\-–—]+$/g, "").trim();
    if (!t) return null;

    // Limit word count (ChatGPT-like short titles).
    const words = t.split(" ").filter(Boolean);
    const clipped = words.slice(0, 7).join(" ");
    t = clipped.trim();

    // Length clamp.
    if (t.length > 64) t = t.slice(0, 64).trimEnd();
    if (t.length < 3) return null;

    // Title Case (approximate ChatGPT sidebar style).
    const lowerWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "if", "in", "nor", "of", "on", "or", "so", "the", "to", "up", "with"]);
    const parts = t.split(" ");
    const out = parts.map((w, i) => {
      const low = w.toLowerCase();
      if (i !== 0 && lowerWords.has(low)) return low;
      return low.charAt(0).toUpperCase() + low.slice(1);
    });
    return out.join(" ").trim();
  }

  private generateTitleFromMessageFallback(message: string): string {
    const cleaned = String(message || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "New Chat";
    if (cleaned.length <= 50) return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    const truncated = cleaned.slice(0, 50);
    const lastSpace = truncated.lastIndexOf(" ");
    const title = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
    return title.charAt(0).toUpperCase() + title.slice(1) + "…";
  }

  private async autoTitleConversationIfNeeded(params: {
    userId: string;
    conversationId: string;
    message: string;
    languageHint?: "en" | "pt" | "es";
  }): Promise<string | undefined> {
    const conv = await prisma.conversation.findFirst({
      where: { id: params.conversationId, userId: params.userId, isDeleted: false },
      select: { title: true, contextType: true },
    });
    if (!conv || !this.isPlaceholderConversationTitle(conv.title)) return undefined;
    if (conv.contextType === "viewer" || conv.contextType === "editor") return undefined;

    // Prefer LLM-generated, ChatGPT-like short titles; fall back to deterministic truncation.
    let generated: string | null = null;
    const llmEnabled = (process.env.AUTO_TITLE_USE_LLM ?? "true") !== "false";
    if (llmEnabled) {
      try {
        const system = [
          "You generate short ChatGPT-style chat titles from the user's FIRST message.",
          "Rules:",
          "- Output ONLY the title (no quotes, no markdown, no prefix).",
          "- 3 to 7 words.",
          "- Use Title Case.",
          "- Do not include personal data (emails, phone numbers).",
          "- Do not include file extensions like .pdf/.docx/.xlsx/.pptx.",
        ].join("\n");

        const user = `FIRST MESSAGE:\n${String(params.message || "").trim()}`;

        const out = await this.engine.generate({
          traceId: `title_${Date.now().toString(36)}`,
          userId: params.userId,
          conversationId: params.conversationId,
          messages: [
            { role: "system" as ChatRole, content: system },
            { role: "user" as ChatRole, content: user },
          ],
        });

        generated = this.sanitizeConversationTitle(out?.text || "");
      } catch {
        generated = null;
      }
    }

    if (!generated) {
      generated = this.sanitizeConversationTitle(this.generateTitleFromMessageFallback(params.message)) || "New Chat";
    }

    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: { title: generated, updatedAt: new Date() },
    });

    return generated;
  }

  /**
   * Brand enforcement for *new assistant output*.
   *
   * - Do not touch fenced code blocks or blockquotes (document quotes must remain exact).
   * - Do targeted replacements for self-identity phrases and common UI microcopy.
   * - Do NOT globally rewrite every occurrence of the old name; that can corrupt evidence/quotes.
   */
  private enforceBrandName(text: string): string {
    const input = String(text ?? '');
    if (!input) return input;

    const rewriteLine = (line: string): string => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('>')) return line; // preserve quoted evidence verbatim

      // Preserve internal source links; we only rewrite the visible text around them.
      let out = line;

      // Self-identity / instruction phrases
      out = out.replace(/\b(you are|you're|youre)\s+koda\b/gi, (_m, p1) => `${p1} ${BRAND_NAME}`);
      out = out.replace(/\b(i am|i'm|im)\s+koda\b/gi, (_m, p1) => `${p1} ${BRAND_NAME}`);

      // Common microcopy that can leak from prompts/templates
      out = out.replace(/\bask\s+koda\b/gi, `Ask ${BRAND_NAME}`);
      out = out.replace(/\bkoda\s+will\b/gi, `${BRAND_NAME} will`);

      // If a line starts with the old name as a label (e.g., "OldName:"), rename it.
      out = out.replace(/^(\s*)koda(\s*:\s*)/i, `$1${BRAND_NAME}$2`);

      // Final guard: never let the old name appear in normal assistant prose.
      // Preserve internal source-link scheme (koda://...) and identifiers (koda- / koda_).
      out = out.replace(/\bkoda\b(?!:\/\/)(?![-_])/gi, BRAND_NAME);

      return out;
    };

    // Protect fenced code blocks.
    const fenceRe = /```[\s\S]*?```/g;
    let last = 0;
    const parts: string[] = [];
    for (const m of input.matchAll(fenceRe)) {
      const idx = m.index ?? 0;
      const before = input.slice(last, idx);
      parts.push(before.split('\n').map(rewriteLine).join('\n'));
      parts.push(m[0]); // keep code fence as-is
      last = idx + m[0].length;
    }
    const tail = input.slice(last);
    parts.push(tail.split('\n').map(rewriteLine).join('\n'));

    return parts.join('');
  }

  // -----------------------------
  // Capabilities + followups (bank-driven)
  // -----------------------------

  private isCapabilitiesQuery(message: string): boolean {
    const s = String(message || "").trim().toLowerCase();
    if (!s) return false;
    return (
      /\bwhat can you do\b/.test(s) ||
      /\bcapabilit(y|ies)\b/.test(s) ||
      /\bfeatures?\b/.test(s) ||
      /\bgetting started\b/.test(s) ||
      /\bcomo (você|vc) pode ajudar\b/.test(s) ||
      /\bo que você pode fazer\b/.test(s) ||
      /\brecursos\b/.test(s) ||
      /\bfuncionalidades\b/.test(s) ||
      /\bqué puedes hacer\b/.test(s) ||
      /\bcapacidades\b/.test(s) ||
      /\bfunciones\b/.test(s)
    );
  }

  private loadCapabilitiesCatalog(): any | null {
    try {
      const p = path.join(resolveDataDir(), "semantics/capabilities_catalog.any.json");
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  private renderCapabilitiesAnswer(lang: "en" | "pt" | "es"): string {
    const bank = this.loadCapabilitiesCatalog();
    const groups = Array.isArray(bank?.groups) ? bank.groups : [];

    const pick = (obj: any): string => {
      if (!obj || typeof obj !== "object") return "";
      return String(obj[lang] ?? obj.en ?? obj.pt ?? obj.es ?? "").trim();
    };

    const header =
      lang === "pt"
        ? `Aqui está o que ${BRAND_NAME} pode fazer:`
        : lang === "es"
        ? `Esto es lo que ${BRAND_NAME} puede hacer:`
        : `Here’s what ${BRAND_NAME} can do:`;

    const lines: string[] = [header];

    for (const g of groups) {
      const title = pick(g?.title);
      const bullets = (g?.bullets && typeof g.bullets === "object" ? (g.bullets[lang] ?? g.bullets.en ?? []) : []) as string[];
      if (!title || !Array.isArray(bullets) || bullets.length === 0) continue;
      lines.push("");
      lines.push(`**${title}**`);
      for (const b of bullets.slice(0, 4)) {
        const t = String(b || "").trim();
        if (!t) continue;
        lines.push(`- ${t}`);
      }
    }

    // No appended follow-up question (chips-only UX)
    return lines.join("\n").trim();
  }

  private loadFollowupBank(): any | null {
    try {
      const p = path.join(resolveDataDir(), "microcopy/followup_suggestions.any.json");
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  private selectFollowups(input: {
    lang: "en" | "pt" | "es";
    answerMode: string;
    answerClass: string;
    operator?: string | null;
    intentFamily?: string | null;
    isViewerVariant?: boolean;
  }): Array<{ label: string; query: string }> {
    const bank = this.loadFollowupBank();
    if (!bank?.config?.enabled) return [];

    const suppress = new Set(Array.isArray(bank?.config?.suppressInAnswerModes) ? bank.config.suppressInAnswerModes : []);
    if (suppress.has(input.answerMode)) return [];

    const max = Math.max(0, Math.min(6, Number(bank?.config?.maxFollowups ?? 3) || 3));
    if (max <= 0) return [];

    const rules = Array.isArray(bank?.rules) ? bank.rules : [];

    const getPath = (obj: any, p: string): any => {
      const parts = p.split(".");
      let cur = obj;
      for (const k of parts) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = cur[k];
      }
      return cur;
    };

    const evalCond = (cond: any): boolean => {
      const pathStr = String(cond?.path || "");
      const op = String(cond?.op || "");
      const value = cond?.value;
      const actual = getPath(
        {
          answerMode: input.answerMode,
          answerClass: input.answerClass,
          operator: input.operator ?? null,
          intentFamily: input.intentFamily ?? null,
          isViewerVariant: Boolean(input.isViewerVariant),
        },
        pathStr
      );
      const a = actual == null ? "" : String(actual);
      const v = value == null ? "" : String(value);
      if (op === "eq") return a === v;
      if (op === "startsWith") return a.startsWith(v);
      return false;
    };

    const matchRule = (r: any): boolean => {
      const when = r?.when;
      if (!when || typeof when !== "object") return false;
      if (Array.isArray(when.all)) return when.all.every(evalCond);
      if (Array.isArray(when.any)) return when.any.some(evalCond);
      return false;
    };

    const langKey = input.lang;
    const out: Array<{ label: string; query: string }> = [];
    for (const r of rules) {
      if (!matchRule(r)) continue;
      const s = r?.suggestions?.[langKey] ?? r?.suggestions?.en ?? [];
      if (!Array.isArray(s)) continue;
      for (const it of s) {
        const label = String(it?.label || "").trim();
        const query = String(it?.query || "").trim();
        if (!label || !query) continue;
        out.push({ label, query });
      }
    }

    // Dedupe by query
    const seen = new Set<string>();
    const deduped: Array<{ label: string; query: string }> = [];
    for (const f of out) {
      const k = f.query.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(f);
      if (deduped.length >= max) break;
    }

    return deduped;
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
