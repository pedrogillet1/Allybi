import { describe, expect, test } from "@jest/globals";
import path from "node:path";

import { runRetrievalReplayEval } from "../../../scripts/eval/retrieval_eval_replay";
import { writeCertificationGateReport } from "./reporting";

describe("Certification: retrieval realistic replay eval", () => {
  test("retrieval replay corpus meets minimum quality thresholds", async () => {
    const fixturePath = path.resolve(
      __dirname,
      "../retrieval/replay-fixtures/retrieval-replay.fixture.json",
    );
    const report = await runRetrievalReplayEval({ fixturePath });

    writeCertificationGateReport("retrieval-realistic-eval", {
      passed: report.passed,
      metrics: report.metrics,
      thresholds: report.thresholds,
      failures: report.failures,
    });

    expect(report.metrics.totalCases).toBeGreaterThanOrEqual(10);
    expect(report.passed).toBe(true);
  });
});
