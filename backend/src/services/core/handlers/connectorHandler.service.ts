import prisma from "../../../config/database";
import { downloadFile } from "../../../config/storage";
import {
  getConnector,
  getConnectorCapabilities,
  isConnectorProvider,
  type ConnectorProvider,
} from "../../connectors/connectorsRegistry";
import { TokenVaultService } from "../../connectors/tokenVault.service";

type ConnectorAction =
  | "connect"
  | "sync"
  | "search"
  | "status"
  | "send"
  | "disconnect";

export interface ConnectorHandlerContext {
  userId: string;
  conversationId: string;
  correlationId: string;
  clientMessageId: string;
}

export interface ConnectorHandlerRequest {
  action: ConnectorAction;
  provider: string;
  context: ConnectorHandlerContext;
  query?: string;
  callbackUrl?: string;
  forceResync?: boolean;
  limit?: number;
  to?: string;
  subject?: string;
  body?: string;
  confirmationId?: string;
  cc?: string;
  bcc?: string;
  attachmentDocumentIds?: string[];
  attachments?: Array<{ filename: string; mimeType: string; content: Buffer }>;
}

export interface ConnectorSearchHit {
  documentId: string;
  title: string;
  snippet: string;
  source: ConnectorProvider;
  providerMessageId?: string;
  providerChannelId?: string;
  providerMessageTs?: string;
}

export interface ConnectorHandlerResult {
  ok: boolean;
  action: ConnectorAction;
  provider?: ConnectorProvider;
  data?: Record<string, unknown>;
  hits?: ConnectorSearchHit[];
  error?: string;
}

