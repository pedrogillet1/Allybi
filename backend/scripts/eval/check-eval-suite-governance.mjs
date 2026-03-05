#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

function arg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function args(flag) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      out.push(String(process.argv[i + 1]));
    }
  }
  return out;
}

function toNumber(value, fallback) {
  if (value == null || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listQaJsonl(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listQaJsonl(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".qa.jsonl")) out.push(full);
  }
  return out;
}

function parseJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSON at ${filePath}:${idx + 1} (${error.message})`);
      }
    });
}

function toRegistryEntries(rows, source) {
  return (rows || [])
    .map((row) => ({
      source,
      path: String(row?.path || "").trim(),
      inventoryOnly: row?.inventoryOnly === true,
    }))
    .filter((row) => row.path.length > 0);
}

function gatherRegistryEntries(registry) {
  const merged = [
    ...toRegistryEntries(registry.ci_suites, "ci_suites"),
    ...toRegistryEntries(registry.nightly_suites, "nightly_suites"),
    ...toRegistryEntries(registry.suites, "suites"),
  ];

  const deduped = new Map();
  for (const row of merged) {
    const existing = deduped.get(row.path);
    if (!existing) {
      deduped.set(row.path, row);
      continue;
    }
    // If any declaration requires metrics, do not treat it as inventory-only.
    deduped.set(row.path, {
      ...existing,
      inventoryOnly: existing.inventoryOnly && row.inventoryOnly,
    });
  }

  return Array.from(deduped.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}

function resolveRegistryFiles(dataBanksRoot, registryEntries) {
  const registered = new Set();
  const metric = new Set();
  const missing = [];
  for (const entry of registryEntries) {
    const rel = String(entry.path || "").trim();
    const full = path.resolve(dataBanksRoot, rel);
    if (!fs.existsSync(full)) {
      missing.push(rel);
      continue;
    }
    const stat = fs.statSync(full);
    let resolved = [];
    if (stat.isDirectory()) {
      resolved = listQaJsonl(full).map((fp) =>
        path.relative(dataBanksRoot, fp).replace(/\\/g, "/")
      );
    } else {
      resolved = [path.relative(dataBanksRoot, full).replace(/\\/g, "/")];
    }

    for (const filePath of resolved) {
      registered.add(filePath);
      if (!entry.inventoryOnly) {
        metric.add(filePath);
      }
    }
  }
  return {
    registeredFiles: Array.from(registered).sort(),
    metricFiles: Array.from(metric).sort(),
    missing,
  };
}

function main() {
  const strict = process.argv.includes("--strict");
  const repoRoot = path.resolve(process.cwd());
  const dataBanksRoot = path.resolve(repoRoot, "src", "data_banks");
  const evalRoot = path.resolve(dataBanksRoot, "document_intelligence", "eval");
  const registryPath = path.resolve(
    evalRoot,
    "suites",
    "suite_registry.any.json",
  );

  if (!fs.existsSync(registryPath)) {
    console.error(`[eval-governance] missing suite registry: ${registryPath}`);
    process.exit(1);
  }

  const registry = readJson(registryPath);
  const registryEntries = gatherRegistryEntries(registry);
  const requiredRegistered = new Set([
    "document_intelligence/eval/wrong_doc_traps.qa.jsonl",
    ...args("--require-registered").map((value) => String(value || "").trim()),
  ]);
  const governanceConfig = registry?.config?.governanceThresholds || {};
  const parityTolerancePercent = toNumber(
    registry?.config?.parityTolerancePercent,
    strict ? 5 : 10,
  );

  const thresholds = {
    minQueryFamilies: toNumber(
      arg("--min-query-families"),
      toNumber(governanceConfig.minQueryFamilies, strict ? 4 : 2),
    ),
    minDomains: toNumber(
      arg("--min-domains"),
      toNumber(governanceConfig.minDomains, 15),
    ),
    minNegativeRatio: toNumber(
      arg("--min-negative-ratio"),
      toNumber(
        governanceConfig.minNegativeRatio,
        toNumber(registry?.config?.minimumNegativeRatio, 0.2),
      ),
    ),
    maxParityGap: toNumber(
      arg("--max-parity-gap"),
      toNumber(
        governanceConfig.maxParityGap,
        parityTolerancePercent / 100,
      ),
    ),
    maxUnregisteredFiles: toNumber(
      arg("--max-unregistered-files"),
      toNumber(governanceConfig.maxUnregisteredFiles, strict ? 0 : 5),
    ),
  };

  const failures = [];
  const warnings = [];
  const {
    registeredFiles,
    metricFiles,
    missing: missingRegistryTargets,
  } = resolveRegistryFiles(dataBanksRoot, registryEntries);
  const allEvalFiles = listQaJsonl(evalRoot)
    .map((fp) => path.relative(dataBanksRoot, fp).replace(/\\/g, "/"))
    .sort();
  const registeredSet = new Set(registeredFiles);
  const unregisteredFiles = allEvalFiles.filter((rel) => !registeredSet.has(rel));

  if (missingRegistryTargets.length > 0) {
    failures.push(
      `registry references missing paths (${missingRegistryTargets.length})`,
    );
  }
  for (const relPath of requiredRegistered) {
    if (relPath && !registeredSet.has(relPath)) {
      failures.push(`required eval file is not registered: ${relPath}`);
    }
  }
  if (unregisteredFiles.length > thresholds.maxUnregisteredFiles) {
    failures.push(
      `unregistered eval files ${unregisteredFiles.length} exceed max ${thresholds.maxUnregisteredFiles}`,
    );
  }

  const domains = new Set();
  const queryFamilies = new Set();
  let enCount = 0;
  let ptCount = 0;
  let totalCases = 0;
  let negativeCases = 0;
  const parseErrors = [];

  for (const relPath of metricFiles) {
    const fullPath = path.resolve(dataBanksRoot, relPath);
    let cases = [];
    try {
      cases = parseJsonl(fullPath);
    } catch (error) {
      parseErrors.push(error.message);
      continue;
    }
    for (const item of cases) {
      totalCases += 1;
      const lang = String(item?.lang || "").trim().toLowerCase();
      if (lang === "en") enCount += 1;
      if (lang === "pt") ptCount += 1;
      const domain = String(item?.domain || "").trim().toLowerCase();
      if (domain) domains.add(domain);
      const queryFamily = String(item?.queryFamily || "").trim();
      if (queryFamily) queryFamilies.add(queryFamily);
      if (item?.expected?.negative === true) negativeCases += 1;
    }
  }

  if (parseErrors.length > 0) {
    failures.push(`registered eval parse errors (${parseErrors.length})`);
  }

  const parityGap =
    enCount + ptCount > 0 ? Math.abs(enCount - ptCount) / (enCount + ptCount) : 1;
  const negativeRatio = totalCases > 0 ? negativeCases / totalCases : 0;

  if (queryFamilies.size < thresholds.minQueryFamilies) {
    failures.push(
      `queryFamily coverage ${queryFamilies.size} below min ${thresholds.minQueryFamilies}`,
    );
  }
  if (domains.size < thresholds.minDomains) {
    failures.push(`domain coverage ${domains.size} below min ${thresholds.minDomains}`);
  }
  if (negativeRatio < thresholds.minNegativeRatio) {
    failures.push(
      `negative ratio ${negativeRatio.toFixed(4)} below min ${thresholds.minNegativeRatio}`,
    );
  }
  if (parityGap > thresholds.maxParityGap) {
    failures.push(
      `EN/PT parity gap ${parityGap.toFixed(4)} exceeds max ${thresholds.maxParityGap}`,
    );
  }

  if (registryEntries.length === 0) {
    failures.push("registry has no suite paths");
  }
  if (registeredFiles.length === 0) {
    failures.push("registry resolves to zero eval files");
  }
  if (metricFiles.length === 0) {
    failures.push("registry resolves to zero metric eval files");
  }
  if (allEvalFiles.length === 0) {
    failures.push("no eval files found under document_intelligence/eval");
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict,
    registryPath,
    thresholds,
    counts: {
      registryEntries: registryEntries.length,
      registeredFiles: registeredFiles.length,
      metricFiles: metricFiles.length,
      allEvalFiles: allEvalFiles.length,
      unregisteredFiles: unregisteredFiles.length,
      totalCases,
      enCount,
      ptCount,
      negativeCases,
      domains: domains.size,
      queryFamilies: queryFamilies.size,
    },
    coverage: {
      parityGap,
      negativeRatio,
      queryFamilies: Array.from(queryFamilies).sort(),
      domains: Array.from(domains).sort(),
    },
    requiredRegistered: Array.from(requiredRegistered).sort(),
    registryEntries,
    missingRegistryTargets,
    unregisteredFiles,
    warnings,
    failures,
    passed: failures.length === 0,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exit(1);
}

main();
