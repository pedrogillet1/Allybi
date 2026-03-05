import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@jest/globals";

const EVAL_PATH = path.resolve(
  __dirname,
  "../../data_banks/document_intelligence/eval/doc_identity_golden.eval.jsonl",
);

interface GoldenCase {
  id: string;
  query: string;
  rubric: string;
  priority: string;
  expectedBehavior: string;
}

describe("doc identity golden eval cases", () => {
  it("eval file exists", () => {
    expect(fs.existsSync(EVAL_PATH)).toBe(true);
  });

  it("contains exactly 10 cases", () => {
    const lines = fs
      .readFileSync(EVAL_PATH, "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    expect(lines).toHaveLength(10);
  });

  it("each case is valid JSON with required fields", () => {
    const lines = fs
      .readFileSync(EVAL_PATH, "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    for (const line of lines) {
      const entry: GoldenCase = JSON.parse(line);
      expect(entry.id).toMatch(/^GOLD_DI_\d{3}$/);
      expect(entry.query).toBeTruthy();
      expect(entry.rubric).toBeTruthy();
      expect(entry.priority).toMatch(/^P[0-2]$/);
      expect(entry.expectedBehavior).toBeTruthy();
    }
  });

  it("covers all required rubric dimensions", () => {
    const lines = fs
      .readFileSync(EVAL_PATH, "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    const rubricTags = new Set<string>();
    for (const line of lines) {
      const entry: GoldenCase = JSON.parse(line);
      for (const tag of entry.rubric.split(/\s*\+\s*/)) {
        rubricTags.add(tag.trim());
      }
    }

    const required = [
      "section_targeting",
      "wrong_doc_prevention",
      "doc_type_detection",
      "tiebreak",
      "disambiguation_single_question",
      "multilingual_section_matching",
      "doc_alias_resolution",
      "table_header_ontology",
    ];

    for (const rubric of required) {
      expect(rubricTags.has(rubric)).toBe(true);
    }
  });
});
