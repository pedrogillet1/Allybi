import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@jest/globals";

const BANK_PATH = path.resolve(
  __dirname,
  "../../data_banks/quality/document_intelligence/doc_type_confusion_matrix.any.json",
);

describe("doc_type_confusion_matrix", () => {
  it("bank file exists", () => {
    expect(fs.existsSync(BANK_PATH)).toBe(true);
  });

  it("has valid _meta", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    expect(raw?._meta?.id).toBe("doc_type_confusion_matrix");
  });

  it("covers high-risk confusion pairs across everyday and specialized domains", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    const rules = raw?.rules ?? [];

    const requiredPairs = [
      ["every_bank_statement", "banking_bank_statement"],
      ["every_bank_statement", "fin_bank_statement"],
      ["every_electricity_bill", "billing_electricity_bill"],
      ["every_internet_bill", "billing_internet_bill"],
      ["every_phone_bill", "billing_phone_bill_mobile"],
      ["every_retail_receipt", "billing_retail_receipt"],
      ["every_insurance_claim", "ins_claim_submission"],
      ["every_insurance_policy", "ins_policy_document"],
      ["banking_bank_statement", "fin_bank_statement"],
      ["housing_property_tax_bill", "tax_property_tax_bill"],
      ["every_insurance_claim", "legal_complaint"],
      ["acct_forecast_pack", "fin_forecast"],
      ["acct_variance_pack", "fin_variance"],
    ];

    for (const [typeA, typeB] of requiredPairs) {
      const match = rules.find(
        (rule: Record<string, unknown>) =>
          (rule.docTypeA === typeA && rule.docTypeB === typeB) ||
          (rule.docTypeA === typeB && rule.docTypeB === typeA),
      );
      expect(match).toBeTruthy();
    }
  });

  it("each rule includes winner, structureCue, and reason", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    for (const rule of raw?.rules ?? []) {
      expect(rule?.winner).toBeTruthy();
      expect(rule?.structureCue).toBeTruthy();
      expect(rule?.reason).toBeTruthy();
    }
  });

  it("planner runtime references doc_type_confusion_matrix", () => {
    const plannerPath = path.resolve(
      __dirname,
      "../../services/core/banks/bankSelectionPlanner.service.ts",
    );
    const plannerSrc = fs.readFileSync(plannerPath, "utf-8");
    expect(plannerSrc).toContain("doc_type_confusion_matrix");
    expect(plannerSrc).toContain("doc_type_confusion_matrix_applied");
  });
});
