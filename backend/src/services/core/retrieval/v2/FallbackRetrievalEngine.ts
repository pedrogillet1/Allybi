/**
 * FallbackRetrievalEngine — mid-request V1 fallback wrapper.
 *
 * Wraps a primary engine (V2) with a fallback engine (V1).
 * If the primary returns a failed status with zero evidence,
 * the fallback engine is invoked transparently.
 */

import { logger } from "../../../../utils/logger";
import type {
  IRetrievalEngine,
  RetrievalRequest,
  EvidencePack,
} from "../retrieval.types";

export class FallbackRetrievalEngine implements IRetrievalEngine {
  constructor(
    private readonly primary: IRetrievalEngine,
    private readonly fallback: IRetrievalEngine,
  ) {}

  async retrieve(req: RetrievalRequest): Promise<EvidencePack> {
    let pack: EvidencePack;
    try {
      pack = await this.primary.retrieve(req);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err || "unknown_error");
      logger.warn("[retrieval] V2 threw at runtime, falling back to V1", {
        error: message,
      });
      return this.fallback.retrieve(req);
    }

    if (pack.runtimeStatus === "failed" && pack.evidence.length === 0) {
      logger.warn("[retrieval] V2 failed at runtime, falling back to V1");
      return this.fallback.retrieve(req);
    }

    return pack;
  }
}
