import * as crypto from "crypto";
import { URLSearchParams } from "url";
import { google, gmail_v1 } from "googleapis";

import type { ConnectorProvider } from "../connectorsRegistry";
import { markOAuthStateNonceUsedDurable } from "../oauthStateNonceStore.service";
import { TokenVaultService } from "../tokenVault.service";

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
  callbackUrlOverride?: string;
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
    this.name = "GmailOAuthError";
    this.code = code;
  }
}

interface SignedStatePayload {
  userId: string;
  provider: "gmail";
  issuedAt: number;
  iat: number;
  nonce: string;
  redirectAfter?: string;
  extState?: string;
  callbackUrl?: string;
}

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

function getAllowedGmailCallbackUrls(): string[] {
  const primary = (process.env.GOOGLE_GMAIL_CALLBACK_URL || "").trim();
  const csv = (process.env.GOOGLE_GMAIL_CALLBACK_URLS || "").trim();
  const items = [
    ...(primary ? [primary] : []),
    ...csv
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ];
  return Array.from(new Set(items));
}

function isAllowedGmailCallbackUrl(candidate?: string | null): boolean {
  const raw = typeof candidate === "string" ? candidate.trim() : "";
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.pathname !== "/api/integrations/gmail/callback") return false;

    if (
      process.env.NODE_ENV === "development" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return true;
    }

    const allowlist = getAllowedGmailCallbackUrls();
    return allowlist.some((allowedRaw) => {
      try {
        const allowed = new URL(allowedRaw);
        return (
          allowed.origin === url.origin && allowed.pathname === url.pathname
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function pickDefaultAllowedGmailCallbackUrl(): string | null {
  const allowlist = getAllowedGmailCallbackUrls();
  for (const candidate of allowlist) {
    if (isAllowedGmailCallbackUrl(candidate)) return candidate;
  }
  return null;
}

function resolveOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
} {
  // Prefer dedicated Gmail connector creds if provided (recommended, due to sensitive Gmail scopes).
  const clientId = (
    process.env.GOOGLE_GMAIL_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    ""
  ).trim();
  const clientSecret = (
    process.env.GOOGLE_GMAIL_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    ""
  ).trim();
  const callbackUrlRaw = (
    process.env.GOOGLE_GMAIL_CALLBACK_URL ||
    process.env.GOOGLE_CALLBACK_URL ||
    ""
  ).trim();

  if (!clientId || !clientSecret || !callbackUrlRaw) {
    throw new GmailOAuthError(
      "Missing GOOGLE_GMAIL_CLIENT_ID/SECRET/CALLBACK_URL (or GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL) for Gmail OAuth.",
      "GMAIL_OAUTH_ENV_MISSING",
    );
  }

  if (isAllowedGmailCallbackUrl(callbackUrlRaw)) {
    return { clientId, clientSecret, callbackUrl: callbackUrlRaw };
  }

  const fallback = pickDefaultAllowedGmailCallbackUrl();
  if (fallback) {
    return { clientId, clientSecret, callbackUrl: fallback };
  }

  throw new GmailOAuthError(
    "Invalid Gmail callback URL. Set GOOGLE_GMAIL_CALLBACK_URL (or *_URLS) to /api/integrations/gmail/callback.",
    "GMAIL_OAUTH_CALLBACK_INVALID",
  );
}

function resolveCallbackUrlOverride(candidate?: string | null): string | null {
  const raw = typeof candidate === "string" ? candidate.trim() : "";
  if (!raw) return null;
  return isAllowedGmailCallbackUrl(raw) ? raw : null;
}

function resolveStateSigningKey(): Buffer {
  const base64 = process.env.KODA_MASTER_KEY_BASE64;
  if (base64) {
    const decoded = Buffer.from(base64, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  }

  const fallback = process.env.ENCRYPTION_KEY;
  if (!fallback?.trim()) {
    throw new GmailOAuthError(
      "Missing state signing key (KODA_MASTER_KEY_BASE64 or ENCRYPTION_KEY).",
      "STATE_KEY_MISSING",
    );
  }

  return crypto.createHash("sha256").update(fallback).digest();
}

function resolveIssuedAtMs(payload: SignedStatePayload): number {
  if (Number.isFinite(payload.issuedAt)) return payload.issuedAt;
  if (Number.isFinite(payload.iat)) return payload.iat * 1000;
  return Number.NaN;
}

function resolveIssuedAtSec(payload: SignedStatePayload): number {
  if (Number.isFinite(payload.iat)) return Math.floor(payload.iat);
  if (Number.isFinite(payload.issuedAt)) {
    return Math.floor(payload.issuedAt / 1000);
  }
  return Number.NaN;
}

function signState(payload: SignedStatePayload): string {
  const key = resolveStateSigningKey();
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", key).update(payloadEncoded).digest();
  const sigEncoded = base64UrlEncode(sig);
  return `${payloadEncoded}.${sigEncoded}`;
}

function verifyState(
  state: string,
  expectedUserId: string,
): SignedStatePayload {
  const [payloadEncoded, sigEncoded] = state.split(".");
  if (!payloadEncoded || !sigEncoded) {
    throw new GmailOAuthError(
      "Invalid OAuth state format.",
      "STATE_INVALID_FORMAT",
    );
  }

  const key = resolveStateSigningKey();
  const expectedSig = crypto
    .createHmac("sha256", key)
    .update(payloadEncoded)
    .digest();
  const providedSig = base64UrlDecode(sigEncoded);

  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    throw new GmailOAuthError(
      "OAuth state signature mismatch.",
      "STATE_SIGNATURE_MISMATCH",
    );
  }

  let payload: SignedStatePayload;
  try {
    payload = JSON.parse(
      base64UrlDecode(payloadEncoded).toString("utf8"),
    ) as SignedStatePayload;
  } catch {
    throw new GmailOAuthError(
      "OAuth state payload is invalid JSON.",
      "STATE_INVALID_PAYLOAD",
    );
  }

  if (payload.provider !== "gmail") {
    throw new GmailOAuthError(
      "OAuth state provider mismatch.",
      "STATE_PROVIDER_MISMATCH",
    );
  }

  if (payload.userId !== expectedUserId) {
    throw new GmailOAuthError(
      "OAuth state user mismatch.",
      "STATE_USER_MISMATCH",
    );
  }

  const issuedAtMs = resolveIssuedAtMs(payload);
  if (!Number.isFinite(issuedAtMs) || Date.now() - issuedAtMs > DEFAULT_STATE_TTL_MS) {
    throw new GmailOAuthError(
      "OAuth state expired. Retry connect flow.",
      "STATE_EXPIRED",
    );
  }
  if (!payload.nonce?.trim()) {
    throw new GmailOAuthError(
      "OAuth state nonce is missing.",
      "STATE_NONCE_MISSING",
    );
  }
  if (!Number.isFinite(resolveIssuedAtSec(payload))) {
    throw new GmailOAuthError(
      "OAuth state timing is invalid.",
      "STATE_INVALID_TIMING",
    );
  }

  return payload;
}

function verifyStateWithoutExpectedUser(state: string): SignedStatePayload {
  const [payloadEncoded, sigEncoded] = state.split(".");
  if (!payloadEncoded || !sigEncoded) {
    throw new GmailOAuthError(
      "Invalid OAuth state format.",
      "STATE_INVALID_FORMAT",
    );
  }

  const key = resolveStateSigningKey();
  const expectedSig = crypto
    .createHmac("sha256", key)
    .update(payloadEncoded)
    .digest();
  const providedSig = base64UrlDecode(sigEncoded);

  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    throw new GmailOAuthError(
      "OAuth state signature mismatch.",
      "STATE_SIGNATURE_MISMATCH",
    );
  }

  let payload: SignedStatePayload;
  try {
    payload = JSON.parse(
      base64UrlDecode(payloadEncoded).toString("utf8"),
    ) as SignedStatePayload;
  } catch {
    throw new GmailOAuthError(
      "OAuth state payload is invalid JSON.",
      "STATE_INVALID_PAYLOAD",
    );
  }

  if (payload.provider !== "gmail") {
    throw new GmailOAuthError(
      "OAuth state provider mismatch.",
      "STATE_PROVIDER_MISMATCH",
    );
  }

  const issuedAtMs = resolveIssuedAtMs(payload);
  if (!Number.isFinite(issuedAtMs) || Date.now() - issuedAtMs > DEFAULT_STATE_TTL_MS) {
    throw new GmailOAuthError(
      "OAuth state expired. Retry connect flow.",
      "STATE_EXPIRED",
    );
  }
  if (!payload.nonce?.trim()) {
    throw new GmailOAuthError(
      "OAuth state nonce is missing.",
      "STATE_NONCE_MISSING",
    );
  }
  if (!Number.isFinite(resolveIssuedAtSec(payload))) {
    throw new GmailOAuthError(
      "OAuth state timing is invalid.",
      "STATE_INVALID_TIMING",
    );
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

  private async consumeStateNonce(payload: SignedStatePayload): Promise<void> {
    const issuedAtSec = resolveIssuedAtSec(payload);
    const ok = await markOAuthStateNonceUsedDurable(
      "gmail",
      payload.userId,
      payload.nonce,
      issuedAtSec,
    );
    if (!ok) {
      throw new GmailOAuthError(
        "OAuth state was already used. Retry connect flow.",
        "STATE_REPLAY_DETECTED",
      );
    }
  }

  createAuthUrl(input: GmailAuthUrlInput): GmailAuthUrlResult {
    const userId = input.userId.trim();
    if (!userId) {
      throw new GmailOAuthError(
        "userId is required to start Gmail OAuth.",
        "INVALID_USER_ID",
      );
    }

    const config = resolveOAuthConfig();
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.callbackUrl,
    );

    const statePayload: SignedStatePayload = {
      userId,
      provider: "gmail",
      issuedAt: Date.now(),
      iat: Math.floor(Date.now() / 1000),
      nonce: crypto.randomUUID(),
      redirectAfter: input.redirectAfter?.trim() || undefined,
    };

    const state = signState(statePayload);

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
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
    const userId = input.userId.trim();
    if (!userId) {
      throw new GmailOAuthError(
        "userId is required to start Gmail OAuth.",
        "INVALID_USER_ID",
      );
    }

    const config = resolveOAuthConfig();
    const callbackUrl =
      resolveCallbackUrlOverride(input.callbackUrl) || config.callbackUrl;
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      callbackUrl,
    );

    // Always use a signed state that we can verify on callback.
    // Preserve handler-provided state (if any) as extState (opaque).
    const state = signState({
      userId,
      provider: "gmail",
      issuedAt: Date.now(),
      iat: Math.floor(Date.now() / 1000),
      nonce: crypto.randomUUID(),
      extState: input.state?.trim() || undefined,
      callbackUrl,
    });

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [...GMAIL_SCOPES],
      include_granted_scopes: true,
      state,
    });
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
      throw new GmailOAuthError(
        "userId and code are required for Gmail OAuth callback.",
        "INVALID_EXCHANGE_INPUT",
      );
    }

    const config = resolveOAuthConfig();
    let redirectUri = config.callbackUrl;
    if (input.callbackUrlOverride?.trim()) {
      redirectUri =
        resolveCallbackUrlOverride(input.callbackUrlOverride) || redirectUri;
    }

    if (input.state?.trim()) {
      const verified = verifyState(input.state.trim(), userId);
      await this.consumeStateNonce(verified);
      redirectUri =
        resolveCallbackUrlOverride(verified.callbackUrl) || redirectUri;
    }

    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      redirectUri,
    );

    const tokenResponse = await oauth2Client.getToken(code);
    const tokens = tokenResponse.tokens;

    if (!tokens.access_token) {
      throw new GmailOAuthError(
        "Google callback did not return an access token.",
        "ACCESS_TOKEN_MISSING",
      );
    }

    // Google only returns refresh_token on the first consent (or if you force prompt=consent).
    // Preserve the existing refresh token so users don't need to re-auth every time.
    const existing = await this.tokenVault
      .getDecryptedPayload(userId, "gmail")
      .catch(() => null);
    const refreshToken = tokens.refresh_token || existing?.refreshToken;

    oauth2Client.setCredentials(tokens);

    let profile: gmail_v1.Schema$Profile | undefined;
    try {
      const gmailClient = google.gmail({ version: "v1", auth: oauth2Client });
      const profileResponse = await gmailClient.users.getProfile({
        userId: "me",
      });
      profile = profileResponse.data;
    } catch {
      profile = undefined;
    }

    const now = Date.now();
    const expiresAt = new Date(tokens.expiry_date ?? now + 3600 * 1000);
    const scopes = (
      tokens.scope?.split(/\s+/).filter(Boolean) ?? [...GMAIL_SCOPES]
    ).sort();

    const tokenPayload = JSON.stringify({
      accessToken: tokens.access_token,
      refreshToken,
      tokenType: tokens.token_type,
      providerAccountId: profile?.emailAddress,
      metadata: {
        scope: tokens.scope,
        idTokenPresent: Boolean(tokens.id_token),
        historyId: profile?.historyId,
      },
    });

    await this.tokenVault.storeToken(
      userId,
      "gmail",
      tokenPayload,
      scopes,
      expiresAt,
    );

    return {
      provider: "gmail",
      connected: true,
      gmailAddress: profile?.emailAddress ?? undefined,
      historyId: profile?.historyId ?? undefined,
      expiresAt,
      scopes,
    };
  }

  async refreshAccessToken(
    userId: string,
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const payload = await this.tokenVault.getDecryptedPayload(userId, "gmail");
    if (!payload?.refreshToken) {
      throw new GmailOAuthError(
        "No Gmail refresh token available. Reconnect required.",
        "REFRESH_TOKEN_MISSING",
      );
    }

    const config = resolveOAuthConfig();
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.callbackUrl,
    );
    oauth2Client.setCredentials({ refresh_token: payload.refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new GmailOAuthError(
        "Gmail token refresh did not return access_token.",
        "REFRESH_FAILED",
      );
    }

    const expiresAt = new Date(
      credentials.expiry_date ?? Date.now() + 3600 * 1000,
    );
    const scopes = (
      credentials.scope?.split(/\s+/).filter(Boolean) ?? [...GMAIL_SCOPES]
    ).sort();

    await this.tokenVault.storeToken(
      userId,
      "gmail",
      JSON.stringify({
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || payload.refreshToken,
        tokenType: credentials.token_type || "Bearer",
        providerAccountId: payload.providerAccountId,
        metadata: payload.metadata,
      }),
      scopes,
      expiresAt,
    );

    return { accessToken: credentials.access_token, expiresAt };
  }

  async handleCallback(input: {
    code?: string;
    state?: string | null;
    query?: Record<string, unknown>;
  }) {
    const state = input.state?.trim() || "";
    if (!state) {
      throw new GmailOAuthError(
        "OAuth callback missing state.",
        "STATE_REQUIRED",
      );
    }

    const verified = verifyStateWithoutExpectedUser(state);
    await this.consumeStateNonce(verified);
    const code = input.code?.trim();
    if (!code) {
      throw new GmailOAuthError(
        "OAuth callback missing code.",
        "CODE_REQUIRED",
      );
    }

    const result = await this.exchangeCodeAndStoreToken({
      userId: verified.userId,
      code,
      callbackUrlOverride: verified.callbackUrl,
    });

    return {
      ...result,
      userId: verified.userId,
      redirectAfter: verified.redirectAfter ?? null,
      extState: verified.extState ?? null,
    };
  }

  async revokeAccess(userId: string): Promise<boolean> {
    const payload = await this.tokenVault
      .getDecryptedPayload(userId, "gmail")
      .catch(() => null);
    const token = payload?.refreshToken || payload?.accessToken;
    if (!token) return false;

    try {
      const body = new URLSearchParams({ token }).toString();
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default GmailOAuthService;
