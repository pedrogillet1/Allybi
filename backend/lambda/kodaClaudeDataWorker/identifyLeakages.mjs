/**
 * Identify Cross-Intent Leakages (READ-ONLY)
 *
 * Outputs the 125 dangerous overlaps for tie-breaker creation
 */

import { readFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading intent_patterns.json...');
const data = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));

// Build keyword → intents map (only STRONG tier)
const strongKeywordMap = new Map();

for (const [intentName, intentData] of Object.entries(data.intents || {})) {
  for (const lang of ['en', 'pt', 'es']) {
    const keywords = intentData.keywords?.[lang] || [];
    for (const kw of keywords) {
      if (kw.tier === 'STRONG') {
        const text = (kw.keyword || '').toLowerCase().trim();
        if (text.length > 3) {
          if (!strongKeywordMap.has(text)) {
            strongKeywordMap.set(text, new Set());
          }
          strongKeywordMap.get(text).add(intentName);
        }
      }
    }
  }
}

// Find DANGEROUS leakages (STRONG keywords in 2+ intents)
const leakages = [];
for (const [keyword, intents] of strongKeywordMap) {
  if (intents.size >= 2) {
    leakages.push({
      keyword,
      intents: Array.from(intents).sort(),
      count: intents.size
    });
  }
}

// Sort by count (most dangerous first), then alphabetically
leakages.sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword));

console.log('\n' + '='.repeat(70));
console.log('CROSS-INTENT LEAKAGES (STRONG tier keywords in multiple intents)');
console.log('='.repeat(70));
console.log(`\nTotal leakages: ${leakages.length}\n`);

// Group by intent pairs for pattern analysis
const intentPairs = new Map();
for (const leak of leakages) {
  const key = leak.intents.join(' + ');
  if (!intentPairs.has(key)) {
    intentPairs.set(key, []);
  }
  intentPairs.get(key).push(leak.keyword);
}

console.log('Leakages by Intent Combination:');
console.log('-'.repeat(70));

for (const [pair, keywords] of intentPairs) {
  console.log(`\n${pair} (${keywords.length} keywords):`);
  // Show first 10 examples
  const examples = keywords.slice(0, 10);
  for (const kw of examples) {
    console.log(`  - "${kw}"`);
  }
  if (keywords.length > 10) {
    console.log(`  ... and ${keywords.length - 10} more`);
  }
}

// Output JSON for tie-breaker creation
console.log('\n' + '='.repeat(70));
console.log('SUGGESTED TIE-BREAKER PATTERNS');
console.log('='.repeat(70));

// Generate suggested tie-breakers based on patterns
const suggestions = [];

for (const [pair, keywords] of intentPairs) {
  const intents = pair.split(' + ');

  // Analyze common patterns in keywords
  const patterns = {
    hasTable: keywords.filter(k => k.includes('table')).length,
    hasExtract: keywords.filter(k => k.includes('extract')).length,
    hasShow: keywords.filter(k => k.includes('show') || k.includes('display')).length,
    hasAnalyze: keywords.filter(k => k.includes('analyze') || k.includes('analyse')).length,
    hasCompare: keywords.filter(k => k.includes('compare')).length,
    hasFind: keywords.filter(k => k.includes('find') || k.includes('search')).length,
    hasNavigate: keywords.filter(k => k.includes('page') || k.includes('section') || k.includes('go to')).length,
    hasEdit: keywords.filter(k => k.includes('edit') || k.includes('change') || k.includes('modify')).length,
    hasRemember: keywords.filter(k => k.includes('remember') || k.includes('recall')).length,
    hasHelp: keywords.filter(k => k.includes('help') || k.includes('how')).length
  };

  suggestions.push({
    intents,
    keywordCount: keywords.length,
    patterns,
    sampleKeywords: keywords.slice(0, 5)
  });
}

console.log('\n');
console.log(JSON.stringify(suggestions, null, 2));
