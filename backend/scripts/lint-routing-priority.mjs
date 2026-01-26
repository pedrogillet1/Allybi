#!/usr/bin/env node
/**
 * lint-routing-priority.mjs
 *
 * Build gate that forbids hardcoded regex patterns in routingPriority.service.ts.
 * All routing patterns must come from data banks (routing_rules.any.json, etc.)
 *
 * Usage: node scripts/lint-routing-priority.mjs
 * Exit code: 0 = pass, 1 = fail
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROUTING_FILE = path.join(__dirname, '../src/services/core/routingPriority.service.ts');

// Patterns that are FORBIDDEN in routingPriority.service.ts
const FORBIDDEN_PATTERNS = [
  // Inline regex literals that match query content
  /\/(\\b|\\s|\\w|\\d|\[\^)[^/]{10,}\/[gim]*(?![;,]?\s*(\/\/|$))/g,  // Complex regex (10+ chars)
  /\/\\b(where|what|which|how|list|show|open|compare|summarize|extract)/gi,
  /\/\\b(file|document|folder|pdf|xlsx|docx)/gi,

  // Hardcoded phrase matching
  /\.test\s*\(\s*(query|normalizedQuery|q|text)/gi,
  /\.match\s*\(\s*(query|normalizedQuery|q|text)/gi,
  /\.includes\s*\(\s*['"`](where|what|which|how|list|show|open|find|locate|compare|summarize|extract)/gi,

  // Inline pattern arrays that should be in banks
  /const\s+\w*PATTERN\w*\s*[:=]\s*\[/gi,
  /const\s+\w*ANCHOR\w*\s*[:=]\s*\[/gi,
  /const\s+\w*KEYWORD\w*\s*[:=]\s*\[/gi,
  /const\s+\w*PHRASE\w*\s*[:=]\s*\[/gi,

  // Inline boosts based on string content
  /if\s*\(\s*\/[^/]+\/.test\s*\(\s*(query|q)\s*\)/gi,
];

// Patterns that are ALLOWED (whitelisted)
const ALLOWED_PATTERNS = [
  // Import statements
  /^import\s+/m,
  // Type definitions
  /type\s+\w+\s*=/,
  /interface\s+\w+/,
  // Comments
  /\/\/.*/,
  /\/\*[\s\S]*?\*\//,
  // Tests
  /\.test\.ts$/,
  /\.spec\.ts$/,
];

function checkFile() {
  console.log('🔍 Linting routingPriority.service.ts for forbidden regex patterns...\n');

  if (!fs.existsSync(ROUTING_FILE)) {
    console.error(`❌ File not found: ${ROUTING_FILE}`);
    process.exit(1);
  }

  const content = fs.readFileSync(ROUTING_FILE, 'utf-8');
  const lines = content.split('\n');

  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments and imports
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('import')) {
      continue;
    }

    // Check each forbidden pattern
    for (const pattern of FORBIDDEN_PATTERNS) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;

      const match = pattern.exec(line);
      if (match) {
        violations.push({
          line: lineNum,
          column: match.index + 1,
          text: line.trim().substring(0, 80),
          pattern: pattern.toString().substring(0, 40),
          match: match[0].substring(0, 50),
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log('✅ routingPriority.service.ts is clean - no forbidden patterns found\n');
    console.log('   All routing logic uses bank-driven RoutingSignals.\n');
    process.exit(0);
  }

  console.log(`❌ Found ${violations.length} forbidden pattern(s):\n`);

  for (const v of violations) {
    console.log(`  Line ${v.line}:${v.column}`);
    console.log(`  ${v.text}${v.text.length >= 80 ? '...' : ''}`);
    console.log(`  Pattern: ${v.pattern}...`);
    console.log(`  Match: "${v.match}${v.match.length >= 50 ? '...' : ''}"\n`);
  }

  console.log('\n📝 REMEDY: Move these patterns to data banks:');
  console.log('   - routing/routing_rules.any.json (for boost/dampen rules)');
  console.log('   - triggers/*.json (for intent triggers)');
  console.log('   - negatives/*.json (for blocking rules)\n');

  process.exit(1);
}

checkFile();
