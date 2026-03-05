/**
 * llmClientFactory.ts
 *
 * LLM Client Factory (core-layer, Map-based)
 * -----------------------------------------
 * Purpose:
 * - Central, deterministic registry of provider clients (OpenAI / Gemini)
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
import { OpenAIClientService, OpenAILLMClientAdapter } from "../providers/openai/openaiClient.service";
import type { OpenAIProviderConfig } from "../providers/openai/openaiConfig";
import { ResilienceLLMClient } from "../resilience/resilienceLlmClient.decorator";
import { Semaphore } from "../resilience/semaphore";
import { CircuitBreaker } from "../resilience/circuitBreaker";
import { isRetryableError } from "../resilience/retry";

export type LLMClientKey = "openai" | "google";

/** Alias config types for factory consumers */
export type OpenAIClientConfig = Partial<OpenAIProviderConfig>;

export interface LLMClientFactoryConfig {
  defaultProvider: LLMClientKey;

  providers: {
    openai?: { enabled: boolean; config: OpenAIClientConfig };
    google?: { enabled: boolean; config: GeminiClientConfig };
  };

  /**
   * Optional injection hook for tests / advanced wiring.
   * If provided, factory uses these instances instead of constructing new ones.
   */
  prebuilt?: Partial<Record<LLMClientKey, LLMClient>>;
}

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function wrapWithResilience(raw: LLMClient, name: string, concurrency: number): LLMClient {
  return new ResilienceLLMClient(raw, {
    semaphore: new Semaphore(concurrency),
    circuitBreaker: new CircuitBreaker(`llm:${name}`),
    retry: {
      maxRetries: envInt(`${name.toUpperCase()}_RETRY_MAX`, 2),
      baseDelayMs: envInt(`${name.toUpperCase()}_RETRY_BASE_DELAY_MS`, 500),
      maxDelayMs: envInt(`${name.toUpperCase()}_RETRY_MAX_DELAY_MS`, 8000),
      shouldRetry: isRetryableError,
    },
  });
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
   * - Otherwise build enabled providers from config, wrapped with resilience
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
      const raw = new OpenAILLMClientAdapter(
        new OpenAIClientService(p.openai.config as Partial<ConstructorParameters<typeof OpenAIClientService>[0]>),
      );
      this.clients.set("openai", wrapWithResilience(raw, "openai", envInt("OPENAI_MAX_CONCURRENT", 8)));
    }

    if (!this.clients.has("google") && p.google?.enabled) {
      const raw = new GeminiClientService(p.google.config as GeminiClientConfig);
      this.clients.set("google", wrapWithResilience(raw, "google", envInt("GEMINI_CONCURRENCY", 6)));
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
    const order: LLMClientKey[] = ["openai", "google"];
    return order.filter((k) => this.clients.has(k));
  }

  /**
   * Map provider enum (LLMProvider) to factory key.
   */
  static toKey(provider: LLMProvider): LLMClientKey {
    if (provider === "openai") return "openai";
    if (provider === "google") return "google";
    throw new Error(`LLM_PROVIDER_NOT_SUPPORTED:${provider}`);
  }

  /**
   * Map factory key to provider enum.
   */
  static toProvider(key: LLMClientKey): LLMProvider {
    if (key === "openai") return "openai";
    return "google";
  }
}
