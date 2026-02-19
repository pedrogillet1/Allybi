/* eslint-disable no-console */
import { spawnSync } from "child_process";
import path from "path";

const jestBin = path.resolve(
  process.cwd(),
  "node_modules",
  "jest",
  "bin",
  "jest.js",
);

const result = spawnSync(
  process.execPath,
  [
    jestBin,
    "--config",
    "jest.config.cjs",
    "--runInBand",
    "--runTestsByPath",
    "src/tests/promptCompilation.test.ts",
    "src/tests/promptRegistryRules.test.ts",
  ],
  { stdio: "inherit", cwd: process.cwd(), env: process.env },
);

if (result.error) {
  console.error(
    `[test:generation] failed to start jest: ${result.error.message}`,
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
