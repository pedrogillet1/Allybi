import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DOMAINS_ROOT = path.resolve(
  __dirname,
  "../../data_banks/document_intelligence/domains",
);

describe("legacy naming guard — no unprefixed doc type files", () => {
  const KNOWN_PREFIXES: Record<string, string> = {
    legal: "legal_",
    medical: "med_",
    accounting: "acct_",
    finance: "fin_",
    banking: "banking_",
    billing: "billing_",
    education: "edu_",
    everyday: "every_",
    housing: "housing_",
    hr_payroll: "hr_",
    identity: "id_",
    insurance: "ins_",
    ops: "ops_",
    tax: "tax_",
    travel: "travel_",
  };

  for (const [domain, prefix] of Object.entries(KNOWN_PREFIXES)) {
    it(`${domain} domain: all doc type files use '${prefix}' prefix`, () => {
      const domainDir = path.join(DOMAINS_ROOT, domain, "doc_types");
      if (!fs.existsSync(domainDir)) return;

      const subdirs = ["sections", "tables", "extraction", "entities"];
      const unprefixed: string[] = [];

      for (const subdir of subdirs) {
        const dir = path.join(domainDir, subdir);
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir);
        for (const file of files) {
          const basename = file.split(".")[0];
          if (!basename.startsWith(prefix)) {
            unprefixed.push(`${subdir}/${file}`);
          }
        }
      }

      expect(
        unprefixed,
        `Found unprefixed legacy files in ${domain}: ${unprefixed.join(", ")}`,
      ).toHaveLength(0);
    });
  }
});
