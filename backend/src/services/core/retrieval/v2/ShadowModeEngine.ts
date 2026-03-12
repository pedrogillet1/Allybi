/**
 * ShadowModeRetrievalEngine — runs a shadow engine alongside the primary
 * for comparison purposes without affecting the hot path.
 *
 * The primary engine's result is always returned. The shadow runs
 * fire-and-forget on a sample of requests and pushes comparison data
 * to a configurable sink.
 *
 * Activation: RETRIEVAL_SHADOW_MODE=true, RETRIEVAL_SHADOW_SAMPLE_RATE=0.05
 */

import { logger } from "../../../../utils/logger";
import type {
  IRetrievalEngine,
  RetrievalRequest,
  EvidencePack,
} from "../retrieval.types";
import { compareEvidencePacks, type ShadowComparison } from "./ShadowComparison.service";

export interface ShadowModeOpts {
  /** Fraction of requests to shadow (0.0–1.0). Default 0.05. */
  sampleRate: number;
  /** Max time to wait for shadow result before discarding. Default 5000ms. */
  timeoutMs: number;
}

export class ShadowModeRetrievalEngine implements IRetrievalEngine {
  constructor(
    private readonly primary: IRetrievalEngine,
    private readonly shadow: IRetrievalEngine,
    private readonly comparisonSink: (comparison: ShadowComparison) => void,
    private readonly opts: ShadowModeOpts = { sampleRate: 0.05, timeoutMs: 5000 },
  ) {}

  async retrieve(req: RetrievalRequest): Promise<EvidencePack> {
    const primaryPromise = this.primary.retrieve(req);

    if (Math.random() < this.opts.sampleRate) {
      this.runShadow(req, primaryPromise);
    }

    return primaryPromise;
  }

  private runShadow(
    req: RetrievalRequest,
    primaryPromise: Promise<EvidencePack>,
  ): void {
    const shadowPromise = Promise.race([
      this.shadow.retrieve(req),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), this.opts.timeoutMs)),
    ]);

    Promise.all([primaryPromise, shadowPromise])
      .then(([primaryPack, shadowResult]) => {
        if (!shadowResult) {
          logger.debug("[retrieval:shadow] Shadow timed out, skipping comparison");
          return;
        }
        const comparison = compareEvidencePacks(
          primaryPack,
          shadowResult,
          req.query,
        );
        this.comparisonSink(comparison);
      })
      .catch((err) => {
        logger.debug("[retrieval:shadow] Shadow comparison failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }
}
