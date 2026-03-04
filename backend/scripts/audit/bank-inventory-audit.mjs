#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../src/data_banks");

function walkSync(dir, ext) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results = results.concat(walkSync(filePath, ext));
      } else if (file.endsWith(ext)) {
        results.push(filePath);
      }
    });
  } catch (e) { /* skip */ }
  return results;
}

// 1. Count all bank files on disk
const jsonBanks = walkSync(ROOT, ".any.json");
const qaFiles = walkSync(ROOT, ".qa.jsonl");
const schemaFiles = walkSync(ROOT, ".schema.json");

// 2. Load registry
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest/bank_registry.any.json"), "utf8"));
const registeredIds = new Set(registry.banks.map((b) => b.id));
const registeredPaths = new Map(registry.banks.map((b) => [b.path, b.id]));

// 3. Find unregistered files on disk
const skipPrefixes = ["manifest/", ".compiled/", "_deprecated/", "_quarantine/", "schemas/", "tests/"];
const unregistered = [];
jsonBanks.forEach((fp) => {
  const rel = path.relative(ROOT, fp);
  if (skipPrefixes.some((p) => rel.startsWith(p))) return;
  if (!registeredPaths.has(rel)) {
    unregistered.push(rel);
  }
});

// 4. Find registered but missing on disk
const missingOnDisk = [];
registry.banks.forEach((b) => {
  const fullPath = path.join(ROOT, b.path);
  if (!fs.existsSync(fullPath)) {
    missingOnDisk.push({ id: b.id, path: b.path });
  }
});

// 5. Check for TODO/TBD markers in bank content
let todoCount = 0;
const todoFiles = [];
jsonBanks.forEach((fp) => {
  try {
    const content = fs.readFileSync(fp, "utf8");
    if (/"TODO"|"TBD"|"FIXME"|"PLACEHOLDER"/.test(content)) {
      todoCount++;
      todoFiles.push(path.relative(ROOT, fp));
    }
  } catch (e) { /* skip */ }
});

// 6. Check for duplicate bank IDs
const idCounts = {};
registry.banks.forEach((b) => {
  idCounts[b.id] = (idCounts[b.id] || 0) + 1;
});
const duplicateIds = Object.entries(idCounts)
  .filter(([, c]) => c > 1)
  .map(([id, count]) => ({ id, count }));

// 7. Category breakdown
const categoryCounts = {};
registry.banks.forEach((b) => {
  categoryCounts[b.category] = (categoryCounts[b.category] || 0) + 1;
});

// 8. Locale coverage analysis
let enCount = 0;
let ptCount = 0;
let anyCount = 0;
registry.banks.forEach((b) => {
  const fp = path.join(ROOT, b.path);
  try {
    const content = fs.readFileSync(fp, "utf8");
    const data = JSON.parse(content);
    const langs = data?._meta?.languages || [];
    if (langs.includes("en")) enCount++;
    if (langs.includes("pt")) ptCount++;
    if (langs.includes("any")) anyCount++;
  } catch (e) { /* skip */ }
});

const report = {
  _meta: {
    generatedAt: new Date().toISOString(),
    generatedBy: "bank-inventory-audit.mjs",
  },
  summary: {
    totalJsonBanksOnDisk: jsonBanks.length,
    totalQaFilesOnDisk: qaFiles.length,
    totalSchemaFilesOnDisk: schemaFiles.length,
    registeredBanks: registry.banks.length,
    unregisteredOnDisk: unregistered.length,
    missingOnDisk: missingOnDisk.length,
    duplicateBankIds: duplicateIds.length,
    todoMarkerFiles: todoCount,
  },
  localeCoverage: {
    en: enCount,
    pt: ptCount,
    any: anyCount,
    total: registry.banks.length,
  },
  categoryBreakdown: Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({ category, count })),
  unregisteredOnDisk: unregistered,
  missingOnDisk,
  duplicateBankIds: duplicateIds,
  todoMarkerFiles: todoFiles,
};

// Output JSON report
const reportDir = path.join(ROOT, "__reports");
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, "bank_audit_report.any.json"),
  JSON.stringify(report, null, 2)
);

// Console summary
console.log("\n=== BANK INVENTORY AUDIT ===\n");
console.log(`Total .any.json on disk:   ${jsonBanks.length}`);
console.log(`Total .qa.jsonl on disk:   ${qaFiles.length}`);
console.log(`Total .schema.json on disk: ${schemaFiles.length}`);
console.log(`Registered in registry:    ${registry.banks.length}`);
console.log(`Unregistered on disk:      ${unregistered.length}`);
console.log(`Missing on disk:           ${missingOnDisk.length}`);
console.log(`Duplicate bank IDs:        ${duplicateIds.length}`);
console.log(`Files with TODO/TBD:       ${todoCount}`);
console.log(`\nLocale: EN=${enCount}, PT=${ptCount}, ANY=${anyCount}`);
console.log(`\nCategories: ${Object.keys(categoryCounts).length}`);
console.log(`\nReport written to: src/data_banks/__reports/bank_audit_report.any.json`);

if (unregistered.length > 0) {
  console.log(`\n--- Unregistered files (first 30) ---`);
  unregistered.slice(0, 30).forEach((f) => console.log(`  ${f}`));
  if (unregistered.length > 30) console.log(`  ... and ${unregistered.length - 30} more`);
}

if (missingOnDisk.length > 0) {
  console.log(`\n--- Missing on disk ---`);
  missingOnDisk.forEach((m) => console.log(`  ${m.id} → ${m.path}`));
}

if (duplicateIds.length > 0) {
  console.log(`\n--- Duplicate IDs ---`);
  duplicateIds.forEach((d) => console.log(`  ${d.id} (×${d.count})`));
}

if (todoCount > 0) {
  console.log(`\n--- Files with TODO/TBD markers ---`);
  todoFiles.forEach((f) => console.log(`  ${f}`));
}
