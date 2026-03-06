import prisma from "../../config/database";

const REPLAY_MARKER = "oauth_completion_payload";
const localReplayCache = new Map<string, number>();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowMs(): number {
  return Date.now();
}

function cleanupExpiredCache(now: number): void {
  for (const [key, expiry] of localReplayCache.entries()) {
    if (!Number.isFinite(expiry) || expiry <= now) {
      localReplayCache.delete(key);
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = String((error as any)?.code || "");
  const msg = String((error as any)?.message || "");
  return code === "P2002" || /unique constraint/i.test(msg);
}

function replayKey(userId: string, provider: string, nonce: string): string {
  return `${provider}:${userId}:${nonce}`;
}

function failClosedOnDurableError(): boolean {
  const raw = asString(
    process.env.CONNECTOR_OAUTH_COMPLETION_REPLAY_FAIL_CLOSED,
  ).toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return process.env.NODE_ENV !== "test";
}

async function markDurable(
  userId: string,
  provider: string,
  nonce: string,
  expMs: number,
): Promise<boolean> {
  const delegate = (prisma as any)?.connectorIdentityMap;
  if (!delegate || typeof delegate.create !== "function") {
    return process.env.NODE_ENV === "test" ? true : !failClosedOnDurableError();
  }

  try {
    await delegate.create({
      data: {
        userId,
        provider,
        externalWorkspaceId: `oauth_completion:${nonce}`,
        externalUserId: REPLAY_MARKER,
        externalAccountEmail: `exp:${new Date(expMs).toISOString()}`,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    return !failClosedOnDurableError();
  }
}

export async function consumeOAuthCompletionPayloadOnce(input: {
  userId: string;
  provider: string;
  nonce: string;
  expMs: number;
}): Promise<boolean> {
  const userId = asString(input?.userId);
  const provider = asString(input?.provider).toLowerCase();
  const nonce = asString(input?.nonce);
  const expMs = Number(input?.expMs);
  if (!userId || !provider || !nonce || !Number.isFinite(expMs)) {
    return false;
  }

  const now = nowMs();
  cleanupExpiredCache(now);
  const key = replayKey(userId, provider, nonce);
  const existing = localReplayCache.get(key);
  if (typeof existing === "number" && existing > now) {
    return false;
  }

  // Keep nonce in-memory at least one minute in case callback age is near-term.
  const expiry = Math.max(now + 60_000, Math.floor(expMs));
  localReplayCache.set(key, expiry);

  const durable = await markDurable(userId, provider, nonce, expiry);
  if (!durable) return false;
  return true;
}

export function resetOAuthCompletionReplayCacheForTests(): void {
  localReplayCache.clear();
}

