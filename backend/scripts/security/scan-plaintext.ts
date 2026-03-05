#!/usr/bin/env npx ts-node
/**
 * Plaintext Field Scanner
 *
 * Scans the codebase for potential plaintext writes to sensitive database fields.
 * Fails CI if any sensitive field is written without using encryption.
 *
 * Usage: npx ts-node scripts/security/scan-plaintext.ts
 * Exit codes: 0 = pass, 1 = violations found
 */

import * as fs from 'fs';
import * as path from 'path';

// Sensitive fields that should NEVER contain plaintext
const SENSITIVE_FIELDS = [
  // Document fields
  'filename:',
  'extractedText:',
  'previewText:',
  'displayTitle:',
  'rawText:',
  'renderableContent:',
  // Chunk fields
  'text:',
  // Message fields
  'content:',
  // Conversation fields
  'title:',
  // 2FA fields
  'secret:',
  'backupCodes:',
  // Metadata fields
  'entities:',
  'classification:',
];

// Patterns that indicate safe encrypted writes or non-DB operations
const SAFE_PATTERNS = [
  'Encrypted:',
  'null',
  'undefined',
  'encrypt',
  'decrypt',
  // Response patterns (not DB writes)
  'res.json',
  'res.status',
  'socket.emit',
  'sink.write',
  'emit(',
  // Type definitions
  ': Array<',
  ': string',
  ': number',
  'interface ',
  'type ',
  // Variable declarations (reading, not writing)
  'const {',
  'let {',
  'updated.',
  '.id,',
  // Intentional fallback markers (reviewed and approved)
  'SECURITY:PLAINTEXT_FALLBACK',
  'plaintext fallback',
];

// Directories to scan
const SCAN_DIRS = [
  'src/services',
  'src/controllers',
  'src/routes',
];

// Files to skip
const SKIP_FILES = [
  'crypto.service.ts',
  'encryption.service.ts',
  '.test.ts',
  '.spec.ts',
  // Non-database service files
  'geminiStreamAdapter.service.ts',
  'geminiToolAdapter.service.ts',
  'promptConfig.service.ts',
  'localStreamAdapter.service.ts',
  // Navigation and display services (not DB writes)
  'folderNavigation.service.ts',
  // App service layer (streaming/orchestration, not direct DB)
  'chatApp.service.ts',
];

interface Violation {
  file: string;
  line: number;
  code: string;
  field: string;
}

function shouldSkipFile(filePath: string): boolean {
  return SKIP_FILES.some(skip => filePath.includes(skip));
}

function isSafeWrite(line: string): boolean {
  const lowerLine = line.toLowerCase();
  return SAFE_PATTERNS.some(pattern => lowerLine.includes(pattern.toLowerCase()));
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      return;
    }

    // Check for Prisma create/update patterns with sensitive fields
    const isPrismaWrite = line.includes('create(') ||
                          line.includes('update(') ||
                          line.includes('upsert(') ||
                          line.includes('data:');

    if (!isPrismaWrite) return;

    for (const field of SENSITIVE_FIELDS) {
      // Look for field assignments that aren't encrypted
      const fieldRegex = new RegExp(`${field.replace(':', '')}\\s*:\\s*[^,}]+`, 'i');
      const match = line.match(fieldRegex);

      if (match && !isSafeWrite(line)) {
        // Check surrounding context (prev/next lines) for encryption
        const prevLine = lines[index - 1] || '';
        const nextLine = lines[index + 1] || '';
        const context = prevLine + line + nextLine;

        if (!isSafeWrite(context)) {
          violations.push({
            file: filePath,
            line: index + 1,
            code: line.trim().substring(0, 100),
            field: field.replace(':', ''),
          });
        }
      }
    }
  });

  return violations;
}

function scanDirectory(dir: string): Violation[] {
  const violations: Violation[] = [];
  const fullPath = path.join(process.cwd(), dir);

  if (!fs.existsSync(fullPath)) {
    return violations;
  }

  const files = fs.readdirSync(fullPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(fullPath, file.name);

    if (file.isDirectory()) {
      violations.push(...scanDirectory(path.join(dir, file.name)));
    } else if (file.name.endsWith('.ts') && !shouldSkipFile(filePath)) {
      violations.push(...scanFile(filePath));
    }
  }

  return violations;
}

function main() {
  console.log('🔍 Scanning for plaintext writes to sensitive fields...\n');

  const allViolations: Violation[] = [];

  for (const dir of SCAN_DIRS) {
    const violations = scanDirectory(dir);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log('✅ No plaintext violations found!\n');
    process.exit(0);
  }

  console.log(`❌ Found ${allViolations.length} potential plaintext violations:\n`);

  // Group by file
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const list = byFile.get(v.file) || [];
    list.push(v);
    byFile.set(v.file, list);
  }

  for (const [file, violations] of byFile) {
    console.log(`\n📄 ${file}`);
    for (const v of violations) {
      console.log(`   Line ${v.line}: ${v.field}`);
      console.log(`   > ${v.code}`);
    }
  }

  console.log('\n💡 To fix: Use *Encrypted fields with encryption service, set plaintext fields to null.\n');
  process.exit(1);
}

main();
