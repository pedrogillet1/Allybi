import { createHmac, randomUUID } from 'crypto';
import { URLSearchParams } from 'url';

import type { ConnectorProvider } from '../connectorsRegistry';
import { TokenVaultService } from '../tokenVault.service';

const PROVIDER: ConnectorProvider = 'outlook';
const AUTH_BASE_COMMON = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_BASE_COMMON = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const DEFAULT_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'User.Read',
  'Mail.Read',
];

export interface OutlookStartConnectInput {
  userId: string;
  callbackUrl?: string;
  state?: string;
  correlationId?: string;
}

export interface OutlookCallbackInput {
  code: string;
  state?: string | null;
  query?: Record<string, unknown>;
}

export interface OutlookTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface SignedStatePayload {
  v: 1;
  provider: ConnectorProvider;
  userId: string;
  nonce: string;
  iat: number;
  extState?: string;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseExtStateUserId(extState: string): string | null {
  try {
    const decoded = Buffer.from(extState, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    // Format from connectorHandler: provider:userId:conversationId:clientMessageId:correlationId:timestamp
    if (parts.length >= 2 && parts[0] === 'outlook' && parts[1].trim()) {
      return parts[1].trim();
    }
  } catch {
    return null;
  }
  return null;
}

function safeNowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function microsoftAuthority(): { authBase: string; tokenBase: string } {
  const tenantId = asString(process.env.MICROSOFT_TENANT_ID);
  if (!tenantId) {
    return { authBase: AUTH_BASE_COMMON, tokenBase: TOKEN_BASE_COMMON };
  }

  // Tenant-specific endpoint fixes AADSTS50194 for single-tenant apps.
  const base = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
  return { authBase: `${base}/authorize`, tokenBase: `${base}/token` };
}

export class OutlookOAuthService {
  private readonly tokenVault: TokenVaultService;

  constructor(opts?: { tokenVault?: TokenVaultService }) {
    this.tokenVault = opts?.tokenVault ?? new TokenVaultService();
  }

  getAuthorizationUrl(input: OutlookStartConnectInput): string {
    if (!asString(input.userId)) {
      throw new Error('userId is required to start Outlook OAuth.');
    }

    // Security invariant: redirect_uri must be server-controlled (env), never caller-supplied.
    const callbackUrl = asString(process.env.MICROSOFT_CALLBACK_URL);
    if (!callbackUrl) {
      throw new Error('MICROSOFT_CALLBACK_URL is not configured.');
    }

    const clientId = asString(process.env.MICROSOFT_CLIENT_ID);
    if (!clientId) {
      throw new Error('MICROSOFT_CLIENT_ID is not configured.');
    }

    const signedState = this.signState({
      v: 1,
      provider: PROVIDER,
      userId: input.userId,
      nonce: randomUUID(),
      iat: safeNowSec(),
      extState: input.state,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: callbackUrl,
      response_mode: 'query',
      scope: DEFAULT_SCOPES.join(' '),
      state: signedState,
      prompt: 'select_account',
    });

    const { authBase } = microsoftAuthority();
    return `${authBase}?${params.toString()}`;
  }

  buildAuthorizationUrl(input: OutlookStartConnectInput): string {
    return this.getAuthorizationUrl(input);
  }

  startConnect(input: OutlookStartConnectInput): string {
    return this.getAuthorizationUrl(input);
  }

  async handleCallback(input: OutlookCallbackInput): Promise<Record<string, unknown>> {
    const code = asString(input.code);
    if (!code) throw new Error('OAuth callback is missing code.');

    const verified = this.verifyState(asString(input.state) || '');
    const userId = verified?.userId || this.deriveUserIdFromQuery(input.query);
    if (!userId) {
      throw new Error('Unable to resolve userId from OAuth state.');
    }

    const token = await this.exchangeCode({ code, state: input.state, query: input.query });
    const scopes = (token.scope || DEFAULT_SCOPES.join(' ')).split(/\s+/).filter(Boolean);
    const expiresAt = new Date(Date.now() + Math.max(60, token.expires_in) * 1000);

    const me = await this.fetchGraphMe(token.access_token).catch(() => null);
    const providerAccountId = asString((me as Record<string, unknown> | null)?.id) || undefined;

    await this.tokenVault.storeToken(
      userId,
      PROVIDER,
      JSON.stringify({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenType: token.token_type || 'Bearer',
        providerAccountId,
        metadata: {
          scope: scopes,
          connectedAt: new Date().toISOString(),
        },
      }),
      scopes,
      expiresAt,
    );

    return {
      provider: PROVIDER,
      connected: true,
      userId,
      expiresAt: expiresAt.toISOString(),
      scopes,
      providerAccountId: providerAccountId ?? null,
      extState: verified?.extState ?? null,
    };
  }

  async exchangeCode(input: OutlookCallbackInput): Promise<OutlookTokenResponse> {
    const code = asString(input.code);
    if (!code) throw new Error('OAuth code is required.');

    const clientId = asString(process.env.MICROSOFT_CLIENT_ID);
    const clientSecret = asString(process.env.MICROSOFT_CLIENT_SECRET);
    const callbackUrl = asString(process.env.MICROSOFT_CALLBACK_URL);

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new Error('Microsoft OAuth environment is incomplete.');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
      code,
    });

    const { tokenBase } = microsoftAuthority();
    const response = await fetch(tokenBase, {
      // NOTE: token endpoint must match the authority used for /authorize.
      // Using tenant-specific endpoint avoids AADSTS50194 for single-tenant apps.
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'OAuth token exchange failed');
      throw new Error(`Outlook token exchange failed (${response.status}): ${err.slice(0, 240)}`);
    }

    const json = (await response.json()) as OutlookTokenResponse;
    if (!asString(json.access_token)) {
      throw new Error('Outlook token exchange response did not include access_token.');
    }

    return json;
  }

