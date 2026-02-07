import * as crypto from 'crypto';
import { google, gmail_v1 } from 'googleapis';

import type { ConnectorProvider } from '../connectorsRegistry';
import { TokenVaultService } from '../tokenVault.service';

export interface GmailOAuthContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface GmailAuthUrlInput {
  userId: string;
  redirectAfter?: string;
}

export interface GmailAuthUrlResult {
  url: string;
  state: string;
}

export interface GmailOAuthExchangeInput {
  userId: string;
  code: string;
  state?: string;
}

export interface GmailOAuthExchangeResult {
  provider: ConnectorProvider;
  connected: true;
  gmailAddress?: string;
  historyId?: string;
  expiresAt: Date;
  scopes: string[];
}

export class GmailOAuthError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'GmailOAuthError';
    this.code = code;
  }
}

interface SignedStatePayload {
  userId: string;
  provider: 'gmail';
  issuedAt: number;
  redirectAfter?: string;
}

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

function resolveOAuthConfig(): { clientId: string; clientSecret: string; callbackUrl: string } {
  // Prefer dedicated Gmail connector creds if provided (recommended, due to sensitive Gmail scopes).
  const clientId = (process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const callbackUrl = (process.env.GOOGLE_GMAIL_CALLBACK_URL || process.env.GOOGLE_CALLBACK_URL || '').trim();

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new GmailOAuthError(
      'Missing GOOGLE_GMAIL_CLIENT_ID/SECRET/CALLBACK_URL (or GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL) for Gmail OAuth.',
      'GMAIL_OAUTH_ENV_MISSING',
    );
  }

  return { clientId, clientSecret, callbackUrl };
}

function resolveStateSigningKey(): Buffer {
  const base64 = process.env.KODA_MASTER_KEY_BASE64;
  if (base64) {
    const decoded = Buffer.from(base64, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  }

  const fallback = process.env.ENCRYPTION_KEY;
  if (!fallback?.trim()) {
    throw new GmailOAuthError('Missing state signing key (KODA_MASTER_KEY_BASE64 or ENCRYPTION_KEY).', 'STATE_KEY_MISSING');
  }

  return crypto.createHash('sha256').update(fallback).digest();
}

function signState(payload: SignedStatePayload): string {
  const key = resolveStateSigningKey();
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', key).update(payloadEncoded).digest();
  const sigEncoded = base64UrlEncode(sig);
  return `${payloadEncoded}.${sigEncoded}`;
}

function verifyState(state: string, expectedUserId: string): SignedStatePayload {
  const [payloadEncoded, sigEncoded] = state.split('.');
  if (!payloadEncoded || !sigEncoded) {
    throw new GmailOAuthError('Invalid OAuth state format.', 'STATE_INVALID_FORMAT');
  }

  const key = resolveStateSigningKey();
  const expectedSig = crypto.createHmac('sha256', key).update(payloadEncoded).digest();
  const providedSig = base64UrlDecode(sigEncoded);

  if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(providedSig, expectedSig)) {
    throw new GmailOAuthError('OAuth state signature mismatch.', 'STATE_SIGNATURE_MISMATCH');
  }

  let payload: SignedStatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEncoded).toString('utf8')) as SignedStatePayload;
  } catch {
    throw new GmailOAuthError('OAuth state payload is invalid JSON.', 'STATE_INVALID_PAYLOAD');
  }

  if (payload.provider !== 'gmail') {
    throw new GmailOAuthError('OAuth state provider mismatch.', 'STATE_PROVIDER_MISMATCH');
  }

  if (payload.userId !== expectedUserId) {
    throw new GmailOAuthError('OAuth state user mismatch.', 'STATE_USER_MISMATCH');
  }

  if (!Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > DEFAULT_STATE_TTL_MS) {
    throw new GmailOAuthError('OAuth state expired. Retry connect flow.', 'STATE_EXPIRED');
  }

  return payload;
}

function verifyStateWithoutExpectedUser(state: string): SignedStatePayload {
  const [payloadEncoded, sigEncoded] = state.split('.');
  if (!payloadEncoded || !sigEncoded) {
    throw new GmailOAuthError('Invalid OAuth state format.', 'STATE_INVALID_FORMAT');
  }

  const key = resolveStateSigningKey();
  const expectedSig = crypto.createHmac('sha256', key).update(payloadEncoded).digest();
  const providedSig = base64UrlDecode(sigEncoded);

  if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(providedSig, expectedSig)) {
    throw new GmailOAuthError('OAuth state signature mismatch.', 'STATE_SIGNATURE_MISMATCH');
  }

  let payload: SignedStatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEncoded).toString('utf8')) as SignedStatePayload;
  } catch {
    throw new GmailOAuthError('OAuth state payload is invalid JSON.', 'STATE_INVALID_PAYLOAD');
  }

  if (payload.provider !== 'gmail') {
    throw new GmailOAuthError('OAuth state provider mismatch.', 'STATE_PROVIDER_MISMATCH');
  }

  if (!Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > DEFAULT_STATE_TTL_MS) {
    throw new GmailOAuthError('OAuth state expired. Retry connect flow.', 'STATE_EXPIRED');
  }

  return payload;
}

/**
 * Gmail OAuth service: builds auth URL, exchanges callback code, stores encrypted token payload.
 */
export class GmailOAuthService {
  private readonly tokenVault: TokenVaultService;

  constructor(tokenVault: TokenVaultService = new TokenVaultService()) {
    this.tokenVault = tokenVault;
  }

