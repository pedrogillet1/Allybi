#!/usr/bin/env node

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import policyCore from "./policy-core.cjs";

export const {
  forbiddenPatterns,
  runScriptPatterns,
  findForbiddenCiPrismaPatterns,
  assertNoCiDbPush,
} = policyCore;

function main() {
  const workflowsDir =
    process.argv[2] || join(process.cwd(), "..", ".github", "workflows");
  const packageJsonPath = process.argv[3] || join(process.cwd(), "package.json");
  try {
    assertNoCiDbPush(workflowsDir, packageJsonPath);
    console.log("[prisma:ci:policy:check] OK");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
