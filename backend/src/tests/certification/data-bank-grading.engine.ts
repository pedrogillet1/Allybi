import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { BankGrade, CheckResult } from "./data-bank-grading.types";
import { scoreToGrade as toGrade } from "./data-bank-grading.types";

const DATA_BANKS_ROOT = path.resolve(process.cwd(), "src/data_banks");

// ── Reference data (loaded once) ──────────────────────────────

interface RegistryEntry {
  id: string;
  category: string;
  path: string;
  filename: string;
  version: string;
  dependsOn?: string[];
  checksumSha256?: string;
}

let registryById: Map<string, RegistryEntry>;
let registryByPath: Map<string, RegistryEntry>;
let checksumByPath: Map<string, string>;
let allRegistryIds: Set<string>;

export function loadReferenceData(): void {
  // Registry
  const regPath = path.join(DATA_BANKS_ROOT, "manifest/bank_registry.any.json");
  const regRaw = JSON.parse(fs.readFileSync(regPath, "utf8"));
  const entries: RegistryEntry[] = regRaw.banks || regRaw.entries || [];
  registryById = new Map(entries.map((e) => [e.id, e]));
  registryByPath = new Map(entries.map((e) => [e.path, e]));
  allRegistryIds = new Set(entries.map((e) => e.id));

  // Checksums (keyed by file path, not bank ID)
  const ckPath = path.join(DATA_BANKS_ROOT, "manifest/bank_checksums.any.json");
  if (fs.existsSync(ckPath)) {
    const ckRaw = JSON.parse(fs.readFileSync(ckPath, "utf8"));
    const ckEntries = ckRaw.checksums || ckRaw.banks || {};
    checksumByPath = new Map(Object.entries(ckEntries).map(([p, v]: [string, any]) => [
      p,
      typeof v === "string" ? v : v?.sha256 || "",
    ]));
  } else {
    checksumByPath = new Map();
  }
}

// ── Individual checks ─────────────────────────────────────────

function checkMetaContract(bank: any): CheckResult {
  const name = "meta_contract";
  const weight = 0.15;
  const meta = bank?._meta;
  if (!meta || typeof meta !== "object") {
    return { checkName: name, passed: false, weight, score: 0, detail: "_meta missing or not an object" };
  }
  const required = ["id", "version", "description"];
  const missing = required.filter((f) => !meta[f] || typeof meta[f] !== "string" || meta[f].trim() === "");
  if (missing.length > 0) {
    return { checkName: name, passed: false, weight, score: 0, detail: `_meta missing fields: ${missing.join(", ")}` };
  }
  return { checkName: name, passed: true, weight, score: weight };
}

function checkConfigContract(bank: any): CheckResult {
  const name = "config_contract";
  const weight = 0.05;
  if (!bank?.config || typeof bank.config !== "object") {
    return { checkName: name, passed: false, weight, score: 0, detail: "config missing or not an object" };
  }
  if (typeof bank.config.enabled !== "boolean") {
    return { checkName: name, passed: false, weight, score: 0, detail: "config.enabled is not boolean" };
  }
  return { checkName: name, passed: true, weight, score: weight };
}

function checkVersionSemver(bank: any): CheckResult {
  const name = "version_semver";
  const weight = 0.05;
  const version = bank?._meta?.version;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    return { checkName: name, passed: false, weight, score: 0, detail: `version "${version}" is not valid semver` };
  }
  return { checkName: name, passed: true, weight, score: weight };
}

function checkDescriptionQuality(bank: any): CheckResult {
  const name = "description_quality";
  const weight = 0.05;
  const desc = bank?._meta?.description;
  if (!desc || typeof desc !== "string") {
    return { checkName: name, passed: false, weight, score: 0, detail: "description missing" };
  }
  if (desc.length < 8) {
    return { checkName: name, passed: false, weight, score: 0, detail: `description too short (${desc.length} chars, min 8)` };
  }
  if (desc.length > 800) {
    return { checkName: name, passed: false, weight, score: 0, detail: `description too long (${desc.length} chars, max 800)` };
  }
  const placeholders = ["todo", "placeholder", "tbd", "fill in", "change me", "xxx"];
  const lower = desc.toLowerCase();
  if (placeholders.some((p) => lower.includes(p))) {
    return { checkName: name, passed: false, weight, score: 0, detail: `description contains placeholder text` };
  }
  return { checkName: name, passed: true, weight, score: weight };
}

