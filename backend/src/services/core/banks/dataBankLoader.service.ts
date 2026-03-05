/**
 * Koda Data Bank Loader (ChatGPT-parity, production-safe)
 * ------------------------------------------------------
 * Goals:
 *  1) Deterministic loading across environments (production/staging/dev/local)
 *  2) Canonical single source of truth via manifest/bank_registry.any.json
 *  3) Strict JSON only (no comments), schema-ready, dependency-aware
 *  4) Bootstrap-safe: load registry + minimal manifest without schema validation first
 *  5) Validate and fail early for missing required banks, bad env keys, cyclic deps, duplicate ids/paths
 *  6) Runtime-friendly: cached banks, frozen objects, safe accessors
 *
 * This loader does NOT generate content. It only loads & validates the bank JSONs.
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { nowIso, sha256, stripBom } from "./dataBankLoader.shared";
import { getBankTierPolicyInstance } from "./bankTierPolicy.service";

type EnvName = "production" | "staging" | "dev" | "local";

export interface DataBankLoaderOptions {
  rootDir: string; // e.g., path.join(process.cwd(), "backend/src/data_banks")
  env: EnvName;
  strict: boolean; // strictLoad / failOnMissingRequired behavior
  validateSchemas: boolean; // validate banks against schemaId when possible
  allowEmptyChecksumsInNonProd: boolean;
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export interface BankMeta {
  id: string;
  version: string;
  description: string;
  languages: string[];
  lastUpdated: string;
  owner?: string;
  compat?: string;
  changeLog?: string[];
}

export interface BankFile {
  _meta: BankMeta;
  config: { enabled: boolean; [k: string]: unknown };
  [k: string]: unknown;
}

export interface BankRegistryEntry {
  id: string;
  category: string;
  filename: string;
  path: string; // category/filename (canonical)
  version: string;
  schemaId?: string;
  contentType?: string;
  dependsOn?: string[];
  enabledByEnv?: Record<EnvName, boolean>;
  requiredByEnv?: Record<EnvName, boolean>;
  checksumSha256?: string;
  lastUpdated?: string;
  deprecated?: boolean;
  replacedBy?: string;
}

export interface BankRegistryFile {
  _meta: BankMeta;
  config: Record<string, unknown>;
  schemaMap?: Record<string, string>;
  loadOrder?: string[];
  banks: BankRegistryEntry[];
  tests?: unknown;
}

export interface BankAliasesFile {
  _meta: BankMeta;
  config: Record<string, unknown>;
  aliases: Record<string, string>;
  tests?: unknown;
}

export interface BankDependencyNode {
  id: string;
  dependsOn?: string[];
  optional?: boolean;
}

export interface BankDependenciesFile {
  _meta: BankMeta;
  config: Record<string, unknown>;
  banks: BankDependencyNode[];
  tests?: unknown;
}

export class DataBankError extends Error {
  constructor(
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DataBankError";
  }
}

function isEnvName(x: unknown): x is EnvName {
  return x === "production" || x === "staging" || x === "dev" || x === "local";
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const v = (obj as Record<string, unknown>)[key];
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
  }
  return obj;
}

function assertNoJsonComments(raw: string, fileHint: string) {
  // Strict JSON: disallow // and /* */
  // Allow URLs in strings by a conservative scan (remove string literals before checking)
  const withoutStrings = raw.replace(/"([^"\\]|\\.)*"/g, '""');
  if (/(^|\s)\/\/|\/\*/.test(withoutStrings)) {
    throw new DataBankError(
      `Invalid JSON (comments not allowed) in ${fileHint}`,
      { fileHint },
    );
  }
}

function safeParseJson<T>(raw: string, fileHint: string): T {
  const cleaned = stripBom(raw);
  assertNoJsonComments(cleaned, fileHint);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err: unknown) {
    const errRecord = err as Record<string, unknown> | null;
    throw new DataBankError(
      `Invalid JSON in ${fileHint}: ${errRecord?.message ?? String(err)}`,
      { fileHint },
    );
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requireFields(obj: unknown, fields: string[], fileHint: string) {
  const record = asObject(obj);
  for (const f of fields) {
    if (!(f in record))
      throw new DataBankError(`Missing required field '${f}' in ${fileHint}`, {
        fileHint,
        field: f,
      });
  }
}

function normalizeRegistryPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function ensureEnvMap(map: unknown, fileHint: string): Record<EnvName, boolean> {
  const out: Record<EnvName, boolean> = {
    production: false,
    staging: false,
    dev: false,
    local: false,
  };
  if (!map) return out;
  const mapRecord = asObject(map);
  for (const k of Object.keys(mapRecord)) {
    if (!isEnvName(k)) {
      throw new DataBankError(
        `Invalid env key '${k}' in ${fileHint}. Must be production|staging|dev|local`,
        { fileHint, key: k },
      );
    }
    out[k] = Boolean(mapRecord[k]);
  }
  return out;
}

function normalizeAliasKey(value: string, options: Record<string, unknown>): string {
  let out = String(value || "").trim();
  if (options?.collapseWhitespace !== false) {
    out = out.replace(/\s+/g, " ");
  }
  if (options?.stripDiacritics) {
    out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  if (!options?.caseSensitive) {
    out = out.toLowerCase();
  }
  return out;
}

function toStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

/**
 * Minimal bank-level contract checks (schema-lite).
 * Real schema validation can be enabled via AJV if present.
 */
function validateMinimalBankContract(bank: unknown, fileHint: string) {
  const bankRecord = asObject(bank);
  requireFields(bankRecord, ["_meta", "config"], fileHint);
  const meta = asObject(bankRecord._meta);
  const config = asObject(bankRecord.config);
  requireFields(meta, ["id", "version", "description"], fileHint);
  if (typeof meta.id !== "string" || meta.id.length < 1) {
    throw new DataBankError(`Invalid _meta.id in ${fileHint}`, { fileHint });
  }
  if (
    typeof config.enabled !== "undefined" &&
    typeof config.enabled !== "boolean"
  ) {
    throw new DataBankError(
      `Invalid config.enabled in ${fileHint} (must be boolean)`,
      { fileHint },
    );
  }
  // Default config.enabled to true if missing
  if (typeof config.enabled === "undefined") {
    config.enabled = true;
    bankRecord.config = config;
  }
}

/**
 * Optional AJV-based schema validation:
 * - If AJV is not installed, we fall back to minimal contract checks.
 * - If schema banks are not JSON Schema, you can still keep validateSchemas=false.
 */
function tryCreateAjv(): unknown | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Ajv = require("ajv");
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
    });
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const addFormats = require("ajv-formats");
      if (typeof addFormats === "function") {
        addFormats(ajv);
      }
    } catch {
      // Optional: schema validation remains available without extra formats.
    }
    return ajv;
  } catch {
    return null;
  }
}

export class DataBankLoaderService {
  private readonly opts: DataBankLoaderOptions;
  private readonly logger: NonNullable<DataBankLoaderOptions["logger"]>;

  private registry: BankRegistryFile | null = null;
  private aliases: BankAliasesFile | null = null;
  private aliasEntries: Array<{ alias: string; canonicalId: string }> = [];
  private aliasNormalizedMap = new Map<string, string>();
  private dependencies: BankDependenciesFile | null = null;

  // Loaded banks (canonical id -> bank object)
  private bankCache = new Map<string, BankFile>();

