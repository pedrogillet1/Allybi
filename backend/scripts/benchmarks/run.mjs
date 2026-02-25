#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const benchDir = path.resolve(ROOT, "src/tests/benchmarks");
const outDir = path.resolve(ROOT, "reports/benchmarks");
const jsonOut = path.join(outDir, "benchmark-index.json");
const csvOut = path.join(outDir, "benchmark-index.csv");

function readJsonl(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function main() {
  if (!fs.existsSync(benchDir)) {
    console.error(`[benchmarks] missing directory: ${benchDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(benchDir)
    .filter((file) => file.endsWith(".jsonl"))
    .sort();

  const rows = [];
  let totalCases = 0;
  for (const file of files) {
    const fullPath = path.join(benchDir, file);
    const entries = readJsonl(fullPath);
    const ids = entries.map((entry) => String(entry.id || "").trim());
    const uniqueIds = new Set(ids.filter(Boolean));
    rows.push({
      file,
      cases: entries.length,
      uniqueIds: uniqueIds.size,
      duplicateIds: entries.length - uniqueIds.size,
    });
    totalCases += entries.length;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    jsonOut,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        benchmarkDir: benchDir,
        totalFiles: files.length,
        totalCases,
        files: rows,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const csv = ["file,cases,uniqueIds,duplicateIds"];
  for (const row of rows) {
    csv.push(
      `${row.file},${row.cases},${row.uniqueIds},${row.duplicateIds}`,
    );
  }
  fs.writeFileSync(csvOut, `${csv.join("\n")}\n`, "utf8");

  console.log(`[benchmarks] index written: ${jsonOut}`);
  console.log(`[benchmarks] csv written: ${csvOut}`);
  console.log(`[benchmarks] files=${files.length} cases=${totalCases}`);

  const hasDuplicates = rows.some((row) => row.duplicateIds > 0);
  if (hasDuplicates) process.exit(1);
}

main();
