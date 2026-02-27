import fs from "fs";
import path from "path";
import { describe, expect, test } from "@jest/globals";

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
  test("trace contracts and runtime spans are present for critical stages", () => {
    const traceWriterPath = path.resolve(
      process.cwd(),
      "src/services/telemetry/traceWriter.service.ts",
    );
    const delegatePath = path.resolve(
      process.cwd(),
      "src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
    );

    const traceWriterSource = fs.readFileSync(traceWriterPath, "utf8");
    const delegateSource = fs.readFileSync(delegatePath, "utf8");

    const missingInTraceType = REQUIRED_TRACE_STEPS.filter(
      (step) => !new RegExp(`\\|\\s*\"${step}\"`, "m").test(traceWriterSource),
    );
    const missingInDelegate = REQUIRED_TRACE_STEPS.filter(
      (step) =>
        !new RegExp(`startSpan\\([^\\)]*\"${step}\"`, "m").test(delegateSource),
    );

    const failures: string[] = [];
    if (missingInTraceType.length > 0) failures.push("TRACE_STEP_TYPE_MISSING");
    if (missingInDelegate.length > 0) failures.push("DELEGATE_SPAN_MISSING");
    const strictModeWiringPresent =
      traceWriterSource.includes("strictWriteFailures") &&
      traceWriterSource.includes("OBS_TRACE_STRICT_WRITE_FAILURES") &&
      traceWriterSource.includes("TRACE_WRITER_STRICT_FAILURE");
    if (!strictModeWiringPresent)
      failures.push("TRACE_WRITER_STRICT_MODE_NOT_WIRED");

    writeCertificationGateReport("observability-integrity", {
      passed: failures.length === 0,
      metrics: {
        requiredStepCount: REQUIRED_TRACE_STEPS.length,
        traceTypeMissingCount: missingInTraceType.length,
        delegateSpanMissingCount: missingInDelegate.length,
        strictModeWiringPresent,
      },
      thresholds: {
        traceTypeMissingCount: 0,
        delegateSpanMissingCount: 0,
        strictModeWiringPresent: true,
      },
      failures: [
        ...failures,
        ...missingInTraceType.map((step) => `TRACE_TYPE_MISSING:${step}`),
        ...missingInDelegate.map((step) => `DELEGATE_SPAN_MISSING:${step}`),
      ],
    });

    expect(failures).toEqual([]);
  });
});
