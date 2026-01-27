/**
 * Koda V3 Composition Root (Dependency Injection Container)
 *
 * Minimal boot-safe version.
 * Services are loaded via dynamic import to avoid "Cannot find module" crashes.
 * Missing or incompatible services log warnings but never prevent boot.
 *
 * Public API surface is kept identical so containerGuard, health routes,
 * and any other consumer that calls getContainer() / getOrchestrator() keeps working.
 */

// ============================================================================
// CONTAINER CLASS
// ============================================================================

class KodaV3Container {
  private _isInitialized = false;
  private _services: Record<string, any> = {};

  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      console.log('[Container] Already initialized, skipping');
      return;
    }

    console.log('[Container] Initializing services...');

    // Each service block is independent — failure in one doesn't stop others
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

    await this.tryLoad('intentEngine', async () => {
      const mod = await import('../services/core/intentEngine.service');
      return new mod.KodaIntentEngineV3Service();
    });

    await this.tryLoad('languageDetector', async () => {
      const { getBankLoaderInstance } = await import('../services/core/bankLoader.service');
      const bankLoader = getBankLoaderInstance();
      const mod = await import('../services/core/languageDetector.service');
      return new mod.LanguageDetectorService(bankLoader);
    });

    await this.tryLoad('conversationMemory', async () => {
      const mod = await import('../services/memory/conversationMemory.service');
      return new mod.ConversationMemoryService();
    });

    // feedbackLogger removed — analytics folder no longer exists

    // Mark initialized regardless — let the app boot
    this._isInitialized = true;

    const loaded = Object.keys(this._services).filter(k => this._services[k] != null);
    console.log(`[Container] Initialized — ${loaded.length} services loaded: ${loaded.join(', ')}`);
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