  async refreshAccessToken(userId: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const payload = await this.tokenVault.getDecryptedPayload(userId, PROVIDER);
    if (!payload?.refreshToken) {
      throw new Error('No Outlook refresh token available. Reconnect required.');
    }

    const clientId = asString(process.env.MICROSOFT_CLIENT_ID);
    const clientSecret = asString(process.env.MICROSOFT_CLIENT_SECRET);
    if (!clientId || !clientSecret) {
      throw new Error('Microsoft OAuth environment is incomplete.');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: payload.refreshToken,
      scope: DEFAULT_SCOPES.join(' '),
    });

    const { tokenBase } = microsoftAuthority();
    const response = await fetch(tokenBase, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'Token refresh failed');
      throw new Error(`Outlook token refresh failed (${response.status}): ${err.slice(0, 240)}`);
    }

    const json = (await response.json()) as OutlookTokenResponse;
    if (!asString(json.access_token)) {
      throw new Error('Outlook token refresh did not return access_token.');
    }

    const expiresAt = new Date(Date.now() + Math.max(60, json.expires_in) * 1000);
    const scopes = (json.scope || DEFAULT_SCOPES.join(' ')).split(/\s+/).filter(Boolean);

    await this.tokenVault.storeToken(
      userId,
      PROVIDER,
      JSON.stringify({
        accessToken: json.access_token,
        refreshToken: json.refresh_token || payload.refreshToken,
        tokenType: json.token_type || 'Bearer',
        providerAccountId: payload.providerAccountId,
        metadata: payload.metadata,
      }),
      scopes,
      expiresAt,
    );

    return { accessToken: json.access_token, expiresAt };
  }

  private async fetchGraphMe(accessToken: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${GRAPH_BASE}/me?$select=id,userPrincipalName,displayName`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Graph /me failed with status ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private deriveUserIdFromQuery(query?: Record<string, unknown>): string | null {
    if (!query) return null;

    const state = asString(query.state);
    if (state) {
      const parsed = this.verifyState(state);
      if (parsed?.userId) return parsed.userId;
      const ext = parseExtStateUserId(state);
      if (ext) return ext;
    }

    const directUserId = asString(query.userId) || asString(query.uid);
    return directUserId || null;
  }

  private signState(payload: SignedStatePayload): string {
    const secret = process.env.CONNECTOR_OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY;
    if (!asString(secret)) {
      throw new Error('CONNECTOR_OAUTH_STATE_SECRET (or ENCRYPTION_KEY) is required for OAuth state signing.');
    }

    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret as string).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyState(state: string): (SignedStatePayload & { extState?: string }) | null {
    if (!state.includes('.')) {
      const fallbackUserId = parseExtStateUserId(state);
      if (!fallbackUserId) return null;
      return {
        v: 1,
        provider: PROVIDER,
        userId: fallbackUserId,
        nonce: 'external',
        iat: safeNowSec(),
        extState: state,
      };
    }

    const [encoded, signature] = state.split('.', 2);
    if (!encoded || !signature) return null;

    const secret = process.env.CONNECTOR_OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY;
    if (!asString(secret)) return null;

    const expected = createHmac('sha256', secret as string).update(encoded).digest('base64url');
    if (expected !== signature) return null;

    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedStatePayload;
      if (parsed.provider !== PROVIDER || !asString(parsed.userId)) return null;

      // soft TTL: 15 minutes
      if (Math.abs(safeNowSec() - parsed.iat) > 15 * 60) return null;

      return parsed;
    } catch {
      return null;
    }
  }
}

export default OutlookOAuthService;