function checkDateFreshness(bank: any): CheckResult {
  const name = "date_freshness";
  const weight = 0.05;
  const dateStr = bank?._meta?.lastUpdated;
  if (!dateStr || typeof dateStr !== "string") {
    return { checkName: name, passed: false, weight, score: 0, detail: "lastUpdated missing" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { checkName: name, passed: false, weight, score: 0, detail: `lastUpdated "${dateStr}" is not YYYY-MM-DD` };
  }
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return { checkName: name, passed: false, weight, score: 0, detail: `lastUpdated "${dateStr}" is invalid date` };
  }
  const ageMs = Date.now() - parsed.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > 365) {
    return { checkName: name, passed: false, weight, score: 0, detail: `lastUpdated is ${Math.round(ageDays)} days old (max 365)` };
  }
  return { checkName: name, passed: true, weight, score: weight };
}

function checkRegistryAlignment(relPath: string, bank: any): CheckResult {
  const name = "registry_alignment";
  const weight = 0.20;
  const bankId = bank?._meta?.id;
  if (!bankId) {
    return { checkName: name, passed: false, weight, score: 0, detail: "no _meta.id to look up in registry" };
  }
  if (registryById.has(bankId) || registryByPath.has(relPath)) {
    return { checkName: name, passed: true, weight, score: weight };
  }
  return { checkName: name, passed: false, weight, score: 0, detail: `bank "${bankId}" not found in registry` };
}

function checkChecksumIntegrity(absPath: string, relPath: string, bank: any): CheckResult {
  const name = "checksum_integrity";
  const weight = 0.10;
  const bankId = bank?._meta?.id;
  if (!checksumByPath.has(relPath)) {
    // Not in checksum manifest — neutral pass if not registered, fail if registered
    if (!bankId || !registryById.has(bankId)) {
      return { checkName: name, passed: true, weight, score: weight, detail: "not registered, skipped" };
    }
    return { checkName: name, passed: false, weight, score: 0, detail: "registered but no checksum in manifest" };
  }
  const expectedHash = checksumByPath.get(relPath)!;
  if (!expectedHash) {
    return { checkName: name, passed: true, weight, score: weight, detail: "no checksum to validate" };
  }
  const content = fs.readFileSync(absPath, "utf8");
  const actualHash = crypto.createHash("sha256").update(content).digest("hex");
  if (actualHash !== expectedHash) {
    return { checkName: name, passed: false, weight, score: 0, detail: `SHA-256 mismatch (expected ${expectedHash.slice(0, 12)}…, got ${actualHash.slice(0, 12)}…)` };
  }
  return { checkName: name, passed: true, weight, score: weight };
}

function checkDependencyResolution(bank: any): CheckResult {
  const name = "dependency_resolution";
  const weight = 0.10;
  const bankId = bank?._meta?.id;
  if (!bankId) return { checkName: name, passed: true, weight, score: weight, detail: "no bankId, skipped" };
  const entry = registryById.get(bankId);
  const deps = entry?.dependsOn || [];
  if (deps.length === 0) return { checkName: name, passed: true, weight, score: weight };
  const missing = deps.filter((d: string) => !allRegistryIds.has(d));
  if (missing.length > 0) {
    return { checkName: name, passed: false, weight, score: 0, detail: `unresolved deps: ${missing.join(", ")}` };
  }
  return { checkName: name, passed: true, weight, score: weight };
}

function checkCrossRefIntegrity(bank: any): CheckResult {
  const name = "cross_ref_integrity";
  const weight = 0.15;
  const refs: string[] = [];
  // Walk entire bank object for keys ending in "BankId" or "bankId"
  function walk(obj: any): void {
    if (!obj || typeof obj !== "object") return;
    for (const [key, val] of Object.entries(obj)) {
      if ((key.endsWith("BankId") || key.endsWith("bankId")) && typeof val === "string" && val.length > 0) {
        refs.push(val);
      }
      if (typeof val === "object" && val !== null) walk(val);
    }
  }
  walk(bank);
  if (refs.length === 0) return { checkName: name, passed: true, weight, score: weight };
  const missing = refs.filter((r) => !allRegistryIds.has(r));
  if (missing.length > 0) {
    return { checkName: name, passed: false, weight, score: 0, detail: `dangling bankId refs: ${missing.join(", ")}` };
  }
  return { checkName: name, passed: true, weight, score: weight };
}

