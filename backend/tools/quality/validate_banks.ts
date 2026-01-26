#!/usr/bin/env npx ts-node
/**
 * Validate Data Banks - Verify all registered banks can be loaded
 *
 * Usage: npx ts-node tools/quality/validate_banks.ts
 */

import * as path from 'path';
import {
  initDataBankLoader,
  validateAllBanks,
  loadRequiredBanks,
  getBankCacheStats,
  findUnregisteredFiles,
  DATA_BANK_REGISTRY,
} from '../../src/services/core/dataBankLoader';

const DATA_DIR = path.join(__dirname, '../../src/data');

function main() {
  console.log('='.repeat(70));
  console.log('DATA BANK VALIDATION');
  console.log('='.repeat(70));

  // Initialize loader
  initDataBankLoader(DATA_DIR);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Registered banks: ${DATA_BANK_REGISTRY.length}`);
  console.log('');

  // Validate all banks
  console.log('--- Validating all registered banks ---');
  const validation = validateAllBanks();

  if (validation.valid) {
    console.log('[PASS] All registered banks are valid JSON');
  } else {
    console.log('[FAIL] Validation errors:');
    for (const err of validation.errors) {
      console.log(`  - ${err}`);
    }
  }
  console.log('');

  // Load required banks
  console.log('--- Loading required banks ---');
  try {
    loadRequiredBanks();
    console.log('[PASS] All required banks loaded successfully');
  } catch (err: any) {
    console.log(`[FAIL] ${err.message}`);
  }
  console.log('');

  // Check for unregistered files
  console.log('--- Checking for unregistered files ---');
  const unregistered = findUnregisteredFiles();
  if (unregistered.length === 0) {
    console.log('[PASS] No unregistered JSON files');
  } else {
    console.log(`[INFO] ${unregistered.length} unregistered files:`);
    for (const f of unregistered.slice(0, 10)) {
      console.log(`  - ${f}`);
    }
    if (unregistered.length > 10) {
      console.log(`  ... and ${unregistered.length - 10} more`);
    }
  }
  console.log('');

  // Cache stats
  console.log('--- Cache Statistics ---');
  const stats = getBankCacheStats();
  console.log(`  Total registered: ${stats.totalRegistered}`);
  console.log(`  Total loaded: ${stats.totalLoaded}`);
  console.log(`  Deprecated files found: ${stats.deprecatedFilesFound.length}`);
  console.log('');

  // Summary
  console.log('='.repeat(70));
  if (validation.valid) {
    console.log('[VALIDATION PASSED]');
  } else {
    console.log('[VALIDATION FAILED]');
    process.exit(1);
  }
}

main();
