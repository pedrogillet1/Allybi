/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Koda Bank Loader Service (ChatGPT-parity, orchestrator-friendly)
 * ---------------------------------------------------------------
 * This is the orchestrator-facing wrapper around DataBankLoaderService.
 *
 * Why this file exists:
 *  - Provide a stable runtime API: getBank(), getOptionalBank(), hasBank(), resolveAlias(), listLoaded()
 *  - Provide boot lifecycle: init(), reload() (dev/local), health checks
 *  - Provide deterministic access semantics:
 *      - strict in production/staging (fail fast on missing required)
 *      - tolerant in dev/local (optional banks may be absent)
 *  - Provide policy-safe logging (no leaking raw bank contents)
 *
 * This service does NOT "decide" behavior; it only loads and returns bank JSON objects.
 *
 * Dependencies:
 *  - dataBankLoader.service.ts (the heavy loader)
 */

import * as path from "path";
import { DataBankLoaderService, DataBankLoaderOptions, DataBankError } from "./dataBankLoader.service";

type EnvName = "production" | "staging" | "dev" | "local";

export interface BankLoaderLogger {
  info: (msg: string, meta?: any) => void;
  warn: (msg: string, meta?: any) => void;
  error: (msg: string, meta?: any) => void;
}

export interface BankLoaderInitOptions {
  env: EnvName;

  /**
   * rootDir points to the directory that contains the category folders.
   * Example:
   *  backend/src/data_banks
   */
  rootDir: string;

  /**
   * strict:
   *  - production/staging: true (recommended)
   *  - dev/local: can be true or false depending on workflow; default below uses env-based defaults.
   */
  strict?: boolean;

  /**
   * validateSchemas:
   *  - true if you have JSON-schema-ish banks wired and want AJV validation when available.
   */
  validateSchemas?: boolean;

  /**
   * allowEmptyChecksumsInNonProd:
   *  - If true, checksumSha256 may be empty in dev/local without failing.
   */
  allowEmptyChecksumsInNonProd?: boolean;

  /**
   * If you want to support hot reload in dev/local.
   * If enabled, you can call reload() when filesystem changes.
   */
  enableHotReload?: boolean;

  /**
   * Logging (must be privacy-safe; do not dump bank contents).
   */
  logger?: BankLoaderLogger;
}

export interface BankLoaderHealth {
  ok: boolean;
  env: EnvName;
  loadedCount: number;
  loadedIdsSample: string[];
  missingCritical?: string[];
  lastLoadedAt?: string;
  lastReloadAt?: string;
  lastError?: { name: string; message: string };
}

export class BankLoaderService {
  private loader: DataBankLoaderService | null = null;

  private initOpts: BankLoaderInitOptions | null = null;
  private lastLoadedAt: string | null = null;
  private lastReloadAt: string | null = null;
  private lastError: { name: string; message: string } | null = null;

