import { describe, expect, it } from "@jest/globals";

import { OrchestratorCertificationService } from "./orchestratorCertification.service";

describe("OrchestratorCertificationService", () => {
  it("produces a structured report with all certification gates", () => {
    const report = new OrchestratorCertificationService().run({
      coverageSummary: {},
      regressionPassed: true,
    });
    expect(report.maxScore).toBe(100);
    expect(Array.isArray(report.gates)).toBe(true);
    expect(report.gates.length).toBe(6);
  });

  it("fails regression gate when regression suite is not green", () => {
    const report = new OrchestratorCertificationService().run({
      coverageSummary: {},
      regressionPassed: false,
    });
    const regressionGate = report.gates.find((gate) => gate.id === "regression");
    expect(regressionGate?.status).toBe("fail");
    expect((regressionGate?.findings || []).length).toBeGreaterThan(0);
  });
});
