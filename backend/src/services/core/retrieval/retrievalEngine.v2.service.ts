import { logger } from "../../../utils/logger";
import {
  RetrievalEngineService,
  type EvidencePack,
  type RetrievalRuntimeError,
  type RetrievalRequest,
} from "./retrievalEngine.service";

function dedupeReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(
    new Set(
      reasonCodes.map((code) => String(code || "").trim()).filter(Boolean),
    ),
  );
}

export class RetrievalEngineServiceV2 extends RetrievalEngineService {
  async retrieve(req: RetrievalRequest): Promise<EvidencePack> {
    try {
      const pack = await super.retrieve(req);
      const existingCodes = dedupeReasonCodes(pack.debug?.reasonCodes || []);
      const hasDegradedCode = existingCodes.some((code) =>
        /(timed_out|failed|degraded|budget)/i.test(code),
      );
      const phaseNotes = (pack.debug?.phases || [])
        .map((phase) => String(phase?.note || ""))
        .join(" ")
        .toLowerCase();

      const reasonCodes =
        hasDegradedCode || phaseNotes.includes("timeout")
          ? dedupeReasonCodes([...existingCodes, "retrieval_v2_degraded"])
          : existingCodes;
      const runtimeStatus =
        pack.runtimeStatus === "ok" &&
        (hasDegradedCode || phaseNotes.includes("timeout"))
          ? "degraded"
          : pack.runtimeStatus;
      const runtimeError: RetrievalRuntimeError | undefined =
        runtimeStatus !== "ok"
          ? pack.runtimeError || {
              code: "dependency_unavailable",
              message: "Retrieval completed in degraded mode.",
              retryable: true,
            }
          : undefined;

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
    } catch (error: any) {
      const message = String(error?.message || error || "unknown_error");
      logger.warn(
        "[retrieval-engine-v2] retrieve failed; returning failed pack",
        {
          error: message,
        },
      );

      return this.emptyPack(
        req,
        {
          reasonCodes: ["retrieval_v2_runtime_error"],
          note: "Runtime exception while executing retrieval engine v2.",
        },
        undefined,
        {
          runtimeStatus: "failed",
          runtimeError: {
            code: "runtime_invariant_breach",
            message,
            retryable: true,
          },
        },
      );
    }
  }
}