  // For diagnostics and determinism
  private loadLog: Array<{ id: string; path: string; loadedAt: string }> = [];

  // Schema cache (schemaId -> schema object)
  private schemaCache = new Map<string, unknown>();
  private bootstrapReady = false;
  private bankUsageCounts = new Map<string, number>();
  private bankLoadDurationsMs = new Map<string, number>();
  private bankLoadSamplesMs = new Map<string, number[]>();
  private bankLastAccessMs = new Map<string, number>();
  private readonly tierPolicy = getBankTierPolicyInstance();

  // AJV instance if available and enabled
  private ajv: any = null;

  constructor(options: DataBankLoaderOptions) {
    this.opts = options;
    this.logger = options.logger ?? {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };

    if (this.opts.validateSchemas) {
      this.ajv = tryCreateAjv();
      if (!this.ajv) {
        this.logger.warn(
          "AJV not available; falling back to minimal contract validation only.",
        );
      }
    }
  }

  // -------------------------
  // Public API
  // -------------------------

  /**
   * Load all banks (registry-driven).
   * Call once at boot; then use getBank().
   */
  async loadAll(): Promise<void> {
    await this.bootstrap(true);
    const ordered = this.resolveLoadOrder();
    await this.loadEntries(ordered);
    if (this.opts.strict) {
      this.assertRequiredBanksLoaded();
    }
    this.validateDocumentIntelligenceContracts();
    this.logger.info("Data banks loaded successfully", {
      env: this.opts.env,
      loaded: this.bankCache.size,
      mode: "eager_all",
    });
  }

  async loadByIds(bankIds: string[]): Promise<{
    loadedBankIds: string[];
    missingBankIds: string[];
  }> {
    await this.bootstrap(false);
    const entries = this.resolveEntriesForIds(bankIds);
    const result = await this.loadEntries(entries);
    this.logger.info("Data banks loaded by id set", {
      env: this.opts.env,
      requested: bankIds.length,
      selected: entries.length,
      loadedNow: result.loadedBankIds.length,
      missing: result.missingBankIds.length,
    });
    return result;
  }

  async preloadUniversalBanks(
    bankIds: string[] = [
      "intent_config",
      "intent_patterns",
      "operator_families",
      "operator_contracts",
      "operator_output_shapes",
      "document_intelligence_bank_map",
      "semantic_search_config",
      "retrieval_ranker_config",
      "diversification_rules",
      "retrieval_negatives",
      "evidence_packaging",
      "scope_resolution",
      "routing_priority",
      "operator_collision_matrix",
      "memory_policy",
      "clarification_policy",
      "fallback_policy",
      "compliance_policy",
      "logging_policy",
      "rate_limit_policy",
      "refusal_policy",
    ],
  ): Promise<{ loadedBankIds: string[]; missingBankIds: string[] }> {
    await this.bootstrap(false);
    const result = await this.loadByIds(bankIds);
    this.logger.info("Universal bank preload completed", {
      requested: bankIds.length,
      loadedNow: result.loadedBankIds.length,
      missing: result.missingBankIds.length,
    });
    return result;
  }

  getBankUsageStats(): {
    usageCounts: Record<string, number>;
    loadDurationsMs: Record<string, number>;
    loadP95Ms: Record<string, number>;
  } {
    const loadP95Ms: Record<string, number> = {};
    for (const [bankId, samples] of this.bankLoadSamplesMs.entries()) {
      if (!Array.isArray(samples) || samples.length === 0) continue;
      loadP95Ms[bankId] = this.percentile(samples, 0.95);
    }
    return {
      usageCounts: Object.fromEntries(this.bankUsageCounts.entries()),
      loadDurationsMs: Object.fromEntries(this.bankLoadDurationsMs.entries()),
      loadP95Ms,
    };
  }

  private async bootstrap(forceReset: boolean): Promise<void> {
    if (forceReset || !this.bootstrapReady) {
      this.bankCache.clear();
      this.schemaCache.clear();
      this.loadLog = [];
      this.aliasEntries = [];
      this.aliasNormalizedMap.clear();
      this.dependencies = null;
      this.bankUsageCounts.clear();
      this.bankLoadDurationsMs.clear();
      this.bankLoadSamplesMs.clear();
      this.bankLastAccessMs.clear();

      await this.loadRegistryBootstrap();
      await this.loadAliasesBootstrap();
      await this.loadDependenciesBootstrap();
      this.validateRegistryIntegrity();
      this.validateAliasIntegrity();
      this.validateDependencyGraphIntegrity();
      await this.loadSchemasBootstrap();
      await this.loadCompiledArtifactsBootstrap();
      this.bootstrapReady = true;
    }
  }

  private async loadEntries(entries: BankRegistryEntry[]): Promise<{
    loadedBankIds: string[];
    missingBankIds: string[];
  }> {
    const loadedBankIds: string[] = [];
    const missingBankIds: string[] = [];

    for (const entry of entries) {
      if (!this.isEnabledInEnv(entry)) continue;
      const relPath = normalizeRegistryPath(String(entry.path || ""));
      if (relPath.startsWith("_deprecated/")) {
        this.logger.warn("Skipping deprecated bank path", {
          id: entry.id,
          path: relPath,
        });
        continue;
      }
      if (this.bankCache.has(entry.id)) continue;

      const filePath = path.join(
        this.opts.rootDir,
        normalizeRegistryPath(entry.path),
      );

      try {
        const startedAt = Date.now();
        const bank = await this.readBankFile<BankFile>(filePath, entry.id);
        validateMinimalBankContract(bank, entry.path);

        if (bank._meta?.id !== entry.id) {
          const mismatchMessage = `Bank _meta.id mismatch for ${entry.id}. Registry id=${entry.id}, file _meta.id=${bank._meta?.id}`;
          if (this.opts.strict) {
            throw new DataBankError(mismatchMessage, {
              entry,
              fileMetaId: bank._meta?.id,
            });
          }
          this.logger.warn(mismatchMessage, {
            entryId: entry.id,
            fileMetaId: bank._meta?.id,
            path: entry.path,
            strict: this.opts.strict,
          });
          bank._meta.id = entry.id;
        }

        await this.validateChecksumPolicy(entry, filePath);
        if (this.opts.validateSchemas) {
          await this.validateAgainstSchema(entry, bank);
        }

        this.bankCache.set(entry.id, deepFreeze(bank));
        this.loadLog.push({ id: entry.id, path: entry.path, loadedAt: nowIso() });
        const loadDurationMs = Date.now() - startedAt;
        this.bankLoadDurationsMs.set(entry.id, loadDurationMs);
        const samples = this.bankLoadSamplesMs.get(entry.id) || [];
        samples.push(loadDurationMs);
        if (samples.length > 200) {
          samples.splice(0, samples.length - 200);
        }
        this.bankLoadSamplesMs.set(entry.id, samples);
        this.touchBank(entry.id);
        this.evictColdBanksIfNeeded();
        loadedBankIds.push(entry.id);
      } catch (error: unknown) {
        const reason = (error as Record<string, unknown>)?.message || "unknown";
        missingBankIds.push(entry.id);
        if (this.opts.strict && this.isRequiredInEnv(entry)) {
          if (error instanceof DataBankError) {
            throw error;
          }
          throw new DataBankError(`Failed loading required bank: ${entry.id}`, {
            entryId: entry.id,
            path: entry.path,
            reason,
          });
        }
        this.logger.warn("Skipping failed optional bank load", {
          entryId: entry.id,
          path: entry.path,
          reason: String(reason),
        });
      }
    }

    return {
      loadedBankIds,
      missingBankIds: missingBankIds.sort((a, b) => a.localeCompare(b)),
    };
  }

