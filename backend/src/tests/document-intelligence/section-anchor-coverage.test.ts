import fs from "node:fs";
import path from "node:path";

const BANKS_ROOT = path.resolve(
  __dirname,
  "../../data_banks/document_intelligence/domains",
);

const REQUIRED_FILES = [
  "insurance/doc_types/sections/ins_claim_submission.sections.any.json",
  "insurance/doc_types/sections/ins_explanation_of_benefits.sections.any.json",
  "insurance/doc_types/sections/ins_policy_document.sections.any.json",
  "insurance/doc_types/sections/ins_premium_invoice.sections.any.json",
  "tax/doc_types/sections/tax_assessment_notice.sections.any.json",
  "tax/doc_types/sections/tax_individual_income_return.sections.any.json",
  "tax/doc_types/sections/tax_payment_slip.sections.any.json",
  "tax/doc_types/sections/tax_property_tax_bill.sections.any.json",
];

describe("section heading anchor coverage", () => {
  test("tax and insurance section packs include headingAnchors for every section", () => {
    const violations: string[] = [];

    for (const relativePath of REQUIRED_FILES) {
      const filePath = path.join(BANKS_ROOT, relativePath);
      expect(fs.existsSync(filePath)).toBe(true);
      if (!fs.existsSync(filePath)) continue;

      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        sections?: Array<{ id?: string; headingAnchors?: string[] }>;
      };
      const sections = Array.isArray(raw.sections) ? raw.sections : [];
      for (const section of sections) {
        const anchors = Array.isArray(section.headingAnchors)
          ? section.headingAnchors.filter((value) => String(value || "").trim().length > 0)
          : [];
        if (anchors.length === 0) {
          violations.push(`${relativePath}#${String(section.id || "unknown")}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

