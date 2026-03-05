#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function expectContains(source, token, errors, label) {
  if (!source.includes(token)) {
    errors.push(`${label} is missing required token: ${token}`);
  }
}

function main() {
  const errors = [];

  const orchestrator = read("src/services/editing/editOrchestrator.service.ts");
  const types = read("src/services/editing/editing.types.ts");
  const goldenTestPath = path.join(
    ROOT,
    "src/tests/editing/docx_xlsx_bitwise.contract.test.ts",
  );

  expectContains(
    orchestrator,
    'outcomeType: "noop"',
    errors,
    "editOrchestrator",
  );
  expectContains(
    orchestrator,
    "EDIT_NOOP_NO_CHANGES",
    errors,
    "editOrchestrator",
  );
  expectContains(
    orchestrator,
    "EDIT_RESULT_CONTRACT_INVALID",
    errors,
    "editOrchestrator",
  );
  if (orchestrator.includes("warn-only, never blocks")) {
    errors.push(
      "editOrchestrator still contains warn-only contract validation comment.",
    );
  }

  expectContains(types, "verifiedBitwise?: boolean;", errors, "editing.types");
  expectContains(types, "referenceHash?: string;", errors, "editing.types");

  if (!fs.existsSync(goldenTestPath)) {
    errors.push(
      "Missing required golden certification test: src/tests/editing/docx_xlsx_bitwise.contract.test.ts",
    );
  }

  if (errors.length) {
    console.error("[editing-no-fake-success] FAILED");
    for (const error of errors) console.error(` - ${error}`);
    process.exit(1);
  }

  console.log("[editing-no-fake-success] OK");
}

main();
