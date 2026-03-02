/**
 * llmClientFactory.ts
 *
 * LLM Client Factory (core-layer, Map-based)
 * -----------------------------------------
 * Purpose:
 * - Central, deterministic registry of provider clients (OpenAI / Gemini / Local)
 * - Bank/config-driven selection (no hardcoding in call sites)
 * - Test-friendly (can inject prebuilt clients)
 *
 * Usage:
 * - Instantiate once in bootstrap/container.ts
 * - Inject into orchestrator / LLM gateways
 */

import type { LLMClient } from "./llmClient.interface";
import type { LLMProvider } from "./llmErrors.types";

import {
  GeminiClientService,
  type GeminiClientConfig,
} from "../providers/gemini/geminiClient.service";
import { OpenAIClientService } from "../providers/openai/openaiClient.service";
import { LocalClientService } from "../providers/local/localClient.service";
import type { OpenAIProviderConfig } from "../providers/openai/openaiConfig";
import type { LocalProviderConfig } from "../providers/local/localConfig";

export type LLMClientKey = "openai" | "google" | "local";

/** Alias config types for factory consumers */
export type OpenAIClientConfig = Partial<OpenAIProviderConfig>;
export type LocalClientConfig = Partial<LocalProviderConfig>;

export interface LLMClientFactoryConfig {
  defaultProvider: LLMClientKey;

  providers: {
    openai?: { enabled: boolean; config: OpenAIClientConfig };
    google?: { enabled: boolean; config: GeminiClientConfig };
    local?: { enabled: boolean; config: LocalClientConfig };
  };

  /**
   * Optional injection hook for tests / advanced wiring.
   * If provided, factory uses these instances instead of constructing new ones.
   */
  prebuilt?: Partial<Record<LLMClientKey, LLMClient>>;
}

export class LLMClientFactory {
  private readonly clients = new Map<LLMClientKey, LLMClient>();
  private readonly defaultProvider: LLMClientKey;

  constructor(private readonly cfg: LLMClientFactoryConfig) {
    this.defaultProvider = cfg.defaultProvider;
    this.init();
  }

  /**
   * Deterministic initialization:
   * - Use prebuilt clients first (if any)
   * - Otherwise build enabled providers from config
   */
  private init(): void {
    // 1) Prebuilt (test-friendly)
    if (this.cfg.prebuilt) {
      for (const [k, v] of Object.entries(this.cfg.prebuilt)) {
        if (v) this.clients.set(k as LLMClientKey, v);
      }
    }

    // 2) Build enabled providers that are not already present
    const p = this.cfg.providers;

    if (!this.clients.has("openai") && p.openai?.enabled) {
      // OpenAIClientService implements LlmClient (types/llm.types), not LLMClient (core).
      // An adapter is needed for full parity; for now, cast to allow factory storage.
      this.clients.set(
        "openai",
        new OpenAIClientService(p.openai.config as Partial<ConstructorParameters<typeof OpenAIClientService>[0]>) as unknown as LLMClient,
      );
    }

    if (!this.clients.has("google") && p.google?.enabled) {
      this.clients.set(
        "google",
        new GeminiClientService(p.google.config as GeminiClientConfig),
      );
    }

    if (!this.clients.has("local") && p.local?.enabled) {
      this.clients.set("local", new LocalClientService(p.local.config as Partial<ConstructorParameters<typeof LocalClientService>[0]>));
    }
  }

  /**
   * Get a client by key.
   * Throws if not configured/enabled.
   */
  get(key?: LLMClientKey): LLMClient {
    const k = key ?? this.defaultProvider;
    const client = this.clients.get(k);
    if (!client) throw new Error(`LLM_CLIENT_NOT_CONFIGURED:${k}`);
    return client;
  }

  /**
   * Safe getter that returns null if missing.
   * Useful for fallback routing logic.
   */
  tryGet(key: LLMClientKey): LLMClient | null {
    return this.clients.get(key) ?? null;
  }

  /**
   * Replace or register a client at runtime (useful for tests or hot swapping).
   */
  set(key: LLMClientKey, client: LLMClient): void {
    this.clients.set(key, client);
  }

  /**
   * List configured providers (stable order).
   */
  listConfigured(): LLMClientKey[] {
    const order: LLMClientKey[] = ["openai", "google", "local"];
    return order.filter((k) => this.clients.has(k));
  }

  /**
   * Map provider enum (LLMProvider) to factory key.
   */
  static toKey(provider: LLMProvider): LLMClientKey {
    if (provider === "openai") return "openai";
    if (provider === "google") return "google";
    return "local";
  }

  /**
   * Map factory key to provider enum.
   */
  static toProvider(key: LLMClientKey): LLMProvider {
    if (key === "openai") return "openai";
    if (key === "google") return "google";
    return "local";
  }
}
