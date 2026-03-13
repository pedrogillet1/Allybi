import type {
  BankLoader,
  IRetrievalEngine,
  QueryNormalizer,
} from "../retrieval.types";
import {
  PrismaRetrievalAdapterFactory,
  type PrismaRetrievalEngineDependencies,
} from "../prismaRetrievalAdapters.service";
import {
  createRetrievalEngine,
  getActiveRetrievalEngineDescriptor,
  getActiveRetrievalEngineMode,
  type ActiveRetrievalEngineMode,
  type RetrievalDocumentIntelligenceBanks,
} from "./RetrievalEngineFactory";
import { getQueryNormalizerIdentity } from "./DefaultQueryNormalizer.service";

interface TimedCacheEntry<T> {
  value: T;
  createdAt: number;
  lastAccessedAt: number;
}

export interface UserScopedRetrievalRuntimeOptions {
  adapterFactory: PrismaRetrievalAdapterFactory;
  bankLoader: BankLoader;
  queryNormalizer: QueryNormalizer;
  documentIntelligenceBanks: RetrievalDocumentIntelligenceBanks;
  maxCachedUsers?: number;
  cacheTtlMs?: number;
}

export interface UserScopedRetrievalRuntimeDescription {
  activeEngineMode: ActiveRetrievalEngineMode;
  activeEngineId: string;
  runtimeFingerprint: string;
  cachedUserCount: number;
  hasQueryNormalizer: boolean;
  dependencyIdentity: {
    adapterFactoryId: string;
    bankLoaderId: string;
    queryNormalizerId: string;
    documentIntelligenceBanksId: string;
  };
  cachePolicy: {
    maxCachedUsers: number;
    cacheTtlMs: number;
  };
  cacheStats: {
    dependencyHits: number;
    dependencyMisses: number;
    engineHits: number;
    engineMisses: number;
    engineBuilds: number;
    invalidations: number;
    lastInvalidationReason: string | null;
  };
  lastRuntimeValidationAt: number | null;
}

export class UserScopedRetrievalRuntime {
  private readonly adapterFactory: PrismaRetrievalAdapterFactory;
  private readonly bankLoader: BankLoader;
  private readonly queryNormalizer: QueryNormalizer;
  private readonly documentIntelligenceBanks: RetrievalDocumentIntelligenceBanks;
  private readonly dependenciesByUser = new Map<
    string,
    TimedCacheEntry<PrismaRetrievalEngineDependencies>
  >();
  private readonly enginesByUser = new Map<
    string,
    TimedCacheEntry<IRetrievalEngine>
  >();
  private readonly activeEngineMode: ActiveRetrievalEngineMode;
  private readonly maxCachedUsers: number;
  private readonly cacheTtlMs: number;
  private runtimeFingerprint: string;
  private dependencyHits = 0;
  private dependencyMisses = 0;
  private engineHits = 0;
  private engineMisses = 0;
  private engineBuilds = 0;
  private invalidations = 0;
  private lastInvalidationReason: string | null = null;
  private lastRuntimeValidationAt: number | null = null;

  constructor(opts: UserScopedRetrievalRuntimeOptions) {
    this.validateBootstrapOptions(opts);
    this.adapterFactory = opts.adapterFactory;
    this.bankLoader = opts.bankLoader;
    this.queryNormalizer = opts.queryNormalizer;
    this.documentIntelligenceBanks = opts.documentIntelligenceBanks;
    this.activeEngineMode = getActiveRetrievalEngineMode();
    this.maxCachedUsers = Math.max(1, opts.maxCachedUsers ?? 128);
    this.cacheTtlMs = Math.max(1_000, opts.cacheTtlMs ?? 15 * 60_000);
    this.runtimeFingerprint = this.buildRuntimeFingerprint();
  }

  getActiveEngineMode(): ActiveRetrievalEngineMode {
    return this.activeEngineMode;
  }

  getActiveEngineDescriptor() {
    return getActiveRetrievalEngineDescriptor();
  }

  getDependenciesForUser(userId: string): PrismaRetrievalEngineDependencies {
    this.ensureRuntimeFingerprintCurrent();
    const key = String(userId || "").trim();
    if (!key) {
      throw new Error("retrieval_runtime_user_id_required");
    }
    this.pruneExpiredEntries();

    const existing = this.dependenciesByUser.get(key);
    if (existing) {
      this.dependencyHits += 1;
      existing.lastAccessedAt = Date.now();
      return existing.value;
    }
    this.dependencyMisses += 1;

    const created = this.adapterFactory.createForUser(key);
    this.dependenciesByUser.set(key, this.createTimedEntry(created));
    this.evictOverflowUsers();
    return created;
  }

  getEngineForUser(userId: string): IRetrievalEngine {
    this.ensureRuntimeFingerprintCurrent();
    const key = String(userId || "").trim();
    if (!key) {
      throw new Error("retrieval_runtime_user_id_required");
    }
    this.pruneExpiredEntries();

    const existing = this.enginesByUser.get(key);
    if (existing) {
      this.engineHits += 1;
      existing.lastAccessedAt = Date.now();
      return existing.value;
    }
    this.engineMisses += 1;

    const deps = this.getDependenciesForUser(key);
    const engine = createRetrievalEngine({
      bankLoader: this.bankLoader,
      docStore: deps.docStore,
      semanticIndex: deps.semanticIndex,
      lexicalIndex: deps.lexicalIndex,
      structuralIndex: deps.structuralIndex,
      queryNormalizer: this.queryNormalizer,
      documentIntelligenceBanks: this.documentIntelligenceBanks,
    });
    this.enginesByUser.set(key, this.createTimedEntry(engine));
    this.engineBuilds += 1;
    this.evictOverflowUsers();
    return engine;
  }

