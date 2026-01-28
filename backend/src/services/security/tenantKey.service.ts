import type { PrismaClient } from "@prisma/client";
import { EncryptionService } from "./encryption.service";
import { buildKeyManager, IKeyManager } from "./keyManager.service";
import { TenantKeyEnvelope } from "./crypto.types";

/**
 * Fetches/creates and decrypts the per-user Tenant Key (TK).
 * TK is the root for encrypting chat keys + document keys + sensitive DB fields.
 */
export class TenantKeyService {
  private keyManager: IKeyManager;
  private cache = new Map<string, { key: Buffer; expiresAt: number }>();
  private ttlMs: number;

  constructor(
    private prisma: PrismaClient,
    private enc: EncryptionService,
    opts?: { cacheTtlMs?: number },
  ) {
    this.keyManager = buildKeyManager(enc);
    this.ttlMs = opts?.cacheTtlMs ?? 5 * 60 * 1000;
  }

  private now() {
    return Date.now();
  }

  async getTenantKey(userId: string): Promise<Buffer> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > this.now()) return cached.key;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        tenantKeyEncrypted: true,
        tenantKeyProvider: true,
        tenantKeyMeta: true,
      },
    });
    if (!user) throw new Error("User not found");

    let envelope: TenantKeyEnvelope | null = null;

    if (user.tenantKeyEncrypted && user.tenantKeyProvider) {
      envelope = {
        provider: user.tenantKeyProvider as any,
        encryptedKey: user.tenantKeyEncrypted,
        meta: (user.tenantKeyMeta as any) ?? {},
      };
    } else {
      const generated = await this.keyManager.generateTenantKey();
      envelope = generated.envelope;

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          tenantKeyEncrypted: envelope.encryptedKey,
          tenantKeyProvider: envelope.provider,
          tenantKeyMeta: envelope.meta ?? {},
        },
      });

      this.cache.set(userId, {
        key: generated.plaintextKey,
        expiresAt: this.now() + this.ttlMs,
      });
      return generated.plaintextKey;
    }

    const tk = await this.keyManager.decryptTenantKey(envelope);
    this.cache.set(userId, { key: tk, expiresAt: this.now() + this.ttlMs });
    return tk;
  }
}
