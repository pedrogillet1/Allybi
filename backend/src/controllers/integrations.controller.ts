import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  ConnectorHandlerService,
  type ConnectorHandlerRequest,
} from '../services/core/handlers/connectorHandler.service';
import {
  getConnector,
  getConnectorCapabilities,
  isConnectorProvider,
  listConnectorProviders,
  validateConnectorEnv,
  type ConnectorProvider,
} from '../services/connectors/connectorsRegistry';
import { addConnectorSyncJob } from '../queues/connector.queue';
import { TokenVaultService } from '../services/connectors/tokenVault.service';

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

function sendErr(res: Response, code: string, message: string, status = 400, details?: Record<string, unknown>): Response<ApiFail> {
  return res.status(status).json({ ok: false, error: { code, message, ...(details ? { details } : {}) } });
}

function wantsHtml(req: Request): boolean {
  const accept = String(req.headers.accept || '').toLowerCase();
  return accept.includes('text/html');
}

function oauthResultHtml(opts: { provider: string; ok: boolean; title: string; detail?: string }): string {
  const provider = opts.provider;
  const title = opts.title;
  const detail = opts.detail || '';
  const statusColor = opts.ok ? '#16A34A' : '#DC2626';
  const statusText = opts.ok ? 'Connected' : 'Failed';

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
          <div class="badge"><span class="dot"></span>${provider.toUpperCase()} ${statusText}</div>
        </div>
        <h1>${title}</h1>
        <p>${detail}</p>
        <div class="muted">You can close this window and return to Koda.</div>
        <button class="btn" onclick="window.close()">Close</button>
      </div>
    </div>
    <script>
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'koda_oauth_done', provider: '${provider}', ok: ${opts.ok ? 'true' : 'false'} }, '*');
        }
      } catch (e) {}
      setTimeout(() => { try { window.close(); } catch (e) {} }, 250);
    </script>
  </body>
