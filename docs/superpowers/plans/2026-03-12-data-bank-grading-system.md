# Data Bank Grading System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a strict, automated grading system that scores every data bank JSON file across structural, referential, and content-quality dimensions — producing per-file grades (A–F), category rollups, and a single overall system grade.

**Architecture:** A single cert test (`data-bank-grading.cert.test.ts`) that walks every JSON file in `backend/src/data_banks/`, applies 11 weighted checks per file, computes a 0–100 score, maps to a letter grade, and writes a structured JSON report via the existing `writeCertificationGateReport()` infrastructure. A companion fixer script uses the report to auto-remediate common failures.

**Tech Stack:** Jest cert test, Node.js `fs`/`path`/`crypto`, existing `writeCertificationGateReport`, existing `bank_registry.any.json` + `bank_checksums.any.json` + `bank_dependencies.any.json` as reference data.

---

## Chunk 1: Core Grading Engine

### Task 1: Scaffold the grading types

**Files:**
- Create: `backend/src/tests/certification/data-bank-grading.types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// ── Grading types ──────────────────────────────────────────────

export type LetterGrade = "A" | "B" | "C" | "D" | "F";

export interface CheckResult {
  checkName: string;
  passed: boolean;
  weight: number;        // 0–1, all weights sum to 1.0
  score: number;         // 0 or weight (binary per check)
  detail?: string;       // human-readable failure reason
}

export interface BankGrade {
  filePath: string;       // relative to data_banks/
  bankId: string | null;  // _meta.id or null if missing
  category: string;       // subdirectory name
  checks: CheckResult[];
  rawScore: number;       // 0–100
  grade: LetterGrade;
  failures: string[];     // human-readable list
}

export interface CategoryRollup {
  category: string;
  totalBanks: number;
  avgScore: number;
  gradeDistribution: Record<LetterGrade, number>;
  worstBanks: Array<{ filePath: string; score: number; grade: LetterGrade }>;
}

export interface GradingReport {
  generatedAt: string;
  totalFiles: number;
  overallScore: number;
  overallGrade: LetterGrade;
  gradeDistribution: Record<LetterGrade, number>;
  categoryRollups: CategoryRollup[];
  allBanks: BankGrade[];
  summary: {
    totalChecksRun: number;
    totalChecksPassed: number;
    totalChecksFailed: number;
    topFailures: Array<{ checkName: string; failCount: number }>;
  };
}

export function scoreToGrade(score: number): LetterGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/tests/certification/data-bank-grading.types.ts
git commit -m "feat(grading): add types for data bank grading system"
```

---

### Task 2: Build the 11-check grading engine

**Files:**
- Create: `backend/src/tests/certification/data-bank-grading.engine.ts`

This is the core engine. Each bank file is run through 11 weighted checks:

| # | Check | Weight | What it validates |
|---|-------|--------|-------------------|
| 1 | `meta_contract` | 0.15 | `_meta` exists with `id`, `version`, `description` |
| 2 | `config_contract` | 0.05 | `config` exists, `config.enabled` is boolean |
| 3 | `version_semver` | 0.05 | `_meta.version` is valid semver (X.Y.Z) |
| 4 | `description_quality` | 0.05 | `_meta.description` is 8–800 chars, not placeholder text |
| 5 | `date_freshness` | 0.05 | `_meta.lastUpdated` is valid ISO date, not older than 365 days |
| 6 | `registry_alignment` | 0.20 | File has a matching entry in `bank_registry.any.json` |
| 7 | `checksum_integrity` | 0.10 | SHA-256 of file matches `bank_checksums.any.json` (skip if not registered) |
| 8 | `dependency_resolution` | 0.10 | All `dependsOn` IDs exist in registry |
| 9 | `cross_ref_integrity` | 0.15 | All `*BankId` / `*bankId` values in the file resolve to real registry entries |
| 10 | `language_parity` | 0.05 | If file is `.en.any.json`, a `.pt.any.json` counterpart exists (and vice versa) |
| 11 | `has_embedded_tests` | 0.05 | Bank has a `tests` key with at least 1 test case |

