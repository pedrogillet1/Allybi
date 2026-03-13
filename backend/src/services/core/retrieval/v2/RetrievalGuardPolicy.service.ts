import { logger } from "../../../../utils/logger";
import type { EvidencePack, RetrievalRequest } from "../retrieval.types";
import { isProductionEnv } from "../retrievalEngine.utils";
import { RETRIEVAL_CONFIG } from "./retrieval.config";
import { emptyPack } from "./RetrievalTelemetry.service";

export function guardUnsafeRetrievalRequest(
  req: RetrievalRequest,
): EvidencePack | null {
  if (!req.signals.unsafeGate) return null;
  return emptyPack(req, {
    reasonCodes: ["unsafe_gate"],
    note: "Retrieval bypassed due to unsafeGate signal.",
  });
}

export function guardRetrievalMemoryPressure(
  req: RetrievalRequest,
): EvidencePack | null {
  const heapMb = process.memoryUsage().heapUsed / (1024 * 1024);
  if (heapMb <= RETRIEVAL_CONFIG.maxHeapUsedMb) return null;
  logger.warn("[retrieval] Memory pressure", { heapMb });
  return isProductionEnv(req.env)
    ? emptyPack(req, { reasonCodes: ["memory_pressure"] })
    : null;
}
