#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function main() {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const sqliteDep =
    pkg?.dependencies?.sqlite3 || pkg?.devDependencies?.sqlite3 || null;
  if (sqliteDep) {
    throw new Error(
      `[prisma:hygiene:check] sqlite3 dependency present (${sqliteDep}). Remove or justify explicitly.`,
    );
  }

  const git = spawnSync("git", ["ls-files", "--", "prisma/*.db", "prisma/test.db"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  const trackedDb = String(git.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (trackedDb.length > 0) {
    throw new Error(
      `[prisma:hygiene:check] tracked DB artifact(s) detected:\n - ${trackedDb.join("\n - ")}`,
    );
  }

  const localDbPath = join(process.cwd(), "prisma", "test.db");
  if (existsSync(localDbPath)) {
    console.warn(
      "[prisma:hygiene:check] warning: local prisma/test.db exists (ignored). Consider deleting stale local artifact.",
    );
  }

  console.log("[prisma:hygiene:check] OK");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
