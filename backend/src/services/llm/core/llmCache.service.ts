/**
 * llmCache.service.ts
 *
 * Deterministic cache for LLM + RAG stages (provider-agnostic).
 * Goals:
 * - Stable keys (hash-based)
 * - TTL + size limits
 * - Supports in-memory by default; pluggable backend (e.g., Redis)
 * - No user-facing strings
 */

import crypto from 'crypto';

export type CacheNamespace =
  | 'intent'
  | 'scope'
  | 'retrieval'
  | 'compose'
  | 'llm_complete'
  | 'llm_stream_prefill'
  | 'validation'
  | 'other';

export interface CacheKeyParts {
  namespace: CacheNamespace;

  /** Deterministic identity of the tenant/user/workspace (if applicable) */
  tenantId?: string;

  /** Conversation and turn scoping */
  conversationId?: string;
  turnId?: string;

  /** Active doc lock identity (prevents cross-doc contamination) */
  docLock?: {
    enabled: boolean;
    docId?: string;
    filename?: string;
  };

  /** Model identity (prevents cross-model contamination) */
  model?: {
    provider?: string;
    name?: string;
  };

  /** Arbitrary stable payload data to hash into key */
  payload: unknown;

  /** Optional versioning to invalidate old cache formats */
  version?: string;
}

export interface CacheEntryMeta {
  createdAtMs: number;
  expiresAtMs: number;
  /** For debugging / observability */
  keyHash: string;
  namespace: CacheNamespace;
}

export interface CacheEntry<T> {
  value: T;
  meta: CacheEntryMeta;
}

export interface CacheGetResult<T> {
  hit: boolean;
  entry?: CacheEntry<T>;
}

export interface CacheSetOptions {
  /** Time-to-live */
  ttlMs: number;

  /** Optional hard cap for serialized size (bytes) */
  maxBytes?: number;
}

export interface CacheStats {
  backend: 'memory' | 'external';
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface ExternalCacheBackend {
  /** Return raw JSON string or null */
  get(key: string): Promise<string | null>;
  /** Set raw JSON string with TTL */
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** Delete key */
  del(key: string): Promise<void>;
  /** Optional: clear namespace via prefix (best-effort) */
  clearPrefix?(prefix: string): Promise<void>;
}

export interface LLMCacheConfig {
  enabled: boolean;

  /** Default TTLs by namespace */
  defaultTtlMs: Record<CacheNamespace, number>;

  /** Memory backend limits (ignored when external backend is used) */
  memory?: {
    /** Max entries (approx) */
    maxEntries: number;
    /** Max total bytes (approx) */
    maxBytes: number;
    /** Sweep interval for expired entries */
    sweepIntervalMs: number;
  };

  /** Optional: stable key salt (env-configured) */
  keySalt?: string;

  /** Whether to include conversationId/turnId in key by default */
  includeConversationScope?: boolean;
}

/**
 * A small in-memory LRU-ish cache with TTL.
 * - Eviction: remove expired first, then oldest insertion order
 * - Deterministic behavior
 */
class MemoryStore {
  private map = new Map<string, { raw: string; bytes: number; expiresAtMs: number }>();
  private totalBytes = 0;

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(private readonly limits: { maxEntries: number; maxBytes: number }) {}

  getStats(): Pick<CacheStats, 'size' | 'hits' | 'misses' | 'evictions'> {
    return {
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  get(key: string, nowMs: number): string | null {
    const v = this.map.get(key);
    if (!v) {
      this.misses++;
      return null;
    }
    if (v.expiresAtMs <= nowMs) {
      this.delete(key);
      this.misses++;
      return null;
    }
    // LRU-ish: refresh insertion order by re-setting
    this.map.delete(key);
    this.map.set(key, v);
    this.hits++;
    return v.raw;
  }

  set(key: string, raw: string, ttlMs: number, nowMs: number): void {
    const bytes = Buffer.byteLength(raw, 'utf8');
    const expiresAtMs = nowMs + ttlMs;

    // If exists, remove first
    const existing = this.map.get(key);
    if (existing) this.delete(key);

    // Evict to fit by bytes/entries
    this.evictToFit(bytes, nowMs);

    this.map.set(key, { raw, bytes, expiresAtMs });
    this.totalBytes += bytes;
  }

  delete(key: string): void {
    const existing = this.map.get(key);
    if (!existing) return;
    this.map.delete(key);
    this.totalBytes -= existing.bytes;
  }

  clearPrefix(prefix: string): void {
    for (const k of Array.from(this.map.keys())) {
      if (k.startsWith(prefix)) this.delete(k);
    }
  }

  sweepExpired(nowMs: number): void {
    for (const [k, v] of Array.from(this.map.entries())) {
      if (v.expiresAtMs <= nowMs) this.delete(k);
    }
  }

  private evictToFit(incomingBytes: number, nowMs: number): void {
    // 1) remove expired first
    this.sweepExpired(nowMs);

    // 2) evict oldest until fits
    while (
      this.map.size >= this.limits.maxEntries ||
      this.totalBytes + incomingBytes > this.limits.maxBytes
    ) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.delete(oldestKey);
      this.evictions++;
    }
  }
}

export class LLMCacheService {
  private readonly memory?: MemoryStore;
  private readonly external?: ExternalCacheBackend;

  private readonly config: LLMCacheConfig;

  private sweepTimer?: NodeJS.Timeout;

  constructor(params: { config: LLMCacheConfig; externalBackend?: ExternalCacheBackend }) {
    this.config = params.config;
    this.external = params.externalBackend;

    if (!this.external && this.config.memory) {
      this.memory = new MemoryStore({
        maxEntries: this.config.memory.maxEntries,
        maxBytes: this.config.memory.maxBytes,
      });

      // periodic sweep
      this.sweepTimer = setInterval(() => {
        try {
          this.memory?.sweepExpired(Date.now());
        } catch {
          // no-op
        }
      }, this.config.memory.sweepIntervalMs);
      // don't keep the process alive
      this.sweepTimer.unref?.();
    }
  }