  private resolveEntriesForIds(bankIds: string[]): BankRegistryEntry[] {
    if (!this.registry) return [];
    const byId = new Map(this.registry.banks.map((entry) => [entry.id, entry]));
    const seen = new Set<string>();
    const out: BankRegistryEntry[] = [];
    const overlayDeps = new Map<string, string[]>();

    if (this.dependencies && Array.isArray(this.dependencies.banks)) {
      for (const node of this.dependencies.banks) {
        const id = String(node?.id || "").trim();
        if (!id) continue;
        overlayDeps.set(id, toStringList(node?.dependsOn));
      }
    }

    const visit = (idRaw: string) => {
      const canonical = this.resolveAlias(idRaw);
      if (!canonical || seen.has(canonical)) return;
      seen.add(canonical);

      const entry = byId.get(canonical);
      if (!entry) return;

      const directDeps = Array.isArray(entry.dependsOn) ? entry.dependsOn : [];
      for (const dep of directDeps) visit(dep);
      for (const dep of overlayDeps.get(canonical) || []) visit(dep);

      out.push(entry);
    };

    for (const idRaw of bankIds) visit(idRaw);
    return out;
  }

  /**
   * Retrieve a bank by id. Supports alias resolution.
   */
  getBank<T = unknown>(id: string): T {
    const canonical = this.resolveAlias(id);
    const bank = this.bankCache.get(canonical);
    if (!bank) {
      throw new DataBankError(
        `Bank not loaded: ${id} (canonical=${canonical})`,
        {
          id,
          canonical,
          loadedIds: Array.from(this.bankCache.keys()).slice(0, 50),
        },
      );
    }
    this.bankUsageCounts.set(
      canonical,
      (this.bankUsageCounts.get(canonical) || 0) + 1,
    );
    this.touchBank(canonical);
    return bank as unknown as T;
  }

  /**
   * List loaded banks
   */
  listLoadedIds(): string[] {
    return Array.from(this.bankCache.keys());
  }

  /**
   * Diagnostics: load log
   */
  getLoadLog(): Array<{ id: string; path: string; loadedAt: string }> {
    return [...this.loadLog];
  }

  /**
   * Get registry entry by id (canonical)
   */
  getRegistryEntry(id: string): BankRegistryEntry | null {
    if (!this.registry) return null;
    const canonical = this.resolveAlias(id);
    return this.registry.banks.find((b) => b.id === canonical) ?? null;
  }

  private touchBank(bankId: string): void {
    this.bankLastAccessMs.set(String(bankId || "").trim(), Date.now());
  }

  private evictColdBanksIfNeeded(): void {
    const configuredMax = Number(process.env.BANK_COLD_CACHE_MAX_BANKS || 240);
    if (!Number.isFinite(configuredMax) || configuredMax <= 0) return;
    const maxColdBanks = Math.floor(configuredMax);

    const coldBankIds = Array.from(this.bankCache.keys()).filter(
      (bankId) => this.tierPolicy.decide(bankId).tier === "cold",
    );
    if (coldBankIds.length <= maxColdBanks) return;

    const overflow = coldBankIds.length - maxColdBanks;
    const sortedByLastAccess = coldBankIds.sort((a, b) => {
      const aTs = this.bankLastAccessMs.get(a) || 0;
      const bTs = this.bankLastAccessMs.get(b) || 0;
      if (aTs !== bTs) return aTs - bTs;
      return a.localeCompare(b);
    });

    const evicted: string[] = [];
    for (let i = 0; i < overflow; i++) {
      const bankId = sortedByLastAccess[i];
      if (!bankId) continue;
      this.bankCache.delete(bankId);
      this.bankLastAccessMs.delete(bankId);
      evicted.push(bankId);
    }

    if (evicted.length > 0) {
      this.logger.info("Evicted cold banks from runtime cache", {
        evictedCount: evicted.length,
        evictedSample: evicted.slice(0, 20),
        maxColdBanks,
        remainingLoaded: this.bankCache.size,
      });
    }
  }

  private percentile(values: number[], q: number): number {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = [...values]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const clamped = Math.min(1, Math.max(0, q));
    const idx = Math.max(0, Math.ceil(clamped * sorted.length) - 1);
    return sorted[idx];
  }

  // -------------------------
  // Bootstrap steps
  // -------------------------

  private async loadCompiledArtifactsBootstrap(): Promise<void> {
    if (process.env.BANK_COMPILED_ARTIFACTS_ENABLED !== "true") return;
    const artifactFiles = [
      "section_heading_index.any.json",
      "docType_signature_index.any.json",
      "alias_trie.any.json",
      "table_header_hash_index.any.json",
    ];

    for (const filename of artifactFiles) {
      const artifactPath = path.join(
        this.opts.rootDir,
        ".compiled",
        filename,
      );
      if (!fsSync.existsSync(artifactPath)) continue;
      try {
        const raw = await fs.readFile(artifactPath, "utf8");
        const parsed = safeParseJson<Record<string, unknown>>(
          raw,
          `.compiled/${filename}`,
        );
        const bankId = `compiled_${filename.replace(".any.json", "")}`;
        const bank: BankFile = {
          _meta: {
            id: bankId,
            version: "1.0.0",
            description: `Compiled artifact for ${filename}`,
            languages: ["any"],
            lastUpdated: nowIso(),
          },
          config: { enabled: true },
          artifact: parsed,
          sourceFile: filename,
        };
        this.bankCache.set(bankId, deepFreeze(bank));
        this.loadLog.push({
          id: bankId,
          path: `.compiled/${filename}`,
          loadedAt: nowIso(),
        });
      } catch (error: unknown) {
        this.logger.warn("Failed loading compiled artifact", {
          filename,
          error: (error as Record<string, unknown>)?.message || String(error),
        });
      }
    }
  }

  private async loadRegistryBootstrap(): Promise<void> {
    const registryPath = path.join(
      this.opts.rootDir,
      "manifest/bank_registry.any.json",
    );
    const raw = await fs.readFile(registryPath, "utf8").catch((err: unknown) => {
      throw new DataBankError(`Missing bank registry at ${registryPath}`, {
        err: String(err),
      });
    });

    const registry = safeParseJson<BankRegistryFile>(
      raw,
      "manifest/bank_registry.any.json",
    );
    validateMinimalBankContract(registry, "manifest/bank_registry.any.json");
    requireFields(registry, ["banks"], "manifest/bank_registry.any.json");
    if (!Array.isArray(registry.banks))
      throw new DataBankError("bank_registry.banks must be an array");

    this.registry = registry;
    this.logger.info("Loaded bank registry", { banks: registry.banks.length });
  }

