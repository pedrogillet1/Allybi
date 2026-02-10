/* eslint-disable @typescript-eslint/no-explicit-any */

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
import * as path from "path";
import crypto from "crypto";

type EnvName = "production" | "staging" | "dev" | "local";

export interface DataBankLoaderOptions {
  rootDir: string; // e.g., path.join(process.cwd(), "backend/src/data_banks")
  env: EnvName;
  strict: boolean; // strictLoad / failOnMissingRequired behavior
  validateSchemas: boolean; // validate banks against schemaId when possible
  allowEmptyChecksumsInNonProd: boolean;
  logger?: {
    info: (msg: string, meta?: any) => void;
    warn: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
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
  config: { enabled: boolean; [k: string]: any };
  [k: string]: any;
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
  config: any;
  schemaMap?: Record<string, string>;
  loadOrder?: string[];
  banks: BankRegistryEntry[];
  tests?: any;
}

export interface BankAliasesFile {
  _meta: BankMeta;
  config: any;
  aliases: Record<string, string>;
  tests?: any;
}

export class DataBankError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = "DataBankError";
  }
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function isEnvName(x: any): x is EnvName {
  return x === "production" || x === "staging" || x === "dev" || x === "local";
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const key of Object.keys(obj as any)) {
      const v = (obj as any)[key];
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
  }
  return obj;
}

function stripBom(s: string): string {
  if (!s) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function assertNoJsonComments(raw: string, fileHint: string) {
  // Strict JSON: disallow // and /* */
  // Allow URLs in strings by a conservative scan (remove string literals before checking)
  const withoutStrings = raw.replace(/"([^"\\]|\\.)*"/g, "\"\"");
  if (/(^|\s)\/\/|\/\*/.test(withoutStrings)) {
    throw new DataBankError(`Invalid JSON (comments not allowed) in ${fileHint}`, { fileHint });
  }
}

function safeParseJson<T>(raw: string, fileHint: string): T {
  const cleaned = stripBom(raw);
  assertNoJsonComments(cleaned, fileHint);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    throw new DataBankError(`Invalid JSON in ${fileHint}: ${err?.message ?? String(err)}`, { fileHint });
  }
}

function requireFields(obj: any, fields: string[], fileHint: string) {
  for (const f of fields) {
    if (!(f in obj)) throw new DataBankError(`Missing required field '${f}' in ${fileHint}`, { fileHint, field: f });
  }
}

function normalizeRegistryPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function ensureEnvMap(map: any, fileHint: string): Record<EnvName, boolean> {
  const out: Record<EnvName, boolean> = { production: false, staging: false, dev: false, local: false };
  if (!map) return out;
  for (const k of Object.keys(map)) {
    if (!isEnvName(k)) {
      throw new DataBankError(`Invalid env key '${k}' in ${fileHint}. Must be production|staging|dev|local`, { fileHint, key: k });
    }
    out[k] = Boolean(map[k]);
  }
  return out;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Minimal bank-level contract checks (schema-lite).
 * Real schema validation can be enabled via AJV if present.
 */
function validateMinimalBankContract(bank: any, fileHint: string) {
  requireFields(bank, ["_meta", "config"], fileHint);
  requireFields(bank._meta, ["id", "version", "description", "languages", "lastUpdated"], fileHint);
  if (typeof bank._meta.id !== "string" || bank._meta.id.length < 1) {
    throw new DataBankError(`Invalid _meta.id in ${fileHint}`, { fileHint });
  }
  if (!bank.config || typeof bank.config.enabled !== "boolean") {
    throw new DataBankError(`Invalid config.enabled in ${fileHint} (must be boolean)`, { fileHint });
  }
}

/**
 * Optional AJV-based schema validation:
 * - If AJV is not installed, we fall back to minimal contract checks.
 * - If schema banks are not JSON Schema, you can still keep validateSchemas=false.
 */
function tryCreateAjv(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Ajv = require("ajv");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const addFormats = require("ajv-formats");
    const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    addFormats(ajv);
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

  // Loaded banks (canonical id -> bank object)
  private bankCache = new Map<string, BankFile>();

  // For diagnostics and determinism
  private loadLog: Array<{ id: string; path: string; loadedAt: string }> = [];

  // Schema cache (schemaId -> schema object)
  private schemaCache = new Map<string, any>();

  // AJV instance if available and enabled
  private ajv: any | null = null;

  constructor(options: DataBankLoaderOptions) {
    this.opts = options;
    this.logger = options.logger ?? {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined
    };

    if (this.opts.validateSchemas) {
      this.ajv = tryCreateAjv();
      if (!this.ajv) {
        this.logger.warn("AJV not available; falling back to minimal contract validation only.");
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
    this.bankCache.clear();
    this.schemaCache.clear();
    this.loadLog = [];

    // Bootstrap: load registry + aliases with minimal checks (no schema validation)
    await this.loadRegistryBootstrap();
    await this.loadAliasesBootstrap();

    // Validate registry integrity (duplicates, paths, env keys)
    this.validateRegistryIntegrity();

    // Bootstrap schemas next (so we can validate everything else)
    await this.loadSchemasBootstrap();

    // Resolve bank loading order (category loadOrder + dependency DAG)
    const ordered = this.resolveLoadOrder();

    // Load banks in order
    for (const entry of ordered) {
      if (!this.isEnabledInEnv(entry)) continue;

      const filePath = path.join(this.opts.rootDir, normalizeRegistryPath(entry.path));
      const bank = await this.readBankFile<BankFile>(filePath, entry.id);

      // Minimal contract
      validateMinimalBankContract(bank, entry.path);

      // Ensure id matches registry id
      if (bank._meta?.id !== entry.id) {
        throw new DataBankError(`Bank _meta.id mismatch for ${entry.id}. Registry id=${entry.id}, file _meta.id=${bank._meta?.id}`, {
          entry,
          fileMetaId: bank._meta?.id
        });
      }

      // Validate checksum policy (optional)
      await this.validateChecksumPolicy(entry, filePath);

      // Schema validation (if enabled and possible)
      if (this.opts.validateSchemas) {
        await this.validateAgainstSchema(entry, bank);
      }

      // Freeze and store
      this.bankCache.set(entry.id, deepFreeze(bank));
      this.loadLog.push({ id: entry.id, path: entry.path, loadedAt: nowIso() });
    }

    // If strict, ensure required banks present for env
    if (this.opts.strict) {
      this.assertRequiredBanksLoaded();
    }

    this.logger.info("Data banks loaded successfully", {
      env: this.opts.env,
      loaded: this.bankCache.size
    });
  }

  /**
   * Retrieve a bank by id. Supports alias resolution.
   */
  getBank<T = any>(id: string): T {
    const canonical = this.resolveAlias(id);
    const bank = this.bankCache.get(canonical);
    if (!bank) {
      throw new DataBankError(`Bank not loaded: ${id} (canonical=${canonical})`, {
        id,
        canonical,
        loadedIds: Array.from(this.bankCache.keys()).slice(0, 50)
      });
    }
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
    return this.registry.banks.find(b => b.id === canonical) ?? null;
  }

  // -------------------------
  // Bootstrap steps
  // -------------------------

  private async loadRegistryBootstrap(): Promise<void> {
    const registryPath = path.join(this.opts.rootDir, "manifest/bank_registry.any.json");
    const raw = await fs.readFile(registryPath, "utf8").catch((err: any) => {
      throw new DataBankError(`Missing bank registry at ${registryPath}`, { err });
    });

    const registry = safeParseJson<BankRegistryFile>(raw, "manifest/bank_registry.any.json");
    validateMinimalBankContract(registry, "manifest/bank_registry.any.json");
    requireFields(registry, ["banks"], "manifest/bank_registry.any.json");
    if (!Array.isArray(registry.banks)) throw new DataBankError("bank_registry.banks must be an array");

    this.registry = registry;
    this.logger.info("Loaded bank registry", { banks: registry.banks.length });
  }

  private async loadAliasesBootstrap(): Promise<void> {
    const aliasesPath = path.join(this.opts.rootDir, "manifest/bank_aliases.any.json");
    try {
      const raw = await fs.readFile(aliasesPath, "utf8");
      const parsed = safeParseJson<any>(raw, "manifest/bank_aliases.any.json");
      validateMinimalBankContract(parsed, "manifest/bank_aliases.any.json");
      requireFields(parsed, ["aliases"], "manifest/bank_aliases.any.json");

      // Convert array format to Record<string, string> for resolveAlias()
      // Array format: [{ alias: "foo", canonicalId: "bar" }, ...]
      // Object format: { "foo": "bar", ... }
      let aliasMap: Record<string, string> = {};
      if (Array.isArray(parsed.aliases)) {
        for (const entry of parsed.aliases) {
          if (entry.alias && entry.canonicalId) {
            aliasMap[entry.alias] = entry.canonicalId;
          }
        }
      } else if (typeof parsed.aliases === "object") {
        aliasMap = parsed.aliases;
      }

      this.aliases = { ...parsed, aliases: aliasMap };
      this.logger.info("Loaded bank aliases", { aliases: Object.keys(aliasMap).length });
    } catch {
      this.aliases = null;
      this.logger.warn("bank_aliases.any.json not found; alias resolution disabled");
    }
  }

  /**
   * Load schema banks early:
   * - Always try to load schemas/bank_schema.any.json if present in registry
   * - Also load any schema IDs referenced by registry entries (schemaId) if they are in registry
   */
  private async loadSchemasBootstrap(): Promise<void> {
    if (!this.registry) return;

    const schemaEntries = this.registry.banks.filter(b => b.category === "schemas" || (b.id ?? "").endsWith("_schema"));
    for (const entry of schemaEntries) {
      if (!this.isEnabledInEnv(entry)) continue;
      const filePath = path.join(this.opts.rootDir, normalizeRegistryPath(entry.path));
      const bank = await this.readBankFile<any>(filePath, entry.id);

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
        (b as any).filename = b.path.split('/').pop() || b.path;
      }

      if (!b.id || !b.path || !b.category) {
        throw new DataBankError("Invalid registry entry (missing id/path/category)", { entry: b });
      }

      const p = normalizeRegistryPath(b.path);

      if (ids.has(b.id)) throw new DataBankError(`Duplicate bank id in registry: ${b.id}`);
      if (paths.has(p)) throw new DataBankError(`Duplicate bank path in registry: ${p}`);

      ids.add(b.id);
      paths.add(p);

      // Validate env keys
      if (b.enabledByEnv) ensureEnvMap(b.enabledByEnv, `bank_registry entry ${b.id}.enabledByEnv`);
      if (b.requiredByEnv) ensureEnvMap(b.requiredByEnv, `bank_registry entry ${b.id}.requiredByEnv`);
    }

    // Validate loadOrder categories exist
    const loadOrder = this.registry.loadOrder ?? [];
    if (Array.isArray(loadOrder) && loadOrder.length) {
      const categories = new Set(this.registry.banks.map(b => b.category));
      for (const c of loadOrder) {
        if (!categories.has(c)) {
          // allow categories with no banks only if explicitly intended; we warn instead of failing
          this.logger.warn("Registry loadOrder category has no banks", { category: c });
        }
      }
    }

    // Validate that registry file itself is registered (optional but recommended)
    // If you register it, it must not cause bootstrap paradox; loader handles bootstrap anyway.

    this.logger.info("Registry integrity checks passed");
  }

  // -------------------------
  // Load ordering and dependencies
  // -------------------------

  private resolveLoadOrder(): BankRegistryEntry[] {
    if (!this.registry) throw new DataBankError("Registry not loaded");

    // Filter only enabled banks in env (still keep dependencies for ordering)
    const enabled = this.registry.banks.filter(b => this.isEnabledInEnv(b));

    // Group by category in loadOrder (if provided)
    const loadOrder = Array.isArray(this.registry.loadOrder) && this.registry.loadOrder.length
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
          "prompts"
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
    const byId = new Map(entries.map(e => [e.id, e]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const out: BankRegistryEntry[] = [];

    const visit = (id: string, stack: string[]) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new DataBankError(`Dependency cycle detected: ${[...stack, id].join(" -> ")}`);
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

    const required = this.registry.banks.filter(b => this.isRequiredInEnv(b));
    const missing = required.filter(b => !this.bankCache.has(b.id));

    if (missing.length) {
      throw new DataBankError("Missing required banks for environment", {
        env: this.opts.env,
        missing: missing.map(m => ({ id: m.id, path: m.path }))
      });
    }
  }

  // -------------------------
  // Schema validation
  // -------------------------

  private async validateAgainstSchema(entry: BankRegistryEntry, bank: any): Promise<void> {
    // If no schemaId defined, fallback to minimal checks only
    const schemaId = entry.schemaId ?? null;
    if (!schemaId) return;

    const schemaBank = this.schemaCache.get(schemaId) ?? null;
    if (!schemaBank) {
      // If strict and schema missing, fail; else warn.
      if (this.opts.strict) {
        throw new DataBankError(`Schema bank '${schemaId}' required by '${entry.id}' not loaded`, { entry, schemaId });
      }
      this.logger.warn("Schema bank not loaded; skipping schema validation", { entryId: entry.id, schemaId });
      return;
    }

    // Try AJV JSON Schema validation if possible.
    // We support two common patterns:
    //  1) schemaBank.schema is a JSON Schema object
    //  2) schemaBank.action.schema is a JSON Schema object
    const schemaObj = schemaBank.schema ?? schemaBank?.action?.schema ?? schemaBank?.config?.schema ?? null;

    if (this.ajv && schemaObj && typeof schemaObj === "object") {
      const validate = this.ajv.compile(schemaObj);
      const ok = validate(bank);
      if (!ok) {
        throw new DataBankError(`Schema validation failed for ${entry.id} against ${schemaId}`, {
          entryId: entry.id,
          schemaId,
          errors: validate.errors
        });
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

  private async validateChecksumPolicy(entry: BankRegistryEntry, filePath: string): Promise<void> {
    const declared = (entry.checksumSha256 ?? "").trim();
    if (!declared) {
      if (this.opts.env === "production" && !this.opts.allowEmptyChecksumsInNonProd) {
        // production strictness: if you want to enforce checksums, set allowEmptyChecksumsInNonProd=false
        // Here we only enforce if strict and policy says so
        if (this.opts.strict) {
          this.logger.warn("Empty checksum in production registry entry", { id: entry.id, path: entry.path });
        }
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
        actual
      });
    }
  }

  // -------------------------
  // Env gating
  // -------------------------

  private isEnabledInEnv(entry: BankRegistryEntry): boolean {
    const env = this.opts.env;
    const enabledByEnv = ensureEnvMap(entry.enabledByEnv, `bank_registry entry ${entry.id}.enabledByEnv`);
    // If enabledByEnv is missing or all false, default true (safer for dev)
    const explicitlyProvided = entry.enabledByEnv && Object.keys(entry.enabledByEnv).length > 0;
    if (!explicitlyProvided) return true;
    return Boolean(enabledByEnv[env]);
  }

  private isRequiredInEnv(entry: BankRegistryEntry): boolean {
    const env = this.opts.env;
    const requiredByEnv = ensureEnvMap(entry.requiredByEnv, `bank_registry entry ${entry.id}.requiredByEnv`);
    const explicitlyProvided = entry.requiredByEnv && Object.keys(entry.requiredByEnv).length > 0;
    if (!explicitlyProvided) return false;
    return Boolean(requiredByEnv[env]);
  }

  // -------------------------
  // Alias resolution
  // -------------------------

  private resolveAlias(id: string): string {
    const trimmed = (id ?? "").trim();
    if (!trimmed) return trimmed;
    const aliases = this.aliases?.aliases ?? null;
    if (!aliases) return trimmed;

    // Resolve chains safely with max depth
    let cur = trimmed;
    for (let i = 0; i < 8; i++) {
      const next = aliases[cur];
      if (!next) return cur;
      if (next === cur) return cur;
      cur = next;
    }
    return cur;
  }

  // -------------------------
  // File reading
  // -------------------------

  private async readBankFile<T = any>(filePath: string, bankId: string): Promise<T> {
    const raw = await fs.readFile(filePath, "utf8").catch((err: any) => {
      throw new DataBankError(`Missing bank file for ${bankId}: ${filePath}`, { bankId, filePath, err });
    });

    const parsed = safeParseJson<T>(raw, filePath);

    // Ensure config.enabled exists for all banks
    // (Some schema banks may not include config; we already validated minimal contract on schema banks.)
    return parsed;
  }

  // -------------------------
  // Utilities
  // -------------------------

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
