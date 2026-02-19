import crypto from "crypto";
import IORedis from "ioredis";

type EnvName = "production" | "staging" | "dev" | "local" | string;

export interface EditorLockKey {
  userId: string;
  documentId: string;
}

export interface EditorLockHandle {
  key: EditorLockKey;
  token: string;
  expiresAt: number;
}

function keyToRedisKey(k: EditorLockKey): string {
  return `editor_lock:${k.userId}:${k.documentId}`;
}

function buildRedis(): IORedis | null {
  const redisUrl = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT
    ? Number(process.env.REDIS_PORT)
    : undefined;

  try {
    if (redisUrl) return new IORedis(redisUrl, { maxRetriesPerRequest: null });
    if (host)
      return new IORedis({
        host,
        port: port ?? 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
      });
  } catch {
    return null;
  }
  return null;
}

// Redis-based lock when available; otherwise falls back to in-process lock.
export class EditorLockService {
  private readonly redis: IORedis | null;
  private readonly memory = new Map<
    string,
    { token: string; expiresAt: number }
  >();
  private readonly env: EnvName;

  constructor(opts?: { redis?: IORedis | null; env?: EnvName }) {
    this.redis =
      opts?.redis === undefined ? buildRedis() : (opts.redis ?? null);
    this.env = opts?.env ?? (process.env.NODE_ENV || "local");
  }

  async acquire(key: EditorLockKey, ttlMs = 30_000): Promise<EditorLockHandle> {
    const ttl = Math.max(2_000, Math.min(ttlMs, 5 * 60_000));
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + ttl;
    const redisKey = keyToRedisKey(key);

    if (this.redis) {
      const ok = await this.redis.set(redisKey, token, "PX", ttl, "NX");
      if (ok !== "OK") throw new Error("EDIT_LOCK_BUSY");
      return { key, token, expiresAt };
    }

    // In-memory (single-instance) fallback.
    const existing = this.memory.get(redisKey);
    if (existing && existing.expiresAt > Date.now())
      throw new Error("EDIT_LOCK_BUSY");
    this.memory.set(redisKey, { token, expiresAt });
    return { key, token, expiresAt };
  }

  async extend(
    handle: EditorLockHandle,
    ttlMs = 30_000,
  ): Promise<EditorLockHandle> {
    const ttl = Math.max(2_000, Math.min(ttlMs, 5 * 60_000));
    const expiresAt = Date.now() + ttl;
    const redisKey = keyToRedisKey(handle.key);

    if (this.redis) {
      // Extend only if token matches (Lua compare-and-pexpire)
      const lua = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      const res = await this.redis.eval(
        lua,
        1,
        redisKey,
        handle.token,
        String(ttl),
      );
      if (Number(res) !== 1) throw new Error("EDIT_LOCK_LOST");
      return { ...handle, expiresAt };
    }

    const existing = this.memory.get(redisKey);
    if (
      !existing ||
      existing.token !== handle.token ||
      existing.expiresAt <= Date.now()
    )
      throw new Error("EDIT_LOCK_LOST");
    this.memory.set(redisKey, { token: handle.token, expiresAt });
    return { ...handle, expiresAt };
  }

  async release(handle: EditorLockHandle): Promise<void> {
    const redisKey = keyToRedisKey(handle.key);

    if (this.redis) {
      // Release only if token matches (Lua compare-and-del)
      const lua = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redis.eval(lua, 1, redisKey, handle.token);
      return;
    }

    const existing = this.memory.get(redisKey);
    if (existing && existing.token === handle.token)
      this.memory.delete(redisKey);
  }

  async isLocked(key: EditorLockKey): Promise<boolean> {
    const redisKey = keyToRedisKey(key);
    if (this.redis) {
      const v = await this.redis.get(redisKey);
      return !!v;
    }
    const existing = this.memory.get(redisKey);
    return !!existing && existing.expiresAt > Date.now();
  }

  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // ignore
      }
    }
  }

  // Useful when running without Redis; in production we expect Redis for correctness across instances.
  getDiagnosticsSync(): {
    mode: "redis" | "memory";
    env: string;
    memoryLocks: number;
  } {
    return {
      mode: this.redis ? "redis" : "memory",
      env: this.env,
      memoryLocks: this.memory.size,
    };
  }
}