  createAuthUrl(input: GmailAuthUrlInput): GmailAuthUrlResult {
    const userId = input.userId.trim();
    if (!userId) {
      throw new GmailOAuthError('userId is required to start Gmail OAuth.', 'INVALID_USER_ID');
    }

    const config = resolveOAuthConfig();
    const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, config.callbackUrl);

    const statePayload: SignedStatePayload = {
      userId,
      provider: 'gmail',
      issuedAt: Date.now(),
      redirectAfter: input.redirectAfter?.trim() || undefined,
    };

    const state = signState(statePayload);

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [...GMAIL_SCOPES],
      include_granted_scopes: true,
      state,
    });

    return { url, state };
  }

  /**
   * ConnectorHandler-compatible alias.
   * Returns only URL because handler provides state separately.
   */
  getAuthorizationUrl(input: {
    userId: string;
    callbackUrl?: string;
    state?: string;
    correlationId?: string;
  }): string {
    const result = this.createAuthUrl({
      userId: input.userId,
      redirectAfter: undefined,
    });

    // Respect externally-provided state when available (handler-generated).
    if (input.state?.trim()) {
      const config = resolveOAuthConfig();
      const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, config.callbackUrl);
      return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [...GMAIL_SCOPES],
        include_granted_scopes: true,
        state: input.state.trim(),
      });
    }

    return result.url;
  }

  /**
   * ConnectorHandler-compatible alias.
   */
  startConnect(input: {
    userId: string;
    callbackUrl?: string;
    state?: string;
    correlationId?: string;
  }): string {
    return this.getAuthorizationUrl(input);
  }

  async exchangeCodeAndStoreToken(
    input: GmailOAuthExchangeInput,
    _ctx?: GmailOAuthContext,
  ): Promise<GmailOAuthExchangeResult> {
    const userId = input.userId.trim();
    const code = input.code.trim();

    if (!userId || !code) {
      throw new GmailOAuthError('userId and code are required for Gmail OAuth callback.', 'INVALID_EXCHANGE_INPUT');
    }

    if (input.state?.trim()) {
      verifyState(input.state.trim(), userId);
    }

    const config = resolveOAuthConfig();
    const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, config.callbackUrl);

    const tokenResponse = await oauth2Client.getToken(code);
    const tokens = tokenResponse.tokens;

    if (!tokens.access_token) {
      throw new GmailOAuthError('Google callback did not return an access token.', 'ACCESS_TOKEN_MISSING');
    }

    oauth2Client.setCredentials(tokens);

    let profile: gmail_v1.Schema$Profile | undefined;
    try {
      const gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
      const profileResponse = await gmailClient.users.getProfile({ userId: 'me' });
      profile = profileResponse.data;
    } catch {
      profile = undefined;
    }

    const now = Date.now();
    const expiresAt = new Date(tokens.expiry_date ?? now + 3600 * 1000);
    const scopes = (tokens.scope?.split(/\s+/).filter(Boolean) ?? [...GMAIL_SCOPES]).sort();

    const tokenPayload = JSON.stringify({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      providerAccountId: profile?.emailAddress,
      metadata: {
        scope: tokens.scope,
        idTokenPresent: Boolean(tokens.id_token),
        historyId: profile?.historyId,
      },
    });

    await this.tokenVault.storeToken(userId, 'gmail', tokenPayload, scopes, expiresAt);

    return {
      provider: 'gmail',
      connected: true,
      gmailAddress: profile?.emailAddress ?? undefined,
      historyId: profile?.historyId ?? undefined,
      expiresAt,
      scopes,
    };
  }

  async refreshAccessToken(userId: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const payload = await this.tokenVault.getDecryptedPayload(userId, 'gmail');
    if (!payload?.refreshToken) {
      throw new GmailOAuthError('No Gmail refresh token available. Reconnect required.', 'REFRESH_TOKEN_MISSING');
    }

    const config = resolveOAuthConfig();
    const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, config.callbackUrl);
    oauth2Client.setCredentials({ refresh_token: payload.refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new GmailOAuthError('Gmail token refresh did not return access_token.', 'REFRESH_FAILED');
    }

    const expiresAt = new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000);
    const scopes = (credentials.scope?.split(/\s+/).filter(Boolean) ?? [...GMAIL_SCOPES]).sort();

    await this.tokenVault.storeToken(
      userId,
      'gmail',
      JSON.stringify({
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || payload.refreshToken,
        tokenType: credentials.token_type || 'Bearer',
        providerAccountId: payload.providerAccountId,
        metadata: payload.metadata,
      }),
      scopes,
      expiresAt,
    );

    return { accessToken: credentials.access_token, expiresAt };
  }

  async handleCallback(input: { code?: string; state?: string | null; query?: Record<string, unknown> }) {
    const state = input.state?.trim() || '';
    if (!state) {
      throw new GmailOAuthError('OAuth callback missing state.', 'STATE_REQUIRED');
    }

    const verified = verifyStateWithoutExpectedUser(state);
    const code = input.code?.trim();
    if (!code) {
      throw new GmailOAuthError('OAuth callback missing code.', 'CODE_REQUIRED');
    }

    const result = await this.exchangeCodeAndStoreToken({
      userId: verified.userId,
      code,
      state,
    });

    return {
      ...result,
      userId: verified.userId,
      redirectAfter: verified.redirectAfter ?? null,
    };
  }

}

export default GmailOAuthService;
