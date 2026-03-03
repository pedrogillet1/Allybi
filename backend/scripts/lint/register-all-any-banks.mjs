#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = process.cwd();
const banksRoot = path.resolve(repoRoot, "src", "data_banks");
const registryPath = path.join(banksRoot, "manifest", "bank_registry.any.json");
const usageManifestPath = path.join(
  banksRoot,
  "document_intelligence",
  "manifest",
  "usage_manifest.any.json",
);

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function shortHash(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 8);
}

function walkAnyJson(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".any.json")) {
        out.push(toPosix(path.relative(rootDir, full)));
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function ensurePlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function slugFromPath(relPath) {
  const base = String(relPath || "")
    .replace(/\.any\.json$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const candidate = base || `bank_${shortHash(relPath)}`;
  return /^[a-z]/.test(candidate) ? candidate : `bank_${candidate}`;
}

function deriveCategory(relPath) {
  const normalized = toPosix(relPath);
  const directMap = [
    ["manifest/", "manifest"],
    ["schemas/", "schemas"],
    ["normalizers/", "normalizers"],
    ["routing/", "routing"],
    ["operators/", "operators"],
    ["semantics/", "semantics"],
    ["scope/", "scope"],
    ["retrieval/", "retrieval"],
    ["formatting/", "formatting"],
    ["dictionaries/", "dictionaries"],
    ["lexicons/", "lexicons"],
    ["parsers/", "parsers"],
    ["intent_patterns/", "intent_patterns"],
    ["microcopy/", "microcopy"],
    ["overlays/", "overlays"],
    ["prompts/", "prompts"],
    ["policies/", "policies"],
    ["fallbacks/", "fallbacks"],
    ["quality/", "quality"],
    ["triggers/", "triggers"],
    ["ambiguity/", "ambiguity"],
    ["probes/", "probes"],
    ["templates/", "templates"],
    ["tests/", "tests"],
  ];

  for (const [prefix, category] of directMap) {
    if (normalized.startsWith(prefix)) return category;
  }

  const trimmed = normalized
    .replace(/^_deprecated\//, "")
    .replace(/^_quarantine\/[^/]+\//, "");

  if (normalized.startsWith(".compiled/")) return "manifest";
  if (normalized.startsWith("_quarantine/")) return "manifest";

  if (trimmed.startsWith("document_intelligence/")) {
    if (trimmed.includes("/manifest/")) return "manifest";
    if (trimmed.includes("/language/")) return "normalizers";
    if (trimmed.includes("/abbreviations/")) return "dictionaries";
    if (trimmed.includes("/lexicons/")) return "lexicons";
    if (trimmed.includes("/operators/")) return "operators";
    if (trimmed.includes("/routing/")) return "routing";
    if (trimmed.includes("/retrieval/")) return "retrieval";
    if (trimmed.includes("/quality/")) return "quality";
    if (trimmed.includes("/answer_style_bank")) return "formatting";
    if (trimmed.includes("/disclaimer_policy")) return "policies";
    if (trimmed.includes("/reasoning_scaffolds")) return "policies";
    if (trimmed.includes("/redaction_and_safety_rules")) return "policies";
    if (trimmed.includes("/domain_detection_rules")) return "routing";
    if (trimmed.includes("/validation_policies")) return "quality";
    if (trimmed.includes("/retrieval_strategies")) return "retrieval";
    return "semantics";
  }

  return "semantics";
}

function ensureUniqueId(rawId, relPath, usedIds) {
  const base = String(rawId || "").trim() || slugFromPath(relPath);
  if (!usedIds.has(base)) return base;
  const suffixed = `${base}_v${shortHash(relPath)}`;
  if (!usedIds.has(suffixed)) return suffixed;
  let counter = 2;
  let candidate = `${suffixed}_${counter}`;
  while (usedIds.has(candidate)) {
    counter += 1;
    candidate = `${suffixed}_${counter}`;
  }
  return candidate;
}

if (!fs.existsSync(registryPath)) {
  // eslint-disable-next-line no-console
  console.error(`[banks:register-all-any] missing registry: ${registryPath}`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const banks = Array.isArray(registry?.banks) ? registry.banks : [];
const byPath = new Map();
const usedIds = new Set();
for (const entry of banks) {
  const relPath = toPosix(entry?.path || "");
  const id = String(entry?.id || "").trim();
  if (relPath) byPath.set(relPath, entry);
  if (id) usedIds.add(id);
}

const today = new Date().toISOString().slice(0, 10);
const discoveredAny = walkAnyJson(banksRoot);
const addedEntries = [];
const updatedFiles = [];
const renamedIds = [];

for (const relPath of discoveredAny) {
  const fullPath = path.join(banksRoot, relPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  let bank = JSON.parse(raw);
  if (!ensurePlainObject(bank)) {
    bank = {};
  }

  const existingEntry = byPath.get(relPath);
  let changed = false;

  if (!ensurePlainObject(bank._meta)) {
    bank._meta = {};
    changed = true;
  }
  if (!ensurePlainObject(bank.config)) {
    bank.config = {};
    changed = true;
  }
  if (typeof bank.config.enabled !== "boolean") {
    bank.config.enabled = true;
    changed = true;
  }

  let candidateId = String(bank._meta.id || "").trim();
  if (!candidateId) {
    candidateId = slugFromPath(relPath);
    bank._meta.id = candidateId;
    changed = true;
  }

  if (!String(bank._meta.version || "").trim()) {
    bank._meta.version = "1.0.0";
    changed = true;
  }
  if (!String(bank._meta.description || "").trim()) {
    bank._meta.description = `Auto-registered bank payload for ${relPath}`;
    changed = true;
  }
  if (!Array.isArray(bank._meta.languages) || bank._meta.languages.length === 0) {
    bank._meta.languages = ["any"];
    changed = true;
  }
  if (!String(bank._meta.lastUpdated || "").trim()) {
    bank._meta.lastUpdated = today;
    changed = true;
  }

  if (existingEntry) {
    const existingId = String(existingEntry.id || "").trim();
    if (existingId && existingId !== String(bank._meta.id || "").trim()) {
      bank._meta.id = existingId;
      changed = true;
    }
  }

  if (!existingEntry) {
    const uniqueId = ensureUniqueId(candidateId, relPath, usedIds);
    if (uniqueId !== candidateId) {
      bank._meta.id = uniqueId;
      changed = true;
      renamedIds.push({
        relPath,
        from: candidateId,
        to: uniqueId,
      });
    }
    candidateId = uniqueId;
    usedIds.add(candidateId);

    const filename = path.basename(relPath);
    const version = String(bank?._meta?.version || "1.0.0").trim() || "1.0.0";
    const category = deriveCategory(relPath);
    const newEntry = {
      id: candidateId,
      category,
      filename,
      path: relPath,
      version,
      schemaId: "bank_schema",
      contentType: "json",
      dependsOn: [],
      enabledByEnv: {
        production: true,
        staging: true,
        dev: true,
        local: true,
      },
      requiredByEnv: {
        production: false,
        staging: false,
        dev: false,
        local: false,
      },
      checksumSha256: "",
      lastUpdated: today,
    };
    banks.push(newEntry);
    byPath.set(relPath, newEntry);
    addedEntries.push({ id: candidateId, path: relPath, category });
  }

  if (changed && !checkOnly) {
    fs.writeFileSync(fullPath, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
    updatedFiles.push(relPath);
  }
}

banks.sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")));
registry.banks = banks;
if (ensurePlainObject(registry._meta)) {
  registry._meta.lastUpdated = today;
}

if (!checkOnly) {
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

let usageManifestUpdated = false;
if (fs.existsSync(usageManifestPath)) {
  const usageManifest = JSON.parse(fs.readFileSync(usageManifestPath, "utf8"));
  const consumed = new Set(
    (Array.isArray(usageManifest?.consumedBankIds) ? usageManifest.consumedBankIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const before = consumed.size;
  for (const entry of banks) {
    const id = String(entry?.id || "").trim();
    if (id) consumed.add(id);
  }
  if (consumed.size !== before) {
    usageManifest.consumedBankIds = [...consumed].sort((a, b) => a.localeCompare(b));
    if (ensurePlainObject(usageManifest._meta)) {
      usageManifest._meta.lastUpdated = today;
    }
    if (!checkOnly) {
      fs.writeFileSync(usageManifestPath, `${JSON.stringify(usageManifest, null, 2)}\n`, "utf8");
    }
    usageManifestUpdated = true;
  }
}

const summary = {
  checkOnly,
  anyJsonDiscovered: discoveredAny.length,
  registryEntries: banks.length,
  addedRegistryEntries: addedEntries.length,
  updatedBankFiles: updatedFiles.length,
  renamedIds: renamedIds.length,
  usageManifestUpdated,
};

// eslint-disable-next-line no-console
console.log(`[banks:register-all-any] ${JSON.stringify(summary)}`);
if (renamedIds.length > 0) {
  // eslint-disable-next-line no-console
  console.log(
    `[banks:register-all-any] renamed sample: ${JSON.stringify(renamedIds.slice(0, 20))}`,
  );
}
