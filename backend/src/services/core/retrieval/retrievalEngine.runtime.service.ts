import {
  RetrievalEngineService as RetrievalEngineServiceV1,
  RetrievalScopeViolationError,
} from "./retrievalEngine.service";
import { RetrievalEngineServiceV2 } from "./retrievalEngine.v2.service";

function isFlagEnabled(flagName: string, defaultValue: boolean): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

export const RetrievalEngineService = (isFlagEnabled(
  "RETRIEVAL_V2_ENGINE",
  false,
)
  ? RetrievalEngineServiceV2
  : RetrievalEngineServiceV1) as typeof RetrievalEngineServiceV1;

export { RetrievalScopeViolationError };
