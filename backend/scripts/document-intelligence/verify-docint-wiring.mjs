#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");

const mapPath = path.join(
  dataBanksRoot,
  "semantics",
  "document_intelligence_bank_map.any.json",
);
const registryPath = path.join(dataBanksRoot, "manifest", "bank_registry.any.json");
const depsPath = path.join(dataBanksRoot, "manifest", "bank_dependencies.any.json");
const aliasesPath = path.join(dataBanksRoot, "manifest", "bank_aliases.any.json");

const strict = process.argv.includes("--strict");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(msg, failures) {
  failures.push(msg);
}

const failures = [];

if (!fs.existsSync(mapPath)) fail(`Missing map file: ${mapPath}`, failures);
if (!fs.existsSync(registryPath))
  fail(`Missing registry file: ${registryPath}`, failures);
if (!fs.existsSync(depsPath)) fail(`Missing dependency file: ${depsPath}`, failures);
if (!fs.existsSync(aliasesPath)) fail(`Missing aliases file: ${aliasesPath}`, failures);

if (failures.length) {
  console.error("[docint:verify] bootstrap failures:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

const mapBank = readJson(mapPath);
const registry = readJson(registryPath);
const deps = readJson(depsPath);
const aliases = readJson(aliasesPath);

const requiredCoreBankIds = Array.isArray(mapBank.requiredCoreBankIds)
  ? mapBank.requiredCoreBankIds
  : [];
const optionalBankIds = Array.isArray(mapBank.optionalBankIds)
  ? mapBank.optionalBankIds
  : [];

if (!requiredCoreBankIds.length) {
  fail("Map has empty requiredCoreBankIds", failures);
}

const registryById = new Map((registry.banks || []).map((b) => [String(b.id), b]));
const depsById = new Map((deps.banks || []).map((b) => [String(b.id), b]));
const aliasesList = Array.isArray(aliases.aliases) ? aliases.aliases : [];
const aliasSet = new Set(
  aliasesList.map((a) => `${String(a.alias || "").toLowerCase()}=>${String(a.canonicalId || "")}`),
);

const idsToCheck = [...requiredCoreBankIds, ...optionalBankIds];
for (const id of idsToCheck) {
  const entry = registryById.get(id);
  if (!entry) {
    fail(`Missing registry entry for bank id=${id}`, failures);
    continue;
  }

  const rel = String(entry.path || "").trim();
  const full = path.join(dataBanksRoot, rel);
  if (!rel || !fs.existsSync(full)) {
    fail(`Missing bank file for id=${id} path=${rel}`, failures);
    continue;
  }

  try {
    const parsed = readJson(full);
    const metaId = String(parsed?._meta?.id || "").trim();
    if (metaId !== id) {
      fail(`Bank id mismatch: registry=${id} meta.id=${metaId} file=${rel}`, failures);
    }
  } catch (err) {
    fail(`Invalid JSON for id=${id} file=${rel}: ${err.message || err}`, failures);
  }

  if (!depsById.has(id)) {
    fail(`Missing dependency node for id=${id} in bank_dependencies`, failures);
  }

  const requiredByEnv = entry.requiredByEnv || {};
  const shouldBeRequired = requiredCoreBankIds.includes(id);
  const requiredAll =
    requiredByEnv.production === true &&
    requiredByEnv.staging === true &&
    requiredByEnv.dev === true &&
    requiredByEnv.local === true;
  if (shouldBeRequired && !requiredAll) {
    fail(`Required core bank not required in all envs: id=${id}`, failures);
  }

  const selfAliasKey = `${id.toLowerCase()}=>${id}`;
  if (!aliasSet.has(selfAliasKey)) {
    fail(`Missing self alias mapping for id=${id}`, failures);
  }
}

const requiredInRegistry = new Set(
  (registry.banks || [])
    .filter((b) => b?.requiredByEnv?.production === true)
    .map((b) => String(b.id)),
);
for (const id of requiredCoreBankIds) {
  if (!requiredInRegistry.has(id)) {
    fail(`Core id not marked required in production: ${id}`, failures);
  }
}

if (failures.length) {
  console.error(`[docint:verify] failed with ${failures.length} issue(s)`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

const summary = {
  requiredCore: requiredCoreBankIds.length,
  optional: optionalBankIds.length,
  totalChecked: idsToCheck.length,
  strict,
};

console.log(`[docint:verify] ok ${JSON.stringify(summary)}`);

if (strict) {
  const requiredCategories = [
    "semantics",
    "normalizers",
    "operators",
    "policies",
    "quality",
    "retrieval",
  ];
  const missingCategories = [];
  for (const category of requiredCategories) {
    const count = (registry.banks || []).filter((b) => b.category === category).length;
    if (!count) missingCategories.push(category);
  }
  if (missingCategories.length) {
    console.error(
      `[docint:verify] strict category gap: ${missingCategories.join(", ")}`,
    );
    process.exit(1);
  }
}
