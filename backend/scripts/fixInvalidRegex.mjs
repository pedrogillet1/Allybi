/**
 * REGEX VALIDATION AND REPAIR SCRIPT
 *
 * STRICTLY LIMITED to fixing INVALID REGEX SYNTAX.
 * Does NOT modify logic, semantics, structure, counts, tiers, or routing behavior.
 *
 * RULES:
 * - 1:1 replacement only
 * - No deletions, merges, or simplifications
 * - Minimal changes to make regex compile
 * - Unfixable patterns are flagged, not removed
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';
const INPUT_FILE = path.join(DATA_DIR, 'intent_patterns.json');
const BACKUP_FILE = path.join(DATA_DIR, 'intent_patterns.backup.json');
const REPORT_FILE = path.join(DATA_DIR, 'regex_fix_report.json');

// Stats
const stats = {
  totalScanned: 0,
  totalValid: 0,
  totalInvalid: 0,
  totalFixed: 0,
  totalUnfixable: 0,
  fixes: []
};

/**
 * Test if a regex compiles
 */
function isValidRegex(pattern) {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get the compilation error
 */
function getRegexError(pattern) {
  try {
    new RegExp(pattern, 'i');
    return null;
  } catch (e) {
    return e.message;
  }
}

/**
 * MINIMAL fix for common regex syntax errors
 * Returns { fixed: string, reason: string } or null if unfixable
 */
function minimalFix(pattern) {
  let fixed = pattern;
  const reasons = [];

  // Fix 1: Unbalanced parentheses - remove extra closing parens
  // Count open and close parens (not inside character classes)
  let inCharClass = false;
  let escaped = false;
  let openCount = 0;
  let closeCount = 0;

  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '[' && !inCharClass) {
      inCharClass = true;
      continue;
    }
    if (char === ']' && inCharClass) {
      inCharClass = false;
      continue;
    }
    if (!inCharClass) {
      if (char === '(') openCount++;
      if (char === ')') closeCount++;
    }
  }

  // If more closing than opening, we need to remove extra )
  if (closeCount > openCount) {
    const excess = closeCount - openCount;
    // Remove excess closing parens from right to left
    let removed = 0;
    let newFixed = '';
    for (let i = fixed.length - 1; i >= 0; i--) {
      const char = fixed[i];
      // Check if this ) is not escaped and not in char class
      let isEscaped = false;
      let backslashCount = 0;
      for (let j = i - 1; j >= 0 && fixed[j] === '\\'; j--) {
        backslashCount++;
      }
      isEscaped = backslashCount % 2 === 1;

      if (char === ')' && !isEscaped && removed < excess) {
        // Check if in char class (simplified check)
        let inClass = false;
        let depth = 0;
        for (let j = 0; j < i; j++) {
          if (fixed[j] === '\\') { j++; continue; }
          if (fixed[j] === '[') depth++;
          if (fixed[j] === ']') depth--;
        }
        inClass = depth > 0;

        if (!inClass) {
          removed++;
          continue; // Skip this paren
        }
      }
      newFixed = char + newFixed;
    }
    if (removed > 0) {
      fixed = newFixed;
      reasons.push(`removed ${removed} extra closing paren(s)`);
    }
  }

  // If more opening than closing, add closing parens at end
  if (openCount > closeCount) {
    const deficit = openCount - closeCount;
    fixed = fixed + ')'.repeat(deficit);
    reasons.push(`added ${deficit} closing paren(s)`);
  }

  // Fix 2: Unescaped special chars in alternation (like |+, |?, |*)
  // Pattern: empty alternation like (?:foo|) or (|bar)
  fixed = fixed.replace(/\(\?:([^)]*)\|\)/g, '(?:$1)?');
  if (fixed !== pattern && !reasons.includes('fixed empty alternation')) {
    // Check if this change was made
    const orig = pattern.match(/\(\?:([^)]*)\|\)/g);
    if (orig) reasons.push('fixed empty alternation');
  }

  // Fix 3: Unescaped ? or + at start of alternation
  // (?:¿|?) -> (?:¿|\\?)
  fixed = fixed.replace(/\|(\?)\)/g, '|\\$1)');
  fixed = fixed.replace(/\|(\+)\)/g, '|\\$1)');
  fixed = fixed.replace(/\|(\*)\)/g, '|\\$1)');
  if (fixed !== pattern && reasons.length === 0) {
    reasons.push('escaped special char in alternation');
  }

  // Fix 4: Leading quantifier (nothing to repeat)
  // (?:foo|+) means + needs escaping
  fixed = fixed.replace(/\|(\+)(?=[|)])/g, '|\\+');
  fixed = fixed.replace(/\|(\?)(?=[|)])/g, '|\\?');
  fixed = fixed.replace(/\|(\*)(?=[|)])/g, '|\\*');

  // Check if fixed
  if (isValidRegex(fixed)) {
    if (fixed !== pattern) {
      return { fixed, reason: reasons.join('; ') || 'syntax correction' };
    }
    return null; // Was already valid
  }

  // If still invalid, try more aggressive fixes

  // Fix 5: Double closing parens ))
  const doubleParenPattern = /\)\)\s*(?:\\s|$|\[|\\b)/g;
  if (doubleParenPattern.test(fixed)) {
    // This is a heuristic - might have false positives
  }

  // Return null if we couldn't fix it
  if (!isValidRegex(fixed)) {
    return null;
  }

  return { fixed, reason: reasons.join('; ') || 'syntax correction' };
}