  invalidateUser(userId: string, reason = "manual_user_invalidation"): void {
    const key = String(userId || "").trim();
    if (!key) return;
    this.dependenciesByUser.delete(key);
    this.enginesByUser.delete(key);
    this.invalidations += 1;
    this.lastInvalidationReason = reason;
  }

  evictUser(userId: string): void {
    this.invalidateUser(userId, "evict_user");
  }

  invalidateAll(reason = "manual_runtime_invalidation"): void {
    this.dependenciesByUser.clear();
    this.enginesByUser.clear();
    this.invalidations += 1;
    this.lastInvalidationReason = reason;
  }

  describe(): UserScopedRetrievalRuntimeDescription {
    this.ensureRuntimeFingerprintCurrent();
    const descriptor = getActiveRetrievalEngineDescriptor();
    return {
      activeEngineMode: this.activeEngineMode,
      activeEngineId: descriptor.engineId,
      runtimeFingerprint: this.runtimeFingerprint,
      cachedUserCount: this.enginesByUser.size,
      hasQueryNormalizer: true,
      dependencyIdentity: {
        adapterFactoryId: this.resolveIdentity(this.adapterFactory),
        bankLoaderId: this.resolveIdentity(this.bankLoader),
        queryNormalizerId: getQueryNormalizerIdentity(this.queryNormalizer),
        documentIntelligenceBanksId: this.resolveIdentity(
          this.documentIntelligenceBanks,
        ),
      },
      cachePolicy: {
        maxCachedUsers: this.maxCachedUsers,
        cacheTtlMs: this.cacheTtlMs,
      },
      cacheStats: {
        dependencyHits: this.dependencyHits,
        dependencyMisses: this.dependencyMisses,
        engineHits: this.engineHits,
        engineMisses: this.engineMisses,
        engineBuilds: this.engineBuilds,
        invalidations: this.invalidations,
        lastInvalidationReason: this.lastInvalidationReason,
      },
      lastRuntimeValidationAt: this.lastRuntimeValidationAt,
    };
  }

  private validateBootstrapOptions(
    opts: UserScopedRetrievalRuntimeOptions,
  ): void {
    if (!opts.adapterFactory?.createForUser) {
      throw new Error("retrieval_runtime_adapter_factory_required");
    }
    if (!opts.bankLoader?.getBank) {
      throw new Error("retrieval_runtime_bank_loader_required");
    }
    if (!opts.queryNormalizer?.normalize) {
      throw new Error("retrieval_runtime_query_normalizer_required");
    }
    if (
      !opts.documentIntelligenceBanks?.getCrossDocGroundingPolicy ||
      !opts.documentIntelligenceBanks?.getDocumentIntelligenceDomains ||
      !opts.documentIntelligenceBanks?.getDocTypeCatalog
    ) {
      throw new Error("retrieval_runtime_document_intelligence_banks_required");
    }
  }

  private pruneExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.dependenciesByUser.entries()) {
      if (entry.createdAt + this.cacheTtlMs <= now) {
        this.dependenciesByUser.delete(key);
        this.enginesByUser.delete(key);
      }
    }
    for (const [key, entry] of this.enginesByUser.entries()) {
      if (entry.createdAt + this.cacheTtlMs <= now) {
        this.enginesByUser.delete(key);
      }
    }
  }

  private evictOverflowUsers(): void {
    const overflow = Math.max(0, this.enginesByUser.size - this.maxCachedUsers);
    if (overflow <= 0) return;
    const oldestUsers = Array.from(this.enginesByUser.entries())
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
      .slice(0, overflow)
      .map(([userId]) => userId);
    for (const userId of oldestUsers) {
      this.invalidateUser(userId, "max_cached_users_exceeded");
    }
  }

  private createTimedEntry<T>(value: T): TimedCacheEntry<T> {
    const now = Date.now();
    return {
      value,
      createdAt: now,
      lastAccessedAt: now,
    };
  }

  private resolveIdentity(value: object): string {
    return value?.constructor?.name || "anonymous_dependency";
  }

  private ensureRuntimeFingerprintCurrent(): void {
    const nextFingerprint = this.buildRuntimeFingerprint();
    this.lastRuntimeValidationAt = Date.now();
    if (nextFingerprint === this.runtimeFingerprint) return;
    this.runtimeFingerprint = nextFingerprint;
    this.invalidateAll("runtime_fingerprint_changed");
  }

  private buildRuntimeFingerprint(): string {
    const descriptor = getActiveRetrievalEngineDescriptor();
    return [
      `engine=${descriptor.engineId}`,
      `adapter=${this.resolveIdentity(this.adapterFactory)}`,
      `bank_loader=${this.resolveIdentity(this.bankLoader)}`,
      `query_normalizer=${getQueryNormalizerIdentity(this.queryNormalizer)}`,
      `doc_intelligence=${this.resolveIdentity(this.documentIntelligenceBanks)}`,
    ].join("|");
  }
}
