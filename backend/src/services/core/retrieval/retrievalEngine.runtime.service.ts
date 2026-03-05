import {
  RetrievalEngineService as RetrievalEngineServiceV1,
  RetrievalScopeViolationError,
} from "./retrievalEngine.service";
import { RetrievalEngineServiceV2 } from "./retrievalEngine.v2.service";

const RETRIEVAL_ENGINE_SELECTOR_FLAG = "RETRIEVAL_V2_ENGINE";

function isFlagEnabled(flagName: string, defaultValue: boolean): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

type RetrievalEngineRuntimeMode = "v1" | "v2";

function resolveRetrievalEngineRuntimeMode(): RetrievalEngineRuntimeMode {
  return isFlagEnabled(RETRIEVAL_ENGINE_SELECTOR_FLAG, false) ? "v2" : "v1";
}

const retrievalEngineRuntimeMode = resolveRetrievalEngineRuntimeMode();

export const retrievalEngineRuntimeMetadata = {
  flag: RETRIEVAL_ENGINE_SELECTOR_FLAG,
  mode: retrievalEngineRuntimeMode,
} as const;

export function getRetrievalEngineRuntimeMetadata() {
  return retrievalEngineRuntimeMetadata;
}

export const RetrievalEngineService = (retrievalEngineRuntimeMode === "v2"
  ? RetrievalEngineServiceV2
  : RetrievalEngineServiceV1) as typeof RetrievalEngineServiceV1;

export { RetrievalScopeViolationError };
