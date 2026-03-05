import { describe, expect, test } from "@jest/globals";
import path from "node:path";

import { runRetrievalReplayEval } from "../../../scripts/eval/retrieval_eval_replay";
import { writeCertificationGateReport } from "./reporting";

describe("Certification: retrieval open-world replay eval", () => {
  test("retrieval replay corpus resists cross-doc contamination in open-world mode", async () => {
    const fixturePath = path.resolve(
      __dirname,
      "../retrieval/replay-fixtures/retrieval-replay.fixture.json",
    );
    const report = await runRetrievalReplayEval({
      fixturePath,
      mode: "open_world_strict",
      k: 5,
    });

    writeCertificationGateReport("retrieval-openworld-eval", {
      passed: report.passed,
      metrics: report.metrics,
      thresholds: report.thresholds,
      failures: report.failures,
    });

    expect(report.metrics.totalCases).toBeGreaterThanOrEqual(10);
    expect(report.passed).toBe(true);
    expect(report.metrics.compareContaminationRate).toBe(0);
    expect(report.metrics.nonCompareContaminationRate).toBe(0);
  });
});