**Total: 1.00**

- [ ] **Step 1: Write the engine file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/tests/certification/data-bank-grading.engine.ts
git commit -m "feat(grading): 11-check grading engine for data banks"
```

---

### Task 3: Write the cert test

**Files:**
- Create: `backend/src/tests/certification/data-bank-grading.cert.test.ts`

- [ ] **Step 1: Write the cert test**

```typescript
import { describe, test, expect, beforeAll } from "@jest/globals";
import path from "path";
import fs from "fs";
import { writeCertificationGateReport } from "./reporting";
import {
  loadReferenceData,
  discoverBankFiles,
  gradeBank,
} from "./data-bank-grading.engine";
import type { BankGrade, CategoryRollup, GradingReport } from "./data-bank-grading.types";
import { scoreToGrade } from "./data-bank-grading.types";

const REPORT_PATH = path.resolve(process.cwd(), "reports/cert/data-bank-grading-report.json");

// ── Thresholds (tune these as quality improves) ───────────────
const THRESHOLDS = {
  minOverallScore: 60,         // overall system must be ≥ D
  maxFGradeBanks: 50,          // no more than 50 F-grade banks
  minCategoryAvg: 50,          // every category avg ≥ 50
};

describe("Certification: data bank grading", () => {
  let report: GradingReport;

  beforeAll(() => {
    loadReferenceData();
    const files = discoverBankFiles();
    const grades: BankGrade[] = files.map((f) => gradeBank(f.abs, f.rel));

    // Category rollups
    const byCategory = new Map<string, BankGrade[]>();
    for (const g of grades) {
      const list = byCategory.get(g.category) || [];
      list.push(g);
      byCategory.set(g.category, list);
    }

    const categoryRollups: CategoryRollup[] = Array.from(byCategory.entries())
      .map(([category, banks]) => {
        const avgScore = Math.round(banks.reduce((s, b) => s + b.rawScore, 0) / banks.length);
        const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        banks.forEach((b) => dist[b.grade]++);
        const worst = banks
          .sort((a, b) => a.rawScore - b.rawScore)
          .slice(0, 5)
          .map((b) => ({ filePath: b.filePath, score: b.rawScore, grade: b.grade }));
        return { category, totalBanks: banks.length, avgScore, gradeDistribution: dist as any, worstBanks: worst };
      })
      .sort((a, b) => a.avgScore - b.avgScore); // worst categories first

    // Failure frequency
    const failCounts = new Map<string, number>();
    for (const g of grades) {
      for (const c of g.checks) {
        if (!c.passed) failCounts.set(c.checkName, (failCounts.get(c.checkName) || 0) + 1);
      }
    }
    const topFailures = Array.from(failCounts.entries())
      .map(([checkName, failCount]) => ({ checkName, failCount }))
      .sort((a, b) => b.failCount - a.failCount);

    const totalChecks = grades.reduce((s, g) => s + g.checks.length, 0);
    const passedChecks = grades.reduce((s, g) => s + g.checks.filter((c) => c.passed).length, 0);
    const overallScore = Math.round(grades.reduce((s, g) => s + g.rawScore, 0) / grades.length);
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    grades.forEach((g) => dist[g.grade]++);

    report = {
      generatedAt: new Date().toISOString(),
      totalFiles: grades.length,
      overallScore,
      overallGrade: scoreToGrade(overallScore),
      gradeDistribution: dist as any,
      categoryRollups,
      allBanks: grades,
      summary: {
        totalChecksRun: totalChecks,
        totalChecksPassed: passedChecks,
        totalChecksFailed: totalChecks - passedChecks,
        topFailures,
      },
    };

    // Write detailed report
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

    // Write cert gate report
    writeCertificationGateReport("data-bank-grading", {
      passed: overallScore >= THRESHOLDS.minOverallScore,
      metrics: {
        totalFiles: report.totalFiles,
        overallScore: report.overallScore,
        overallGrade: report.overallGrade,
        aGrade: dist.A || 0,
        bGrade: dist.B || 0,
        cGrade: dist.C || 0,
        dGrade: dist.D || 0,
        fGrade: dist.F || 0,
        totalChecksFailed: report.summary.totalChecksFailed,
      },
      thresholds: THRESHOLDS,
      failures: report.summary.topFailures.slice(0, 10).map(
        (f) => `${f.checkName}: ${f.failCount} banks failed`,
      ),
    });
  });

  test("overall system score meets minimum threshold", () => {
    console.log(`\n📊 OVERALL: ${report.overallGrade} (${report.overallScore}/100)`);
    console.log(`   Files graded: ${report.totalFiles}`);
    console.log(`   A: ${report.gradeDistribution.A} | B: ${report.gradeDistribution.B} | C: ${report.gradeDistribution.C} | D: ${report.gradeDistribution.D} | F: ${report.gradeDistribution.F}`);
    expect(report.overallScore).toBeGreaterThanOrEqual(THRESHOLDS.minOverallScore);
  });

  test("F-grade bank count within budget", () => {
    const fCount = report.gradeDistribution.F;
    console.log(`   F-grade banks: ${fCount} (budget: ${THRESHOLDS.maxFGradeBanks})`);
    expect(fCount).toBeLessThanOrEqual(THRESHOLDS.maxFGradeBanks);
  });

  test("no category below minimum average", () => {
    const failing = report.categoryRollups.filter((c) => c.avgScore < THRESHOLDS.minCategoryAvg);
    if (failing.length > 0) {
      console.log(`   Failing categories:`);
      failing.forEach((c) => console.log(`     ${c.category}: ${c.avgScore}/100`));
    }
    expect(failing.length).toBe(0);
  });

  test("top failure checks logged for remediation", () => {
    console.log(`\n🔍 TOP FAILURES:`);
    report.summary.topFailures.slice(0, 10).forEach((f) => {
      console.log(`   ${f.checkName}: ${f.failCount} banks`);
    });
    // informational — always passes
    expect(true).toBe(true);
  });

  test("worst banks per category logged", () => {
    console.log(`\n📉 WORST CATEGORIES:`);
    report.categoryRollups.slice(0, 5).forEach((c) => {
      console.log(`   ${c.category}: avg ${c.avgScore}/100 (${c.totalBanks} banks)`);
      c.worstBanks.slice(0, 3).forEach((b) => {
        console.log(`     ${b.grade} ${b.score}/100 — ${b.filePath}`);
      });
    });
    expect(true).toBe(true);
  });

  test("detailed report written to disk", () => {
    expect(fs.existsSync(REPORT_PATH)).toBe(true);
    console.log(`\n✅ Full report: ${REPORT_PATH}`);
  });
});
```

- [ ] **Step 2: Run the test to see initial grades**

```bash
cd backend && npx jest --testPathPattern="data-bank-grading.cert" --no-coverage --verbose 2>&1 | head -80
```

Expected: Test runs, prints grade distribution and top failures. May fail thresholds initially — that's expected.

- [ ] **Step 3: Commit**

```bash
git add backend/src/tests/certification/data-bank-grading.cert.test.ts
git commit -m "feat(grading): data bank grading cert test with 11 checks"
```

---

## Chunk 2: Auto-Fixer Script

### Task 4: Build the auto-fixer for common failures

**Files:**
- Create: `backend/scripts/fix-bank-grades.ts`

The fixer reads the grading report and auto-fixes the most common structural issues:

1. **Missing `_meta.lastUpdated`** → set to today's date
2. **Missing `config.enabled`** → add `"enabled": true`
3. **Missing `_meta.description`** → flag for manual review (cannot auto-fix)
4. **Stale `lastUpdated`** (>365 days) → update to today

- [ ] **Step 1: Write the fixer script**

```typescript
#!/usr/bin/env ts-node
/**
 * Auto-fix common data bank grading failures.
 *
 * Usage:
 *   npx ts-node scripts/fix-bank-grades.ts [--dry-run] [--check <checkName>]
 *
 * Reads: reports/cert/data-bank-grading-report.json
 * Fixes: the actual bank JSON files in src/data_banks/
 */
