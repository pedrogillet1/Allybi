import vectorEmbeddingServiceV1 from "./vectorEmbedding.service";
import vectorEmbeddingServiceV2 from "./vectorEmbedding.v2.service";

function isFlagEnabled(flagName: string, defaultValue: boolean): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

const vectorEmbeddingRuntimeService = isFlagEnabled(
  "RETRIEVAL_V2_VECTOR_EMBEDDING",
  false,
)
  ? vectorEmbeddingServiceV2
  : vectorEmbeddingServiceV1;

export default vectorEmbeddingRuntimeService;
