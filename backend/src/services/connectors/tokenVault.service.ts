import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import prisma from "../../config/database";
import { EncryptionService } from "../security/encryption.service";
import { EnvelopeService } from "../security/envelope.service";
import type { ConnectorProvider } from "./connectorsRegistry";

export interface ConnectorTokenPayload {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  providerAccountId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorConnectionInfo {
  scopes: string[];
  expiresAt: Date;
  updatedAt: Date;
  providerAccountId: string | null;
}

export interface EnsureConnectedAccessResult {
  connected: boolean;
  accessToken: string | null;
  reason?: "not_connected" | "temp_unavailable" | "misconfigured";
  info?: ConnectorConnectionInfo | null;
}

interface StoredProviderToken {
  provider: ConnectorProvider;
  wrappedRecordKey: string;
  encryptedPayloadJson: string;
  scopes: string[];
  expiresAt: string;
  updatedAt: string;
}

interface StoredTokenFile {
  version: 1;
  userId: string;
  providers: Partial<Record<ConnectorProvider, StoredProviderToken>>;
}

const DEFAULT_STORAGE_ROOT = path.resolve(
  process.cwd(),
  "storage",
  "connectors",
  "tokens",
);

/**
 * Encrypted token vault (envelope pattern, no plaintext tokens at rest).
 */
export class TokenVaultService {
  private readonly enc: EncryptionService;
  private readonly envelope: EnvelopeService;
  private readonly storageRoot: string;
  private readonly storageMode: "file" | "prisma";
  private readonly failClosedOnPrismaError: boolean;

  constructor(opts?: {
    storageRoot?: string;
    encryptionService?: EncryptionService;
  }) {
    this.enc = opts?.encryptionService ?? new EncryptionService();
    this.envelope = new EnvelopeService(this.enc);
    this.storageRoot = opts?.storageRoot ?? DEFAULT_STORAGE_ROOT;
    this.storageMode =
      (process.env.CONNECTOR_TOKEN_STORAGE as any) ||
      (process.env.NODE_ENV === "production" ? "prisma" : "file");
    const failClosedEnv = String(
      process.env.CONNECTOR_TOKEN_VAULT_FAIL_CLOSED || "",
    )
      .trim()
      .toLowerCase();
    this.failClosedOnPrismaError =
      failClosedEnv === "true" ||
      (failClosedEnv !== "false" && process.env.NODE_ENV === "production");
  }

