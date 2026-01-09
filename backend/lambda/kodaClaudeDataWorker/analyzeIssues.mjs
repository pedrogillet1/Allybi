/**
 * Comprehensive Routing Issues Analysis
 */

import { readFileSync } from 'fs';

const report = JSON.parse(readFileSync('./tests/reports/DEPLOY_READINESS.json'));
const failures = report.checks.routing.failures;

// Categorize failures
const issues = {
  intent_hijacking: {},
  domain_activation: {},
  multilingual: [],
  depth_mismatch: [],
  edge_cases: []
};

for (const f of failures) {
  const intentFail = f.failures.find(x => x.field === 'intent');
  const domainFail = f.failures.find(x => x.field === 'domain');
  const depthFail = f.failures.find(x => x.field === 'depth');

  if (f.id.startsWith('multilang')) {
    issues.multilingual.push(f);
  } else if (depthFail && !intentFail && !domainFail) {
    issues.depth_mismatch.push(f);
  } else if (intentFail) {
    const key = `${intentFail.expected} → ${intentFail.actual}`;
    if (!issues.intent_hijacking[key]) issues.intent_hijacking[key] = [];
    issues.intent_hijacking[key].push(f);
  } else if (domainFail) {
    const key = `${domainFail.expected[0] || 'unknown'} → ${f.actual.domain[0] || 'general'}`;
    if (!issues.domain_activation[key]) issues.domain_activation[key] = [];
    issues.domain_activation[key].push(f);
  } else {
    issues.edge_cases.push(f);
  }
}

console.log('='.repeat(70));
console.log('COMPREHENSIVE ROUTING ISSUES GUIDE');
console.log('='.repeat(70));
console.log('');
console.log('SUMMARY');
console.log('-'.repeat(70));
console.log(`Total Failures: ${failures.length}/185 (${((failures.length/185)*100).toFixed(1)}%)`);
console.log(`Pass Rate: ${185 - failures.length}/185 (${(((185-failures.length)/185)*100).toFixed(1)}%)`);

// By intent
console.log('');
console.log('PASS RATES BY INTENT:');
const byIntent = report.checks.routing.by_intent;
for (const [intent, data] of Object.entries(byIntent)) {
  const rate = ((data.passed / data.total) * 100).toFixed(0);
  const bar = '█'.repeat(Math.floor(rate/5)) + '░'.repeat(20 - Math.floor(rate/5));
  console.log(`  ${intent.padEnd(12)} ${bar} ${rate}% (${data.passed}/${data.total})`);
}

// By domain
console.log('');
console.log('PASS RATES BY DOMAIN:');
const byDomain = report.checks.routing.by_domain;
for (const [domain, data] of Object.entries(byDomain)) {
  const rate = ((data.passed / data.total) * 100).toFixed(0);
  const bar = '█'.repeat(Math.floor(rate/5)) + '░'.repeat(20 - Math.floor(rate/5));
  console.log(`  ${domain.padEnd(12)} ${bar} ${rate}% (${data.passed}/${data.total})`);
}

// 1. Intent Hijacking
console.log('');
console.log('');
console.log('═'.repeat(70));
console.log('1. INTENT HIJACKING ISSUES (Intent routed to wrong destination)');
console.log('═'.repeat(70));
console.log('');

const hijackSorted = Object.entries(issues.intent_hijacking).sort((a,b) => b[1].length - a[1].length);
let totalHijack = 0;
for (const [pattern, cases] of hijackSorted) {
  totalHijack += cases.length;
  console.log(`▸ ${pattern} (${cases.length} cases)`);
  console.log(`  ${'─'.repeat(60)}`);
  for (const c of cases.slice(0, 4)) {
    console.log(`  • "${c.input.substring(0, 55)}${c.input.length > 55 ? '...' : ''}"`);
  }
  if (cases.length > 4) console.log(`  ... and ${cases.length - 4} more`);
  console.log('');
}
console.log(`TOTAL INTENT HIJACKING: ${totalHijack} failures`);

// 2. Domain Activation
console.log('');
console.log('');
console.log('═'.repeat(70));
console.log('2. DOMAIN ACTIVATION FAILURES (Correct intent, wrong domain)');
console.log('═'.repeat(70));
console.log('');

const domainSorted = Object.entries(issues.domain_activation).sort((a,b) => b[1].length - a[1].length);
let totalDomain = 0;
for (const [pattern, cases] of domainSorted) {
  totalDomain += cases.length;
  console.log(`▸ ${pattern} (${cases.length} cases)`);
  console.log(`  ${'─'.repeat(60)}`);
  for (const c of cases.slice(0, 4)) {
    console.log(`  • "${c.input.substring(0, 55)}${c.input.length > 55 ? '...' : ''}"`);
  }
  if (cases.length > 4) console.log(`  ... and ${cases.length - 4} more`);
  console.log('');
}
console.log(`TOTAL DOMAIN ACTIVATION FAILURES: ${totalDomain} failures`);

// 3. Multilingual
console.log('');
console.log('');
console.log('═'.repeat(70));
console.log('3. MULTILINGUAL ISSUES (Portuguese/Spanish routing)');
console.log('═'.repeat(70));
console.log('');
console.log(`Total: ${issues.multilingual.length} failures`);
console.log('');
for (const c of issues.multilingual) {
  console.log(`▸ [${c.id}] "${c.input}"`);
  console.log(`  Expected: ${c.expected.intent} → Actual: ${c.actual.intent}`);
}

