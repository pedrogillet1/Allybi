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

run("prisma", ["validate"]);
run("prisma", ["migrate", "deploy"]);
run("prisma", ["migrate", "status"]);
