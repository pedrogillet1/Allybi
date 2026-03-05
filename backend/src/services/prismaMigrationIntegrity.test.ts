import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Prisma migration integrity guards", () => {
  const root = process.cwd();

  test("legacy evidence-strength migration is existence-guarded", () => {
    const sql = readFileSync(
      join(
        root,
        "prisma",
        "migrations",
        "20260205_fix_evidence_strength",
        "migration.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("DO $$");
    expect(sql).toContain("table_name = 'retrieval_events'");
    expect(sql).toContain("table_name = 'query_telemetry'");
    expect(sql).toContain("table_name = 'RetrievalEvent'");
    expect(sql).toContain("table_name = 'QueryTelemetry'");
  });

  test("RLS migrations are gated on service_role presence", () => {
    const allTablesSql = readFileSync(
      join(
        root,
        "prisma",
        "migrations",
        "20260204_enable_rls_all_tables",
        "migration.sql",
      ),
      "utf8",
    );
    const remainingSql = readFileSync(
      join(
        root,
        "prisma",
        "migrations",
        "20260204_enable_rls_remaining",
        "migration.sql",
      ),
      "utf8",
    );

    expect(allTablesSql).toContain("pg_roles WHERE rolname = 'service_role'");
    expect(remainingSql).toContain("pg_roles WHERE rolname = 'service_role'");
  });

  test("dangerous force-sync command requires explicit env gate", () => {
    const script = readFileSync(
      join(root, "scripts", "prisma", "guarded-force-schema-sync.mjs"),
      "utf8",
    );

    expect(script).toContain("ALLOW_DANGEROUS_PRISMA");
    expect(script).toContain("process.exit(1)");
  });
});
