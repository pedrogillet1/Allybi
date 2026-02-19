import prisma from "../../../config/database";
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
  cc?: string;
  bcc?: string;
  attachments?: Array<{ filename: string; mimeType: string; content: Buffer }>;
}

export interface ConnectorSearchHit {
  documentId: string;
  title: string;
  snippet: string;
  source: ConnectorProvider;
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

    if (req.action === "status") {
      let oauthService: unknown;
      try {
        const module = await getConnector(provider);
        oauthService = module.oauthService;
      } catch {
        /* module not registered; status still works without refresh */
      }
      return this.getStatus(provider, req.context.userId, oauthService);
    }

    if (req.action === "disconnect") {
      return this.disconnect(provider, req.context.userId);
    }

    try {
      const module = await getConnector(provider);
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
      return await this.search(provider, req);
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

    const tokenMeta = await this.tokenVault
      .getProviderConnectionInfo(userId, provider)
      .catch(() => null);

    let connected = Boolean(tokenMeta);
    let expired = false;
    let refreshed = false;

    // Check if token is expired or about to expire (60s safety window, same as tokenVault)
    if (tokenMeta?.expiresAt) {
      const expiresAtMs = new Date(tokenMeta.expiresAt).getTime();
      if (expiresAtMs <= Date.now() + 60_000) {
        expired = true;
        connected = false;

        // Attempt token refresh if oauthService is available
        const svc = oauthService as Record<string, unknown> | undefined;
        const refreshFn = svc?.refreshAccessToken ?? svc?.refreshToken;
        if (typeof refreshFn === "function") {
          try {
            // Connector refresh implementations vary: some take `userId: string`,
            // others take `{ userId }`. Try string first, then object.
            try {
              await Promise.resolve(
                (refreshFn as (arg: unknown) => unknown).call(
                  oauthService,
                  userId,
                ),
              );
            } catch {
              await Promise.resolve(
                (refreshFn as (arg: unknown) => unknown).call(oauthService, {
                  userId,
                }),
              );
            }
            connected = true;
            expired = false;
            refreshed = true;
          } catch {
            // Refresh failed — token stays expired
          }
        }
      }
    }

    return {
      ok: true,
      action: "status",
      provider,
      data: {
        provider,
        capabilities: caps,
        connected,
        expired,
        refreshed,
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
  ): Promise<ConnectorHandlerResult> {
    await this.tokenVault.deleteToken(userId, provider);
    return {
      ok: true,
      action: "disconnect",
      provider,
      data: {
        provider,
        disconnected: true,
      },
    };
  }

  private async sync(
    provider: ConnectorProvider,
    syncService: unknown,
    req: ConnectorHandlerRequest,
  ): Promise<ConnectorHandlerResult> {
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
    req: ConnectorHandlerRequest,
  ): Promise<ConnectorHandlerResult> {
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
        filename: { startsWith: `${provider}_` },
        OR: [
          { filename: { contains: q, mode: "insensitive" } },
          { rawText: { contains: q, mode: "insensitive" } },
          { displayTitle: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        filename: true,
        displayTitle: true,
        rawText: true,
      },
    });

    const hits: ConnectorSearchHit[] = docs.map((doc) => ({
      documentId: doc.id,
      title: doc.displayTitle || doc.filename || "(untitled)",
      snippet: this.buildSnippet(doc.rawText || "", q),
      source: provider,
    }));

    return {
      ok: true,
      action: "search",
      provider,
      hits,
      data: {
        count: hits.length,
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

    // Get the access token for this provider (refresh if expired).
    let tokenPayload = await this.tokenVault
      .getDecryptedPayload(req.context.userId, provider)
      .catch(() => null);
    if (!tokenPayload?.accessToken) {
      return {
        ok: false,
        action: "send",
        provider,
        error: `No active ${provider} connection. Reconnect required.`,
      };
    }

    const meta = await this.tokenVault
      .getProviderTokenMeta(req.context.userId, provider)
      .catch(() => null);
    if (meta?.expiresAt) {
      const expiresAtMs = meta.expiresAt.getTime();
      if (expiresAtMs <= Date.now() + 60_000) {
        const svc = oauthService as Record<string, unknown> | null;
        const refreshFn =
          svc && typeof svc.refreshAccessToken === "function"
            ? (svc.refreshAccessToken as any)
            : null;
        if (refreshFn) {
          try {
            const refreshed = await Promise.resolve(
              refreshFn.call(oauthService, req.context.userId),
            );
            const newAccessToken = (refreshed as any)?.accessToken;
            if (typeof newAccessToken === "string" && newAccessToken.trim()) {
              tokenPayload = { ...tokenPayload, accessToken: newAccessToken };
            } else {
              // Fall back to reading updated payload from vault.
              tokenPayload = await this.tokenVault
                .getDecryptedPayload(req.context.userId, provider)
                .catch(() => tokenPayload);
            }
          } catch {
            // Refresh failed — proceed; API call may fail and return a clearer error.
          }
        }
      }
    }

    // Check for send scope
    const scopeInfo = await this.tokenVault
      .getProviderConnectionInfo(req.context.userId, provider)
      .catch(() => null);
    const scopes = (scopeInfo as Record<string, unknown> | null)?.scopes;
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

    const accessToken = tokenPayload?.accessToken;
    if (!accessToken) {
      return {
        ok: false,
        action: "send",
        provider,
        error: `No active ${provider} connection. Reconnect required.`,
      };
    }

    const result = await Promise.resolve(
      // Client services have provider-specific param shapes (Outlook attachments are nested, Gmail uses raw MIME).
      // Keep this loosely typed at the boundary.
      (sendFn as (token: string, params: any) => unknown).call(
        clientService,
        accessToken,
        {
          to: req.to,
          subject: req.subject || "",
          body: req.body || "",
          cc: req.cc,
          bcc: req.bcc,
          attachments: req.attachments,
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
}
