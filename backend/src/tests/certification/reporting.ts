import fs from "fs";
import path from "path";
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
  return null;
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
  };
  const filePath = path.join(CERT_GATES_DIR, `${gateId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
  return resolved;
}
