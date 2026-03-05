import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@jest/globals";

const PLANNER_PATH = path.resolve(
  __dirname,
  "../../services/core/banks/bankSelectionPlanner.service.ts",
);

describe("intent marker coverage", () => {
  const src = fs.readFileSync(PLANNER_PATH, "utf-8");

  it("scoreDomainCandidates exists", () => {
    expect(src).toContain("function scoreDomainCandidates");
  });

  it("has marker arrays for all 15 domains", () => {
    const markerArrays = [
      "LEGAL_INTENT_MARKERS",
      "FINANCE_INTENT_MARKERS",
      "MEDICAL_INTENT_MARKERS",
      "ACCOUNTING_INTENT_MARKERS",
      "OPS_INTENT_MARKERS",
      "BANKING_INTENT_MARKERS",
      "BILLING_INTENT_MARKERS",
      "EDUCATION_INTENT_MARKERS",
      "EVERYDAY_INTENT_MARKERS",
      "HOUSING_INTENT_MARKERS",
      "HR_INTENT_MARKERS",
      "IDENTITY_INTENT_MARKERS",
      "INSURANCE_INTENT_MARKERS",
      "TAX_INTENT_MARKERS",
      "TRAVEL_INTENT_MARKERS",
    ];

    for (const markerName of markerArrays) {
      expect(src).toContain(markerName);
    }
  });
});


