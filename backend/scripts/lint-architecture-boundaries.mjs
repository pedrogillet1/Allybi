#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function existingTargets(targets) {
  return targets
    .map((target) => String(target || "").trim())
    .filter(Boolean)
    .map((target) => path.resolve(ROOT, target))
    .filter((abs) => fs.existsSync(abs))
    .map((abs) => path.relative(ROOT, abs).replace(/\\/g, "/"));
}

function buildRipgrepCommand(pattern, targets) {
  const resolvedTargets = existingTargets(targets);
  if (resolvedTargets.length === 0) {
    return null;
  }
  return `rg -n "${pattern}" ${resolvedTargets.join(" ")}`;
}

const checks = [
  {
    name: "routes cannot import prisma client",
    cmd: buildRipgrepCommand("@prisma/client", [
      "src/routes",
      "src/entrypoints/http/routes",
    ]),
  },
  {
    name: "routes cannot import database config directly",
    cmd: buildRipgrepCommand("config/database", [
      "src/routes",
      "src/entrypoints/http/routes",
    ]),
  },
  {
    name: "routes cannot import services/app directly",
    cmd: buildRipgrepCommand("services/app", [
      "src/routes",
      "src/entrypoints/http/routes",
    ]),
  },
  {
    name: "entrypoint routes cannot import services/core directly",
    cmd: buildRipgrepCommand("services/core", ["src/entrypoints/http/routes"]),
  },
  {
    name: "active runtime cannot import legacy chat runtime",
    cmd: buildRipgrepCommand("chatRuntime\\.legacy\\.service", [
      "src/modules/chat/application/chat-runtime.service.ts",
      "src/services/prismaChat.service.ts",
    ]),
  },
  {
    name: "kernel runtime cannot import dormant core routing stack",
    cmd: buildRipgrepCommand("services/core/routing/", [
      "src/services/chat",
      "src/services/prismaChat.service.ts",
      "src/modules/chat/application/chat-runtime.service.ts",
    ]),
  },
  {
    name: "turn route policy cannot use dynamic fallback file loading",
    cmd: buildRipgrepCommand(
      "loadRoutingBankFallback|\\brequire\\(|path\\.resolve\\(process\\.cwd\\(\\),\\s*\\\"(src|backend/src)/data_banks\\\"",
      ["src/services/chat/turnRoutePolicy.service.ts"],
    ),
  },
  {
    name: "container cannot load dormant intent engine",
    cmd: buildRipgrepCommand("services/core/routing/intentEngine\\.service", [
      "src/bootstrap/container.ts",
    ]),
  },
];

let failed = false;
for (const check of checks) {
  if (!check.cmd) continue;
  try {
    const out = execSync(check.cmd, { stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
    if (out) {
      const lines = out
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const allowPatterns = Array.isArray(check.allowPatterns)
        ? check.allowPatterns
        : [];
      const disallowed = lines.filter(
        (line) =>
          !allowPatterns.some((pattern) => new RegExp(pattern).test(line)),
      );
      if (disallowed.length > 0) {
        failed = true;
        console.error(`\n[architecture] FAIL: ${check.name}`);
        console.error(disallowed.join("\n"));
      }
    }
  } catch (error) {
    // rg exits 1 when no matches; that's success for our lint.
    if (error && typeof error === "object" && "status" in error) {
      if (error.status === 1) continue;
      failed = true;
      console.error(`\n[architecture] ERROR: ${check.name}`);
      if (typeof error.stderr === "string") {
        console.error(error.stderr.trim());
      }
      continue;
    }
    failed = true;
    console.error(`\n[architecture] ERROR: ${check.name}`);
    console.error(String(error));
  }
}

if (failed) {
  console.error("\n[architecture] boundary lint failed");
  process.exit(1);
}

console.log("[architecture] boundary lint passed");
