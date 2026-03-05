export type IndexingRuntimeMode = "v1" | "v2";

export interface IndexingPolicySnapshot {
  runtimeSelectorFlag: string;
  runtimeModeAllowedEnv: string;
  runtimeMode: IndexingRuntimeMode;
  allowedRuntimeModes: IndexingRuntimeMode[];
  runtimeModeAllowed: boolean;
  strictFailClosed: boolean;
  encryptedChunksOnly: boolean;
  verifyRequired: boolean;
  allowUnverifiedPreviousOperationDelete: boolean;
  embeddingFailCloseV1: boolean;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export const VECTOR_EMBEDDING_SELECTOR_FLAG = "RETRIEVAL_V2_VECTOR_EMBEDDING";
export const INDEXING_RUNTIME_MODE_ALLOWED_ENV = "INDEXING_RUNTIME_MODE_ALLOWED";

function normalize(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export function parseBooleanFlag(
  rawValue: unknown,
  defaultValue: boolean,
): boolean {
  const raw = normalize(rawValue);
  if (!raw) return defaultValue;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return defaultValue;
}

function parseRuntimeModeAllowed(rawValue: unknown): IndexingRuntimeMode[] {
  const raw = normalize(rawValue);
  if (!raw || raw === "both" || raw === "all" || raw === "any") {
    return ["v1", "v2"];
  }
  if (raw === "v1" || raw === "legacy") return ["v1"];
  if (raw === "v2") return ["v2"];
  if (raw === "v1,v2" || raw === "v2,v1") return ["v1", "v2"];
  // Fail closed for unknown values.
  return [];
}

function resolveRuntimeMode(env: NodeJS.ProcessEnv): IndexingRuntimeMode {
  // Default to v2 unless explicitly disabled for rollback scenarios.
  const enabled = parseBooleanFlag(env[VECTOR_EMBEDDING_SELECTOR_FLAG], true);
  return enabled ? "v2" : "v1";
}

function isProtectedRuntimeEnv(nodeEnv: unknown): boolean {
  const normalized = normalize(nodeEnv);
  return normalized === "production" || normalized === "staging";
}

export function resolveIndexingPolicySnapshot(
  env: NodeJS.ProcessEnv = process.env,
): IndexingPolicySnapshot {
  const runtimeMode = resolveRuntimeMode(env);
  const allowedRuntimeModes = parseRuntimeModeAllowed(
    env[INDEXING_RUNTIME_MODE_ALLOWED_ENV],
  );
  const encryptedChunksOnly = parseBooleanFlag(
    env.INDEXING_ENCRYPTED_CHUNKS_ONLY,
    true,
  );
  if (isProtectedRuntimeEnv(env.NODE_ENV) && !encryptedChunksOnly) {
    throw new Error(
      "[indexing] INDEXING_ENCRYPTED_CHUNKS_ONLY=false is not allowed in production/staging.",
    );
  }

  return {
    runtimeSelectorFlag: VECTOR_EMBEDDING_SELECTOR_FLAG,
    runtimeModeAllowedEnv: INDEXING_RUNTIME_MODE_ALLOWED_ENV,
    runtimeMode,
    allowedRuntimeModes,
    runtimeModeAllowed: allowedRuntimeModes.includes(runtimeMode),
    strictFailClosed: parseBooleanFlag(env.INDEXING_STRICT_FAIL_CLOSED, true),
    encryptedChunksOnly,
    verifyRequired: parseBooleanFlag(env.INDEXING_VERIFY_REQUIRED, true),
    allowUnverifiedPreviousOperationDelete: parseBooleanFlag(
      env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE,
      false,
    ),
    embeddingFailCloseV1: parseBooleanFlag(env.EMBEDDING_FAILCLOSE_V1, true),
  };
}
