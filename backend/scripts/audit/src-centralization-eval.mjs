#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const strict =
  process.argv.includes("--strict") ||
  process.argv.includes("--mode=strict") ||
  process.argv.includes("--mode") && process.argv.includes("strict");

const backendRoot = fs.existsSync(path.resolve(process.cwd(), "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "backend");

function runNodeScript(relPath, extraArgs = []) {
  const fullPath = path.resolve(backendRoot, relPath);
  const result = spawnSync(process.execPath, [fullPath, ...extraArgs], {
    cwd: backendRoot,
    stdio: "pipe",
    encoding: "utf8",
  });
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
  return {
    command: `${relPath} ${extraArgs.join(" ")}`.trim(),
    ok: result.status === 0,
    status: result.status ?? 1,
  };
}

function listRuntimeFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "tests") continue;
        stack.push(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      out.push(full);
    }
  }
  return out;
}

function countPrismaClientInstantiations() {
  const srcRoot = path.resolve(backendRoot, "src");
  const files = listRuntimeFiles(srcRoot);
  const matches = [];
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    if (!source.includes("new PrismaClient(")) continue;
    matches.push(path.relative(backendRoot, filePath).replace(/\\/g, "/"));
  }
  return matches;
}

function main() {
  const auditArgs = strict ? ["--strict"] : [];
  const checks = [
    runNodeScript("scripts/lint/intent-centralization-audit.mjs", auditArgs),
    runNodeScript("scripts/lint/retrieval-centralization-audit.mjs", auditArgs),
    runNodeScript("scripts/audit/editing-operator-completeness.mjs"),
    runNodeScript("scripts/audit/editing-no-fake-success.mjs"),
  ];

  const prismaInstantiations = countPrismaClientInstantiations();
  const prismaCheckOk = prismaInstantiations.length <= 1;

  console.log(
    `[src-centralization-eval] prisma-client-instantiations: ${prismaInstantiations.length}`,
  );
  if (!prismaCheckOk) {
    console.log(
      `[src-centralization-eval] FAIL multiple PrismaClient constructors in runtime files: ${prismaInstantiations.join(", ")}`,
    );
  }

  const failedChecks = checks.filter((check) => !check.ok);
  const allOk = failedChecks.length === 0 && (!strict || prismaCheckOk);

  const summary = {
    mode: strict ? "strict" : "default",
    ok: allOk,
    failedChecks: failedChecks.map((check) => check.command),
    prismaClientInstantiations: prismaInstantiations.length,
    prismaCheckOk,
  };

  console.log(`[src-centralization-eval] summary ${JSON.stringify(summary)}`);

  if (!allOk) process.exit(1);
}

main();
