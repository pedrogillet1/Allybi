// src/services/llm/providers/openai/openaiModels.ts

/**
 * OpenAI Models (Allybi)
 * -----------------------------------
 * Allybi strategy:
 *  - Draft / fast lane: gpt-5-mini
 *  - Final / authority lane: gpt-5.2
 *
 * This file is deliberately small but strict:
 *  - typed metadata so routers / capability checks can stay deterministic
 *  - safe defaults for streaming + final passes
 */

export type OpenAIModelId = "gpt-5-mini" | "gpt-5.2";

export interface OpenAIModelSpec {
  id: OpenAIModelId;

  /**
   * Allybi semantic role for routing.
   */
  role: "draft" | "precision_finish";

  /**
   * Capability flags (used by providerCapabilities / router constraints).
   * Keep these conservative; if you add tools/images, update here and in providerCapabilities bank.
   */
  capabilities: {
    streaming: true;
    tools: true;
    images: false; // Allybi chat is doc-grounded; images handled by extraction pipeline, not LLM input
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
  "gpt-5-mini": {
    id: "gpt-5-mini",
    role: "draft",
    capabilities: {
      streaming: true,
      tools: true,
      images: false,
    },
    defaults: {
      temperatureDraft: 0.5,
      temperatureFinal: 0.25,
      maxOutputTokensDraft: 1600,
      maxOutputTokensFinal: 4096,
    },
  },
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
 * Primary model ids for Allybi's OpenAI lane.
 */
export const OPENAI_DRAFT_MODEL: OpenAIModelId = "gpt-5-mini";
export const OPENAI_PRIMARY_MODEL: OpenAIModelId = "gpt-5.2";

/**
 * Convenience helpers
 */
export function isOpenAIModelId(x: any): x is OpenAIModelId {
  return x === "gpt-5-mini" || x === "gpt-5.2";
}

export function listOpenAIModels(): OpenAIModelId[] {
  return Object.keys(OPENAI_MODELS) as OpenAIModelId[];
}

export function getOpenAIModelSpec(id: OpenAIModelId): OpenAIModelSpec {
  return OPENAI_MODELS[id];
}
