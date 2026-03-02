import prisma from "../../config/database";

type ProviderKey = "gmail" | "outlook" | "slack";

const usedNonceMap = new Map<string, number>();
const DURABLE_NONCE_MARKER = "oauth_state_nonce";

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function makeKey(provider: ProviderKey, nonce: string): string {
  return `${provider}:${nonce}`;
}

function cleanupExpired(now: number): void {
  for (const [key, expiry] of usedNonceMap.entries()) {
    if (expiry <= now) usedNonceMap.delete(key);
  }
}

export function markOAuthStateNonceUsed(
  provider: ProviderKey,
  nonce: string,
  issuedAtSec: number,
  ttlSec = 15 * 60,
): boolean {
  const n = String(nonce || "").trim();
  if (!n) return false;

  const now = nowSec();
  cleanupExpired(now);

  const key = makeKey(provider, n);
  const existing = usedNonceMap.get(key);
  if (typeof existing === "number" && existing > now) {
    return false;
  }

  const candidateExpiry = Number.isFinite(issuedAtSec)
    ? Math.max(now + ttlSec, Math.floor(issuedAtSec) + ttlSec)
    : now + ttlSec;
  usedNonceMap.set(key, candidateExpiry);
  return true;
}

function isUniqueViolation(error: unknown): boolean {
  const code = String((error as any)?.code || "");
  const msg = String((error as any)?.message || "");
  return code === "P2002" || /unique constraint/i.test(msg);
}

/**
 * Durable replay guard (cross-instance) using ConnectorIdentityMap unique keys.
 * This complements the in-memory map and blocks nonce re-use across multiple pods/processes.
 */
export async function markOAuthStateNonceUsedDurable(
  provider: ProviderKey,
  userId: string,
  nonce: string,
  issuedAtSec: number,
  ttlSec = 15 * 60,
  alreadyConsumedInMemory = false,
): Promise<boolean> {
  if (
    !alreadyConsumedInMemory &&
    !markOAuthStateNonceUsed(provider, nonce, issuedAtSec, ttlSec)
  ) {
    return false;
  }

  const uid = String(userId || "").trim();
  const n = String(nonce || "").trim();
  if (!uid || !n) return false;

  const delegate = (prisma as any)?.connectorIdentityMap;
  if (!delegate || typeof delegate.create !== "function") {
    // Best-effort fallback for environments where Prisma models are unavailable.
    return true;
  }

  const now = nowSec();
  const exp = Number.isFinite(issuedAtSec)
    ? Math.max(now + ttlSec, Math.floor(issuedAtSec) + ttlSec)
    : now + ttlSec;

  try {
    await delegate.create({
      data: {
        userId: uid,
        provider,
        externalWorkspaceId: `oauth_nonce:${n}`,
        externalUserId: DURABLE_NONCE_MARKER,
        externalAccountEmail: `exp:${exp}`,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;

    // Security-first default: reject state when durable replay protection is unavailable.
    return false;
  }
}
