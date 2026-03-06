#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..", "..");

function runNodeScript(scriptPath, args = [], extraEnv = {}) {
  const absoluteScript = resolve(backendRoot, scriptPath);
  const result = spawnSync("node", [absoluteScript, ...args], {
    cwd: backendRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    shell: false,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function expectFailure(result, label, needle) {
  if (result.code === 0) {
    throw new Error(`[prisma:behavioral:cert] ${label} expected failure but succeeded.`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (needle && !output.includes(needle)) {
    throw new Error(
      `[prisma:behavioral:cert] ${label} failed with unexpected message. Missing needle: ${needle}`,
    );
  }
}

function expectSuccess(result, label) {
  if (result.code !== 0) {
    throw new Error(`[prisma:behavioral:cert] ${label} failed.`);
  }
}

async function main() {
  const dbUrl = String(process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error("[prisma:behavioral:cert] DATABASE_URL is required.");
  }

  const probeTable = "__prisma_rls_probe";
  const telemetryQueryId = `__behavioral_${Date.now()}`;

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    // Ensure baseline role exists before strict-profile checks.
    expectSuccess(
      runNodeScript("scripts/prisma/seed-service-role.mjs"),
      "seed service_role",
    );

    const missingTableResult = runNodeScript("scripts/prisma/verify-rls.mjs", [], {
      PRISMA_RLS_PROFILE: "prod",
      PRISMA_RLS_TABLES: "__prisma_missing_table",
    });
    expectFailure(
      missingTableResult,
      "missing-table fail-closed check",
      "required tables are missing",
    );

    await client.query(`DROP TABLE IF EXISTS "${probeTable}"`);
    await client.query(`CREATE TABLE "${probeTable}" ("id" TEXT PRIMARY KEY)`);

    const rlsDisabledResult = runNodeScript("scripts/prisma/verify-rls.mjs", [], {
      PRISMA_RLS_PROFILE: "prod",
      PRISMA_RLS_TABLES: probeTable,
    });
    expectFailure(rlsDisabledResult, "RLS disabled check", "rls_not_enabled");

    await client.query(`ALTER TABLE "${probeTable}" ENABLE ROW LEVEL SECURITY`);
    await client.query(`DROP POLICY IF EXISTS "service_role_all" ON "${probeTable}"`);
    await client.query(
      `CREATE POLICY "service_role_all" ON "${probeTable}" FOR ALL TO service_role USING (true) WITH CHECK (true)`,
    );
    await client.query(`ALTER TABLE "${probeTable}" FORCE ROW LEVEL SECURITY`);

    expectSuccess(
      runNodeScript("scripts/prisma/verify-rls.mjs", [], {
        PRISMA_RLS_PROFILE: "prod",
        PRISMA_RLS_TABLES: probeTable,
      }),
      "RLS enabled check",
    );

    const queryTelemetryExists = await client.query(
      `SELECT to_regclass('public.query_telemetry') IS NOT NULL AS present`,
    );
    if (Boolean(queryTelemetryExists.rows?.[0]?.present)) {
      await client.query(
        `INSERT INTO "query_telemetry" ("id", "queryId", "userId", "intent", "intentConfidence", "topRelevanceScore")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `${telemetryQueryId}_id`,
          telemetryQueryId,
          "behavioral_user",
          "behavioral_probe",
          1,
          1,
        ],
      );

      const telemetryFailResult = runNodeScript(
        "scripts/prisma/audit-telemetry-repair.mjs",
        [],
        {
          PRISMA_TELEMETRY_AUDIT_FAIL_ON_AMBIGUOUS: "1",
          PRISMA_TELEMETRY_AUDIT_OUT: "reports/prisma/telemetry-audit-behavioral.json",
        },
      );
      expectFailure(
        telemetryFailResult,
        "telemetry ambiguity strict fail check",
        "ambiguousRows=",
      );
    } else {
      console.log(
        "[prisma:behavioral:cert] query_telemetry missing; telemetry strict-fail probe skipped.",
      );
    }

    console.log("[prisma:behavioral:cert] OK");
  } finally {
    await client.query(`DELETE FROM "query_telemetry" WHERE "queryId" LIKE '__behavioral_%'`).catch(() => {});
    await client.query(`DROP TABLE IF EXISTS "${probeTable}"`).catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
