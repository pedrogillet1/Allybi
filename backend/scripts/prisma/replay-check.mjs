#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import replayCore from "./replay-core.cjs";

export const { run, isPlaceholderDatabaseUrl, assertReplayEnv } = replayCore;

export function main(argv = process.argv.slice(2)) {
  try {
    assertReplayEnv();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (argv.includes("--check-only")) {
    console.log("[prisma:replay:check] env preflight OK");
    return;
  }
  run("prisma", ["validate"]);
  run("prisma", ["migrate", "deploy"]);
  run("prisma", ["migrate", "status"]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
