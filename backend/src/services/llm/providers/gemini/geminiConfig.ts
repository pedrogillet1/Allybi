// src/services/llm/providers/gemini/geminiConfig.ts

/**
 * Gemini Config (Allybi, ChatGPT-parity)
 * -----------------------------------
 * “Best configs” for Allybi means:
 *  - Fast, smooth streaming on the draft lane (Gemini Flash)
 *  - Higher-quality reasoning on the escalation lane (Gemini “full” / Pro-equivalent)
 *  - Deterministic allowlist + defaults (no silent model drift)
 *  - Safe limits for nav_pills + disambiguation (short outputs)
 *  - Provider health + retry knobs (transient errors are common during bursts)
 *
 * Allybi model strategy:
 *  - draft / fast lane: gemini-2.5-flash
 *  - final / deeper lane: gemini-2.5-flash
 *
 * NOTE:
 *  - Keep model IDs consistent with llmRouter + providerCapabilities banks.
 *  - Do not log API keys.
 */

import type { EnvName } from "../../types/llm.types";

export type GeminiProviderApi = "google_genai" | "http";

export interface GeminiProviderConfig {
  env: EnvName;

  // Auth
  apiKey: string;

  // Transport
  api: GeminiProviderApi;

  /**
   * Region/base URL:
   * - If you use Google GenAI SDK, region is typically enough.
   * - If you use raw HTTP, baseUrl controls the endpoint root.
   */
  region?: string;
  baseUrl?: string;

  // Timeouts and retries
  timeoutMs: number;
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterRatio: number;
    retryOn429: boolean;
    retryOn5xx: boolean;
    retryOnNetwork: boolean;
  };

  // Concurrency (optional, used by your client/adapter layer)
  concurrency: {
    maxConcurrent: number;
  };

  // Models (Allybi plan)
  models: {
    defaultDraft: string; // gemini-2.5-flash
    defaultFinal: string; // gemini-2.5-flash
    allowed: string[]; // strict allowlist
    strictAllowlist: boolean;
  };

  // Streaming behavior (server-side shaping; frontend still smooths)
  streaming: {
    enabled: boolean;
    maxDeltaCharsSoft: number; // prevent giant bursts
    flushOnNewline: boolean; // nicer cadence for markdown
    heartbeatEveryMs: number; // 0 disables
  };

  // Generation defaults (adapter-level safety baselines)
  generationDefaults: {
    draft: {
      temperature: number;
      topP: number;
      maxOutputTokens: number;
    };
    final: {
      temperature: number;
      topP: number;
      maxOutputTokens: number;
    };
    navPills: {
      temperature: number;
      maxOutputTokens: number;
    };
    disambiguation: {
      temperature: number;
      maxOutputTokens: number;
    };
    quoteStrict: {
      temperature: number;
      maxOutputTokens: number;
    };
  };

  // Safety posture (high-level knobs; detailed policy lives elsewhere)
  safety: {
    enabled: boolean;
    blockUnsafe: boolean; // if true, surface provider blocks to refusal path
    redactPromptInternalIds: boolean;
    redactPromptSystemPaths: boolean;
    replacement: string;
  };

  // Compatibility flags
  compat: {
    supportsDeveloperRole: boolean;
    supportsTools: boolean;
  };
}

