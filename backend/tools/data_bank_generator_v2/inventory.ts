/**
 * PHASE 0: Bank Inventory Generator
 *
 * Enumerates all data banks, counts patterns, detects duplicates,
 * and generates BANK_INVENTORY.md
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const DATA_BANKS_DIR = path.join(__dirname, "../../src/data_banks");
const AUDIT_DIR = process.env.AUDIT_DIR || path.join(__dirname, "../../audit_output_mass/data_bank_build_latest");

interface BankFile {
  path: string;
  relativePath: string;
  category: string;
  name: string;
  language: string | null;
  count: number;
  patterns: PatternEntry[];
  errors: string[];
}

interface PatternEntry {
  id: string | number;
  pattern?: string;
  term?: string;
  en?: string;
  pt?: string;
  hash: string;
}

interface DuplicateGroup {
  hash: string;
  pattern: string;
  occurrences: { file: string; id: string | number }[];
}

// ============================================================================
// INVENTORY FUNCTIONS
// ============================================================================

function getLanguageFromFilename(filename: string): string | null {
  const match = filename.match(/\.([a-z]{2})\.json$/);
  return match ? match[1] : null;
}

function getCategoryFromPath(relativePath: string): string {
  const parts = relativePath.split(path.sep);
  return parts[0] || "root";
}

function hashPattern(pattern: string): string {
  return crypto.createHash("md5").update(pattern.toLowerCase().trim()).digest("hex").slice(0, 12);
}

function extractPatterns(data: any[], filename: string): PatternEntry[] {
  const patterns: PatternEntry[] = [];

  for (const item of data) {
    const id = item.id ?? patterns.length;
    let patternText = "";

    // Different formats
    if (item.pattern) {
      patternText = item.pattern;
    } else if (item.term) {
      patternText = item.term;
    } else if (item.en && item.pt) {
      // Lexicon format
      patternText = `${item.en}|${item.pt}`;
    } else if (item.from && item.to) {
      // Normalizer format
      patternText = `${item.from}→${item.to}`;
    } else if (item.input && item.output) {
      patternText = `${item.input}→${item.output}`;
    } else if (typeof item === "string") {
      patternText = item;
    }

    if (patternText) {
      patterns.push({
        id,
        pattern: patternText,
        hash: hashPattern(patternText)
      });
    }
  }

  return patterns;
}

function loadBankFile(filePath: string): BankFile {
  const relativePath = path.relative(DATA_BANKS_DIR, filePath);
  const filename = path.basename(filePath);
  const nameWithoutExt = filename.replace(/\.[a-z]{2}\.json$/, "").replace(/\.json$/, "");

  const bank: BankFile = {
    path: filePath,
    relativePath,
    category: getCategoryFromPath(relativePath),
    name: nameWithoutExt,
    language: getLanguageFromFilename(filename),
    count: 0,
    patterns: [],
    errors: []
  };

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    if (Array.isArray(data)) {
      bank.patterns = extractPatterns(data, filename);
      bank.count = bank.patterns.length;
    } else if (typeof data === "object") {
      // Might be a structured bank
      bank.count = Object.keys(data).length;
      bank.errors.push("Non-array format");
    }
  } catch (e: any) {
    bank.errors.push(`Parse error: ${e.message}`);
  }

  return bank;
}

function findAllBankFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  walk(DATA_BANKS_DIR);
  return files.sort();
}

function findDuplicates(banks: BankFile[]): DuplicateGroup[] {
  const hashMap = new Map<string, { pattern: string; occurrences: { file: string; id: string | number }[] }>();

  for (const bank of banks) {
    for (const pattern of bank.patterns) {
      if (!pattern.pattern) continue;

      const existing = hashMap.get(pattern.hash);
      if (existing) {
        existing.occurrences.push({ file: bank.relativePath, id: pattern.id });
      } else {
        hashMap.set(pattern.hash, {
          pattern: pattern.pattern,
          occurrences: [{ file: bank.relativePath, id: pattern.id }]
        });
      }
    }
  }

  // Filter to only groups with duplicates
  const duplicates: DuplicateGroup[] = [];
  for (const [hash, data] of hashMap) {
    if (data.occurrences.length > 1) {
      duplicates.push({
        hash,
        pattern: data.pattern,
        occurrences: data.occurrences
      });
    }
  }

  return duplicates.sort((a, b) => b.occurrences.length - a.occurrences.length);
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateInventoryReport(banks: BankFile[], duplicates: DuplicateGroup[]): string {
  const lines: string[] = [];

  lines.push("# Bank Inventory Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Data Banks Directory: ${DATA_BANKS_DIR}`);
  lines.push("");

  // Summary
  const totalFiles = banks.length;
  const totalPatterns = banks.reduce((sum, b) => sum + b.count, 0);
  const byCategory = new Map<string, { files: number; patterns: number }>();

  for (const bank of banks) {
    const cat = byCategory.get(bank.category) || { files: 0, patterns: 0 };
    cat.files++;
    cat.patterns += bank.count;
    byCategory.set(bank.category, cat);
  }

  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Files | ${totalFiles} |`);
  lines.push(`| Total Patterns | ${totalPatterns} |`);
  lines.push(`| Duplicate Groups | ${duplicates.length} |`);
  lines.push(`| Duplicate Pattern Instances | ${duplicates.reduce((s, d) => s + d.occurrences.length, 0)} |`);
  lines.push("");

  lines.push("## By Category");
  lines.push("");
  lines.push("| Category | Files | Patterns |");
  lines.push("|----------|-------|----------|");

  for (const [cat, stats] of [...byCategory.entries()].sort()) {
    lines.push(`| ${cat} | ${stats.files} | ${stats.patterns} |`);
  }
  lines.push("");

  // Detailed file list
  lines.push("## File Inventory");
  lines.push("");

  for (const category of [...byCategory.keys()].sort()) {
    lines.push(`### ${category}`);
    lines.push("");
    lines.push("| File | Language | Count | Status |");
    lines.push("|------|----------|-------|--------|");

    const categoryBanks = banks.filter(b => b.category === category).sort((a, b) => a.name.localeCompare(b.name));
    for (const bank of categoryBanks) {
      const lang = bank.language || "shared";
      const status = bank.errors.length > 0 ? `⚠️ ${bank.errors[0]}` : "✅";
      lines.push(`| ${bank.relativePath} | ${lang} | ${bank.count} | ${status} |`);
    }
    lines.push("");
  }

  // EN/PT Parity Check
  lines.push("## EN/PT Parity Status");
  lines.push("");

  const enBanks = banks.filter(b => b.language === "en");
  const ptBanks = banks.filter(b => b.language === "pt");
  const sharedBanks = banks.filter(b => !b.language);

  lines.push(`| Type | Count |`);
  lines.push(`|------|-------|`);
  lines.push(`| EN-only banks | ${enBanks.length} |`);
  lines.push(`| PT-only banks | ${ptBanks.length} |`);
  lines.push(`| Shared banks | ${sharedBanks.length} |`);
  lines.push("");

  // Find mismatched EN/PT pairs
  const enNames = new Set(enBanks.map(b => b.name));
  const ptNames = new Set(ptBanks.map(b => b.name));

  const onlyEn = [...enNames].filter(n => !ptNames.has(n));
  const onlyPt = [...ptNames].filter(n => !enNames.has(n));

  if (onlyEn.length > 0 || onlyPt.length > 0) {
    lines.push("### Missing Pairs");
    lines.push("");
    if (onlyEn.length > 0) {
      lines.push("**EN without PT:**");
      onlyEn.forEach(n => lines.push(`- ${n}`));
      lines.push("");
    }
    if (onlyPt.length > 0) {
      lines.push("**PT without EN:**");
      onlyPt.forEach(n => lines.push(`- ${n}`));
      lines.push("");
    }
  }

  // Check count parity
  lines.push("### Count Parity");
  lines.push("");
  lines.push("| Bank | EN Count | PT Count | Diff | Status |");
  lines.push("|------|----------|----------|------|--------|");

  for (const name of [...new Set([...enNames, ...ptNames])].sort()) {
    const en = enBanks.find(b => b.name === name);
    const pt = ptBanks.find(b => b.name === name);

    if (en && pt) {
      const diff = Math.abs(en.count - pt.count);
      const pct = en.count > 0 ? (diff / en.count * 100).toFixed(1) : "0";
      const status = diff === 0 ? "✅ Perfect" : (Number(pct) <= 5 ? "⚠️ Minor" : "❌ Mismatch");
      lines.push(`| ${name} | ${en.count} | ${pt.count} | ${diff} (${pct}%) | ${status} |`);
    } else {
      const count = en?.count || pt?.count || 0;
      lines.push(`| ${name} | ${en?.count || "—"} | ${pt?.count || "—"} | — | ❌ Missing pair |`);
    }
  }
  lines.push("");

  // Duplicates preview
  if (duplicates.length > 0) {
    lines.push("## Top Duplicates (preview)");
    lines.push("");
    lines.push("Full duplicates report in DUPLICATES_REPORT.md");
    lines.push("");

    const top10 = duplicates.slice(0, 10);
    for (const dup of top10) {
      lines.push(`**Pattern:** \`${dup.pattern.slice(0, 60)}${dup.pattern.length > 60 ? "..." : ""}\``);
      lines.push(`- Occurrences: ${dup.occurrences.length}`);
      lines.push(`- Files: ${dup.occurrences.map(o => o.file).join(", ")}`);
      lines.push("");
    }
  }

  // Migration plan
  lines.push("## Migration Plan");
  lines.push("");
  lines.push("Files to be replaced by v2 generation:");
  lines.push("");
  lines.push("| Current File | Action | New File |");
  lines.push("|--------------|--------|----------|");

  const migrationPlan = [
    { pattern: "triggers/*.json", action: "Replace", note: "All trigger files will be regenerated with new targets" },
    { pattern: "negatives/*.json", action: "Replace", note: "All negative files will be regenerated" },
    { pattern: "overlays/*.json", action: "Replace", note: "Move overlays from triggers/ to overlays/" },
    { pattern: "formatting/*.json", action: "Enhance", note: "Add missing formatting types" },
    { pattern: "normalizers/*.json", action: "Enhance", note: "Expand to meet new targets" },
    { pattern: "lexicons/*.json", action: "Enhance", note: "Add missing domains, ensure EN/PT parity" },
  ];

  for (const item of migrationPlan) {
    lines.push(`| ${item.pattern} | ${item.action} | ${item.note} |`);
  }
  lines.push("");

  return lines.join("\n");
}

function generateDuplicatesReport(duplicates: DuplicateGroup[]): string {
  const lines: string[] = [];

  lines.push("# Duplicates Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Duplicate Groups | ${duplicates.length} |`);
  lines.push(`| Total Duplicate Instances | ${duplicates.reduce((s, d) => s + d.occurrences.length, 0)} |`);
  lines.push("");

  if (duplicates.length === 0) {
    lines.push("✅ No duplicates found!");
    return lines.join("\n");
  }

  // Group by severity
  const crossCategory = duplicates.filter(d => {
    const files = d.occurrences.map(o => o.file.split("/")[0]);
    return new Set(files).size > 1;
  });

  const withinCategory = duplicates.filter(d => {
    const files = d.occurrences.map(o => o.file.split("/")[0]);
    return new Set(files).size === 1;
  });

  lines.push("## Critical: Cross-Category Duplicates");
  lines.push("");

  if (crossCategory.length === 0) {
    lines.push("✅ No cross-category duplicates");
  } else {
    for (const dup of crossCategory) {
      lines.push(`### \`${dup.pattern.slice(0, 80)}\``);
      lines.push("");
      lines.push("| File | ID |");
      lines.push("|------|----|");
      for (const occ of dup.occurrences) {
        lines.push(`| ${occ.file} | ${occ.id} |`);
      }
      lines.push("");
    }
  }

  lines.push("## Within-Category Duplicates");
  lines.push("");

  if (withinCategory.length === 0) {
    lines.push("✅ No within-category duplicates");
  } else {
    lines.push(`Found ${withinCategory.length} within-category duplicate groups.`);
    lines.push("");

    for (const dup of withinCategory.slice(0, 50)) {
      lines.push(`- \`${dup.pattern.slice(0, 60)}\` in ${dup.occurrences.map(o => o.file).join(", ")}`);
    }

    if (withinCategory.length > 50) {
      lines.push(`... and ${withinCategory.length - 50} more`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("PHASE 0: Bank Inventory");
  console.log("=".repeat(60));
  console.log(`\nData Banks: ${DATA_BANKS_DIR}`);
  console.log(`Audit Dir: ${AUDIT_DIR}\n`);

  // Ensure audit dir exists
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
  }

  // Find all files
  console.log("Finding bank files...");
  const files = findAllBankFiles();
  console.log(`Found ${files.length} files\n`);

  // Load all banks
  console.log("Loading banks...");
  const banks: BankFile[] = [];
  for (const file of files) {
    const bank = loadBankFile(file);
    banks.push(bank);
    if (bank.errors.length > 0) {
      console.log(`  ⚠️ ${bank.relativePath}: ${bank.errors[0]}`);
    }
  }
  console.log(`Loaded ${banks.length} banks\n`);

  // Find duplicates
  console.log("Scanning for duplicates...");
  const duplicates = findDuplicates(banks);
  console.log(`Found ${duplicates.length} duplicate groups\n`);

  // Generate reports
  console.log("Generating reports...");

  const inventoryReport = generateInventoryReport(banks, duplicates);
  fs.writeFileSync(path.join(AUDIT_DIR, "BANK_INVENTORY.md"), inventoryReport);
  console.log(`  ✓ BANK_INVENTORY.md`);

  const duplicatesReport = generateDuplicatesReport(duplicates);
  fs.writeFileSync(path.join(AUDIT_DIR, "DUPLICATES_REPORT.md"), duplicatesReport);
  console.log(`  ✓ DUPLICATES_REPORT.md`);

  // Summary stats
  const totalPatterns = banks.reduce((sum, b) => sum + b.count, 0);
  console.log("\n" + "=".repeat(60));
  console.log("INVENTORY COMPLETE");
  console.log("=".repeat(60));
  console.log(`Total files: ${banks.length}`);
  console.log(`Total patterns: ${totalPatterns}`);
  console.log(`Duplicate groups: ${duplicates.length}`);
  console.log(`Reports saved to: ${AUDIT_DIR}`);
}

main().catch(console.error);
