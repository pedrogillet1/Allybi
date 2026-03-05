#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import telemetryAuditCore from "./telemetry-audit-core.cjs";

const REQUIRED_HISTORY = [
  "20260205_fix_evidence_strength",
  "20260305113000_fix_telemetry_table_name_drift",
  "20260306120000_compensate_double_telemetry_scaling",
];

const SCORE_TABLES = [
  { table: "retrieval_events", scoreColumn: "evidenceStrength" },
  { table: "RetrievalEvent", scoreColumn: "evidenceStrength" },
  { table: "query_telemetry", scoreColumn: "topRelevanceScore" },
  { table: "QueryTelemetry", scoreColumn: "topRelevanceScore" },
];

const { parseBool, calculateAmbiguousRows, allRepairMigrationsApplied } =
  telemetryAuditCore;

function resolveOutputPath() {
  const raw = String(process.env.PRISMA_TELEMETRY_AUDIT_OUT || "").trim();
  if (!raw) return null;
  return resolve(raw);
}

async function loadMigrationHistory(client) {
  const rows = await client.query(
    `
    SELECT migration_name, finished_at
    FROM "_prisma_migrations"
    WHERE migration_name = ANY($1::text[])
    `,
    [REQUIRED_HISTORY],
  );
  const history = {};
  for (const name of REQUIRED_HISTORY) {
    const match = (rows.rows || []).find((row) => row.migration_name === name);
    history[name] = {
      applied: Boolean(match?.finished_at),
      finishedAt: match?.finished_at ? new Date(match.finished_at).toISOString() : null,
    };
  }
  return history;
}

async function loadExistingTables(client) {
  const rows = await client.query(
    `
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    `,
  );
  return new Set((rows.rows || []).map((row) => String(row.tablename || "")));
}

async function auditScoreTable(client, table, scoreColumn) {
  const sql = `
    SELECT
      COUNT(*)::bigint AS total_rows,
      COUNT(*) FILTER (WHERE "${scoreColumn}" IS NOT NULL)::bigint AS non_null_rows,
      COUNT(*) FILTER (
        WHERE "${scoreColumn}" IS NOT NULL
          AND "${scoreColumn}" > 0
          AND "${scoreColumn}" < 0.5
      )::bigint AS reversible_window_rows,
      COUNT(*) FILTER (WHERE "${scoreColumn}" = 1.0)::bigint AS exact_one_rows,
      COUNT(*) FILTER (
        WHERE "${scoreColumn}" IS NOT NULL
          AND "${scoreColumn}" >= 0.5
          AND "${scoreColumn}" < 1.0
      )::bigint AS high_band_rows
    FROM "${table}"
  `;
  const res = await client.query(sql);
  const row = res.rows?.[0] || {};
  return {
    table,
    scoreColumn,
    totalRows: Number(row.total_rows || 0),
    nonNullRows: Number(row.non_null_rows || 0),
    reversibleWindowRows: Number(row.reversible_window_rows || 0),
    exactOneRows: Number(row.exact_one_rows || 0),
    highBandRows: Number(row.high_band_rows || 0),
    ambiguity: {
      exactOneRowsMayContainClampedValues: Number(row.exact_one_rows || 0),
      note:
        "Rows at exactly 1.0 are not fully reversible after duplicate scaling; review with business context.",
    },
  };
}

async function main() {
  const dbUrl = String(process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error("[prisma:telemetry:audit] DATABASE_URL is required.");
  }

  const failOnAmbiguous = parseBool(
    process.env.PRISMA_TELEMETRY_AUDIT_FAIL_ON_AMBIGUOUS,
    false,
  );

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const history = await loadMigrationHistory(client);
    const existingTables = await loadExistingTables(client);
    const tableAudits = [];

    for (const spec of SCORE_TABLES) {
      if (!existingTables.has(spec.table)) {
        tableAudits.push({
          table: spec.table,
          scoreColumn: spec.scoreColumn,
          status: "missing_table",
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const audit = await auditScoreTable(client, spec.table, spec.scoreColumn);
      tableAudits.push({ ...audit, status: "ok" });
    }

    const ambiguousRows = calculateAmbiguousRows(tableAudits);

    const report = {
      generatedAt: new Date().toISOString(),
      migrationHistory: history,
      summary: {
        ambiguousRows,
        failOnAmbiguous,
        allRepairMigrationsApplied: allRepairMigrationsApplied(
          REQUIRED_HISTORY,
          history,
        ),
      },
      tableAudits,
      remediationHint:
        "If ambiguousRows > 0, review exact-one cohorts before enforcing strict score guarantees.",
    };

    const outputPath = resolveOutputPath();
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(`[prisma:telemetry:audit] wrote report: ${outputPath}`);
    }

    console.log(JSON.stringify(report, null, 2));

    if (failOnAmbiguous && ambiguousRows > 0) {
      throw new Error(
        `[prisma:telemetry:audit] ambiguousRows=${ambiguousRows} (> 0)`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
