/**
 * Verify all KODA JSON files are correctly structured
 */

import { readFileSync, existsSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

const REQUIRED_FILES = [
  // Core Structure
  { name: 'intent_schema.json', required: ['_meta', 'DOCUMENTS', 'EXTRACTION', 'REASONING'] },
  { name: 'domain_schema.json', required: ['_meta', 'LEGAL', 'MEDICAL', 'FINANCE', 'ENGINEERING', 'EXCEL'] },
  { name: 'depth_schema.json', required: ['_meta', 'depth_levels'] },
  { name: 'output_schema.json', required: ['_meta', 'allowed_sections', 'format_rules'] },

  // Routing Surface
  { name: 'intent_patterns.json', required: ['_meta', 'metadata', 'intents'] },
  { name: 'domain_layers.json', required: ['_meta', 'metadata', 'domains'] },
  { name: 'routing_priority.json', required: ['_meta', 'intent_priority', 'domain_priority'] },

  // Memory/Preferences
  { name: 'memory_schema.json', required: ['_meta', 'allowed_memory_keys'] },
  { name: 'preferences_schema.json', required: ['_meta', 'preference_categories'] },

  // Safety/Audit
  { name: 'failure_modes.json', required: ['_meta', 'failure_categories'] },
  { name: 'disclaimer_policy.json', required: ['_meta', 'domain_disclaimers'] },
  { name: 'negative_triggers.json', required: ['_meta', 'domain_negatives'] },

  // ML
  { name: 'intent_labels.json', required: ['_meta', 'labels'] },
  { name: 'domain_labels.json', required: ['_meta', 'labels'] },
  { name: 'training_dataset_schema.json', required: ['_meta', 'row_schema'] },
  { name: 'evaluation_metrics.json', required: ['_meta', 'intent_classification', 'domain_classification'] },

  // Safety Locks
  { name: 'file_integrity_policy.json', required: ['_meta', 'protected_files'] },
  { name: 'audit_report_schema.json', required: ['_meta', 'report_structure'] },
];

console.log('='.repeat(60));
console.log('KODA JSON FILE VERIFICATION');
console.log('='.repeat(60));
console.log('');

let passed = 0;
let failed = 0;
const issues = [];

for (const file of REQUIRED_FILES) {
  const filePath = `${DATA_DIR}/${file.name}`;

  if (!existsSync(filePath)) {
    console.log(`❌ ${file.name} - FILE NOT FOUND`);
    failed++;
    issues.push({ file: file.name, issue: 'File not found' });
    continue;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Check required keys
    const missingKeys = file.required.filter(key => !(key in data));

    if (missingKeys.length > 0) {
      console.log(`⚠️  ${file.name} - MISSING KEYS: ${missingKeys.join(', ')}`);
      failed++;
      issues.push({ file: file.name, issue: `Missing keys: ${missingKeys.join(', ')}` });
    } else {
      // Get size info
      const sizeKB = (content.length / 1024).toFixed(1);
      const keyCount = Object.keys(data).length;
      console.log(`✓  ${file.name} (${sizeKB} KB, ${keyCount} top-level keys)`);
      passed++;
    }
  } catch (error) {
    console.log(`❌ ${file.name} - PARSE ERROR: ${error.message}`);
    failed++;
    issues.push({ file: file.name, issue: error.message });
  }
}

console.log('');
console.log('='.repeat(60));

// Additional data verification
console.log('\n=== DATA CONTENT VERIFICATION ===\n');

// Check intent_patterns.json
try {
  const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));
  const intents = Object.keys(intentPatterns.intents || {});
  console.log('intent_patterns.json:');
  console.log(`  - Intents: ${intents.join(', ')}`);
  console.log(`  - Total Keywords: ${intentPatterns.metadata?.totalKeywords?.toLocaleString() || 'N/A'}`);
  console.log(`  - Total Patterns: ${intentPatterns.metadata?.totalPatterns?.toLocaleString() || 'N/A'}`);
  console.log(`  - Has _meta protection: ${!!intentPatterns._meta?.do_not_prune}`);
} catch (e) {
  console.log(`  Error reading intent_patterns.json: ${e.message}`);
}

// Check domain_layers.json
try {
  const domainLayers = JSON.parse(readFileSync(`${DATA_DIR}/domain_layers.json`, 'utf-8'));
  const domains = Object.keys(domainLayers.domains || {});
  console.log('\ndomain_layers.json:');
  console.log(`  - Domains: ${domains.join(', ')}`);
  console.log(`  - Total Keywords: ${domainLayers.metadata?.totalKeywords?.toLocaleString() || 'N/A'}`);
  console.log(`  - Total Patterns: ${domainLayers.metadata?.totalPatterns?.toLocaleString() || 'N/A'}`);
  console.log(`  - Has _meta protection: ${!!domainLayers._meta?.do_not_prune}`);

  // Check each domain has data
  console.log('\n  Per-domain counts:');
  for (const domain of domains) {
    const d = domainLayers.domains[domain];
    const kwEn = d.keywords?.en?.length || 0;
    const kwPt = d.keywords?.pt?.length || 0;
    const kwEs = d.keywords?.es?.length || 0;
    const patEn = d.patterns?.en?.length || 0;
    const patPt = d.patterns?.pt?.length || 0;
    const patEs = d.patterns?.es?.length || 0;
    console.log(`    ${domain}: ${(kwEn+kwPt+kwEs).toLocaleString()} kw, ${(patEn+patPt+patEs).toLocaleString()} pat`);
  }
} catch (e) {
  console.log(`  Error reading domain_layers.json: ${e.message}`);
}

console.log('');
console.log('='.repeat(60));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (issues.length > 0) {
  console.log('\nIssues to fix:');
  issues.forEach(i => console.log(`  - ${i.file}: ${i.issue}`));
}
