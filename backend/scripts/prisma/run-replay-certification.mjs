#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..", "..");

function nowIso() {
  return new Date().toISOString();
}

function runNpmScript(scriptName, extraEnv = {}) {
  const startedAt = Date.now();
  const npmExecPath = String(process.env.npm_execpath || "").trim();
  const command = npmExecPath
    ? process.execPath
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  const args = npmExecPath ? [npmExecPath, "run", scriptName] : ["run", scriptName];
  const result = spawnSync(command, args, {
    cwd: backendRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    shell: false,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    console.error(
      `[prisma:replay:cert] spawn error (${scriptName}): ${String(result.error.message || result.error)}`,
    );
  }

  return {
    script: scriptName,
    exitCode: result.error ? 1 : result.status ?? 1,
    spawnError: result.error ? String(result.error.message || result.error) : null,
    durationMs: Date.now() - startedAt,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: nowIso(),
  };
}

async function loadMigrationLedger(dbUrl) {
  if (!dbUrl) return { available: false, reason: "DATABASE_URL missing" };
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM "_prisma_migrations"`,
    );
    const latestRes = await client.query(
      `SELECT migration_name, finished_at
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 10`,
    );
    return {
      available: true,
      totalApplied: Number(countRes.rows?.[0]?.total || 0),
      latestApplied: (latestRes.rows || []).map((row) => ({
        migrationName: String(row.migration_name || ""),
        finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
      })),
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const telemetryOut =
    String(process.env.PRISMA_TELEMETRY_AUDIT_OUT || "").trim() ||
    "reports/prisma/telemetry-audit-ci.json";
  const certOut =
    String(process.env.PRISMA_REPLAY_CERT_OUT || "").trim() ||
    "reports/prisma/replay-cert.json";
  const reportPath = resolve(backendRoot, certOut);

  const steps = [];
  const runStep = (scriptName, extraEnv = {}) => {
    const result = runNpmScript(scriptName, extraEnv);
    steps.push(result);
    if (result.exitCode !== 0) {
      throw new Error(
        `[prisma:replay:cert] step failed: ${scriptName} (exit=${result.exitCode})`,
      );
    }
  };

  let failed = false;
  let failureMessage = null;
  try {
    runStep("prisma:deps:check");
    runStep("prisma:ci:policy:check");
    runStep("prisma:migrations:lint");
    runStep("prisma:generate");
    runStep("prisma:rls:seed-service-role");
    runStep("prisma:replay:check");
    runStep("prisma:behavioral:cert");
    runStep("prisma:rls:verify", { PRISMA_RLS_PROFILE: "ci" });
    runStep("prisma:telemetry:repair:audit", {
      PRISMA_TELEMETRY_AUDIT_FAIL_ON_AMBIGUOUS: "1",
      PRISMA_TELEMETRY_AUDIT_OUT: telemetryOut,
    });
    runStep("prisma:rls:verify", { PRISMA_RLS_PROFILE: "prod" });
    runStep("test:prisma:invariants");
  } catch (error) {
    failed = true;
    failureMessage = error instanceof Error ? error.message : String(error);
  }

  const ledger = await loadMigrationLedger(String(process.env.DATABASE_URL || "").trim()).catch(
    (error) => ({
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    }),
  );

  const report = {
    generatedAt: nowIso(),
    passed: !failed,
    failureMessage,
    outputs: {
      replayCertOut: certOut,
      telemetryOut,
    },
    steps,
    migrationLedger: ledger,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[prisma:replay:cert] wrote report: ${reportPath}`);

  if (failed) process.exit(1);
  console.log("[prisma:replay:cert] OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
