#!/usr/bin/env node
import { execSync } from "node:child_process";

const checks = [
  {
    name: "routes cannot import prisma client",
    cmd: `rg -n "@prisma/client" backend/src/routes backend/src/entrypoints/http/routes`,
  },
  {
    name: "routes cannot import database config directly",
    cmd: `rg -n "config/database" backend/src/routes backend/src/entrypoints/http/routes`,
  },
  {
    name: "routes cannot import services/app directly",
    cmd: `rg -n "services/app" backend/src/routes backend/src/entrypoints/http/routes`,
  },
  {
    name: "entrypoint routes cannot import services/core directly",
    cmd: `rg -n "services/core" backend/src/entrypoints/http/routes`,
  },
  {
    name: "active runtime cannot import legacy chat runtime",
    cmd: `rg -n "chatRuntime\\.legacy\\.service" backend/src/modules/chat/application/chat-runtime.service.ts backend/src/services/prismaChat.service.ts`,
  },
  {
    name: "kernel runtime cannot import dormant core routing stack",
    cmd: `rg -n "services/core/routing/" backend/src/services/chat backend/src/services/prismaChat.service.ts backend/src/modules/chat/application/chat-runtime.service.ts`,
  },
  {
    name: "turn route policy cannot use dynamic fallback file loading",
    cmd: `rg -n "loadRoutingBankFallback|\\brequire\\(|path\\.resolve\\(process\\.cwd\\(\\),\\s*\\\"(src|backend/src)/data_banks\\\"" backend/src/services/chat/turnRoutePolicy.service.ts`,
  },
  {
    name: "container cannot load dormant intent engine",
    cmd: `rg -n "services/core/routing/intentEngine\\.service" backend/src/bootstrap/container.ts`,
  },
];

let failed = false;
for (const check of checks) {
  try {
    const out = execSync(check.cmd, { stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
    if (out) {
      failed = true;
      console.error(`\n[architecture] FAIL: ${check.name}`);
      console.error(out);
    }
  } catch {
    // rg exits 1 when no matches; that's success for our lint.
  }
}

if (failed) {
  console.error("\n[architecture] boundary lint failed");
  process.exit(1);
}

console.log("[architecture] boundary lint passed");
