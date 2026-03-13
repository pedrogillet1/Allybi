/**
 * PhaseRunner — v2 extraction from RetrievalEngineService
 *
 * Standalone function for running hybrid retrieval phases (semantic,
 * lexical, structural) across multiple query variants, with per-call
 * timeouts and a total phase budget.
 */

import { logger } from "../../../../utils/logger";
import type {
  CandidateSource,
  RetrievalQueryVariant,
  RetrievalPhaseResult,
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
} from "../retrieval.types";
import { safeNumber, clamp01 } from "../retrievalEngine.utils";
import { RETRIEVAL_CONFIG } from "./retrieval.config";

/**
 * Execute hybrid retrieval phases for each query variant.
 *
 * Each variant triggers enabled phases (semantic, lexical, structural)
 * as defined in `semanticCfg.config.hybridPhases`. Within a variant all
 * phases run in parallel; variants run sequentially subject to a total
 * time budget.
 */
export async function runPhases(opts: {
  queryVariants: RetrievalQueryVariant[];
  scopeDocIds: string[];
  semanticCfg: Record<string, any>;
  additionalStructuralAnchors?: string[];
  semanticIndex: SemanticIndex;
  lexicalIndex: LexicalIndex;
  structuralIndex: StructuralIndex;
}): Promise<RetrievalPhaseResult[]> {
  const phases = opts.semanticCfg?.config?.hybridPhases ?? [];
  const results: RetrievalPhaseResult[] = [];

  const variants =
    Array.isArray(opts.queryVariants) && opts.queryVariants.length
      ? opts.queryVariants
      : [
          {
            text: "",
            weight: 1,
            sourceRuleId: "base_query",
            reason: "default",
          },
        ];
  const perCallTimeoutMs = RETRIEVAL_CONFIG.phaseCallTimeoutMs;
  const totalPhaseBudgetMs = RETRIEVAL_CONFIG.phaseBudgetMs;
  const extraVariantStrategy = RETRIEVAL_CONFIG.extraVariantPhases;

  const runWithTimeout = async <T>(
    operation: Promise<T>,
    fallback: T,
    label: string,
  ): Promise<{
    output: T;
    status: "ok" | "failed" | "timed_out";
    note?: string;
  }> => {
    let timer: NodeJS.Timeout | null = null;
    const guarded = operation
      .then((value) => ({
        output: value,
        status: "ok" as const,
      }))
      .catch((err) => {
        const errorMessage =
          err instanceof Error ? err.message : String(err || "unknown_error");
        logger.warn("[retrieval-engine] retrieval phase failed", {
          label,
          error: errorMessage,
        });
        return {
          output: fallback,
          status: "failed" as const,
          note: `${label} failed: ${errorMessage}`,
        };
      });
    const timed = new Promise<{
      output: T;
      status: "ok" | "failed" | "timed_out";
      note?: string;
    }>((resolve) => {
      timer = setTimeout(() => {
        logger.warn("[retrieval-engine] retrieval phase timed out", {
          label,
          timeoutMs: perCallTimeoutMs,
        });
        resolve({
          output: fallback,
          status: "timed_out",
          note: `${label} timed out after ${perCallTimeoutMs}ms`,
        });
      }, perCallTimeoutMs);
    });
    const output = await Promise.race([guarded, timed]);
    if (timer) clearTimeout(timer);
    return output;
  };

  const retrievalStartedAt = Date.now();

  for (let variantIdx = 0; variantIdx < variants.length; variantIdx += 1) {
    const variant = variants[variantIdx];
    const isBaseVariant =
      variantIdx === 0 || variant.sourceRuleId === "base_query";

    if (Date.now() - retrievalStartedAt >= totalPhaseBudgetMs) {
      return results;
    }

    // Build phase tasks, then run them in parallel within each variant.
    const normalizeHits = (
      rawHits: unknown[],
      weight: number,
    ): Array<Record<string, unknown>> =>
      rawHits.map((hit) => {
        const normalizedHit =
          hit && typeof hit === "object"
            ? (hit as Record<string, unknown>)
            : {};
        return {
          ...normalizedHit,
          score: clamp01(
            safeNumber(normalizedHit.score, 0) * weight,
          ),
        };
      });

    type PhaseTask = {
      promise: Promise<{ output: unknown[]; status: "ok" | "failed" | "timed_out"; note?: string }>;
      phaseId: string;
      source: CandidateSource;
      timedOutCode: string;
      failedCode: string;
    };
    const phaseTasks: PhaseTask[] = [];

    for (const phase of phases) {
      if (!phase?.enabled) continue;
      if (
        !isBaseVariant &&
        extraVariantStrategy !== "all" &&
        !(extraVariantStrategy === "semantic_and_lexical" &&
          (phase.type === "semantic" || phase.type === "lexical")) &&
        phase.type !== "semantic"
      ) {
        continue;
      }

      if (phase.type === "semantic") {
        const k = safeNumber(phase.k, 80);
        phaseTasks.push({
          promise: runWithTimeout<unknown[]>(
            opts.semanticIndex.search({
              query: variant.text,
              docIds: opts.scopeDocIds,
              k,
            }),
            [],
            "semantic_search",
          ),
          phaseId: `${phase.id ?? "phase_semantic"}::${variant.sourceRuleId}`,
          source: "semantic" as CandidateSource,
          timedOutCode: "semantic_search_timed_out",
          failedCode: "semantic_search_failed",
        });
      } else if (phase.type === "lexical") {
        const k = safeNumber(phase.k, 120);
        phaseTasks.push({
          promise: runWithTimeout<unknown[]>(
            opts.lexicalIndex.search({
              query: variant.text,
              docIds: opts.scopeDocIds,
              k,
            }),
            [],
            "lexical_search",
          ),
          phaseId: `${phase.id ?? "phase_lexical"}::${variant.sourceRuleId}`,
          source: "lexical" as CandidateSource,
          timedOutCode: "lexical_search_timed_out",
          failedCode: "lexical_search_failed",
        });
      } else if (phase.type === "structural") {
        const k = safeNumber(phase.k, 60);
        const phaseAnchors = Array.isArray(phase.anchors)
          ? phase.anchors
          : ["headings", "table_headers"];
        const anchors = Array.from(
          new Set([
            ...phaseAnchors,
            ...(Array.isArray(opts.additionalStructuralAnchors)
              ? opts.additionalStructuralAnchors
              : []),
          ]),
        ).slice(0, 24);
        phaseTasks.push({
          promise: runWithTimeout<unknown[]>(
            opts.structuralIndex.search({
              query: variant.text,
              docIds: opts.scopeDocIds,
              k,
              anchors,
            }),
            [],
            "structural_search",
          ),
          phaseId: `${phase.id ?? "phase_structural"}::${variant.sourceRuleId}`,
          source: "structural" as CandidateSource,
          timedOutCode: "structural_search_timed_out",
          failedCode: "structural_search_failed",
        });
      }
    }

    // Run all phases for this variant in parallel, recording timing.
    const phaseStartTimes = phaseTasks.map(() => performance.now());
    const settled = await Promise.all(
      phaseTasks.map((t, idx) => {
        phaseStartTimes[idx] = performance.now();
        return t.promise.then((result) => ({
          ...result,
          durationMs: performance.now() - phaseStartTimes[idx],
        }));
      }),
    );

    for (let pi = 0; pi < phaseTasks.length; pi++) {
      const task = phaseTasks[pi];
      const phaseResult = settled[pi];
      results.push({
        phaseId: task.phaseId,
        source: task.source,
        status: phaseResult.status,
        failureCode:
          phaseResult.status === "ok"
            ? undefined
            : phaseResult.status === "timed_out"
              ? task.timedOutCode
              : task.failedCode,
        note: phaseResult.note,
        hits: normalizeHits(phaseResult.output, variant.weight),
        durationMs: Math.round(phaseResult.durationMs * 100) / 100,
      });
    }
  }

  return results;
}
