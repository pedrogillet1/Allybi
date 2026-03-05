import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@jest/globals";

const DOMAINS_ROOT = path.resolve(
  __dirname,
  "../../data_banks/document_intelligence/domains",
);

describe("extraction_hints coverage", () => {
  const domains = fs
    .readdirSync(DOMAINS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const domain of domains) {
    it(`${domain}: each section file has a matching extraction_hints file`, () => {
      const sectionsDir = path.join(DOMAINS_ROOT, domain, "doc_types/sections");
      const extractionDir = path.join(
        DOMAINS_ROOT,
        domain,
        "doc_types/extraction",
      );

      if (!fs.existsSync(sectionsDir)) {
        return;
      }

      const sectionDocTypes = fs
        .readdirSync(sectionsDir)
        .filter((name) => name.endsWith(".sections.any.json"))
        .map((name) => name.replace(".sections.any.json", ""));

      const extractionDocTypes = new Set(
        fs.existsSync(extractionDir)
          ? fs
              .readdirSync(extractionDir)
              .filter((name) => name.endsWith(".extraction_hints.any.json"))
              .map((name) => name.replace(".extraction_hints.any.json", ""))
          : [],
      );

      const missing = sectionDocTypes.filter(
        (docType) => !extractionDocTypes.has(docType),
      );
      expect(missing).toHaveLength(0);
    });
  }
});