  private readonly defaultLogger: BankLoaderLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  };

  /**
   * Initialize + load all banks once (boot).
   * Call this at server startup.
   */
  async init(opts: BankLoaderInitOptions): Promise<void> {
    this.initOpts = { ...opts };
    const logger = opts.logger ?? this.defaultLogger;

    // Env-driven defaults (ChatGPT-parity safe)
    const strictDefault = opts.env === "production" || opts.env === "staging";
    const strict = opts.strict ?? strictDefault;

    const validateSchemasDefault = opts.env !== "production" ? true : true; // you can flip if performance matters
    const validateSchemas = opts.validateSchemas ?? validateSchemasDefault;

    const allowEmptyChecksumsInNonProd = opts.allowEmptyChecksumsInNonProd ?? true;

    const loaderOpts: DataBankLoaderOptions = {
      rootDir: opts.rootDir,
      env: opts.env,
      strict,
      validateSchemas,
      allowEmptyChecksumsInNonProd,
      logger
    };

    this.loader = new DataBankLoaderService(loaderOpts);

    try {
      await this.loader.loadAll();
      this.lastLoadedAt = new Date().toISOString();
      this.lastError = null;
      logger.info("BankLoader initialized", {
        env: opts.env,
        strict,
        validateSchemas,
        rootDir: opts.rootDir,
        loadedCount: this.loader.listLoadedIds().length
      });
    } catch (err: any) {
      this.lastError = { name: err?.name ?? "Error", message: err?.message ?? String(err) };
      logger.error("BankLoader failed to initialize", { error: this.lastError });

      // In strict mode, fail fast.
      if (strict) throw err;
      // In non-strict mode, keep the process alive but leave loader in error state.
    }
  }

  /**
   * Reload banks (recommended only in dev/local or via explicit admin action).
   */
  async reload(): Promise<void> {
    if (!this.loader || !this.initOpts) {
      throw new DataBankError("BankLoader not initialized");
    }

    const logger = this.initOpts.logger ?? this.defaultLogger;

    // Safety: prevent accidental reload in production unless explicitly allowed
    if (this.initOpts.env === "production" && !this.initOpts.enableHotReload) {
      throw new DataBankError("Reload disabled in production");
    }

    try {
      await this.loader.loadAll();
      this.lastReloadAt = new Date().toISOString();
      this.lastError = null;

      logger.info("BankLoader reloaded", {
        env: this.initOpts.env,
        loadedCount: this.loader.listLoadedIds().length
      });
    } catch (err: any) {
      this.lastError = { name: err?.name ?? "Error", message: err?.message ?? String(err) };
      logger.error("BankLoader reload failed", { error: this.lastError });

      // Respect strictness configured at loader level: if strict, reload should throw.
      // DataBankLoaderService already throws in strict scenarios; we forward.
      throw err;
    }
  }

  /**
   * Get a bank by id (alias resolution supported by underlying loader).
   * Throws if missing.
   */
  getBank<T = any>(bankId: string): T {
    this.assertReady();
    return this.loader!.getBank<T>(bankId);
  }

  /**
   * Get a bank by id; returns null if missing.
   * Useful when you are adding new banks incrementally.
   */
  getOptionalBank<T = any>(bankId: string): T | null {
    if (!this.loader) return null;
    try {
      return this.loader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }

  /**
   * Check whether a bank is loaded (canonical ids, alias-aware).
   */
  hasBank(bankId: string): boolean {
    if (!this.loader) return false;
    try {
      this.loader.getBank(bankId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List loaded bank ids.
   */
  listLoaded(): string[] {
    this.assertReady();
    return this.loader!.listLoadedIds();
  }

  /**
   * Get registry metadata for a bank (if registry is loaded).
   */
  getRegistryEntry(bankId: string): any | null {
    this.assertReady();
    return this.loader!.getRegistryEntry(bankId);
  }

  /**
   * Lightweight health endpoint payload.
   * Never includes bank contents; only counts and small samples.
   */
  health(): BankLoaderHealth {
    const env = this.initOpts?.env ?? "dev";
    const loadedIds = this.loader?.listLoadedIds?.() ?? [];
    const ok = Boolean(this.loader) && !this.lastError;

    // "Critical" banks you almost always want loaded for app correctness
    const critical = [
      "bank_registry",
      "ui_contracts",
      "fallback_policy",
      "clarification_policy",
      "retrieval_ranker_config",
      "semantic_search_config"
    ];
    const missingCritical = critical.filter(id => !loadedIds.includes(id));

    return {
      ok: ok && missingCritical.length === 0,
      env,
      loadedCount: loadedIds.length,
      loadedIdsSample: loadedIds.slice(0, 20),
      missingCritical: missingCritical.length ? missingCritical : undefined,
      lastLoadedAt: this.lastLoadedAt ?? undefined,
      lastReloadAt: this.lastReloadAt ?? undefined,
      lastError: this.lastError ?? undefined
    };
  }

  /**
   * Useful for tests: assert loader is ready and banks are loaded.
   */
  assertReady(): void {
    if (!this.loader) {
      throw new DataBankError("BankLoaderService not initialized (call init() first)");
    }
    if (this.lastError) {
      throw new DataBankError("BankLoaderService is in error state", { lastError: this.lastError });
    }
  }

  /**
   * Convenience helper: resolve canonical path to data banks root.
   * Typical usage:
   *   BankLoaderService.resolveDefaultRootDir(__dirname)
   * if your services are in backend/src/services/.
   */
  static resolveDefaultRootDir(fromDir: string): string {
    // Adjust if your compiled output directory differs.
    // This assumes file lives in backend/src/services or backend/src/...
    // and data_banks sits at backend/src/data_banks.
    return path.resolve(fromDir, "..", "data_banks");
  }
}

// -----------------------------------------------------------------------------
// Singleton instance and convenience exports
// -----------------------------------------------------------------------------

let singletonInstance: BankLoaderService | null = null;

/**
 * Get the singleton BankLoaderService instance
 */
export function getBankLoaderInstance(): BankLoaderService {
  if (!singletonInstance) {
    singletonInstance = new BankLoaderService();
  }
  return singletonInstance;
}

/**
 * Initialize the singleton (call once at startup)
 */
export async function initializeBanks(opts?: Partial<BankLoaderInitOptions>): Promise<void> {
  const instance = getBankLoaderInstance();

  const env = (process.env.NODE_ENV || 'local') as EnvName;
  const resolvedEnv = (opts?.env ?? ((env as string) === 'development' ? 'dev' : env)) as EnvName;
  const strictEnv = resolvedEnv === "production" || resolvedEnv === "staging";
  const fullOpts: BankLoaderInitOptions = {
    env: resolvedEnv,
    rootDir: opts?.rootDir ?? path.join(process.cwd(), 'backend/src/data_banks'),
    strict: opts?.strict,
    validateSchemas: opts?.validateSchemas ?? strictEnv,
    allowEmptyChecksumsInNonProd: opts?.allowEmptyChecksumsInNonProd ?? !strictEnv,
    enableHotReload: opts?.enableHotReload ?? (env !== 'production'),
    logger: opts?.logger ?? {
      info: (msg, meta) => console.log(`[BankLoader] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[BankLoader] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[BankLoader] ${msg}`, meta || ''),
    },
  };

  await instance.init(fullOpts);
}

/**
 * Get a bank by ID (convenience wrapper)
 */
export function getBank<T = any>(bankId: string): T {
  return getBankLoaderInstance().getBank<T>(bankId);
}

/**
 * Get a bank by ID, returning null if not found
 */
export function getOptionalBank<T = any>(bankId: string): T | null {
  return getBankLoaderInstance().getOptionalBank<T>(bankId);
}

/**
 * Check if a bank is loaded
 */
export function hasBank(bankId: string): boolean {
  return getBankLoaderInstance().hasBank(bankId);
}

/**
 * List all loaded bank IDs
 */
export function listLoadedBanks(): string[] {
  return getBankLoaderInstance().listLoaded();
}

/**
 * Get health status
 */
export function getBankLoaderHealth(): BankLoaderHealth {
  return getBankLoaderInstance().health();
}

// Re-export error type
export { DataBankError } from "./dataBankLoader.service";
