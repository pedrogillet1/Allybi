/**
 * Regenerate SHA-256 checksums for all registered banks in bank_checksums.any.json.
 * Run after any bank content changes to keep checksums in sync.
 *
 * Usage: node scripts/regenerate-checksums.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_BANKS_ROOT = path.resolve(process.cwd(), 'src/data_banks');
const CHECKSUMS_PATH = path.join(DATA_BANKS_ROOT, 'manifest/bank_checksums.any.json');
const REGISTRY_PATH = path.join(DATA_BANKS_ROOT, 'manifest/bank_registry.any.json');

// Load registry to know which banks to checksum
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const banks = registry.banks || registry.entries || [];

// Load existing checksums file
const checksumFile = JSON.parse(fs.readFileSync(CHECKSUMS_PATH, 'utf8'));

// Determine the checksums object key
const checksumKey = checksumFile.checksums ? 'checksums' : (checksumFile.banks ? 'banks' : null);

let updated = 0;
let added = 0;
let missing = 0;

for (const bank of banks) {
  const bankPath = bank.path;
  const absPath = path.join(DATA_BANKS_ROOT, bankPath);

  if (!fs.existsSync(absPath)) {
    missing++;
    continue;
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  if (checksumKey) {
    const existing = checksumFile[checksumKey][bankPath];
    const existingHash = typeof existing === 'string' ? existing : existing?.sha256;

    if (existingHash !== hash) {
      if (typeof existing === 'object' && existing !== null) {
        checksumFile[checksumKey][bankPath].sha256 = hash;
      } else {
        checksumFile[checksumKey][bankPath] = hash;
      }
      if (existingHash) {
        updated++;
      } else {
        added++;
      }
    }
  }

  // Also update the checksumSha256 in the registry entry itself
  if (bank.checksumSha256 !== undefined) {
    bank.checksumSha256 = hash;
  }
}

// Write updated checksums
fs.writeFileSync(CHECKSUMS_PATH, JSON.stringify(checksumFile, null, 2) + '\n', 'utf8');

// Write updated registry (with checksumSha256 fields)
fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');

console.log(`Checksums regenerated:`);
console.log(`  Updated: ${updated}`);
console.log(`  Added: ${added}`);
console.log(`  Missing files: ${missing}`);
console.log(`  Total banks: ${banks.length}`);
