#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const banksRoot = path.resolve(repoRoot, "src", "data_banks");
const registryPath = path.join(banksRoot, "manifest", "bank_registry.any.json");
const usageManifestPath = path.join(
  banksRoot,
  "document_intelligence",
  "manifest",
  "usage_manifest.any.json",
);
const reportPath = path.resolve(repoRoot, "reports/runtime_bank_coverage.json");

const strict = process.argv.includes("--strict");
const envArg = process.argv.find((arg) => arg.startsWith("--env="));
const envValue = String(envArg || "").split("=")[1] || process.env.NODE_ENV || "dev";
const env = normalizeEnv(envValue);

function normalizeEnv(value) {
  const lowered = String(value || "").toLowerCase().trim();
  if (lowered === "development" || lowered === "test") return "dev";
  if (["production", "staging", "dev", "local"].includes(lowered)) return lowered;
  return "dev";
}

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function walkAnyJson(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".any.json")) continue;
      out.push(toPosix(path.relative(rootDir, fullPath)));
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function compilePatterns(values) {
  const out = [];
  for (const raw of Array.isArray(values) ? values : []) {
    try {
      out.push(new RegExp(String(raw || "")));
    } catch {
      // Ignore invalid regex entries here; strictness is enforced by runtime checks.
    }
  }
  return out;
}

