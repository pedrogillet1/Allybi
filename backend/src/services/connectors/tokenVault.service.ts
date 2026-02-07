import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import { EncryptionService } from '../security/encryption.service';
import { EnvelopeService } from '../security/envelope.service';
import type { ConnectorProvider } from './connectorsRegistry';

export interface ConnectorTokenPayload {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  providerAccountId?: string;
  metadata?: Record<string, unknown>;
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

const DEFAULT_STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'connectors', 'tokens');

/**
 * Encrypted token vault (envelope pattern, no plaintext tokens at rest).
 */
export class TokenVaultService {
  private readonly enc: EncryptionService;
  private readonly envelope: EnvelopeService;
  private readonly storageRoot: string;

  constructor(opts?: { storageRoot?: string; encryptionService?: EncryptionService }) {
    this.enc = opts?.encryptionService ?? new EncryptionService();
    this.envelope = new EnvelopeService(this.enc);
    this.storageRoot = opts?.storageRoot ?? DEFAULT_STORAGE_ROOT;
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

    const encryptedPayloadJson = this.enc.encryptJsonToJson(parsedPayload, recordKey, aad);
    const wrappedRecordKey = this.envelope.wrapRecordKey(recordKey, masterKey, aad);

    const file = await this.readFile(userId);
    file.providers[provider] = {
      provider,
      wrappedRecordKey,
      encryptedPayloadJson,
      scopes: [...new Set(scopes)].sort(),
      expiresAt: expiresAt.toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.writeFile(userId, file);
  }

  async getValidAccessToken(userId: string, provider: ConnectorProvider): Promise<string> {
    const file = await this.readFile(userId);
    const entry = file.providers[provider];

    if (!entry) {
      throw new Error(`No token found for provider ${provider}.`);
    }

    const expiresAt = new Date(entry.expiresAt).getTime();
    const now = Date.now();
    const expirySafetyWindowMs = 60_000;

    if (expiresAt <= now + expirySafetyWindowMs) {
      throw new Error(`Token for ${provider} is expired or about to expire. Reconnect required.`);
    }

    const masterKey = this.getMasterKey();
    const aad = this.makeAad(userId, provider);
    const recordKey = this.envelope.unwrapRecordKey(entry.wrappedRecordKey, masterKey, aad);

    const payload = this.enc.decryptJsonFromJson<ConnectorTokenPayload>(entry.encryptedPayloadJson, recordKey, aad);

    if (!payload.accessToken || typeof payload.accessToken !== 'string') {
      throw new Error(`Stored token payload for ${provider} is invalid.`);
    }

    return payload.accessToken;
  }

  async getDecryptedPayload(userId: string, provider: ConnectorProvider): Promise<ConnectorTokenPayload | null> {
    const file = await this.readFile(userId);
    const entry = file.providers[provider];
    if (!entry) return null;

    const masterKey = this.getMasterKey();
    const aad = this.makeAad(userId, provider);
    const recordKey = this.envelope.unwrapRecordKey(entry.wrappedRecordKey, masterKey, aad);

    const payload = this.enc.decryptJsonFromJson<ConnectorTokenPayload>(entry.encryptedPayloadJson, recordKey, aad);
    if (!payload.accessToken || typeof payload.accessToken !== 'string') return null;

    return payload;
  }

  async deleteToken(userId: string, provider: ConnectorProvider): Promise<void> {
    const file = await this.readFile(userId);
    delete file.providers[provider];
    await this.writeFile(userId, file);
  }

  async getProviderTokenMeta(
    userId: string,
    provider: ConnectorProvider,
  ): Promise<{ scopes: string[]; expiresAt: Date; updatedAt: Date } | null> {
    const file = await this.readFile(userId);
    const entry = file.providers[provider];
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
  ): Promise<{ scopes: string[]; expiresAt: Date; updatedAt: Date; providerAccountId: string | null } | null> {
    const file = await this.readFile(userId);
    const entry = file.providers[provider];
    if (!entry) return null;

    const masterKey = this.getMasterKey();
    const aad = this.makeAad(userId, provider);
    const recordKey = this.envelope.unwrapRecordKey(entry.wrappedRecordKey, masterKey, aad);

    // Decrypt but return only safe metadata (never return access/refresh tokens).
    const payload = this.enc.decryptJsonFromJson<ConnectorTokenPayload>(entry.encryptedPayloadJson, recordKey, aad);
    const providerAccountId =
      payload?.providerAccountId && typeof payload.providerAccountId === 'string'
        ? payload.providerAccountId
        : null;

    return {
      scopes: entry.scopes,
      expiresAt: new Date(entry.expiresAt),
      updatedAt: new Date(entry.updatedAt),
      providerAccountId,
    };
  }

  private parseTokenBlob(encryptedBlob: string): ConnectorTokenPayload {
    let parsed: unknown;

    try {
      parsed = JSON.parse(encryptedBlob);
    } catch {
      throw new Error('encryptedBlob must be a JSON string containing at least accessToken.');
    }

    const payload = parsed as ConnectorTokenPayload;
    if (!payload.accessToken || typeof payload.accessToken !== 'string') {
      throw new Error('Token payload must include accessToken:string.');
    }

    return payload;
  }

  private makeAad(userId: string, provider: ConnectorProvider): string {
    return `connector-token:${userId}:${provider}`;
  }

  private getMasterKey(): Buffer {
    const base64 = process.env.KODA_MASTER_KEY_BASE64;
    if (base64) {
      const decoded = Buffer.from(base64, 'base64');
      if (decoded.length === 32) return decoded;
    }

    const fallback = process.env.ENCRYPTION_KEY;
    if (!fallback) {
      throw new Error('Missing encryption key (KODA_MASTER_KEY_BASE64 or ENCRYPTION_KEY).');
    }

    return createHash('sha256').update(fallback).digest();
  }

  private getUserFilePath(userId: string): string {
    return path.join(this.storageRoot, `${userId}.json`);
  }

  private async readFile(userId: string): Promise<StoredTokenFile> {
    await fs.mkdir(this.storageRoot, { recursive: true });

    const filePath = this.getUserFilePath(userId);

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as StoredTokenFile;

      if (parsed?.version !== 1 || parsed?.userId !== userId || !parsed.providers) {
        return { version: 1, userId, providers: {} };
      }

      return parsed;
    } catch {
      return { version: 1, userId, providers: {} };
    }
  }

  private async writeFile(userId: string, payload: StoredTokenFile): Promise<void> {
    await fs.mkdir(this.storageRoot, { recursive: true });

    const filePath = this.getUserFilePath(userId);
    const tempPath = `${filePath}.tmp`;

    await fs.writeFile(tempPath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tempPath, filePath);
  }
}

export default TokenVaultService;