function checkLanguageParity(relPath: string): CheckResult {
  const name = "language_parity";
  const weight = 0.05;
  // Only applies to language-specific banks (.en.any.json / .pt.any.json)
  const enMatch = relPath.match(/^(.+)\.en\.any\.json$/);
  const ptMatch = relPath.match(/^(.+)\.pt\.any\.json$/);
  if (enMatch) {
    const counterpart = `${enMatch[1]}.pt.any.json`;
    const exists = fs.existsSync(path.join(DATA_BANKS_ROOT, counterpart));
    if (!exists) {
      return { checkName: name, passed: false, weight, score: 0, detail: `missing PT counterpart: ${counterpart}` };
    }
  } else if (ptMatch) {
    const counterpart = `${ptMatch[1]}.en.any.json`;
    const exists = fs.existsSync(path.join(DATA_BANKS_ROOT, counterpart));
    if (!exists) {
      return { checkName: name, passed: false, weight, score: 0, detail: `missing EN counterpart: ${counterpart}` };
    }
  }
  // Not a language-specific bank, or counterpart exists
  return { checkName: name, passed: true, weight, score: weight };
}

function checkHasEmbeddedTests(bank: any): CheckResult {
  const name = "has_embedded_tests";
  const weight = 0.05;
  // Accept root-level tests OR _meta.tests (external test file references)
  const tests = bank?.tests;
  const metaTests = bank?._meta?.tests;
  if (!tests && !metaTests) {
    return { checkName: name, passed: false, weight, score: 0, detail: "no tests key or _meta.tests" };
  }
  if (tests) {
    const cases = Array.isArray(tests) ? tests : tests?.cases;
    if (Array.isArray(cases) && cases.length > 0) {
      return { checkName: name, passed: true, weight, score: weight };
    }
  }
  if (metaTests && Array.isArray(metaTests) && metaTests.length > 0) {
    return { checkName: name, passed: true, weight, score: weight };
  }
  return { checkName: name, passed: false, weight, score: 0, detail: "tests/meta.tests exist but empty" };
}

// ── Grade a single bank ───────────────────────────────────────

export function gradeBank(absPath: string, relPath: string): BankGrade {
  let bank: any;
  try {
    bank = JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch (e: any) {
    return {
      filePath: relPath,
      bankId: null,
      category: relPath.split("/")[0] || "unknown",
      checks: [],
      rawScore: 0,
      grade: "F",
      failures: [`JSON parse error: ${e.message}`],
    };
  }

  const checks: CheckResult[] = [
    checkMetaContract(bank),
    checkConfigContract(bank),
    checkVersionSemver(bank),
    checkDescriptionQuality(bank),
    checkDateFreshness(bank),
    checkRegistryAlignment(relPath, bank),
    checkChecksumIntegrity(absPath, relPath, bank),
    checkDependencyResolution(bank),
    checkCrossRefIntegrity(bank),
    checkLanguageParity(relPath),
    checkHasEmbeddedTests(bank),
  ];

  const rawScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) * 100);
  const grade = toGrade(rawScore);
  const failures = checks.filter((c) => !c.passed).map((c) => `[${c.checkName}] ${c.detail || "failed"}`);

  return {
    filePath: relPath,
    bankId: bank?._meta?.id || null,
    category: relPath.split("/")[0] || "unknown",
    checks,
    rawScore,
    grade,
    failures,
  };
}

// ── Discover all JSON bank files ──────────────────────────────

export function discoverBankFiles(): Array<{ abs: string; rel: string }> {
  const results: Array<{ abs: string; rel: string }> = [];
  const SKIP_DIRS = new Set(["__reports", ".compiled", "_deprecated", "_quarantine", "node_modules"]);

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".any.json")) {
        const abs = path.join(dir, entry.name);
        const rel = path.relative(DATA_BANKS_ROOT, abs);
        results.push({ abs, rel });
      }
    }
  }

  walk(DATA_BANKS_ROOT);
  return results;
}
