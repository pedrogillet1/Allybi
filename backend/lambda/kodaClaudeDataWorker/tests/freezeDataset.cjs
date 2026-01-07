#!/usr/bin/env node
/**
 * KODA Dataset Freeze
 *
 * Creates a golden hash of all critical dataset files.
 * Run this after verified changes to establish new baseline.
 *
 * Usage: node tests/freezeDataset.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';
const HASH_FILE = path.join(__dirname, 'fixtures', 'DATASET_SHA256.json');

const CRITICAL_FILES = [
  'intent_patterns.json',
  'domain_layers.json',
  'routing_priority.json',
  'routing_tiebreakers.json',
  'domain_activation.json',
  'negative_triggers.json',
  'intent_schema.json',
  'domain_schema.json',
  'depth_schema.json',
  'output_schema.json',
  'answer_styles.json',
  'failure_modes.json',
  'disclaimer_policy.json'
];

function hashFile(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getFileStats(filepath) {
  const stats = fs.statSync(filepath);
  const content = fs.readFileSync(filepath, 'utf-8');
  let itemCount = 0;

  try {
    const json = JSON.parse(content);
    if (json.intents) {
      itemCount = Object.keys(json.intents).length;
    } else if (json.domains) {
      itemCount = Object.keys(json.domains).length;
    } else {
      itemCount = Object.keys(json).filter(k => !k.startsWith('_')).length;
    }
  } catch (e) {
    itemCount = -1;
  }

  return {
    size: stats.size,
    modified: stats.mtime.toISOString(),
    items: itemCount
  };
}

console.log('='.repeat(60));
console.log('KODA DATASET FREEZE');
console.log('='.repeat(60));
console.log('');

const hashes = {};
const stats = {};
const missing = [];

for (const file of CRITICAL_FILES) {
  const filepath = path.join(DATA_DIR, file);

  if (fs.existsSync(filepath)) {
    hashes[file] = hashFile(filepath);
    stats[file] = getFileStats(filepath);
    console.log(`✓ ${file}`);
    console.log(`  Hash: ${hashes[file].substring(0, 16)}...`);
    console.log(`  Size: ${(stats[file].size / 1024).toFixed(1)} KB`);
  } else {
    missing.push(file);
    console.log(`✗ ${file} - NOT FOUND`);
  }
}

if (missing.length > 0) {
  console.log('');
  console.log(`⚠️  Missing files: ${missing.join(', ')}`);
}

const freezeData = {
  frozen_at: new Date().toISOString(),
  data_dir: DATA_DIR,
  files_count: Object.keys(hashes).length,
  hashes,
  stats
};

// Ensure fixtures directory exists
const fixturesDir = path.dirname(HASH_FILE);
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

fs.writeFileSync(HASH_FILE, JSON.stringify(freezeData, null, 2));

console.log('');
console.log('='.repeat(60));
console.log(`✅ Frozen ${Object.keys(hashes).length} files`);
console.log(`   Saved to: ${HASH_FILE}`);
console.log('='.repeat(60));
