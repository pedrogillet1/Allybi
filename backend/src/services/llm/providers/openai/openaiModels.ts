// src/services/llm/providers/openai/openaiModels.ts

/**
 * OpenAI Models (Allybi)
 * -----------------------------------
 * Allybi strategy:
 *  - Single OpenAI model: gpt-5.2 (precision finisher for all OpenAI lanes)
 *
 * This file is deliberately small but strict:
 *  - typed metadata so routers / capability checks can stay deterministic
 *  - safe defaults for streaming + final passes
 */

export type OpenAIModelId = "gpt-5.2";

export interface OpenAIModelSpec {
  id: OpenAIModelId;

  /**
   * Allybi semantic role for routing.
   */
  role: "precision_finish";

  /**
   * Capability flags (used by providerCapabilities / router constraints).
   */
  capabilities: {
    streaming: true;
    tools: true;
    images: false;
  };

  /**
   * Allybi default generation defaults (router/request builder can override).
   */
  defaults: {
    temperatureDraft: number;
    temperatureFinal: number;
    maxOutputTokensDraft: number;
    maxOutputTokensFinal: number;
  };
}

/**
 * Canonical OpenAI models used by Allybi.
 */
export const OPENAI_MODELS: Record<OpenAIModelId, OpenAIModelSpec> = {
  "gpt-5.2": {
    id: "gpt-5.2",
    role: "precision_finish",
    capabilities: {
      streaming: true,
      tools: true,
      images: false,
    },
    defaults: {
      temperatureDraft: 0.35,
      temperatureFinal: 0.2,
      maxOutputTokensDraft: 1600,
      maxOutputTokensFinal: 4096,
    },
  },
};

/**
 * Primary model id for Allybi's OpenAI lane.
 */
export const OPENAI_PRIMARY_MODEL: OpenAIModelId = "gpt-5.2";

/**
 * Convenience helpers
 */
export function isOpenAIModelId(x: unknown): x is OpenAIModelId {
  return x === "gpt-5.2";
}

export function listOpenAIModels(): OpenAIModelId[] {
  return Object.keys(OPENAI_MODELS) as OpenAIModelId[];
}

export function getOpenAIModelSpec(id: OpenAIModelId): OpenAIModelSpec {
  return OPENAI_MODELS[id];
}
