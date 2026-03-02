#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "crypto";

const repoRoot = path.resolve(process.cwd());
const banksRoot = path.join(repoRoot, "src", "data_banks");
const registryPath = path.join(banksRoot, "manifest", "bank_registry.any.json");
const checksumsPath = path.join(banksRoot, "manifest", "bank_checksums.any.json");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const includeRegistry = args.has("--include-registry");
const selfExemptPaths = new Set([
  "manifest/bank_registry.any.json",
  "manifest/bank_checksums.any.json",
]);

function stripBom(input) {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isStrictRequired(entry) {
  const required = entry?.requiredByEnv || {};
  return Boolean(required.production) || Boolean(required.staging);
}

if (!fs.existsSync(registryPath)) {
  console.error(`[banks:checksum] registry not found: ${registryPath}`);
  process.exit(1);
}
if (!fs.existsSync(checksumsPath)) {
  console.error(`[banks:checksum] checksum manifest not found: ${checksumsPath}`);
  process.exit(1);
}

const registry = readJson(registryPath);
const checksumsBank = readJson(checksumsPath);
const banks = Array.isArray(registry?.banks) ? registry.banks : [];

let missingFile = 0;
let registryMismatches = 0;
let registryUpdated = 0;
let prunedMissing = 0;
let prunedDependencies = 0;

const derivedChecksums = {};
const effectiveBanks = [];
for (const entry of banks) {
  const relPath = String(entry?.path || "").trim();
  if (!relPath) continue;

  const fullPath = path.join(banksRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    missingFile += 1;
    if (!checkOnly) {
      prunedMissing += 1;
      continue;
    }
    continue;
  }

  effectiveBanks.push(entry);

  const raw = fs.readFileSync(fullPath, "utf8");
  const computed = sha256(stripBom(raw));
  const declared = String(entry?.checksumSha256 || "").trim();

  const isRegistrySelf =
    relPath === "manifest/bank_registry.any.json" ||
    String(entry?.id || "") === "bank_registry";
  const isSelfExempt = selfExemptPaths.has(relPath);
  if (checkOnly) {
    if ((!isRegistrySelf || includeRegistry) && !isSelfExempt) {
      if (!declared || declared !== computed) registryMismatches += 1;
    }
  } else if ((!isRegistrySelf || includeRegistry) && !isSelfExempt) {
    if (declared !== computed) {
      entry.checksumSha256 = computed;
      registryUpdated += 1;
    }
  }

  const existingSelf = checksumsBank?.checksums?.[relPath];
  derivedChecksums[relPath] = isSelfExempt && existingSelf
    ? {
        sha256: String(existingSelf.sha256 || "").trim(),
        required: Boolean(existingSelf.required),
        category: String(existingSelf.category || entry?.category || "manifest"),
      }
    : {
        sha256: computed,
        required: isStrictRequired(entry),
        category: String(entry?.category || "manifest"),
      };
}

const normalizedDerived = Object.fromEntries(
  Object.keys(derivedChecksums)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => [k, derivedChecksums[k]]),
);

const existingChecksums = checksumsBank?.checksums && typeof checksumsBank.checksums === "object"
  ? checksumsBank.checksums
  : {};

const derivedPaths = new Set(Object.keys(normalizedDerived));
const existingPaths = new Set(Object.keys(existingChecksums));
const missingFromManifest = [...derivedPaths].filter((p) => !existingPaths.has(p));
const extraInManifest = [...existingPaths].filter((p) => !derivedPaths.has(p));

let manifestMismatches = 0;
for (const p of derivedPaths) {
  if (selfExemptPaths.has(p)) continue;
  const expected = normalizedDerived[p];
  const actual = existingChecksums[p] || {};
  if (
    String(actual.sha256 || "").trim() !== expected.sha256 ||
    Boolean(actual.required) !== Boolean(expected.required) ||
    String(actual.category || "").trim() !== expected.category
  ) {
    manifestMismatches += 1;
  }
}

if (checkOnly) {
  if (missingFile || registryMismatches || missingFromManifest.length || extraInManifest.length || manifestMismatches) {
    console.error(
      `[banks:checksum] check failed (missingFile=${missingFile}, registryMismatches=${registryMismatches}, manifestMissing=${missingFromManifest.length}, manifestExtra=${extraInManifest.length}, manifestMismatches=${manifestMismatches})`,
    );
    process.exit(1);
  }
  console.log(`[banks:checksum] check passed for ${banks.length} registry entries`);
  process.exit(0);
}

if (!checkOnly) {
  const presentIds = new Set(
    effectiveBanks
      .map((entry) => String(entry?.id || "").trim())
      .filter(Boolean),
  );
  for (const entry of effectiveBanks) {
    const deps = Array.isArray(entry?.dependsOn)
      ? entry.dependsOn.map((dep) => String(dep || "").trim()).filter(Boolean)
      : [];
    if (deps.length === 0) continue;
    const filtered = deps.filter((dep) => presentIds.has(dep));
    if (filtered.length !== deps.length) {
      prunedDependencies += deps.length - filtered.length;
      entry.dependsOn = filtered;
    }
  }
  registry.banks = effectiveBanks;
}

checksumsBank._meta = {
  ...(checksumsBank._meta || {}),
  id: "bank_checksums",
  lastUpdated: "2026-03-01",
};
checksumsBank.config = {
  ...(checksumsBank.config || {}),
  enabled: true,
};
checksumsBank.checksums = normalizedDerived;

writeJson(registryPath, registry);
writeJson(checksumsPath, checksumsBank);
console.log(
  `[banks:checksum] registryUpdated=${registryUpdated} missingFile=${missingFile} prunedMissing=${prunedMissing} prunedDependencies=${prunedDependencies} checksumsEntries=${Object.keys(normalizedDerived).length}`,
);
