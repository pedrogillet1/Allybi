import { spawnSync } from "child_process";

type ScriptSuiteName =
  | "docint"
  | "cert:strict"
  | "audit:retrieval"
  | "audit:editing"
  | "audit:operators"
  | "check:all";

const SCRIPT_SUITES: Record<ScriptSuiteName, string[]> = {
  docint: [
    "eval:document-understanding:strict",
    "test:docint",
  ],
  "cert:strict": [
    "test:benchmarks",
    "test:cert:retrieval",
    "test:cert:editing",
    "test:cert:security",
    "test:cert:composition",
    "test:cert:runtime",
    "test:docint",
    "eval:retrieval:gate",
  ],
  "audit:retrieval": [
    "test:retrieval:doclock",
    "test:cert:retrieval",
  ],
  "audit:editing": [
    "test:cert:editing",
  ],
  "audit:operators": [
    "test:cert:security",
    "audit:routing",
    "audit:editing",
  ],
  "check:all": [
    "typecheck",
    "lint",
    "audit:retrieval",
    "audit:editing",
    "audit:memory:strict",
    "format:check",
    "policy:cert:strict",
    "policy:a-grade:assert",
    "test:cert:strict",
    "policy:composition:a-plus:assert",
  ],
};

function listSuites(): void {
  const names = Object.keys(SCRIPT_SUITES).sort();
  console.log(names.join("\n"));
}

function runScript(scriptName: string): number {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, ["run", scriptName], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

function main(): number {
  const [suiteName, flag] = process.argv.slice(2);
  if (!suiteName || suiteName === "--list-suites") {
    listSuites();
    return suiteName ? 0 : 1;
  }

  if (!(suiteName in SCRIPT_SUITES)) {
    console.error(`Unknown script suite: ${suiteName}`);
    listSuites();
    return 1;
  }

  const suite = SCRIPT_SUITES[suiteName as ScriptSuiteName];
  if (flag === "--list") {
    console.log(suite.join("\n"));
    return 0;
  }

  for (const scriptName of suite) {
    const exitCode = runScript(scriptName);
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

process.exit(main());
