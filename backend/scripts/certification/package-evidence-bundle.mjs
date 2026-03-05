#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommitHash } from "./git-commit.mjs";

function safeCopyFile(src, dest) {
  if (!src || !dest) return false;
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function findFrontendReportsRoot(rootDir) {
  const candidates = [
    path.resolve(rootDir, "../frontend/e2e/reports"),
    path.resolve(rootDir, "frontend/e2e/reports"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolvePerQueryArtifact(frontendReportsRoot) {
  if (!frontendReportsRoot) return null;
  const latestPerQueryPath = path.join(
    frontendReportsRoot,
    "latest",
    "per_query.json",
  );
  if (fs.existsSync(latestPerQueryPath)) {
    return latestPerQueryPath;
  }
  const lineagePath = path.join(frontendReportsRoot, "latest", "lineage.json");
  if (fs.existsSync(lineagePath)) {
    try {
      const lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));
      const archivePerQueryPath = String(
        lineage?.archivePerQueryPath || "",
      ).trim();
      if (archivePerQueryPath && fs.existsSync(archivePerQueryPath)) {
        return archivePerQueryPath;
      }
    } catch {
      // ignore malformed lineage and try archive fallback
    }
  }
  const archiveRoot = path.join(frontendReportsRoot, "archive");
  if (!fs.existsSync(archiveRoot)) return null;
  const dirs = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
  for (const dirName of dirs) {
    const candidate = path.join(archiveRoot, dirName, "per_query.json");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function packageCertificationEvidence(rootDir = process.cwd()) {
  const certRoot = path.resolve(rootDir, "reports/cert");
  const summaryJson = path.join(certRoot, "certification-summary.json");
  const summaryMd = path.join(certRoot, "certification-summary.md");
  const gatesDir = path.join(certRoot, "gates");
  const evidenceRoot = path.join(certRoot, "evidence");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bundleDir = path.join(evidenceRoot, stamp);

  fs.mkdirSync(bundleDir, { recursive: true });
  fs.mkdirSync(path.join(bundleDir, "gates"), { recursive: true });

  const copied = {
    summaryJson: safeCopyFile(
      summaryJson,
      path.join(bundleDir, "certification-summary.json"),
    ),
    summaryMd: safeCopyFile(summaryMd, path.join(bundleDir, "certification-summary.md")),
    gates: false,
    latestLineage: false,
    latestPerQuery: false,
    archivePerQuery: false,
  };

  if (fs.existsSync(gatesDir)) {
    for (const entry of fs.readdirSync(gatesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      safeCopyFile(
        path.join(gatesDir, entry.name),
        path.join(bundleDir, "gates", entry.name),
      );
      copied.gates = true;
    }
  }

  const frontendReportsRoot = findFrontendReportsRoot(rootDir);
  if (frontendReportsRoot) {
    copied.latestLineage = safeCopyFile(
      path.join(frontendReportsRoot, "latest", "lineage.json"),
      path.join(bundleDir, "frontend-reports", "latest", "lineage.json"),
    );
    copied.latestPerQuery = safeCopyFile(
      path.join(frontendReportsRoot, "latest", "per_query.json"),
      path.join(bundleDir, "frontend-reports", "latest", "per_query.json"),
    );
    const archivePerQueryPath = resolvePerQueryArtifact(frontendReportsRoot);
    if (archivePerQueryPath) {
      copied.archivePerQuery = safeCopyFile(
        archivePerQueryPath,
        path.join(bundleDir, "frontend-reports", "archive-per_query.json"),
      );
    }
  }

  const commitMetadata = resolveCommitHash(rootDir);
  const metadata = {
    generatedAt: new Date().toISOString(),
    bundleDir,
    commitHash: commitMetadata.commitHash,
    commitHashSource: commitMetadata.source,
    copied,
  };
  fs.writeFileSync(
    path.join(bundleDir, "metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(evidenceRoot, "latest.json"),
    `${JSON.stringify({ bundleDir, generatedAt: metadata.generatedAt }, null, 2)}\n`,
    "utf8",
  );

  return metadata;
}

function main() {
  const metadata = packageCertificationEvidence(process.cwd());
  console.log(
    `[cert-evidence] bundled to ${metadata.bundleDir} (commit=${metadata.commitHash || "unknown"})`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath && invokedPath === modulePath) {
  main();
}
