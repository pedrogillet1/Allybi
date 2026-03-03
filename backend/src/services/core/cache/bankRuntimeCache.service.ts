export interface BankRuntimeCacheOptions {
  maxEntries: number;
  ttlMs: number;
}

export interface BankRuntimeCacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  expirations: number;
  size: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  touchedAt: number;
}

export class BankRuntimeCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(private readonly options: BankRuntimeCacheOptions) {}

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    const now = Date.now();
    if (entry.expiresAt <= now) {
      this.cache.delete(key);
      this.expirations += 1;
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    entry.touchedAt = now;
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    const now = Date.now();
    this.sets += 1;
    this.cache.set(key, {
      value,
      expiresAt: now + this.options.ttlMs,
      touchedAt: now,
    });
    this.evictIfNeeded();
  }

  delete(key: string): void {
    if (this.cache.delete(key)) {
      this.deletes += 1;
    }
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): BankRuntimeCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      evictions: this.evictions,
      expirations: this.expirations,
      size: this.cache.size,
    };
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.options.maxEntries) return;
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].touchedAt - b[1].touchedAt,
    );
    const overflow = Math.max(0, this.cache.size - this.options.maxEntries);
    for (let i = 0; i < overflow; i++) {
      this.cache.delete(entries[i][0]);
      this.evictions += 1;
    }
  }
}