  private async loadAliasesBootstrap(): Promise<void> {
    const aliasesPath = path.join(
      this.opts.rootDir,
      "manifest/bank_aliases.any.json",
    );
    try {
      const raw = await fs.readFile(aliasesPath, "utf8");
      const parsed = safeParseJson<BankAliasesFile>(raw, "manifest/bank_aliases.any.json");
      validateMinimalBankContract(parsed as unknown as Record<string, unknown>, "manifest/bank_aliases.any.json");
      requireFields(parsed as unknown as Record<string, unknown>, ["aliases"], "manifest/bank_aliases.any.json");

      // Convert array format to Record<string, string> for resolveAlias()
      // Array format: [{ alias: "foo", canonicalId: "bar" }, ...]
      // Object format: { "foo": "bar", ... }
      const aliasMap: Record<string, string> = {};
      const aliasEntries: Array<{ alias: string; canonicalId: string }> = [];
      if (Array.isArray(parsed.aliases)) {
        for (const entry of parsed.aliases) {
          const alias = String(entry?.alias || "").trim();
          const canonicalId = String(entry?.canonicalId || "").trim();
          if (!alias || !canonicalId) continue;
          aliasMap[alias] = canonicalId;
          aliasEntries.push({ alias, canonicalId });
        }
      } else if (typeof parsed.aliases === "object") {
        for (const [alias, canonicalId] of Object.entries(parsed.aliases)) {
          const normalizedAlias = String(alias || "").trim();
          const normalizedCanonicalId = String(canonicalId || "").trim();
          if (!normalizedAlias || !normalizedCanonicalId) continue;
          aliasMap[normalizedAlias] = normalizedCanonicalId;
          aliasEntries.push({
            alias: normalizedAlias,
            canonicalId: normalizedCanonicalId,
          });
        }
      }

      this.aliases = { ...parsed, aliases: aliasMap };
      this.aliasEntries = aliasEntries;
      this.aliasNormalizedMap.clear();
      for (const entry of aliasEntries) {
        const normalized = normalizeAliasKey(entry.alias, parsed.config ?? {});
        if (!normalized) continue;
        if (!this.aliasNormalizedMap.has(normalized)) {
          this.aliasNormalizedMap.set(normalized, entry.canonicalId);
        }
      }
      this.logger.info("Loaded bank aliases", {
        aliases: Object.keys(aliasMap).length,
      });
    } catch {
      this.aliases = null;
      this.aliasEntries = [];
      this.aliasNormalizedMap.clear();
      this.logger.warn(
        "bank_aliases.any.json not found; alias resolution disabled",
      );
    }
  }

  private async loadDependenciesBootstrap(): Promise<void> {
    const depsPath = path.join(
      this.opts.rootDir,
      "manifest/bank_dependencies.any.json",
    );
    try {
      const raw = await fs.readFile(depsPath, "utf8");
      const parsed = safeParseJson<BankDependenciesFile>(
        raw,
        "manifest/bank_dependencies.any.json",
      );
      validateMinimalBankContract(
        parsed,
        "manifest/bank_dependencies.any.json",
      );
      requireFields(parsed, ["banks"], "manifest/bank_dependencies.any.json");
      if (!Array.isArray(parsed.banks)) {
        throw new DataBankError("bank_dependencies.banks must be an array");
      }
      this.dependencies = parsed;
      this.logger.info("Loaded bank dependencies", {
        nodes: parsed.banks.length,
      });
    } catch (err: unknown) {
      this.dependencies = null;
      const errMsg = (err as Record<string, unknown>)?.message || "missing";
      this.logger.warn(
        `bank_dependencies.any.json not loaded; dependency overlay disabled (${errMsg})`,
      );
    }
  }

  /**
   * Load schema banks early:
   * - Always try to load schemas/bank_schema.any.json if present in registry
   * - Also load any schema IDs referenced by registry entries (schemaId) if they are in registry
   */
  private async loadSchemasBootstrap(): Promise<void> {
    if (!this.registry) return;

    const schemaEntries = this.registry.banks.filter(
      (b) => b.category === "schemas" || (b.id ?? "").endsWith("_schema"),
    );
    for (const entry of schemaEntries) {
      if (!this.isEnabledInEnv(entry)) continue;
      const filePath = path.join(
        this.opts.rootDir,
        normalizeRegistryPath(entry.path),
      );
      const bank = await this.readBankFile<Record<string, unknown>>(filePath, entry.id);

      // Minimal schema bank contract
      validateMinimalBankContract(bank, entry.path);

      // Cache schema "payload"
      // Some schemas are in bank.action.schema or bank.schema; we store full bank and let validateAgainstSchema interpret it.
      this.schemaCache.set(entry.id, deepFreeze(bank));
      this.logger.info("Loaded schema bank", { id: entry.id });
    }
  }

  // -------------------------
  // Registry integrity
  // -------------------------

  private validateRegistryIntegrity(): void {
    if (!this.registry) throw new DataBankError("Registry not loaded");

    const ids = new Set<string>();
    const paths = new Set<string>();

    for (const b of this.registry.banks) {
      // Derive filename from path if not explicitly provided
      if (!b.filename && b.path) {
        (b as { filename: string }).filename = b.path.split("/").pop() || b.path;
      }

      if (!b.id || !b.path || !b.category) {
        throw new DataBankError(
          "Invalid registry entry (missing id/path/category)",
          { entry: b },
        );
      }

      const p = normalizeRegistryPath(b.path);
      if (p.startsWith("_deprecated/")) {
        this.logger.warn("Registry includes deprecated bank path (will skip)", {
          id: b.id,
          path: p,
        });
      }

      if (ids.has(b.id))
        throw new DataBankError(`Duplicate bank id in registry: ${b.id}`);
      if (paths.has(p))
        throw new DataBankError(`Duplicate bank path in registry: ${p}`);

      ids.add(b.id);
      paths.add(p);

      // Validate env keys
      if (b.enabledByEnv)
        ensureEnvMap(
          b.enabledByEnv,
          `bank_registry entry ${b.id}.enabledByEnv`,
        );
      if (b.requiredByEnv)
        ensureEnvMap(
          b.requiredByEnv,
          `bank_registry entry ${b.id}.requiredByEnv`,
        );
    }

    const categories = new Set(this.registry.banks.map((b) => b.category));
    const manifestPolicy = this.loadManifestCategoryPolicy();
    if (
      manifestPolicy?.strictCategories &&
      manifestPolicy?.failOnUnknownCategory
    ) {
      const unknownCategories = [...categories]
        .filter((category) => !manifestPolicy.allowedCategories.has(category))
        .sort((a, b) => a.localeCompare(b));
      if (unknownCategories.length > 0) {
        throw new DataBankError(
          "Registry contains categories not allowed by bank_manifest",
          { unknownCategories },
        );
      }
    }

    // Validate loadOrder categories exist
    const loadOrder = this.registry.loadOrder ?? [];
    if (Array.isArray(loadOrder) && loadOrder.length) {
      const loadOrderSet = new Set(loadOrder);
      const missingCategoriesInLoadOrder = [...categories]
        .filter((category) => !loadOrderSet.has(category))
        .sort((a, b) => a.localeCompare(b));
      if (missingCategoriesInLoadOrder.length > 0) {
        const details = {
          missingCategoriesInLoadOrder,
          loadOrder: [...loadOrder],
        };
        if (this.opts.strict) {
          throw new DataBankError("Registry categories missing from loadOrder", details);
        }
        this.logger.warn("Registry categories missing from loadOrder", details);
      }

      for (const c of loadOrder) {
        if (!categories.has(c)) {
          // allow categories with no banks only if explicitly intended; we warn instead of failing
          this.logger.warn("Registry loadOrder category has no banks", {
            category: c,
          });
        }
      }
    }

    // Validate that registry file itself is registered (optional but recommended)
    // If you register it, it must not cause bootstrap paradox; loader handles bootstrap anyway.

    this.logger.info("Registry integrity checks passed");
  }

