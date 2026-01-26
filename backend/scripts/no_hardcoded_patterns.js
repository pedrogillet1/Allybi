#!/usr/bin/env node
/**
 * no_hardcoded_patterns.js
 *
 * Build gate script to ensure routing/formatting services use bank-driven patterns
 * instead of hardcoded language regex.
 *
 * Usage:
 *   node scripts/no_hardcoded_patterns.js        # Run scan
 *   node scripts/no_hardcoded_patterns.js --fix  # Show suggested fixes
 *
 * Exit codes:
 *   0 = No hardcoded patterns in forbidden files (PASS)
 *   1 = Hardcoded patterns found (FAIL)
 */

const fs = require('fs');
const path = require('path');

// Files that MUST NOT contain hardcoded routing/language patterns
// These files should use bank-driven patterns via loadPatternBank()
const FORBIDDEN_FILES = [
  'src/services/core/routingPriority.service.ts',
  'src/services/core/decisionTree.service.ts',
  'src/services/core/fileActionResolver.service.ts',
  'src/services/core/kodaFormattingPipelineV3.service.ts',
];

// Files that are LEGACY (flagged for future cleanup)
const LEGACY_WARNINGS = [
  'src/services/core/kodaOrchestratorV3.service.ts',  // Has file action detection regex
  'src/services/core/runtimePatterns.service.ts',     // Has backup patterns
  'src/services/core/contentGuard.service.ts',        // Has some hardcoded lists
];

// Patterns that indicate hardcoded language/routing regex
// These should be loaded from banks instead
const HARDCODED_PATTERNS = [
  // English routing patterns
  /\/\\b\s*where\s+is/i,
  /\/\\b\s*open\s+/i,
  /\/\\b\s*show\s+(me|my)/i,
  /\/\\b\s*list\s+(my|all|the)/i,
  /\/\\b\s*find\s+(file|document)/i,
  /\/\\b\s*compare\s+/i,
  /\/\\b\s*help\b/i,

  // Portuguese routing patterns
  /\/\\b\s*onde\s+est/i,
  /\/\\b\s*abr[aie]/i,
  /\/\\b\s*mostre?\s/i,
  /\/\\b\s*liste?\s/i,
  /\/\\b\s*encontr/i,
  /\/\\b\s*compar/i,
  /\/\\b\s*ajuda\b/i,

  // Formatting patterns that should be bank-driven
  /\/\^\s*here\s+(is|are)/i,
  /\/\^\s*i\s+found/i,
  /\/\^\s*based\s+on/i,
  /\/\^\s*as\s+an\s+ai/i,
  /\/key\s+points/i,
];

// Patterns to exclude (not violations)
const SAFE_EXCLUSIONS = [
  /\/\/.*pattern/i,           // Comments about patterns
  /\*.*pattern/i,             // Block comments
  /loadPatternBank/i,         // Using the bank loader (good!)
  /matchesKeywords/i,         // Using bank keyword matching (good!)
  /from.*patternBankLoader/i, // Import from bank loader (good!)
  /import.*Bank/i,            // Importing bank utilities (good!)
  /\.test\(.*pattern/i,       // Testing if pattern matches (acceptable)
  /console\.log/i,            // Debug logging
  /\/\/\s*TODO/i,             // TODO comments
  /\/\/\s*LEGACY/i,           // Legacy markers
  /\/\/.*FALLBACK/i,          // Fallback comments (gated patterns - only used when bank fails)
];

function getBackendRoot() {
  return path.resolve(__dirname, '..');
}

function isSafeExclusion(line) {
  return SAFE_EXCLUSIONS.some(pattern => pattern.test(line));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    // Skip safe exclusions
    if (isSafeExclusion(line)) return;

    // Check for hardcoded pattern literals
    for (const pattern of HARDCODED_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          line: index + 1,
          content: line.trim().substring(0, 120),
          pattern: pattern.source
        });
        break;
      }
    }
  });

  return violations;
}