</html>`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function userIdFromReq(req: Request): string | null {
  const typedReq = req as Request & { user?: { id?: string } };
  return asString(typedReq.user?.id);
}

function contextFromReq(req: Request): ConnectorHandlerRequest['context'] | null {
  const userId = userIdFromReq(req);
  if (!userId) return null;

  const correlationId =
    asString(req.headers['x-correlation-id']) ||
    asString((req.body as Record<string, unknown> | undefined)?.correlationId) ||
    randomUUID();

  const clientMessageId =
    asString(req.headers['x-client-message-id']) ||
    asString((req.body as Record<string, unknown> | undefined)?.clientMessageId) ||
    randomUUID();

  const conversationId =
    asString(req.headers['x-conversation-id']) ||
    asString((req.body as Record<string, unknown> | undefined)?.conversationId) ||
    `integrations:${userId}`;

  return { userId, correlationId, clientMessageId, conversationId };
}

function mapHandlerError(error: string): { code: string; status: number } {
  const e = error.toLowerCase();
  if (e.includes('unsupported connector provider')) return { code: 'UNSUPPORTED_PROVIDER', status: 400 };
  if (e.includes('oauth') && e.includes('not registered')) return { code: 'CONNECTOR_NOT_CONFIGURED', status: 503 };
  if (e.includes('not registered')) return { code: 'CONNECTOR_NOT_REGISTERED', status: 503 };
  if (e.includes('invalid connector context')) return { code: 'INVALID_CONTEXT', status: 400 };
  if (e.includes('queue unavailable')) return { code: 'QUEUE_UNAVAILABLE', status: 503 };
  return { code: 'INTEGRATION_ERROR', status: 400 };
}

export class IntegrationsController {
  constructor(private readonly connectorHandler: ConnectorHandlerService = new ConnectorHandlerService()) {}

  startConnect = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(res, 'UNSUPPORTED_PROVIDER', 'Unsupported connector provider.', 400);
    }

    const context = contextFromReq(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const callbackUrl = asString(req.query.callbackUrl) || asString(req.query.redirectUri);
    const result = await this.connectorHandler.execute({
      action: 'connect',
      provider: providerRaw,
      context,
      callbackUrl: callbackUrl || undefined,
    });

    if (!result.ok) {
      const mapped = mapHandlerError(result.error || 'integration error');
      return sendErr(res, mapped.code, result.error || 'Failed to start connector flow.', mapped.status);
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
      return sendErr(res, 'UNSUPPORTED_PROVIDER', 'Unsupported connector provider.', 400);
    }

    const code = asString(req.query.code);
    const state = asString(req.query.state);
    if (!code) {
      if (wantsHtml(req)) {
        res.status(400).type('html').send(
          oauthResultHtml({
            provider: providerRaw,
            ok: false,
            title: 'Authorization code missing',
            detail: 'Retry connecting from Koda.',
          }),
        );
        return res as unknown as Response;
      }
      return sendErr(res, 'MISSING_OAUTH_CODE', 'OAuth callback is missing code.', 400);
    }

    try {
      const connectorModule = await getConnector(providerRaw as ConnectorProvider);
      const oauthService = connectorModule.oauthService as Record<string, unknown> | undefined;

      if (!oauthService) {
        return sendErr(res, 'CONNECTOR_NOT_CONFIGURED', 'OAuth service is not configured for this provider.', 503);
      }

      const exchangeCode = oauthService.exchangeCode;
      const handleCallback = oauthService.handleCallback;
      const finalize = oauthService.finalizeConnect;

      let callbackResult: unknown;
      if (typeof handleCallback === 'function') {
        callbackResult = await Promise.resolve(
          (handleCallback as (payload: Record<string, unknown>) => unknown).call(oauthService, {
            code,
            state,
            query: req.query,
          }),
        );
      } else if (typeof exchangeCode === 'function') {
        callbackResult = await Promise.resolve(
          (exchangeCode as (payload: Record<string, unknown>) => unknown).call(oauthService, {
            code,
            state,
            query: req.query,
          }),
        );

        if (typeof finalize === 'function') {
          callbackResult = await Promise.resolve(
            (finalize as (payload: Record<string, unknown>) => unknown).call(oauthService, {
              state,
              exchange: callbackResult,
              query: req.query,
            }),
          );
        }
      } else {
        return sendErr(res, 'CONNECTOR_CALLBACK_NOT_IMPLEMENTED', 'OAuth callback handling is not implemented for this provider.', 501);
      }

      // Auto-sync: enqueue initial email ingestion after successful OAuth connect
      const callbackUserId = (callbackResult as Record<string, unknown>)?.userId;
      if (typeof callbackUserId === 'string' && callbackUserId.trim()) {
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
        res.status(200).type('html').send(
          oauthResultHtml({
            provider: providerRaw,
            ok: true,
            title: 'You are connected',
            detail: 'Koda can now access this connector.',
          }),
        );
        return res as unknown as Response;
      }

      return sendOk(res, { provider: providerRaw, connected: true, result: callbackResult ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connector OAuth callback failed.';
      const mapped = mapHandlerError(message);
      if (wantsHtml(req)) {
        res.status(mapped.status).type('html').send(
          oauthResultHtml({
            provider: providerRaw,
            ok: false,
            title: 'Connection failed',
            detail: message,
          }),
        );
        return res as unknown as Response;
      }
      return sendErr(res, mapped.code, message, mapped.status);
    }
  };

  status = async (req: Request, res: Response): Promise<Response> => {
    const context = contextFromReq(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const providers = listConnectorProviders();
    const providerStatuses = await Promise.all(
      providers.map(async (provider) => {
        const result = await this.connectorHandler.execute({
          action: 'status',
          provider,
          context,
        });

        const env = validateConnectorEnv(provider);
        return {
          provider,
          capabilities: getConnectorCapabilities(provider),
          env,
          ok: result.ok,
          ...(result.ok ? { status: result.data } : { error: result.error }),
        };
      }),
    );

    return sendOk(res, { providers: providerStatuses });
  };

  sync = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(res, 'UNSUPPORTED_PROVIDER', 'Unsupported connector provider.', 400);
    }

    const context = contextFromReq(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const forceResync = Boolean((req.body as Record<string, unknown> | undefined)?.forceResync);
    const result = await this.connectorHandler.execute({
      action: 'sync',
      provider: providerRaw,
      context,
      forceResync,
    });

    if (!result.ok) {
      const mapped = mapHandlerError(result.error || 'sync failed');
      return sendErr(res, mapped.code, result.error || 'Failed to schedule sync.', mapped.status);
    }

    return sendOk(res, {
      provider: providerRaw,
      sync: result.data ?? null,
    });
  };

  search = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(res, 'UNSUPPORTED_PROVIDER', 'Unsupported connector provider.', 400);
    }

    const context = contextFromReq(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const query = asString(req.query.q) || asString((req.body as Record<string, unknown> | undefined)?.query);
    if (!query) return sendErr(res, 'QUERY_REQUIRED', 'Search query is required.', 400);

    const limitRaw = Number(asString(req.query.limit) || (req.body as Record<string, unknown> | undefined)?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 10;

    const result = await this.connectorHandler.execute({
      action: 'search',
      provider: providerRaw,
      context,
      query,
      limit,
    });

    if (!result.ok) {
      const mapped = mapHandlerError(result.error || 'search failed');
      return sendErr(res, mapped.code, result.error || 'Connector search failed.', mapped.status);
    }

    return sendOk(res, {
      provider: providerRaw,
      hits: result.hits ?? [],
      total: result.hits?.length ?? 0,
    });
  };

  disconnect = async (req: Request, res: Response): Promise<Response> => {
    const providerRaw = asString(req.params.provider);
    if (!providerRaw || !isConnectorProvider(providerRaw)) {
      return sendErr(res, 'UNSUPPORTED_PROVIDER', 'Unsupported connector provider.', 400);
    }

    const context = contextFromReq(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    try {
      const vault = new TokenVaultService();
      await vault.deleteToken(context.userId, providerRaw as ConnectorProvider);
      return sendOk(res, { provider: providerRaw, disconnected: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to disconnect provider.';
      return sendErr(res, 'DISCONNECT_FAILED', message, 500);
    }
  };
}

export function createIntegrationsController(handler?: ConnectorHandlerService): IntegrationsController {
  return new IntegrationsController(handler ?? new ConnectorHandlerService());
}
