// backend/src/services/telemetry/telemetry.service.ts
//
// Clean TelemetryService for Koda (fail-open, deterministic).
// Responsibilities:
// - Persist telemetry events to Prisma
// - Never throw to caller (telemetry must not break product flow)
// - Small helpers for common event types
//
// Notes:
// - Assumes you have Prisma models: UsageEvent, ModelCall, RetrievalEvent, IngestionEvent
// - Adjust model names/fields if your schema differs

import type { PrismaClient } from "@prisma/client";

import type {
  UsageEventCreate,
  ModelCallCreate,
  RetrievalEventCreate,
  IngestionEventCreate,
  TelemetryWriteResult,
} from "./telemetry.types";

export interface TelemetryServiceConfig {
  enabled: boolean;

  /**
   * If true, writes are queued in-memory and flushed periodically (more resilient).
   * If false, writes happen immediately (still fail-open).
   */
  bufferWrites?: boolean;

  /**
   * Max buffer size before dropping oldest entries (fail-open).
   */
  maxBufferSize?: number;

  /**
   * Flush interval when bufferWrites is true.
   */
  flushIntervalMs?: number;
}

type BufferedItem =
  | { kind: "usage"; data: UsageEventCreate }
  | { kind: "model"; data: ModelCallCreate }
  | { kind: "retrieval"; data: RetrievalEventCreate }
  | { kind: "ingestion"; data: IngestionEventCreate };

export class TelemetryService {
  private readonly cfg: Required<TelemetryServiceConfig>;
  private buffer: BufferedItem[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaClient,
    cfg: TelemetryServiceConfig,
  ) {
    this.cfg = {
      enabled: cfg.enabled,
      bufferWrites: cfg.bufferWrites ?? true,
      maxBufferSize: cfg.maxBufferSize ?? 2000,
      flushIntervalMs: cfg.flushIntervalMs ?? 1500,
    };

    if (this.cfg.enabled && this.cfg.bufferWrites) {
      this.flushTimer = setInterval(() => {
        void this.flush().catch(() => undefined);
      }, this.cfg.flushIntervalMs);
      this.flushTimer.unref?.();
    }
  }

  shutdown(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  /* ----------------------------- Public API ----------------------------- */

  async logUsage(event: UsageEventCreate): Promise<TelemetryWriteResult> {
    return this.write({ kind: "usage", data: event });
  }

  async logModelCall(event: ModelCallCreate): Promise<TelemetryWriteResult> {
    return this.write({ kind: "model", data: event });
  }

  async logRetrieval(
    event: RetrievalEventCreate,
  ): Promise<TelemetryWriteResult> {
    return this.write({ kind: "retrieval", data: event });
  }

  async logIngestion(
    event: IngestionEventCreate,
  ): Promise<TelemetryWriteResult> {
    return this.write({ kind: "ingestion", data: event });
  }

  /**
   * Manual flush (useful in tests or graceful shutdown).
   */
  async flush(): Promise<void> {
    if (!this.cfg.enabled || !this.cfg.bufferWrites) return;
    const batch = this.drainBuffer(250); // small batch to keep latency low
    if (!batch.length) return;

    // Group by kind for efficient writes
    const usage: UsageEventCreate[] = [];
    const model: ModelCallCreate[] = [];
    const retrieval: RetrievalEventCreate[] = [];
    const ingestion: IngestionEventCreate[] = [];

    for (const item of batch) {
      if (item.kind === "usage") usage.push(item.data);
      else if (item.kind === "model") model.push(item.data);
      else if (item.kind === "retrieval") retrieval.push(item.data);
      else ingestion.push(item.data);
    }

    // Best-effort createMany; each is isolated
    await Promise.all([
      usage.length
        ? this.safeCreateMany("usageEvent", usage)
        : Promise.resolve(),
      model.length
        ? this.safeCreateMany("modelCall", model)
        : Promise.resolve(),
      retrieval.length
        ? this.safeCreateMany("retrievalEvent", retrieval)
        : Promise.resolve(),
      ingestion.length
        ? this.safeCreateMany("ingestionEvent", ingestion)
        : Promise.resolve(),
    ]);
  }

  /* ----------------------------- Internals ----------------------------- */

  private async write(item: BufferedItem): Promise<TelemetryWriteResult> {
    if (!this.cfg.enabled) return { ok: true, mode: "disabled" };

    // Buffer mode (recommended)
    if (this.cfg.bufferWrites) {
      this.pushBuffer(item);
      return { ok: true, mode: "buffered" };
    }

    // Immediate mode (still fail-open)
    try {
      await this.safeCreateOne(item);
      return { ok: true, mode: "immediate" };
    } catch {
      return { ok: false, mode: "immediate" };
    }
  }

  private pushBuffer(item: BufferedItem): void {
    this.buffer.push(item);

    // Drop oldest deterministically if buffer too large
    if (this.buffer.length > this.cfg.maxBufferSize) {
      const overflow = this.buffer.length - this.cfg.maxBufferSize;
      this.buffer.splice(0, overflow);
    }
  }

  private drainBuffer(max: number): BufferedItem[] {
    if (this.buffer.length === 0) return [];
    const take = Math.min(max, this.buffer.length);
    return this.buffer.splice(0, take);
  }

  /**
   * Safe createOne: no throws up.
   */
  private async safeCreateOne(item: BufferedItem): Promise<void> {
    // NOTE: Model names below assume Prisma models:
    // usageEvent, modelCall, retrievalEvent, ingestionEvent
    // If your Prisma uses different names, adjust here.
    try {
      if (item.kind === "usage") {
        await (this.prisma as any).usageEvent.create({ data: item.data });
      } else if (item.kind === "model") {
        await (this.prisma as any).modelCall.create({ data: item.data });
      } else if (item.kind === "retrieval") {
        await (this.prisma as any).retrievalEvent.create({ data: item.data });
      } else {
        await (this.prisma as any).ingestionEvent.create({ data: item.data });
      }
    } catch {
      // swallow
    }
  }

  /**
   * Safe createMany: ignoreDuplicates where possible.
   * Uses (prisma as any) to avoid coupling to exact generated types here.
   */
  private async safeCreateMany(modelName: string, rows: any[]): Promise<void> {
    try {
      const model = (this.prisma as any)[modelName];
      if (!model?.createMany) return;

      await model.createMany({
        data: rows,
        skipDuplicates: true,
      });
    } catch {
      // swallow
    }
  }
}