  private loadManifestCategoryPolicy(): {
    strictCategories: boolean;
    failOnUnknownCategory: boolean;
    allowedCategories: Set<string>;
  } | null {
    const manifestPath = path.join(
      this.opts.rootDir,
      "manifest",
      "bank_manifest.any.json",
    );
    if (!fsSync.existsSync(manifestPath)) return null;
    try {
      const raw = fsSync.readFileSync(manifestPath, "utf8");
      const parsed = safeParseJson<Record<string, unknown>>(raw, "manifest/bank_manifest.any.json");
      const parsedConfig = asObject(parsed?.config);
      const allowedCategories = new Set(
        toStringList(parsed?.allowedCategoryIds).map((v) => String(v).trim()),
      );
      return {
        strictCategories: parsedConfig.strictCategories === true,
        failOnUnknownCategory: parsedConfig.failOnUnknownCategory === true,
        allowedCategories,
      };
    } catch {
      if (this.opts.strict) {
        throw new DataBankError(
          "Failed to parse manifest/bank_manifest.any.json for category policy",
        );
      }
      return null;
    }
  }

  private validateAliasIntegrity(): void {
    if (!this.aliases || !this.registry) return;

    const aliasConfig = this.aliases.config ?? {};
    const failOnCollision = Boolean(aliasConfig.failOnCollision);
    const failOnDanglingByEnv = ensureEnvMap(
      aliasConfig.failOnDanglingAliasByEnv,
      "bank_aliases.config.failOnDanglingAliasByEnv",
    );
    const shouldFailOnDangling = Boolean(failOnDanglingByEnv[this.opts.env]);
    const registryIds = new Set(this.registry.banks.map((b) => b.id));
    const normalizedAliasToCanonical = new Map<string, string>();
    const collisions: Array<{ alias: string; canonicalIds: string[] }> = [];
    const danglingAliases: Array<{ alias: string; canonicalId: string }> = [];
    const aliasMap = this.aliases.aliases ?? {};
    const entries = this.aliasEntries.length
      ? this.aliasEntries
      : Object.entries(aliasMap).map(([alias, canonicalId]) => ({
          alias,
          canonicalId,
        }));

    for (const entry of entries) {
      const normalizedAlias = normalizeAliasKey(entry.alias, aliasConfig);
      if (!normalizedAlias) continue;
      const canonicalId = String(entry.canonicalId || "").trim();
      if (!canonicalId) continue;

      const existingCanonical = normalizedAliasToCanonical.get(normalizedAlias);
      if (existingCanonical && existingCanonical !== canonicalId) {
        collisions.push({
          alias: entry.alias,
          canonicalIds: [existingCanonical, canonicalId],
        });
      } else {
        normalizedAliasToCanonical.set(normalizedAlias, canonicalId);
      }
    }

    const resolveChain = (inputAlias: string): string | null => {
      let current = String(inputAlias || "").trim();
      const seen = new Set<string>();
      for (let i = 0; i < 16; i++) {
        if (!current) return null;
        const normalized = normalizeAliasKey(current, aliasConfig);
        if (seen.has(normalized)) return null;
        seen.add(normalized);

        const mapped =
          aliasMap[current] ?? this.aliasNormalizedMap.get(normalized);
        if (!mapped) {
          return registryIds.has(current) ? current : null;
        }
        if (mapped === current) {
          return registryIds.has(mapped) ? mapped : null;
        }
        current = String(mapped || "").trim();
      }
      return null;
    };

    for (const entry of entries) {
      const alias = String(entry.alias || "").trim();
      const canonicalId = String(entry.canonicalId || "").trim();
      if (!alias || !canonicalId) continue;
      const resolved = resolveChain(alias);
      if (!resolved || !registryIds.has(resolved)) {
        danglingAliases.push({ alias, canonicalId });
      }
    }

    if (collisions.length > 0) {
      const details = {
        collisions: collisions.slice(0, 20),
        total: collisions.length,
      };
      if (failOnCollision || this.opts.strict) {
        throw new DataBankError("Alias collision detected", details);
      }
      this.logger.warn("Alias collisions detected (non-fatal)", details);
    }

    if (danglingAliases.length > 0) {
      const details = {
        dangling: danglingAliases.slice(0, 30),
        total: danglingAliases.length,
        env: this.opts.env,
      };
      if (shouldFailOnDangling || this.opts.strict) {
        throw new DataBankError("Dangling aliases detected", details);
      }
      this.logger.warn("Dangling aliases detected (non-fatal)", details);
    }
  }

  private validateDependencyGraphIntegrity(): void {
    if (!this.dependencies) return;

    const nodes = Array.isArray(this.dependencies.banks)
      ? this.dependencies.banks
      : [];
    const ids = new Set<string>();
    const duplicates = new Set<string>();
    for (const node of nodes) {
      const id = String(node?.id || "").trim();
      if (!id) continue;
      if (ids.has(id)) duplicates.add(id);
      ids.add(id);
    }

    if (duplicates.size > 0) {
      throw new DataBankError("Duplicate dependency graph node ids", {
        duplicates: [...duplicates].sort((a, b) => a.localeCompare(b)),
      });
    }

    // Validate cycle safety only across declared nodes.
    const byId = new Map<string, BankDependencyNode>(
      nodes
        .map((node) => ({
          ...node,
          id: String(node?.id || "").trim(),
          dependsOn: toStringList(node?.dependsOn),
        }))
        .filter((node) => node.id)
        .map((node) => [node.id, node]),
    );

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycles: string[] = [];
    const visit = (id: string, stack: string[]) => {
      if (visited.has(id) || cycles.length > 0) return;
      if (visiting.has(id)) {
        cycles.push([...stack, id].join(" -> "));
        return;
      }
      visiting.add(id);
      const node = byId.get(id);
      for (const dep of toStringList(node?.dependsOn)) {
        if (!byId.has(dep)) continue;
        visit(dep, [...stack, id]);
      }
      visiting.delete(id);
      visited.add(id);
    };

    for (const id of byId.keys()) {
      visit(id, []);
    }

    const failOnCycle = Boolean(this.dependencies?.config?.failOnCycle);
    if (cycles.length > 0) {
      const details = { cycles };
      if (failOnCycle || this.opts.strict) {
        throw new DataBankError("Dependency graph cycle detected", details);
      }
      this.logger.warn("Dependency graph cycle detected (non-fatal)", details);
    }

    if (this.registry) {
      const registryIds = new Set(this.registry.banks.map((bank) => bank.id));
      const dependencyIds = new Set(byId.keys());
      const failOnMissingNode = Boolean(
        this.dependencies?.config?.failOnMissingNode,
      );

      const missingNodes = [...registryIds]
        .filter((id) => !dependencyIds.has(id))
        .sort((a, b) => a.localeCompare(b));
      if (missingNodes.length > 0) {
        const details = {
          missingNodes: missingNodes.slice(0, 200),
          total: missingNodes.length,
        };
        if (failOnMissingNode || this.opts.strict) {
          throw new DataBankError(
            "Dependency graph missing nodes for registered banks",
            details,
          );
        }
        this.logger.warn(
          "Dependency graph missing nodes for registered banks (non-fatal)",
          details,
        );
      }

      const unknownNodes = [...dependencyIds]
        .filter((id) => !registryIds.has(id))
        .sort((a, b) => a.localeCompare(b));
      if (unknownNodes.length > 0) {
        const details = { unknownNodes };
        if (failOnMissingNode || this.opts.strict) {
          throw new DataBankError(
            "Dependency graph contains unknown node ids",
            details,
          );
        }
        this.logger.warn(
          "Dependency graph contains unknown node ids (non-fatal)",
          details,
        );
      }

      const unknownEdges: Array<{ id: string; dependsOn: string }> = [];
      for (const [id, node] of byId.entries()) {
        for (const depRaw of toStringList(node?.dependsOn)) {
          const dep = this.resolveAlias(depRaw);
          if (!registryIds.has(dep)) {
            unknownEdges.push({ id, dependsOn: depRaw });
          }
        }
      }
      if (unknownEdges.length > 0) {
        const details = {
          unknownEdges: unknownEdges.slice(0, 200),
          total: unknownEdges.length,
        };
        if (failOnMissingNode || this.opts.strict) {
          throw new DataBankError(
            "Dependency graph references unknown dependencies",
            details,
          );
        }
        this.logger.warn(
          "Dependency graph references unknown dependencies (non-fatal)",
          details,
        );
      }
    }
  }

