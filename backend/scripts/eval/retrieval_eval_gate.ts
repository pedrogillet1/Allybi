/* eslint-disable no-console */

import { spawnSync } from "child_process";
import path from "path";

type EvalMode = "mock" | "real_banks";

type GateThresholds = {
  top1Min: number;
  contaminationMax: number;
  precisionAtKMin: number;
  precisionEffectiveMin: number;
  precisionRequestedMin: number;
  rewriteUsefulnessMin: number;
  rewriteTriggeredCasesMin: number;
  rewriteHarmfulCasesMax: number;
  rewriteTriggeredByDomainMin: Record<string, number>;
};

function parseNumberArg(argv: string[], key: string, fallback: number): number {
  const prefix = `--${key}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  const parsed = Number(found.slice(prefix.length).trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for --${key}`);
  }
  return parsed;
}

function parseModeArg(argv: string[]): EvalMode {
  const found = argv.find((arg) => arg.startsWith("--mode="));
  if (!found) return "real_banks";
  const mode = found.slice("--mode=".length).trim().toLowerCase();
  if (mode === "mock" || mode === "real_banks") return mode;
  throw new Error(`Invalid --mode value "${mode}"`);
}

function runEval(mode: EvalMode): Record<string, any> {
  const root = path.resolve(__dirname, "../..");
  const exec = spawnSync(
    "npx",
    ["ts-node", "--transpile-only", "scripts/eval/retrieval_eval.ts", `--mode=${mode}`],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (exec.status !== 0) {
    const stderr = exec.stderr?.trim() || "(no stderr)";
    const stdout = exec.stdout?.trim() || "(no stdout)";
    throw new Error(
      `retrieval_eval failed (status=${String(exec.status)}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  const output = (exec.stdout || "").trim();
  if (!output) throw new Error("retrieval_eval returned empty output.");
  return JSON.parse(output) as Record<string, any>;
}

function assertGate(metrics: Record<string, any>, thresholds: GateThresholds): string[] {
  const failures: string[] = [];
  const top1 = Number(metrics.top1HitRateEstimate || 0);
  const contamination = Number(metrics.topKContaminationRateEstimate || 0);
  const precisionAtK = Number(metrics.precisionAtKEstimate || 0);
  const precisionEffective = Number(metrics.precisionAtKEffectiveEstimate || 0);
  const precisionRequested = Number(metrics.precisionAtKRequestedEstimate || 0);
  const rewriteUsefulness = Number(metrics.rewriteUsefulness?.usefulnessRate || 0);
  const rewriteTriggeredCases = Number(metrics.rewriteUsefulness?.triggeredCases || 0);
  const rewriteHarmfulCases = Number(metrics.rewriteUsefulness?.harmfulCases || 0);
  const rewriteByDomain = Array.isArray(metrics.rewriteByDomain)
    ? metrics.rewriteByDomain
    : [];

  if (top1 < thresholds.top1Min) {
    failures.push(
      `top1HitRateEstimate ${top1.toFixed(4)} < min ${thresholds.top1Min.toFixed(4)}`,
    );
  }
  if (contamination > thresholds.contaminationMax) {
    failures.push(
      `topKContaminationRateEstimate ${contamination.toFixed(4)} > max ${thresholds.contaminationMax.toFixed(4)}`,
    );
  }
  if (precisionAtK < thresholds.precisionAtKMin) {
    failures.push(
      `precisionAtKEstimate ${precisionAtK.toFixed(4)} < min ${thresholds.precisionAtKMin.toFixed(4)}`,
    );
  }
  if (precisionEffective < thresholds.precisionEffectiveMin) {
    failures.push(
      `precisionAtKEffectiveEstimate ${precisionEffective.toFixed(4)} < min ${thresholds.precisionEffectiveMin.toFixed(4)}`,
    );
  }
  if (precisionRequested < thresholds.precisionRequestedMin) {
    failures.push(
      `precisionAtKRequestedEstimate ${precisionRequested.toFixed(4)} < min ${thresholds.precisionRequestedMin.toFixed(4)}`,
    );
  }
  if (rewriteUsefulness < thresholds.rewriteUsefulnessMin) {
    failures.push(
      `rewriteUsefulness.usefulnessRate ${rewriteUsefulness.toFixed(4)} < min ${thresholds.rewriteUsefulnessMin.toFixed(4)}`,
    );
  }
  if (rewriteTriggeredCases < thresholds.rewriteTriggeredCasesMin) {
    failures.push(
      `rewriteUsefulness.triggeredCases ${rewriteTriggeredCases} < min ${thresholds.rewriteTriggeredCasesMin}`,
    );
  }
  if (rewriteHarmfulCases > thresholds.rewriteHarmfulCasesMax) {
    failures.push(
      `rewriteUsefulness.harmfulCases ${rewriteHarmfulCases} > max ${thresholds.rewriteHarmfulCasesMax}`,
    );
  }

  const byDomain = new Map<string, Record<string, any>>();
  for (const row of rewriteByDomain) {
    const domain = String(row?.domain || "").trim().toLowerCase();
    if (!domain) continue;
    byDomain.set(domain, row);
  }
  for (const [domain, minTriggered] of Object.entries(
    thresholds.rewriteTriggeredByDomainMin,
  )) {
    const stats = byDomain.get(domain);
    const queries = Number(stats?.queries || 0);
    if (queries <= 0) continue;
    const triggered = Number(stats?.triggeredCases || 0);
    if (triggered < minTriggered) {
      failures.push(
        `rewriteByDomain.${domain}.triggeredCases ${triggered} < min ${minTriggered} (queries=${queries})`,
      );
    }
  }

  return failures;
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = parseModeArg(argv);

  const thresholds: GateThresholds = {
    top1Min: parseNumberArg(argv, "top1-min", 0.95),
    contaminationMax: parseNumberArg(argv, "contamination-max", 0.05),
    precisionAtKMin: parseNumberArg(argv, "precision-at-k-min", 0.95),
    precisionEffectiveMin: parseNumberArg(argv, "precision-effective-min", 0.9),
    precisionRequestedMin: parseNumberArg(argv, "precision-requested-min", 0.45),
    rewriteUsefulnessMin: parseNumberArg(argv, "rewrite-usefulness-min", 0.1),
    rewriteTriggeredCasesMin: parseNumberArg(argv, "rewrite-triggered-min", 1),
    rewriteHarmfulCasesMax: parseNumberArg(argv, "rewrite-harmful-max", 0),
    rewriteTriggeredByDomainMin: {
      finance: 1,
      legal: 0,
      medical: 0,
      ops: 0,
    },
  };

  const report = runEval(mode);
  const metrics = (report.metrics || {}) as Record<string, any>;
  const failures = assertGate(metrics, thresholds);

  const result = {
    generatedAt: new Date().toISOString(),
    mode,
    thresholds,
    metrics: {
      top1HitRateEstimate: metrics.top1HitRateEstimate,
      topKContaminationRateEstimate: metrics.topKContaminationRateEstimate,
      precisionAtKEstimate: metrics.precisionAtKEstimate,
      precisionAtKEffectiveEstimate: metrics.precisionAtKEffectiveEstimate,
      precisionAtKRequestedEstimate: metrics.precisionAtKRequestedEstimate,
      rewriteUsefulnessRate: metrics.rewriteUsefulness?.usefulnessRate ?? 0,
      rewriteTriggeredCases: metrics.rewriteUsefulness?.triggeredCases ?? 0,
      rewriteUsefulCases: metrics.rewriteUsefulness?.usefulCases ?? 0,
      rewriteHarmfulCases: metrics.rewriteUsefulness?.harmfulCases ?? 0,
      rewriteByDomain: metrics.rewriteByDomain ?? [],
    },
    passed: failures.length === 0,
    failures,
  };

  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error("[retrieval_eval_gate] failed:", error);
  process.exitCode = 1;
});