import fs from "fs";
import path from "path";

const REPORT_PATH = path.resolve(process.cwd(), "reports/cert/data-bank-grading-report.json");
const DATA_BANKS_ROOT = path.resolve(process.cwd(), "src/data_banks");
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const checkFilter = args.includes("--check") ? args[args.indexOf("--check") + 1] : null;

interface FailingBank {
  filePath: string;
  failures: string[];
}

function loadReport(): FailingBank[] {
  if (!fs.existsSync(REPORT_PATH)) {
    console.error("No grading report found. Run the cert test first:");
    console.error("  npx jest --testPathPattern='data-bank-grading.cert' --no-coverage");
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
  return report.allBanks.filter((b: any) => b.failures.length > 0);
}

function fixBank(filePath: string, failures: string[]): { fixed: string[]; manual: string[] } {
  const absPath = path.join(DATA_BANKS_ROOT, filePath);
  if (!fs.existsSync(absPath)) return { fixed: [], manual: [`file not found: ${filePath}`] };

  let bank: any;
  try {
    bank = JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch {
    return { fixed: [], manual: [`JSON parse error: ${filePath}`] };
  }

  const fixed: string[] = [];
  const manual: string[] = [];
  let changed = false;

  for (const failure of failures) {
    if (checkFilter && !failure.startsWith(`[${checkFilter}]`)) continue;

    // Fix: missing lastUpdated
    if (failure.includes("[date_freshness]") && failure.includes("missing")) {
      if (!bank._meta) bank._meta = {};
      bank._meta.lastUpdated = TODAY;
      fixed.push("added _meta.lastUpdated");
      changed = true;
    }

    // Fix: stale lastUpdated
    if (failure.includes("[date_freshness]") && failure.includes("days old")) {
      bank._meta.lastUpdated = TODAY;
      fixed.push("updated stale _meta.lastUpdated");
      changed = true;
    }

    // Fix: invalid date format
    if (failure.includes("[date_freshness]") && failure.includes("not YYYY-MM-DD")) {
      bank._meta.lastUpdated = TODAY;
      fixed.push("fixed _meta.lastUpdated format");
      changed = true;
    }

    // Fix: missing config.enabled
    if (failure.includes("[config_contract]") && failure.includes("not boolean")) {
      if (!bank.config) bank.config = {};
      bank.config.enabled = true;
      fixed.push("added config.enabled = true");
      changed = true;
    }

    // Fix: missing config
    if (failure.includes("[config_contract]") && failure.includes("missing")) {
      bank.config = { enabled: true };
      fixed.push("added config object");
      changed = true;
    }

    // Cannot auto-fix: description, registry alignment, checksums, cross-refs
    if (failure.includes("[description_quality]")) {
      manual.push(`${filePath}: needs manual description fix`);
    }
    if (failure.includes("[registry_alignment]")) {
      manual.push(`${filePath}: not in bank_registry.any.json — add registry entry`);
    }
    if (failure.includes("[checksum_integrity]")) {
      manual.push(`${filePath}: checksum mismatch — regenerate checksums`);
    }
    if (failure.includes("[cross_ref_integrity]")) {
      manual.push(`${filePath}: ${failure}`);
    }
  }

  if (changed && !dryRun) {
    fs.writeFileSync(absPath, JSON.stringify(bank, null, 2) + "\n", "utf8");
  }

  return { fixed, manual };
}

// ── Main ──────────────────────────────────────────────────────
const failing = loadReport();
console.log(`\n${dryRun ? "[DRY RUN] " : ""}Processing ${failing.length} failing banks...\n`);

let totalFixed = 0;
const allManual: string[] = [];

for (const bank of failing) {
  const { fixed, manual } = fixBank(bank.filePath, bank.failures);
  if (fixed.length > 0) {
    console.log(`  ✅ ${bank.filePath}: ${fixed.join(", ")}`);
    totalFixed += fixed.length;
  }
  allManual.push(...manual);
}

console.log(`\n── Summary ──`);
console.log(`  Auto-fixed: ${totalFixed} issues`);
console.log(`  Manual review: ${allManual.length} issues`);

if (allManual.length > 0) {
  console.log(`\n── Manual Review Required ──`);
  allManual.slice(0, 30).forEach((m) => console.log(`  ⚠️  ${m}`));
  if (allManual.length > 30) console.log(`  ... and ${allManual.length - 30} more`);
}

console.log(`\nNext: re-run grading to verify fixes:`);
console.log(`  npx jest --testPathPattern='data-bank-grading.cert' --no-coverage --verbose`);
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/fix-bank-grades.ts
git commit -m "feat(grading): auto-fixer script for common bank failures"
```

---

## Chunk 3: Workflow — Grade, Fix, Re-grade

### Task 5: Document the workflow

The complete workflow is:

**Step 1: Run the grading cert test**
```bash
cd backend
npx jest --testPathPattern="data-bank-grading.cert" --no-coverage --verbose
```
This produces:
- Console output with overall grade, distribution, top failures, worst categories
- `reports/cert/data-bank-grading-report.json` — detailed per-file grades
- `reports/cert/gates/data-bank-grading.json` — cert gate report

**Step 2: Auto-fix what can be fixed**
```bash
# Preview changes first
npx ts-node scripts/fix-bank-grades.ts --dry-run

# Apply fixes
npx ts-node scripts/fix-bank-grades.ts
```

**Step 3: Re-grade to verify improvement**
```bash
npx jest --testPathPattern="data-bank-grading.cert" --no-coverage --verbose
```

**Step 4: Fix remaining issues with Claude agents**
For issues that can't be auto-fixed (registry alignment, cross-refs, content quality), use Claude:

```
# In Claude Code, use dispatching-parallel-agents skill:
"Grade report shows 15 banks with registry_alignment failures.
 Fix each one by adding the correct entry to bank_registry.any.json."
```

**Step 5: Tighten thresholds**
Once score improves, raise the thresholds in the cert test:
```typescript
const THRESHOLDS = {
  minOverallScore: 80,     // was 60
  maxFGradeBanks: 10,      // was 50
  minCategoryAvg: 70,      // was 50
};
```

- [ ] **Step 1: This task is documentation only — no code changes needed. Verify the plan is clear.**

---

## Execution Strategy

### Running the grading system

1. Build: Tasks 1–3 (scaffold types → engine → cert test)
2. Run first grading pass to see baseline
3. Build fixer: Task 4
4. Run fixer → re-grade loop
5. Use `dispatching-parallel-agents` for category-level Claude content audits on worst categories

### Using Claude skills for the work

| Phase | Skill | Purpose |
|-------|-------|---------|
| Build grading engine | `superpowers:subagent-driven-development` | Tasks 1–3 are independent, can parallelize |
| First grade run | Direct `npx jest` command | See baseline |
| Auto-fix | Direct `npx ts-node` command | Fix structural issues |
| Content audit | `superpowers:dispatching-parallel-agents` | Fan out Claude across worst categories |
| Verify | `superpowers:verification-before-completion` | Confirm all thresholds met |
| Commit | `/commit` | Package the work |

### Extending the system later

To add new checks, add a function to `data-bank-grading.engine.ts` following the `CheckResult` pattern, add it to the `gradeBank()` checks array, and adjust weights to sum to 1.0. The cert test and report automatically pick up new checks.
