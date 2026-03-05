#!/usr/bin/env node
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
  return {
    pattern,
    targets: resolvedTargets,
  };
}

function walkFiles(absTarget, out) {
  const stat = fs.statSync(absTarget);
  if (stat.isFile()) {
    out.push(absTarget);
    return;
  }
  if (!stat.isDirectory()) return;
  const entries = fs.readdirSync(absTarget, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(absTarget, entry.name);
    if (entry.isFile()) {
      out.push(child);
      continue;
    }
    if (entry.isDirectory()) {
      walkFiles(child, out);
    }
  }
}

function resolveSearchFiles(targets) {
  const absFiles = [];
  for (const relTarget of targets) {
    const absTarget = path.resolve(ROOT, relTarget);
    if (!fs.existsSync(absTarget)) continue;
    walkFiles(absTarget, absFiles);
  }
  const relFiles = absFiles.map((abs) => path.relative(ROOT, abs).replace(/\\/g, "/"));
  return Array.from(new Set(relFiles)).sort();
}

function runPatternSearch(pattern, targets) {
  const files = resolveSearchFiles(targets);
  if (files.length === 0) return [];
  const regex = new RegExp(pattern);
  const matches = [];
  for (const relPath of files) {
    const absPath = path.resolve(ROOT, relPath);
    let content = "";
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx];
      if (regex.test(line)) {
        matches.push(`${relPath}:${idx + 1}:${line}`);
      }
    }
  }
  return matches;
}

const checks = [
  {
    name: "routes cannot import prisma client",
    command: buildRipgrepCommand("@prisma/client", [
      "src/routes",
      "src/entrypoints/http/routes",
    ]),
  },
  {
    name: "routes cannot import database config directly",
    command: buildRipgrepCommand("config/database", [
      "src/routes",
      "src/entrypoints/http/routes",
    ]),
  },
  {
    name: "routes cannot import services/app directly",
    command: buildRipgrepCommand("services/app", [
      "src/routes",
      "src/entrypoints/http/routes",
    ]),
  },
  {
    name: "entrypoint routes cannot import services/core directly",
    command: buildRipgrepCommand("services/core", [
      "src/entrypoints/http/routes",
    ]),
  },
  {
    name: "active runtime cannot import legacy chat runtime",
    command: buildRipgrepCommand("chatRuntime\\.legacy\\.service", [
      "src/modules/chat/application/chat-runtime.service.ts",
      "src/services/prismaChat.service.ts",
    ]),
  },
  {
    name: "kernel runtime cannot import dormant core routing stack",
    command: buildRipgrepCommand("services/core/routing/", [
      "src/services/chat",
      "src/services/prismaChat.service.ts",
      "src/modules/chat/application/chat-runtime.service.ts",
    ]),
  },
  {
    name: "turn route policy cannot use dynamic fallback file loading",
    command: buildRipgrepCommand(
      "loadRoutingBankFallback|\\brequire\\(|path\\.resolve\\(process\\.cwd\\(\\),\\s*\\\"(src|backend/src)/data_banks\\\"",
      ["src/services/chat/turnRoutePolicy.service.ts"],
    ),
  },
  {
    name: "container cannot load dormant intent engine",
    command: buildRipgrepCommand(
      "services/core/routing/intentEngine\\.service",
      ["src/bootstrap/container.ts"],
    ),
  },
];

let failed = false;
for (const check of checks) {
  if (!check.command) continue;
  let lines = [];
  try {
    lines = runPatternSearch(check.command.pattern, check.command.targets);
  } catch (error) {
    failed = true;
    console.error(`\n[architecture] ERROR: ${check.name}`);
    console.error(error instanceof Error ? error.message : String(error));
    continue;
  }
  if (lines.length === 0) continue;
  const allowPatterns = Array.isArray(check.allowPatterns)
    ? check.allowPatterns
    : [];
  const disallowed = lines.filter(
    (line) => !allowPatterns.some((pattern) => new RegExp(pattern).test(line)),
  );
  if (disallowed.length > 0) {
    failed = true;
    console.error(`\n[architecture] FAIL: ${check.name}`);
    console.error(disallowed.join("\n"));
  }
}

if (failed) {
  console.error("\n[architecture] boundary lint failed");
  process.exit(1);
}

console.log("[architecture] boundary lint passed");