function main() {
  const args = process.argv.slice(2);
  const showFix = args.includes('--fix');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const strictMode = args.includes('--strict');

  console.log('='.repeat(60));
  console.log('NO-HARDCODED-PATTERNS GATE' + (strictMode ? ' [STRICT MODE]' : ''));
  console.log('Scanning for hardcoded routing/language patterns...');
  console.log('='.repeat(60));
  console.log();

  const backendRoot = getBackendRoot();
  const allViolations = [];
  const legacyWarnings = [];

  // Scan forbidden files
  console.log('Checking forbidden files (must use banks):');
  for (const relativePath of FORBIDDEN_FILES) {
    const fullPath = path.join(backendRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`  [SKIP] ${relativePath} (not found)`);
      continue;
    }

    const violations = scanFile(fullPath);
    if (violations.length > 0) {
      allViolations.push({ file: relativePath, violations });
      console.log(`  \x1b[31m[FAIL]\x1b[0m ${relativePath} (${violations.length} hardcoded patterns)`);
    } else {
      console.log(`  \x1b[32m[PASS]\x1b[0m ${relativePath}`);
    }
  }

  console.log();

  // Scan legacy files (warnings only)
  if (verbose || strictMode) {
    console.log('Checking legacy files (warnings):');
    for (const relativePath of LEGACY_WARNINGS) {
      const fullPath = path.join(backendRoot, relativePath);
      if (!fs.existsSync(fullPath)) {
        console.log(`  [SKIP] ${relativePath} (not found)`);
        continue;
      }

      const violations = scanFile(fullPath);
      if (violations.length > 0) {
        legacyWarnings.push({ file: relativePath, violations });
        console.log(`  \x1b[33m[WARN]\x1b[0m ${relativePath} (${violations.length} patterns to migrate)`);
      } else {
        console.log(`  \x1b[32m[PASS]\x1b[0m ${relativePath}`);
      }
    }
    console.log();
  }

  console.log('-'.repeat(60));
  console.log('RESULTS');
  console.log('-'.repeat(60));
  console.log();
  console.log(`Forbidden files checked:  ${FORBIDDEN_FILES.length}`);
  console.log(`Violations in forbidden:  ${allViolations.length}`);
  console.log(`Legacy warnings:          ${legacyWarnings.length}`);
  console.log();

  if (allViolations.length === 0) {
    console.log('\x1b[32m%s\x1b[0m', '  PASS: No hardcoded patterns in forbidden files');

    if (legacyWarnings.length > 0 && (verbose || strictMode)) {
      console.log();
      console.log('\x1b[33m%s\x1b[0m', 'Legacy files with patterns to migrate:');
      for (const { file, violations } of legacyWarnings) {
        console.log(`  ${file}: ${violations.length} patterns`);
      }
    }

    console.log();
    process.exit(strictMode && legacyWarnings.length > 0 ? 1 : 0);
  }

  console.log('\x1b[31m%s\x1b[0m', '  FAIL: Hardcoded patterns found in forbidden files!');
  console.log();

  for (const { file, violations } of allViolations) {
    console.log(`\x1b[33m${file}\x1b[0m`);
    for (const v of violations.slice(0, 5)) {
      console.log(`  Line ${v.line}: ${v.content}`);
    }
    if (violations.length > 5) {
      console.log(`  ... and ${violations.length - 5} more`);
    }
    console.log();
  }

  if (showFix) {
    console.log('-'.repeat(60));
    console.log('SUGGESTED FIXES');
    console.log('-'.repeat(60));
    console.log();
    console.log('1. Import the pattern bank loader:');
    console.log();
    console.log('   import { loadPatternBank, matchesKeywords } from "./patternBankLoader.service";');
    console.log();
    console.log('2. Replace hardcoded regex with bank lookups:');
    console.log();
    console.log('   // BEFORE (hardcoded):');
    console.log('   if (/\\bwhere is\\b/i.test(query)) { ... }');
    console.log();
    console.log('   // AFTER (bank-driven):');
    console.log('   const bank = loadPatternBank();');
    console.log('   const locatePatterns = bank.fileActionOperators.locate_file;');
    console.log('   if (matchesKeywords(query, locatePatterns[lang])) { ... }');
    console.log();
    console.log('3. Add patterns to the appropriate bank file:');
    console.log('   - src/data/pattern_bank_master.json (routing patterns)');
    console.log('   - src/data_banks/formatting/* (formatting patterns)');
    console.log();
    console.log('4. Bank-driven benefits:');
    console.log('   - Easy to extend without code changes');
    console.log('   - Multilingual support (en/pt/es)');
    console.log('   - Testable and auditable');
    console.log('   - Single source of truth');
    console.log();
  }

  console.log('Run with --fix to see suggested fixes');
  console.log();
  process.exit(1);
}

main();
