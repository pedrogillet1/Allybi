export type EditingSloProfile = "aggressive" | "balanced" | "conservative";

export interface EditingSloInput {
  docxPassRate: number;
  xlsxPassRate: number;
  adversarialPassRate: number;
  docxP95Ms: number;
  xlsxP95Ms: number;
}

export interface EditingSloThresholds {
  docxPassRateMin: number;
  xlsxPassRateMin: number;
  adversarialPassRateMin: number;
  docxP95MsMax: number;
  xlsxP95MsMax: number;
}

export interface EditingSloResult {
  passed: boolean;
  failures: string[];
}

export class EditingSloEvaluatorService {
  evaluate(
    input: EditingSloInput,
    thresholds: EditingSloThresholds,
  ): EditingSloResult {
    const failures: string[] = [];
    if (input.docxPassRate < thresholds.docxPassRateMin) {
      failures.push(
        `DOCX_PASS_RATE_BELOW_SLO:${input.docxPassRate.toFixed(6)}`,
      );
    }
    if (input.xlsxPassRate < thresholds.xlsxPassRateMin) {
      failures.push(
        `XLSX_PASS_RATE_BELOW_SLO:${input.xlsxPassRate.toFixed(6)}`,
      );
    }
    if (input.adversarialPassRate < thresholds.adversarialPassRateMin) {
      failures.push(
        `ADVERSARIAL_PASS_RATE_BELOW_SLO:${input.adversarialPassRate.toFixed(6)}`,
      );
    }
    if (input.docxP95Ms > thresholds.docxP95MsMax) {
      failures.push(`DOCX_P95_OVER_SLO:${Math.round(input.docxP95Ms)}`);
    }
    if (input.xlsxP95Ms > thresholds.xlsxP95MsMax) {
      failures.push(`XLSX_P95_OVER_SLO:${Math.round(input.xlsxP95Ms)}`);
    }
    return {
      passed: failures.length === 0,
      failures,
    };
  }
}

export default EditingSloEvaluatorService;