  private validateDocumentIntelligenceContracts(): void {
    const mapBank = this.safeGetBank<Record<string, unknown>>("document_intelligence_bank_map");
    if (!mapBank || typeof mapBank !== "object") return;

    const mapRequired = toStringList(mapBank.requiredCoreBankIds);
    const mapOptional = toStringList(mapBank.optionalBankIds);
    const mapIds = Array.from(new Set([...mapRequired, ...mapOptional]));
    const infraIds = [
      "document_intelligence_manifest_schema",
      "document_intelligence_schema_registry",
      "document_intelligence_dependency_graph",
      "document_intelligence_usage_manifest",
      "document_intelligence_orphan_allowlist",
      "document_intelligence_runtime_wiring_gates",
    ];

    this.validateDocumentIntelligenceDependencyCoverage(mapIds, infraIds);
    this.validateDocumentIntelligenceSchemaRegistry(mapIds, infraIds);
    this.validateDocumentIntelligenceRuntimeWiringGates();
    this.validateDocumentIntelligenceOrphanPolicy(mapIds);
  }

  private validateDocumentIntelligenceDependencyCoverage(
    mapIds: string[],
    infraIds: string[],
  ): void {
    if (!this.dependencies || !this.registry) return;

    const failOnMissingNode = Boolean(
      this.dependencies.config?.failOnMissingNode,
    );
    const dependencyIds = new Set(
      (this.dependencies.banks || [])
        .map((node) => String(node?.id || "").trim())
        .filter(Boolean),
    );
    const expectedIds = Array.from(new Set([...mapIds, ...infraIds]));
    const missingNodes = expectedIds.filter((id) => !dependencyIds.has(id));
    if (missingNodes.length > 0) {
      const details = {
        missingNodes: missingNodes.sort((a, b) => a.localeCompare(b)),
      };
      if (failOnMissingNode || this.opts.strict) {
        throw new DataBankError(
          "Document intelligence dependency coverage missing nodes",
          details,
        );
      }
      this.logger.warn(
        "Document intelligence dependency coverage missing nodes (non-fatal)",
        details,
      );
    }
  }

  private validateDocumentIntelligenceSchemaRegistry(
    mapIds: string[],
    infraIds: string[],
  ): void {
    if (!this.registry) return;

    const schemaRegistry = this.safeGetBank<Record<string, unknown>>(
      "document_intelligence_schema_registry",
    );
    if (!schemaRegistry || typeof schemaRegistry !== "object") return;

    const familyMappings = Array.isArray(schemaRegistry.schemaFamilies)
      ? schemaRegistry.schemaFamilies
      : [];
    const explicitAssignments = new Map<string, string>();
    const schemaIdsDeclared = new Set<string>();
    for (const assignment of Array.isArray(schemaRegistry.schemaAssignments)
      ? schemaRegistry.schemaAssignments
      : []) {
      const bankId = String(assignment?.bankId || "").trim();
      const schemaId = String(assignment?.schemaId || "").trim();
      if (!bankId || !schemaId) continue;
      explicitAssignments.set(bankId, schemaId);
      schemaIdsDeclared.add(schemaId);
    }
    for (const family of familyMappings) {
      const schemaId = String(family?.schemaId || "").trim();
      if (schemaId) schemaIdsDeclared.add(schemaId);
    }

    const knownSchemaIds = new Set(
      this.registry.banks
        .filter((entry) => entry.category === "schemas")
        .map((entry) => entry.id),
    );
    const unknownSchemas = [...schemaIdsDeclared].filter(
      (schemaId) => !knownSchemaIds.has(schemaId),
    );
    if (unknownSchemas.length > 0) {
      throw new DataBankError(
        "Document intelligence schema registry references unknown schemas",
        { unknownSchemas: unknownSchemas.sort((a, b) => a.localeCompare(b)) },
      );
    }

    const idsToCheck = Array.from(new Set([...mapIds, ...infraIds]));
    const mismatches: Array<{
      id: string;
      expectedSchemaId: string;
      actualSchemaId: string;
      path: string;
    }> = [];
    const missingAssignments: string[] = [];

    for (const id of idsToCheck) {
      const entry = this.registry.banks.find((bank) => bank.id === id);
      if (!entry) continue;

      const explicit = explicitAssignments.get(id) ?? "";
      let expected = explicit;
      if (!expected) {
        const match = familyMappings.find((family: unknown) => {
          const prefix = String((family as Record<string, unknown>)?.pathPrefix || "").trim();
          if (!prefix) return false;
          return normalizeRegistryPath(entry.path).startsWith(prefix);
        });
        expected = String((match as Record<string, unknown>)?.schemaId || "").trim();
      }

      if (!expected) {
        missingAssignments.push(id);
        continue;
      }

      const actual = String(entry.schemaId || "").trim();
      if (actual !== expected) {
        mismatches.push({
          id,
          expectedSchemaId: expected,
          actualSchemaId: actual,
          path: entry.path,
        });
      }
    }

    const schemaRegistryConfig = asObject(schemaRegistry?.config);
    const failOnMissing = Boolean(
      schemaRegistryConfig.failOnMissingAssignmentsInStrict,
    );
    const failOnMismatch = Boolean(
      schemaRegistryConfig.failOnSchemaMismatchInStrict,
    );

    if (missingAssignments.length > 0) {
      const details = {
        missingAssignments: missingAssignments.sort((a, b) =>
          a.localeCompare(b),
        ),
      };
      if ((failOnMissing && this.opts.strict) || this.opts.strict) {
        throw new DataBankError(
          "Document intelligence schema registry missing assignments",
          details,
        );
      }
      this.logger.warn(
        "Document intelligence schema registry missing assignments (non-fatal)",
        details,
      );
    }

    if (mismatches.length > 0) {
      const details = { mismatches: mismatches.slice(0, 30) };
      if ((failOnMismatch && this.opts.strict) || this.opts.strict) {
        throw new DataBankError(
          "Document intelligence schema mismatch detected",
          details,
        );
      }
      this.logger.warn(
        "Document intelligence schema mismatch detected (non-fatal)",
        details,
      );
    }
  }

