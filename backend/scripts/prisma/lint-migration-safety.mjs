#!/usr/bin/env node

import { join } from "node:path";
import migrationSafetyCore from "./migration-safety-core.cjs";

const { scanMigrationSafety } = migrationSafetyCore;

function readArgValue(flag) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) return null;
  const value = String(argv[index + 1] || "").trim();
  return value || null;
}

function main() {
  const root = process.cwd();
  const migrationsDir = join(root, "prisma", "migrations");
  const waiverConfigPath = join(root, "scripts", "prisma", "migration-safety-waivers.json");
  const overrideBaseline =
    readArgValue("--since") ||
    String(process.env.PRISMA_MIGRATION_SAFETY_BASELINE || "").trim();

  const report = scanMigrationSafety({
    migrationsDir,
    waiverConfigPath,
    overrideBaseline,
  });

  if (report.issues.length > 0) {
    const lines = [
      `[prisma:migrations:lint] failed (${report.issues.length} issues)`,
      `baseline=${report.baseline}`,
      ...report.issues.map(
        (issue) => ` - ${issue.migration} [${issue.type}] ${issue.message}`,
      ),
      "Add an explicit waiver in scripts/prisma/migration-safety-waivers.json only when justified.",
    ];
    throw new Error(lines.join("\n"));
  }

  console.log(
    `[prisma:migrations:lint] OK (baseline=${report.baseline}, scanned=${report.scanned.length})`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
