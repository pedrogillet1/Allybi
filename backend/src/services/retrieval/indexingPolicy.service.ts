export type IndexingRuntimeMode = "v1" | "v2";

export interface IndexingPolicySnapshot {
  runtimeSelectorFlag: string;
  runtimeModeAllowedEnv: string;
  runtimeMode: IndexingRuntimeMode;
  allowedRuntimeModes: IndexingRuntimeMode[];
  runtimeModeAllowed: boolean;
  strictFailClosed: boolean;
  encryptedChunksOnly: boolean;
  allowPlaintextChunksOverride: boolean;
  plaintextOverrideReason: string | null;
  enforceEncryptedOnlyInvariant: boolean;
  enforceChunkMetadataInvariant: boolean;
  enforceVersionMetadataInvariant: boolean;
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

function assertProtectedRuntimeInvariants(params: {
  nodeEnv: unknown;
  enforceEncryptedOnlyInvariant: boolean;
  enforceChunkMetadataInvariant: boolean;
  enforceVersionMetadataInvariant: boolean;
  verifyRequired: boolean;
}): void {
  if (!isProtectedRuntimeEnv(params.nodeEnv)) return;
  const disabled: string[] = [];
  if (!params.enforceEncryptedOnlyInvariant) {
    disabled.push("INDEXING_ENFORCE_ENCRYPTED_ONLY");
  }
  if (!params.enforceChunkMetadataInvariant) {
    disabled.push("INDEXING_ENFORCE_CHUNK_METADATA");
  }
  if (!params.enforceVersionMetadataInvariant) {
    disabled.push("INDEXING_ENFORCE_VERSION_METADATA");
  }
  if (!params.verifyRequired) {
    disabled.push("INDEXING_VERIFY_REQUIRED");
  }
  if (disabled.length === 0) return;
  throw new Error(
    `[indexing] Protected runtime requires strict indexing invariants. Disabled flags: ${disabled.join(", ")}.`,
  );
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
  const allowPlaintextChunksOverride = parseBooleanFlag(
    env.INDEXING_ALLOW_PLAINTEXT_CHUNKS,
    false,
  );
  const plaintextOverrideReason = String(
    env.INDEXING_PLAINTEXT_OVERRIDE_REASON || "",
  ).trim();
  const enforceEncryptedOnlyInvariant = parseBooleanFlag(
    env.INDEXING_ENFORCE_ENCRYPTED_ONLY,
    true,
  );
  const enforceChunkMetadataInvariant = parseBooleanFlag(
    env.INDEXING_ENFORCE_CHUNK_METADATA,
    true,
  );
  const enforceVersionMetadataInvariant = parseBooleanFlag(
    env.INDEXING_ENFORCE_VERSION_METADATA,
    true,
  );
  const verifyRequired = parseBooleanFlag(env.INDEXING_VERIFY_REQUIRED, true);

  if (!encryptedChunksOnly && isProtectedRuntimeEnv(env.NODE_ENV)) {
    throw new Error(
      "[indexing] INDEXING_ENCRYPTED_CHUNKS_ONLY=false is not allowed in production/staging.",
    );
  }
  if (!encryptedChunksOnly && !allowPlaintextChunksOverride) {
    throw new Error(
      "[indexing] INDEXING_ENCRYPTED_CHUNKS_ONLY=false requires INDEXING_ALLOW_PLAINTEXT_CHUNKS=true.",
    );
  }
  if (
    !encryptedChunksOnly &&
    allowPlaintextChunksOverride &&
    !plaintextOverrideReason
  ) {
    throw new Error(
      "[indexing] INDEXING_ALLOW_PLAINTEXT_CHUNKS=true requires INDEXING_PLAINTEXT_OVERRIDE_REASON to be set.",
    );
  }
  assertProtectedRuntimeInvariants({
    nodeEnv: env.NODE_ENV,
    enforceEncryptedOnlyInvariant,
    enforceChunkMetadataInvariant,
    enforceVersionMetadataInvariant,
    verifyRequired,
  });

  return {
    runtimeSelectorFlag: VECTOR_EMBEDDING_SELECTOR_FLAG,
    runtimeModeAllowedEnv: INDEXING_RUNTIME_MODE_ALLOWED_ENV,
    runtimeMode,
    allowedRuntimeModes,
    runtimeModeAllowed: allowedRuntimeModes.includes(runtimeMode),
    strictFailClosed: parseBooleanFlag(env.INDEXING_STRICT_FAIL_CLOSED, true),
    encryptedChunksOnly,
    allowPlaintextChunksOverride,
    plaintextOverrideReason: plaintextOverrideReason || null,
    enforceEncryptedOnlyInvariant,
    enforceChunkMetadataInvariant,
    enforceVersionMetadataInvariant,
    verifyRequired,
    allowUnverifiedPreviousOperationDelete: parseBooleanFlag(
      env.INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE,
      false,
    ),
    embeddingFailCloseV1: parseBooleanFlag(env.EMBEDDING_FAILCLOSE_V1, true),
  };
}
