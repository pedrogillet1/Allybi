import type { TurnDebugPacket } from "../../../services/telemetry/traceWriter.service";
import { TracePersistenceWriter } from "./TracePersistenceWriter";
import { TraceSpanService } from "./TraceSpanService";
import { TraceTelemetryProjector } from "./TraceTelemetryProjector";
import { TurnDebugPacketBuilder } from "./TurnDebugPacketBuilder";
import type {
  PersistTraceArtifactsParams,
  TraceRuntimeConfig,
  TraceWriterPort,
} from "./chatTrace.types";

export class ChatTraceArtifactsService {
  private readonly spanService: TraceSpanService;
  private readonly persistenceWriter: TracePersistenceWriter;

  constructor(
    traceWriter: TraceWriterPort,
    runtimeConfig: TraceRuntimeConfig,
  ) {
    this.spanService = new TraceSpanService(traceWriter);
    this.persistenceWriter = new TracePersistenceWriter(
      traceWriter,
      new TraceTelemetryProjector(runtimeConfig),
      new TurnDebugPacketBuilder(),
    );
  }

  startSpan(
    traceId: string,
    stepName: string,
    metadata?: Record<string, unknown> | null,
  ): string {
    return this.spanService.startSpan(traceId, stepName, metadata);
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
    this.spanService.endSpan(traceId, spanId, params);
  }

  getLatestTurnDebugPacket(traceId: string): TurnDebugPacket | null {
    return this.spanService.getLatestTurnDebugPacket(traceId);
  }

  async flush(
    traceId: string,
    result: { status: "success" | "partial" | "clarification_required" | "blocked" | "failed" },
  ): Promise<boolean> {
    return this.spanService.flush(traceId, result);
  }

  async persistTraceArtifacts(params: PersistTraceArtifactsParams): Promise<void> {
    return this.persistenceWriter.persistTraceArtifacts(params);
  }
}
