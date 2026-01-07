/**
 * Rebalance STRONG Tier for Intents Above 40%
 *
 * Demotes some STRONG keywords to MEDIUM based on:
 * - Shorter keywords (less specific)
 * - Generic action verbs
 * - Common phrases that need context
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

// Intents that need STRONG tier reduction
const REBALANCE_TARGETS = {
  DOCUMENTS: { currentStrong: 48.0, targetStrong: 38.0 },
  HELP: { currentStrong: 47.7, targetStrong: 38.0 }
};

// Keywords that should be demoted to MEDIUM (too generic for STRONG)
const GENERIC_PATTERNS = [
  // Single words that need context
  /^show$/i, /^get$/i, /^find$/i, /^see$/i, /^view$/i,
  /^check$/i, /^look$/i, /^read$/i, /^open$/i,

  // Short phrases (< 3 words)
  /^go to$/i, /^show me$/i, /^what is$/i, /^where is$/i,
  /^can you$/i, /^how to$/i, /^help me$/i, /^tell me$/i,

  // Generic document terms
  /^page$/i, /^section$/i, /^document$/i, /^file$/i,
  /^text$/i, /^content$/i, /^data$/i
];

// Layers that should be demoted from STRONG to MEDIUM
const DEMOTE_LAYERS = ['scope', 'depth', 'outputControl'];

console.log('Loading intent_patterns.json...');
const data = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));

const stats = {};

for (const [intentName, target] of Object.entries(REBALANCE_TARGETS)) {
  if (!data.intents[intentName]) continue;

  stats[intentName] = { demoted: 0, before: 0, after: 0 };

  for (const lang of ['en', 'pt', 'es']) {
    const keywords = data.intents[intentName].keywords?.[lang] || [];

    // Count current STRONG
    const strongKeywords = keywords.filter(k => k.tier === 'STRONG');
    const totalKeywords = keywords.length;
    const currentStrongPct = (strongKeywords.length / totalKeywords) * 100;

    stats[intentName].before = currentStrongPct;

    // Calculate how many to demote to reach target
    const targetStrongCount = Math.floor(totalKeywords * (target.targetStrong / 100));
    const demoteCount = strongKeywords.length - targetStrongCount;

    if (demoteCount <= 0) continue;

    // Score each STRONG keyword for demotion priority
    const scored = strongKeywords.map(kw => {
      let score = 0;
      const text = (kw.keyword || '').toLowerCase();

      // Short keywords are more generic
      if (text.length < 10) score += 3;
      else if (text.length < 15) score += 2;
      else if (text.length < 20) score += 1;

      // Match generic patterns
      for (const pattern of GENERIC_PATTERNS) {
        if (pattern.test(text)) {
          score += 5;
          break;
        }
      }

      // Layers that should be MEDIUM
      if (DEMOTE_LAYERS.includes(kw.layer)) {
        score += 3;
      }

      // Single words
      if (!text.includes(' ')) {
        score += 4;
      }

      return { kw, score };
    });

    // Sort by score (highest = most generic = demote first)
    scored.sort((a, b) => b.score - a.score);

    // Demote top N
    const toDemote = scored.slice(0, demoteCount);
    for (const { kw } of toDemote) {
      kw.tier = 'MEDIUM';
      stats[intentName].demoted++;
    }

    // Recalculate
    const newStrongCount = keywords.filter(k => k.tier === 'STRONG').length;
    stats[intentName].after = (newStrongCount / totalKeywords) * 100;
  }
}

// Update metadata
data.metadata.tiersRebalancedAt = new Date().toISOString();

console.log('Saving...');
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(data, null, 2));

// Print summary
console.log('\n' + '='.repeat(60));
console.log('TIER REBALANCING COMPLETE');
console.log('='.repeat(60));

console.log('\nResults:');
console.log('Intent'.padEnd(15) + 'Before%'.padStart(10) + 'After%'.padStart(10) + 'Demoted'.padStart(10));
console.log('-'.repeat(45));
for (const [intent, s] of Object.entries(stats)) {
  console.log(
    intent.padEnd(15) +
    s.before.toFixed(1).padStart(10) +
    s.after.toFixed(1).padStart(10) +
    s.demoted.toString().padStart(10)
  );
}

console.log('\n✓ Saved to intent_patterns.json');
