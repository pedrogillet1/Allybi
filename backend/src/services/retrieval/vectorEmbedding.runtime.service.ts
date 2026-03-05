import vectorEmbeddingServiceV1 from "./vectorEmbedding.service";
import vectorEmbeddingServiceV2 from "./vectorEmbedding.v2.service";

const VECTOR_EMBEDDING_SELECTOR_FLAG = "RETRIEVAL_V2_VECTOR_EMBEDDING";

function isFlagEnabled(flagName: string, defaultValue: boolean): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

type VectorEmbeddingRuntimeMode = "v1" | "v2";

function resolveVectorEmbeddingRuntimeMode(): VectorEmbeddingRuntimeMode {
  return isFlagEnabled(VECTOR_EMBEDDING_SELECTOR_FLAG, false) ? "v2" : "v1";
}

const vectorEmbeddingRuntimeMode = resolveVectorEmbeddingRuntimeMode();

export const vectorEmbeddingRuntimeMetadata = {
  flag: VECTOR_EMBEDDING_SELECTOR_FLAG,
  mode: vectorEmbeddingRuntimeMode,
} as const;

export function getVectorEmbeddingRuntimeMetadata() {
  return vectorEmbeddingRuntimeMetadata;
}

const vectorEmbeddingRuntimeService = vectorEmbeddingRuntimeMode === "v2"
  ? vectorEmbeddingServiceV2
  : vectorEmbeddingServiceV1;

export default vectorEmbeddingRuntimeService;
