import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

import { writeCertificationGateReport } from "./reporting";

function resolveRepoRoot(): string {
  return path.resolve(__dirname, "../../..");
}

function readEvidenceContract(repoRoot: string): {
  requiredLatestFiles: string[];
  forbiddenFallbackDatasetMarkers: string[];
} {
  const contractPath = path.resolve(
    repoRoot,
    "scripts/certification/retrieval-evidence-contract.json",
  );
  const parsed = JSON.parse(fs.readFileSync(contractPath, "utf8")) as Record<
    string,
    unknown
  >;
  const requiredLatestFiles = Array.isArray(parsed?.requiredLatestFiles)
    ? parsed.requiredLatestFiles
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0)
    : [];
  if (requiredLatestFiles.length === 0) {
    throw new Error(
      "retrieval evidence contract missing requiredLatestFiles entries",
    );
  }
  const forbiddenFallbackDatasetMarkers = Array.isArray(
    parsed?.forbiddenFallbackDatasetMarkers,
  )
    ? parsed.forbiddenFallbackDatasetMarkers
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value.length > 0)
    : [];
  return { requiredLatestFiles, forbiddenFallbackDatasetMarkers };
}

function resolveCertProfile(): string {
  return String(process.env.CERT_PROFILE || "")
    .trim()
    .toLowerCase();
}

