import * as fs from "fs";
import * as path from "path";

const LEXICONS_DIR = path.join(__dirname, "../../src/data_banks/lexicons");

function mergeIfExists(baseName: string, extName: string): void {
  const basePath = path.join(LEXICONS_DIR, baseName);
  const extPath = path.join(LEXICONS_DIR, extName);

  if (!fs.existsSync(basePath) || !fs.existsSync(extPath)) {
    console.log(`Skip: ${baseName} or ${extName} not found`);
    return;
  }

  const base = JSON.parse(fs.readFileSync(basePath, "utf-8"));
  const ext = JSON.parse(fs.readFileSync(extPath, "utf-8"));

  if (!Array.isArray(base) || !Array.isArray(ext)) {
    console.log(`Skip: ${baseName} or ${extName} not arrays`);
    return;
  }

  // Renumber ext ids
  const maxId = Math.max(...base.map((e: any) => e.id || 0), 0);
  const renumbered = ext.map((e: any, i: number) => ({ ...e, id: maxId + i + 1 }));

  const merged = [...base, ...renumbered];
  fs.writeFileSync(basePath, JSON.stringify(merged, null, 2));

  // Remove ext file
  fs.unlinkSync(extPath);

  console.log(`Merged: ${baseName} now has ${merged.length} entries`);
}

function main(): void {
  console.log("Merging extension lexicons...\n");

  mergeIfExists("compliance_security.json", "compliance_security_ext.json");
  mergeIfExists("analytics_telemetry.json", "analytics_telemetry_ext.json");
  mergeIfExists("navigation_ui.json", "navigation_ui_ext.json");

  console.log("\nDone!");
}

main();
