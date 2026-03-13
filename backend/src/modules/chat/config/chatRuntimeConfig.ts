export type ChatRuntimeEnvironment =
  | "production"
  | "staging"
  | "dev"
  | "local";

export type TurnRouterConfig = {
  environment: ChatRuntimeEnvironment;
  strictIntentConfig: boolean;
  failOpen: boolean;
};

export type ConnectorTurnConfig = {
  timeoutMs: number;
};

export type ComposeRuntimeConfig = {
  lowConfidenceSurfaceFallback: boolean;
};

export type RetrievalRuntimeConfig = {
  environment: ChatRuntimeEnvironment;
  retrievalPlanTimeoutMs: number;
};

export type ProvenanceRuntimeConfig = {
  strictV2: boolean;
  thresholdsV3: boolean;
};

export type ChatLanguageConfig = {
  environment: ChatRuntimeEnvironment;
  languageContractV2: boolean;
};

export type TruncationRuntimeConfig = {
  semanticTruncationV2: boolean;
};

export type MemoryRuntimeConfig = {
  recentHistoryOrderV2: boolean;
};

function normalizeBoolean(
  value: unknown,
  defaultValue: boolean,
): boolean {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "on", "yes"].includes(raw)) return true;
  if (["0", "false", "off", "no"].includes(raw)) return false;
  return defaultValue;
}

function normalizeInteger(
  value: unknown,
  fallback: number,
  bounds?: { min?: number; max?: number },
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  let normalized = Math.floor(parsed);
  if (typeof bounds?.min === "number") {
    normalized = Math.max(bounds.min, normalized);
  }
  if (typeof bounds?.max === "number") {
    normalized = Math.min(bounds.max, normalized);
  }
  return normalized;
}

export function resolveChatRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ChatRuntimeEnvironment {
  const raw = String(env.NODE_ENV || "").trim().toLowerCase();
  if (raw === "production") return "production";
  if (raw === "staging") return "staging";
  if (raw === "development" || raw === "test" || raw === "dev") return "dev";
  return "local";
}

export function resolveTurnRouterConfig(
  env: NodeJS.ProcessEnv = process.env,
): TurnRouterConfig {
  const environment = resolveChatRuntimeEnvironment(env);
  return {
    environment,
    strictIntentConfig:
      environment === "production" || environment === "staging",
    failOpen: normalizeBoolean(env.TURN_ROUTER_FAIL_OPEN, false),
  };
}

export function resolveConnectorTurnConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConnectorTurnConfig {
  return {
    timeoutMs: normalizeInteger(env.CONNECTOR_CHAT_OP_TIMEOUT_MS, 15_000, {
      min: 1_000,
      max: 120_000,
    }),
  };
}

export function resolveComposeRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ComposeRuntimeConfig {
  return {
    lowConfidenceSurfaceFallback: normalizeBoolean(
      env.LOW_CONFIDENCE_SURFACE_FALLBACK,
      false,
    ),
  };
}

export function resolveRetrievalRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RetrievalRuntimeConfig {
  return {
    environment: resolveChatRuntimeEnvironment(env),
    retrievalPlanTimeoutMs: normalizeInteger(env.RETRIEVAL_PLAN_TIMEOUT_MS, 5_000, {
      min: 2_000,
    }),
  };
}

export function resolveProvenanceRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProvenanceRuntimeConfig {
  return {
    strictV2: normalizeBoolean(env.STRICT_PROVENANCE_V2, true),
    thresholdsV3: normalizeBoolean(env.PROVENANCE_THRESHOLDS_V3, true),
  };
}

export function resolveChatLanguageConfig(
  env: NodeJS.ProcessEnv = process.env,
): ChatLanguageConfig {
  return {
    environment: resolveChatRuntimeEnvironment(env),
    languageContractV2: normalizeBoolean(env.LANGUAGE_CONTRACT_V2, true),
  };
}

export function resolveTruncationRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): TruncationRuntimeConfig {
  return {
    semanticTruncationV2: normalizeBoolean(
      env.TRUNCATION_SEMANTIC_V2_ENABLED,
      true,
    ),
  };
}

export function resolveMemoryRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): MemoryRuntimeConfig {
  return {
    recentHistoryOrderV2: normalizeBoolean(env.RECENT_HISTORY_ORDER_V2, true),
  };
}
