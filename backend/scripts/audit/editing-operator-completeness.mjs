#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function extractRuntimeOperators(typesSource) {
  const match = typesSource.match(/export type EditOperator =([\s\S]*?);/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([A-Z_]+)"/g)).map((m) => m[1]);
}

function extractContractOperators(contractSource) {
  return Array.from(
    contractSource.matchAll(/operator:\s*"([A-Z_]+)"/g),
  ).map((m) => m[1]);
}

function extractRuntimeBranches(revisionStoreSource) {
  return Array.from(
    revisionStoreSource.matchAll(/op === "([A-Z_]+)"/g),
  ).map((m) => m[1]);
}

function unique(values) {
  return Array.from(new Set(values));
}

function main() {
  const typesSource = read("src/services/editing/editing.types.ts");
  const contractSource = read("src/services/editing/contracts/operatorContracts.ts");
  const revisionStoreSource = read("src/services/editing/documentRevisionStore.service.ts");

  const runtimeOps = unique(extractRuntimeOperators(typesSource));
  const contractOps = unique(extractContractOperators(contractSource));
  const branchOps = unique(extractRuntimeBranches(revisionStoreSource));

  const missingContract = runtimeOps.filter((op) => !contractOps.includes(op));
  const extraContract = contractOps.filter((op) => !runtimeOps.includes(op));
  const missingBranch = runtimeOps.filter((op) => !branchOps.includes(op));

  const errors = [];
  if (missingContract.length) {
    errors.push(
      `Missing operator contracts: ${missingContract.sort().join(", ")}`,
    );
  }
  if (extraContract.length) {
    errors.push(
      `Contracts reference unknown runtime operators: ${extraContract.sort().join(", ")}`,
    );
  }
  if (missingBranch.length) {
    errors.push(
      `Revision store missing execution branches for runtime operators: ${missingBranch.sort().join(", ")}`,
    );
  }

  if (errors.length) {
    console.error("[editing-operator-completeness] FAILED");
    for (const error of errors) console.error(` - ${error}`);
    process.exit(1);
  }

  console.log("[editing-operator-completeness] OK");
  console.log(
    `Runtime operators: ${runtimeOps.length}, contracts: ${contractOps.length}, execution branches: ${branchOps.length}`,
  );
}

main();
