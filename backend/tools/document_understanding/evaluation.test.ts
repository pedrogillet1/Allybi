import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

import { evaluateDocumentUnderstanding } from "./evaluation";
import type {
  DocumentUnderstandingOutput,
  EvaluationCase,
  ThresholdProfile,
} from "./types";

function readJsonl(filePath: string): DocumentUnderstandingOutput[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as DocumentUnderstandingOutput);
}

function loadFixtureCases(): EvaluationCase[] {
  const fixtureDir = path.join(__dirname, "eval", "fixtures");
  const gold = readJsonl(path.join(fixtureDir, "gold.jsonl"));
  const predicted = readJsonl(path.join(fixtureDir, "predicted.jsonl"));

  const predictedById = new Map(predicted.map((entry) => [entry.document_id, entry]));
  return gold.map((entry) => ({
    gold: entry,
    predicted: predictedById.get(entry.document_id)!,
    track: entry.meta.eval_track,
  }));
}

describe("document_understanding evaluation", () => {
  test("fails default thresholds on imperfect predictions", () => {
    const report = evaluateDocumentUnderstanding(loadFixtureCases());

    expect(report.totalCases).toBe(4);
    expect(report.scoredCases).toBe(4);
    expect(report.passed).toBe(false);
    expect(report.failures.some((failure) => failure.code === "DOC_TYPE_MACRO_F1_BELOW_THRESHOLD")).toBe(true);
  });

  test("passes when supplied with permissive thresholds", () => {
    const permissive: ThresholdProfile = {
      docTypeMacroF1Min: 0.2,
      docTypePerMajorMin: 0,
      sectionSpanF1Min: 0.3,
      sectionIoUMin: 0.3,
      tableTypeAccuracyMin: 0,
      tableRecallMin: 0.3,
      abstentionPrecisionMin: 0,
      robustnessRatioMin: 0,
    };

    const report = evaluateDocumentUnderstanding(loadFixtureCases(), {
      thresholdProfile: permissive,
    });

    expect(report.passed).toBe(true);
    expect(report.byTrack.default).toBeDefined();
    expect(report.byTrack.native_pdf).toBeDefined();
    expect(report.byTrack.scanned).toBeDefined();
  });

  test("drops invalid payloads from scored set", () => {
    const cases = loadFixtureCases();
    cases[0].predicted.doc_type.evidence[0].span.end = -1;

    const report = evaluateDocumentUnderstanding(cases);

    expect(report.scoredCases).toBe(3);
    expect(report.droppedCases).toBe(1);
    expect(report.invalidCases).toHaveLength(1);
    expect(report.invalidCases[0].side).toBe("predicted");
  });
});
