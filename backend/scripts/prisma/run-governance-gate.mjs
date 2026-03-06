#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const argSet = new Set(argv);

function has(flag) {
  return argSet.has(flag);
}

function readArgValue(flag, fallback = null) {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) return fallback;
  const value = String(argv[index + 1] || "").trim();
  return value || fallback;
}

function runCommand(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpmScript(scriptName, extraEnv = {}) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  runCommand(npmCommand, ["run", scriptName], extraEnv);
}

function resolvePhase() {
  const phase = readArgValue("--phase", "full");
  const allowed = new Set(["full", "pre-migrate", "post-migrate"]);
  if (!allowed.has(phase)) {
    throw new Error(
      `[prisma:governance:gate] invalid --phase="${phase}". Supported phases: full, pre-migrate, post-migrate`,
    );
  }
  return phase;
}

function main() {
  const phase = resolvePhase();
  const telemetryOut =
    readArgValue("--telemetry-out") ||
    String(process.env.PRISMA_TELEMETRY_AUDIT_OUT || "").trim() ||
    "reports/prisma/telemetry-audit-ci.json";
  const failOnAmbiguous = has("--allow-ambiguous")
    ? "0"
    : String(process.env.PRISMA_TELEMETRY_AUDIT_FAIL_ON_AMBIGUOUS || "1");
  const includePre = phase === "full" || phase === "pre-migrate";
  const includePost = phase === "full" || phase === "post-migrate";

  if (includePre) {
    if (!has("--skip-deps")) runNpmScript("prisma:deps:check");
    if (!has("--skip-hygiene")) runNpmScript("prisma:hygiene:check");
    if (!has("--skip-migration-lint")) runNpmScript("prisma:migrations:lint");
    if (!has("--skip-policy")) runNpmScript("prisma:ci:policy:check");
    if (!has("--skip-replay-preflight")) {
      runCommand("node", ["scripts/prisma/replay-check.mjs", "--check-only"]);
    }
    if (!has("--skip-seed")) runNpmScript("prisma:rls:seed-service-role");
  }

  if (includePost) {
    if (!has("--skip-ci-rls")) {
      runNpmScript("prisma:rls:verify", { PRISMA_RLS_PROFILE: "ci" });
    }
    if (!has("--skip-telemetry")) {
      runNpmScript("prisma:telemetry:repair:audit", {
        PRISMA_TELEMETRY_AUDIT_FAIL_ON_AMBIGUOUS: failOnAmbiguous,
        PRISMA_TELEMETRY_AUDIT_OUT: telemetryOut,
      });
    }
    if (!has("--skip-prod-rls")) {
      runNpmScript("prisma:rls:verify", { PRISMA_RLS_PROFILE: "prod" });
    }
  }

  console.log(`[prisma:governance:gate] OK (phase=${phase})`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
