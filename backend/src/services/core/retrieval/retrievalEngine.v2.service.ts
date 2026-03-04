import { logger } from "../../../utils/logger";
import {
  RetrievalEngineService,
  type EvidencePack,
  type RetrievalRequest,
  type RetrievalRuntimeError,
  type RetrievalRuntimeStatus,
} from "./retrievalEngine.service";
import { isProductionEnv } from "./retrievalEngine.utils";

function dedupeReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(
    new Set(
      reasonCodes.map((code) => String(code || "").trim()).filter(Boolean),
    ),
  );
}

function isFailClosedMode(): boolean {
  const mode = String(process.env.RETRIEVAL_FAIL_MODE || "open")
    .trim()
    .toLowerCase();
  return mode === "closed" || mode === "fail_closed" || mode === "fail-closed";
}

function resolveRuntimeError(
  runtimeStatus: RetrievalRuntimeStatus,
  runtimeError: RetrievalRuntimeError | undefined,
  reasonCodes: string[],
): RetrievalRuntimeError | undefined {
  if (runtimeStatus === "ok") return undefined;
  if (runtimeError) return runtimeError;

  const hasTimeoutSignal = reasonCodes.some((code) =>
    /(timed_out|timeout)/i.test(code),
  );
  if (runtimeStatus === "failed") {
    return hasTimeoutSignal
      ? {
          code: "timeout",
          message: "Retrieval failed due to upstream timeout.",
          retryable: true,
        }
      : {
          code: "dependency_unavailable",
          message: "Retrieval failed due to upstream dependency failure.",
          retryable: true,
        };
  }

  return hasTimeoutSignal
    ? {
        code: "timeout",
        message: "Retrieval completed with timeout degradation.",
        retryable: true,
      }
    : {
        code: "dependency_unavailable",
        message: "Retrieval completed in degraded mode.",
        retryable: true,
      };
}

export class RetrievalEngineServiceV2 extends RetrievalEngineService {
  async retrieve(req: RetrievalRequest): Promise<EvidencePack> {
    try {
      const pack = await super.retrieve(req);
      const existingCodes = dedupeReasonCodes(pack.debug?.reasonCodes || []);
      const hasPhaseFailureCode = existingCodes.some((code) =>
        /(semantic|lexical|structural)_search_(failed|timed_out)/i.test(code),
      );
      const hasDegradedCode = existingCodes.some((code) =>
        /(timed_out|failed|degraded|budget)/i.test(code),
      );
      const phaseNotes = (pack.debug?.phases || [])
        .map((phase) => String(phase?.note || ""))
        .join(" ")
        .toLowerCase();
      const failClosed = isFailClosedMode();
      const shouldFailClosed =
        failClosed && pack.evidence.length === 0 && hasPhaseFailureCode;

      let runtimeStatus: RetrievalRuntimeStatus = pack.runtimeStatus || "ok";
      if (shouldFailClosed) {
        runtimeStatus = "failed";
      } else if (
        runtimeStatus === "ok" &&
        (hasDegradedCode || phaseNotes.includes("timeout"))
      ) {
        runtimeStatus = "degraded";
      }

      let reasonCodes = existingCodes;
      if (runtimeStatus === "failed") {
        reasonCodes = dedupeReasonCodes([...reasonCodes, "retrieval_v2_failed"]);
      } else if (runtimeStatus === "degraded") {
        reasonCodes = dedupeReasonCodes([
          ...reasonCodes,
          "retrieval_v2_degraded",
        ]);
      }
      const runtimeError = resolveRuntimeError(
        runtimeStatus,
        pack.runtimeError,
        reasonCodes,
      );
      if (!pack.debug) {
        return {
          ...pack,
          runtimeStatus,
          runtimeError,
        };
      }
      return {
        ...pack,
        runtimeStatus,
        runtimeError,
        debug: {
          ...pack.debug,
          reasonCodes,
        },
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error || "unknown_error");
      logger.warn(
        "[retrieval-engine-v2] retrieve failed; returning failed pack",
        {
          error: message,
        },
      );

      const debug = isProductionEnv(req.env)
        ? undefined
        : {
            phases: [
              {
                phaseId: "retrieval_v2_runtime_error",
                candidates: 0,
                note:
                  "Runtime exception while executing retrieval engine v2. " +
                  message,
              },
            ],
            reasonCodes: ["retrieval_v2_runtime_error", "retrieval_v2_failed"],
          };
      return {
        runtimeStatus: "failed",
        runtimeError: {
          code: "runtime_invariant_breach",
          message,
          retryable: true,
        },
        query: { original: req.query, normalized: (req.query ?? "").trim() },
        scope: {
          activeDocId: req.signals.activeDocId ?? null,
          explicitDocLock: Boolean(req.signals.explicitDocLock),
          candidateDocIds: [],
          hardScopeActive: Boolean(req.signals.hardScopeActive),
          sheetName: req.signals.resolvedSheetName ?? null,
          rangeA1: req.signals.resolvedRangeA1 ?? null,
        },
        stats: {
          candidatesConsidered: 0,
          candidatesAfterNegatives: 0,
          candidatesAfterBoosts: 0,
          candidatesAfterDiversification: 0,
          scopeCandidatesDropped: 0,
          scopeViolationsDetected: 0,
          scopeViolationsThrown: 0,
          evidenceItems: 0,
          uniqueDocsInEvidence: 0,
          topScore: null,
          scoreGap: null,
        },
        evidence: [],
        debug,
      };
    }
  }
}
