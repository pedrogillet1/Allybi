import { createHash } from "crypto";

import prisma from "../../config/database";
import type { EmailSendConfirmationPayload } from "./emailSendConfirmation.service";

const REPLAY_MARKER = "email_send_confirmation";
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

function tokenFingerprint(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function replayKey(
  userId: string,
  provider: "gmail" | "outlook",
  fingerprint: string,
): string {
  return `${provider}:${userId}:${fingerprint}`;
}

function shouldSkipDurableCheck(): boolean {
  const mode = asString(process.env.CONNECTOR_EMAIL_SEND_REPLAY_MODE).toLowerCase();
  if (mode === "memory") return process.env.NODE_ENV === "test";
  return process.env.NODE_ENV === "test";
}

function failClosedOnDurableError(): boolean {
  const raw = asString(process.env.CONNECTOR_EMAIL_SEND_REPLAY_FAIL_CLOSED).toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return process.env.NODE_ENV !== "test";
}

async function markDurable(
  userId: string,
  provider: "gmail" | "outlook",
  fingerprint: string,
  expMs: number,
): Promise<boolean> {
  const delegate = (prisma as any)?.connectorIdentityMap;
  if (!delegate || typeof delegate.create !== "function") {
    return !failClosedOnDurableError();
  }

  try {
    await delegate.create({
      data: {
        userId,
        provider,
        externalWorkspaceId: `email_send_token:${fingerprint}`,
        externalUserId: REPLAY_MARKER,
        externalAccountEmail: `exp:${new Date(expMs).toISOString()}`,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return false;
    }
    if (failClosedOnDurableError()) {
      return false;
    }
    return true;
  }
}

export async function consumeEmailSendConfirmationTokenOnce(
  token: string,
  payload: Pick<EmailSendConfirmationPayload, "userId" | "provider" | "exp">,
): Promise<boolean> {
  const rawToken = asString(token);
  const userId = asString(payload?.userId);
  const providerRaw = asString(payload?.provider).toLowerCase();
  const provider = providerRaw === "gmail" || providerRaw === "outlook"
    ? providerRaw
    : "";
  const expMs = Number(payload?.exp);

  if (!rawToken || !userId || !provider || !Number.isFinite(expMs)) {
    return false;
  }

  const now = nowMs();
  cleanupExpiredCache(now);

  const fingerprint = tokenFingerprint(rawToken);
  const key = replayKey(userId, provider, fingerprint);
  const existing = localReplayCache.get(key);
  if (typeof existing === "number" && existing > now) {
    return false;
  }

  const expiry = Math.max(now + 60_000, Math.floor(expMs));
  localReplayCache.set(key, expiry);

  if (shouldSkipDurableCheck()) {
    return true;
  }

  const durable = await markDurable(userId, provider, fingerprint, expiry);
  if (!durable) {
    return false;
  }

  return true;
}

export function resetEmailSendReplayCacheForTests(): void {
  localReplayCache.clear();
}
