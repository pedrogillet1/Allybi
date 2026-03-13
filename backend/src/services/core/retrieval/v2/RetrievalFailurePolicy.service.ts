import type {
  EvidencePack,
  RetrievalRequest,
  RetrievalRuntimeError,
  RetrievalRuntimeStatus,
  RetrievalScopeViolationError,
} from "../retrieval.types";
import { isProductionEnv } from "../retrievalEngine.utils";
import { emptyPack } from "./RetrievalTelemetry.service";

export function dedupeReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(
    new Set(
      reasonCodes.map((code) => String(code || "").trim()).filter(Boolean),
    ),
  );
}

export function resolveRuntimeError(
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

export function buildFailedPack(
  req: RetrievalRequest,
  params: {
    reasonCodes: string[];
    runtimeError: RetrievalRuntimeError;
    note?: string;
  },
): EvidencePack {
  const pack = emptyPack(req, {
    reasonCodes: params.reasonCodes,
    note: params.note,
  });
  return {
    ...pack,
    runtimeStatus: "failed",
    runtimeError: params.runtimeError,
    debug: isProductionEnv(req.env)
      ? undefined
      : {
          phases: params.note
            ? [{ phaseId: "retrieval_failed", candidates: 0, note: params.note }]
            : [],
          reasonCodes: params.reasonCodes,
        },
  };
}

export function buildRuntimeFailurePack(
  req: RetrievalRequest,
  error: unknown,
): EvidencePack {
  const message =
    error instanceof Error ? error.message : String(error || "unknown_error");
  return buildFailedPack(req, {
    reasonCodes: ["retrieval_runtime_error", "retrieval_failed"],
    runtimeError: {
      code: "runtime_invariant_breach",
      message,
      retryable: true,
    },
    note: `Runtime exception: ${message}`,
  });
}

export function buildScopeInvariantFailurePack(
  req: RetrievalRequest,
  error: RetrievalScopeViolationError,
): EvidencePack {
  return buildFailedPack(req, {
    reasonCodes: ["retrieval_scope_violation", "retrieval_failed"],
    runtimeError: {
      code: "scope_invariant_breach",
      message: error.message,
      retryable: false,
      details: error.details,
    },
    note: error.message,
  });
}
