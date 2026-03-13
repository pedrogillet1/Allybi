import type { TurnDebugPacket } from "../../../services/telemetry/traceWriter.service";
import type { TraceWriterPort } from "./chatTrace.types";

export class TraceSpanService {
  constructor(private readonly writer: TraceWriterPort) {}

  startSpan(
    traceId: string,
    stepName: string,
    metadata?: Record<string, unknown> | null,
  ): string {
    return this.writer.startSpan(traceId, stepName, metadata);
  }

  endSpan(
    traceId: string,
    spanId: string,
    params?: {
      status?: "ok" | "error" | "skipped";
      errorCode?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): void {
    this.writer.endSpan(traceId, spanId, params);
  }

  getLatestTurnDebugPacket(traceId: string): TurnDebugPacket | null {
    return this.writer.getLatestTurnDebugPacket(traceId);
  }

  async flush(
    traceId: string,
    result: { status: "success" | "partial" | "clarification_required" | "blocked" | "failed" },
  ): Promise<boolean> {
    return this.writer.flush(traceId, result);
  }
}
