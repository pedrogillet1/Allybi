#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BANKS_ROOT = path.resolve(ROOT, "src/data_banks");
const REGISTRY_PATH = path.join(BANKS_ROOT, "manifest/bank_registry.any.json");
const REPORT_PATH = path.resolve(ROOT, "reports/unused_bank_audit.json");

const STRICT = process.argv.includes("--strict");
const ALLOWED_PREFIXES = [
  "manifest/",
  "_quarantine/",
  "_deprecated/",
  "document_intelligence/__",
];
const ALLOWED_SUFFIXES = [".entities.schema.json"];

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function walkJson(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      out.push(toPosix(path.relative(rootDir, full)));
    }
  }
  return out.sort();
}

function isAllowed(relPath) {
  return (
    ALLOWED_PREFIXES.some((prefix) => relPath.startsWith(prefix)) ||
    ALLOWED_SUFFIXES.some((suffix) => relPath.endsWith(suffix))
  );
}

if (!fs.existsSync(REGISTRY_PATH)) {
  // eslint-disable-next-line no-console
  console.error(`[banks:audit-unused] missing registry: ${REGISTRY_PATH}`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const registryPaths = new Set(
  (Array.isArray(registry.banks) ? registry.banks : [])
    .map((entry) => toPosix(entry?.path))
    .filter(Boolean),
);

const allJson = walkJson(BANKS_ROOT);
const unregistered = allJson.filter(
  (relPath) => !registryPaths.has(relPath) && !isAllowed(relPath),
);
const missingOnDisk = [...registryPaths].filter(
  (relPath) => !fs.existsSync(path.join(BANKS_ROOT, relPath)),
);

const report = {
  generatedAt: new Date().toISOString(),
  repoRoot: ROOT,
  banksRoot: BANKS_ROOT,
  strict: STRICT,
  totals: {
    discoveredJsonFiles: allJson.length,
    registryEntries: registryPaths.size,
    unregisteredOutsideQuarantine: unregistered.length,
    missingRegistryFilesOnDisk: missingOnDisk.length,
  },
  policy: {
    allowedPrefixes: ALLOWED_PREFIXES,
    allowedSuffixes: ALLOWED_SUFFIXES,
  },
  unregisteredOutsideQuarantine: unregistered,
  missingRegistryFilesOnDisk: missingOnDisk,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

// eslint-disable-next-line no-console
console.log("[banks:audit-unused] report written:", REPORT_PATH);
// eslint-disable-next-line no-console
console.log(
  `[banks:audit-unused] unregistered=${unregistered.length} missingOnDisk=${missingOnDisk.length}`,
);

if (STRICT && (unregistered.length > 0 || missingOnDisk.length > 0)) {
  process.exit(1);
}