const DEFAULTS: Omit<GeminiProviderConfig, "env" | "apiKey"> = {
  api: (process.env.GEMINI_API as GeminiProviderApi) || "google_genai",
  region: process.env.GEMINI_REGION || "us-central1",
  baseUrl: process.env.GEMINI_BASE_URL || undefined,

  timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || 20000),

  retry: {
    maxAttempts: Number(process.env.GEMINI_RETRY_MAX_ATTEMPTS || 3),
    baseDelayMs: Number(process.env.GEMINI_RETRY_BASE_DELAY_MS || 250),
    maxDelayMs: Number(process.env.GEMINI_RETRY_MAX_DELAY_MS || 4000),
    jitterRatio: Number(process.env.GEMINI_RETRY_JITTER_RATIO || 0.25),
    retryOn429: process.env.GEMINI_RETRY_ON_429 !== "false",
    retryOn5xx: process.env.GEMINI_RETRY_ON_5XX !== "false",
    retryOnNetwork: process.env.GEMINI_RETRY_ON_NETWORK !== "false",
  },

  concurrency: {
    maxConcurrent: Number(process.env.GEMINI_CONCURRENCY || 6),
  },

  models: {
    defaultDraft: process.env.GEMINI_DRAFT_MODEL || "gemini-2.5-flash",
    defaultFinal: process.env.GEMINI_FINAL_MODEL || "gemini-2.5-flash",
    allowed: process.env.GEMINI_ALLOWED_MODELS
      ? process.env.GEMINI_ALLOWED_MODELS.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : ["gemini-2.5-flash"],
    strictAllowlist: process.env.GEMINI_STRICT_ALLOWLIST !== "false",
  },

  streaming: {
    enabled: process.env.GEMINI_STREAMING_ENABLED !== "false",
    maxDeltaCharsSoft: Number(process.env.GEMINI_MAX_DELTA_CHARS_SOFT || 64),
    flushOnNewline: process.env.GEMINI_FLUSH_ON_NEWLINE !== "false",
    heartbeatEveryMs: Number(process.env.GEMINI_HEARTBEAT_MS || 0),
  },

  generationDefaults: {
    // Draft: prioritize speed + coherence
    draft: {
      temperature: Number(process.env.GEMINI_DRAFT_TEMPERATURE || 0.5),
      topP: Number(process.env.GEMINI_DRAFT_TOP_P || 0.9),
      maxOutputTokens: Number(
        process.env.GEMINI_DRAFT_MAX_OUTPUT_TOKENS || 1600,
      ),
    },

    // Final: prioritize correctness + controlled wording
    final: {
      temperature: Number(process.env.GEMINI_FINAL_TEMPERATURE || 0.25),
      topP: Number(process.env.GEMINI_FINAL_TOP_P || 0.9),
      maxOutputTokens: Number(
        process.env.GEMINI_FINAL_MAX_OUTPUT_TOKENS || 4096,
      ),
    },

    // nav_pills: always short
    navPills: {
      temperature: Number(process.env.GEMINI_NAV_TEMPERATURE || 0.2),
      maxOutputTokens: Number(process.env.GEMINI_NAV_MAX_OUTPUT_TOKENS || 220),
    },

    // disambiguation: one question, 2–4 options
    disambiguation: {
      temperature: Number(process.env.GEMINI_DISAMBIG_TEMPERATURE || 0.2),
      maxOutputTokens: Number(
        process.env.GEMINI_DISAMBIG_MAX_OUTPUT_TOKENS || 220,
      ),
    },

    // quote strict: keep output bounded (policy handles quote limits too)
    quoteStrict: {
      temperature: Number(process.env.GEMINI_QUOTE_TEMPERATURE || 0.2),
      maxOutputTokens: Number(
        process.env.GEMINI_QUOTE_MAX_OUTPUT_TOKENS || 500,
      ),
    },
  },

  safety: {
    enabled: process.env.GEMINI_SAFETY_ENABLED !== "false",
    blockUnsafe: process.env.GEMINI_BLOCK_UNSAFE !== "false",
    redactPromptInternalIds: process.env.GEMINI_REDACT_INTERNAL_IDS !== "false",
    redactPromptSystemPaths: process.env.GEMINI_REDACT_SYSTEM_PATHS !== "false",
    replacement: process.env.GEMINI_REDACTION_REPLACEMENT || "[redacted]",
  },

  compat: {
    supportsDeveloperRole:
      process.env.GEMINI_SUPPORTS_DEVELOPER_ROLE !== "false",
    supportsTools: process.env.GEMINI_SUPPORTS_TOOLS !== "false",
  },
};

export function loadGeminiConfig(env: EnvName): GeminiProviderConfig {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

  return {
    env,
    apiKey,
    ...DEFAULTS,
  };
}
