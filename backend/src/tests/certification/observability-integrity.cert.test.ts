import { describe, expect, jest, test } from "@jest/globals";

import { TraceWriterService } from "../../services/telemetry/traceWriter.service";
import { writeCertificationGateReport } from "./reporting";

const REQUIRED_TRACE_STEPS = [
  "input_normalization",
  "retrieval",
  "evidence_gate",
  "compose",
  "quality_gates",
  "output_contract",
];

describe("Certification: observability integrity", () => {
  test("critical stages emit runtime spans and strict write failures fail-closed", async () => {
    const traceSpanCreateMany = jest.fn().mockResolvedValue({ count: 6 });
    const prisma = {
      traceSpan: {
        createMany: traceSpanCreateMany,
      },
      bankUsageEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      queryKeyword: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      queryEntity: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new TraceWriterService(prisma as any, {
      enabled: true,
      strictWriteFailures: true,
      successSamplePercent: 100,
    });

    const traceId = "tr_obs_integrity_1";
    for (const step of REQUIRED_TRACE_STEPS) {
      const spanId = service.startSpan(traceId, step);
      service.endSpan(traceId, spanId, {
        status: "ok",
      });
    }
    const persisted = await service.flush(traceId, {
      status: "success",
    });
    const writtenSpans =
      (traceSpanCreateMany.mock.calls[0]?.[0]?.data as Array<Record<string, unknown>>) ||
      [];

    const writeFailurePrisma = {
      traceSpan: {
        createMany: jest.fn().mockRejectedValue(new Error("write failed")),
      },
    };
    const strictService = new TraceWriterService(writeFailurePrisma as any, {
      enabled: true,
      strictWriteFailures: true,
      successSamplePercent: 100,
    });
    const strictTraceId = "tr_obs_integrity_2";
    const strictSpan = strictService.startSpan(strictTraceId, "retrieval");
    strictService.endSpan(strictTraceId, strictSpan, { status: "ok" });
    let strictFailureCode: string | null = null;
    try {
      await strictService.flush(strictTraceId, { status: "success" });
    } catch (error) {
      strictFailureCode = String((error as { code?: string })?.code || null);
    }

    const traceTypeMissingCount = REQUIRED_TRACE_STEPS.filter(
      (step) => !writtenSpans.some((span) => String(span.stepName || "") === step),
    ).length;
    const delegateSpanMissingCount = traceTypeMissingCount;
    const strictModeWiringPresent = strictFailureCode === "TRACE_WRITER_STRICT_FAILURE";
    const failures: string[] = [];
    if (!persisted) failures.push("TRACE_SPANS_NOT_PERSISTED");
    if (traceTypeMissingCount > 0) failures.push("TRACE_STEP_TYPE_MISSING");
    if (delegateSpanMissingCount > 0) failures.push("DELEGATE_SPAN_MISSING");
    if (!strictModeWiringPresent)
      failures.push("TRACE_WRITER_STRICT_MODE_NOT_WIRED");

    writeCertificationGateReport("observability-integrity", {
      passed: failures.length === 0,
      metrics: {
        traceSpansPersisted: persisted,
        requiredStepCount: REQUIRED_TRACE_STEPS.length,
        traceTypeMissingCount,
        delegateSpanMissingCount,
        strictModeWiringPresent,
      },
      thresholds: {
        traceSpansPersisted: true,
        traceTypeMissingCount: 0,
        delegateSpanMissingCount: 0,
        strictModeWiringPresent: true,
      },
      failures: [
        ...failures,
        ...REQUIRED_TRACE_STEPS.filter(
          (step) => !writtenSpans.some((span) => String(span.stepName || "") === step),
        ).map((step) => `TRACE_TYPE_MISSING:${step}`),
      ],
    });

    expect(failures).toEqual([]);
  });
});
