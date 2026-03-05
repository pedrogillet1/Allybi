import { getBankLoaderInstance } from "../../core/banks/bankLoader.service";
import type { EnvName } from "../types/llm.types";
import { loadGeminiConfig } from "../providers/gemini/geminiConfig";
import { loadOpenAIConfig } from "../providers/openai/openaiConfig";
import { PromptRegistryService } from "../prompts/promptRegistry.service";
import { LlmRequestBuilderService } from "./llmRequestBuilder.service";
import { LlmRouterService } from "./llmRouter.service";
import {
  LLMClientFactory,
  type LLMClientKey,
} from "./llmClientFactory";
import type { LLMProvider } from "./llmErrors.types";
import type { LLMClient } from "./llmClient.interface";
import { LlmGatewayService } from "./llmGateway.service";

export interface GatewayRuntimeBuildOptions {
  envName?: EnvName;
  llmFactory?: LLMClientFactory;
  wrapClient?: (client: LLMClient, key: LLMClientKey) => LLMClient;
  defaultTemperature?: number;
  defaultMaxOutputTokens?: number;
}

export interface GatewayRuntimeBuildResult {
  gateway: LlmGatewayService;
  defaultClient: LLMClient;
  defaultModelId: string;
  configuredKeys: LLMClientKey[];
  llmFactory: LLMClientFactory;
}

export function resolveRuntimeEnvName(
  nodeEnvRaw: string | undefined = process.env.NODE_ENV,
): EnvName {
  if (nodeEnvRaw === "production") return "production";
  if (nodeEnvRaw === "staging") return "staging";
  if (nodeEnvRaw === "test") return "dev";
  return "local";
}

export function resolveFactoryKey(provider: LLMProvider): LLMClientKey | null {
  const normalized = String(provider || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "unknown") return null;
  if (normalized === "openai") return "openai";
  if (normalized === "google" || normalized === "gemini") return "google";
  return null;
}

export function buildLLMFactoryFromEnv(
  envName: EnvName = resolveRuntimeEnvName(),
): LLMClientFactory {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    throw new Error(
      "No LLM API key found. Set GEMINI_API_KEY/GOOGLE_API_KEY or OPENAI_API_KEY.",
    );
  }

  const geminiCfg = geminiKey ? loadGeminiConfig(envName) : null;
  const openaiCfg = openaiKey ? loadOpenAIConfig(envName) : null;

  return new LLMClientFactory({
    defaultProvider: geminiKey ? "google" : "openai",
    providers: {
      google: geminiKey
        ? {
            enabled: true,
            config: {
              apiKey: geminiCfg!.apiKey,
              baseUrl:
                geminiCfg!.baseUrl ||
                "https://generativelanguage.googleapis.com/v1beta",
              defaults: {
                gemini3: geminiCfg!.models.defaultFinal,
                gemini3Flash: geminiCfg!.models.defaultDraft,
              },
              timeoutMs: geminiCfg!.timeoutMs,
              allowedModels: geminiCfg!.models.allowed,
              strictModelAllowlist: geminiCfg!.models.strictAllowlist,
              defaultModelFinal: geminiCfg!.models.defaultFinal,
            },
          }
        : undefined,
      openai: openaiCfg
        ? {
            enabled: true,
            config: {
              apiKey: openaiCfg.apiKey,
              baseURL: openaiCfg.baseURL,
              organization: openaiCfg.organization,
              project: openaiCfg.project,
              timeoutMs: openaiCfg.timeoutMs,
              defaultModelDraft: openaiCfg.defaultModelDraft,
              defaultModelFinal: openaiCfg.defaultModelFinal,
              allowedModels: openaiCfg.allowedModels,
              strictModelAllowlist: openaiCfg.strictModelAllowlist,
              includeUsageInStream: openaiCfg.includeUsageInStream,
              maxDeltaCharsSoft: openaiCfg.maxDeltaCharsSoft,
              allowTools: openaiCfg.allowTools,
            },
          }
        : undefined,
    },
  });
}

export function buildGatewayRuntime(
  options: GatewayRuntimeBuildOptions = {},
): GatewayRuntimeBuildResult {
  const envName = options.envName || resolveRuntimeEnvName();
  const llmFactory = options.llmFactory || buildLLMFactoryFromEnv(envName);
  const configuredKeys = llmFactory.listConfigured();
  if (!configuredKeys.length) {
    throw new Error("No LLM providers are configured");
  }

  const rawDefaultClient = llmFactory.get();
  const wrappedClientCache = new Map<LLMClientKey, LLMClient>();
  const getWrappedClientByKey = (key: LLMClientKey): LLMClient | null => {
    const existing = wrappedClientCache.get(key);
    if (existing) return existing;
    const raw = llmFactory.tryGet(key);
    if (!raw) return null;
    const wrapped = options.wrapClient ? options.wrapClient(raw, key) : raw;
    wrappedClientCache.set(key, wrapped);
    return wrapped;
  };

  const defaultKey =
    configuredKeys.find((key) => llmFactory.get(key) === rawDefaultClient) ||
    configuredKeys[0];
  const defaultClient = getWrappedClientByKey(defaultKey);
  if (!defaultClient) {
    throw new Error("Default LLM client is not configured");
  }

  const geminiCfg = loadGeminiConfig(envName);
  const openaiCfg = loadOpenAIConfig(envName);
  const defaultModelId =
    defaultClient.provider === "openai"
      ? openaiCfg.defaultModelDraft
      : geminiCfg.models.defaultDraft;

  const bankLoader = getBankLoaderInstance();
  const promptRegistry = new PromptRegistryService(bankLoader);
  const requestBuilder = new LlmRequestBuilderService(promptRegistry);
  const router = new LlmRouterService(bankLoader);

  const gateway = new LlmGatewayService(
    defaultClient,
    router,
    requestBuilder,
    {
      env: envName,
      provider: defaultClient.provider,
      modelId: defaultModelId,
      defaultTemperature: options.defaultTemperature ?? 0.2,
      defaultMaxOutputTokens: options.defaultMaxOutputTokens ?? 900,
    },
    {
      resolve(provider: LLMProvider) {
        const key = resolveFactoryKey(provider);
        if (!key) return null;
        return getWrappedClientByKey(key);
      },
    },
  );

  return {
    gateway,
    defaultClient,
    defaultModelId,
    configuredKeys,
    llmFactory,
  };
}