/**
 * Process a single pattern object
 */
function processPattern(patternObj, intentName, lang) {
  if (!patternObj.pattern) return patternObj;

  stats.totalScanned++;
  const pattern = patternObj.pattern;

  if (isValidRegex(pattern)) {
    stats.totalValid++;
    return patternObj;
  }

  stats.totalInvalid++;
  const error = getRegexError(pattern);

  const fix = minimalFix(pattern);

  if (fix && isValidRegex(fix.fixed)) {
    stats.totalFixed++;
    stats.fixes.push({
      intent: intentName,
      language: lang,
      original: pattern,
      fixed: fix.fixed,
      reason: fix.reason,
      error: error
    });
    return { ...patternObj, pattern: fix.fixed };
  } else {
    stats.totalUnfixable++;
    stats.fixes.push({
      intent: intentName,
      language: lang,
      original: pattern,
      fixed: null,
      reason: 'UNFIXABLE - left as-is',
      error: error
    });
    return patternObj; // Leave as-is per spec
  }
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('REGEX VALIDATION AND REPAIR AGENT');
  console.log('='.repeat(60));
  console.log('');
  console.log('Loading intent_patterns.json...');

  // Read the file
  const content = fs.readFileSync(INPUT_FILE, 'utf-8');
  const data = JSON.parse(content);

  // Create backup
  console.log('Creating backup...');
  fs.writeFileSync(BACKUP_FILE, content);
  console.log(`Backup saved to: ${BACKUP_FILE}`);
  console.log('');

  // Count original patterns for verification
  // Structure: intents.INTENT_NAME.patterns.LANG[]
  let originalPatternCount = 0;
  for (const intentName of Object.keys(data.intents)) {
    const intent = data.intents[intentName];
    if (intent.patterns) {
      for (const lang of Object.keys(intent.patterns)) {
        if (Array.isArray(intent.patterns[lang])) {
          originalPatternCount += intent.patterns[lang].length;
        }
      }
    }
  }
  console.log(`Original pattern count: ${originalPatternCount}`);
  console.log('');

  // Process all patterns
  console.log('Scanning and fixing patterns...');
  for (const intentName of Object.keys(data.intents)) {
    const intent = data.intents[intentName];
    if (intent.patterns) {
      for (const lang of Object.keys(intent.patterns)) {
        if (Array.isArray(intent.patterns[lang])) {
          intent.patterns[lang] = intent.patterns[lang].map(p =>
            processPattern(p, intentName, lang)
          );
        }
      }
    }
  }

  // Verify count integrity
  let finalPatternCount = 0;
  for (const intentName of Object.keys(data.intents)) {
    const intent = data.intents[intentName];
    if (intent.patterns) {
      for (const lang of Object.keys(intent.patterns)) {
        if (Array.isArray(intent.patterns[lang])) {
          finalPatternCount += intent.patterns[lang].length;
        }
      }
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('REPORT');
  console.log('='.repeat(60));
  console.log(`Total regex scanned:  ${stats.totalScanned}`);
  console.log(`Total valid:          ${stats.totalValid}`);
  console.log(`Total invalid found:  ${stats.totalInvalid}`);
  console.log(`Total fixed:          ${stats.totalFixed}`);
  console.log(`Total unfixable:      ${stats.totalUnfixable}`);
  console.log('');
  console.log(`Original count: ${originalPatternCount}`);
  console.log(`Final count:    ${finalPatternCount}`);
  console.log(`Count match:    ${originalPatternCount === finalPatternCount ? '✅ YES' : '❌ NO - ABORT'}`);

  if (originalPatternCount !== finalPatternCount) {
    console.error('');
    console.error('❌ COUNT MISMATCH - ABORTING');
    console.error('No changes written.');
    process.exit(1);
  }

  // Save report
  console.log('');
  console.log('Saving report...');
  fs.writeFileSync(REPORT_FILE, JSON.stringify({
    summary: {
      totalScanned: stats.totalScanned,
      totalValid: stats.totalValid,
      totalInvalid: stats.totalInvalid,
      totalFixed: stats.totalFixed,
      totalUnfixable: stats.totalUnfixable,
      originalCount: originalPatternCount,
      finalCount: finalPatternCount,
      countIntegrity: originalPatternCount === finalPatternCount
    },
    fixes: stats.fixes
  }, null, 2));
  console.log(`Report saved to: ${REPORT_FILE}`);

  // Show fixes
  if (stats.fixes.length > 0) {
    console.log('');
    console.log('FIXES APPLIED:');
    console.log('-'.repeat(60));
    for (const fix of stats.fixes.slice(0, 20)) { // Show first 20
      console.log(`[${fix.intent}/${fix.language}]`);
      console.log(`  Error:    ${fix.error}`);
      console.log(`  Original: ${fix.original.substring(0, 80)}...`);
      if (fix.fixed) {
        console.log(`  Fixed:    ${fix.fixed.substring(0, 80)}...`);
        console.log(`  Reason:   ${fix.reason}`);
      } else {
        console.log(`  Status:   UNFIXABLE - left as-is`);
      }
      console.log('');
    }
    if (stats.fixes.length > 20) {
      console.log(`... and ${stats.fixes.length - 20} more (see report file)`);
    }
  }

  // Write fixed file
  console.log('');
  console.log('Writing fixed file...');
  fs.writeFileSync(INPUT_FILE, JSON.stringify(data, null, 2));
  console.log('✅ Done!');
}

main().catch(console.error);
