// src/services/llm/providers/openai/openaiModels.ts

/**
 * OpenAI Models (Koda, ChatGPT-parity)
 * -----------------------------------
 * Koda strategy:
 *  - OpenAI is the “precision finisher” lane.
 *  - Primary model: gpt-5.2
 *
 * This file is deliberately small but strict:
 *  - one canonical model for Koda’s OpenAI lane
 *  - typed metadata so routers / capability checks can stay deterministic
 *  - safe defaults for streaming + final passes
 */

export type OpenAIModelId = "gpt-5.2";

export interface OpenAIModelSpec {
  id: OpenAIModelId;

  /**
   * Koda semantic role for routing.
   */
  role: "precision_finish";

  /**
   * Capability flags (used by providerCapabilities / router constraints).
   * Keep these conservative; if you add tools/images, update here and in providerCapabilities bank.
   */
  capabilities: {
    streaming: true;
    tools: true;
    images: false; // Koda chat is doc-grounded; images handled by extraction pipeline, not LLM input
  };

  /**
   * Koda default generation defaults (router/request builder can override).
   */
  defaults: {
    temperatureDraft: number; // if ever used for draft (rare)
    temperatureFinal: number; // normal finish
    maxOutputTokensDraft: number;
    maxOutputTokensFinal: number;
  };
}

/**
 * Canonical OpenAI model used by Koda.
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
      maxOutputTokensDraft: 700,
      maxOutputTokensFinal: 900,
    },
  },
};

/**
 * Primary model id for Koda’s OpenAI lane.
 */
export const OPENAI_PRIMARY_MODEL: OpenAIModelId = "gpt-5.2";

/**
 * Convenience helpers
 */
export function isOpenAIModelId(x: any): x is OpenAIModelId {
  return x === "gpt-5.2";
}

export function listOpenAIModels(): OpenAIModelId[] {
  return Object.keys(OPENAI_MODELS) as OpenAIModelId[];
}

export function getOpenAIModelSpec(id: OpenAIModelId): OpenAIModelSpec {
  return OPENAI_MODELS[id];
}