  private validateDocumentIntelligenceRuntimeWiringGates(): void {
    const gatesBank = this.safeGetBank<Record<string, unknown>>(
      "document_intelligence_runtime_wiring_gates",
    );
    if (!gatesBank || typeof gatesBank !== "object") return;

    const gates = Array.isArray(gatesBank.gates) ? gatesBank.gates : [];
    if (gates.length === 0) {
      throw new DataBankError("Runtime wiring gates bank has no gates", {
        bankId: "document_intelligence_runtime_wiring_gates",
      });
    }

    const missingRequiredBanks = new Set<string>();
    for (const gate of gates) {
      const requiredBanks = toStringList(gate?.requiredBanks);
      for (const id of requiredBanks) {
        if (!this.bankCache.has(id)) {
          missingRequiredBanks.add(id);
        }
      }
    }

    if (missingRequiredBanks.size > 0) {
      const details = {
        missingRequiredBanks: [...missingRequiredBanks].sort((a, b) =>
          a.localeCompare(b),
        ),
      };
      if (this.opts.strict) {
        throw new DataBankError(
          "Runtime wiring gates reference missing loaded banks",
          details,
        );
      }
      this.logger.warn(
        "Runtime wiring gates reference missing loaded banks (non-fatal)",
        details,
      );
    }
  }

  private validateDocumentIntelligenceOrphanPolicy(mapIds: string[]): void {
    const usageBank = this.safeGetBank<Record<string, unknown>>(
      "document_intelligence_usage_manifest",
    );
    const orphanAllowlist = this.safeGetBank<Record<string, unknown>>(
      "document_intelligence_orphan_allowlist",
    );
    if (!usageBank || !orphanAllowlist) return;

    const consumedIds = new Set(toStringList(usageBank.consumedBankIds));
    const consumedPrefixes = toStringList(usageBank.consumedIdPrefixes);
    const consumedPatterns = toStringList(usageBank.consumedIdPatterns)
      .map((pattern) => {
        try {
          return new RegExp(pattern);
        } catch {
          return null;
        }
      })
      .filter((pattern): pattern is RegExp => pattern != null);

    const allowlistedIds = new Set(
      toStringList(orphanAllowlist.allowlistedBankIds),
    );
    const allowlistedPrefixes = toStringList(
      orphanAllowlist.allowlistedIdPrefixes,
    );
    const allowlistedPatterns = toStringList(
      orphanAllowlist.allowlistedIdPatterns,
    )
      .map((pattern) => {
        try {
          return new RegExp(pattern);
        } catch {
          return null;
        }
      })
      .filter((pattern): pattern is RegExp => pattern != null);

    const isConsumed = (id: string): boolean => {
      if (consumedIds.has(id)) return true;
      if (consumedPrefixes.some((prefix) => id.startsWith(prefix))) return true;
      if (consumedPatterns.some((pattern) => pattern.test(id))) return true;
      return false;
    };

    const isAllowlisted = (id: string): boolean => {
      if (allowlistedIds.has(id)) return true;
      if (allowlistedPrefixes.some((prefix) => id.startsWith(prefix)))
        return true;
      if (allowlistedPatterns.some((pattern) => pattern.test(id))) return true;
      return false;
    };

    const orphans = mapIds.filter(
      (id) => !isConsumed(id) && !isAllowlisted(id),
    );
    if (orphans.length === 0) return;

    const usageBankConfig = asObject(usageBank?.config);
    const failOnOrphan = Boolean(usageBankConfig.failOnOrphanInStrict);
    const details = {
      orphanBankIds: orphans.sort((a, b) => a.localeCompare(b)),
    };
    if ((failOnOrphan && this.opts.strict) || this.opts.strict) {
      throw new DataBankError(
        "Document intelligence orphan banks detected",
        details,
      );
    }
    this.logger.warn(
      "Document intelligence orphan banks detected (non-fatal)",
      details,
    );
  }

  // -------------------------
  // Load ordering and dependencies
  // -------------------------

  private resolveLoadOrder(): BankRegistryEntry[] {
    if (!this.registry) throw new DataBankError("Registry not loaded");

    // Filter only enabled banks in env (still keep dependencies for ordering)
    const enabled = this.registry.banks.filter((b) => {
      if (!this.isEnabledInEnv(b)) return false;
      const relPath = normalizeRegistryPath(String(b.path || ""));
      if (relPath.startsWith("_deprecated/")) {
        this.logger.warn("Skipping deprecated bank path", {
          id: b.id,
          path: relPath,
        });
        return false;
      }
      return true;
    });

    // Group by category in loadOrder (if provided)
    const loadOrder =
      Array.isArray(this.registry.loadOrder) && this.registry.loadOrder.length
        ? this.registry.loadOrder
        : [
            "manifest",
            "schemas",
            "routing",
            "operators",
            "normalizers",
            "negatives",
            "semantics",
            "retrieval",
            "formatting",
            "microcopy",
            "overlays",
            "triggers",
            "ambiguity",
            "quality",
            "state",
            "probes",
            "policies",
            "prompts",
          ];

    // Step A: preliminary ordered list by category priority
    const categoryRank = new Map<string, number>();
    loadOrder.forEach((c, i) => categoryRank.set(c, i));

    const prelim = [...enabled].sort((a, b) => {
      const ra = categoryRank.get(a.category) ?? 999;
      const rb = categoryRank.get(b.category) ?? 999;
      if (ra !== rb) return ra - rb;
      return a.id.localeCompare(b.id);
    });

    // Step B: dependency DAG order (toposort) within prelim order
    return this.topoSort(prelim);
  }

  private topoSort(entries: BankRegistryEntry[]): BankRegistryEntry[] {
    const byId = new Map(entries.map((e) => [e.id, e]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const out: BankRegistryEntry[] = [];

    const visit = (id: string, stack: string[]) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new DataBankError(
          `Dependency cycle detected: ${[...stack, id].join(" -> ")}`,
        );
      }
      visiting.add(id);
      const e = byId.get(id);
      if (e) {
        const deps = Array.isArray(e.dependsOn) ? e.dependsOn : [];
        for (const dep of deps) {
          const canonicalDep = this.resolveAlias(dep);
          if (!byId.has(canonicalDep)) {
            // dependency might be disabled in env; if required, we should fail later.
            // For ordering, we just skip missing from this set.
            continue;
          }
          visit(canonicalDep, [...stack, id]);
        }
        out.push(e);
      }
      visiting.delete(id);
      visited.add(id);
    };

    for (const e of entries) {
      visit(e.id, []);
    }

    // Keep stable: preserve relative order for items with no deps by sorting index in input list.
    // Toposort above already follows input order via visit iteration; no extra sorting needed.
    return out;
  }

  // -------------------------
  // Required banks
  // -------------------------

  private assertRequiredBanksLoaded(): void {
    if (!this.registry) return;

    const required = this.registry.banks.filter((b) => this.isRequiredInEnv(b));
    const missing = required.filter((b) => !this.bankCache.has(b.id));

    if (missing.length) {
      throw new DataBankError("Missing required banks for environment", {
        env: this.opts.env,
        missing: missing.map((m) => ({ id: m.id, path: m.path })),
      });
    }
  }

