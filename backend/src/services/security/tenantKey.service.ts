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
      // Generate a new tenant key optimistically.
      const generated = await this.keyManager.generateTenantKey();

      // Conditional update: only write if no other call has written first.
      // This eliminates the TOCTOU race where two concurrent calls both see
      // tenantKeyEncrypted = null and each generate a different root key.
      const { count } = await this.prisma.user.updateMany({
        where: { id: userId, tenantKeyEncrypted: null },
        data: {
          tenantKeyEncrypted: generated.envelope.encryptedKey,
          tenantKeyProvider: generated.envelope.provider,
          tenantKeyMeta: generated.envelope.meta ?? {},
        },
      });

      if (count === 1) {
        // We won the race — our key was persisted.
        this.cache.set(userId, {
          key: generated.plaintextKey,
          expiresAt: this.now() + this.ttlMs,
        });
        return generated.plaintextKey;
      }

      // count === 0: another call wrote first. Re-read the winner's key.
      const winner = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          tenantKeyEncrypted: true,
          tenantKeyProvider: true,
          tenantKeyMeta: true,
        },
      });
      if (!winner?.tenantKeyEncrypted || !winner.tenantKeyProvider) {
        throw new Error("Tenant key disappeared after concurrent write");
      }
      envelope = {
        provider: winner.tenantKeyProvider as any,
        encryptedKey: winner.tenantKeyEncrypted,
        meta: (winner.tenantKeyMeta as any) ?? {},
      };
    }

    const tk = await this.keyManager.decryptTenantKey(envelope);
    this.cache.set(userId, { key: tk, expiresAt: this.now() + this.ttlMs });
    return tk;
  }
}