function isConsumedByUsage(bankId, usageManifest) {
  const consumedIds = new Set(
    (Array.isArray(usageManifest?.consumedBankIds) ? usageManifest.consumedBankIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const prefixes = (Array.isArray(usageManifest?.consumedIdPrefixes)
    ? usageManifest.consumedIdPrefixes
    : []
  )
    .map((prefix) => String(prefix || "").trim())
    .filter(Boolean);
  const patterns = compilePatterns(usageManifest?.consumedIdPatterns);

  return (
    consumedIds.has(bankId) ||
    prefixes.some((prefix) => bankId.startsWith(prefix)) ||
    patterns.some((pattern) => pattern.test(bankId))
  );
}

function isEnabledInEnv(entry, currentEnv) {
  const enabledByEnv = entry?.enabledByEnv;
  const explicitlyProvided =
    enabledByEnv && typeof enabledByEnv === "object" && Object.keys(enabledByEnv).length > 0;
  if (!explicitlyProvided) return true;
  return Boolean(enabledByEnv[currentEnv]);
}

function shouldSkipFromLoadOrder(entry) {
  const relPath = toPosix(entry?.path || "");
  return relPath.startsWith("_deprecated/");
}

function probeRuntimeLoadedIds(currentEnv) {
  const probeScript = `
    import path from "node:path";
    const env = ${JSON.stringify(currentEnv)};
    const mod = await import("./src/services/core/banks/dataBankLoader.service.ts");
    const LoaderCtor = mod.DataBankLoaderService || mod.default?.DataBankLoaderService || mod.default;
    if (typeof LoaderCtor !== "function") {
      throw new Error("Could not resolve DataBankLoaderService constructor export");
    }

    const skippedById = {};
    const logger = {
      info() {},
      warn(msg, meta) {
        if (msg !== "Skipping failed optional bank load") return;
        const id = String(meta?.entryId || "").trim();
        if (!id) return;
        skippedById[id] = String(meta?.reason || "unknown");
      },
      error() {},
    };

    const loader = new LoaderCtor({
      rootDir: path.join(process.cwd(), "src", "data_banks"),
      env,
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      logger,
    });

    let fatal = null;
    try {
      await loader.loadAll();
    } catch (err) {
      fatal = String(err?.message || err || "unknown fatal error");
    }

    const loadLog = typeof loader.getLoadLog === "function" ? loader.getLoadLog() : [];
    const loadedIds = [...new Set(
      loadLog
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
    const cachedIds = typeof loader.listLoadedIds === "function"
      ? loader.listLoadedIds().map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    console.log(JSON.stringify({
      env,
      fatal,
      loadLogCount: loadLog.length,
      loadedIds,
      cachedCount: cachedIds.length,
      skippedById,
    }));
  `;

  const child = spawnSync("node", ["--import", "tsx", "-e", probeScript], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (child.status !== 0) {
    throw new Error(
      [
        "runtime probe failed",
        child.stderr ? child.stderr.trim() : "",
        child.stdout ? child.stdout.trim() : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const raw = String(child.stdout || "").trim();
  if (!raw) {
    throw new Error("runtime probe returned empty stdout");
  }

  return JSON.parse(raw);
}

if (!fs.existsSync(registryPath)) {
  // eslint-disable-next-line no-console
  console.error(`[banks:runtime:coverage] missing registry at ${registryPath}`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const usageManifest = fs.existsSync(usageManifestPath)
  ? JSON.parse(fs.readFileSync(usageManifestPath, "utf8"))
  : null;

const registryBanks = Array.isArray(registry?.banks) ? registry.banks : [];
const registryIdToPath = new Map();
for (const bank of registryBanks) {
  const id = String(bank?.id || "").trim();
  const relPath = toPosix(bank?.path || "");
  if (id) registryIdToPath.set(id, relPath);
}

const registryIds = new Set([...registryIdToPath.keys()]);
const registryPaths = new Set([...registryIdToPath.values()].filter(Boolean));
const discoveredAnyPaths = walkAnyJson(banksRoot);
const discoveredAnySet = new Set(discoveredAnyPaths);

const unregisteredAnyPaths = discoveredAnyPaths.filter((relPath) => !registryPaths.has(relPath));
const missingRegistryFilesOnDisk = sortStrings(
  [...registryPaths].filter((relPath) => !discoveredAnySet.has(relPath)),
);

const usageUncoveredIds = usageManifest
  ? sortStrings([...registryIds].filter((id) => !isConsumedByUsage(id, usageManifest)))
  : sortStrings([...registryIds]);

let runtimeProbe = null;
let runtimeProbeError = null;
try {
  runtimeProbe = probeRuntimeLoadedIds(env);
} catch (err) {
  runtimeProbeError = String(err?.message || err || "runtime probe failed");
}

const enabledRegistryIds = sortStrings(
  registryBanks
    .filter((entry) => isEnabledInEnv(entry, env))
    .filter((entry) => !shouldSkipFromLoadOrder(entry))
    .map((entry) => String(entry?.id || "").trim())
    .filter(Boolean),
);

const loadedIdSet = new Set(Array.isArray(runtimeProbe?.loadedIds) ? runtimeProbe.loadedIds : []);
const runtimeMissingIds = sortStrings(
  enabledRegistryIds.filter((id) => !loadedIdSet.has(id)),
);

const runtimeMissingSample = runtimeMissingIds.slice(0, 30).map((id) => ({
  id,
  path: registryIdToPath.get(id) || "",
  reason: runtimeProbe?.skippedById?.[id] || "not loaded by runtime probe",
}));

const report = {
  generatedAt: new Date().toISOString(),
  strict,
  env,
  policy: {
    required: [
      "every .any.json under src/data_banks must be registered",
      "every registered path must exist on disk",
      "every registered bank id must be covered by usage_manifest",
      "every enabled registered bank id must load in runtime probe",
    ],
  },
  totals: {
    anyJsonFilesDiscovered: discoveredAnyPaths.length,
    registryEntries: registryBanks.length,
    unregisteredAnyPaths: unregisteredAnyPaths.length,
    missingRegistryFilesOnDisk: missingRegistryFilesOnDisk.length,
    usageUncoveredIds: usageUncoveredIds.length,
    enabledRegistryIds: enabledRegistryIds.length,
    runtimeLoadedIds: loadedIdSet.size,
    runtimeMissingIds: runtimeMissingIds.length,
  },
  runtimeProbe: runtimeProbeError
    ? { ok: false, error: runtimeProbeError }
    : {
        ok: true,
        env: runtimeProbe.env,
        fatal: runtimeProbe.fatal,
        loadLogCount: runtimeProbe.loadLogCount,
        loadedIds: runtimeProbe.loadedIds,
        cachedCount: runtimeProbe.cachedCount,
      },
  violations: {
    unregisteredAnyPaths,
    missingRegistryFilesOnDisk,
    usageUncoveredIds,
    runtimeMissingIds,
  },
  samples: {
    runtimeMissingSample,
  },
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const hasViolation =
  unregisteredAnyPaths.length > 0 ||
  missingRegistryFilesOnDisk.length > 0 ||
  usageUncoveredIds.length > 0 ||
  runtimeMissingIds.length > 0 ||
  Boolean(runtimeProbeError) ||
  Boolean(runtimeProbe?.fatal);

// eslint-disable-next-line no-console
console.log(
  `[banks:runtime:coverage] env=${env} any=${discoveredAnyPaths.length} registry=${registryBanks.length} unregisteredAny=${unregisteredAnyPaths.length} missingOnDisk=${missingRegistryFilesOnDisk.length} usageUncovered=${usageUncoveredIds.length} runtimeMissing=${runtimeMissingIds.length}`,
);
// eslint-disable-next-line no-console
console.log(`[banks:runtime:coverage] report=${reportPath}`);

if (strict && hasViolation) {
  const runtimeProbeSummary = runtimeProbeError
    ? { ok: false, error: runtimeProbeError }
    : {
        ok: true,
        env: runtimeProbe?.env || env,
        fatal: runtimeProbe?.fatal || null,
        loadLogCount: Number(runtimeProbe?.loadLogCount || 0),
        loadedCount: Array.isArray(runtimeProbe?.loadedIds) ? runtimeProbe.loadedIds.length : 0,
        cachedCount: Number(runtimeProbe?.cachedCount || 0),
      };
  const preview = {
    totals: report.totals,
    runtimeProbe: runtimeProbeSummary,
    unregisteredAnySample: unregisteredAnyPaths.slice(0, 20),
    runtimeMissingSample,
    usageUncoveredSample: usageUncoveredIds.slice(0, 20),
  };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(preview, null, 2));
  process.exit(1);
}