// 4. Depth
if (issues.depth_mismatch.length > 0) {
  console.log('');
  console.log('');
  console.log('═'.repeat(70));
  console.log('4. DEPTH MISMATCH ISSUES (Correct intent/domain, wrong depth)');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`Total: ${issues.depth_mismatch.length} failures`);
  for (const c of issues.depth_mismatch) {
    console.log(`▸ "${c.input.substring(0, 50)}"`);
    console.log(`  Expected: ${c.expected.depth} → Actual: ${c.actual.depth}`);
  }
}

// Root cause analysis
console.log('');
console.log('');
console.log('═'.repeat(70));
console.log('ROOT CAUSE ANALYSIS & RECOMMENDED FIXES');
console.log('═'.repeat(70));
console.log('');

// Analyze hijacking patterns
const hijackPatterns = {};
for (const [pattern, cases] of Object.entries(issues.intent_hijacking)) {
  const [from, to] = pattern.split(' → ');
  if (!hijackPatterns[to]) hijackPatterns[to] = { count: 0, victims: {} };
  hijackPatterns[to].count += cases.length;
  hijackPatterns[to].victims[from] = (hijackPatterns[to].victims[from] || 0) + cases.length;
}

console.log('AGGRESSIVE INTENTS (stealing from others):');
const aggressors = Object.entries(hijackPatterns).sort((a,b) => b[1].count - a[1].count);
for (const [aggressor, data] of aggressors) {
  console.log(`  ${aggressor}: stealing ${data.count} queries`);
  for (const [victim, count] of Object.entries(data.victims)) {
    console.log(`    - from ${victim}: ${count} queries`);
  }
}

console.log('');
console.log('');
console.log('═'.repeat(70));
console.log('SPECIFIC FIX RECOMMENDATIONS');
console.log('═'.repeat(70));
console.log('');

// EXTRACTION fixes
if (hijackPatterns['EXTRACTION']) {
  console.log('1. EXTRACTION IS TOO AGGRESSIVE');
  console.log('   Add NEGATIVE triggers to EXTRACTION for:');
  const extractionVictims = issues.intent_hijacking;
  for (const [pattern, cases] of Object.entries(extractionVictims)) {
    if (pattern.includes('→ EXTRACTION')) {
      const keywords = new Set();
      for (const c of cases) {
        const words = c.input.toLowerCase().split(/\s+/);
        if (words.includes('show')) keywords.add('show me');
        if (words.includes('go')) keywords.add('go to');
        if (words.includes('navigate')) keywords.add('navigate to');
        if (words.includes('jump')) keywords.add('jump to');
        if (words.includes('display')) keywords.add('display the');
        if (c.input.toLowerCase().includes('section')) keywords.add('section');
      }
      console.log(`   From ${pattern.split(' → ')[0]}: ${[...keywords].join(', ')}`);
    }
  }
}

console.log('');
if (hijackPatterns['MEMORY']) {
  console.log('2. MEMORY IS CATCHING EXTRACTION QUERIES');
  console.log('   Add NEGATIVE triggers to MEMORY for:');
  console.log('   - "extract", "pull the", "get the", "what is the"');
}

console.log('');
if (hijackPatterns['REASONING']) {
  console.log('3. REASONING IS CATCHING DOCUMENTS QUERIES');
  console.log('   Add NEGATIVE triggers to REASONING for:');
  console.log('   - "show me", "what does X say", "navigate to"');
}

console.log('');
console.log('4. DOMAIN ACTIVATION MISSING ANCHORS');
console.log('   The 6-layer system needs these anchors added:');
for (const [pattern, cases] of Object.entries(issues.domain_activation)) {
  if (pattern.includes('→ general')) {
    const domain = pattern.split(' → ')[0];
    console.log(`   ${domain.toUpperCase()}:`);
    const terms = new Set();
    for (const c of cases) {
      const words = c.input.toLowerCase();
      if (domain === 'legal') {
        if (words.includes('indemnification')) terms.add('indemnification');
        if (words.includes('payment')) terms.add('payment');
        if (words.includes('warranty')) terms.add('warranty');
      }
      if (domain === 'medical') {
        if (words.includes('diagnosis')) terms.add('diagnosis');
        if (words.includes('medication')) terms.add('medication');
      }
    }
    console.log(`   - Missing anchors: ${[...terms].join(', ') || 'check inputs'}`);
  }
}

console.log('');
console.log('5. MULTILINGUAL KEYWORDS MISSING');
console.log('   Need to add PT/ES keywords for all intents');

console.log('');
console.log('═'.repeat(70));
console.log('PRIORITY ORDER FOR FIXES');
console.log('═'.repeat(70));
console.log('');
console.log('1. [HIGH] Add NEGATIVE triggers to EXTRACTION (prevents 30+ failures)');
console.log('2. [HIGH] Add NEGATIVE triggers to MEMORY (prevents 10+ failures)');
console.log('3. [MED]  Boost DOCUMENTS STRONG keywords');
console.log('4. [MED]  Add domain anchors for edge cases');
console.log('5. [LOW]  Add multilingual keywords');
console.log('6. [LOW]  Fix depth detection signals');
