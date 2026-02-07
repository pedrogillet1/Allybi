/**
 * Koda V3 Composition Root (Dependency Injection Container)
 *
 * Boot-safe version with proper bank initialization.
 * Services are loaded via dynamic import to avoid "Cannot find module" crashes.
 * Missing or incompatible services log warnings but never prevent boot.
 *
 * CRITICAL: Banks must be initialized BEFORE any bank-dependent services.
 *
 * Public API surface is kept identical so containerGuard, health routes,
 * and any other consumer that calls getContainer() / getOrchestrator() keeps working.
 */

import * as path from 'path';
import * as fs from 'fs';

type EnvName = 'production' | 'staging' | 'dev' | 'local';

function coerceEnvName(nodeEnv: string | undefined): EnvName {
  const v = (nodeEnv ?? '').toLowerCase().trim();
  if (v === 'production') return 'production';
  if (v === 'staging') return 'staging';
  if (v === 'development' || v === 'dev') return 'dev';
  return 'local';
}

function resolveDataBanksRootDir(): string {
  // We want a path that works for:
  // - running TS from backend/ (cwd=backend)
  // - running from repo root (cwd=repo)
  // - running compiled JS from backend/dist (dirname=backend/dist/bootstrap)
  const candidates = [
    path.join(process.cwd(), 'src/data_banks'),
    path.join(process.cwd(), 'backend/src/data_banks'),
    path.resolve(__dirname, '../data_banks'),
    path.resolve(__dirname, '../../src/data_banks'),
  ];

  for (const c of candidates) {
    try {
      const probe = path.join(c, 'manifest/bank_registry.any.json');
      if (fs.existsSync(probe)) return c;
    } catch {
      // ignore
    }
  }

  // Fallback: keep previous behavior (better than crashing boot).
  return candidates[0];
}

// ============================================================================
// CONTAINER CLASS
// ============================================================================

class KodaV3Container {
  private _isInitialized = false;
  private _banksInitialized = false;
  private _services: Record<string, any> = {};

  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      console.log('[Container] Already initialized, skipping');
      return;
    }

    console.log('[Container] Initializing services...');

    // ========================================================================
    // STEP 0: Initialize banks FIRST (before any bank-dependent services)
    // ========================================================================
    if (!this._banksInitialized) {
      try {
        const { initializeBanks } = await import('../services/core/banks/bankLoader.service');

        const env = coerceEnvName(process.env.NODE_ENV);
        const rootDir = resolveDataBanksRootDir();
        const strict = env === 'production' || env === 'staging';
        const validateSchemas = (process.env.BANK_VALIDATE_SCHEMAS ?? '').toLowerCase().trim() === 'true';

        await initializeBanks({
          env,
          rootDir,
          strict,
          validateSchemas,
        });

        this._banksInitialized = true;
        console.log('[Container] Banks initialized successfully');
      } catch (e: any) {
        console.warn(`[Container] Banks initialization failed (non-fatal): ${e.message}`);
        // Continue without banks - services that need them will fail gracefully
      }
    }

    // ========================================================================
    // STEP 1: Load services that DON'T depend on banks
    // ========================================================================
    await this.tryLoad('fallbackConfig', async () => {
      const mod = await import('../services/config/fallbackConfig.service');
      const svc = mod.fallbackConfigService ?? new mod.default();
      if (svc.loadFallbacks) await svc.loadFallbacks();
      return svc;
    });

    await this.tryLoad('intentConfig', async () => {
      const mod = await import('../services/config/intentConfig.service');
      return new mod.IntentConfigService();
    });

    await this.tryLoad('conversationMemory', async () => {
      const mod = await import('../services/memory/conversationMemory.service');
      return new mod.ConversationMemoryService();
    });

    // ========================================================================
    // STEP 2: Load services that DO depend on banks (after banks are loaded)
    // ========================================================================
    if (this._banksInitialized) {
      await this.tryLoad('intentEngine', async () => {
        const mod = await import('../services/core/routing/intentEngine.service');
        return new mod.KodaIntentEngineV3Service();
      });

      await this.tryLoad('languageDetector', async () => {
        const { getBankLoaderInstance } = await import('../services/core/banks/bankLoader.service');
        const bankLoader = getBankLoaderInstance();
        const mod = await import('../services/core/inputs/languageDetector.service');
        return new mod.LanguageDetectorService(bankLoader);
      });
    } else {
      console.warn('[Container] Skipping bank-dependent services (banks not initialized)');
    }

    // Mark initialized regardless — let the app boot
    this._isInitialized = true;

    const loaded = Object.keys(this._services).filter(k => this._services[k] != null);
    console.log(`[Container] Initialized — ${loaded.length} services loaded: ${loaded.join(', ')}`);
  }

  public areBanksInitialized(): boolean {
    return this._banksInitialized;
  }

  /** Try to load a service, log warning on failure */
  private async tryLoad(name: string, loader: () => Promise<any>): Promise<void> {
    try {
      const svc = await loader();
      if (svc) this._services[name] = svc;
      else console.warn(`[Container] ${name}: loader returned null`);
    } catch (e: any) {
      console.warn(`[Container] ${name} not available: ${e.message}`);
    }
  }

  // ========== Public API (matches original container surface) ==========

  public isInitialized(): boolean {
    return this._isInitialized;
  }

  public getOrchestrator(): any {
    return this._services.orchestrator ?? null;
  }

  public getIntentEngine(): any {
    return this._services.intentEngine ?? null;
  }

  public getRetrievalEngine(): any {
    return this._services.retrievalEngine ?? null;
  }

  public getAnswerEngine(): any {
    return this._services.answerEngine ?? null;
  }

  public getFallbackConfig(): any {
    return this._services.fallbackConfig ?? null;
  }

  public getIntentConfig(): any {
    return this._services.intentConfig ?? null;
  }

  public getLanguageDetector(): any {
    return this._services.languageDetector ?? null;
  }

  public getConversationMemory(): any {
    return this._services.conversationMemory ?? null;
  }

  public getFeedbackLogger(): any {
    return this._services.feedbackLogger ?? null;
  }

  public getService(name: string): any {
    return this._services[name] ?? null;
  }

  public getAllServices(): Record<string, any> {
    return { ...this._services };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const container = new KodaV3Container();

export async function initializeContainer(): Promise<void> {
  await container.initialize();
}

export function getContainer(): KodaV3Container {
  return container;
}

export function getOrchestrator(): any {
  return container.getOrchestrator();
}

export { container };
export default container;
