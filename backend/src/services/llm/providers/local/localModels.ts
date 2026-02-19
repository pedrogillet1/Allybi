// src/services/llm/providers/local/localModels.ts

/**
 * Local model registry for Allybi.
 *
 * Defines the known / allowed local models (Ollama, vLLM, llama.cpp).
 * Used by localConfig to build the default allowlist and by the client
 * as a fallback when the runtime can't be reached for model discovery.
 */

export interface LocalModelDef {
  /** Display / canonical name */
  name: string;
  /** Default temperature */
  temperature: number;
  /** Default max output tokens */
  maxOutputTokens: number;
  /** Context window size (approx) */
  contextWindow: number;
}

/**
 * Allowlisted models with sensible defaults.
 * Keys are the Ollama model tags (or vLLM model ids).
 */
export const LOCAL_MODEL_DEFAULTS: Record<string, LocalModelDef> = {
  "llama3.1": {
    name: "Llama 3.1 8B",
    temperature: 0.4,
    maxOutputTokens: 2048,
    contextWindow: 8192,
  },
  llama3: {
    name: "Llama 3 8B",
    temperature: 0.4,
    maxOutputTokens: 2048,
    contextWindow: 8192,
  },
  "qwen2.5": {
    name: "Qwen 2.5 7B",
    temperature: 0.4,
    maxOutputTokens: 2048,
    contextWindow: 8192,
  },
  phi3: {
    name: "Phi-3 Mini",
    temperature: 0.4,
    maxOutputTokens: 2048,
    contextWindow: 4096,
  },
  gemma2: {
    name: "Gemma 2 9B",
    temperature: 0.4,
    maxOutputTokens: 2048,
    contextWindow: 8192,
  },
};

/** Primary model used as default when no model is specified. */
export const LOCAL_PRIMARY_MODEL = "llama3.1";

/** Returns sorted list of all known local model names. */
export function listLocalModels(): string[] {
  return Object.keys(LOCAL_MODEL_DEFAULTS).sort();
}
