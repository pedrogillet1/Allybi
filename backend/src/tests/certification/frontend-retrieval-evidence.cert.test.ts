import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

import { writeCertificationGateReport } from "./reporting";

const REQUIRED_LATEST_FILES = [
  "scorecard.json",
  "grading.md",
  "a-plus-gap-deep-dive.md",
  "per_query.json",
  "lineage.json",
];

function resolveRepoRoot(): string {
  return path.resolve(__dirname, "../../..");
}

describe("Certification: frontend retrieval evidence completeness", () => {
  test("latest grading artifacts and playwright results are complete and non-skipped", () => {
    const repoRoot = resolveRepoRoot();
    const frontendReportsRoot = path.resolve(repoRoot, "../frontend/e2e/reports");
    const latestDir = path.join(frontendReportsRoot, "latest");
    const resultsPath = path.join(frontendReportsRoot, "results.json");
    const failures: string[] = [];

    if (!fs.existsSync(latestDir)) {
      failures.push("LATEST_REPORT_DIR_MISSING");
    }

    const missingLatestFiles = REQUIRED_LATEST_FILES.filter(
      (fileName) => !fs.existsSync(path.join(latestDir, fileName)),
    );
    if (missingLatestFiles.length > 0) {
      failures.push(`LATEST_FILES_MISSING:${missingLatestFiles.join(",")}`);
    }

    const perQueryPath = path.join(latestDir, "per_query.json");
    let perQueryRows = 0;
    if (fs.existsSync(perQueryPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(perQueryPath, "utf8"));
        perQueryRows = Array.isArray(parsed) ? parsed.length : 0;
        if (perQueryRows <= 0) failures.push("PER_QUERY_EMPTY");
      } catch {
        failures.push("PER_QUERY_INVALID_JSON");
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

    writeCertificationGateReport("frontend-retrieval-evidence", {
      passed: failures.length === 0,
      metrics: {
        latestDir,
        missingLatestFiles,
        perQueryRows,
        playwrightExpected,
        playwrightSkipped,
      },
      thresholds: {
        requiredLatestFiles: REQUIRED_LATEST_FILES,
        minPerQueryRows: 1,
        minPlaywrightExpected: 1,
        maxPlaywrightSkipped: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
