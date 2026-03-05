#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL("../src/data_banks", import.meta.url));
const THRESHOLD = Number(process.env.BANK_COLLISION_THRESHOLD || 250);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".compiled" || entry === "_deprecated") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

function normalizePattern(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function collectCandidateStrings(row) {
  const out = [];
  const pushIfString = (value) => {
    if (typeof value === "string" && value.trim().length > 0) {
      out.push(value);
    }
  };
  const pushFromArray = (value) => {
    if (!Array.isArray(value)) return;
    for (const item of value) pushIfString(item);
  };

  pushIfString(row?.pattern);
  pushIfString(row?.phrase);
  pushIfString(row?.query);
  pushIfString(row?.match);
  pushIfString(row?.contains);
  pushFromArray(row?.patterns);
  pushFromArray(row?.queries);

  const when = row?.when;
  if (typeof when === "string") pushIfString(when);
  if (when && typeof when === "object") {
    pushFromArray(when.signals);
    pushFromArray(when.operators);
    const regexAny = when.queryRegexAny;
    if (regexAny && typeof regexAny === "object") {
      for (const patterns of Object.values(regexAny)) {
        pushFromArray(patterns);
      }
    }
  }

  return out;
}

function main() {
  const files = walk(ROOT).filter(
    (filePath) => {
      const normalizedPath = String(filePath || "").replace(/\\/g, "/");
      return (
        normalizedPath.includes("/intent_patterns/") ||
        normalizedPath.includes("/routing/") ||
        normalizedPath.includes("/retrieval/")
      );
    },
  );

  const seen = new Map();
  const collisions = [];
  for (const filePath of files) {
    let bank;
    try {
      bank = JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }
    const rows = Array.isArray(bank?.patterns)
      ? bank.patterns
      : Array.isArray(bank?.rules)
        ? bank.rules
        : [];
    for (const row of rows) {
      const candidateValues = collectCandidateStrings(row);
      for (const raw of candidateValues) {
        const normalized = normalizePattern(raw);
        if (!normalized || normalized.length < 4) continue;
        if (seen.has(normalized) && seen.get(normalized) !== filePath) {
          collisions.push({
            pattern: normalized,
            first: seen.get(normalized),
            second: filePath,
          });
        } else if (!seen.has(normalized)) {
          seen.set(normalized, filePath);
        }
      }
    }
  }

  const report = {
    scannedFiles: files.length,
    uniquePatterns: seen.size,
    collisions: collisions.length,
    threshold: THRESHOLD,
    topCollisions: collisions.slice(0, 50),
  };
  console.log(JSON.stringify(report, null, 2));
  if (collisions.length > THRESHOLD) {
    process.exit(1);
  }
}

main();

