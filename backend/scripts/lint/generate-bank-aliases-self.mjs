#!/usr/bin/env node
import fs from "fs";
import path from "path";

const repoRoot = path.resolve(process.cwd());
const banksRoot = path.join(repoRoot, "src", "data_banks");
const registryPath = path.join(banksRoot, "manifest", "bank_registry.any.json");
const aliasesPath = path.join(banksRoot, "manifest", "bank_aliases.any.json");
const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const strict = args.has("--strict");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeAlias(alias, config) {
  let out = String(alias || "").trim();
  if (!out) return "";
  if (config?.collapseWhitespace !== false) {
    out = out.replace(/\s+/g, " ");
  }
  if (config?.stripDiacritics) {
    out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  if (config?.lowercase !== false && config?.caseSensitive !== true) {
    out = out.toLowerCase();
  }
  return out;
}

if (!fs.existsSync(registryPath) || !fs.existsSync(aliasesPath)) {
  console.error("[banks:aliases] missing registry or aliases file");
  process.exit(1);
}

const registry = readJson(registryPath);
const aliasesBank = readJson(aliasesPath);
const registryById = new Map(
  (Array.isArray(registry?.banks) ? registry.banks : [])
    .map((entry) => [String(entry?.id || "").trim(), entry])
    .filter(([id]) => id),
);
const registryIds = new Set(
  [...registryById.keys()]
    .map((id) => String(id || "").trim())
    .filter(Boolean),
);

const rawAliases = Array.isArray(aliasesBank?.aliases)
  ? aliasesBank.aliases
      .map((entry) => ({
        alias: String(entry?.alias || "").trim(),
        canonicalId: String(entry?.canonicalId || "").trim(),
        reason: entry?.reason,
        addedAt: entry?.addedAt,
        expiresInDays: Object.prototype.hasOwnProperty.call(entry || {}, "expiresInDays")
          ? entry.expiresInDays
          : undefined,
        source: entry?.source,
        notes: entry?.notes,
      }))
      .filter((entry) => entry.alias && entry.canonicalId)
  : Object.entries(aliasesBank?.aliases || {})
      .map(([alias, canonicalId]) => ({
        alias: String(alias || "").trim(),
        canonicalId: String(canonicalId || "").trim(),
      }))
      .filter((entry) => entry.alias && entry.canonicalId);

const config = aliasesBank?.config || {};
const collisions = [];
const deduped = [];
const seenByNormalized = new Map();

for (const entry of rawAliases) {
  if (!registryIds.has(entry.canonicalId)) continue;
  const normalized = normalizeAlias(entry.alias, config);
  if (!normalized) continue;

  const existing = seenByNormalized.get(normalized);
  if (existing && existing.canonicalId !== entry.canonicalId) {
    collisions.push({
      alias: entry.alias,
      canonicalId: entry.canonicalId,
      conflictsWith: existing,
    });
    continue;
  }
  if (!existing) {
    seenByNormalized.set(normalized, {
      alias: entry.alias,
      canonicalId: entry.canonicalId,
      source: entry.source,
    });
    deduped.push(entry);
  }
}

for (const canonicalId of Array.from(registryIds).sort((a, b) => a.localeCompare(b))) {
  const normalized = normalizeAlias(canonicalId, config);
  const existing = seenByNormalized.get(normalized);
  if (existing && existing.canonicalId === canonicalId) continue;
  if (existing && existing.canonicalId !== canonicalId) {
    const registryEntry = registryById.get(canonicalId) || {};
    const required = registryEntry?.requiredByEnv || {};
    const legacyOptionalInProdStaging =
      required.production !== true && required.staging !== true;
    const migrationPinnedAlias = String(existing?.source || "") === "migration_alias";
    if (legacyOptionalInProdStaging && migrationPinnedAlias) {
      continue;
    }
    collisions.push({
      alias: canonicalId,
      canonicalId,
      conflictsWith: existing,
    });
    continue;
  }
  const self = {
    alias: canonicalId,
    canonicalId,
    source: "runtime_self_alias",
    notes: "Generated self-alias for governance integrity.",
  };
  deduped.push(self);
  seenByNormalized.set(normalized, { alias: canonicalId, canonicalId });
}

if (strict && collisions.length > 0) {
  console.error(`[banks:aliases] collision(s) detected: ${collisions.length}`);
  for (const c of collisions.slice(0, 20)) {
    console.error(` - ${c.alias} -> ${c.canonicalId} conflicts with ${c.conflictsWith.alias} -> ${c.conflictsWith.canonicalId}`);
  }
  process.exit(1);
}

const outAliases = deduped.sort((a, b) => {
  const aliasCmp = a.alias.localeCompare(b.alias);
  if (aliasCmp !== 0) return aliasCmp;
  return a.canonicalId.localeCompare(b.canonicalId);
});

const out = {
  ...aliasesBank,
  _meta: {
    ...(aliasesBank?._meta || {}),
    id: "bank_aliases",
    lastUpdated: "2026-03-01",
  },
  aliases: outAliases,
};

if (!write) {
  const current = fs.readFileSync(aliasesPath, "utf8");
  const next = `${JSON.stringify(out, null, 2)}\n`;
  if (current === next && collisions.length === 0) {
    console.log("[banks:aliases] up to date");
    process.exit(0);
  }
  if (collisions.length > 0) {
    console.error(`[banks:aliases] ${collisions.length} collision(s) found`);
  }
  console.error("[banks:aliases] out of date (run with --write)");
  process.exit(1);
}

writeJson(aliasesPath, out);
if (collisions.length > 0) {
  console.warn(`[banks:aliases] wrote with ${collisions.length} skipped collision(s)`);
}
console.log(`[banks:aliases] wrote ${path.relative(repoRoot, aliasesPath)} with ${outAliases.length} aliases`);
