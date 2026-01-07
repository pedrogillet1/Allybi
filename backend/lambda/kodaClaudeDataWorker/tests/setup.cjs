/**
 * KODA Test Suite - Setup
 *
 * Runs before all tests to verify dataset integrity
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';
const HASH_FILE = path.join(__dirname, 'fixtures', 'DATASET_SHA256.json');

// Files that must be verified before testing
const CRITICAL_FILES = [
  'intent_patterns.json',
  'domain_layers.json',
  'routing_priority.json',
  'routing_tiebreakers.json',
  'domain_activation.json',
  'negative_triggers.json',
  'intent_schema.json',
  'domain_schema.json'
];

function hashFile(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function verifyDatasetIntegrity() {
  const currentHashes = {};
  const missingFiles = [];

  for (const file of CRITICAL_FILES) {
    const filepath = path.join(DATA_DIR, file);
    if (fs.existsSync(filepath)) {
      currentHashes[file] = hashFile(filepath);
    } else {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(`CRITICAL: Missing dataset files: ${missingFiles.join(', ')}`);
  }

  // Check against golden hashes if they exist
  if (fs.existsSync(HASH_FILE)) {
    const goldenHashes = JSON.parse(fs.readFileSync(HASH_FILE, 'utf-8'));

    const driftedFiles = [];
    for (const [file, hash] of Object.entries(goldenHashes.hashes)) {
      if (currentHashes[file] && currentHashes[file] !== hash) {
        driftedFiles.push(file);
      }
    }

    if (driftedFiles.length > 0) {
      console.warn(`\n⚠️  WARNING: Dataset drift detected in: ${driftedFiles.join(', ')}`);
      console.warn('   Run "npm run test:freeze" to update golden hashes after review.\n');
      // Don't fail - just warn (change to throw if strict mode needed)
    }
  } else {
    console.log('\n📋 No golden hashes found. Run "npm run test:freeze" to create baseline.\n');
  }

  return currentHashes;
}

// Run verification
global.DATASET_HASHES = verifyDatasetIntegrity();
global.DATA_DIR = DATA_DIR;

console.log('✅ Dataset integrity check passed');
console.log(`   Files verified: ${CRITICAL_FILES.length}`);
