import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "@jest/globals";

import { writeCertificationGateReport } from "./reporting";

function resolveBackendRoot(): string {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, "backend")];
  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "package.json")) &&
      fs.existsSync(path.join(candidate, "scripts"))
    ) {
      return candidate;
    }
  }
  return cwd;
}

function parseExitSignal(error: unknown): number | null {
  const message = String((error as Error)?.message || "");
  if (!message.startsWith("__DOCINT_EVAL_EXIT__:")) return null;
  const code = Number(message.split(":")[1]);
  return Number.isFinite(code) ? code : 1;
}

function transformDocIntEvalScript(source: string): string {
  return source
    .replace(/^#!.*\r?\n/, "")
    .replace('import fs from "fs";', 'const fs = require("fs");')
    .replace('import path from "path";', 'const path = require("path");')
    .replace(
      'import { fileURLToPath } from "url";',
      'const { fileURLToPath } = require("url");',
    )
    .replace(
      "const __filename = fileURLToPath(import.meta.url);",
      "const __filename = __SCRIPT_FILENAME__;",
    );
}

function runDocIntEvalStrictInProcess(
  backendRoot: string,
): { status: number; errorMessage: string | null } {
  const scriptPath = path.resolve(backendRoot, "scripts/eval/run_docint_eval.mjs");
  const source = fs.readFileSync(scriptPath, "utf8");
  const transformedSource = transformDocIntEvalScript(source);
  const originalArgv = [...process.argv];
  const originalExit = process.exit;
  const originalCertProfile = process.env.CERT_PROFILE;

  let status = 0;
  let errorMessage: string | null = null;

  try {
    process.argv = [process.execPath, scriptPath, "--strict"];
    process.env.CERT_PROFILE = process.env.CERT_PROFILE || "local";
    (process as any).exit = (code?: number) => {
      const resolved = Number.isFinite(Number(code)) ? Number(code) : 0;
      throw new Error(`__DOCINT_EVAL_EXIT__:${resolved}`);
    };
    const wrapped = `(function(require, process, console, __SCRIPT_FILENAME__) {\n${transformedSource}\n})`;
    const runScript = vm.runInThisContext(wrapped, { filename: scriptPath }) as (
      requireFn: NodeJS.Require,
      processObj: NodeJS.Process,
      consoleObj: Console,
      scriptFilename: string,
    ) => void;
    runScript(require, process, console, scriptPath);
  } catch (error) {
    const signaledExitCode = parseExitSignal(error);
    if (signaledExitCode != null) {
      status = signaledExitCode;
    } else {
      status = 1;
      errorMessage = (error as Error)?.stack || String(error);
    }
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    if (originalCertProfile == null) {
      delete process.env.CERT_PROFILE;
    } else {
      process.env.CERT_PROFILE = originalCertProfile;
    }
  }

  return { status, errorMessage };
}

function countJsonlRows(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

describe("Certification: document identity behavioral eval", () => {
  test("strict docint eval passes with no unresolved domain/identity drift", () => {
    const backendRoot = resolveBackendRoot();
    const result = runDocIntEvalStrictInProcess(backendRoot);
    const status = result.status;
    const errorMessage = result.errorMessage;
    const failures = status === 0 ? [] : ["DOCINT_EVAL_STRICT_FAILED"];

    const suiteRegistryPath = path.join(
      backendRoot,
      "src",
      "data_banks",
      "document_intelligence",
      "eval",
      "suites",
      "suite_registry.any.json",
    );
    const suiteRegistry = JSON.parse(fs.readFileSync(suiteRegistryPath, "utf8")) as {
      suites?: Array<{
        id?: string;
        path?: string;
        minimumCases?: number;
        requiredLangs?: string[];
      }>;
    };
    const suites = Array.isArray(suiteRegistry?.suites) ? suiteRegistry.suites : [];
    const suiteById = new Map(
      suites.map((suite) => [String(suite?.id || "").trim(), suite]),
    );
    const requiredIdentitySuites = ["crossdoc_core", "wrong_doc_traps_core"];
    const requiredSuitesPresent = requiredIdentitySuites.every((suiteId) =>
      suiteById.has(suiteId),
    );
    if (!requiredSuitesPresent) {
      failures.push("IDENTITY_REQUIRED_SUITES_MISSING");
    }

    const requiredSuiteLangCoverage = requiredIdentitySuites.every((suiteId) => {
      const langs = Array.isArray(suiteById.get(suiteId)?.requiredLangs)
        ? suiteById.get(suiteId)?.requiredLangs || []
        : [];
      const hasEn = langs.includes("en");
      const hasPt = langs.includes("pt");
      return hasEn && hasPt;
    });
    if (!requiredSuiteLangCoverage) {
      failures.push("IDENTITY_REQUIRED_SUITES_LANG_GAP");
    }

    const wrongDocSuite = suiteById.get("wrong_doc_traps_core");
    const wrongDocSuitePath = String(wrongDocSuite?.path || "").trim();
    const wrongDocCases = wrongDocSuitePath
      ? countJsonlRows(path.join(backendRoot, "src", "data_banks", wrongDocSuitePath))
      : 0;
    const wrongDocMinCases = Number(wrongDocSuite?.minimumCases || 0);
    if (wrongDocCases < wrongDocMinCases || wrongDocCases <= 0) {
      failures.push("WRONG_DOC_TRAPS_SUITE_UNDER_MINIMUM");
    }

    writeCertificationGateReport("doc-identity-behavioral", {
      passed: failures.length === 0,
      metrics: {
        commandStatus: status,
        inProcessExecution: true,
        hasErrorMessage: Boolean(errorMessage),
        requiredSuitesPresent,
        requiredSuiteLangCoverage,
        wrongDocTrapCases: wrongDocCases,
        wrongDocTrapMinimumCases: wrongDocMinCases,
      },
      thresholds: {
        requiredExitCode: 0,
        requiredSuitesPresent: true,
        requiredSuiteLangCoverage: true,
        wrongDocTrapCasesMin: wrongDocMinCases,
      },
      failures,
    });

    if (status !== 0) {
      throw new Error(
        `docint eval strict failed with status=${status}\n${errorMessage || ""}`.trim(),
      );
    }
    expect(status).toBe(0);
  });
});
