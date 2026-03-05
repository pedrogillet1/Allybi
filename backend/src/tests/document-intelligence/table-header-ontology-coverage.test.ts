import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const STRUCTURE_DIR = path.resolve(
  __dirname,
  "../../data_banks/semantics/structure",
);

const ALL_TABLE_DOMAINS = [
  "accounting", "banking", "billing", "education", "everyday",
  "finance", "housing", "hr_payroll", "identity", "insurance",
  "legal", "medical", "ops", "tax", "travel",
];

describe("table_header_ontology coverage", () => {
  for (const domain of ALL_TABLE_DOMAINS) {
    it(`table_header_ontology.${domain}.any.json exists`, () => {
      const filePath = path.join(STRUCTURE_DIR, `table_header_ontology.${domain}.any.json`);
      expect(fs.existsSync(filePath), `missing: ${filePath}`).toBe(true);
    });

    it(`table_header_ontology.${domain} has valid structure`, () => {
      const filePath = path.join(STRUCTURE_DIR, `table_header_ontology.${domain}.any.json`);
      if (!fs.existsSync(filePath)) return;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(raw._meta.id).toBe(`table_header_ontology_${domain}`);
      expect(raw.config.domain).toBe(domain);
      expect(raw.config.tiebreakContract.version).toBe("2.0.0");
      expect(Array.isArray(raw.headers)).toBe(true);
      expect(raw.headers.length).toBeGreaterThanOrEqual(3);

      for (const h of raw.headers) {
        expect(h.canonical).toBeTruthy();
        expect(Array.isArray(h.synonyms)).toBe(true);
        expect(typeof h.priority).toBe("number");
        expect(h.scope).toContain(`table_header:${domain}`);
        expect(h.disambiguationRuleId).toBeTruthy();
        expect(h.curationReason).toBeTruthy();
      }
    });
  }
});
