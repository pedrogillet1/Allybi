import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const policyCore = require("../../scripts/prisma/policy-core.cjs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const replayCore = require("../../scripts/prisma/replay-core.cjs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const verifyRlsCore = require("../../scripts/prisma/verify-rls-core.cjs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const telemetryAuditCore = require("../../scripts/prisma/telemetry-audit-core.cjs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const schemaTableManifest = require("../../scripts/prisma/schema-table-manifest.cjs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrationSafetyCore = require("../../scripts/prisma/migration-safety-core.cjs");

function withTempDir(testBody: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "prisma-policy-"));
  try {
    testBody(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("Prisma CI policy/replay script behavior", () => {
  test("policy check fails when workflow directly uses prisma db push", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  test:
    steps:
      - run: npx prisma db push --accept-data-loss
`,
      );
      writeFileSync(join(root, "package.json"), '{"scripts":{}}');

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("Forbidden Prisma CI patterns");
    });
  });

  test("policy check fails when workflow directly uses prisma migrate reset", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  test:
    steps:
      - run: npx prisma migrate reset --force
`,
      );
      writeFileSync(join(root, "package.json"), '{"scripts":{}}');

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("prisma migrate reset");
    });
  });

  test("policy check fails when workflow invokes forbidden package script", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: npm run danger:push
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "danger:push": "npx prisma db push --accept-data-loss",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("package.json#scripts.danger:push");
    });
  });

  test("policy check fails for yarn-run indirection", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: yarn run danger:push
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "danger:push": "npx prisma db push --accept-data-loss",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("package.json#scripts.danger:push");
    });
  });

  test("policy check fails for npm --prefix run indirection", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: npm --prefix backend run danger:push
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "danger:push": "npx prisma db push --accept-data-loss",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("package.json#scripts.danger:push");
    });
  });

  test("policy check fails when referenced script runs prisma migrate dev", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: npm run danger:migrate-dev
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "danger:migrate-dev": "npx prisma migrate dev --name ci_drift",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("prisma migrate dev");
    });
  });

  test("policy check allows forbidden command in non-referenced script", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: npm run safe:check
`,
      );
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "safe:check": "echo ok",
              "danger:push": "npx prisma db push --accept-data-loss",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).not.toThrow();
    });
  });

  test("policy check fails when workflow calls forbidden shell script", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      const scriptsDir = join(root, "scripts");
      mkdirSync(workflowsDir, { recursive: true });
      mkdirSync(scriptsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: bash scripts/danger.sh
`,
      );
      writeFileSync(
        join(scriptsDir, "danger.sh"),
        "npx prisma db execute --stdin < migration.sql\n",
      );
      writeFileSync(join(root, "package.json"), '{"scripts":{}}');

      expect(() =>
        policyCore.assertNoCiDbPush(workflowsDir, join(root, "package.json")),
      ).toThrow("scripts/danger.sh");
    });
  });

  test("policy check fails when referenced npm script calls forbidden shell script", () => {
    withTempDir((root) => {
      const workflowsDir = join(root, ".github", "workflows");
      const backendDir = join(root, "backend");
      const scriptsDir = join(root, "backend", "scripts");
      mkdirSync(workflowsDir, { recursive: true });
      mkdirSync(backendDir, { recursive: true });
      mkdirSync(scriptsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "ci.yml"),
        `name: CI
jobs:
  replay:
    steps:
      - run: npm run danger:shell
`,
      );
      writeFileSync(
        join(scriptsDir, "danger.sh"),
        "npx prisma migrate dev --name bad_idea\n",
      );
      writeFileSync(
        join(root, "backend", "package.json"),
        JSON.stringify(
          {
            scripts: {
              "danger:shell": "bash scripts/danger.sh",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        policyCore.assertNoCiDbPush(
          workflowsDir,
          join(root, "backend", "package.json"),
        ),
      ).toThrow("scripts/danger.sh");
    });
  });

  test("replay preflight rejects placeholder DATABASE_URL", () => {
    expect(() =>
      replayCore.assertReplayEnv({
        DATABASE_URL:
          "postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public",
      }),
    ).toThrow("invalid DATABASE_URL");
  });

  test("replay preflight rejects placeholder DIRECT_DATABASE_URL", () => {
    expect(() =>
      replayCore.assertReplayEnv({
        DATABASE_URL:
          "postgresql://prisma:prisma@localhost:5432/prisma_ci?schema=public",
        DIRECT_DATABASE_URL:
          "postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public",
      }),
    ).toThrow("invalid DIRECT_DATABASE_URL");
  });

  test("replay preflight accepts valid URLs", () => {
    expect(() =>
      replayCore.assertReplayEnv({
        DATABASE_URL:
          "postgresql://prisma:prisma@localhost:5432/prisma_ci?schema=public",
        DIRECT_DATABASE_URL:
          "postgresql://prisma:prisma@localhost:5432/prisma_ci?schema=public",
      }),
    ).not.toThrow();
  });

  test("verify-rls core resolves profile from NODE_ENV in auto mode", () => {
    expect(verifyRlsCore.resolveProfile({ NODE_ENV: "production" })).toBe("prod");
    expect(verifyRlsCore.resolveProfile({ NODE_ENV: "development" })).toBe("dev");
  });

  test("verify-rls core accepts explicit profile and rejects invalid profile", () => {
    expect(verifyRlsCore.resolveProfile({ PRISMA_RLS_PROFILE: "ci" })).toBe("ci");
    expect(() =>
      verifyRlsCore.resolveProfile({ PRISMA_RLS_PROFILE: "invalid_profile" }),
    ).toThrow("unsupported PRISMA_RLS_PROFILE");
  });

  test("verify-rls core resolves strictness by profile with explicit override", () => {
    expect(verifyRlsCore.resolveRequireServiceRole("prod", {})).toBe(true);
    expect(verifyRlsCore.resolveRequireServiceRole("ci", {})).toBe(false);
    expect(
      verifyRlsCore.resolveRequireServiceRole("prod", {
        PRISMA_RLS_REQUIRE_SERVICE_ROLE: "0",
      }),
    ).toBe(false);
    expect(() =>
      verifyRlsCore.resolveRequireServiceRole("prod", {
        PRISMA_RLS_REQUIRE_SERVICE_ROLE: "maybe",
      }),
    ).toThrow("invalid PRISMA_RLS_REQUIRE_SERVICE_ROLE");
  });

  test("telemetry audit core computes ambiguity summary", () => {
    const audits = [
      { table: "retrieval_events", exactOneRows: 5 },
      { table: "query_telemetry", exactOneRows: 7 },
      { table: "missing", status: "missing_table" },
    ];
    expect(telemetryAuditCore.calculateAmbiguousRows(audits)).toBe(12);
  });

  test("telemetry audit core checks required migration coverage", () => {
    const required = ["a", "b"];
    const history = {
      a: { applied: true },
      b: { applied: false },
    };
    expect(telemetryAuditCore.allRepairMigrationsApplied(required, history)).toBe(
      false,
    );
    history.b.applied = true;
    expect(telemetryAuditCore.allRepairMigrationsApplied(required, history)).toBe(
      true,
    );
  });

  test("schema table manifest parser respects @@map and model defaults", () => {
    const parsed = schemaTableManifest.parseSchemaMappedTables(`
model User {
  id String @id
  @@map("users")
}

model Session {
  id String @id
}
`);
    expect(parsed).toEqual(["Session", "users"]);
  });

  test("migration safety parser normalizes migration timestamps", () => {
    expect(migrationSafetyCore.parseMigrationTimestamp("20260307001000_name")).toBe(
      "20260307001000",
    );
    expect(migrationSafetyCore.parseMigrationTimestamp("20260307_name")).toBe(
      "20260307000000",
    );
    expect(migrationSafetyCore.parseMigrationTimestamp("invalid_name")).toBeNull();
  });

  test("migration safety scan flags sqlite and destructive SQL beyond baseline", () => {
    withTempDir((root) => {
      const migrationsDir = join(root, "prisma", "migrations");
      const scriptsDir = join(root, "scripts", "prisma");
      mkdirSync(join(migrationsDir, "20260307001000_safe"), { recursive: true });
      mkdirSync(join(migrationsDir, "20260308000000_bad_sqlite"), {
        recursive: true,
      });
      mkdirSync(join(migrationsDir, "20260309000000_bad_destructive"), {
        recursive: true,
      });
      mkdirSync(scriptsDir, { recursive: true });

      writeFileSync(
        join(migrationsDir, "20260307001000_safe", "migration.sql"),
        `CREATE TABLE "safe_table" ("id" TEXT PRIMARY KEY);`,
      );
      writeFileSync(
        join(migrationsDir, "20260308000000_bad_sqlite", "migration.sql"),
        `PRAGMA foreign_keys=OFF;`,
      );
      writeFileSync(
        join(migrationsDir, "20260309000000_bad_destructive", "migration.sql"),
        `DROP TABLE "users";`,
      );
      writeFileSync(
        join(scriptsDir, "migration-safety-waivers.json"),
        JSON.stringify(
          {
            baselineMigrationTimestamp: "20260307001000",
            allowDestructiveMigrations: [],
            allowSqliteTokenMigrations: [],
          },
          null,
          2,
        ),
      );

      const report = migrationSafetyCore.scanMigrationSafety({
        migrationsDir,
        waiverConfigPath: join(scriptsDir, "migration-safety-waivers.json"),
      });

      expect(report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            migration: "20260308000000_bad_sqlite",
            type: "sqlite_tokens",
          }),
          expect.objectContaining({
            migration: "20260309000000_bad_destructive",
            type: "destructive_sql",
          }),
        ]),
      );
    });
  });
});
