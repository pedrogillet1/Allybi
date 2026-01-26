#!/usr/bin/env npx ts-node
/**
 * Report Unused Banks - Identifies dead/unused data bank files
 *
 * Usage: npx ts-node tools/quality/report_unused_banks.ts
 *
 * This script:
 * 1. Lists all JSON files in src/data/
 * 2. Checks each against the registry
 * 3. Scans codebase for references
 * 4. Reports: used / unused / deprecated / unregistered
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DATA_DIR = path.join(__dirname, '../../src/data');
const SRC_DIR = path.join(__dirname, '../../src');
const TOOLS_DIR = path.join(__dirname, '../');

// Import registry
import {
  DATA_BANK_REGISTRY,
  DEPRECATED_FILES,
  getBankByFilename,
} from '../../src/services/core/dataBankRegistry';

interface BankReport {
  filename: string;
  inRegistry: boolean;
  isDeprecated: boolean;
  runtimeRefs: number;
  toolRefs: number;
  classification: 'RUNTIME' | 'TOOL-ONLY' | 'DEPRECATED' | 'UNREGISTERED' | 'DEAD';
  registryId?: string;
  consumers?: string[];
}

function countReferences(filename: string, searchDir: string): number {
  try {
    const name = filename.replace('.json', '');
    const result = execSync(
      `grep -rln "${name}\\|${filename}" "${searchDir}" --include="*.ts" 2>/dev/null | wc -l`,
      { encoding: 'utf-8' }
    );
    return parseInt(result.trim()) || 0;
  } catch {
    return 0;
  }
}

function analyzeBank(filename: string): BankReport {
  const entry = getBankByFilename(filename);
  const isDeprecated = DEPRECATED_FILES.includes(filename);
  const runtimeRefs = countReferences(filename, path.join(SRC_DIR, 'services'));
  const toolRefs = countReferences(filename, TOOLS_DIR);

  let classification: BankReport['classification'];

  if (isDeprecated) {
    classification = 'DEPRECATED';
  } else if (!entry) {
    classification = runtimeRefs > 0 || toolRefs > 0 ? 'UNREGISTERED' : 'DEAD';
  } else if (runtimeRefs > 0) {
    classification = 'RUNTIME';
  } else if (toolRefs > 0) {
    classification = 'TOOL-ONLY';
  } else {
    classification = 'DEAD';
  }

  return {
    filename,
    inRegistry: !!entry,
    isDeprecated,
    runtimeRefs,
    toolRefs,
    classification,
    registryId: entry?.id,
    consumers: entry?.consumers,
  };
}

function main() {
  console.log('='.repeat(70));
  console.log('DATA BANK USAGE REPORT');
  console.log('='.repeat(70));
  console.log(`Scanning: ${DATA_DIR}`);
  console.log(`Registry entries: ${DATA_BANK_REGISTRY.length}`);
  console.log(`Deprecated list: ${DEPRECATED_FILES.length}`);
  console.log('');

  // Get all JSON files
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  console.log(`Found ${files.length} JSON files\n`);

  // Analyze each
  const reports = files.map(analyzeBank);

  // Group by classification
  const byClass: Record<string, BankReport[]> = {
    'RUNTIME': [],
    'TOOL-ONLY': [],
    'DEPRECATED': [],
    'UNREGISTERED': [],
    'DEAD': [],
  };

  for (const r of reports) {
    byClass[r.classification].push(r);
  }

  // Print summary
  console.log('SUMMARY');
  console.log('-'.repeat(50));
  console.log(`  RUNTIME (production):  ${byClass['RUNTIME'].length}`);
  console.log(`  TOOL-ONLY:             ${byClass['TOOL-ONLY'].length}`);
  console.log(`  DEPRECATED (marked):   ${byClass['DEPRECATED'].length}`);
  console.log(`  UNREGISTERED (refs):   ${byClass['UNREGISTERED'].length}`);
  console.log(`  DEAD (no refs):        ${byClass['DEAD'].length}`);
  console.log('');

  // Print details for each category
  for (const [cat, list] of Object.entries(byClass)) {
    if (list.length === 0) continue;

    console.log(`\n=== ${cat} (${list.length}) ===`);
    for (const r of list) {
      const refs = `runtime=${r.runtimeRefs}, tools=${r.toolRefs}`;
      const regInfo = r.registryId ? `[${r.registryId}]` : '[NOT REGISTERED]';
      console.log(`  ${r.filename} - ${refs} ${regInfo}`);
    }
  }

  // Actionable recommendations
  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDATIONS');
  console.log('-'.repeat(50));

  if (byClass['DEAD'].length > 0) {
    console.log(`\n[DELETE] these ${byClass['DEAD'].length} dead files:`);
    for (const r of byClass['DEAD']) {
      console.log(`   rm src/data/${r.filename}`);
    }
  }

  if (byClass['UNREGISTERED'].length > 0) {
    console.log(`\n[REGISTER] these ${byClass['UNREGISTERED'].length} files or mark deprecated:`);
    for (const r of byClass['UNREGISTERED']) {
      console.log(`   - ${r.filename} (${r.runtimeRefs + r.toolRefs} refs)`);
    }
  }

  if (byClass['DEPRECATED'].length > 0) {
    console.log(`\n[DEPRECATED] files (safe to delete when confirmed unused):`);
    for (const r of byClass['DEPRECATED']) {
      if (r.runtimeRefs + r.toolRefs > 0) {
        console.log(`   WARNING: ${r.filename} - STILL HAS ${r.runtimeRefs + r.toolRefs} REFS!`);
      } else {
        console.log(`   OK ${r.filename} - safe to delete`);
      }
    }
  }

  // Exit with error if there are issues
  const hasIssues = byClass['DEAD'].length > 0 || byClass['UNREGISTERED'].length > 0;
  if (hasIssues) {
    console.log('\n[FAILED] BANK HYGIENE CHECK - see recommendations above');
    process.exit(1);
  } else {
    console.log('\n[PASSED] BANK HYGIENE CHECK');
  }
}

main();
