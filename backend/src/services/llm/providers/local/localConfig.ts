// src/services/llm/providers/local/localConfig.ts

/**
 * Local Provider Config (Koda, ChatGPT-parity)
 * -------------------------------------------
 * “Local” means your on-machine/on-LAN model runtime (commonly Ollama).
 *
 * Koda strategy:
 *  - Local is the fallback/dev lane:
 *      - used when external providers are unavailable
 *      - used when dev/local prefers local draft for cost/speed
 *
 * Goals:
 *  - Deterministic allowlist + defaults
 *  - Streaming enabled by default (ChatGPT-like)
 *  - Conservative safety posture:
 *      - No images to local LLM (images handled by extraction pipeline)
 *      - Tools generally disabled (you can enable later if you add a tool runner)
 */

import type { EnvName } from "../../types/llm.types";
import { LOCAL_PRIMARY_MODEL, listLocalModels } from "./localModels";

export type LocalProviderApi = "ollama" | "http";

export interface LocalProviderConfig {
  env: EnvName;

  api: LocalProviderApi;

  /**
   * Ollama URL (if api=ollama).
   * Example: http://localhost:11434
   */
  ollamaUrl: string;

  /**
   * If your local runtime supports a custom HTTP API, baseUrl can be used.
   */
  baseUrl?: string;

  timeoutMs: number;

  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterRatio: number;
    retryOn5xx: boolean;
    retryOnNetwork: boolean;
  };

  concurrency: {
    maxConcurrent: number;
  };

  models: {
    defaultDraft: string; // usually local-default or local-fast
    defaultFinal: string; // usually local-default or local-precise
    allowed: string[];
    strictAllowlist: boolean;
  };

  streaming: {
    enabled: boolean;
    maxDeltaCharsSoft: number;
    flushOnNewline: boolean;
    heartbeatEveryMs: number; // 0 disables
  };

  generationDefaults: {
    draft: { temperature: number; maxOutputTokens: number };
    final: { temperature: number; maxOutputTokens: number };
    navPills: { temperature: number; maxOutputTokens: number };
    disambiguation: { temperature: number; maxOutputTokens: number };
  };

  compat: {
    supportsTools: boolean;
    supportsDeveloperRole: boolean;
    supportsImages: boolean;
  };
}

const DEFAULTS: Omit<LocalProviderConfig, "env"> = {
  api: (process.env.LOCAL_LLM_API as LocalProviderApi) || "ollama",

  ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
  baseUrl: process.env.LOCAL_LLM_BASE_URL || undefined,

  timeoutMs: Number(process.env.LOCAL_LLM_TIMEOUT_MS || 30000),

  retry: {
    maxAttempts: Number(process.env.LOCAL_LLM_RETRY_MAX_ATTEMPTS || 2),
    baseDelayMs: Number(process.env.LOCAL_LLM_RETRY_BASE_DELAY_MS || 200),
    maxDelayMs: Number(process.env.LOCAL_LLM_RETRY_MAX_DELAY_MS || 1500),
    jitterRatio: Number(process.env.LOCAL_LLM_RETRY_JITTER_RATIO || 0.25),
    retryOn5xx: process.env.LOCAL_LLM_RETRY_ON_5XX !== "false",
    retryOnNetwork: process.env.LOCAL_LLM_RETRY_ON_NETWORK !== "false",
  },

  concurrency: {
    maxConcurrent: Number(process.env.LOCAL_LLM_CONCURRENCY || 2),
  },

  models: {
    defaultDraft: process.env.LOCAL_LLM_DRAFT_MODEL || "local-default",
    defaultFinal: process.env.LOCAL_LLM_FINAL_MODEL || "local-default",
    allowed: (process.env.LOCAL_LLM_ALLOWED_MODELS
      ? process.env.LOCAL_LLM_ALLOWED_MODELS.split(",").map((s) => s.trim()).filter(Boolean)
      : listLocalModels()
    ),
    strictAllowlist: process.env.LOCAL_LLM_STRICT_ALLOWLIST !== "false",
  },

  streaming: {
    enabled: process.env.LOCAL_LLM_STREAMING_ENABLED !== "false",
    maxDeltaCharsSoft: Number(process.env.LOCAL_LLM_MAX_DELTA_CHARS_SOFT || 72),
    flushOnNewline: process.env.LOCAL_LLM_FLUSH_ON_NEWLINE !== "false",
    heartbeatEveryMs: Number(process.env.LOCAL_LLM_HEARTBEAT_MS || 0),
  },

  generationDefaults: {
    draft: {
      temperature: Number(process.env.LOCAL_LLM_DRAFT_TEMPERATURE || 0.45),
      maxOutputTokens: Number(process.env.LOCAL_LLM_DRAFT_MAX_OUTPUT_TOKENS || 550),
    },
    final: {
      temperature: Number(process.env.LOCAL_LLM_FINAL_TEMPERATURE || 0.3),
      maxOutputTokens: Number(process.env.LOCAL_LLM_FINAL_MAX_OUTPUT_TOKENS || 700),
    },
    navPills: {
      temperature: Number(process.env.LOCAL_LLM_NAV_TEMPERATURE || 0.2),
      maxOutputTokens: Number(process.env.LOCAL_LLM_NAV_MAX_OUTPUT_TOKENS || 220),
    },
    disambiguation: {
      temperature: Number(process.env.LOCAL_LLM_DISAMBIG_TEMPERATURE || 0.2),
      maxOutputTokens: Number(process.env.LOCAL_LLM_DISAMBIG_MAX_OUTPUT_TOKENS || 220),
    },
  },

  compat: {
    supportsTools: false,
    supportsDeveloperRole: true,
    supportsImages: false,
  },
};

export function loadLocalConfig(env: EnvName): LocalProviderConfig {
  return {
    env,
    ...DEFAULTS,
  };
}
