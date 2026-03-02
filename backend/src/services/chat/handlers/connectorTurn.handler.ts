import { randomUUID } from "crypto";

import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../llm/types/llmStreaming.types";
import type { ChatRequest, ChatResult, TurnContext } from "../chat.types";
import type { TurnExecutor } from "./types";
import {
  ConnectorHandlerService,
  type ConnectorHandlerResult,
} from "../../core/handlers/connectorHandler.service";
import { TokenVaultService } from "../../connectors/tokenVault.service";
import { GmailOAuthService } from "../../connectors/gmail/gmailOAuth.service";
import { OutlookOAuthService } from "../../connectors/outlook/outlookOAuth.service";
import { SlackOAuthService } from "../../connectors/slack/slackOAuth.service";
import { GmailClientService } from "../../connectors/gmail/gmailClient.service";
import GraphClientService from "../../connectors/outlook/graphClient.service";
import { SlackClientService } from "../../connectors/slack/slackClient.service";
import { verifyEmailSendConfirmationToken } from "../../connectors/emailSendConfirmation.service";
import prisma from "../../../config/database";

type Provider = "gmail" | "outlook" | "slack";
type EmailProvider = "gmail" | "outlook";
type ConnectorOperator =
  | "CONNECT_START"
  | "CONNECTOR_SYNC"
  | "CONNECTOR_SEARCH"
  | "CONNECTOR_STATUS"
  | "CONNECTOR_DISCONNECT"
  | "EMAIL_LATEST"
  | "EMAIL_EXPLAIN_LATEST"
  | "EMAIL_SUMMARIZE_PREVIOUS"
  | "EMAIL_DRAFT"
  | "EMAIL_SEND"
  | "EMAIL_DOC_FUSION";

type ConnectorActionContext = {
  userId: string;
  conversationId: string;
  correlationId: string;
  clientMessageId: string;
};

type EmailCardAttachment = {
  type: "connector_email_ref";
  provider: EmailProvider;
  messageId?: string;
  cardTitle: string;
  actionLabel: string;
  subject: string;
  from?: string;
  to?: string;
  cc?: string;
  receivedAt?: string;
  preview?: string;
  bodyText?: string;
};

type SlackCardAttachment = {
  type: "connector_slack_message";
  channelName?: string;
  channelId?: string;
  preview?: string;
};

type HandlerDeps = {
  connectorHandler: Pick<ConnectorHandlerService, "execute">;
  tokenVault: Pick<TokenVaultService, "getValidAccessToken">;
  gmailOAuth: Pick<GmailOAuthService, "refreshAccessToken">;
  outlookOAuth: Pick<OutlookOAuthService, "refreshAccessToken">;
  slackOAuth: Pick<SlackOAuthService, "refreshAccessToken">;
  gmailClient: Pick<GmailClientService, "listMessages" | "getMessage">;
  graphClient: Pick<GraphClientService, "listMessages" | "getMessageText">;
  slackClient: Pick<
    SlackClientService,
    "listConversations" | "getConversationHistory" | "extractMessageText"
  >;
};

const ALL_PROVIDERS: Provider[] = ["gmail", "outlook", "slack"];
const EMAIL_PROVIDERS: EmailProvider[] = ["gmail", "outlook"];
const CONNECTOR_OPERATORS = new Set<ConnectorOperator>([
  "CONNECT_START",
  "CONNECTOR_SYNC",
  "CONNECTOR_SEARCH",
  "CONNECTOR_STATUS",
  "CONNECTOR_DISCONNECT",
  "EMAIL_LATEST",
  "EMAIL_EXPLAIN_LATEST",
  "EMAIL_SUMMARIZE_PREVIOUS",
  "EMAIL_DRAFT",
  "EMAIL_SEND",
  "EMAIL_DOC_FUSION",
]);

const SEARCH_PREFIX_RE =
  /^(?:please\s+)?(?:search|find|look\s+for|lookup|query|pesquisar|procurar|buscar|encontrar)\s+(?:in|on|no|na|em)?\s*(?:my\s+)?(?:gmail|outlook|slack|emails?|messages?|inbox|channels?|caixa|mensagens?)\s*/i;
const EMAIL_RE_GLOBAL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const DEFAULT_CONNECTOR_CHAT_TIMEOUT_MS = 15_000;
const MIN_CONNECTOR_CHAT_TIMEOUT_MS = 1_000;
const MAX_CONNECTOR_CHAT_TIMEOUT_MS = 120_000;

