type ProviderKey = "gmail" | "outlook" | "slack";

const usedNonceMap = new Map<string, number>();

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
