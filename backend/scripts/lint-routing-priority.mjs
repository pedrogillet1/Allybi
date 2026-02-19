#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const bankPath = path.join(ROOT, "src", "data_banks", "routing", "routing_priority.any.json");

function fail(message) {
  console.error(`[lint:routing] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(bankPath)) {
  fail(`missing bank file: ${bankPath}`);
}

let bank;
try {
  bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
} catch (error) {
  fail(`invalid JSON (${error?.message || error})`);
}

const errors = [];

if (bank?.config?.enabled !== true) {
  errors.push("config.enabled must be true");
}

const families = bank?.intentFamilyBasePriority || {};
const familyKeys = Object.keys(families).filter((k) => !k.startsWith("_"));
if (!familyKeys.length) {
  errors.push("intentFamilyBasePriority must define at least one family");
}
for (const key of familyKeys) {
  if (typeof families[key] !== "number") {
    errors.push(`intentFamilyBasePriority.${key} must be a number`);
  }
}

const tieBreakStages = Array.isArray(bank?.tiebreakStages) ? bank.tiebreakStages : [];
if (!tieBreakStages.length) {
  errors.push("tiebreakStages must be a non-empty array");
}

const ids = new Set();
for (const stage of tieBreakStages) {
  const id = String(stage?.id || "").trim();
  if (!id) {
    errors.push("every tiebreak stage must have an id");
    continue;
  }
  if (ids.has(id)) {
    errors.push(`duplicate tiebreak stage id: ${id}`);
  }
  ids.add(id);
}

if (errors.length) {
  errors.forEach((e) => console.error(`ERROR: ${e}`));
  process.exit(1);
}

console.log(`[lint:routing] OK (${tieBreakStages.length} tiebreak stages validated)`);
