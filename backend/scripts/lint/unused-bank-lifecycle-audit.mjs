#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = path.resolve(ROOT, "src");
const BANKS_ROOT = path.join(SRC_ROOT, "data_banks");
const REGISTRY_PATH = path.join(BANKS_ROOT, "manifest/bank_registry.any.json");
const LIFECYCLE_PATH = path.join(
  BANKS_ROOT,
  "manifest/unused_bank_lifecycle.any.json",
);
const DOCINT_USAGE_MANIFEST_PATH = path.join(
  BANKS_ROOT,
  "document_intelligence/manifest/usage_manifest.any.json",
);
const REPORT_PATH = path.resolve(
  ROOT,
  "reports/unused_bank_lifecycle_report.json",
);
const STRICT = process.argv.includes("--strict");

const INFRA_IDS = new Set([
  "bank_registry",
  "bank_aliases",
  "bank_checksums",
  "bank_dependencies",
  "bank_schema",
  "bank_manifest",
  "environments",
  "languages",
  "versioning",
]);

function toPosix(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkCodeFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || !fs.existsSync(cur)) continue;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "_quarantine"
        ) {
          continue;
        }
        stack.push(full);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs"))
      ) {
        out.push(full);
      }
    }
  }
  return out;
}

function isBankRefContext(ctxWindow, line, id) {
  const bankCallRe =
    /(?:getBank|safeGetBank|getOptionalBank|safeEditingBank|safeBank)\s*(?:<[^>]*>)?\s*\(/;
  if (bankCallRe.test(line) || bankCallRe.test(ctxWindow)) return true;
  if (/\[/.test(ctxWindow) && line.includes(`"${id}"`)) return true;
  if (
    (line.includes(`"${id}"`) || line.includes(`'${id}'`)) &&
    (/BANK_IDS|LEXICON_IDS|PARSER_IDS|loadAllybi|bankId|Bank/.test(ctxWindow) ||
      /:\s*["']/.test(line))
  ) {
    return true;
  }
  if (
    /case\s+["']/.test(line) ||
    /bankId\s*[:=]/.test(line) ||
    /id\s*:\s*["']/.test(line)
  ) {
    return true;
  }
  return false;
}

if (!fs.existsSync(REGISTRY_PATH) || !fs.existsSync(LIFECYCLE_PATH)) {
  console.error(
    "[banks:unused:lifecycle] missing registry or lifecycle manifest",
  );
  process.exit(1);
}

const registry = readJson(REGISTRY_PATH);
const lifecycle = readJson(LIFECYCLE_PATH);
const banks = Array.isArray(registry.banks) ? registry.banks : [];
const allIds = new Set(banks.map((b) => b.id));

const codeFiles = walkCodeFiles(SRC_ROOT);
const foundInCode = new Set();
for (const file of codeFiles) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const re = /["'`]([a-z][a-z0-9_]*(?:_[a-z0-9]+)*)["'`]/g;
    const strings = [];
    let m;
    while ((m = re.exec(line)) !== null) strings.push(m[1]);
    if (!strings.length) continue;
    const ctx = lines
      .slice(Math.max(0, i - 5), Math.min(lines.length, i + 6))
      .join("\n");
    for (const s of strings) {
      if (!allIds.has(s)) continue;
      if (isBankRefContext(ctx, line, s)) foundInCode.add(s);
    }
  }
}
for (const id of INFRA_IDS) foundInCode.add(id);

if (fs.existsSync(DOCINT_USAGE_MANIFEST_PATH)) {
  const usageManifest = readJson(DOCINT_USAGE_MANIFEST_PATH);
  const consumedBankIds = Array.isArray(usageManifest?.consumedBankIds)
    ? usageManifest.consumedBankIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  const consumedIdPrefixes = Array.isArray(usageManifest?.consumedIdPrefixes)
    ? usageManifest.consumedIdPrefixes
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  const consumedIdPatterns = Array.isArray(usageManifest?.consumedIdPatterns)
    ? usageManifest.consumedIdPatterns
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  const consumedRegexes = consumedIdPatterns
    .map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  for (const id of consumedBankIds) {
    if (allIds.has(id)) foundInCode.add(id);
  }

  for (const bank of banks) {
    const id = String(bank?.id || "").trim();
    if (!id || foundInCode.has(id)) continue;
    if (consumedIdPrefixes.some((prefix) => id.startsWith(prefix))) {
      foundInCode.add(id);
      continue;
    }
    if (consumedRegexes.some((re) => re.test(id))) {
      foundInCode.add(id);
    }
  }
}

const unusedBanks = banks.filter(
  (b) => !foundInCode.has(b.id) && !INFRA_IDS.has(b.id),
);

const configuredAllowedStatuses = Array.isArray(lifecycle?.allowedStatuses)
  ? lifecycle.allowedStatuses.map((x) => String(x || "").trim()).filter(Boolean)
  : [];
const allowedStatuses = new Set(
  configuredAllowedStatuses.length > 0
    ? configuredAllowedStatuses
    : ["candidate_deprecate", "deprecated_keep", "remove_approved", "active"],
);
const defaultStatus = String(lifecycle?.defaultStatus || "").trim();
const allowCandidateInStrict = Boolean(lifecycle?.allowCandidateInStrict);

const idOverrides = Array.isArray(lifecycle?.idOverrides)
  ? lifecycle.idOverrides
  : [];
const categoryRules = Array.isArray(lifecycle?.categoryRules)
  ? lifecycle.categoryRules
  : [];
const pathPrefixRules = Array.isArray(lifecycle?.pathPrefixRules)
  ? lifecycle.pathPrefixRules
  : [];

const overrideMap = new Map();
const missingReasons = [];
for (const entry of idOverrides) {
  const id = String(entry?.id || "").trim();
  const status = String(entry?.status || "").trim();
  const reason = String(entry?.reason || "").trim();
  if (id) overrideMap.set(id, status);
  if (id && !reason) missingReasons.push(`idOverride ${id} missing reason`);
}
for (const rule of categoryRules) {
  const category = String(rule?.category || "").trim();
  const reason = String(rule?.reason || "").trim();
  if (category && !reason)
    missingReasons.push(`categoryRule ${category} missing reason`);
}
for (const rule of pathPrefixRules) {
  const prefix = toPosix(rule?.prefix || "");
  const reason = String(rule?.reason || "").trim();
  if (prefix && !reason)
    missingReasons.push(`pathPrefixRule ${prefix} missing reason`);
}

function classify(bank) {
  const id = String(bank?.id || "").trim();
  const category = String(bank?.category || "").trim();
  const bankPath = toPosix(bank?.path || "");

  if (overrideMap.has(id))
    return { status: overrideMap.get(id), source: `idOverride:${id}` };

  for (const rule of pathPrefixRules) {
    const prefix = toPosix(rule?.prefix || "");
    const status = String(rule?.status || "").trim();
    if (prefix && bankPath.startsWith(prefix))
      return { status, source: `pathPrefix:${prefix}` };
  }

  for (const rule of categoryRules) {
    const c = String(rule?.category || "").trim();
    const status = String(rule?.status || "").trim();
    if (c && c === category) return { status, source: `category:${c}` };
  }

  return { status: defaultStatus, source: "defaultStatus" };
}

const invalidStatuses = [];
if (!allowedStatuses.has(defaultStatus)) {
  invalidStatuses.push(`invalid defaultStatus: ${defaultStatus}`);
}
for (const [id, status] of overrideMap.entries()) {
  if (!allowedStatuses.has(status))
    invalidStatuses.push(`idOverride ${id} -> ${status}`);
}
for (const rule of categoryRules) {
  const status = String(rule?.status || "").trim();
  if (!allowedStatuses.has(status))
    invalidStatuses.push(
      `categoryRule ${String(rule?.category || "")} -> ${status}`,
    );
}
for (const rule of pathPrefixRules) {
  const status = String(rule?.status || "").trim();
  if (!allowedStatuses.has(status))
    invalidStatuses.push(
      `pathPrefixRule ${String(rule?.prefix || "")} -> ${status}`,
    );
}

const unknownOverrideIds = [...overrideMap.keys()].filter(
  (id) => !allIds.has(id),
);

const sortedUnusedBanks = [...unusedBanks].sort((a, b) =>
  String(a.id || "").localeCompare(String(b.id || "")),
);
const byStatus = {};
const fullByStatus = {};
const unclassified = [];

for (const bank of sortedUnusedBanks) {
  const { status, source } = classify(bank);
  if (!allowedStatuses.has(status)) {
    unclassified.push({
      id: bank.id,
      category: bank.category,
      path: bank.path,
      status,
      source,
    });
    continue;
  }
  byStatus[status] = (byStatus[status] || 0) + 1;
  if (!fullByStatus[status]) fullByStatus[status] = [];
  fullByStatus[status].push({
    id: bank.id,
    category: bank.category,
    path: bank.path,
    source,
  });
}

for (const status of [...allowedStatuses].sort((a, b) => a.localeCompare(b))) {
  if (!fullByStatus[status]) fullByStatus[status] = [];
}

const report = {
  generatedAt: new Date().toISOString(),
  strict: STRICT,
  totals: {
    registryBanks: banks.length,
    unusedBanks: unusedBanks.length,
  },
  byStatus,
  fullByStatus,
  candidateCount: byStatus.candidate_deprecate || 0,
  allowCandidateInStrict,
  invalidStatuses,
  missingReasons,
  unknownOverrideIds,
  unclassified,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`[banks:unused:lifecycle] report written: ${REPORT_PATH}`);
console.log(JSON.stringify(report.totals));

if (STRICT) {
  if (
    invalidStatuses.length > 0 ||
    unknownOverrideIds.length > 0 ||
    missingReasons.length > 0
  )
    process.exit(1);
  if (unclassified.length > 0) process.exit(1);
  if (!allowCandidateInStrict && (byStatus.candidate_deprecate || 0) > 0)
    process.exit(1);
  if (
    unusedBanks.length > 0 &&
    Object.values(byStatus).reduce((a, b) => a + b, 0) !== unusedBanks.length
  )
    process.exit(1);
}