function isFn(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

export class ConnectorHandlerService {
  private readonly tokenVault: TokenVaultService;

  constructor(opts?: { tokenVault?: TokenVaultService }) {
    this.tokenVault = opts?.tokenVault ?? new TokenVaultService();
  }

  async execute(req: ConnectorHandlerRequest): Promise<ConnectorHandlerResult> {
    if (!isConnectorProvider(req.provider)) {
      return {
        ok: false,
        action: req.action,
        error: `Unsupported connector provider: ${req.provider}`,
      };
    }
    const provider: ConnectorProvider = req.provider;

    if (!this.isValidContext(req.context)) {
      return {
        ok: false,
        action: req.action,
        provider,
        error: "Invalid connector context.",
      };
    }

    let module: {
      oauthService?: unknown;
      syncService?: unknown;
      clientService?: unknown;
    } | null = null;
    try {
      module = await getConnector(provider);
    } catch {
      module = null;
    }

    if (req.action === "status") {
      return this.getStatus(provider, req.context.userId, module?.oauthService);
    }

    if (req.action === "disconnect") {
      return this.disconnect(
        provider,
        req.context.userId,
        module?.oauthService,
      );
    }

    if (!module) {
      return {
        ok: false,
        action: req.action,
        provider,
        error: `Connector provider ${provider} is not registered.`,
      };
    }

    try {
      if (req.action === "connect")
        return await this.connect(provider, module.oauthService, req);
      if (req.action === "sync")
        return await this.sync(provider, module.syncService, req);
      if (req.action === "send")
        return await this.send(
          provider,
          module.clientService,
          module.oauthService,
          req,
        );
      return await this.search(provider, module.clientService, req);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connector action failed";
      return { ok: false, action: req.action, provider, error: message };
    }
  }

  private isValidContext(ctx: ConnectorHandlerContext): boolean {
    return Boolean(
      ctx?.userId?.trim() &&
      ctx?.conversationId?.trim() &&
      ctx?.correlationId?.trim() &&
      ctx?.clientMessageId?.trim(),
    );
  }

  private async getStatus(
    provider: ConnectorProvider,
    userId: string,
    oauthService?: unknown,
  ): Promise<ConnectorHandlerResult> {
    const caps = getConnectorCapabilities(provider);
    const prefix = `${provider}_`;
    const count = await prisma.document.count({
      where: {
        userId,
        filename: { startsWith: prefix },
      },
    });

    const ensured = await this.tokenVault.ensureConnectedAccess(
      userId,
      provider,
      {
        refreshFn: this.getRefreshFn(oauthService),
        oauthService,
      },
    );
    const tokenMeta =
      ensured.info ||
      (await this.tokenVault
        .getProviderConnectionInfo(userId, provider)
        .catch(() => null));

    return {
      ok: true,
      action: "status",
      provider,
      data: {
        provider,
        capabilities: caps,
        connected: ensured.connected,
        reason: ensured.connected ? null : ensured.reason || "not_connected",
        tokenUpdatedAt: tokenMeta?.updatedAt?.toISOString?.() ?? null,
        tokenExpiresAt: tokenMeta?.expiresAt?.toISOString?.() ?? null,
        providerAccountId: tokenMeta?.providerAccountId ?? null,
        indexedDocuments: count,
      },
    };
  }

  private async connect(
    provider: ConnectorProvider,
    oauthService: unknown,
    req: ConnectorHandlerRequest,
  ): Promise<ConnectorHandlerResult> {
    if (!oauthService) {
      return {
        ok: false,
        action: "connect",
        provider,
        error: "OAuth service is not registered.",
      };
    }

    const serviceRecord = oauthService as Record<string, unknown>;
    const callbackUrl = req.callbackUrl || "";
    const state = this.buildState(req.context, provider);
    const candidates = [
      serviceRecord.getAuthorizationUrl,
      serviceRecord.buildAuthorizationUrl,
      serviceRecord.startConnect,
    ];
    const fn = candidates.find(isFn);
    if (!fn) {
      return {
        ok: false,
        action: "connect",
        provider,
        error: "OAuth service does not expose an authorization URL method.",
      };
    }

    const url = await Promise.resolve(
      fn.call(oauthService, {
        userId: req.context.userId,
        callbackUrl,
        state,
        correlationId: req.context.correlationId,
      }),
    );

    if (typeof url !== "string" || url.trim().length === 0) {
      return {
        ok: false,
        action: "connect",
        provider,
        error: "OAuth authorization URL generation failed.",
      };
    }

    return {
      ok: true,
      action: "connect",
      provider,
      data: {
        authorizationUrl: url,
        state,
      },
    };
  }

  private async disconnect(
    provider: ConnectorProvider,
    userId: string,
    oauthService?: unknown,
  ): Promise<ConnectorHandlerResult> {
    let revokeAttempted = false;
    let revoked = false;
    const serviceRecord = oauthService as Record<string, unknown> | undefined;
    const revokeFn =
      (serviceRecord?.revokeAccess as
        | ((arg: string | { userId: string }) => unknown)
        | undefined) ||
      (serviceRecord?.revokeToken as
        | ((arg: string | { userId: string }) => unknown)
        | undefined);

    if (typeof revokeFn === "function") {
      revokeAttempted = true;
      try {
        const out = await Promise.resolve(revokeFn.call(oauthService, userId));
        revoked = out === true;
      } catch {
        revoked = false;
      }
    }

    await this.tokenVault.deleteToken(userId, provider);
    return {
      ok: true,
      action: "disconnect",
      provider,
      data: {
        provider,
        disconnected: true,
        revokeAttempted,
        revoked,
      },
    };
  }

  private async sync(
    provider: ConnectorProvider,
    syncService: unknown,
    req: ConnectorHandlerRequest,
  ): Promise<ConnectorHandlerResult> {
    const connected = await this.ensureConnected(
      provider,
      req.context.userId,
      req,
      true,
    );
    if (!connected.ok) return connected.result;

    const queued = await this.enqueueSync(
      req.context.userId,
      provider,
      req.forceResync === true,
    );
    if (queued.ok) return queued;

    if (!syncService) {
      return {
        ok: false,
        action: "sync",
        provider,
        error:
          "Sync service is not registered and queue enqueue is unavailable.",
      };
    }

    const serviceRecord = syncService as Record<string, unknown>;
    const syncFn = [
      serviceRecord.sync,
      serviceRecord.runSync,
      serviceRecord.syncNow,
    ].find(isFn);
    if (!syncFn) {
      return {
        ok: false,
        action: "sync",
        provider,
        error: "Sync service does not expose a sync method.",
      };
    }

    try {
      const out = await Promise.resolve(
        syncFn.call(syncService, {
          userId: req.context.userId,
          correlationId: req.context.correlationId,
          forceResync: req.forceResync === true,
        }),
      );

      return {
        ok: true,
        action: "sync",
        provider,
        data: {
          mode: "direct",
          ...(this.normalizeSyncMetrics(out) || {}),
          result: out ?? null,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[ConnectorHandler] Direct sync failed for ${provider}: ${msg}`,
      );
      return {
        ok: false,
        action: "sync",
        provider,
        error: `Sync failed: ${msg}`,
      };
    }
  }

  private async enqueueSync(
    userId: string,
    provider: ConnectorProvider,
    forceResync: boolean,
  ): Promise<ConnectorHandlerResult> {
    try {
      const mod = await import("../../../queues/connector.queue");
      const enqueueFn = mod.addConnectorSyncJob ?? mod.enqueueConnectorSync;

      if (!isFn(enqueueFn)) {
        return {
          ok: false,
          action: "sync",
          provider,
          error: "Queue enqueue function not found.",
        };
      }

      const job = await enqueueFn({
        userId,
        provider,
        cursor: null,
        forceResync,
      });

      console.log(
        `[ConnectorHandler] Sync job enqueued for ${provider}: ${job?.id}`,
      );

      return {
        ok: true,
        action: "sync",
        provider,
        data: {
          mode: "queued",
          jobId: job?.id ?? null,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[ConnectorHandler] Queue unavailable for ${provider}, falling back to direct sync: ${msg}`,
      );
      return {
        ok: false,
        action: "sync",
        provider,
        error: "Connector queue unavailable.",
      };
    }
  }

  private async search(
    provider: ConnectorProvider,
    clientService: unknown,
    req: ConnectorHandlerRequest,
  ): Promise<ConnectorHandlerResult> {
    const connected = await this.ensureConnected(
      provider,
      req.context.userId,
      req,
      true,
    );
    if (!connected.ok) return connected.result;

    const q = (req.query || "").trim();
    if (!q)
      return {
        ok: false,
        action: "search",
        provider,
        error: "Search query is required.",
      };
    const take = Math.min(Math.max(req.limit || 10, 1), 50);

    const docs = await prisma.document.findMany({
      where: {
        userId: req.context.userId,
        encryptedFilename: { contains: `/connectors/${provider}/` },
        OR: [
          { filename: { contains: q, mode: "insensitive" } },
          { displayTitle: { contains: q, mode: "insensitive" } },
          { rawText: { contains: q, mode: "insensitive" } },
          { previewText: { contains: q, mode: "insensitive" } },
          {
            metadata: {
              is: {
                extractedText: { contains: q, mode: "insensitive" },
              },
            },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        filename: true,
        displayTitle: true,
        rawText: true,
        previewText: true,
        metadata: { select: { extractedText: true } },
      },
    });

    const hits: ConnectorSearchHit[] = docs.map((doc) => ({
      documentId: doc.id,
      title: doc.displayTitle || doc.filename || "(untitled)",
      snippet: this.buildSnippet(
        doc.rawText ||
          doc.previewText ||
          doc.metadata?.extractedText ||
          doc.displayTitle ||
          doc.filename ||
          "",
        q,
      ),
      source: provider,
    }));

    if (hits.length > 0) {
      return {
        ok: true,
        action: "search",
        provider,
        hits,
        data: {
          count: hits.length,
          source: "indexed_documents",
        },
      };
    }

    const liveHits = await this.withLiveSearchTimeout(
      `${provider} live search`,
      () =>
        this.searchLiveProvider(
          provider,
          clientService,
          connected.accessToken || "",
          q,
          take,
        ),
    ).catch(() => []);

    return {
      ok: true,
      action: "search",
      provider,
      hits: liveHits,
      data: {
        count: liveHits.length,
        source: "provider_live",
      },
    };
  }

  private async send(
    provider: ConnectorProvider,
    clientService: unknown,
    oauthService: unknown,
    req: ConnectorHandlerRequest,
  ): Promise<ConnectorHandlerResult> {
    const caps = getConnectorCapabilities(provider);
    if (!caps.send) {
      return {
        ok: false,
        action: "send",
        provider,
        error: `Provider ${provider} does not support sending.`,
      };
    }

    if (!req.to?.trim()) {
      return {
        ok: false,
        action: "send",
        provider,
        error: "Recipient (to) is required.",
      };
    }

    const ensured = await this.tokenVault.ensureConnectedAccess(
      req.context.userId,
      provider,
      {
        refreshFn: this.getRefreshFn(oauthService),
        oauthService,
      },
    );
    if (!ensured.connected || !ensured.accessToken) {
      return {
        ok: false,
        action: "send",
        provider,
        error: `No active ${provider} connection. Reconnect required.`,
      };
    }

    // Check for send scope
    const scopes = ensured.info?.scopes;
    const scopeList = Array.isArray(scopes)
      ? scopes.join(" ")
      : String(scopes || "");
    const hasSendScope =
      (provider === "gmail" && scopeList.includes("gmail.send")) ||
      (provider === "outlook" && /mail\.send/i.test(scopeList));

    if (!hasSendScope) {
      return {
        ok: false,
        action: "send",
        provider,
        error: `Your ${provider} connection does not have send permissions. Please reconnect to grant send access.`,
      };
    }

    if (!clientService) {
      return {
        ok: false,
        action: "send",
        provider,
        error: "Client service is not registered.",
      };
    }

    const svc = clientService as Record<string, unknown>;
    const sendFn = svc.sendMessage;
    if (typeof sendFn !== "function") {
      return {
        ok: false,
        action: "send",
        provider,
        error: "Client service does not support sendMessage.",
      };
    }

    const accessToken = ensured.accessToken;
    if (!accessToken) {
      return {
        ok: false,
        action: "send",
        provider,
        error: `No active ${provider} connection. Reconnect required.`,
      };
    }

    const resolvedAttachments =
      Array.isArray(req.attachments) && req.attachments.length
        ? req.attachments
        : await this.loadAttachmentsFromDocuments(
            req.context.userId,
            req.attachmentDocumentIds || [],
          );

    const result = await Promise.resolve(
      // Client services have provider-specific param shapes (Outlook attachments are nested, Gmail uses raw MIME).
      // Keep this loosely typed at the boundary.
      (sendFn as (token: string, params: Record<string, unknown>) => unknown).call(
        clientService,
        accessToken,
        {
          to: req.to,
          subject: req.subject || "",
          body: req.body || "",
          cc: req.cc,
          bcc: req.bcc,
          attachments: resolvedAttachments,
        },
      ),
    );

    return {
      ok: true,
      action: "send",
      provider,
      data: { sent: true, result: result ?? null },
    };
  }

  private buildState(
    ctx: ConnectorHandlerContext,
    provider: ConnectorProvider,
  ): string {
    const raw = `${provider}:${ctx.userId}:${ctx.conversationId}:${ctx.clientMessageId}:${ctx.correlationId}:${Date.now()}`;
    return Buffer.from(raw, "utf8").toString("base64url");
  }

  private buildSnippet(rawText: string, query: string): string {
    const fallback = rawText.slice(0, 200);
    const idx = rawText.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return fallback;
    const start = Math.max(0, idx - 80);
    const end = Math.min(rawText.length, idx + query.length + 120);
    return rawText.slice(start, end);
  }

  private async searchLiveProvider(
    provider: ConnectorProvider,
    clientService: unknown,
    accessToken: string,
    query: string,
    take: number,
  ): Promise<ConnectorSearchHit[]> {
    if (!clientService || !accessToken.trim()) return [];

    if (provider === "gmail") {
      const svc = clientService as {
        listMessages?: (token: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
        getMessage?: (token: string, messageId: string) => Promise<Record<string, unknown>>;
      };
      if (typeof svc.listMessages !== "function") return [];

      const list = await svc.listMessages(accessToken, {
        q: query,
        maxResults: take,
        includeSpamTrash: false,
      });
      const msgs = Array.isArray(list?.messages) ? list.messages : [];
      const ids: string[] = msgs
        .map((m: unknown) => String((m as Record<string, unknown>)?.id || "").trim())
        .filter(Boolean)
        .slice(0, take);

      const hits: ConnectorSearchHit[] = [];
      for (const id of ids) {
        let title = id;
        let snippet = "";
        if (typeof svc.getMessage === "function") {
          try {
            const full = await svc.getMessage(accessToken, id);
            title = this.gmailSubjectFromMessage(full) || id;
            snippet = String(full?.snippet || "").trim();
          } catch {
            snippet = "";
          }
        }
        hits.push({
          documentId: `gmail:${id}`,
          title,
          snippet: snippet ? this.buildSnippet(snippet, query) : "",
          source: provider,
          providerMessageId: id,
        });
      }
      return hits;
    }

    if (provider === "outlook") {
      const svc = clientService as {
        listMessages?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        getMessageText?: (message: Record<string, unknown>) => string;
      };
      if (typeof svc.listMessages !== "function") return [];
      const response = await svc.listMessages({
        accessToken,
        top: Math.max(take * 3, 10),
        folder: "Inbox",
      });
      const values = Array.isArray(response?.value) ? response.value : [];
      const needle = query.toLowerCase();
      const filtered = values.filter((item: unknown) => {
        const itemRecord = item as Record<string, unknown>;
        const fromRecord = itemRecord?.from as Record<string, unknown> | undefined;
        const emailAddress = fromRecord?.emailAddress as Record<string, unknown> | undefined;
        const text = [
          String(itemRecord?.subject || ""),
          String(itemRecord?.bodyPreview || ""),
          String(emailAddress?.address || ""),
          String(emailAddress?.name || ""),
          typeof svc.getMessageText === "function"
            ? String(svc.getMessageText(itemRecord as Record<string, unknown>))
            : "",
        ]
          .join(" ")
          .toLowerCase();
        return text.includes(needle);
      });

      return filtered.slice(0, take).map((item: unknown) => {
        const itemRecord = item as Record<string, unknown>;
        const snippetRaw =
          (typeof svc.getMessageText === "function"
            ? svc.getMessageText(itemRecord as Record<string, unknown>)
            : String(itemRecord?.bodyPreview || "")) || "";
        return {
          documentId: `outlook:${String(itemRecord?.id || "")}`,
          title: String(itemRecord?.subject || "(no subject)"),
          snippet: this.buildSnippet(String(snippetRaw || ""), query),
          source: provider,
          providerMessageId: String(itemRecord?.id || ""),
        };
      });
    }

    if (provider === "slack") {
      const svc = clientService as {
        listConversations?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        getConversationHistory?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
        extractMessageText?: (message: Record<string, unknown>) => string;
      };
      if (
        typeof svc.listConversations !== "function" ||
        typeof svc.getConversationHistory !== "function"
      ) {
        return [];
      }

      const list = await svc.listConversations({
        accessToken,
        excludeArchived: true,
        types: ["public_channel", "private_channel", "im", "mpim"],
        limit: 20,
      });
      const channels = Array.isArray(list?.channels) ? list.channels : [];
      const needle = query.toLowerCase();
      const hits: ConnectorSearchHit[] = [];

      for (const channel of channels.slice(0, 8)) {
        const channelId = String(channel?.id || "").trim();
        if (!channelId) continue;
        let history;
        try {
          history = await svc.getConversationHistory({
            accessToken,
            channelId,
            limit: 12,
          });
        } catch {
          continue;
        }
        const messages = Array.isArray(history?.messages) ? history.messages : [];
        for (const message of messages) {
          const text =
            (typeof svc.extractMessageText === "function"
              ? svc.extractMessageText(message)
              : String(message?.text || "")
            ).trim();
          if (!text || !text.toLowerCase().includes(needle)) continue;
          const ts = String(message?.ts || "").trim();
          hits.push({
            documentId: ts ? `slack:${channelId}:${ts}` : `slack:${channelId}`,
            title: channel?.name
              ? `#${String(channel.name)}`
              : `Channel ${channelId}`,
            snippet: this.buildSnippet(text, query),
            source: provider,
            providerChannelId: channelId,
            providerMessageTs: ts || undefined,
          });
          if (hits.length >= take) return hits;
        }
      }
      return hits;
    }

    return [];
  }

  private gmailSubjectFromMessage(message: Record<string, unknown>): string {
    const payload = message?.payload as Record<string, unknown> | undefined;
    const headers = Array.isArray(payload?.headers)
      ? (payload.headers as Array<Record<string, unknown>>)
      : [];
    for (const header of headers) {
      const name = String(header?.name || "").toLowerCase();
      if (name !== "subject") continue;
      return String(header?.value || "").trim();
    }
    return "";
  }

  private async loadAttachmentsFromDocuments(
    userId: string,
    attachmentDocumentIds: string[],
  ): Promise<Array<{ filename: string; mimeType: string; content: Buffer }>> {
    if (!Array.isArray(attachmentDocumentIds) || !attachmentDocumentIds.length) {
      return [];
    }

    const ids = Array.from(
      new Set(
        attachmentDocumentIds
          .filter((id) => typeof id === "string" && id.trim())
          .map((id) => id.trim()),
      ),
    ).slice(0, 6);
    if (!ids.length) return [];

    const docs = await prisma.document.findMany({
      where: {
        userId,
        id: { in: ids },
        parentVersionId: null,
        encryptedFilename: { not: { contains: "/connectors/" } },
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        fileSize: true,
        encryptedFilename: true,
      },
    });

    const byId = new Map(docs.map((doc) => [doc.id, doc]));
    const attachments: Array<{
      filename: string;
      mimeType: string;
      content: Buffer;
    }> = [];
    const maxPerFileBytes = this.resolveAttachmentMaxPerFileBytes();
    const maxTotalBytes = this.resolveAttachmentMaxTotalBytes();
    let totalBytes = 0;

    for (const id of ids) {
      const doc = byId.get(id);
      if (!doc) {
        throw new Error(`Attachment document ${id} was not found for this user.`);
      }
      if (!doc.encryptedFilename) {
        throw new Error(
          `Attachment document ${id} has no storage key and cannot be sent.`,
        );
      }

      const fileSize = Number(doc.fileSize || 0);
      if (Number.isFinite(fileSize) && fileSize > maxPerFileBytes) {
        throw new Error(
          `Attachment "${doc.filename || id}" exceeds the per-file size limit.`,
        );
      }
      if (
        Number.isFinite(fileSize) &&
        fileSize > 0 &&
        totalBytes + fileSize > maxTotalBytes
      ) {
        throw new Error(
          `Attachments exceed the total allowed payload size.`,
        );
      }

      const content = await downloadFile(doc.encryptedFilename);
      if (content.length > maxPerFileBytes) {
        throw new Error(
          `Attachment "${doc.filename || id}" exceeds the per-file size limit.`,
        );
      }
      if (totalBytes + content.length > maxTotalBytes) {
        throw new Error("Attachments exceed the total allowed payload size.");
      }

      totalBytes += content.length;
      attachments.push({
        filename: doc.filename || `${id}.bin`,
        mimeType: doc.mimeType || "application/octet-stream",
        content,
      });
    }

    return attachments;
  }

  private resolveAttachmentMaxPerFileBytes(): number {
    const raw = Number(process.env.CONNECTOR_SEND_ATTACHMENT_MAX_BYTES);
    if (!Number.isFinite(raw) || raw <= 0) return 10 * 1024 * 1024; // 10 MB
    return Math.min(Math.floor(raw), 50 * 1024 * 1024);
  }

  private resolveAttachmentMaxTotalBytes(): number {
    const raw = Number(process.env.CONNECTOR_SEND_ATTACHMENT_MAX_TOTAL_BYTES);
    if (!Number.isFinite(raw) || raw <= 0) return 20 * 1024 * 1024; // 20 MB
    return Math.min(Math.floor(raw), 100 * 1024 * 1024);
  }

  private resolveLiveSearchTimeoutMs(): number {
    const raw = Number(process.env.CONNECTOR_LIVE_SEARCH_TIMEOUT_MS);
    if (!Number.isFinite(raw)) return 8_000;
    const normalized = Math.floor(raw);
    return Math.max(1_000, Math.min(30_000, normalized));
  }

  private async withLiveSearchTimeout<T>(
    label: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const timeoutMs = this.resolveLiveSearchTimeoutMs();
    let timer: ReturnType<typeof setTimeout> | null = null;

    return new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      if (typeof (timer as unknown as Record<string, unknown>)?.unref === "function") {
        (timer as unknown as { unref: () => void }).unref();
      }

      run()
        .then(resolve, reject)
        .finally(() => {
          if (timer) clearTimeout(timer);
          timer = null;
        });
    });
  }

  private getRefreshFn(
    oauthService: unknown,
  ): ((arg: string | { userId: string }) => unknown) | null {
    const svc = oauthService as Record<string, unknown> | undefined;
    const fn =
      (svc?.refreshAccessToken as
        | ((arg: string | { userId: string }) => unknown)
        | undefined) ||
      (svc?.refreshToken as
        | ((arg: string | { userId: string }) => unknown)
        | undefined);
    return typeof fn === "function" ? fn : null;
  }

  private async ensureConnected(
    provider: ConnectorProvider,
    userId: string,
    req: ConnectorHandlerRequest,
    includeInfo = false,
  ): Promise<{
    ok: boolean;
    accessToken?: string | null;
    info?: Record<string, unknown> | null;
    result: ConnectorHandlerResult;
  }> {
    let oauthService: unknown;
    try {
      const module = await getConnector(provider);
      oauthService = module.oauthService;
    } catch {
      oauthService = undefined;
    }

    const ensured = await this.tokenVault.ensureConnectedAccess(
      userId,
      provider,
      {
        refreshFn: this.getRefreshFn(oauthService),
        oauthService,
      },
    );

    if (!ensured.connected || !ensured.accessToken) {
      return {
        ok: false,
        result: {
          ok: false,
          action: req.action,
          provider,
          error: `No active ${provider} connection. Reconnect required.`,
          data: includeInfo
            ? { reason: ensured.reason || "not_connected" }
            : undefined,
        },
      };
    }

    return {
      ok: true,
      accessToken: ensured.accessToken,
      info: (ensured.info as Record<string, unknown> | null) || null,
      result: {
        ok: true,
        action: req.action,
        provider,
      },
    };
  }

  private normalizeSyncMetrics(out: unknown): Record<string, unknown> | null {
    if (!out || typeof out !== "object") return null;
    const record = out as Record<string, unknown>;
    const fetchedCount = Number(record.fetchedCount);
    const ingestedCount = Number(record.ingestedCount);
    const createdCount = Number(record.createdCount);
    const existingCount = Number(record.existingCount);
    const syncedCount = Number(record.syncedCount);

    const metrics: Record<string, unknown> = {};
    if (Number.isFinite(fetchedCount)) metrics.fetchedCount = fetchedCount;
    if (Number.isFinite(ingestedCount)) metrics.ingestedCount = ingestedCount;
    if (Number.isFinite(createdCount)) metrics.createdCount = createdCount;
    if (Number.isFinite(existingCount)) metrics.existingCount = existingCount;
    if (Number.isFinite(syncedCount)) metrics.syncedCount = syncedCount;

    const hasAny = Object.keys(metrics).length > 0;
    return hasAny ? metrics : null;
  }
}