  async storeToken(
    userId: string,
    provider: ConnectorProvider,
    encryptedBlob: string,
    scopes: string[],
    expiresAt: Date,
  ): Promise<void> {
    const parsedPayload = this.parseTokenBlob(encryptedBlob);

    const masterKey = this.getMasterKey();
    const recordKey = this.enc.randomKey32();
    const aad = this.makeAad(userId, provider);

    const encryptedPayloadJson = this.enc.encryptJsonToJson(
      parsedPayload,
      recordKey,
      aad,
    );
    const wrappedRecordKey = this.envelope.wrapRecordKey(
      recordKey,
      masterKey,
      aad,
    );

    const normalizedScopes = [...new Set(scopes)].filter(Boolean).sort();

    if (this.storageMode === "prisma") {
      try {
        await prisma.connectorToken.upsert({
          where: { userId_provider: { userId, provider } },
          create: {
            userId,
            provider,
            wrappedRecordKey,
            encryptedPayloadJson,
            scopes: normalizedScopes,
            expiresAt,
          },
          update: {
            wrappedRecordKey,
            encryptedPayloadJson,
            scopes: normalizedScopes,
            expiresAt,
          },
        });
        return;
      } catch (e) {
        if (this.failClosedOnPrismaError) {
          throw new Error(
            `Token vault persistence failed in fail-closed mode: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        // If migrations haven't been applied yet (dev) or DB is down, fall back to file storage.
      }
    }

    const file = await this.readFile(userId);
    file.providers[provider] = {
      provider,
      wrappedRecordKey,
      encryptedPayloadJson,
      scopes: normalizedScopes,
      expiresAt: expiresAt.toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.writeFile(userId, file);
  }

  async getValidAccessToken(
    userId: string,
    provider: ConnectorProvider,
  ): Promise<string> {
    const entry = await this.readProviderEntry(userId, provider);

    if (!entry) {
      throw new Error(`No token found for provider ${provider}.`);
    }

    const expiresAt = new Date(entry.expiresAt).getTime();
    const now = Date.now();
    const expirySafetyWindowMs = 60_000;

    if (expiresAt <= now + expirySafetyWindowMs) {
      throw new Error(
        `Token for ${provider} is expired or about to expire. Reconnect required.`,
      );
    }

    const payload = this.decryptEntry(userId, provider, entry);

    if (!payload.accessToken || typeof payload.accessToken !== "string") {
      throw new Error(`Stored token payload for ${provider} is invalid.`);
    }

    return payload.accessToken;
  }

  async getDecryptedPayload(
    userId: string,
    provider: ConnectorProvider,
  ): Promise<ConnectorTokenPayload | null> {
    const entry = await this.readProviderEntry(userId, provider);
    if (!entry) return null;

    const payload = this.decryptEntry(userId, provider, entry);
    if (!payload.accessToken || typeof payload.accessToken !== "string")
      return null;

    return payload;
  }

  async deleteToken(
    userId: string,
    provider: ConnectorProvider,
  ): Promise<void> {
    if (this.storageMode === "prisma") {
      try {
        await prisma.connectorToken.delete({
          where: { userId_provider: { userId, provider } },
        });
        return;
      } catch (e) {
        if (this.failClosedOnPrismaError) {
          throw new Error(
            `Token vault delete failed in fail-closed mode: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        // Fall back to file storage below.
      }
    }

    const file = await this.readFile(userId);
    delete file.providers[provider];
    await this.writeFile(userId, file);
  }

  async getProviderTokenMeta(
    userId: string,
    provider: ConnectorProvider,
  ): Promise<{ scopes: string[]; expiresAt: Date; updatedAt: Date } | null> {
    const entry = await this.readProviderEntry(userId, provider);
    if (!entry) return null;

    return {
      scopes: entry.scopes,
      expiresAt: new Date(entry.expiresAt),
      updatedAt: new Date(entry.updatedAt),
    };
  }

  async getProviderConnectionInfo(
    userId: string,
    provider: ConnectorProvider,
  ): Promise<ConnectorConnectionInfo | null> {
    const entry = await this.readProviderEntry(userId, provider);
    if (!entry) return null;

    // Decrypt but return only safe metadata (never return access/refresh tokens).
    const payload = this.decryptEntry(userId, provider, entry);
    const providerAccountId =
      payload?.providerAccountId &&
      typeof payload.providerAccountId === "string"
        ? payload.providerAccountId
        : null;

    return {
      scopes: entry.scopes,
      expiresAt: new Date(entry.expiresAt),
      updatedAt: new Date(entry.updatedAt),
      providerAccountId,
    };
  }

  async ensureConnectedAccess(
    userId: string,
    provider: ConnectorProvider,
    opts?: {
      refreshFn?: ((arg: string | { userId: string }) => unknown) | null;
      oauthService?: unknown;
    },
  ): Promise<EnsureConnectedAccessResult> {
    const payload = await this.getDecryptedPayload(userId, provider).catch(
      () => null,
    );
    if (!payload?.accessToken) {
      return { connected: false, accessToken: null, reason: "not_connected" };
    }

    const info = await this.getProviderConnectionInfo(userId, provider).catch(
      () => null,
    );
    if (!info) {
      return { connected: false, accessToken: null, reason: "not_connected" };
    }

    const expirySafetyWindowMs = 60_000;
    const expiredSoon =
      info.expiresAt.getTime() <= Date.now() + expirySafetyWindowMs;
    if (!expiredSoon) {
      return { connected: true, accessToken: payload.accessToken, info };
    }

    const refreshFn = opts?.refreshFn;
    if (typeof refreshFn !== "function") {
      return {
        connected: false,
        accessToken: null,
        reason: "not_connected",
        info,
      };
    }

    try {
      await this.invokeRefresh(refreshFn, opts?.oauthService, userId);
      const refreshedPayload = await this.getDecryptedPayload(
        userId,
        provider,
      ).catch(() => null);
      const refreshedInfo = await this.getProviderConnectionInfo(
        userId,
        provider,
      ).catch(() => null);
      if (!refreshedPayload?.accessToken || !refreshedInfo) {
        return {
          connected: false,
          accessToken: null,
          reason: "temp_unavailable",
          info: refreshedInfo,
        };
      }
      return {
        connected: true,
        accessToken: refreshedPayload.accessToken,
        info: refreshedInfo,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();
      if (
        lower.includes("invalid_grant") ||
        lower.includes("invalid refresh") ||
        lower.includes("refresh token") ||
        lower.includes("reconnect") ||
        lower.includes("no token")
      ) {
        await this.deleteToken(userId, provider).catch(() => {});
        return { connected: false, accessToken: null, reason: "not_connected" };
      }
      if (
        lower.includes("missing") ||
        lower.includes("not configured") ||
        lower.includes("environment")
      ) {
        return {
          connected: false,
          accessToken: null,
          reason: "misconfigured",
          info,
        };
      }
      return {
        connected: false,
        accessToken: null,
        reason: "temp_unavailable",
        info,
      };
    }
  }

  private parseTokenBlob(encryptedBlob: string): ConnectorTokenPayload {
    let parsed: unknown;

    try {
      parsed = JSON.parse(encryptedBlob);
    } catch {
      throw new Error(
        "encryptedBlob must be a JSON string containing at least accessToken.",
      );
    }

    const payload = parsed as ConnectorTokenPayload;
    if (!payload.accessToken || typeof payload.accessToken !== "string") {
      throw new Error("Token payload must include accessToken:string.");
    }

    return payload;
  }

  private makeAad(userId: string, provider: ConnectorProvider): string {
    return `connector-token:${userId}:${provider}`;
  }

  private async invokeRefresh(
    fn: (arg: string | { userId: string }) => unknown,
    oauthService: unknown,
    userId: string,
  ): Promise<void> {
    try {
      await Promise.resolve(fn.call(oauthService, userId));
      return;
    } catch {
      await Promise.resolve(fn.call(oauthService, { userId }));
    }
  }

  private decryptEntry(
    userId: string,
    provider: ConnectorProvider,
    entry: StoredProviderToken,
  ): ConnectorTokenPayload {
    const masterKey = this.getMasterKey();
    const aad = this.makeAad(userId, provider);
    const recordKey = this.envelope.unwrapRecordKey(
      entry.wrappedRecordKey,
      masterKey,
      aad,
    );
    return this.enc.decryptJsonFromJson<ConnectorTokenPayload>(
      entry.encryptedPayloadJson,
      recordKey,
      aad,
    );
  }

  private getMasterKey(): Buffer {
    const base64 = process.env.KODA_MASTER_KEY_BASE64;
    if (base64) {
      const decoded = Buffer.from(base64, "base64");
      if (decoded.length === 32) return decoded;
    }

    const fallback = process.env.ENCRYPTION_KEY;
    if (!fallback) {
      throw new Error(
        "Missing encryption key (KODA_MASTER_KEY_BASE64 or ENCRYPTION_KEY).",
      );
    }

    return createHash("sha256").update(fallback).digest();
  }

  private getUserFilePath(userId: string): string {
    return path.join(this.storageRoot, `${userId}.json`);
  }

  private async readProviderEntry(
    userId: string,
    provider: ConnectorProvider,
  ): Promise<StoredProviderToken | null> {
    if (this.storageMode === "prisma") {
      let row: {
        wrappedRecordKey: string;
        encryptedPayloadJson: string;
        scopes: string[];
        expiresAt: Date;
        updatedAt: Date;
      } | null = null;
      try {
        row = await prisma.connectorToken.findUnique({
          where: { userId_provider: { userId, provider } },
          select: {
            wrappedRecordKey: true,
            encryptedPayloadJson: true,
            scopes: true,
            expiresAt: true,
            updatedAt: true,
          },
        });
      } catch (e) {
        if (this.failClosedOnPrismaError) {
          throw new Error(
            `Token vault read failed in fail-closed mode: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        row = null;
      }

      if (row) {
        return {
          provider,
          wrappedRecordKey: row.wrappedRecordKey,
          encryptedPayloadJson: row.encryptedPayloadJson,
          scopes: row.scopes || [],
          expiresAt: row.expiresAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }

      // Back-compat: if a file token exists (dev), read it and hydrate DB.
      const file = await this.readFile(userId);
      const entry = file.providers[provider] || null;
      if (entry) {
        try {
          await prisma.connectorToken.upsert({
            where: { userId_provider: { userId, provider } },
            create: {
              userId,
              provider,
              wrappedRecordKey: entry.wrappedRecordKey,
              encryptedPayloadJson: entry.encryptedPayloadJson,
              scopes: entry.scopes || [],
              expiresAt: new Date(entry.expiresAt),
            },
            update: {
              wrappedRecordKey: entry.wrappedRecordKey,
              encryptedPayloadJson: entry.encryptedPayloadJson,
              scopes: entry.scopes || [],
              expiresAt: new Date(entry.expiresAt),
            },
          });
        } catch (e) {
          if (this.failClosedOnPrismaError) {
            throw new Error(
              `Token vault hydration failed in fail-closed mode: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
          // ignore
        }
      }
      return entry;
    }

    const file = await this.readFile(userId);
    return file.providers[provider] || null;
  }

  private async readFile(userId: string): Promise<StoredTokenFile> {
    await fs.mkdir(this.storageRoot, { recursive: true });

    const filePath = this.getUserFilePath(userId);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredTokenFile;

      if (
        parsed?.version !== 1 ||
        parsed?.userId !== userId ||
        !parsed.providers
      ) {
        return { version: 1, userId, providers: {} };
      }

      return parsed;
    } catch {
      return { version: 1, userId, providers: {} };
    }
  }

  private async writeFile(
    userId: string,
    payload: StoredTokenFile,
  ): Promise<void> {
    await fs.mkdir(this.storageRoot, { recursive: true });

    const filePath = this.getUserFilePath(userId);
    const tempPath = `${filePath}.tmp`;

    await fs.writeFile(tempPath, JSON.stringify(payload), {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(tempPath, filePath);
  }
}

export default TokenVaultService;
