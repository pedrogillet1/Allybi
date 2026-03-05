// src/services/llm/providers/openai/openaiConfig.ts

/**
 * OpenAI Config (Allybi, ChatGPT-parity)
 * -----------------------------------
 * Centralized configuration for the OpenAI provider lane.
 *
 * Allybi strategy:
 *  - OpenAI is the precision finisher lane (final pass, strict correctness).
 *  - Single model: gpt-5.2 (all OpenAI lanes)
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
import { toCostFamilyModel } from "../../core/llmCostCalculator";
import {
  OPENAI_PRIMARY_MODEL,
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
  defaultModelDraft: string; // gpt-5.2
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

function isAllowedOpenAIFamilyModel(model: string): boolean {
  const family = toCostFamilyModel(String(model || ""));
  return family === "gpt-5.2";
}

export function loadOpenAIConfig(env: EnvName): OpenAIProviderConfig {
  const apiKey = process.env.OPENAI_API_KEY || "";

  const resolved: OpenAIProviderConfig = {
    env,

    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    organization: process.env.OPENAI_ORG_ID || undefined,
    project: process.env.OPENAI_PROJECT_ID || undefined,

    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 30000),

    defaultModelDraft: process.env.OPENAI_DRAFT_MODEL || OPENAI_PRIMARY_MODEL,
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

  if (
    (env === "production" || env === "staging") &&
    resolved.strictModelAllowlist === false
  ) {
    throw new Error(
      "OPENAI_STRICT_ALLOWLIST must remain enabled in production/staging",
    );
  }

  if (
    env === "production" ||
    env === "staging"
  ) {
    if (!isAllowedOpenAIFamilyModel(resolved.defaultModelDraft)) {
      throw new Error(
        `OPENAI_DRAFT_MODEL is outside governance allowlist: ${resolved.defaultModelDraft}`,
      );
    }
    if (!isAllowedOpenAIFamilyModel(resolved.defaultModelFinal)) {
      throw new Error(
        `OPENAI_FINAL_MODEL is outside governance allowlist: ${resolved.defaultModelFinal}`,
      );
    }
    const invalidAllowed = resolved.allowedModels.find(
      (model) => !isAllowedOpenAIFamilyModel(model),
    );
    if (invalidAllowed) {
      throw new Error(
        `OPENAI_ALLOWED_MODELS contains model outside governance allowlist: ${invalidAllowed}`,
      );
    }
  }

  return resolved;
}
