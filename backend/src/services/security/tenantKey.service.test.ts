import { describe, expect, test, jest, beforeEach } from "@jest/globals";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGenerateTenantKey = jest.fn();
const mockDecryptTenantKey = jest.fn();

jest.mock("./keyManager.service", () => ({
  buildKeyManager: () => ({
    provider: "local",
    generateTenantKey: mockGenerateTenantKey,
    decryptTenantKey: mockDecryptTenantKey,
  }),
}));

import { TenantKeyService } from "./tenantKey.service";

// ── Helpers ────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, jest.Mock> = {}) {
  return {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      ...overrides,
    },
  } as any;
}

const FAKE_USER_ID = "user-abc-123";
const FAKE_PLAINTEXT_KEY = Buffer.from("a]3Kx9!qN2pL7vR0sT5wY8bF4dH1jM6e");
const FAKE_ENCRYPTED_KEY = "enc:wrapped-key-base64";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("TenantKeyService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Generate new tenant key
  test("generates a new tenant key when user has no existing key", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      tenantKeyEncrypted: null,
      tenantKeyProvider: null,
      tenantKeyMeta: null,
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    mockGenerateTenantKey.mockResolvedValue({
      plaintextKey: FAKE_PLAINTEXT_KEY,
      envelope: {
        provider: "local",
        encryptedKey: FAKE_ENCRYPTED_KEY,
        meta: { v: 1 },
      },
    });

    const svc = new TenantKeyService(prisma, {} as any);
    const result = await svc.getTenantKey(FAKE_USER_ID);

    expect(result).toBe(FAKE_PLAINTEXT_KEY);
    expect(mockGenerateTenantKey).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: FAKE_USER_ID, tenantKeyEncrypted: null },
      data: {
        tenantKeyEncrypted: FAKE_ENCRYPTED_KEY,
        tenantKeyProvider: "local",
        tenantKeyMeta: { v: 1 },
      },
    });
  });

  // 2. Unwrap existing key
  test("unwraps an existing encrypted tenant key", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      tenantKeyEncrypted: FAKE_ENCRYPTED_KEY,
      tenantKeyProvider: "local",
      tenantKeyMeta: { v: 1 },
    });

    const decryptedKey = Buffer.from("decrypted-32-byte-key-padding!!");
    mockDecryptTenantKey.mockResolvedValue(decryptedKey);

    const svc = new TenantKeyService(prisma, {} as any);
    const result = await svc.getTenantKey(FAKE_USER_ID);

    expect(result).toEqual(decryptedKey);
    expect(mockDecryptTenantKey).toHaveBeenCalledWith({
      provider: "local",
      encryptedKey: FAKE_ENCRYPTED_KEY,
      meta: { v: 1 },
    });
    expect(mockGenerateTenantKey).not.toHaveBeenCalled();
  });

  // 3. Cache TTL
  test("returns cached key on second call without hitting DB", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      tenantKeyEncrypted: FAKE_ENCRYPTED_KEY,
      tenantKeyProvider: "local",
      tenantKeyMeta: {},
    });
    mockDecryptTenantKey.mockResolvedValue(FAKE_PLAINTEXT_KEY);

    const svc = new TenantKeyService(prisma, {} as any);

    const first = await svc.getTenantKey(FAKE_USER_ID);
    const second = await svc.getTenantKey(FAKE_USER_ID);

    expect(first).toBe(FAKE_PLAINTEXT_KEY);
    expect(second).toBe(FAKE_PLAINTEXT_KEY);
    // findUnique called only once because second call is served from cache
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  test("bypasses cache when cacheTtlMs is 0", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      tenantKeyEncrypted: FAKE_ENCRYPTED_KEY,
      tenantKeyProvider: "local",
      tenantKeyMeta: {},
    });
    mockDecryptTenantKey.mockResolvedValue(FAKE_PLAINTEXT_KEY);

    const svc = new TenantKeyService(prisma, {} as any, { cacheTtlMs: 0 });

    await svc.getTenantKey(FAKE_USER_ID);
    await svc.getTenantKey(FAKE_USER_ID);

    // Both calls hit DB because TTL of 0 means cache expires immediately
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  // 4. Race condition — lost the optimistic write
  test("handles race condition when another call writes the key first", async () => {
    const prisma = makePrisma();

    // First findUnique: user has no key
    prisma.user.findUnique
      .mockResolvedValueOnce({
        tenantKeyEncrypted: null,
        tenantKeyProvider: null,
        tenantKeyMeta: null,
      })
      // Second findUnique (re-read after losing race): winner's key is present
      .mockResolvedValueOnce({
        tenantKeyEncrypted: "winner-encrypted-key",
        tenantKeyProvider: "local",
        tenantKeyMeta: { v: 1 },
      });

    // updateMany returns count=0 — we lost the race
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    mockGenerateTenantKey.mockResolvedValue({
      plaintextKey: FAKE_PLAINTEXT_KEY,
      envelope: {
        provider: "local",
        encryptedKey: FAKE_ENCRYPTED_KEY,
        meta: { v: 1 },
      },
    });

    const winnerKey = Buffer.from("winner-decrypted-key-32-bytes!!");
    mockDecryptTenantKey.mockResolvedValue(winnerKey);

    const svc = new TenantKeyService(prisma, {} as any);
    const result = await svc.getTenantKey(FAKE_USER_ID);

    // Should return the winner's decrypted key, not our generated key
    expect(result).toEqual(winnerKey);
    expect(mockDecryptTenantKey).toHaveBeenCalledWith({
      provider: "local",
      encryptedKey: "winner-encrypted-key",
      meta: { v: 1 },
    });
    // findUnique called twice: initial read + re-read after race loss
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  // 5. User not found throws
  test("throws when user is not found", async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);

    const svc = new TenantKeyService(prisma, {} as any);

    await expect(svc.getTenantKey(FAKE_USER_ID)).rejects.toThrow(
      "User not found",
    );
  });
});
