import fs from "fs";
import path from "path";
import { describe, expect, test } from "@jest/globals";

import { writeCertificationGateReport } from "./reporting";
import EditingSloEvaluatorService from "../../services/editing/slo/editingSloEvaluator.service";
import {
  resolveEditingSloProfile,
  resolveEditingSloThresholds,
} from "./editingSloProfile";

function readGate(gateId: string): any | null {
  const p = path.resolve(process.cwd(), "reports/cert/gates", `${gateId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

describe("Certification: editing SLO gate", () => {
  test("enforces latency/quality pass-fail thresholds", () => {
    const thresholds = resolveEditingSloThresholds();
    const profile = resolveEditingSloProfile();
    const failures: string[] = [];
    const evalGate = readGate("editing-eval-suite");
    if (!evalGate) {
      failures.push("MISSING_GATE_REPORT:editing-eval-suite");
      writeCertificationGateReport("editing-slo", {
        passed: false,
        metrics: {},
        thresholds: {
          profile,
        },
        failures,
      });
      expect(failures).toEqual([]);
      return;
    }

    const metrics = evalGate.metrics || {};
    const docxPassRate = Number(metrics.docxPassRate || 0);
    const xlsxPassRate = Number(metrics.xlsxPassRate || 0);
    const adversarialPassRate = Number(metrics.adversarialPassRate || 0);
    const docxPlanP95Ms = Number(metrics.docxPlanP95Ms || 0);
    const xlsxPlanP95Ms = Number(metrics.xlsxPlanP95Ms || 0);
    const evaluated = new EditingSloEvaluatorService().evaluate(
      {
        docxPassRate,
        xlsxPassRate,
        adversarialPassRate,
        docxP95Ms: docxPlanP95Ms,
        xlsxP95Ms: xlsxPlanP95Ms,
      },
      thresholds,
    );
    failures.push(...evaluated.failures);

    writeCertificationGateReport("editing-slo", {
      passed: failures.length === 0,
      metrics: {
        profile,
        docxPassRate,
        xlsxPassRate,
        adversarialPassRate,
        docxPlanP95Ms,
        xlsxPlanP95Ms,
      },
      thresholds: {
        docxPassRateMin: thresholds.docxPassRateMin,
        xlsxPassRateMin: thresholds.xlsxPassRateMin,
        adversarialPassRateMin: thresholds.adversarialPassRateMin,
        docxP95MsMax: thresholds.docxP95MsMax,
        xlsxP95MsMax: thresholds.xlsxP95MsMax,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
