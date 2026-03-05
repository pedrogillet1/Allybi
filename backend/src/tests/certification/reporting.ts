import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import type { CertificationGateReport } from "./types";

const CERT_DIR = path.resolve(process.cwd(), "reports/cert");
const CERT_GATES_DIR = path.join(CERT_DIR, "gates");

function ensureDirs(): void {
  fs.mkdirSync(CERT_GATES_DIR, { recursive: true });
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function resolveGitDir(rootDir: string): string | null {
  const gitPath = path.join(rootDir, ".git");
  if (!fs.existsSync(gitPath)) return null;
  const stat = fs.statSync(gitPath);
  if (stat.isDirectory()) return gitPath;
  const content = readText(gitPath);
  if (!content) return null;
  const match = content.match(/gitdir:\s*(.+)\s*$/i);
  if (!match) return null;
  return path.resolve(rootDir, match[1].trim());
}

function findRepoRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveCommitHash(): string | null {
  const fromEnv = String(process.env.GIT_COMMIT_HASH || "")
    .trim()
    .toLowerCase();
  if (/^[0-9a-f]{40}$/.test(fromEnv)) return fromEnv;

  try {
    const fromCwd = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    if (fromCwd.status === 0) {
      const hash = String(fromCwd.stdout || "").trim().toLowerCase();
      if (/^[0-9a-f]{40}$/.test(hash)) return hash;
    }
  } catch {
    // Continue with file-based fallback below.
  }

  const rootDir = findRepoRoot(process.cwd()) || process.cwd();
  const gitDir = resolveGitDir(rootDir);
  if (!gitDir) return null;

  const headRaw = readText(path.join(gitDir, "HEAD"));
  const head = String(headRaw || "")
    .trim()
    .toLowerCase();
  if (!head) return null;
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  if (!head.startsWith("ref:")) return null;

  const refPath = head.replace(/^ref:\s*/, "").trim();
  if (!refPath) return null;
  const refHash = String(readText(path.join(gitDir, refPath)) || "")
    .trim()
    .toLowerCase();
  if (/^[0-9a-f]{40}$/.test(refHash)) return refHash;

  const packedRefs = readText(path.join(gitDir, "packed-refs"));
  if (!packedRefs) return null;
  for (const line of packedRefs.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || line.startsWith("^")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [hash, ref] = parts;
    if (ref === refPath && /^[0-9a-f]{40}$/i.test(hash)) {
      return hash.toLowerCase();
    }
  }

  // Fallback for workspace layouts where `.git` is not discoverable from cwd.
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    if (result.status === 0) {
      const hash = String(result.stdout || "").trim().toLowerCase();
      if (/^[0-9a-f]{40}$/.test(hash)) return hash;
    }
  } catch {
    // Ignore and return null below.
  }

  return null;
}

function metric01(metrics: CertificationGateReport["metrics"], key: string): number {
  const raw = Number(metrics?.[key]);
  if (!Number.isFinite(raw)) return 0;
  if (raw <= 0) return 0;
  return raw >= 1 ? 1 : raw;
}

function maybeComputeCompositionRubricScore(
  gateId: string,
  metrics: CertificationGateReport["metrics"],
): CertificationGateReport["scoring"] | undefined {
  if (gateId !== "composition-formatting-regressions") return undefined;
  const structure = (
    (metric01(metrics, "openerVariation") +
      metric01(metrics, "noForcedAnalyticalForSimple") +
      metric01(metrics, "paragraphSplitMax2Sentences") +
      metric01(metrics, "jsonDenialMapping")) /
    4
  ) * 20;
  const citations = (
    (metric01(metrics, "citationAlignment") +
      metric01(metrics, "citationMinimality")) /
    2
  ) * 20;
  const tableSafety = (
    (metric01(metrics, "tableNoDashCorruption") +
      metric01(metrics, "tablePreservation") +
      metric01(metrics, "wideTableGracefulDegradation") +
      metric01(metrics, "tableCellCharLimit")) /
    4
  ) * 15;
  const naturalVoice = (
    (metric01(metrics, "openerVariation") +
      metric01(metrics, "openerVarietyAtScale")) /
    2
  ) * 10;
  const followups = (
    (metric01(metrics, "followupNonLooping") +
      metric01(metrics, "followupLocaleMatchQuery")) /
    2
  ) * 10;
  const brevity = (
    (metric01(metrics, "brevityControl") +
      metric01(metrics, "microProfileBudgetEnforcement")) /
    2
  ) * 10;
  const multilingual = (
    (metric01(metrics, "toneParityEnPt") +
      metric01(metrics, "toneParityEs") +
      metric01(metrics, "closerEsLocale")) /
    3
  ) * 10;
  const notFound = (
    (metric01(metrics, "notFoundPrecision") +
      metric01(metrics, "noDocsBannedPhraseEnforcement")) /
    2
  ) * 5;
  const rubric = {
    structure,
    citations,
    tableSafety,
    naturalVoice,
    followups,
    brevity,
    multilingual,
    notFound,
  };
  const rubricScore100 = Math.round(
    Object.values(rubric).reduce((sum, value) => sum + value, 0) * 100,
  ) / 100;
  return {
    rubricScore100,
    rubric,
  };
}

export function writeCertificationGateReport(
  gateId: string,
  report: Omit<CertificationGateReport, "gateId" | "generatedAt">,
): CertificationGateReport {
  ensureDirs();
  const resolved: CertificationGateReport = {
    gateId,
    generatedAt: new Date().toISOString(),
    meta: {
      commitHash: resolveCommitHash(),
      source: process.env.CERT_GATE_SOURCE || "jest",
      lifecycleEvent: process.env.npm_lifecycle_event || "",
    },
    passed: report.passed,
    metrics: report.metrics,
    thresholds: report.thresholds,
    failures: report.failures,
    scoring: maybeComputeCompositionRubricScore(gateId, report.metrics),
  };
  const filePath = path.join(CERT_GATES_DIR, `${gateId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
  return resolved;
}
