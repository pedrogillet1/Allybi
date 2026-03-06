#!/usr/bin/env node
/* eslint-disable no-console */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateRoutingAlignmentReport } from "./routing-alignment-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const asJson = process.argv.includes("--json");
const report = generateRoutingAlignmentReport(repoRoot);

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else if (report.ok) {
  console.log("OK: routing/operator/editing alignment checks passed.");
} else {
  console.log("FAIL: routing/operator/editing alignment checks failed:");
  for (const problem of report.problems) console.log(`- ${problem}`);
  console.log("");
  console.log(
    `Counts: editOps=${report.counts.editOps}, viewerSafeOps=${report.counts.viewerSafeOps}`,
  );
}

process.exit(report.ok ? 0 : 1);
