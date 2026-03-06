import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redisConnection } from "../config/redis";

const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;
const TWO_FACTOR_CHALLENGE_KEY_PREFIX = "auth:2fa:challenge:";
const TWO_FACTOR_CHALLENGE_CONSUMED_KEY_PREFIX = "auth:2fa:challenge:consumed:";

interface StoredTwoFactorChallenge {
  userId: string;
  email: string;
  nonce: string;
  expiresAtMs: number;
}

interface TwoFactorChallengeJwtPayload extends jwt.JwtPayload {
  v: 1;
  typ: "2fa_login";
  cid: string;
  uid: string;
  email: string;
  nonce: string;
}

const challengeFallbackStore = new Map<string, StoredTwoFactorChallenge>();
const consumedFallbackStore = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of challengeFallbackStore.entries()) {
    if (value.expiresAtMs <= now) {
      challengeFallbackStore.delete(key);
    }
  }
  for (const [key, expiresAtMs] of consumedFallbackStore.entries()) {
    if (expiresAtMs <= now) {
      consumedFallbackStore.delete(key);
    }
  }
}, 60_000).unref?.();

function resolveChallengeSecret(): string {
  return String(
    process.env.KODA_LOGIN_CHALLENGE_SECRET ||
      process.env.KODA_OAUTH_STATE_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      "",
  ).trim();
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(String(a || ""), "utf8");
  const bBuf = Buffer.from(String(b || ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function storeChallenge(
  challengeId: string,
  value: StoredTwoFactorChallenge,
): Promise<void> {
  const key = `${TWO_FACTOR_CHALLENGE_KEY_PREFIX}${challengeId}`;
  if (redisConnection) {
    try {
      await redisConnection.setex(
        key,
        TWO_FACTOR_CHALLENGE_TTL_SECONDS,
        JSON.stringify(value),
      );
      return;
    } catch {
      // fall back to local memory if Redis is unavailable
    }
  }
  challengeFallbackStore.set(key, value);
}

async function readChallenge(
  challengeId: string,
): Promise<StoredTwoFactorChallenge | null> {
  const key = `${TWO_FACTOR_CHALLENGE_KEY_PREFIX}${challengeId}`;
  if (redisConnection) {
    try {
      const raw = await redisConnection.get<string | null>(key);
      if (!raw) return null;
      return JSON.parse(raw) as StoredTwoFactorChallenge;
    } catch {
      return null;
    }
  }
  const value = challengeFallbackStore.get(key);
  if (!value || value.expiresAtMs <= Date.now()) return null;
  return value;
}

async function deleteChallenge(challengeId: string): Promise<void> {
  const key = `${TWO_FACTOR_CHALLENGE_KEY_PREFIX}${challengeId}`;
  if (redisConnection) {
    try {
      await redisConnection.del(key);
    } catch {
      // ignore cache deletion errors
    }
  }
  challengeFallbackStore.delete(key);
}

async function markChallengeConsumed(challengeId: string): Promise<boolean> {
  const consumedKey = `${TWO_FACTOR_CHALLENGE_CONSUMED_KEY_PREFIX}${challengeId}`;
  if (redisConnection) {
    try {
      const result = await redisConnection.set(consumedKey, "1", {
        nx: true,
        ex: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
      });
      return Boolean(result);
    } catch {
      return false;
    }
  }

  if (consumedFallbackStore.has(consumedKey)) return false;
  consumedFallbackStore.set(
    consumedKey,
    Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000,
  );
  return true;
}

export async function issueTwoFactorLoginChallenge(input: {
  userId: string;
  email: string;
}): Promise<string> {
  const userId = String(input.userId || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  if (!userId || !email) {
    throw new Error("2FA challenge requires user context");
  }

  const secret = resolveChallengeSecret();
  if (!secret) {
    throw new Error("2FA challenge secret is missing");
  }

  const challengeId = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const expiresAtMs = Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000;

  await storeChallenge(challengeId, {
    userId,
    email,
    nonce,
    expiresAtMs,
  });

  const payload: TwoFactorChallengeJwtPayload = {
    v: 1,
    typ: "2fa_login",
    cid: challengeId,
    uid: userId,
    email,
    nonce,
  };

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: `${TWO_FACTOR_CHALLENGE_TTL_SECONDS}s`,
  });
}

export async function consumeTwoFactorLoginChallenge(
  token: string,
): Promise<{ userId: string; email: string }> {
  const verified = await verifyTwoFactorLoginChallenge(token);
  const consumed = await markChallengeConsumed(verified.challengeId);
  if (!consumed) {
    throw new Error("2FA challenge invalid or expired");
  }
  await deleteChallenge(verified.challengeId);
  return {
    userId: verified.userId,
    email: verified.email,
  };
}

export async function verifyTwoFactorLoginChallenge(token: string): Promise<{
  challengeId: string;
  userId: string;
  email: string;
}> {
  const challengeToken = String(token || "").trim();
  const secret = resolveChallengeSecret();
  if (!challengeToken || !secret) {
    throw new Error("2FA challenge invalid or expired");
  }

  let payload: TwoFactorChallengeJwtPayload;
  try {
    payload = jwt.verify(challengeToken, secret, {
      algorithms: ["HS256"],
    }) as TwoFactorChallengeJwtPayload;
  } catch {
    throw new Error("2FA challenge invalid or expired");
  }

  if (
    payload.v !== 1 ||
    payload.typ !== "2fa_login" ||
    typeof payload.cid !== "string" ||
    typeof payload.uid !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.nonce !== "string"
  ) {
    throw new Error("2FA challenge invalid or expired");
  }

  const stored = await readChallenge(payload.cid);
  if (!stored) {
    throw new Error("2FA challenge invalid or expired");
  }

  if (
    !timingSafeEqualString(stored.userId, payload.uid) ||
    !timingSafeEqualString(stored.email, payload.email) ||
    !timingSafeEqualString(stored.nonce, payload.nonce)
  ) {
    throw new Error("2FA challenge invalid or expired");
  }

  if (stored.expiresAtMs <= Date.now()) {
    throw new Error("2FA challenge invalid or expired");
  }

  return {
    challengeId: payload.cid,
    userId: stored.userId,
    email: stored.email,
  };
}

export function resetTwoFactorChallengeStoreForTests(): void {
  challengeFallbackStore.clear();
  consumedFallbackStore.clear();
}