  // -------------------------
  // Schema validation
  // -------------------------

  private async validateAgainstSchema(
    entry: BankRegistryEntry,
    bank: Record<string, unknown>,
  ): Promise<void> {
    // If no schemaId defined, fallback to minimal checks only
    const schemaId =
      entry.schemaId ?? this.registry?.schemaMap?.[entry.category] ?? null;
    if (!schemaId) return;

    const schemaBank = this.schemaCache.get(schemaId) ?? null;
    if (!schemaBank) {
      // If strict and schema missing, fail; else warn.
      if (this.opts.strict) {
        throw new DataBankError(
          `Schema bank '${schemaId}' required by '${entry.id}' not loaded`,
          { entry, schemaId },
        );
      }
      this.logger.warn("Schema bank not loaded; skipping schema validation", {
        entryId: entry.id,
        schemaId,
      });
      return;
    }

    // Try AJV JSON Schema validation if possible.
    // We support two common patterns:
    //  1) schemaBank.schema is a JSON Schema object
    //  2) schemaBank.action.schema is a JSON Schema object
    const schemaBankRecord = asObject(schemaBank);
    const schemaBankAction = asObject(schemaBankRecord.action);
    const schemaBankConfig = asObject(schemaBankRecord.config);
    let schemaObj =
      schemaBankRecord.schema ??
      schemaBankAction.schema ??
      schemaBankConfig.schema ??
      null;
    if (
      !schemaObj &&
      (schemaBankRecord.$schema ||
        schemaBankRecord.type ||
        schemaBankRecord.properties)
    ) {
      const { _meta, config, tests, ...schemaCandidate } = schemaBankRecord;
      void _meta;
      void config;
      void tests;
      const schemaCandidateRecord = asObject(schemaCandidate);
      if (
        schemaCandidateRecord.$schema ||
        schemaCandidateRecord.type ||
        schemaCandidateRecord.properties
      ) {
        schemaObj = schemaCandidateRecord;
      }
    }

    if (this.ajv && schemaObj && typeof schemaObj === "object") {
      const schemaForAjv = { ...(schemaObj as Record<string, unknown>) };
      if (
        schemaForAjv &&
        typeof schemaForAjv === "object" &&
        typeof schemaForAjv.$schema === "string" &&
        schemaForAjv.$schema.includes("json-schema.org/draft/2020-12")
      ) {
        delete schemaForAjv.$schema;
      }
      const validate = this.ajv.compile(schemaForAjv);
      const ok = validate(bank);
      if (!ok) {
        throw new DataBankError(
          `Schema validation failed for ${entry.id} against ${schemaId}`,
          {
            entryId: entry.id,
            schemaId,
            errors: validate.errors,
          },
        );
      }
      return;
    }

    // Fallback: "schema-lite" validation (presence of required sections already done).
    // If you store JSON-schema-ish definitions, add custom validators here.
    // We keep it conservative to avoid false failures.
    return;
  }

  // -------------------------
  // Checksums
  // -------------------------

  private async validateChecksumPolicy(
    entry: BankRegistryEntry,
    filePath: string,
  ): Promise<void> {
    if (!this.opts.strict) {
      return;
    }

    const id = String(entry.id || "").trim();
    const normalizedPath = normalizeRegistryPath(String(entry.path || "").trim());
    // Self-generated manifest files are exempt: they include their own hash maps,
    // so strict checksum enforcement creates impossible fixed points.
    if (
      id === "bank_registry" ||
      id === "bank_checksums" ||
      normalizedPath === "manifest/bank_registry.any.json" ||
      normalizedPath === "manifest/bank_checksums.any.json"
    ) {
      return;
    }

    const declared = (entry.checksumSha256 ?? "").trim();
    if (!declared) {
      const strictEnv =
        this.opts.env === "production" || this.opts.env === "staging";
      if (strictEnv && !this.opts.allowEmptyChecksumsInNonProd) {
        throw new DataBankError(
          `Empty checksum is not allowed in ${this.opts.env}`,
          {
            id: entry.id,
            path: entry.path,
            env: this.opts.env,
          },
        );
      }
      return;
    }

    const raw = await fs.readFile(filePath, "utf8");
    const actual = sha256(stripBom(raw));
    if (actual !== declared) {
      throw new DataBankError(`Checksum mismatch for ${entry.id}`, {
        id: entry.id,
        path: entry.path,
        declared,
        actual,
      });
    }
  }

  // -------------------------
  // Env gating
  // -------------------------

  private isEnabledInEnv(entry: BankRegistryEntry): boolean {
    const env = this.opts.env;
    const enabledByEnv = ensureEnvMap(
      entry.enabledByEnv,
      `bank_registry entry ${entry.id}.enabledByEnv`,
    );
    // If enabledByEnv is missing or all false, default true (safer for dev)
    const explicitlyProvided =
      entry.enabledByEnv && Object.keys(entry.enabledByEnv).length > 0;
    if (!explicitlyProvided) return true;
    const key = (env in enabledByEnv ? env : "local") as EnvName;
    return Boolean(enabledByEnv[key]);
  }

  private isRequiredInEnv(entry: BankRegistryEntry): boolean {
    const env = this.opts.env;
    const requiredByEnv = ensureEnvMap(
      entry.requiredByEnv,
      `bank_registry entry ${entry.id}.requiredByEnv`,
    );
    const explicitlyProvided =
      entry.requiredByEnv && Object.keys(entry.requiredByEnv).length > 0;
    if (!explicitlyProvided) return false;
    const key = (env in requiredByEnv ? env : "local") as EnvName;
    return Boolean(requiredByEnv[key]);
  }

  // -------------------------
  // Alias resolution
  // -------------------------

  private resolveAlias(id: string): string {
    const trimmed = (id ?? "").trim();
    if (!trimmed) return trimmed;
    const aliases = this.aliases?.aliases ?? null;
    if (!aliases) return trimmed;
    const aliasConfig = this.aliases?.config ?? {};

    // Resolve chains safely with max depth
    let cur = trimmed;
    for (let i = 0; i < 8; i++) {
      const direct = aliases[cur];
      const normalized = normalizeAliasKey(cur, aliasConfig);
      const normalizedNext = this.aliasNormalizedMap.get(normalized) ?? null;
      const next = direct ?? normalizedNext;
      if (!next) return cur;
      if (next === cur) return cur;
      cur = next;
    }
    return cur;
  }

  // -------------------------
  // File reading
  // -------------------------

  private async readBankFile<T = unknown>(
    filePath: string,
    bankId: string,
  ): Promise<T> {
    const raw = await fs.readFile(filePath, "utf8").catch((err: unknown) => {
      throw new DataBankError(`Missing bank file for ${bankId}: ${filePath}`, {
        bankId,
        filePath,
        err: String(err),
      });
    });

    const parsed = safeParseJson<T>(raw, filePath);

    // Ensure config.enabled exists for all banks
    // (Some schema banks may not include config; we already validated minimal contract on schema banks.)
    return parsed;
  }

  // -------------------------
  // Utilities
  // -------------------------

  private safeGetBank<T = unknown>(bankId: string): T | null {
    try {
      return this.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
