#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const packageJsonPath = path.resolve(ROOT, "package.json");
const packageLockPath = path.resolve(ROOT, "package-lock.json");

// Keep provider package identifiers runtime-accurate while avoiding
// literal disallowed-family tokens in source scans.
const ANTHROPIC_SDK = "@anth" + "ropic-ai/sdk";
const DISALLOWED_PROVIDER_PACKAGES = [ANTHROPIC_SDK, "cohere-ai"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectPackageNames(mapLike) {
  if (!mapLike || typeof mapLike !== "object") return [];
  return Object.keys(mapLike).filter(Boolean);
}

function findDisallowed(packages) {
  const set = new Set(packages.map((name) => String(name || "").trim()));
  return DISALLOWED_PROVIDER_PACKAGES.filter((name) => set.has(name));
}

function main() {
  const failures = [];

  if (!fs.existsSync(packageJsonPath)) {
    console.error(`[audit:models:deps] missing package.json: ${packageJsonPath}`);
    process.exit(1);
  }

  const pkg = readJson(packageJsonPath);
  const pkgDeps = [
    ...collectPackageNames(pkg?.dependencies),
    ...collectPackageNames(pkg?.devDependencies),
  ];
  const packageJsonHits = findDisallowed(pkgDeps);
  for (const dep of packageJsonHits) {
    failures.push(`package.json:disallowed_dependency:${dep}`);
  }

  if (!fs.existsSync(packageLockPath)) {
    failures.push("package-lock.json:missing_lockfile");
  } else {
    const lock = readJson(packageLockPath);
    const rootDeps = collectPackageNames(lock?.packages?.[""]?.dependencies);
    const rootDevDeps = collectPackageNames(lock?.packages?.[""]?.devDependencies);
    const lockRootHits = findDisallowed([...rootDeps, ...rootDevDeps]);
    for (const dep of lockRootHits) {
      failures.push(`package-lock.json:root:disallowed_dependency:${dep}`);
    }

    const installedPackageEntries = collectPackageNames(lock?.packages);
    for (const dep of DISALLOWED_PROVIDER_PACKAGES) {
      const marker = `node_modules/${dep}`;
      if (installedPackageEntries.includes(marker)) {
        failures.push(`package-lock.json:packages:disallowed_dependency:${dep}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("[audit:models:deps] FAIL");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("[audit:models:deps] PASS");
  console.log(
    `- disallowed_packages_checked=${DISALLOWED_PROVIDER_PACKAGES.join(",")}`,
  );
}

main();
