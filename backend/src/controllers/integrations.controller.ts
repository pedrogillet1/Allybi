import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  ConnectorHandlerService,
  type ConnectorHandlerRequest,
} from "../services/core/handlers/connectorHandler.service";
import {
  getConnector,
  getConnectorCapabilities,
  isConnectorProvider,
  listConnectorProviders,
  validateConnectorEnv,
  type ConnectorProvider,
} from "../services/connectors/connectorsRegistry";
import { verifyEmailSendConfirmationToken } from "../services/connectors/emailSendConfirmation.service";
import { addConnectorSyncJob } from "../queues/connector.queue";
import { logger } from "../utils/logger";
import {
  buildIntegrationErrorRef,
  buildOAuthCompletionPayload,
  clientSafeIntegrationMessage,
  normalizeIntegrationErrorMessage,
  resolveOAuthPostMessageOrigin,
} from "../services/connectors/integrationRuntimePolicy.service";

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ApiOk<T> {
  ok: true;
  data: T;
}

interface ApiFail {
  ok: false;
  error: ApiError;
}

function sendOk<T>(res: Response, data: T, status = 200): Response<ApiOk<T>> {
  return res.status(status).json({ ok: true, data });
}

function sendErr(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): Response<ApiFail> {
  return res.status(status).json({
    ok: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}

function wantsHtml(req: Request): boolean {
  const accept = String(req.headers.accept || "").toLowerCase();
  return accept.includes("text/html");
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsString(value: string): string {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function oauthResultHtml(opts: {
  provider: string;
  ok: boolean;
  title: string;
  detail?: string;
  postMessageOrigin: string | null;
  completionPayload: unknown;
}): string {
  const provider = String(opts.provider || "");
  const title = String(opts.title || "");
  const detail = String(opts.detail || "");
  const providerSafe = escapeHtml(provider);
  const titleSafe = escapeHtml(title);
  const detailSafe = escapeHtml(detail);
  const postMessageOriginJs = escapeJsString(opts.postMessageOrigin || "");
  const completionPayloadJson = JSON.stringify(opts.completionPayload || {})
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const statusColor = opts.ok ? "#16A34A" : "#DC2626";
  const statusText = opts.ok ? "Connected" : "Failed";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #F5F5F5; color: #18181B; }
      .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { width: 100%; max-width: 520px; background: #fff; border: 1px solid #E6E6EC; border-radius: 18px; padding: 18px 18px 16px; box-shadow: 0 18px 40px rgba(0,0,0,0.10); }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; background: rgba(0,0,0,0.04); font-weight: 700; font-size: 12px; color: #3F3F46; }
      .dot { width: 10px; height: 10px; border-radius: 999px; background: ${statusColor}; }
      h1 { font-size: 16px; margin: 14px 0 6px; }
      p { font-size: 13px; margin: 0; color: #52525B; line-height: 1.4; }
      .muted { margin-top: 12px; font-size: 12px; color: #71717A; }
      .btn { margin-top: 14px; display: inline-flex; align-items: center; justify-content: center; height: 38px; padding: 0 14px; border-radius: 12px; border: 1px solid #E6E6EC; background: #fff; cursor: pointer; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="row">
          <div class="badge"><span class="dot"></span>${providerSafe.toUpperCase()} ${statusText}</div>
        </div>
        <h1>${titleSafe}</h1>
        <p>${detailSafe}</p>
        <div class="muted">You can close this window and return to Allybi.</div>
        <button id="close-btn" class="btn">Close</button>
      </div>
    </div>
    <script>
      var closeBtn = document.getElementById('close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          try { window.close(); } catch (e) {}
        });
      }
      var completion = ${completionPayloadJson};
      var targetOrigin = '${postMessageOriginJs}';
      var sent = false;
      try {
        if (targetOrigin && window.opener && !window.opener.closed) {
          window.opener.postMessage(completion, targetOrigin);
          try { window.opener.focus(); } catch (e) {}
          sent = true;
        }
      } catch (e) {}
      // Fallback: write to localStorage so the parent can detect via 'storage' event.
      // This works even when window.opener is null (cross-origin navigation kills it).
      try {
        localStorage.setItem('koda_oauth_complete', JSON.stringify(completion));
      } catch (e) {}
      function closeSelf() {
        try { window.close(); } catch (e) {}
        // Safari/strict environments sometimes need a second strategy.
        try { window.open('', '_self'); window.close(); } catch (e) {}
      }
      // Give postMessage time to be received before auto-closing.
      setTimeout(closeSelf, sent ? 250 : 900);
      setTimeout(closeSelf, 1600);
    </script>
  </body>
</html>`;
}

function sendOauthHtml(
  res: Response,
  statusCode: number,
  html: string,
): Response {
  // OAuth popup callback must be allowed to execute inline completion script
  // and keep window.opener available so the parent can close the popup.
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; img-src 'self' data: https:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(statusCode).type("html").send(html);
  return res as unknown as Response;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function userIdFromReq(req: Request): string | null {
  const typedReq = req as Request & { user?: { id?: string } };
  return asString(typedReq.user?.id);
}

function contextFromReq(
  req: Request,
): ConnectorHandlerRequest["context"] | null {
  const userId = userIdFromReq(req);
  if (!userId) return null;

  const correlationId =
    asString(req.headers["x-correlation-id"]) ||
    asString(
      (req.body as Record<string, unknown> | undefined)?.correlationId,
    ) ||
    randomUUID();

  const clientMessageId =
    asString(req.headers["x-client-message-id"]) ||
    asString(
      (req.body as Record<string, unknown> | undefined)?.clientMessageId,
    ) ||
    randomUUID();

  const conversationId =
    asString(req.headers["x-conversation-id"]) ||
    asString(
      (req.body as Record<string, unknown> | undefined)?.conversationId,
    ) ||
    `integrations:${userId}`;

  return { userId, correlationId, clientMessageId, conversationId };
}

function errorRefFromReq(req: Request): string {
  const correlation =
    asString(req.headers["x-correlation-id"]) ||
    asString(
      (req.body as Record<string, unknown> | undefined)?.correlationId,
    );
  return buildIntegrationErrorRef(correlation);
}

function mapHandlerError(error: string): { code: string; status: number } {
  const e = error.toLowerCase();
  if (e.includes("unsupported connector provider"))
    return { code: "UNSUPPORTED_PROVIDER", status: 400 };
  if (e.includes("oauth") && e.includes("not registered"))
    return { code: "CONNECTOR_NOT_CONFIGURED", status: 503 };
  if (e.includes("not registered"))
    return { code: "CONNECTOR_NOT_REGISTERED", status: 503 };
  if (e.includes("invalid connector context"))
    return { code: "INVALID_CONTEXT", status: 400 };
  if (e.includes("queue unavailable"))
    return { code: "QUEUE_UNAVAILABLE", status: 503 };
  if (
    e.includes("no active") ||
    e.includes("not connected") ||
    e.includes("reconnect") ||
    e.includes("token")
  ) {
    return { code: "CONNECTOR_NOT_CONNECTED", status: 401 };
  }
  if (e.includes("expired") || e.includes("refresh"))
    return { code: "TOKEN_ERROR", status: 401 };
  if (e.includes("not authenticated") || e.includes("unauthorized"))
    return { code: "AUTH_ERROR", status: 401 };
  if (e.includes("timed out")) return { code: "INTEGRATION_TIMEOUT", status: 504 };
  if (e.includes("attachment")) return { code: "ATTACHMENT_INVALID", status: 400 };
  if (e.includes("query is required"))
    return { code: "QUERY_REQUIRED", status: 400 };
  // Server-side failures (API errors, sync failures) should be 500, not 400
  return { code: "INTEGRATION_ERROR", status: 500 };
}

function resolveConnectorHttpTimeoutMs(): number {
  const raw = Number(process.env.CONNECTOR_HTTP_OP_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return 20_000;
  const normalized = Math.floor(raw);
  return Math.max(1_000, Math.min(120_000, normalized));
}

async function withConnectorHttpTimeout<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  const timeoutMs = resolveConnectorHttpTimeoutMs();
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

export class IntegrationsController {
  constructor(
    private readonly connectorHandler: ConnectorHandlerService = new ConnectorHandlerService(),
  ) {}

  startConnect = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(
        res,
        "UNSUPPORTED_PROVIDER",
        "Unsupported connector provider.",
        400,
      );
    }

    const context = contextFromReq(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const callbackUrl =
      asString(req.query.callbackUrl) || asString(req.query.redirectUri);
    const result = await this.connectorHandler.execute({
      action: "connect",
      provider: providerRaw,
      context,
      callbackUrl: callbackUrl || undefined,
    });

    if (!result.ok) {
      const mapped = mapHandlerError(result.error || "integration error");
      const message = clientSafeIntegrationMessage(
        mapped.status,
        "Failed to start connector flow.",
        result.error,
      );
      return sendErr(
        res,
        mapped.code,
        message,
        mapped.status,
      );
    }

    return sendOk(res, {
      provider: providerRaw,
      authorizationUrl: result.data?.authorizationUrl ?? null,
      state: result.data?.state ?? null,
    });
  };

  oauthCallback = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(
        res,
        "UNSUPPORTED_PROVIDER",
        "Unsupported connector provider.",
        400,
      );
    }

    const code = asString(req.query.code);
    const state = asString(req.query.state);
    const postMessageOrigin = resolveOAuthPostMessageOrigin();
    if (!code) {
      if (wantsHtml(req)) {
        return sendOauthHtml(
          res,
          400,
          oauthResultHtml({
            provider: providerRaw,
            ok: false,
            title: "Authorization code missing",
            detail: "Retry connecting from Allybi.",
            postMessageOrigin,
            completionPayload: buildOAuthCompletionPayload(providerRaw, false),
          }),
        );
      }
      return sendErr(
        res,
        "MISSING_OAUTH_CODE",
        "OAuth callback is missing code.",
        400,
      );
    }

    try {
      const connectorModule = await getConnector(
        providerRaw as ConnectorProvider,
      );
      const oauthService = connectorModule.oauthService as
        | Record<string, unknown>
        | undefined;

      if (!oauthService) {
        return sendErr(
          res,
          "CONNECTOR_NOT_CONFIGURED",
          "OAuth service is not configured for this provider.",
          503,
        );
      }

      const exchangeCode = oauthService.exchangeCode;
      const handleCallback = oauthService.handleCallback;
      const finalize = oauthService.finalizeConnect;

      let callbackResult: unknown;
      if (typeof handleCallback === "function") {
        callbackResult = await Promise.resolve(
          (
            handleCallback as (payload: Record<string, unknown>) => unknown
          ).call(oauthService, {
            code,
            state,
            query: req.query,
          }),
        );
      } else if (typeof exchangeCode === "function") {
        callbackResult = await Promise.resolve(
          (exchangeCode as (payload: Record<string, unknown>) => unknown).call(
            oauthService,
            {
              code,
              state,
              query: req.query,
            },
          ),
        );

        if (typeof finalize === "function") {
          callbackResult = await Promise.resolve(
            (finalize as (payload: Record<string, unknown>) => unknown).call(
              oauthService,
              {
                state,
                exchange: callbackResult,
                query: req.query,
              },
            ),
          );
        }
      } else {
        return sendErr(
          res,
          "CONNECTOR_CALLBACK_NOT_IMPLEMENTED",
          "OAuth callback handling is not implemented for this provider.",
          501,
        );
      }

      // Auto-sync: enqueue initial email ingestion after successful OAuth connect
      const callbackUserId = (callbackResult as Record<string, unknown>)
        ?.userId;
      if (typeof callbackUserId === "string" && callbackUserId.trim()) {
        try {
          await addConnectorSyncJob({
            userId: callbackUserId,
            provider: providerRaw as ConnectorProvider,
            cursor: null,
            forceResync: false,
          });
        } catch {
          // Non-fatal — user can manually trigger sync later
        }
      }

      if (wantsHtml(req)) {
        return sendOauthHtml(
          res,
          200,
          oauthResultHtml({
            provider: providerRaw,
            ok: true,
            title: "You are connected",
            detail: "Allybi can now access this connector.",
            postMessageOrigin,
            completionPayload: buildOAuthCompletionPayload(providerRaw, true),
          }),
        );
      }

      return sendOk(res, {
        provider: providerRaw,
        connected: true,
        result: callbackResult ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Connector OAuth callback failed.";
      const mapped = mapHandlerError(message);
      const ref = errorRefFromReq(req);
      logger.error("[Integrations] OAuth callback failed", {
        provider: providerRaw,
        ref,
        error: normalizeIntegrationErrorMessage(error),
        status: mapped.status,
      });
      const clientMessage = clientSafeIntegrationMessage(
        mapped.status,
        "Connector authorization failed.",
        message,
      );
      if (wantsHtml(req)) {
        return sendOauthHtml(
          res,
          mapped.status >= 400 && mapped.status < 600 ? mapped.status : 400,
          oauthResultHtml({
            provider: providerRaw,
            ok: false,
            title: "Connection failed",
            detail: clientMessage,
            postMessageOrigin,
            completionPayload: buildOAuthCompletionPayload(providerRaw, false),
          }),
        );
      }
      return sendErr(res, mapped.code, clientMessage, mapped.status, { ref });
    }
  };

  status = async (req: Request, res: Response): Promise<Response> => {
    const context = contextFromReq(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const providers = listConnectorProviders();
    const providerStatuses = await Promise.all(
      providers.map(async (provider) => {
        try {
          const result = await this.connectorHandler.execute({
            action: "status",
            provider,
            context,
          });

          const env = validateConnectorEnv(provider);
          return {
            provider,
            capabilities: getConnectorCapabilities(provider),
            env,
            ok: result.ok,
            ...(result.ok
              ? {
                  status: {
                    connected: Boolean(result.data?.connected),
                    reason:
                      (result.data?.reason as string | null | undefined) ||
                      null,
                    indexedDocuments:
                      Number(result.data?.indexedDocuments || 0) || 0,
                    providerAccountId:
                      (result.data?.providerAccountId as string | null) || null,
                  },
                }
              : {
                  error: clientSafeIntegrationMessage(
                    mapHandlerError(result.error || "status failed").status,
                    "Status check failed.",
                    result.error,
                  ),
                }),
          };
        } catch (e) {
          // Don't let one provider failure break the entire status response
          const env = validateConnectorEnv(provider);
          const ref = errorRefFromReq(req);
          logger.error("[Integrations] Provider status check failed", {
            provider,
            ref,
            error: normalizeIntegrationErrorMessage(e),
          });
          return {
            provider,
            capabilities: getConnectorCapabilities(provider),
            env,
            ok: false,
            error: "Status check failed.",
            details: { ref },
          };
        }
      }),
    );

    return sendOk(res, { providers: providerStatuses });
  };

  sync = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(
        res,
        "UNSUPPORTED_PROVIDER",
        "Unsupported connector provider.",
        400,
      );
    }

    const context = contextFromReq(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const forceResync = Boolean(
      (req.body as Record<string, unknown> | undefined)?.forceResync,
    );

    let result;
    try {
      result = await this.connectorHandler.execute({
        action: "sync",
        provider: providerRaw,
        context,
        forceResync,
      });
    } catch (e) {
      const ref = errorRefFromReq(req);
      logger.error("[Integrations] Sync execution failed", {
        provider: providerRaw,
        ref,
        error: normalizeIntegrationErrorMessage(e),
      });
      return sendErr(res, "SYNC_FAILED", "Failed to schedule sync.", 500, {
        ref,
      });
    }

    if (!result.ok) {
      const mapped = mapHandlerError(result.error || "sync failed");
      logger.warn("[Integrations] Sync request failed", {
        provider: providerRaw,
        status: mapped.status,
        error: result.error || null,
      });
      return sendErr(
        res,
        mapped.code,
        clientSafeIntegrationMessage(
          mapped.status,
          "Failed to schedule sync.",
          result.error,
        ),
        mapped.status,
      );
    }

    return sendOk(res, {
      provider: providerRaw,
      sync: result.data ?? null,
    });
  };

  search = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(
        res,
        "UNSUPPORTED_PROVIDER",
        "Unsupported connector provider.",
        400,
      );
    }

    const context = contextFromReq(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const query =
      asString(req.query.q) ||
      asString((req.body as Record<string, unknown> | undefined)?.query);
    if (!query)
      return sendErr(res, "QUERY_REQUIRED", "Search query is required.", 400);

    const limitRaw = Number(
      asString(req.query.limit) ||
        (req.body as Record<string, unknown> | undefined)?.limit,
    );
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 50)
      : 10;

    let result;
    try {
      result = await withConnectorHttpTimeout(`${providerRaw} search`, () =>
        this.connectorHandler.execute({
          action: "search",
          provider: providerRaw,
          context,
          query,
          limit,
        }),
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Connector search timed out.";
      const mapped = mapHandlerError(message);
      const ref = errorRefFromReq(req);
      logger.error("[Integrations] Search failed", {
        provider: providerRaw,
        ref,
        status: mapped.status,
        error: normalizeIntegrationErrorMessage(e),
      });
      return sendErr(
        res,
        mapped.code,
        clientSafeIntegrationMessage(
          mapped.status,
          "Connector search failed.",
          message,
        ),
        mapped.status,
        mapped.status >= 500 ? { ref } : undefined,
      );
    }

    if (!result.ok) {
      const mapped = mapHandlerError(result.error || "search failed");
      return sendErr(
        res,
        mapped.code,
        clientSafeIntegrationMessage(
          mapped.status,
          "Connector search failed.",
          result.error,
        ),
        mapped.status,
      );
    }

    return sendOk(res, {
      provider: providerRaw,
      hits: result.hits ?? [],
      total: result.hits?.length ?? 0,
      source: asString(result.data?.source) || null,
    });
  };

  send = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(
        res,
        "UNSUPPORTED_PROVIDER",
        "Unsupported connector provider.",
        400,
      );
    }

    const context = contextFromReq(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const body = (req.body || {}) as Record<string, unknown>;
    const confirmationTokenRaw =
      asString(body.confirmationId) || asString(body.confirmationToken);
    if (!confirmationTokenRaw) {
      return sendErr(
        res,
        "CONFIRMATION_REQUIRED",
        "A valid confirmation token is required to send email.",
        400,
      );
    }

    let confirmed;
    try {
      confirmed = verifyEmailSendConfirmationToken(confirmationTokenRaw);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Invalid confirmation token.";
      return sendErr(res, "INVALID_CONFIRMATION", message, 400);
    }

    if (confirmed.userId !== context.userId) {
      return sendErr(
        res,
        "INVALID_CONFIRMATION_USER",
        "Confirmation token does not belong to this user.",
        403,
      );
    }
    if (confirmed.provider !== providerRaw) {
      return sendErr(
        res,
        "INVALID_CONFIRMATION_PROVIDER",
        "Confirmation token provider does not match the selected provider.",
        400,
      );
    }

    const to = asString(confirmed.to);
    const subject = confirmed.subject || "";
    const emailBody = confirmed.body || "";
    const cc = asString(body.cc) || undefined;
    const bcc = asString(body.bcc) || undefined;

    if (!to)
      return sendErr(
        res,
        "RECIPIENT_REQUIRED",
        "Recipient (to) is required.",
        400,
      );

    let result;
    try {
      result = await withConnectorHttpTimeout(`${providerRaw} send`, () =>
        this.connectorHandler.execute({
          action: "send",
          provider: providerRaw,
          context,
          to,
          subject,
          body: emailBody,
          confirmationId: confirmationTokenRaw,
          cc,
          bcc,
          attachmentDocumentIds: confirmed.attachmentDocumentIds,
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send email.";
      const mapped = mapHandlerError(message);
      const ref = errorRefFromReq(req);
      logger.error("[Integrations] Send failed", {
        provider: providerRaw,
        ref,
        status: mapped.status,
        error: normalizeIntegrationErrorMessage(e),
      });
      return sendErr(
        res,
        mapped.code,
        clientSafeIntegrationMessage(mapped.status, "Failed to send email.", message),
        mapped.status,
        mapped.status >= 500 ? { ref } : undefined,
      );
    }

    if (!result.ok) {
      const mapped = mapHandlerError(result.error || "send failed");
      return sendErr(
        res,
        mapped.code,
        clientSafeIntegrationMessage(
          mapped.status,
          "Failed to send email.",
          result.error,
        ),
        mapped.status,
      );
    }

    return sendOk(res, {
      provider: providerRaw,
      sent: true,
    });
  };

  disconnect = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(
        res,
        "UNSUPPORTED_PROVIDER",
        "Unsupported connector provider.",
        400,
      );
    }

    const context = contextFromReq(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const result = await this.connectorHandler.execute({
      action: "disconnect",
      provider: providerRaw,
      context,
    });

    if (!result.ok) {
      const mapped = mapHandlerError(result.error || "disconnect failed");
      return sendErr(
        res,
        mapped.code,
        clientSafeIntegrationMessage(
          mapped.status,
          "Failed to disconnect provider.",
          result.error,
        ),
        mapped.status,
      );
    }

    return sendOk(res, {
      provider: providerRaw,
      disconnected: true,
      revokeAttempted: Boolean(result.data?.revokeAttempted),
      revoked: Boolean(result.data?.revoked),
    });
  };
}

export function createIntegrationsController(
  handler?: ConnectorHandlerService,
): IntegrationsController {
  return new IntegrationsController(handler ?? new ConnectorHandlerService());
}
