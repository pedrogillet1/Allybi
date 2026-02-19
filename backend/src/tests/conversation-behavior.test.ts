/* eslint-disable no-console */
import { spawnSync } from "child_process";
import path from "path";

type Command = {
  bin: string;
  args: string[];
  label: string;
};

function run(command: Command): number {
  const result = spawnSync(command.bin, command.args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });

  if (result.error) {
    console.error(
      `[test:behavior] ${command.label} failed to start: ${result.error.message}`,
    );
    return 1;
  }
  return result.status ?? 1;
}

const jestBin = path.resolve(
  process.cwd(),
  "node_modules",
  "jest",
  "bin",
  "jest.js",
);
const tsNodeBin = path.resolve(
  process.cwd(),
  "node_modules",
  "ts-node",
  "dist",
  "bin.js",
);

const commands: Command[] = [
  {
    bin: process.execPath,
    args: [
      jestBin,
      "--config",
      "jest.config.cjs",
      "--runInBand",
      "--runTestsByPath",
      "src/tests/prismaChatService.contract.test.ts",
    ],
    label: "prisma chat contract",
  },
  {
    bin: process.execPath,
    args: [
      tsNodeBin,
      "--transpile-only",
      "test-suite/16-conversation-flow-test.ts",
      "--quick",
    ],
    label: "conversation flow quick",
  },
];

for (const command of commands) {
  const status = run(command);
  if (status !== 0) process.exit(status);
}

console.log("[test:behavior] All checks passed.");
