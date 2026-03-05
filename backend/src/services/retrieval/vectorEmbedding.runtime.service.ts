import vectorEmbeddingServiceV1 from "./vectorEmbedding.service";
import vectorEmbeddingServiceV2 from "./vectorEmbedding.v2.service";
import { resolveIndexingPolicySnapshot } from "./indexingPolicy.service";

const indexingPolicy = resolveIndexingPolicySnapshot();
const vectorEmbeddingRuntimeMode = indexingPolicy.runtimeMode;

export const vectorEmbeddingRuntimeMetadata = {
  flag: indexingPolicy.runtimeSelectorFlag,
  mode: vectorEmbeddingRuntimeMode,
  modeAllowed: indexingPolicy.runtimeModeAllowed,
  allowedModes: indexingPolicy.allowedRuntimeModes,
  modeAllowedEnv: indexingPolicy.runtimeModeAllowedEnv,
} as const;

export function getVectorEmbeddingRuntimeMetadata() {
  return vectorEmbeddingRuntimeMetadata;
}

const vectorEmbeddingRuntimeService = vectorEmbeddingRuntimeMode === "v2"
  ? vectorEmbeddingServiceV2
  : vectorEmbeddingServiceV1;

export default vectorEmbeddingRuntimeService;
