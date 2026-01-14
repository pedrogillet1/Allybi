#!/usr/bin/env node
/**
 * I18N Key Completeness Checker
 *
 * Ensures all translation keys exist in all locale files with matching structure.
 * Run: node frontend/scripts/check-i18n-keys.js
 *
 * Exit codes:
 *   0 - All keys present and matching
 *   1 - Missing keys or structure mismatch
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');
const LOCALES = ['en.json', 'pt-BR.json', 'es-ES.json'];

/**
 * Flatten nested object keys into dot-notation paths
 * { foo: { bar: "baz" } } => ["foo.bar"]
 */
function flattenKeys(obj, prefix = '') {
  const keys = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Load and parse locale file
 */
function loadLocale(filename) {
  try {
    const filePath = path.join(LOCALES_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to load ${filename}:`, error.message);
    process.exit(1);
  }
}

/**
 * Main validation
 */
function main() {
  console.log('🔍 Checking i18n key completeness...\n');

  // Load all locales
  const locales = {};
  for (const locale of LOCALES) {
    console.log(`📄 Loading ${locale}...`);
    locales[locale] = loadLocale(locale);
  }

  // Flatten all keys
  const keysByLocale = {};
  for (const [locale, data] of Object.entries(locales)) {
    keysByLocale[locale] = new Set(flattenKeys(data));
    console.log(`   Found ${keysByLocale[locale].size} keys`);
  }

  console.log('');

  // Check previewCount.* keys specifically (critical section)
  console.log('🔒 Verifying critical sections...');
  const criticalPrefixes = ['previewCount.', 'clickableDocument.'];
  const referenceLocale = 'en.json';
  const referenceKeys = Array.from(keysByLocale[referenceLocale]);

  for (const prefix of criticalPrefixes) {
    const criticalKeys = referenceKeys.filter(k => k.startsWith(prefix));
    console.log(`\n   Checking ${prefix}* (${criticalKeys.length} keys):`);

    for (const locale of LOCALES) {
      if (locale === referenceLocale) continue;

      const missing = criticalKeys.filter(key => !keysByLocale[locale].has(key));

      if (missing.length > 0) {
        console.error(`   ❌ ${locale} missing ${missing.length} keys:`);
        missing.forEach(key => console.error(`      - ${key}`));
      } else {
        console.log(`   ✅ ${locale} complete`);
      }
    }
  }

  // Check for missing keys across all locales
  console.log('\n🔍 Cross-checking all keys...');

  const allKeys = new Set();
  for (const keys of Object.values(keysByLocale)) {
    for (const key of keys) {
      allKeys.add(key);
    }
  }

  let hasErrors = false;

  for (const key of allKeys) {
    const presentIn = LOCALES.filter(locale => keysByLocale[locale].has(key));

    if (presentIn.length < LOCALES.length) {
      const missing = LOCALES.filter(locale => !keysByLocale[locale].has(key));
      console.error(`\n❌ Key "${key}" missing in: ${missing.join(', ')}`);
      hasErrors = true;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (hasErrors) {
    console.error('❌ I18N validation FAILED - missing keys found');
    console.error('   Please add missing keys to all locale files');
    process.exit(1);
  } else {
    console.log('✅ I18N validation PASSED - all keys present');
    console.log(`   Total keys: ${allKeys.size}`);
    console.log(`   Locales: ${LOCALES.join(', ')}`);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { flattenKeys, loadLocale };
