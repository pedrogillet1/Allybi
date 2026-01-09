/**
 * Domain Data Consolidator
 * Merges all generated domain files into domain_layers.json
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const INPUT_DIR = './output/domains/all-domains';
const OUTPUT_FILE = '/Users/pg/Desktop/koda-webapp/backend/src/data/domain_layers.json';

const DOMAINS = ['LEGAL', 'MEDICAL', 'FINANCE', 'ENGINEERING', 'EXCEL'];
const LANGUAGES = ['en', 'pt', 'es'];

// Initialize structure
const domainLayers = {
  "_meta": {
    "type": "domain_surface_forms_only",
    "description": "Domain-specific keywords and patterns - ORTHOGONAL to intents",
    "no_structural_keys": true,
    "do_not_prune": true,
    "do_not_dedupe": true,
    "do_not_merge": true,
    "related_files": {
      "structural_definitions": "domain_schema.json",
      "intent_patterns": "intent_patterns.json",
      "routing_priority": "routing_priority.json"
    },
    "protection": {
      "max_deletion_percent": 5,
      "require_backup": true,
      "block_mass_removal": true
    }
  },
  "metadata": {
    "generatedAt": new Date().toISOString(),
    "version": "1.0",
    "description": "KODA Domain Routing Dataset - 5 domains x 3 languages",
    "totalKeywords": 0,
    "totalPatterns": 0,
    "filesProcessed": 0,
    "status": "complete"
  },
  "domains": {}
};

// Initialize domain structure
for (const domain of DOMAINS) {
  domainLayers.domains[domain] = {
    tier: domain === 'LEGAL' || domain === 'MEDICAL' ? 0 : domain === 'EXCEL' ? 2 : 1,
    description: getDomainDescription(domain),
    keywords: { en: [], pt: [], es: [] },
    patterns: { en: [], pt: [], es: [] }
  };
}

function getDomainDescription(domain) {
  const descriptions = {
    LEGAL: "Legal documents, contracts, compliance, regulatory content",
    MEDICAL: "Medical records, clinical documents, healthcare content",
    FINANCE: "Financial reports, statements, accounting, investment content",
    ENGINEERING: "Technical specifications, CAD, engineering documents",
    EXCEL: "Spreadsheet operations, Excel-specific queries"
  };
  return descriptions[domain] || domain;
}

// Process all files
console.log('Reading generated domain files...');
const files = readdirSync(INPUT_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));

let totalKeywords = 0;
let totalPatterns = 0;
let filesProcessed = 0;

for (const file of files) {
  try {
    const filePath = join(INPUT_DIR, file);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));

    const domain = data.domain;
    const language = data.language;
    const items = data.items || [];

    if (!domain || !language || !DOMAINS.includes(domain) || !LANGUAGES.includes(language)) {
      continue;
    }

    // Check if keywords or patterns based on item structure
    if (items.length > 0 && items[0].k !== undefined) {
      // Keywords
      for (const item of items) {
        domainLayers.domains[domain].keywords[language].push({
          keyword: item.k,
          tier: item.t || 'MEDIUM',
          bucket: data.bucket
        });
        totalKeywords++;
      }
    } else if (items.length > 0 && items[0].p !== undefined) {
      // Patterns
      for (const item of items) {
        domainLayers.domains[domain].patterns[language].push({
          pattern: item.p,
          bucket: data.bucket
        });
        totalPatterns++;
      }
    }

    filesProcessed++;

    if (filesProcessed % 1000 === 0) {
      console.log(`Processed ${filesProcessed} files...`);
    }
  } catch (error) {
    console.error(`Error processing ${file}: ${error.message}`);
  }
}

// Update metadata
domainLayers.metadata.totalKeywords = totalKeywords;
domainLayers.metadata.totalPatterns = totalPatterns;
domainLayers.metadata.filesProcessed = filesProcessed;

// Log stats per domain
console.log('\n=== Domain Statistics ===');
for (const domain of DOMAINS) {
  const d = domainLayers.domains[domain];
  const kwCount = d.keywords.en.length + d.keywords.pt.length + d.keywords.es.length;
  const patCount = d.patterns.en.length + d.patterns.pt.length + d.patterns.es.length;
  console.log(`${domain}: ${kwCount.toLocaleString()} keywords, ${patCount.toLocaleString()} patterns`);
}

console.log(`\nTotal: ${totalKeywords.toLocaleString()} keywords, ${totalPatterns.toLocaleString()} patterns`);
console.log(`Files processed: ${filesProcessed}`);

// Write output
writeFileSync(OUTPUT_FILE, JSON.stringify(domainLayers, null, 2));
console.log(`\nSaved to: ${OUTPUT_FILE}`);

// Calculate file size
const stats = readFileSync(OUTPUT_FILE);
console.log(`File size: ${(stats.length / 1024 / 1024).toFixed(2)} MB`);
