// src/services/llm/providers/openai/openaiConfig.ts

/**
 * OpenAI Config (Allybi, ChatGPT-parity)
 * -----------------------------------
 * Centralized configuration for the OpenAI provider lane.
 *
 * Allybi strategy:
 *  - OpenAI is the precision finisher lane (final pass, strict correctness).
 *  - Draft model: gpt-5-mini
 *  - Final model: gpt-5.2
 *
 * This file contains:
 *  - env-derived config with safe defaults
 *  - strict allowlist enforcement
 *  - streaming/cadence options
 *
 * NOTE:
 *  - Do not log API keys.
 */

import type { EnvName } from "../../types/llm.types";
import {
  OPENAI_PRIMARY_MODEL,
  OPENAI_DRAFT_MODEL,
  listOpenAIModels,
} from "./openaiModels";

export interface OpenAIProviderConfig {
  env: EnvName;

  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;

  timeoutMs: number;

  // Models
  defaultModelDraft: string; // gpt-5-mini
  defaultModelFinal: string; // gpt-5.2
  allowedModels: string[];
  strictModelAllowlist: boolean;

  // Streaming
  includeUsageInStream: boolean;
  maxDeltaCharsSoft: number;

  // Tools
  allowTools: boolean;

  // Adapter behavior
  preferredApi: "responses" | "chat_completions";
  supportsDeveloperRole: boolean;
  strictNoImages: boolean;
}

export function loadOpenAIConfig(env: EnvName): OpenAIProviderConfig {
  const apiKey = process.env.OPENAI_API_KEY || "";

  return {
    env,

    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    organization: process.env.OPENAI_ORG_ID || undefined,
    project: process.env.OPENAI_PROJECT_ID || undefined,

    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 30000),

    defaultModelDraft: process.env.OPENAI_DRAFT_MODEL || OPENAI_DRAFT_MODEL,
    defaultModelFinal: process.env.OPENAI_FINAL_MODEL || OPENAI_PRIMARY_MODEL,
    allowedModels: process.env.OPENAI_ALLOWED_MODELS
      ? process.env.OPENAI_ALLOWED_MODELS.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : listOpenAIModels(),
    strictModelAllowlist: process.env.OPENAI_STRICT_ALLOWLIST !== "false",

    includeUsageInStream:
      process.env.OPENAI_INCLUDE_USAGE_IN_STREAM !== "false",
    maxDeltaCharsSoft: Number(process.env.OPENAI_MAX_DELTA_CHARS_SOFT || 64),

    allowTools: process.env.OPENAI_ALLOW_TOOLS !== "false",

    preferredApi:
      (process.env.OPENAI_PREFERRED_API as "responses" | "chat_completions") || "chat_completions",
    supportsDeveloperRole:
      process.env.OPENAI_SUPPORTS_DEVELOPER_ROLE !== "false",
    strictNoImages: process.env.OPENAI_STRICT_NO_IMAGES !== "false",
  };
}
