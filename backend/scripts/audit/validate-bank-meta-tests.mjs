#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

function args(flag) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      out.push(String(process.argv[i + 1]));
    }
  }
  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listBankJsonFiles(rootDir, out = []) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".compiled" || entry.name === "_quarantine") continue;
      listBankJsonFiles(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".any.json")) out.push(full);
  }
  return out;
}

function resolveCandidates(repoRoot, testRef) {
  const ref = String(testRef || "").trim().replace(/\\/g, "/");
  if (!ref) return [];

  const candidates = new Set();
  if (path.isAbsolute(ref)) {
    candidates.add(ref);
  }
  candidates.add(path.resolve(repoRoot, ref));
  candidates.add(path.resolve(repoRoot, "src", ref));
  if (ref.startsWith("tests/")) {
    candidates.add(path.resolve(repoRoot, "src", ref));
  }
  return Array.from(candidates);
}

function existsAny(paths) {
  for (const entry of paths) {
    if (fs.existsSync(entry)) return entry;
  }
  return null;
}

function main() {
  const strict = process.argv.includes("--strict");
  const scanAll = process.argv.includes("--all");
  const requireResolved =
    process.argv.includes("--require-resolved") || strict || !scanAll;
  const requireTests =
    process.argv.includes("--require-tests") || strict || !scanAll;

  let repoRoot = path.resolve(process.cwd());
  if (!fs.existsSync(path.resolve(repoRoot, "src", "data_banks"))) {
    const backendRoot = path.resolve(repoRoot, "backend");
    if (fs.existsSync(path.resolve(backendRoot, "src", "data_banks"))) {
      repoRoot = backendRoot;
    }
  }
  const dataBanksRoot = path.resolve(repoRoot, "src", "data_banks");

  const defaultBanks = [
    "document_intelligence/eval/suites/suite_registry.any.json",
    "manifest/feature_flags.any.json",
  ];
  const requestedBanks = args("--bank");
  const banks = scanAll
    ? listBankJsonFiles(dataBanksRoot).map((fullPath) =>
      path.relative(dataBanksRoot, fullPath).replace(/\\/g, "/")
    )
    : requestedBanks.length > 0
      ? requestedBanks
      : defaultBanks;

  const failures = [];
  const warnings = [];
  const checks = [];
  let banksWithMeta = 0;
  let banksMissingMeta = 0;
  let banksWithoutTests = 0;

  for (const relBankPath of banks) {
    const normalizedBankPath = String(relBankPath || "").trim().replace(
      /\\/g,
      "/",
    );
    const fullBankPath = path.resolve(dataBanksRoot, normalizedBankPath);
    if (!fs.existsSync(fullBankPath)) {
      failures.push(`missing bank file: ${normalizedBankPath}`);
      continue;
    }

    let parsed;
    try {
      parsed = readJson(fullBankPath);
    } catch (error) {
      failures.push(
        `invalid JSON in ${normalizedBankPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (parsed?._meta && typeof parsed._meta === "object") banksWithMeta += 1;
    else banksMissingMeta += 1;

    const tests = Array.isArray(parsed?._meta?.tests) ? parsed._meta.tests : [];
    if (tests.length === 0) {
      banksWithoutTests += 1;
      if (requireTests) {
        failures.push(
          `${normalizedBankPath}: _meta.tests must be a non-empty array`,
        );
      } else {
        warnings.push(
          `${normalizedBankPath}: _meta.tests missing (advisory in --all mode)`,
        );
      }
      continue;
    }

    for (const testRef of tests) {
      const candidates = resolveCandidates(repoRoot, testRef);
      const resolved = existsAny(candidates);
      if (!resolved) {
        const message = `${normalizedBankPath}: test reference not found: ${String(testRef)}`;
        if (requireResolved) failures.push(message);
        else warnings.push(message);
      } else {
        checks.push({
          bank: normalizedBankPath,
          testRef: String(testRef),
          resolved: path.relative(repoRoot, resolved).replace(/\\/g, "/"),
        });
      }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict,
    scanAll,
    requireResolved,
    requireTests,
    banksChecked: banks.length,
    banksWithMeta,
    banksMissingMeta,
    banksWithoutTests,
    resolvedChecks: checks.length,
    failures,
    warnings,
    passed: failures.length === 0,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exit(1);
}

main();
