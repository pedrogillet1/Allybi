#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.ALLOW_DANGEROUS_PRISMA !== "1") {
  console.error(
    "[danger:verify:schema:force] blocked. Set ALLOW_DANGEROUS_PRISMA=1 to run destructive schema sync.",
  );
  process.exit(1);
}

run("prisma", ["db", "push", "--accept-data-loss"]);
run("prisma", ["generate"]);
console.log("FORCE schema sync completed (data loss risk).");
