import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "@jest/globals";

const DATA_BANKS_ROOT = path.resolve(__dirname, "../../data_banks");
const TAXONOMY_PATH = path.join(
  DATA_BANKS_ROOT,
  "semantics/taxonomy/doc_taxonomy.any.json",
);
const DI_DOC_TYPES_PATH = path.join(
  DATA_BANKS_ROOT,
  "document_intelligence/semantics/doc_type_ontology.any.json",
);

function loadJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("doc type ownership contract", () => {
  test("both banks declare explicit ssotRole metadata", () => {
    const taxonomy = loadJson(TAXONOMY_PATH);
    const di = loadJson(DI_DOC_TYPES_PATH);

    expect(String(taxonomy?._meta?.ssotRole || "").trim()).toBe(
      "doc_type_semantic_contract",
    );
    expect(String(di?._meta?.ssotRole || "").trim()).toBe(
      "doc_type_enumeration",
    );
  });

  test("taxonomy and di doc type IDs must be disjoint to avoid duplicate truth", () => {
    const taxonomy = loadJson(TAXONOMY_PATH);
    const di = loadJson(DI_DOC_TYPES_PATH);

    const taxonomyIds = new Set<string>(
      (Array.isArray(taxonomy?.typeDefinitions) ? taxonomy.typeDefinitions : [])
        .map((row: any) => String(row?.id || "").trim())
        .filter(Boolean),
    );
    const diIds = new Set<string>(
      (Array.isArray(di?.docTypes) ? di.docTypes : [])
        .map((row: any) => String(row?.id || "").trim())
        .filter(Boolean),
    );

    const overlap: string[] = [];
    for (const id of diIds) {
      if (taxonomyIds.has(id)) overlap.push(id);
    }
    expect(overlap).toEqual([]);
  });

  test("DI doc types own normalized machine IDs (dt_*), taxonomy owns semantic IDs", () => {
    const taxonomy = loadJson(TAXONOMY_PATH);
    const di = loadJson(DI_DOC_TYPES_PATH);

    const taxonomyInvalid = (Array.isArray(taxonomy?.typeDefinitions)
      ? taxonomy.typeDefinitions
      : []
    )
      .map((row: any) => String(row?.id || "").trim())
      .filter((id: string) => id.startsWith("dt_"));

    const diInvalid = (Array.isArray(di?.docTypes) ? di.docTypes : [])
      .map((row: any) => String(row?.id || "").trim())
      .filter((id: string) => !id.startsWith("dt_"));

    expect(taxonomyInvalid).toEqual([]);
    expect(diInvalid).toEqual([]);
  });

  test("taxonomy definitions require retrieval-facing fields", () => {
    const taxonomy = loadJson(TAXONOMY_PATH);
    const failures: string[] = [];
    const rows = Array.isArray(taxonomy?.typeDefinitions)
      ? taxonomy.typeDefinitions
      : [];

    for (const row of rows) {
      const id = String(row?.id || "<missing>").trim();
      if (!Array.isArray(row?.aliases) || row.aliases.length === 0) {
        failures.push(`aliases_missing:${id}`);
      }
      if (!Array.isArray(row?.requiredSections) || row.requiredSections.length < 2) {
        failures.push(`required_sections_thin:${id}`);
      }
      if (!Array.isArray(row?.keyFields) || row.keyFields.length < 2) {
        failures.push(`key_fields_thin:${id}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
