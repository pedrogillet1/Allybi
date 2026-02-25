/* eslint-disable no-console */
import { spawnSync } from "child_process";
import path from "path";

function runDelegatedSuite(): number {
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
    return 1;
  }
  return result.status ?? 1;
}

if (process.env.JEST_WORKER_ID) {
  describe("generation-streaming delegated suite", () => {
    test("passes delegated prompt suites", () => {
      expect(runDelegatedSuite()).toBe(0);
    });
  });
} else {
  process.exit(runDelegatedSuite());
}
