import { createHmac, randomUUID } from 'crypto';
import { URLSearchParams } from 'url';

import type { ConnectorProvider } from '../connectorsRegistry';
import { TokenVaultService } from '../tokenVault.service';

const PROVIDER: ConnectorProvider = 'slack';
const AUTH_BASE = 'https://slack.com/oauth/v2/authorize';
const TOKEN_BASE = 'https://slack.com/api/oauth.v2.access';
const AUTH_TEST = 'https://slack.com/api/auth.test';

const DEFAULT_SCOPES = [
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'mpim:read',
  'mpim:history',
  'users:read',
  'users:read.email',
];

export interface SlackStartConnectInput {
  userId: string;
  callbackUrl?: string;
  state?: string;
  correlationId?: string;
}

export interface SlackCallbackInput {
  code: string;
  state?: string | null;
  query?: Record<string, unknown>;
}

interface SignedStatePayload {
  v: 1;
  provider: ConnectorProvider;
  userId: string;
  nonce: string;
  iat: number;
  extState?: string;
  redirectUri?: string;
}

interface SlackOauthAccessResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: {
    id?: string;
    name?: string;
  };
  authed_user?: {
    id?: string;
    scope?: string;
    access_token?: string;
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseExtStateUserId(extState: string): string | null {
  try {
    const decoded = Buffer.from(extState, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length >= 2 && parts[0] === 'slack' && parts[1].trim()) {
      return parts[1].trim();
    }
  } catch {
    return null;
  }
  return null;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export class SlackOAuthService {
  private readonly tokenVault: TokenVaultService;

  constructor(opts?: { tokenVault?: TokenVaultService }) {
    this.tokenVault = opts?.tokenVault ?? new TokenVaultService();
  }

  getAuthorizationUrl(input: SlackStartConnectInput): string {
    if (!asString(input.userId)) {
      throw new Error('userId is required to start Slack OAuth.');
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const callbackUrl = this.resolveRedirectUri(input.callbackUrl);

    if (!asString(clientId) || !asString(callbackUrl)) {
      throw new Error('Slack OAuth environment is incomplete.');
    }

    const signedState = this.signState({
      v: 1,
      provider: PROVIDER,
      userId: input.userId,
      nonce: randomUUID(),
      iat: nowSec(),
      extState: input.state,
      redirectUri: callbackUrl as string,
    });

    const params = new URLSearchParams({
      client_id: clientId as string,
      scope: DEFAULT_SCOPES.join(','),
      redirect_uri: callbackUrl as string,
      state: signedState,
      user_scope: '',
    });

    return `${AUTH_BASE}?${params.toString()}`;
  }

  buildAuthorizationUrl(input: SlackStartConnectInput): string {
    return this.getAuthorizationUrl(input);
  }

  startConnect(input: SlackStartConnectInput): string {
    return this.getAuthorizationUrl(input);
  }

  async handleCallback(input: SlackCallbackInput): Promise<Record<string, unknown>> {
    const code = asString(input.code);
    if (!code) throw new Error('Slack callback is missing code.');

    const verified = this.verifyState(asString(input.state) || '');
    const userId = verified?.userId || this.deriveUserIdFromQuery(input.query);
    if (!userId) throw new Error('Unable to resolve userId from Slack OAuth state.');

    const token = await this.exchangeCode({ code, state: input.state, query: input.query });

    const accessToken = asString(token.access_token);
    if (!accessToken) {
      throw new Error('Slack OAuth exchange did not return an access token.');
    }

    const scopes = [token.scope, token.authed_user?.scope]
      .filter((value): value is string => Boolean(asString(value)))
      .flatMap((value) => value.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean));

    // Slack tokens do not always provide explicit expiry. Persist with long TTL.
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const authTest = await this.authTest(accessToken).catch(() => null);

    await this.tokenVault.storeToken(
      userId,
      PROVIDER,
      JSON.stringify({
        accessToken,
        tokenType: token.token_type || 'Bearer',
        providerAccountId: asString(authTest?.user_id) || asString(token.bot_user_id) || undefined,
        metadata: {
          teamId: asString(authTest?.team_id) || asString(token.team?.id) || null,
          teamName: asString(authTest?.team) || asString(token.team?.name) || null,
          appId: asString(token.app_id) || null,
          authedUserId: asString(token.authed_user?.id) || null,
          scopes: Array.from(new Set(scopes)),
          connectedAt: new Date().toISOString(),
        },
      }),
      Array.from(new Set(scopes)),
      expiresAt,
    );

    return {
      provider: PROVIDER,
      connected: true,
      userId,
      expiresAt: expiresAt.toISOString(),
      scopes: Array.from(new Set(scopes)),
      teamId: asString(authTest?.team_id) || asString(token.team?.id) || null,
      teamName: asString(authTest?.team) || asString(token.team?.name) || null,
      extState: verified?.extState ?? null,
    };
  }

  async exchangeCode(input: SlackCallbackInput): Promise<SlackOauthAccessResponse> {
    const code = asString(input.code);
    if (!code) throw new Error('OAuth code is required.');

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = this.resolveRedirectUriFromCallback(input.state);

    if (!asString(clientId) || !asString(clientSecret) || !asString(redirectUri)) {
      throw new Error('Slack OAuth environment is incomplete.');
    }

    const body = new URLSearchParams({
      client_id: clientId as string,
      client_secret: clientSecret as string,
      code,
      redirect_uri: redirectUri as string,
    });

    const response = await fetch(TOKEN_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'Slack token exchange failed');
      throw new Error(`Slack token exchange failed (${response.status}): ${err.slice(0, 240)}`);
    }

    const json = (await response.json()) as SlackOauthAccessResponse;
    if (!json.ok) {
      throw new Error(`Slack token exchange returned error: ${json.error || 'unknown_error'}`);
    }

    return json;
  }

  async refreshAccessToken(userId: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const accessToken = await this.tokenVault.getValidAccessToken(userId, PROVIDER);
    const meta = await this.tokenVault.getProviderTokenMeta(userId, PROVIDER);
    if (!meta) {
      throw new Error('No Slack token metadata found.');
    }

    return { accessToken, expiresAt: meta.expiresAt };
  }

  private async authTest(accessToken: string): Promise<Record<string, unknown>> {
    const response = await fetch(AUTH_TEST, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams().toString(),
    });

    if (!response.ok) {
      throw new Error(`Slack auth.test failed with status ${response.status}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    if (json.ok !== true) {
      throw new Error(`Slack auth.test returned error: ${String(json.error || 'unknown_error')}`);
    }

    return json;
  }

  private deriveUserIdFromQuery(query?: Record<string, unknown>): string | null {
    if (!query) return null;

    const state = asString(query.state);
    if (state) {
      const parsed = this.verifyState(state);
      if (parsed?.userId) return parsed.userId;
      const fallback = parseExtStateUserId(state);
      if (fallback) return fallback;
    }

    return asString(query.userId) || asString(query.uid) || null;
  }

  private resolveRedirectUriFromCallback(state?: string | null): string | null {
    // Prefer the redirectUri we used when creating the auth URL (embedded in signed state).
    const parsed = state ? this.verifyState(state) : null;
    const candidate = asString(parsed?.redirectUri);
    if (candidate && this.isAllowedRedirectOverride(candidate)) return candidate;

    const envUri = asString(process.env.SLACK_REDIRECT_URI);
    if (envUri) return envUri;
    const allowlist = this.getAllowedRedirectUris();
    return allowlist[0] || null;
  }

  private resolveRedirectUri(callbackUrl?: string): string | null {
    const envUri = asString(process.env.SLACK_REDIRECT_URI);
    const candidate = asString(callbackUrl);
    if (!candidate) return envUri || null;

    // Allow overrides only when they are explicitly allowlisted.
    // This supports localhost and VPS callback URLs while keeping redirect_uri server-controlled.
    if (!this.isAllowedRedirectOverride(candidate)) return envUri || null;
    return candidate;
  }

  private getAllowedRedirectUris(): string[] {
    const direct = asString(process.env.SLACK_REDIRECT_URI);
    const csv = asString(process.env.SLACK_REDIRECT_URIS);
    const items = [
      ...(direct ? [direct] : []),
      ...((csv || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)),
    ];
    return Array.from(new Set(items));
  }

  private isAllowedRedirectOverride(candidate: string): boolean {
    try {
      const cand = new URL(candidate);
      if (cand.protocol !== 'http:' && cand.protocol !== 'https:') return false;
      if (cand.pathname !== '/api/integrations/slack/callback') return false;

      const allowlist = this.getAllowedRedirectUris();
      return allowlist.some((raw) => {
        try {
          const u = new URL(raw);
          return u.origin === cand.origin && u.pathname === cand.pathname;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }

  private signState(payload: SignedStatePayload): string {
    const secret = process.env.CONNECTOR_OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY;
    if (!asString(secret)) {
      throw new Error('CONNECTOR_OAUTH_STATE_SECRET (or ENCRYPTION_KEY) is required for Slack OAuth state signing.');
    }

    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret as string).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyState(state: string): SignedStatePayload | null {
    if (!state.includes('.')) {
      const fallbackUserId = parseExtStateUserId(state);
      if (!fallbackUserId) return null;
      return {
        v: 1,
        provider: PROVIDER,
        userId: fallbackUserId,
        nonce: 'external',
        iat: nowSec(),
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
      if (Math.abs(nowSec() - parsed.iat) > 15 * 60) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}

export default SlackOAuthService;