function resolveConnectorChatTimeoutMs(): number {
  const parsed = Number(process.env.CONNECTOR_CHAT_OP_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_CONNECTOR_CHAT_TIMEOUT_MS;
  const normalized = Math.floor(parsed);
  return Math.min(
    MAX_CONNECTOR_CHAT_TIMEOUT_MS,
    Math.max(MIN_CONNECTOR_CHAT_TIMEOUT_MS, normalized),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function providerLabel(provider: Provider): string {
  if (provider === "gmail") return "Gmail";
  if (provider === "outlook") return "Outlook";
  return "Slack";
}

function normalizePreview(text: string, max = 280): string {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned;
}

function parseGmailHeader(headers: unknown, name: string): string {
  const needle = name.toLowerCase();
  const list = Array.isArray(headers) ? headers : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (String(record.name || "").toLowerCase() === needle) {
      return asString(record.value);
    }
  }
  return "";
}

function decodeBase64Url(data: string): string {
  const normalized = String(data || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

function extractGmailText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const node = payload as Record<string, unknown>;

  const body = asRecord(node.body);
  const data = asString(body.data);
  const mime = asString(node.mimeType).toLowerCase();
  if (data && (mime === "text/plain" || !mime)) {
    const decoded = normalizePreview(decodeBase64Url(data), 1200);
    if (decoded) return decoded;
  }

  const parts = Array.isArray(node.parts) ? node.parts : [];
  for (const part of parts) {
    const nested = extractGmailText(part);
    if (nested) return nested;
  }

  if (data) {
    const fallback = normalizePreview(
      decodeBase64Url(data)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "),
      1200,
    );
    if (fallback) return fallback;
  }

  return "";
}

function languageOf(req: ChatRequest): "en" | "pt" | "es" {
  const raw = asString(req.preferredLanguage).toLowerCase();
  if (raw.startsWith("pt")) return "pt";
  if (raw.startsWith("es")) return "es";
  return "en";
}

function resolveOperator(req: ChatRequest): ConnectorOperator | null {
  const meta = asRecord(req.meta);
  const op = asString(meta.operator).toUpperCase() as ConnectorOperator;
  if (CONNECTOR_OPERATORS.has(op)) return op;

  const text = String(req.message || "").toLowerCase();
  if (text.includes("latest email") || text.includes("ultimo email")) {
    return "EMAIL_LATEST";
  }
  if (text.includes("send") && text.includes("email")) {
    return "EMAIL_SEND";
  }
  if (text.includes("draft") && text.includes("email")) {
    return "EMAIL_DRAFT";
  }
  if (
    text.includes("search") ||
    text.includes("find") ||
    text.includes("pesquisar") ||
    text.includes("buscar")
  ) {
    return "CONNECTOR_SEARCH";
  }
  return "CONNECTOR_STATUS";
}

function inferProviderFromText(text: string): Provider | null {
  const msg = String(text || "").toLowerCase();
  if (/\b(gmail|google\s*mail)\b/.test(msg)) return "gmail";
  if (/\b(outlook|office\s*365|microsoft\s*outlook)\b/.test(msg)) {
    return "outlook";
  }
  if (/\b(slack|channel|dm|thread)\b/.test(msg)) return "slack";
  return null;
}

function extractEmailRecipients(text: string): string[] {
  const raw = String(text || "");
  const matches = raw.match(EMAIL_RE_GLOBAL) || [];
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const match of matches) {
    const normalized = String(match || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(normalized);
  }
  return recipients;
}

function inferDraftSubject(body: string): string {
  const trimmed = String(body || "").trim();
  if (!trimmed) return "Quick follow-up";

  const normalized = trimmed
    .replace(/^[,.:;\- ]+/, "")
    .replace(/[.?!\s]+$/, "")
    .trim();
  if (!normalized) return "Quick follow-up";
  const normalizedTypos = normalized.replace(/\bhes\b/gi, "his");

  if (
    /\bhow\b/i.test(normalizedTypos) &&
    /\bday\b/i.test(normalizedTypos) &&
    /\b(you|your|his|her|their)\b/i.test(normalizedTypos)
  ) {
    return "How is your day?";
  }

  let subject = normalizedTypos
    .replace(
      /^(please\s+)?(?:ask(?:ing)?|write(?:ing)?|compose|draft|send)\s+(?:them|him|her|the team)?\s*/i,
      "",
    )
    .trim();
  subject = subject.replace(/^for\s+(?:an?\s+|the\s+)?/i, "").trim();
  if (!subject) subject = normalizedTypos;

  subject = subject.charAt(0).toUpperCase() + subject.slice(1);
  if (subject.length > 72) {
    subject = `${subject.slice(0, 69).trim()}...`;
  }
  return subject || "Quick follow-up";
}

function inferDraftBody(bodyHint: string): string {
  let body = String(bodyHint || "").trim();
  if (!body) return "";

  body = body.replace(/\bhes\b/gi, "his").replace(/\s+/g, " ").trim();
  if (!body) return "";

  if (/^how (?:is|was) (?:your|his|her|their) day$/i.test(body)) {
    return "How is your day?";
  }

  body = body.charAt(0).toUpperCase() + body.slice(1);

  if (!/[.?!]$/.test(body)) {
    if (
      /^(how|what|when|where|why|who|is|are|was|were|do|does|did|can|could|will|would|should)\b/i.test(
        body,
      )
    ) {
      body = `${body}?`;
    } else {
      body = `${body}.`;
    }
  }

  return body;
}

function parseEmailDraft(text: string): {
  to: string;
  subject: string;
  body: string;
} {
  const raw = String(text || "").trim();
  const recipients = extractEmailRecipients(raw);
  const recipient = recipients.join(", ");

  const subjectMatch = raw.match(/\b(?:subject|assunto|asunto)\s*[:\-]\s*(.+)$/i);
  const explicitSubject = subjectMatch?.[1]?.trim() || "";

  let bodyHint = raw
    .replace(/\s+/g, " ")
    .replace(/\b(send|draft|compose|write|enviar|redigir|escrever)\b/gi, "")
    .replace(/\b(an?\s+)?email\b/gi, "")
    .replace(EMAIL_RE_GLOBAL, "")
    .replace(/\bto\b|\bpara\b/gi, "")
    .trim();
  const askingMatch = bodyHint.match(
    /\b(?:asking|ask(?:ing)?(?:\s+them)?(?:\s+if)?|preguntando|perguntando)\b[\s:,-]*(.+)$/i,
  );
  if (askingMatch?.[1]) {
    bodyHint = askingMatch[1].trim();
  }
  bodyHint = bodyHint
    .replace(/\b(?:to|para)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const body = inferDraftBody(bodyHint);
  const subject = explicitSubject || inferDraftSubject(body || bodyHint);

  return {
    to: recipient,
    subject,
    body,
  };
}

export class ConnectorTurnHandler {
  private readonly deps: HandlerDeps;

  constructor(
    private readonly executor: TurnExecutor,
    deps?: Partial<HandlerDeps>,
  ) {
    const tokenVault = new TokenVaultService();
    this.deps = {
      connectorHandler: deps?.connectorHandler ?? new ConnectorHandlerService(),
      tokenVault: deps?.tokenVault ?? tokenVault,
      gmailOAuth: deps?.gmailOAuth ?? new GmailOAuthService(tokenVault),
      outlookOAuth:
        deps?.outlookOAuth ?? new OutlookOAuthService({ tokenVault }),
      slackOAuth: deps?.slackOAuth ?? new SlackOAuthService({ tokenVault }),
      gmailClient: deps?.gmailClient ?? new GmailClientService(),
      graphClient: deps?.graphClient ?? new GraphClientService(),
      slackClient: deps?.slackClient ?? new SlackClientService(),
    };
  }

  async handle(params: {
    ctx: TurnContext;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const base =
      params.sink && params.streamingConfig
        ? await this.executor.streamChat({
            req: params.ctx.request,
            sink: params.sink,
            streamingConfig: params.streamingConfig,
          })
        : await this.executor.chat(params.ctx.request);
    const operator = resolveOperator(params.ctx.request);
    if (!operator) return base;

    let result: ChatResult;
    try {
      result = await this.handleConnectorOperator({
        ctx: params.ctx,
        base,
        operator,
      });
    } catch {
      result = this.compose(base, {
        assistantText:
          "I couldn't access your connector right now. Reconnect and try again.",
        answerMode: "action_receipt",
        status: "failed",
        failureCode: "CONNECTOR_RUNTIME_FAILED",
      });
    }
    await this.persistAssistantOverride(base, result).catch(() => {});
    return result;
  }

  private async persistAssistantOverride(
    base: ChatResult,
    next: ChatResult,
  ): Promise<void> {
    const messageId = asString(base.assistantMessageId);
    if (!messageId) return;

    const attachments = Array.isArray(next.attachmentsPayload)
      ? next.attachmentsPayload
      : [];

    const row = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        metadata: true,
        isEncrypted: true,
      },
    });
    if (!row) return;

    let existingMeta: Record<string, unknown> = {};
    try {
      const parsed = row.metadata ? JSON.parse(row.metadata) : null;
      existingMeta = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      existingMeta = {};
    }

    const mergedMeta: Record<string, unknown> = {
      ...existingMeta,
      attachments,
      answerMode: next.answerMode || existingMeta.answerMode || "action_receipt",
      answerClass: next.answerClass || existingMeta.answerClass || "GENERAL",
      navType: next.navType ?? existingMeta.navType ?? null,
      sources: Array.isArray(next.sources) ? next.sources : [],
    };

    const data: Record<string, unknown> = {
      metadata: JSON.stringify(mergedMeta),
    };

    if (!row.isEncrypted) {
      data.content = String(next.assistantText || "");
    }

    await prisma.message.update({
      where: { id: messageId },
      data,
    });
  }

  private connectedMap(req: ChatRequest): Record<Provider, boolean> {
    return {
      gmail: Boolean(req.connectorContext?.gmail?.connected),
      outlook: Boolean(req.connectorContext?.outlook?.connected),
      slack: Boolean(req.connectorContext?.slack?.connected),
    };
  }

  private resolveProvider(
    req: ChatRequest,
    allowed: Provider[],
  ): Provider | null {
    const active = asString(req.connectorContext?.activeProvider).toLowerCase();
    const fromText = inferProviderFromText(req.message || "");
    if (fromText && allowed.includes(fromText)) return fromText;
    if ((active as Provider) && allowed.includes(active as Provider)) {
      return active as Provider;
    }

    const connected = this.connectedMap(req);
    const connectedAllowed = allowed.filter((provider) => connected[provider]);
    if (connectedAllowed.length === 1) return connectedAllowed[0];

    return null;
  }

  private baseContext(
    req: ChatRequest,
    base: ChatResult,
  ): ConnectorActionContext {
    const meta = asRecord(req.meta);
    return {
      userId: req.userId,
      conversationId:
        base.conversationId || req.conversationId || `conv_${randomUUID()}`,
      correlationId:
        asString(meta.requestId) || base.traceId || `corr_${randomUUID()}`,
      clientMessageId: base.userMessageId || `msg_${randomUUID()}`,
    };
  }

  private compose(
    base: ChatResult,
    patch: {
      assistantText: string;
      attachments?: unknown[];
      answerMode?: string;
      status?: ChatResult["status"];
      failureCode?: string | null;
      completion?: ChatResult["completion"];
    },
  ): ChatResult {
    const text = String(patch.assistantText || "").trim();
    return {
      ...base,
      assistantText: text,
      attachmentsPayload: Array.isArray(patch.attachments) ? patch.attachments : [],
      sources: [],
      followups: [],
      answerMode: (patch.answerMode as any) || "action_receipt",
      answerClass: "GENERAL",
      navType: null,
      status: patch.status || "success",
      failureCode:
        patch.failureCode === undefined ? null : (patch.failureCode ?? null),
      completion:
        patch.completion ||
        ({
          answered: Boolean(text),
          missingSlots: [],
          nextAction: null,
        } as ChatResult["completion"]),
      evidence: {
        required: false,
        provided: false,
        sourceIds: [],
      },
      truncation: {
        occurred: false,
        reason: null,
        resumeToken: null,
        providerOccurred: false,
        providerReason: null,
        detectorVersion: null,
      },
    };
  }

  private promptForProvider(
    base: ChatResult,
    req: ChatRequest,
    providers: Provider[],
    intent: "read" | "sync" | "connect" | "send" | "disconnect" = "read",
  ): ChatResult {
    const lang = languageOf(req);
    const textByLang = {
      en: "Select a connector to continue.",
      pt: "Selecione um conector para continuar.",
      es: "Selecciona un conector para continuar.",
    } as const;

    const family = intent === "send" ? "email" : "messages";

    return this.compose(base, {
      assistantText: textByLang[lang],
      attachments: [
        {
          type: "connector_prompt",
          title: "Select connector",
          providers,
          family,
          intent,
        },
      ],
      answerMode: "action_receipt",
      status: "clarification_required",
      failureCode: "CONNECTOR_PROVIDER_REQUIRED",
      completion: {
        answered: false,
        missingSlots: ["provider"],
        nextAction: "select_provider",
      },
    });
  }

  private async executeStatus(
    req: ChatRequest,
    base: ChatResult,
    providers: Provider[],
  ): Promise<ChatResult> {
    const context = this.baseContext(req, base);
    const attachments: Array<Record<string, unknown>> = [];
    const lines: string[] = [];

    for (const provider of providers) {
      const result = await this.deps.connectorHandler.execute({
        action: "status",
        provider,
        context,
      });
      const connected = Boolean(result?.data?.connected);
      const indexed = Number(result?.data?.indexedDocuments || 0) || 0;
      const reason = asString(result?.data?.reason) || null;

      attachments.push({
        type: "connector_status",
        provider,
        connected,
        indexedDocuments: indexed,
        expired: reason === "token_expired",
        reason,
      });

      if (!result.ok) {
        lines.push(`${providerLabel(provider)}: unavailable`);
      } else if (connected) {
        lines.push(`${providerLabel(provider)}: connected (${indexed} indexed)`);
      } else {
        lines.push(`${providerLabel(provider)}: not connected`);
      }
    }

    return this.compose(base, {
      assistantText: lines.join("; "),
      attachments,
      answerMode: "action_receipt",
      status: "success",
    });
  }

  private async resolveProviderStatus(
    req: ChatRequest,
    base: ChatResult,
    provider: Provider,
  ): Promise<ConnectorHandlerResult> {
    return this.deps.connectorHandler.execute({
      action: "status",
      provider,
      context: this.baseContext(req, base),
    });
  }

  private async withConnectorTimeout<T>(
    label: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const timeoutMs = resolveConnectorChatTimeoutMs();
    let timer: ReturnType<typeof setTimeout> | null = null;

    return new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      if (typeof (timer as any)?.unref === "function") {
        (timer as any).unref();
      }

      run()
        .then(resolve, reject)
        .finally(() => {
          if (timer) clearTimeout(timer);
          timer = null;
        });
    });
  }

  private async getAccessToken(
    userId: string,
    provider: Provider,
  ): Promise<string> {
    try {
      return await this.deps.tokenVault.getValidAccessToken(userId, provider);
    } catch {
      if (provider === "gmail") {
        await this.deps.gmailOAuth.refreshAccessToken(userId);
      } else if (provider === "outlook") {
        await this.deps.outlookOAuth.refreshAccessToken(userId);
      } else {
        await this.deps.slackOAuth.refreshAccessToken(userId);
      }
      return this.deps.tokenVault.getValidAccessToken(userId, provider);
    }
  }

  private async fetchLatestEmail(
    userId: string,
    provider: EmailProvider,
  ): Promise<EmailCardAttachment | null> {
    const token = await this.getAccessToken(userId, provider);

    if (provider === "gmail") {
      const list = await this.deps.gmailClient.listMessages(token, {
        maxResults: 1,
        includeSpamTrash: false,
        labelIds: ["INBOX"],
      });
      const messageId = String(list?.messages?.[0]?.id || "").trim();
      if (!messageId) return null;

      const message = await this.deps.gmailClient.getMessage(token, messageId);
      const headers = (message?.payload as any)?.headers;
      const subject = parseGmailHeader(headers, "Subject") || "(no subject)";
      const from = parseGmailHeader(headers, "From");
      const to = parseGmailHeader(headers, "To");
      const cc = parseGmailHeader(headers, "Cc");
      const receivedAt =
        parseGmailHeader(headers, "Date") ||
        (message?.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : undefined);
      const bodyText =
        extractGmailText(message?.payload) || normalizePreview(message?.snippet || "", 320);

      return {
        type: "connector_email_ref",
        provider,
        messageId,
        cardTitle: "Latest email",
        actionLabel: "Open",
        subject,
        from,
        to,
        cc,
        receivedAt,
        preview: normalizePreview(bodyText, 320),
        bodyText: normalizePreview(bodyText, 1200),
      };
    }

    const list = await this.deps.graphClient.listMessages({
      accessToken: token,
      top: 1,
      folder: "Inbox",
    });
    const msg = Array.isArray((list as any)?.value) ? (list as any).value[0] : null;
    if (!msg) return null;

    const firstAddress = (arr: unknown): string => {
      const list = Array.isArray(arr) ? arr : [];
      const first = list[0] as any;
      return (
        asString(first?.emailAddress?.address) ||
        asString(first?.emailAddress?.name) ||
        ""
      );
    };

    return {
      type: "connector_email_ref",
      provider,
      messageId: asString(msg.id),
      cardTitle: "Latest email",
      actionLabel: "Open",
      subject: asString(msg.subject) || "(no subject)",
      from:
        asString(msg?.from?.emailAddress?.address) ||
        asString(msg?.from?.emailAddress?.name),
      to: firstAddress(msg?.toRecipients),
      cc: firstAddress(msg?.ccRecipients),
      receivedAt: asString(msg.receivedDateTime),
      preview: normalizePreview(this.deps.graphClient.getMessageText(msg), 320),
      bodyText: normalizePreview(this.deps.graphClient.getMessageText(msg), 1200),
    };
  }

  private buildConnectorAccessFailure(
    base: ChatResult,
    provider: Provider,
    error: unknown,
  ): ChatResult {
    const raw = error instanceof Error ? error.message : String(error || "");
    const needsReconnect =
      /not connected|reconnect|required|401|403|unauthorized|token|invalid_grant/i.test(
        raw,
      );
    const label = providerLabel(provider);
    return this.compose(base, {
      assistantText: needsReconnect
        ? `${label} is not connected. Reconnect it and try again.`
        : `I couldn't access ${label} right now. Try again in a moment.`,
      answerMode: "action_receipt",
      status: "failed",
      failureCode: needsReconnect
        ? "CONNECTOR_NOT_CONNECTED"
        : "CONNECTOR_ACCESS_FAILED",
      attachments: [
        {
          type: "connector_status",
          provider,
          connected: !needsReconnect,
          reason: needsReconnect ? "not_connected" : "access_failed",
        },
      ],
    });
  }

  private async fetchLatestSlackMessage(
    userId: string,
  ): Promise<SlackCardAttachment | null> {
    const token = await this.getAccessToken(userId, "slack");
    const conversations = await this.deps.slackClient.listConversations({
      accessToken: token,
      excludeArchived: true,
      types: ["public_channel", "private_channel", "im", "mpim"],
      limit: 50,
    });

    const channels = Array.isArray(conversations.channels)
      ? conversations.channels
      : [];

    for (const channel of channels) {
      const channelId = asString((channel as any)?.id);
      if (!channelId) continue;
      try {
        const history = await this.deps.slackClient.getConversationHistory({
          accessToken: token,
          channelId,
          limit: 1,
        });
        const latest = Array.isArray(history.messages)
          ? history.messages[0]
          : null;
        if (!latest) continue;
        const preview = normalizePreview(
          this.deps.slackClient.extractMessageText(latest as any),
          320,
        );
        if (!preview) continue;
        return {
          type: "connector_slack_message",
          channelId,
          channelName: asString((channel as any)?.name),
          preview,
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  private searchQueryFromMessage(message: string): string {
    const raw = String(message || "").trim();
    const stripped = raw.replace(SEARCH_PREFIX_RE, "").trim();
    return stripped || raw;
  }

  private async handleEmailSend(
    req: ChatRequest,
    base: ChatResult,
  ): Promise<ChatResult> {
    const provider = this.resolveProvider(req, EMAIL_PROVIDERS);
    if (!provider || provider === "slack") {
      return this.promptForProvider(base, req, EMAIL_PROVIDERS, "send");
    }

    let status: ConnectorHandlerResult;
    try {
      status = await this.withConnectorTimeout(
        `${providerLabel(provider)} status check`,
        () => this.resolveProviderStatus(req, base, provider),
      );
    } catch (error) {
      return this.buildConnectorAccessFailure(base, provider, error);
    }
    if (!status.ok || !status.data?.connected) {
      return this.promptForProvider(base, req, [provider], "connect");
    }

    const confirmationToken = asString(req.confirmationToken);
    if (confirmationToken) {
      let payload;
      try {
        payload = verifyEmailSendConfirmationToken(confirmationToken);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid token.";
        return this.compose(base, {
          assistantText: message,
          answerMode: "action_receipt",
          status: "failed",
          failureCode: "INVALID_CONFIRMATION",
        });
      }

      if (payload.userId !== req.userId) {
        return this.compose(base, {
          assistantText: "Confirmation token does not belong to this user.",
          answerMode: "action_receipt",
          status: "blocked",
          failureCode: "INVALID_CONFIRMATION_USER",
        });
      }

      const sendProvider = payload.provider;
      let sendResult: ConnectorHandlerResult;
      try {
        sendResult = await this.withConnectorTimeout(
          `${providerLabel(sendProvider)} send`,
          () =>
            this.deps.connectorHandler.execute({
              action: "send",
              provider: sendProvider,
              context: this.baseContext(req, base),
              to: payload.to,
              subject: payload.subject,
              body: payload.body,
              confirmationId: confirmationToken,
              attachmentDocumentIds: payload.attachmentDocumentIds,
            }),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send email.";
        return this.compose(base, {
          assistantText: message,
          answerMode: "action_receipt",
          status: "failed",
          failureCode: "EMAIL_SEND_FAILED",
          attachments: [
            {
              type: "action_confirmation",
              operator: "EMAIL_SEND",
              confirmLabel: "Send",
              cancelLabel: "Cancel",
              confirmStyle: "primary",
            },
            {
              type: "email_draft_snapshot",
              provider: sendProvider,
              providerLabel: providerLabel(sendProvider),
              to: payload.to,
              subject: payload.subject,
              body: payload.body,
            },
          ],
        });
      }

      if (!sendResult.ok) {
        return this.compose(base, {
          assistantText: sendResult.error || "Failed to send email.",
          answerMode: "action_receipt",
          status: "failed",
          failureCode: "EMAIL_SEND_FAILED",
          attachments: [
            {
              type: "action_confirmation",
              operator: "EMAIL_SEND",
              confirmLabel: "Send",
              cancelLabel: "Cancel",
              confirmStyle: "primary",
            },
            {
              type: "email_draft_snapshot",
              provider: sendProvider,
              providerLabel: providerLabel(sendProvider),
              to: payload.to,
              subject: payload.subject,
              body: payload.body,
            },
          ],
        });
      }

      return this.compose(base, {
        assistantText: `Email sent via ${providerLabel(sendProvider)}.`,
        answerMode: "action_receipt",
        status: "success",
        attachments: [
          {
            type: "action_confirmation",
            operator: "EMAIL_SEND",
            confirmLabel: "Send",
            cancelLabel: "Cancel",
            confirmStyle: "primary",
          },
          {
            type: "email_draft_snapshot",
            provider: sendProvider,
            providerLabel: providerLabel(sendProvider),
            to: payload.to,
            subject: payload.subject,
            body: payload.body,
            status: "sent",
          },
        ],
      });
    }

    const draft = parseEmailDraft(req.message || "");
    return this.compose(base, {
      assistantText: "Draft ready. Review and send when you are ready.",
      answerMode: "action_confirmation",
      status: "clarification_required",
      failureCode: null,
      completion: {
        answered: false,
        missingSlots: [],
        nextAction: "confirm_send",
      },
      attachments: [
        {
          type: "action_confirmation",
          operator: "EMAIL_SEND",
          confirmLabel: "Send",
          cancelLabel: "Cancel",
          confirmStyle: "primary",
        },
        {
          type: "email_draft_snapshot",
          provider,
          providerLabel: providerLabel(provider),
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
        },
      ],
    });
  }

  private async handleConnectorOperator(params: {
    ctx: TurnContext;
    base: ChatResult;
    operator: ConnectorOperator;
  }): Promise<ChatResult> {
    const { ctx, base, operator } = params;
    const req = ctx.request;

    if (operator === "CONNECTOR_STATUS") {
      const provider = this.resolveProvider(req, ALL_PROVIDERS);
      const providers = provider ? [provider] : ALL_PROVIDERS;
      return this.executeStatus(req, base, providers);
    }

    if (operator === "CONNECT_START") {
      const provider = this.resolveProvider(req, ALL_PROVIDERS);
      if (!provider) return this.promptForProvider(base, req, ALL_PROVIDERS, "connect");
      return this.promptForProvider(base, req, [provider], "connect");
    }

    if (operator === "CONNECTOR_SYNC") {
      const provider = this.resolveProvider(req, ALL_PROVIDERS);
      if (!provider) return this.promptForProvider(base, req, ALL_PROVIDERS, "sync");

      const result = await this.deps.connectorHandler.execute({
        action: "sync",
        provider,
        context: this.baseContext(req, base),
      });

      if (!result.ok) {
        const msg = asString(result.error);
        if (/not connected|reconnect required/i.test(msg)) {
          return this.promptForProvider(base, req, [provider], "connect");
        }
        return this.compose(base, {
          assistantText: msg || `Sync failed for ${providerLabel(provider)}.`,
          status: "failed",
          failureCode: "CONNECTOR_SYNC_FAILED",
        });
      }

      const mode = asString(result.data?.mode);
      const queued = mode === "queued";
      const text = queued
        ? `Sync queued for ${providerLabel(provider)}.`
        : `Sync started for ${providerLabel(provider)}.`;

      return this.compose(base, {
        assistantText: text,
        attachments: [
          {
            type: "connector_status",
            provider,
            connected: true,
            indexedDocuments: Number(result.data?.syncedCount || 0) || 0,
          },
        ],
      });
    }

    if (operator === "CONNECTOR_DISCONNECT") {
      const provider = this.resolveProvider(req, ALL_PROVIDERS);
      if (!provider) {
        return this.promptForProvider(base, req, ALL_PROVIDERS, "disconnect");
      }

      const token = asString(req.confirmationToken);
      const expected = `disconnect:${provider}`;
      if (token !== expected) {
        return this.compose(base, {
          assistantText: `Confirm disconnect for ${providerLabel(provider)}.`,
          answerMode: "action_confirmation",
          status: "clarification_required",
          failureCode: null,
          completion: {
            answered: false,
            missingSlots: [],
            nextAction: "confirm_disconnect",
          },
          attachments: [
            {
              type: "action_confirmation",
              operator: "CONNECTOR_DISCONNECT",
              confirmationId: expected,
              confirmLabel: "Disconnect",
              cancelLabel: "Cancel",
              confirmStyle: "danger",
            },
            {
              type: "connector_status",
              provider,
              connected: true,
            },
          ],
        });
      }

      const result = await this.deps.connectorHandler.execute({
        action: "disconnect",
        provider,
        context: this.baseContext(req, base),
      });

      if (!result.ok) {
        return this.compose(base, {
          assistantText:
            asString(result.error) || `Failed to disconnect ${providerLabel(provider)}.`,
          status: "failed",
          failureCode: "CONNECTOR_DISCONNECT_FAILED",
        });
      }

      return this.compose(base, {
        assistantText: `${providerLabel(provider)} disconnected.`,
        attachments: [
          {
            type: "connector_status",
            provider,
            connected: false,
            indexedDocuments: Number(result.data?.indexedDocuments || 0) || 0,
          },
        ],
      });
    }

    if (operator === "CONNECTOR_SEARCH") {
      const provider = this.resolveProvider(req, ALL_PROVIDERS);
      if (!provider) return this.promptForProvider(base, req, ALL_PROVIDERS, "read");

      if (provider === "slack" && /\b(latest|recent|last)\b/i.test(req.message || "")) {
        const latest = await this.withConnectorTimeout(
          "Slack latest message fetch",
          () => this.fetchLatestSlackMessage(req.userId),
        );
        if (latest) {
          return this.compose(base, {
            assistantText: "Latest Slack message is shown below.",
            attachments: [latest],
          });
        }
      }

      const query = this.searchQueryFromMessage(req.message || "");
      const result = await this.withConnectorTimeout(
        `${providerLabel(provider)} search`,
        () =>
          this.deps.connectorHandler.execute({
            action: "search",
            provider,
            context: this.baseContext(req, base),
            query,
            limit: 5,
          }),
      );

      if (!result.ok) {
        const msg = asString(result.error);
        if (/not connected|reconnect required/i.test(msg)) {
          return this.promptForProvider(base, req, [provider], "connect");
        }
        return this.compose(base, {
          assistantText: msg || "Connector search failed.",
          status: "failed",
          failureCode: "CONNECTOR_SEARCH_FAILED",
        });
      }

      const hits = Array.isArray(result.hits) ? result.hits : [];
      if (hits.length === 0) {
        return this.compose(base, {
          assistantText: `No results found in ${providerLabel(provider)}.`,
          status: "partial",
          failureCode: "CONNECTOR_NO_RESULTS",
        });
      }

      const attachments = hits.map((hit) => {
        const syntheticPrefix = `${provider}:`;
        const syntheticId = hit.documentId.startsWith(syntheticPrefix)
          ? hit.documentId.slice(syntheticPrefix.length).trim()
          : "";
        if (provider === "slack") {
          const parsedChannel = (() => {
            const parts = hit.documentId.split(":");
            if (parts.length >= 2 && parts[0] === "slack") return parts[1];
            return "";
          })();
          const card: SlackCardAttachment = {
            type: "connector_slack_message",
            channelId:
              asString((hit as any).providerChannelId) || parsedChannel || undefined,
            preview: normalizePreview(hit.snippet, 320),
          };
          return card;
        }

        const messageId =
          asString((hit as any).providerMessageId) || syntheticId || undefined;
        const card: EmailCardAttachment = {
          type: "connector_email_ref",
          provider: provider as EmailProvider,
          messageId,
          cardTitle: "Email match",
          actionLabel: messageId ? "Open" : "View",
          subject: asString(hit.title) || "(no subject)",
          preview: normalizePreview(hit.snippet, 320),
          bodyText: normalizePreview(hit.snippet, 1200),
        };
        return card;
      });

      return this.compose(base, {
        assistantText: `Found ${hits.length} result${hits.length === 1 ? "" : "s"} in ${providerLabel(provider)}.`,
        attachments,
      });
    }

    if (
      operator === "EMAIL_LATEST" ||
      operator === "EMAIL_EXPLAIN_LATEST" ||
      operator === "EMAIL_SUMMARIZE_PREVIOUS" ||
      operator === "EMAIL_DOC_FUSION"
    ) {
      const provider = this.resolveProvider(req, EMAIL_PROVIDERS);
      if (!provider || provider === "slack") {
        return this.promptForProvider(base, req, EMAIL_PROVIDERS, "read");
      }

      let status: ConnectorHandlerResult;
      try {
        status = await this.withConnectorTimeout(
          `${providerLabel(provider)} status check`,
          () => this.resolveProviderStatus(req, base, provider),
        );
      } catch (error) {
        return this.buildConnectorAccessFailure(base, provider, error);
      }
      if (!status.ok || !status.data?.connected) {
        return this.promptForProvider(base, req, [provider], "connect");
      }

      let latest: EmailCardAttachment | null = null;
      try {
        latest = await this.withConnectorTimeout(
          `${providerLabel(provider)} latest email fetch`,
          () => this.fetchLatestEmail(req.userId, provider),
        );
      } catch (error) {
        return this.buildConnectorAccessFailure(base, provider, error);
      }
      if (!latest) {
        return this.compose(base, {
          assistantText: `No recent emails found in ${providerLabel(provider)}.`,
          status: "partial",
          failureCode: "EMAIL_NOT_FOUND",
        });
      }

      if (operator === "EMAIL_EXPLAIN_LATEST" || operator === "EMAIL_SUMMARIZE_PREVIOUS") {
        const summary = latest.preview || "No preview available.";
        const text = `Latest email in ${providerLabel(provider)}: ${latest.subject}. ${summary}`;
        return this.compose(base, {
          assistantText: text,
          attachments: [latest],
        });
      }

      return this.compose(base, {
        assistantText: `Latest email in ${providerLabel(provider)} is shown below.`,
        attachments: [latest],
      });
    }

    if (operator === "EMAIL_DRAFT" || operator === "EMAIL_SEND") {
      return this.handleEmailSend(req, base);
    }

    return this.executeStatus(req, base, ALL_PROVIDERS);
  }
}
