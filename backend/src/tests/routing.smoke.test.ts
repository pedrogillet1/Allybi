/* eslint-disable no-console */
import { spawnSync } from "child_process";
import path from "path";

function runJest(paths: string[]): void {
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
      ...paths,
    ],
    { stdio: "inherit", cwd: process.cwd(), env: process.env },
  );

  if (result.error) {
    console.error(
      `[test:routing] failed to start jest: ${result.error.message}`,
    );
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

runJest([
  "src/tests/routingAlignment.test.ts",
  "src/tests/editingRouting.guard.test.ts",
]);
