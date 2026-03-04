/* eslint-disable no-console */

import fs from "fs";
import path from "path";

import {
  DOCUMENT_UNDERSTANDING_THRESHOLD_PROFILES,
  evaluateDocumentUnderstanding,
} from "../../src/document_understanding/evaluation";
import type {
  DocumentUnderstandingOutput,
  EvaluationCase,
  ThresholdProfile,
} from "../../src/document_understanding/types";

function parseFlag(argv: string[], key: string): string | null {
  const inlinePrefix = `--${key}=`;
  const inline = argv.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);

  const index = argv.indexOf(`--${key}`);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];

  return null;
}

function hasFlag(argv: string[], key: string): boolean {
  return argv.includes(`--${key}`);
}

function readRecords(filePath: string): unknown[] {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Input file not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  if (absolutePath.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid JSONL at ${absolutePath}:${index + 1} (${String(error)})`);
        }
      });
  }

  if (absolutePath.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { records?: unknown[] }).records)) {
      return (parsed as { records: unknown[] }).records;
    }
    throw new Error(`JSON file must contain an array or { records: [] }: ${absolutePath}`);
  }

  throw new Error(`Unsupported file extension for ${absolutePath}. Use .jsonl or .json.`);
}

function unwrapOutput(record: unknown): DocumentUnderstandingOutput {
  if (!record || typeof record !== "object") {
    throw new Error("Record is not an object");
  }

  const data = record as Record<string, unknown>;

  if (
    typeof data.schema_version === "string" &&
    typeof data.document_id === "string" &&
    data.doc_type &&
    data.sections &&
    data.tables
  ) {
    return data as unknown as DocumentUnderstandingOutput;
  }

  if (data.output && typeof data.output === "object") {
    return unwrapOutput(data.output);
  }

  throw new Error("Record does not contain a document-understanding output payload");
}

function buildCasePairs(
  goldRecords: unknown[],
  predictedRecords: unknown[],
): { cases: EvaluationCase[]; missingPredictions: string[]; unexpectedPredictions: string[] } {
  const goldById = new Map<string, DocumentUnderstandingOutput>();
  const predictedById = new Map<string, DocumentUnderstandingOutput>();

  for (const record of goldRecords) {
    const output = unwrapOutput(record);
    goldById.set(output.document_id, output);
  }

  for (const record of predictedRecords) {
    const output = unwrapOutput(record);
    predictedById.set(output.document_id, output);
  }

  const cases: EvaluationCase[] = [];
  const missingPredictions: string[] = [];

  for (const [documentId, gold] of goldById.entries()) {
    const predicted = predictedById.get(documentId);
    if (!predicted) {
      missingPredictions.push(documentId);
      continue;
    }
    cases.push({
      gold,
      predicted,
      track: gold.meta?.eval_track || predicted.meta?.eval_track,
    });
  }

  const unexpectedPredictions = Array.from(predictedById.keys()).filter(
    (documentId) => !goldById.has(documentId),
  );

  return {
    cases,
    missingPredictions,
    unexpectedPredictions,
  };
}

function resolveThresholdProfile(name: string | null): ThresholdProfile {
  const normalized = String(name || "default").trim().toLowerCase();
  const profile = DOCUMENT_UNDERSTANDING_THRESHOLD_PROFILES[normalized];
  if (!profile) {
    throw new Error(
      `Unknown threshold profile: ${normalized}. Valid profiles: ${Object.keys(DOCUMENT_UNDERSTANDING_THRESHOLD_PROFILES).join(", ")}`,
    );
  }
  return profile;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const goldPath = parseFlag(argv, "gold");
  const predictedPath = parseFlag(argv, "pred");
  const outputPath = parseFlag(argv, "output");
  const strict = hasFlag(argv, "strict");

  if (!goldPath || !predictedPath) {
    throw new Error("Usage: ts-node scripts/eval/document_understanding_eval.ts --gold <gold.jsonl> --pred <pred.jsonl> [--threshold-profile default|strict|relaxed] [--output report.json] [--strict]");
  }

  const thresholdProfile = resolveThresholdProfile(parseFlag(argv, "threshold-profile"));
  const tableIoUThresholdRaw = parseFlag(argv, "table-iou");
  const calibrationBinsRaw = parseFlag(argv, "calibration-bins");

  const tableIoUThreshold = tableIoUThresholdRaw !== null &&
    Number.isFinite(Number(tableIoUThresholdRaw))
    ? Number(tableIoUThresholdRaw)
    : 0.5;
  const calibrationBins = calibrationBinsRaw !== null &&
    Number.isFinite(Number(calibrationBinsRaw))
    ? Number(calibrationBinsRaw)
    : 10;

  const goldRecords = readRecords(goldPath);
  const predictedRecords = readRecords(predictedPath);

  const { cases, missingPredictions, unexpectedPredictions } = buildCasePairs(
    goldRecords,
    predictedRecords,
  );

  const report = evaluateDocumentUnderstanding(cases, {
    thresholdProfile,
    tableIoUThreshold,
    calibrationBins,
    strict,
  });

  const result = {
    generatedAt: new Date().toISOString(),
    input: {
      goldPath: path.resolve(goldPath),
      predictedPath: path.resolve(predictedPath),
      thresholdProfile,
      strict,
      tableIoUThreshold,
      calibrationBins,
      missingPredictions,
      unexpectedPredictions,
    },
    report,
  };

  if (outputPath) {
    const absoluteOutput = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
    fs.writeFileSync(absoluteOutput, JSON.stringify(result, null, 2));
  }

  console.log(JSON.stringify(result, null, 2));

  if (strict && (!report.passed || missingPredictions.length > 0 || unexpectedPredictions.length > 0)) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error("[document_understanding_eval] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
