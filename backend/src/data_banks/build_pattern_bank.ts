/**
 * Build script for the Intent Pattern Data Bank
 * Consolidates all pattern JSON files into a single runtime format
 *
 * Run with: npx ts-node src/data_banks/build_pattern_bank.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface PatternEntry {
  id: string;
  pattern: string;
  weight: number;
  examples?: string[];
  note?: string;
}

interface TriggerFile {
  intent: string;
  description: string;
  priority: number;
  negates?: string[];
  patterns: {
    pt: PatternEntry[];
    en: PatternEntry[];
  };
}

interface SignalFile {
  signal: string;
  description: string;
  priority: number;
  patterns: {
    pt: PatternEntry[];
    en: PatternEntry[];
  };
}

interface NegativeFile {
  blocker: string;
  description: string;
  blocks_intent: string;
  patterns: {
    pt: PatternEntry[];
    en: PatternEntry[];
  };
}

interface ConsolidatedBank {
  version: string;
  buildDate: string;
  stats: {
    totalPatterns: number;
    triggerPatterns: number;
    signalPatterns: number;
    negativePatterns: number;
    intents: number;
    signals: number;
    blockers: number;
  };
  triggers: Record<string, TriggerFile>;
  signals: Record<string, SignalFile>;
  negatives: Record<string, NegativeFile>;
}

const DATA_BANKS_DIR = path.join(__dirname);
const TRIGGERS_DIR = path.join(DATA_BANKS_DIR, 'triggers');
const SIGNALS_DIR = path.join(DATA_BANKS_DIR, 'signals');
const NEGATIVES_DIR = path.join(DATA_BANKS_DIR, 'negatives');
const OUTPUT_FILE = path.join(DATA_BANKS_DIR, 'pattern_bank.runtime.json');

function loadJsonFiles<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const results: T[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      results.push(JSON.parse(content));
      console.log(`  Loaded: ${file}`);
    } catch (err) {
      console.error(`  Error loading ${file}:`, err);
    }
  }

  return results;
}

function countPatterns(patterns: { pt: PatternEntry[]; en: PatternEntry[] }): number {
  return (patterns?.pt?.length || 0) + (patterns?.en?.length || 0);
}

function validatePattern(pattern: string, id: string): boolean {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch (err) {
    console.error(`  Invalid regex in ${id}: ${pattern}`);
    return false;
  }
}

function validatePatterns(patterns: PatternEntry[], source: string): number {
  let valid = 0;
  for (const p of patterns || []) {
    if (validatePattern(p.pattern, `${source}:${p.id}`)) {
      valid++;
    }
  }
  return valid;
}

async function build(): Promise<void> {
  console.log('=== Intent Pattern Data Bank Builder ===\n');

  // Load triggers
  console.log('Loading triggers...');
  const triggers = loadJsonFiles<TriggerFile>(TRIGGERS_DIR);
  const triggersMap: Record<string, TriggerFile> = {};
  let triggerPatternCount = 0;

  for (const t of triggers) {
    triggersMap[t.intent] = t;
    const count = countPatterns(t.patterns);
    triggerPatternCount += count;

    // Validate patterns
    const validPt = validatePatterns(t.patterns?.pt, `${t.intent}:pt`);
    const validEn = validatePatterns(t.patterns?.en, `${t.intent}:en`);
    console.log(`    ${t.intent}: ${count} patterns (${validPt} PT valid, ${validEn} EN valid)`);
  }

  // Load signals
  console.log('\nLoading signals...');
  const signals = loadJsonFiles<SignalFile>(SIGNALS_DIR);
  const signalsMap: Record<string, SignalFile> = {};
  let signalPatternCount = 0;

  for (const s of signals) {
    signalsMap[s.signal] = s;
    const count = countPatterns(s.patterns);
    signalPatternCount += count;

    const validPt = validatePatterns(s.patterns?.pt, `${s.signal}:pt`);
    const validEn = validatePatterns(s.patterns?.en, `${s.signal}:en`);
    console.log(`    ${s.signal}: ${count} patterns (${validPt} PT valid, ${validEn} EN valid)`);
  }

  // Load negatives
  console.log('\nLoading negatives...');
  const negatives = loadJsonFiles<NegativeFile>(NEGATIVES_DIR);
  const negativesMap: Record<string, NegativeFile> = {};
  let negativePatternCount = 0;

  for (const n of negatives) {
    negativesMap[n.blocker] = n;
    const count = countPatterns(n.patterns);
    negativePatternCount += count;

    const validPt = validatePatterns(n.patterns?.pt, `${n.blocker}:pt`);
    const validEn = validatePatterns(n.patterns?.en, `${n.blocker}:en`);
    console.log(`    ${n.blocker}: ${count} patterns (${validPt} PT valid, ${validEn} EN valid)`);
  }

  // Build consolidated bank
  const bank: ConsolidatedBank = {
    version: '1.0.0',
    buildDate: new Date().toISOString(),
    stats: {
      totalPatterns: triggerPatternCount + signalPatternCount + negativePatternCount,
      triggerPatterns: triggerPatternCount,
      signalPatterns: signalPatternCount,
      negativePatterns: negativePatternCount,
      intents: Object.keys(triggersMap).length,
      signals: Object.keys(signalsMap).length,
      blockers: Object.keys(negativesMap).length
    },
    triggers: triggersMap,
    signals: signalsMap,
    negatives: negativesMap
  };

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(bank, null, 2));

  // Print summary
  console.log('\n=== Build Summary ===');
  console.log(`Total Patterns: ${bank.stats.totalPatterns}`);
  console.log(`  - Triggers: ${bank.stats.triggerPatterns} (${bank.stats.intents} intents)`);
  console.log(`  - Signals: ${bank.stats.signalPatterns} (${bank.stats.signals} signals)`);
  console.log(`  - Negatives: ${bank.stats.negativePatterns} (${bank.stats.blockers} blockers)`);
  console.log(`\nOutput: ${OUTPUT_FILE}`);
}

// Run builder
build().catch(console.error);
