#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "crypto";

const repoRoot = path.resolve(process.cwd());
const banksRoot = path.join(repoRoot, "src", "data_banks");
const registryPath = path.join(banksRoot, "manifest", "bank_registry.any.json");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

function stripBom(input) {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

if (!fs.existsSync(registryPath)) {
  console.error(`[banks:checksum] registry not found: ${registryPath}`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const banks = Array.isArray(registry.banks) ? registry.banks : [];

let missingFile = 0;
let mismatches = 0;
let updated = 0;

for (const entry of banks) {
  const relPath = String(entry.path || "").trim();
  // Registry is self-referential; skip its own checksum in normal checks.
  if (!args.has("--include-registry") && relPath === "manifest/bank_registry.any.json") {
    continue;
  }
  const fullPath = path.join(banksRoot, relPath);
  if (!relPath || !fs.existsSync(fullPath)) {
    missingFile += 1;
    continue;
  }
  const raw = fs.readFileSync(fullPath, "utf8");
  const computed = sha256(stripBom(raw));
  const declared = String(entry.checksumSha256 || "").trim();
  if (checkOnly) {
    if (!declared || declared !== computed) mismatches += 1;
    continue;
  }
  if (declared !== computed) {
    entry.checksumSha256 = computed;
    updated += 1;
  }
}

if (checkOnly) {
  if (missingFile || mismatches) {
    console.error(
      `[banks:checksum] check failed (missingFile=${missingFile}, mismatches=${mismatches}, total=${banks.length})`
    );
    process.exit(1);
  }
  console.log(`[banks:checksum] check passed for ${banks.length} entries`);
  process.exit(0);
}

fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`[banks:checksum] updated=${updated} missingFile=${missingFile} total=${banks.length}`);
