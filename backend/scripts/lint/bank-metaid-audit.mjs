#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BANKS_ROOT = path.resolve(ROOT, "src/data_banks");
const STRICT = process.argv.includes("--strict");
const SKIP_PREFIXES = new Set(["_quarantine/"]);

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function walkAnyJson(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".any.json")) {
        out.push(full);
      }
    }
  }
  return out;
}

if (!fs.existsSync(BANKS_ROOT)) {
  console.error(`[banks:metaid] missing banks root: ${BANKS_ROOT}`);
  process.exit(1);
}

const files = walkAnyJson(BANKS_ROOT);
const idToPaths = new Map();
const missingMetaId = [];
const deprecatedPrefixViolations = [];
const legacyOutsideDeprecated = [];

for (const file of files) {
  const rel = toPosix(path.relative(BANKS_ROOT, file));
  if ([...SKIP_PREFIXES].some((prefix) => rel.startsWith(prefix))) continue;
  let bank;
  try {
    bank = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`[banks:metaid] invalid json: ${rel} :: ${err?.message || err}`);
    process.exit(1);
  }

  const id = String(bank?._meta?.id || "").trim();
  if (!id) {
    missingMetaId.push(rel);
    continue;
  }

  if (!idToPaths.has(id)) idToPaths.set(id, []);
  idToPaths.get(id).push(rel);

  const isDeprecated = rel.startsWith("_deprecated/");
  if (isDeprecated && !id.startsWith("legacy_")) {
    deprecatedPrefixViolations.push(`${rel} => ${id}`);
  }
  if (!isDeprecated && id.startsWith("legacy_")) {
    legacyOutsideDeprecated.push(`${rel} => ${id}`);
  }
}

const duplicateIds = [...idToPaths.entries()]
  .filter(([, rels]) => rels.length > 1)
  .map(([id, rels]) => ({ id, rels: [...rels].sort((a, b) => a.localeCompare(b)) }))
  .sort((a, b) => a.id.localeCompare(b.id));

const report = {
  generatedAt: new Date().toISOString(),
  strict: STRICT,
  totals: {
    anyJsonFiles: files.length,
    missingMetaId: missingMetaId.length,
    duplicateMetaIdGroups: duplicateIds.length,
    deprecatedPrefixViolations: deprecatedPrefixViolations.length,
    legacyOutsideDeprecated: legacyOutsideDeprecated.length,
  },
  missingMetaId,
  duplicateMetaIds: duplicateIds,
  deprecatedPrefixViolations,
  legacyOutsideDeprecated,
};

console.log(JSON.stringify(report, null, 2));

const hasFailures =
  missingMetaId.length > 0 ||
  duplicateIds.length > 0 ||
  deprecatedPrefixViolations.length > 0 ||
  legacyOutsideDeprecated.length > 0;

if (STRICT && hasFailures) process.exit(1);
