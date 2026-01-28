#!/usr/bin/env npx ts-node
/**
 * Secrets Scanner
 *
 * Scans the codebase for hardcoded secrets, API keys, and credentials.
 * Fails CI if any secrets are found in source code.
 *
 * Usage: npx ts-node scripts/security/scan-secrets.ts
 * Exit codes: 0 = pass, 1 = secrets found
 */

import * as fs from 'fs';
import * as path from 'path';

interface SecretViolation {
  file: string;
  line: number;
  code: string;
  type: string;
}

// Patterns that indicate hardcoded secrets
const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // API Keys
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/i },
  { name: 'AWS Secret Key', regex: /[A-Za-z0-9/+=]{40}(?=.*aws)/i },
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{48}/i },
  { name: 'Stripe Secret Key', regex: /sk_live_[A-Za-z0-9]{24,}/i },
  { name: 'Stripe Test Key', regex: /sk_test_[A-Za-z0-9]{24,}/i },
  { name: 'SendGrid API Key', regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/i },
  { name: 'Twilio Auth Token', regex: /[a-f0-9]{32}(?=.*twilio)/i },
  { name: 'Google API Key', regex: /AIza[A-Za-z0-9_-]{35}/i },

  // Passwords and secrets
  { name: 'Hardcoded Password', regex: /password\s*[:=]\s*["'][^"']{8,}["']/i },
  { name: 'Hardcoded Secret', regex: /secret\s*[:=]\s*["'][^"']{8,}["']/i },
  { name: 'Hardcoded Token', regex: /token\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/i },

  // Private keys
  { name: 'RSA Private Key', regex: /-----BEGIN RSA PRIVATE KEY-----/i },
  { name: 'Private Key', regex: /-----BEGIN PRIVATE KEY-----/i },
  { name: 'EC Private Key', regex: /-----BEGIN EC PRIVATE KEY-----/i },

  // Database URLs with credentials
  { name: 'Database URL with Password', regex: /:\/\/[^:]+:[^@]+@[^/]+\/\w+/i },

  // JWT tokens (if hardcoded)
  { name: 'JWT Token', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i },

  // Base64 encoded secrets (common pattern)
  { name: 'Base64 Secret', regex: /(?:secret|key|token|password)_?base64\s*[:=]\s*["'][A-Za-z0-9+/=]{20,}["']/i },
];

// Files/patterns to skip
const SKIP_PATTERNS = [
  'node_modules',
  '.env.example',
  '.env.sample',
  '.test.ts',
  '.spec.ts',
  'scan-secrets.ts', // Don't scan ourselves
  'SECURITY_AUDIT.md',
  'SECURITY_GRADE_REPORT.md',
  '.md',
];

// False positive patterns (things that look like secrets but aren't)
const FALSE_POSITIVE_PATTERNS = [
  /process\.env\./,
  /config\./,
  /getEnvVar\(/,
  /JWT_.*_SECRET/,
  /ENCRYPTION_KEY/,
  /placeholder/i,
  /example/i,
  /your-.*-here/i,
  /<.*>/,
  /\$\{/,
];

function shouldSkipFile(filePath: string): boolean {
  return SKIP_PATTERNS.some(skip => filePath.includes(skip));
}

function isFalsePositive(line: string): boolean {
  return FALSE_POSITIVE_PATTERNS.some(pattern => pattern.test(line));
}

function scanFile(filePath: string): SecretViolation[] {
  const violations: SecretViolation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('#')) {
      return;
    }

    // Skip false positives
    if (isFalsePositive(line)) {
      return;
    }

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(line)) {
        violations.push({
          file: filePath,
          line: index + 1,
          code: line.trim().substring(0, 80).replace(/["'][^"']+["']/g, '"[REDACTED]"'),
          type: pattern.name,
        });
        break; // One violation per line is enough
      }
    }
  });

  return violations;
}

function scanDirectory(dir: string): SecretViolation[] {
  const violations: SecretViolation[] = [];
  const fullPath = path.join(process.cwd(), dir);

  if (!fs.existsSync(fullPath)) {
    return violations;
  }

  const files = fs.readdirSync(fullPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(fullPath, file.name);

    if (shouldSkipFile(filePath)) {
      continue;
    }

    if (file.isDirectory()) {
      violations.push(...scanDirectory(path.join(dir, file.name)));
    } else if (file.name.endsWith('.ts') || file.name.endsWith('.js') || file.name.endsWith('.json')) {
      violations.push(...scanFile(filePath));
    }
  }

  return violations;
}

function main() {
  console.log('🔍 Scanning for hardcoded secrets...\n');

  const scanDirs = ['src', 'scripts', 'prisma'];
  const allViolations: SecretViolation[] = [];

  for (const dir of scanDirs) {
    const violations = scanDirectory(dir);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log('✅ No hardcoded secrets found!\n');
    process.exit(0);
  }

  console.log(`❌ Found ${allViolations.length} potential secrets:\n`);

  // Group by type
  const byType = new Map<string, SecretViolation[]>();
  for (const v of allViolations) {
    const list = byType.get(v.type) || [];
    list.push(v);
    byType.set(v.type, list);
  }

  for (const [type, violations] of byType) {
    console.log(`\n🔑 ${type} (${violations.length}):`);
    for (const v of violations) {
      console.log(`   ${v.file}:${v.line}`);
      console.log(`   > ${v.code}`);
    }
  }

  console.log('\n💡 To fix: Move secrets to environment variables and use process.env.*\n');
  process.exit(1);
}

main();
