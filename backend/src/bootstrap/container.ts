/**
 * Koda V3 Composition Root (Dependency Injection Container)
 *
 * Boot-safe version with proper bank initialization.
 * Services are loaded via dynamic import to avoid "Cannot find module" crashes.
 * Missing or incompatible services log warnings but never prevent boot.
 *
 * CRITICAL: Banks must be initialized BEFORE any bank-dependent services.
 *
 * Public API surface is kept stable for containerGuard and health routes.
 */

import * as path from "path";
import * as fs from "fs";

type EnvName = "production" | "staging" | "dev" | "local";

function coerceEnvName(nodeEnv: string | undefined): EnvName {
  const v = (nodeEnv ?? "").toLowerCase().trim();
  if (v === "production") return "production";
  if (v === "staging") return "staging";
  if (v === "development" || v === "dev") return "dev";
  return "local";
}

function resolveDataBanksRootDir(): string {
  // We want a path that works for:
  // - running TS from backend/ (cwd=backend)
  // - running from repo root (cwd=repo)
  // - running compiled JS from backend/dist (dirname=backend/dist/bootstrap)
  const candidates = [
    path.join(process.cwd(), "src/data_banks"),
    path.join(process.cwd(), "backend/src/data_banks"),
    path.resolve(__dirname, "../data_banks"),
    path.resolve(__dirname, "../../src/data_banks"),
  ];

  for (const c of candidates) {
    try {
      const probe = path.join(c, "manifest/bank_registry.any.json");
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
      console.log("[Container] Already initialized, skipping");
      return;
    }

    console.log("[Container] Initializing services...");

    // ========================================================================
    // STEP 0: Initialize banks FIRST (before any bank-dependent services)
    // ========================================================================
    if (!this._banksInitialized) {
      try {
        const { initializeBanks } =
          await import("../services/core/banks/bankLoader.service");

        const env = coerceEnvName(process.env.NODE_ENV);
        const rootDir = resolveDataBanksRootDir();
        const strict = env === "production" || env === "staging";
        const override = (process.env.BANK_VALIDATE_SCHEMAS ?? "")
          .toLowerCase()
          .trim();
        const validateSchemas = override ? override === "true" : strict;

        await initializeBanks({
          env,
          rootDir,
          strict,
          validateSchemas,
          allowEmptyChecksumsInNonProd: !strict,
        });

        try {
          const { BankIntegrityService } =
            await import("../services/editing/banks/bankIntegrity.service");
          const integrity = new BankIntegrityService().validateEditingBanks();
          if (!integrity.ok) {
            const env = coerceEnvName(process.env.NODE_ENV);
            const strict = env === "production" || env === "staging";
            const details = {
              missingBanks: integrity.missingBanks,
              missingOperators: integrity.missingOperators,
            };
            if (strict) {
              throw new Error(
                `[Container] Editing bank integrity failed in strict mode: ${JSON.stringify(details)}`,
              );
            }
            console.warn(
              "[Container] Editing bank integrity warnings",
              details,
            );
          }
        } catch (integrityErr: any) {
          const env = coerceEnvName(process.env.NODE_ENV);
          const strict = env === "production" || env === "staging";
          if (strict) {
            throw integrityErr;
          }
          console.warn(
            `[Container] Editing bank integrity check failed (non-fatal): ${integrityErr?.message || integrityErr}`,
          );
        }

        try {
          const { RuntimeWiringIntegrityService } =
            await import("../services/core/banks/runtimeWiringIntegrity.service");
          const wiring = new RuntimeWiringIntegrityService().validate();
          if (!wiring.ok) {
            const env = coerceEnvName(process.env.NODE_ENV);
            const strict = env === "production" || env === "staging";
            const criticalFields = [
              wiring.missingOperatorContracts,
              wiring.missingOperatorOutputShapes,
              wiring.missingEditingCatalogOperators,
              wiring.missingEditingCapabilities,
              wiring.invalidPromptLayers,
              wiring.invalidPromptTemplateOutputModes,
              wiring.missingBuilderPolicyBank,
              wiring.invalidBuilderPolicy,
              wiring.legacyChatRuntimeImports,
              wiring.dormantCoreRoutingImports,
              wiring.turnRoutePolicyDynamicFallback,
            ];
            const hasCriticalIssue = criticalFields.some(
              (arr) => arr && arr.length > 0,
            );
            const details = {
              missingBanks: wiring.missingBanks,
              missingOperatorContracts: wiring.missingOperatorContracts,
              missingOperatorOutputShapes: wiring.missingOperatorOutputShapes,
              missingEditingCatalogOperators:
                wiring.missingEditingCatalogOperators,
              missingEditingCapabilities: wiring.missingEditingCapabilities,
              invalidPromptLayers: wiring.invalidPromptLayers,
              invalidPromptTemplateOutputModes:
                wiring.invalidPromptTemplateOutputModes,
              missingBuilderPolicyBank: wiring.missingBuilderPolicyBank,
              invalidBuilderPolicy: wiring.invalidBuilderPolicy,
              legacyChatRuntimeImports: wiring.legacyChatRuntimeImports,
              dormantCoreRoutingImports: wiring.dormantCoreRoutingImports,
              turnRoutePolicyDynamicFallback:
                wiring.turnRoutePolicyDynamicFallback,
            };
            if (strict && hasCriticalIssue) {
              throw new Error(
                `[Container] Runtime wiring integrity failed in strict mode: ${JSON.stringify(details)}`,
              );
            }
            console.warn(
              "[Container] Runtime wiring integrity warnings (non-blocking)",
              details,
            );
          }
        } catch (wiringErr: any) {
          const env = coerceEnvName(process.env.NODE_ENV);
          const strict = env === "production" || env === "staging";
          if (strict) throw wiringErr;
          console.warn(
            `[Container] Runtime wiring integrity check failed (non-fatal): ${wiringErr?.message || wiringErr}`,
          );
        }

        try {
          const { DocumentIntelligenceIntegrityService } =
            await import("../services/core/banks/documentIntelligenceIntegrity.service");
          const docInt = new DocumentIntelligenceIntegrityService().validate();
          if (!docInt.ok) {
            const env = coerceEnvName(process.env.NODE_ENV);
            const strict = env === "production" || env === "staging";
            const details = {
              missingMapBank: docInt.missingMapBank,
              missingCoreBanks: docInt.missingCoreBanks,
              missingRegistryEntries: docInt.missingRegistryEntries,
              missingBankFiles: docInt.missingBankFiles,
              missingManifestBanks: docInt.missingManifestBanks,
              missingDependencyNodes: docInt.missingDependencyNodes,
              orphanBankIds: docInt.orphanBankIds,
              mapRequiredCoreCount: docInt.mapRequiredCoreCount,
              mapOptionalCount: docInt.mapOptionalCount,
            };
            if (strict) {
              throw new Error(
                `[Container] Document intelligence integrity failed in strict mode: ${JSON.stringify(details)}`,
              );
            }
            console.warn(
              "[Container] Document intelligence integrity warnings (non-blocking)",
              details,
            );
          }
        } catch (docIntErr: any) {
          const env = coerceEnvName(process.env.NODE_ENV);
          const strict = env === "production" || env === "staging";
          if (strict) {
            throw docIntErr;
          }
          console.warn(
            `[Container] Document intelligence integrity check failed (non-fatal): ${docIntErr?.message || docIntErr}`,
          );
        }

        this._banksInitialized = true;
        console.log("[Container] Banks initialized successfully");

        try {
          const { getDocumentIntelligenceBanksInstance } =
            await import("../services/core/banks/documentIntelligenceBanks.service");
          const diagnostics =
            getDocumentIntelligenceBanksInstance().listDiagnostics();
          const sampleIds = diagnostics.loadedBankIds.slice(0, 20);
          const versionSample = sampleIds.reduce(
            (acc, id) => {
              if (diagnostics.versions[id]) acc[id] = diagnostics.versions[id];
              return acc;
            },
            {} as Record<string, string>,
          );
          const countSample = sampleIds.reduce(
            (acc, id) => {
              acc[id] = diagnostics.counts[id] ?? 0;
              return acc;
            },
            {} as Record<string, number>,
          );
          console.log("[Container] Document intelligence bank diagnostics", {
            loadedCount: diagnostics.loadedBankIds.length,
            warningCount: diagnostics.validationWarnings.length,
            loadedIdsSample: sampleIds,
            versionSample,
            countSample,
          });
        } catch (diagnosticsErr: any) {
          console.warn(
            `[Container] Document intelligence bank diagnostics failed: ${diagnosticsErr?.message || diagnosticsErr}`,
          );
        }
      } catch (e: any) {
        const env = coerceEnvName(process.env.NODE_ENV);
        const strict = env === "production" || env === "staging";
        if (strict) {
          console.error(
            "[Container] Banks initialization failed in strict mode",
            {
              env,
              error: e?.message || e,
            },
          );
          throw e;
        }
        console.warn(
          `[Container] Banks initialization failed (non-fatal): ${e.message}`,
        );
        // Continue in non-strict environments so local recovery remains possible.
      }
    }

    // ========================================================================
    // STEP 1: Load services that DON'T depend on banks
    // ========================================================================
    await this.tryLoad("fallbackConfig", async () => {
      const mod = await import("../services/config/fallbackConfig.service");
      const svc = mod.fallbackConfigService ?? new mod.default();
      if (svc.loadFallbacks) await svc.loadFallbacks();
      return svc;
    });

    await this.tryLoad("intentConfig", async () => {
      const mod = await import("../services/config/intentConfig.service");
      return new mod.IntentConfigService();
    });

    await this.tryLoad("conversationMemory", async () => {
      const mod = await import("../services/memory/conversationMemory.service");
      return new mod.ConversationMemoryService();
    });

    // ========================================================================
    // STEP 2: Load services that DO depend on banks (after banks are loaded)
    // ========================================================================
    if (this._banksInitialized) {
      await this.tryLoad("languageDetector", async () => {
        const { getBankLoaderInstance } =
          await import("../services/core/banks/bankLoader.service");
        const bankLoader = getBankLoaderInstance();
        const mod =
          await import("../services/core/inputs/languageDetector.service");
        return new mod.LanguageDetectorService(bankLoader);
      });

      await this.tryLoad("retrievalEngine", async () => {
        const { PrismaRetrievalAdapterFactory } =
          await import("../services/core/retrieval/prismaRetrievalAdapters.service");
        const db = (await import("../config/database")).default;
        return {
          id: "centralized_retrieval_runtime",
          centralized: true,
          adapterFactory: new PrismaRetrievalAdapterFactory(),
          health: async () => {
            await db.$queryRaw`SELECT 1 FROM "document_chunks" LIMIT 1`;
            return { ok: true };
          },
        };
      });

      await this.tryLoad("answerEngine", async () => {
        return {
          id: "centralized_answer_gateway",
          centralized: true,
          promptGateway: "llm_request_builder",
          health: async () => ({ ok: true }),
        };
      });
    } else {
      console.warn(
        "[Container] Skipping bank-dependent services (banks not initialized)",
      );
    }

    // Mark initialized regardless — let the app boot
    this._isInitialized = true;

    const loaded = Object.keys(this._services).filter(
      (k) => this._services[k] != null,
    );
    console.log(
      `[Container] Initialized — ${loaded.length} services loaded: ${loaded.join(", ")}`,
    );
  }

  public areBanksInitialized(): boolean {
    return this._banksInitialized;
  }

  /** Try to load a service, log warning on failure */
  private async tryLoad(
    name: string,
    loader: () => Promise<any>,
  ): Promise<void> {
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

  public getIntentEngine(): any {
    return null;
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

export { container };
export default container;
