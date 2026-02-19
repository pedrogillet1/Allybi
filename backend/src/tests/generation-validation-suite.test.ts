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
    "src/tests/bankCoverage.test.ts",
    "src/tests/intentRuntime.integration.test.ts",
  ],
  { stdio: "inherit", cwd: process.cwd(), env: process.env },
);

if (result.error) {
  console.error(
    `[test:validation] failed to start jest: ${result.error.message}`,
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
