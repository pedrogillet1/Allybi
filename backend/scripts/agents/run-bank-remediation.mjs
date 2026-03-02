#!/usr/bin/env node

import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const steps = checkOnly
  ? [
      ["node", "scripts/lint/generate-bank-dependencies.mjs"],
      ["node", "scripts/lint/generate-bank-aliases-self.mjs"],
      ["node", "scripts/lint/generate-bank-checksums.mjs", "--check"],
      ["node", "scripts/lint/verify-manifest-integrity.mjs", "--strict"],
      ["node", "scripts/document-intelligence/verify-docint-wiring.mjs", "--strict"],
    ]
  : [
      ["node", "scripts/lint/generate-bank-checksums.mjs"],
      ["node", "scripts/lint/generate-bank-dependencies.mjs", "--write"],
      ["node", "scripts/lint/generate-bank-aliases-self.mjs", "--write"],
      ["node", "scripts/lint/generate-bank-checksums.mjs"],
      ["node", "scripts/lint/verify-manifest-integrity.mjs", "--strict"],
      ["node", "scripts/document-intelligence/verify-docint-wiring.mjs", "--strict"],
    ];

function runStep(step) {
  const [cmd, ...cmdArgs] = step;
  const pretty = [cmd, ...cmdArgs].join(" ");
  console.log(`[banks:remediate] running: ${pretty}`);
  const out = spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (out.status !== 0) {
    throw new Error(`Step failed (${out.status}): ${pretty}`);
  }
}

function main() {
  for (const step of steps) {
    runStep(step);
  }
  console.log(
    `[banks:remediate] completed (${checkOnly ? "check" : "generate"})`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[banks:remediate] failed: ${String(error?.message || error)}`,
  );
  process.exit(1);
}
