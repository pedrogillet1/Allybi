/**
 * geminiModels.ts
 *
 * Single source of truth for Gemini model identifiers used by Allybi.
 * - Keep stable keys (used by routing/banks)
 * - No user-facing copy
 *
 * NOTE:
 * The exact model strings can vary depending on the Google API / release.
 * These are defaults; your env/banks can override at runtime.
 */

export type GeminiModelTier = 'flash' | 'standard';

export type GeminiModelKey =
  | 'GEMINI_3_FLASH'
  | 'GEMINI_3'
  | 'GEMINI_2_5_FLASH'
  | 'GEMINI_2_5_PRO'
  | 'UNKNOWN';

export interface GeminiModelSpec {
  key: GeminiModelKey;
  tier: GeminiModelTier;
  /**
   * Provider model id string passed to Google’s endpoint:
   * /models/{model}:generateContent or :streamGenerateContent
   */
  modelId: string;
}

/**
 * Defaults: update here, not in random services.
 */
export const GEMINI_MODELS: Record<GeminiModelKey, GeminiModelSpec> = {
  GEMINI_3_FLASH: {
    key: 'GEMINI_3_FLASH',
    tier: 'flash',
    modelId: 'gemini-2.5-flash',
  },
  GEMINI_3: {
    key: 'GEMINI_3',
    tier: 'flash',
    modelId: 'gemini-2.5-flash',
  },
  GEMINI_2_5_FLASH: {
    key: 'GEMINI_2_5_FLASH',
    tier: 'flash',
    modelId: 'gemini-2.5-flash',
  },
  GEMINI_2_5_PRO: {
    key: 'GEMINI_2_5_PRO',
    tier: 'flash',
    modelId: 'gemini-2.5-flash',
  },
  UNKNOWN: {
    key: 'UNKNOWN',
    tier: 'flash',
    modelId: 'gemini-2.5-flash',
  },
};

/**
 * Resolve model by key, falling back deterministically.
 */
export function getGeminiModel(key: GeminiModelKey): GeminiModelSpec {
  return GEMINI_MODELS[key] ?? GEMINI_MODELS.UNKNOWN;
}

/**
 * Resolve modelId from env override (if provided) else defaults.
 * Use this in config/bootstrap, not inside routing logic.
 */
export function resolveGeminiModelId(params: {
  key: GeminiModelKey;
  overrideModelId?: string;
}): string {
  const override = params.overrideModelId?.trim();
  if (override) return override;
  return getGeminiModel(params.key).modelId;
}
