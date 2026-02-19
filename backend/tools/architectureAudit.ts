/* eslint-disable no-console */
import { spawnSync } from "child_process";

type Check = {
  name: string;
  cmd: string[];
};

const checks: Check[] = [
  { name: "routing-alignment", cmd: ["npm", "run", "-s", "audit:routing"] },
  { name: "editing-banks", cmd: ["npm", "run", "-s", "editing:validate-banks"] },
  { name: "bank-checksums", cmd: ["npm", "run", "-s", "banks:checksum:check"] },
];

let failures = 0;

for (const check of checks) {
  console.log(`[koda:audit] running ${check.name} -> ${check.cmd.join(" ")}`);
  const result = spawnSync(check.cmd[0], check.cmd.slice(1), {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    failures += 1;
    console.error(`[koda:audit] FAILED: ${check.name}`);
  } else {
    console.log(`[koda:audit] passed: ${check.name}`);
  }
}

if (failures > 0) {
  console.error(`[koda:audit] completed with ${failures} failing check(s)`);
  process.exit(1);
}

console.log("[koda:audit] all checks passed");
