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
    const executorPath = path.resolve(
      process.cwd(),
      "src/modules/chat/runtime/ChatTurnExecutor.ts",
    );
    const finalizationPath = path.resolve(
      process.cwd(),
      "src/modules/chat/runtime/TurnFinalizationService.ts",
    );

    const traceWriterSource = fs.readFileSync(traceWriterPath, "utf8");
    const executorSource = fs.readFileSync(executorPath, "utf8");
    const finalizationSource = fs.readFileSync(finalizationPath, "utf8");

    const missingInTraceType = REQUIRED_TRACE_STEPS.filter(
      (step) => !new RegExp(`\\|\\s*\"${step}\"`, "m").test(traceWriterSource),
    );
    const executorSteps = ["input_normalization", "retrieval", "evidence_gate", "compose"];
    const missingInRuntime = [
      ...executorSteps.filter(
        (step) => !new RegExp(`startSpan\\([^\\)]*\"${step}\"`, "m").test(executorSource),
      ),
      ...(!/runGates\(/.test(finalizationSource) ? ["quality_gates"] : []),
      ...(!/enforce\(/.test(finalizationSource) ? ["output_contract"] : []),
    ];

    const failures: string[] = [];
    if (missingInTraceType.length > 0) failures.push("TRACE_STEP_TYPE_MISSING");
    if (missingInRuntime.length > 0) failures.push("RUNTIME_TRACE_STEP_MISSING");
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
        runtimeStepMissingCount: missingInRuntime.length,
        strictModeWiringPresent,
      },
      thresholds: {
        traceTypeMissingCount: 0,
        runtimeStepMissingCount: 0,
        strictModeWiringPresent: true,
      },
      failures: [
        ...failures,
        ...missingInTraceType.map((step) => `TRACE_TYPE_MISSING:${step}`),
        ...missingInRuntime.map((step) => `RUNTIME_STEP_MISSING:${step}`),
      ],
    });

    expect(failures).toEqual([]);
  });
});