  shutdown(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Deterministic cache key builder.
   * Produces: "koda:<namespace>:<hash>"
   */
  buildKey(parts: CacheKeyParts): string {
    const salt = this.config.keySalt ?? '';
    const includeConv = this.config.includeConversationScope ?? false;

    const stable = {
      ns: parts.namespace,
      tenantId: parts.tenantId ?? null,
      conversationId: includeConv ? parts.conversationId ?? null : null,
      turnId: includeConv ? parts.turnId ?? null : null,
      docLock: parts.docLock?.enabled
        ? { docId: parts.docLock.docId ?? null, filename: parts.docLock.filename ?? null }
        : { docId: null, filename: null },
      model: parts.model
        ? { provider: parts.model.provider ?? null, name: parts.model.name ?? null }
        : { provider: null, name: null },
      version: parts.version ?? 'v1',
      payload: parts.payload,
      salt,
    };

    const json = safeStableStringify(stable);
    const hash = sha256(json);
    return `koda:${parts.namespace}:${hash}`;
  }

  /**
   * Read from cache.
   */
  async get<T>(key: string): Promise<CacheGetResult<T>> {
    if (!this.config.enabled) return { hit: false };

    const nowMs = Date.now();

    try {
      if (this.external) {
        const raw = await this.external.get(key);
        if (!raw) return { hit: false };
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (parsed?.meta?.expiresAtMs && parsed.meta.expiresAtMs <= nowMs) {
          // best-effort delete
          await this.external.del(key).catch(() => undefined);
          return { hit: false };
        }
        return { hit: true, entry: parsed };
      }

      if (!this.memory) return { hit: false };
      const raw = this.memory.get(key, nowMs);
      if (!raw) return { hit: false };
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      return { hit: true, entry: parsed };
    } catch {
      // Fail-closed: treat as miss
      return { hit: false };
    }
  }

  /**
   * Set cache entry.
   */
  async set<T>(key: string, value: T, options?: Partial<CacheSetOptions> & { namespace?: CacheNamespace }): Promise<void> {
    if (!this.config.enabled) return;

    const nowMs = Date.now();
    const namespace = options?.namespace ?? inferNamespaceFromKey(key) ?? 'other';
    const ttlMs = options?.ttlMs ?? this.config.defaultTtlMs[namespace] ?? 60_000;

    const entry: CacheEntry<T> = {
      value,
      meta: {
        createdAtMs: nowMs,
        expiresAtMs: nowMs + ttlMs,
        keyHash: key.split(':').slice(-1)[0] ?? key,
        namespace,
      },
    };

    const raw = JSON.stringify(entry);
    const bytes = Buffer.byteLength(raw, 'utf8');

    if (options?.maxBytes && bytes > options.maxBytes) return;

    try {
      if (this.external) {
        await this.external.set(key, raw, ttlMs);
        return;
      }
      if (!this.memory) return;
      this.memory.set(key, raw, ttlMs, nowMs);
    } catch {
      // best-effort; do not throw
    }
  }

  /**
   * Delete a specific key.
   */
  async del(key: string): Promise<void> {
    try {
      if (this.external) return await this.external.del(key);
      this.memory?.delete(key);
    } catch {
      // no-op
    }
  }

  /**
   * Clear a namespace (best-effort).
   * For memory backend, deletes by prefix.
   * For external backend, uses clearPrefix if provided; otherwise no-op.
   */
  async clearNamespace(namespace: CacheNamespace): Promise<void> {
    const prefix = `koda:${namespace}:`;
    try {
      if (this.external?.clearPrefix) {
        await this.external.clearPrefix(prefix);
        return;
      }
      this.memory?.clearPrefix(prefix);
    } catch {
      // no-op
    }
  }

  /**
   * Stats (best-effort; external backend does not expose key count by default).
   */
  getStats(): CacheStats {
    if (this.external) {
      return {
        backend: 'external',
        size: 0,
        hits: 0,
        misses: 0,
        evictions: 0,
      };
    }
    const s = this.memory?.getStats() ?? { size: 0, hits: 0, misses: 0, evictions: 0 };
    return { backend: 'memory', ...s };
  }
}

/* ------------------------- helpers ------------------------- */

/**
 * Stable stringify with sorted keys (deterministic hashing).
 * - Handles basic objects/arrays/primitives
 * - Drops undefined
 * - Converts BigInt to string
 */
function safeStableStringify(input: unknown): string {
  return JSON.stringify(sortKeysDeep(normalizeJson(input)));
}

function normalizeJson(x: unknown): unknown {
  if (x === null) return null;

  const t = typeof x;
  if (t === 'string' || t === 'number' || t === 'boolean') return x;
  if (t === 'bigint') return x.toString();
  if (t === 'undefined' || t === 'function' || t === 'symbol') return null;

  if (Array.isArray(x)) return x.map(normalizeJson);

  if (t === 'object') {
    const obj = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'undefined') continue;
      out[k] = normalizeJson(v);
    }
    return out;
  }

  return null;
}

function sortKeysDeep(x: unknown): unknown {
  if (x === null) return null;
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  if (typeof x !== 'object') return x;

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeysDeep(obj[k]);
  return out;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function inferNamespaceFromKey(key: string): CacheNamespace | null {
  // Expected format: koda:<namespace>:<hash>
  const parts = key.split(':');
  if (parts.length < 3) return null;
  const ns = parts[1] as CacheNamespace;
  return ns ?? null;
}
