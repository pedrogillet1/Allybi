#!/usr/bin/env node
/**
 * no_done_bypass.js
 *
 * Build gate script to ensure all `done` events flow through AnswerComposerV1.
 * This prevents direct SSE emission that bypasses composer validation.
 *
 * Usage:
 *   node scripts/no_done_bypass.js        # Run scan
 *   node scripts/no_done_bypass.js --fix  # Show suggested fixes
 *
 * Exit codes:
 *   0 = All done events are allowlisted (PASS)
 *   1 = Unauthorized done emissions found (FAIL)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Files that are ALLOWED to emit done events directly
// STRICT MODE: Only the composer and final SSE controller are allowed
const ALLOWLIST_STRICT = [
  'src/services/core/answerComposer.service.ts',      // THE ONLY composer - all answers go here
  'src/controllers/rag.controller.ts',                 // Final SSE emit (calls composer)
];

// Files that are TEMPORARILY allowed (must be refactored to use composer)
const ALLOWLIST_LEGACY = [
  'src/services/core/kodaOrchestratorV3.service.ts',  // TODO: Refactor to delegate ALL to composer
  'src/services/core/kodaAnswerEngineV3.service.ts',  // TODO: Refactor to yield to composer only
];

// Combined allowlist (legacy will be removed once refactored)
const ALLOWLIST = [...ALLOWLIST_STRICT, ...ALLOWLIST_LEGACY];

// Files that contain TYPE DEFINITIONS only (not actual emissions)
const TYPE_DEFINITION_FILES = [
  '.types.ts',
  '.schema.ts',
  '.interface.ts',
  '.d.ts',
];

// Patterns that indicate a done event emission
const DONE_PATTERNS = [
  /emit\s*\(\s*['"`]done['"`]/gi,
  /type:\s*['"`]done['"`]/gi,
  /eventType\s*[:=]\s*['"`]done['"`]/gi,
  /\.write\s*\(\s*['"`]data:\s*\{[^}]*"type"\s*:\s*"done"/gi,
  /res\.(write|send)\s*\([^)]*done/gi,
];

// Additional patterns for --strict mode (catch fullAnswer construction outside composer)
const STRICT_PATTERNS = [
  /fullAnswer\s*[:=]/gi,                              // Constructing fullAnswer
  /attachments\s*[:=]\s*\[/gi,                        // Constructing attachments array
  /sourceButtons\s*[:=]/gi,                           // Constructing source buttons
  /fileList\s*[:=]/gi,                                // Constructing file list payload
  /followupSuggestions\s*[:=]/gi,                     // Constructing followups
];

// Patterns that are FALSE POSITIVES (safe to ignore)
const SAFE_PATTERNS = [
  /\/\/.*done/i,                              // Comment mentioning done
  /\*.*done/i,                                // Block comment
  /'done'\s*===\s*type/i,                     // Type check, not emission
  /type\s*===\s*['"`]done['"`]/i,             // Type check
  /if\s*\([^)]*done/i,                        // Conditional check
  /case\s+['"`]done['"`]/i,                   // Switch case
  /\.on\s*\(\s*['"`]done['"`]/i,              // Event listener
  /waitFor.*done/i,                           // Test helper
  /expect.*done/i,                            // Test assertion
];

function getBackendRoot() {
  return path.resolve(__dirname, '..');
}

function findTsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip node_modules, dist, tests, __tests__
      if (!['node_modules', 'dist', '__tests__', 'tests', '.git', 'lambda'].includes(item)) {
        findTsFiles(fullPath, files);
      }
    } else if (item.endsWith('.ts') && !item.endsWith('.test.ts') && !item.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function isAllowlisted(filePath, backendRoot) {
  const relative = path.relative(backendRoot, filePath);
  return ALLOWLIST.some(allowed => relative === allowed || relative.endsWith(allowed));
}

function isTypeDefinitionFile(filePath) {
  return TYPE_DEFINITION_FILES.some(suffix => filePath.endsWith(suffix));
}

function isSafePattern(line) {
  return SAFE_PATTERNS.some(pattern => pattern.test(line));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    // Skip safe patterns
    if (isSafePattern(line)) return;

    // Check for done emission patterns
    for (const pattern of DONE_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          line: index + 1,
          content: line.trim().substring(0, 100),
          pattern: pattern.source
        });
        break;
      }
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
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
  console.log('NO-DONE-BYPASS GATE' + (strictMode ? ' [STRICT MODE]' : ''));
  console.log('Scanning for unauthorized done event emissions...');
  console.log('='.repeat(60));
  console.log();

  if (strictMode) {
    console.log('\x1b[33m%s\x1b[0m', 'STRICT MODE: Only answerComposer.service.ts may emit done events');
    console.log('Legacy files will be flagged for refactoring.\n');
  }

  const backendRoot = getBackendRoot();
  const srcDir = path.join(backendRoot, 'src');

  if (!fs.existsSync(srcDir)) {
    console.error('ERROR: src directory not found at', srcDir);
    process.exit(1);
  }

  const tsFiles = findTsFiles(srcDir);
  console.log(`Scanning ${tsFiles.length} TypeScript files...\n`);

  const allViolations = [];
  const legacyWarnings = [];
  let allowlistedCount = 0;
  let legacyCount = 0;
  let typeDefCount = 0;

  // Helper to check if file is in strict allowlist only
  function isStrictAllowed(filePath) {
    const relative = path.relative(backendRoot, filePath);
    return ALLOWLIST_STRICT.some(allowed => relative === allowed || relative.endsWith(allowed));
  }

  // Helper to check if file is in legacy allowlist
  function isLegacyAllowed(filePath) {
    const relative = path.relative(backendRoot, filePath);
    return ALLOWLIST_LEGACY.some(allowed => relative === allowed || relative.endsWith(allowed));
  }

  for (const filePath of tsFiles) {
    const relative = path.relative(backendRoot, filePath);

    // Skip type definition files (they define the schema, not emit events)
    if (isTypeDefinitionFile(filePath)) {
      const violations = scanFile(filePath);
      if (violations.length > 0) {
        typeDefCount++;
        if (verbose) {
          console.log(`[TYPE-DEF] ${relative} (${violations.length} type definitions)`);
        }
      }
      continue;
    }

    const violations = scanFile(filePath);

    if (violations.length > 0) {
      if (isStrictAllowed(filePath)) {
        // Fully allowed - this is the composer or controller
        allowlistedCount++;
        if (verbose) {
          console.log(`[ALLOWLISTED] ${relative} (${violations.length} done emissions)`);
        }
      } else if (isLegacyAllowed(filePath)) {
        // Legacy file - allowed but flagged for refactoring
        legacyCount++;
        legacyWarnings.push({
          file: relative,
          violations,
          message: 'LEGACY: This file should be refactored to use AnswerComposerV1'
        });
        if (verbose || strictMode) {
          console.log(`\x1b[33m[LEGACY]\x1b[0m ${relative} (${violations.length} done emissions - needs refactor)`);
        }
      } else {
        allViolations.push({
          file: relative,
          violations
        });
      }
    }
  }

  console.log();
  console.log('-'.repeat(60));
  console.log('RESULTS');
  console.log('-'.repeat(60));
  console.log();
  console.log(`Files scanned:       ${tsFiles.length}`);
  console.log(`Allowlisted files:   ${allowlistedCount}`);
  console.log(`Legacy files:        ${legacyCount}`);
  console.log(`Type def files:      ${typeDefCount}`);
  console.log(`Violations found:    ${allViolations.length}`);
  console.log();

  // Show legacy warnings in strict mode
  if (strictMode && legacyWarnings.length > 0) {
    console.log('\x1b[33m%s\x1b[0m', 'LEGACY FILES (must be refactored to use AnswerComposerV1):');
    console.log();
    for (const { file, violations, message } of legacyWarnings) {
      console.log(`  \x1b[33m${file}\x1b[0m`);
      console.log(`    ${message}`);
      for (const v of violations.slice(0, 3)) {
        console.log(`    Line ${v.line}: ${v.content}`);
      }
      if (violations.length > 3) {
        console.log(`    ... and ${violations.length - 3} more`);
      }
    }
    console.log();
  }

  if (allViolations.length === 0) {
    if (strictMode && legacyWarnings.length > 0) {
      console.log('\x1b[33m%s\x1b[0m', '  WARN: No new violations, but legacy files need refactoring');
    } else {
      console.log('\x1b[32m%s\x1b[0m', '  PASS: All done events flow through allowlisted files');
    }
    console.log();
    console.log('Strict Allowlist (permanent):');
    ALLOWLIST_STRICT.forEach(f => console.log(`  \x1b[32m✓\x1b[0m ${f}`));
    if (legacyCount > 0) {
      console.log();
      console.log('Legacy Allowlist (to be removed):');
      ALLOWLIST_LEGACY.forEach(f => console.log(`  \x1b[33m⚠\x1b[0m ${f}`));
    }
    console.log();
    process.exit(strictMode && legacyWarnings.length > 0 ? 1 : 0);
  }

  console.log('\x1b[31m%s\x1b[0m', '  FAIL: Unauthorized done event emissions detected!');
  console.log();

  for (const { file, violations } of allViolations) {
    console.log(`\x1b[33m${file}\x1b[0m`);
    for (const v of violations) {
      console.log(`  Line ${v.line}: ${v.content}`);
    }
    console.log();
  }

  if (showFix) {
    console.log('-'.repeat(60));
    console.log('SUGGESTED FIXES');
    console.log('-'.repeat(60));
    console.log();
    console.log('1. Route all done events through AnswerComposerV1:');
    console.log();
    console.log('   import { getAnswerComposer } from "./core/answerComposer.service";');
    console.log('   const composer = getAnswerComposer();');
    console.log();
    console.log('   // For handler results:');
    console.log('   const composed = composer.compose({');
    console.log('     rawAnswer: handlerResult.answer,');
    console.log('     context: { operator, intentFamily, docScope, domain, language },');
    console.log('     constraints: { outputShape, bulletCount, maxFollowups }');
    console.log('   });');
    console.log();
    console.log('2. For error cases, use composer.composeError():');
    console.log('   const errorDone = composer.composeError(error, context);');
    console.log();
    console.log('3. NEVER construct these objects outside AnswerComposerV1:');
    console.log('   - fullAnswer (must go through composer)');
    console.log('   - attachments (must be built by composer)');
    console.log('   - sourceButtons (must be added by composer)');
    console.log('   - followupSuggestions (must be selected by composer)');
    console.log();
    console.log('4. Adding to ALLOWLIST is NOT recommended.');
    console.log('   The goal is to have exactly 2 files in ALLOWLIST_STRICT:');
    console.log('   - answerComposer.service.ts (builds the done event)');
    console.log('   - rag.controller.ts (emits the done event)');
    console.log();
  }

  console.log('Run with --fix to see suggested fixes');
  console.log();
  process.exit(1);
}

main();