function resolveStrictFlag(): boolean {
  const raw = String(process.env.CERT_STRICT || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true";
}

function isStrictRetrievalProfile(profile: string): boolean {
  return profile === "ci" || profile === "release" ||
    profile === "retrieval_signoff" || profile === "local_hard";
}

function normalizeLineageFields(input: unknown): string[] {
  const record = input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
  return [
    String(record.datasetId || "").trim().toLowerCase(),
    String(record.inputFile || "").trim().toLowerCase(),
    String(record.source || "").trim().toLowerCase(),
    String(record.runId || "").trim().toLowerCase(),
  ];
}

function resolveLineageMarkerViolation(
  lineage: unknown,
  markers: string[],
): string | null {
  if (!Array.isArray(markers) || markers.length === 0) return null;
  const fields = normalizeLineageFields(lineage);
  for (const marker of markers) {
    const normalizedMarker = String(marker || "").trim().toLowerCase();
    if (!normalizedMarker) continue;
    if (fields.some((field) => field.includes(normalizedMarker))) {
      return normalizedMarker;
    }
  }
  return null;
}

function isRecursivePerQueryInput(value: unknown): boolean {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .toLowerCase();
  return normalized.endsWith("/latest/per_query.json");
}

describe("Certification: frontend retrieval evidence completeness", () => {
  test("latest grading artifacts and playwright results are complete and non-skipped", () => {
    const repoRoot = resolveRepoRoot();
    const contract = readEvidenceContract(repoRoot);
    const frontendReportsRoot = path.resolve(repoRoot, "../frontend/e2e/reports");
    const latestDir = path.join(frontendReportsRoot, "latest");
    const resultsPath = path.join(frontendReportsRoot, "results.json");
    const scorecardPath = path.join(latestDir, "scorecard.json");
    const lineagePath = path.join(latestDir, "lineage.json");
    const failures: string[] = [];
    const certProfile = resolveCertProfile();
    const strictRetrievalProfile =
      isStrictRetrievalProfile(certProfile) || resolveStrictFlag();

    if (!fs.existsSync(latestDir)) {
      failures.push("LATEST_REPORT_DIR_MISSING");
    }

    const missingLatestFiles = contract.requiredLatestFiles.filter(
      (fileName) => !fs.existsSync(path.join(latestDir, fileName)),
    );
    if (missingLatestFiles.length > 0) {
      failures.push(`LATEST_FILES_MISSING:${missingLatestFiles.join(",")}`);
    }

    const perQueryPath = path.join(latestDir, "per_query.json");
    let perQueryRows = 0;
    let rowsWithNonEmptyQuery = 0;
    let rowsWithResponseField = 0;
    if (fs.existsSync(perQueryPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(perQueryPath, "utf8"));
        const rows = Array.isArray(parsed) ? parsed : [];
        perQueryRows = rows.length;
        for (const row of rows) {
          const record = row && typeof row === "object"
            ? (row as Record<string, unknown>)
            : {};
          const query = String(record.query || "").trim();
          if (query.length > 0) rowsWithNonEmptyQuery += 1;
          if (
            typeof record.responseText === "string" ||
            typeof record.assistantText === "string" ||
            typeof record.response === "string"
          ) {
            rowsWithResponseField += 1;
          }
        }
        if (perQueryRows <= 0) failures.push("PER_QUERY_EMPTY");
      } catch {
        failures.push("PER_QUERY_INVALID_JSON");
      }
    }

    let scorecardPack: string | null = null;
    let scorecardTotalQueries = 0;
    let scorecardAllowedDocs = 0;
    let scorecardInputFile: string | null = null;
    if (!fs.existsSync(scorecardPath)) {
      failures.push("SCORECARD_MISSING");
    } else {
      try {
        const scorecard = JSON.parse(
          fs.readFileSync(scorecardPath, "utf8"),
        ) as Record<string, unknown>;
        scorecardPack = String(scorecard.pack || "").trim() || null;
        scorecardInputFile = String(scorecard.inputFile || "").trim() || null;
        const meta = scorecard.meta &&
            typeof scorecard.meta === "object"
          ? (scorecard.meta as Record<string, unknown>)
          : {};
        scorecardTotalQueries = Number(meta.totalQueries || 0);
        scorecardAllowedDocs =
          Number(meta.allowedDocIdsCount || 0) +
          Number(meta.allowedDocNamesCount || 0);
      } catch {
        failures.push("SCORECARD_INVALID_JSON");
      }
    }

    let lineageViolation: string | null = null;
    let lineageInputFile: string | null = null;
    let lineageSourceArtifactPath: string | null = null;
    let lineageSourceArtifactSha256: string | null = null;
    let lineageInputArtifactType: string | null = null;
    if (!fs.existsSync(lineagePath)) {
      failures.push("LINEAGE_MISSING");
    } else {
      try {
        const lineage = JSON.parse(
          fs.readFileSync(lineagePath, "utf8"),
        ) as Record<string, unknown>;
        lineageInputFile = String(lineage.inputFile || "").trim() || null;
        lineageSourceArtifactPath =
          String(lineage.sourceArtifactPath || "").trim() || null;
        lineageSourceArtifactSha256 =
          String(lineage.sourceArtifactSha256 || "").trim().toLowerCase() || null;
        lineageInputArtifactType =
          String(lineage.inputArtifactType || "").trim().toLowerCase() || null;
        lineageViolation = resolveLineageMarkerViolation(
          lineage,
          contract.forbiddenFallbackDatasetMarkers,
        );
        if (lineageViolation) {
          failures.push(`LINEAGE_FORBIDDEN_MARKER:${lineageViolation}`);
        }
        if (isRecursivePerQueryInput(lineageInputFile)) {
          failures.push("LINEAGE_INPUTFILE_RECURSIVE_PER_QUERY");
        }
        if (isRecursivePerQueryInput(lineageSourceArtifactPath)) {
          failures.push("LINEAGE_SOURCE_ARTIFACT_RECURSIVE_PER_QUERY");
        }
      } catch {
        failures.push("LINEAGE_INVALID_JSON");
      }
    }

    let playwrightExpected = 0;
    let playwrightSkipped = 0;
    if (!fs.existsSync(resultsPath)) {
      failures.push("PLAYWRIGHT_RESULTS_MISSING");
    } else {
      try {
        const parsed = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
        playwrightExpected = Number(parsed?.stats?.expected || 0);
        playwrightSkipped = Number(parsed?.stats?.skipped || 0);
        if (playwrightExpected <= 0) failures.push("PLAYWRIGHT_EXPECTED_ZERO");
        if (playwrightSkipped > 0) failures.push("PLAYWRIGHT_SKIPPED_TESTS_PRESENT");
      } catch {
        failures.push("PLAYWRIGHT_RESULTS_INVALID_JSON");
      }
    }

    const queryCoverage =
      perQueryRows > 0 ? rowsWithNonEmptyQuery / perQueryRows : 0;
    const responseFieldCoverage =
      perQueryRows > 0 ? rowsWithResponseField / perQueryRows : 0;
    if (strictRetrievalProfile) {
      if (scorecardPack !== "100") failures.push("STRICT_SCORECARD_PACK_NOT_100");
      if (scorecardAllowedDocs <= 0) failures.push("STRICT_SCORECARD_DOC_SCOPE_MISSING");
      if (scorecardTotalQueries < 100) failures.push("STRICT_SCORECARD_TOTAL_QUERIES_TOO_LOW");
      if (isRecursivePerQueryInput(scorecardInputFile)) {
        failures.push("STRICT_SCORECARD_INPUT_RECURSIVE_PER_QUERY");
      }
      if (queryCoverage < 0.98) failures.push("STRICT_PER_QUERY_QUERY_COVERAGE_TOO_LOW");
      if (responseFieldCoverage < 0.98) {
        failures.push("STRICT_PER_QUERY_RESPONSE_FIELD_COVERAGE_TOO_LOW");
      }
      if (!lineageInputArtifactType || lineageInputArtifactType !== "raw_query_run") {
        failures.push("STRICT_LINEAGE_INPUT_ARTIFACT_TYPE_INVALID");
      }
      if (!lineageSourceArtifactPath) {
        failures.push("STRICT_LINEAGE_SOURCE_ARTIFACT_PATH_MISSING");
      }
      if (!lineageSourceArtifactSha256 || !/^[a-f0-9]{64}$/i.test(lineageSourceArtifactSha256)) {
        failures.push("STRICT_LINEAGE_SOURCE_ARTIFACT_SHA256_INVALID");
      }
    }

    writeCertificationGateReport("frontend-retrieval-evidence", {
      passed: failures.length === 0,
      metrics: {
        latestDir,
        missingLatestFiles,
        perQueryRows,
        rowsWithNonEmptyQuery,
        rowsWithResponseField,
        queryCoverage,
        responseFieldCoverage,
        scorecardPack,
        scorecardTotalQueries,
        scorecardAllowedDocs,
        scorecardInputFile,
        certProfile,
        strictRetrievalProfile,
        lineageViolation,
        lineageInputFile,
        lineageSourceArtifactPath,
        lineageSourceArtifactSha256,
        lineageInputArtifactType,
        playwrightExpected,
        playwrightSkipped,
      },
      thresholds: {
        requiredLatestFiles: contract.requiredLatestFiles,
        forbiddenFallbackDatasetMarkers: contract.forbiddenFallbackDatasetMarkers,
        minPerQueryRows: 1,
        strictPack: "100",
        strictMinQueryCoverage: 0.98,
        strictMinResponseFieldCoverage: 0.98,
        strictInputArtifactType: "raw_query_run",
        strictSourceArtifactSha256Regex: "^[a-f0-9]{64}$",
        minPlaywrightExpected: 1,
        maxPlaywrightSkipped: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
