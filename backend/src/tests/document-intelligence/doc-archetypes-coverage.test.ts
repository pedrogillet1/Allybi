import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@jest/globals";

const ARCHETYPES_DIR = path.resolve(
  __dirname,
  "../../data_banks/semantics/taxonomy/doc_archetypes",
);

const ALL_DOMAINS = [
  "accounting",
  "banking",
  "billing",
  "education",
  "everyday",
  "finance",
  "housing",
  "hr_payroll",
  "identity",
  "insurance",
  "legal",
  "medical",
  "ops",
  "tax",
  "travel",
];

describe("doc_archetypes coverage", () => {
  for (const domain of ALL_DOMAINS) {
    it(`${domain}.any.json exists with valid shape`, () => {
      const filePath = path.join(ARCHETYPES_DIR, `${domain}.any.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(raw?._meta?.id).toBe(`doc_archetypes_${domain}`);
      expect(raw?.domain).toBe(domain);
      expect(Array.isArray(raw?.archetypes)).toBe(true);
      expect(raw.archetypes.length).toBeGreaterThan(0);

      for (const archetype of raw.archetypes) {
        expect(archetype?.id).toBeTruthy();
        expect(archetype?.label).toBeTruthy();
        expect(Array.isArray(archetype?.expectedSections)).toBe(true);
        expect(Array.isArray(archetype?.headings)).toBe(true);
      }
    });
  }
});


