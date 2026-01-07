/**
 * KODA FORENSIC AUDIT v1.0
 *
 * 🔴 READ-ONLY AUDITOR - NO MUTATIONS
 *
 * This script ONLY observes, measures, and reports.
 * It does NOT delete, deduplicate, merge, rebalance, or "fix" anything.
 */

import { readFileSync, existsSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

// ============================================================================
// LOAD FILES (READ-ONLY)
// ============================================================================

function loadJSON(filename) {
  const path = `${DATA_DIR}/${filename}`;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    return { _error: e.message };
  }
}

const intentPatterns = loadJSON('intent_patterns.json');
const domainLayers = loadJSON('domain_layers.json');
const intentSchema = loadJSON('intent_schema.json');
const domainSchema = loadJSON('domain_schema.json');
const depthSchema = loadJSON('depth_schema.json');
const routingPriority = loadJSON('routing_priority.json');
const answerStyles = loadJSON('answer_styles.json');
const outputSchema = loadJSON('output_schema.json');
const negativeTriggers = loadJSON('negative_triggers.json');

// Hardening files
const routingTiebreakers = loadJSON('routing_tiebreakers.json');
const domainActivation = loadJSON('domain_activation.json');

// ============================================================================
// AUDIT RESULTS
// ============================================================================

const audit = {
  criticalBlockers: [],
  highRiskIssues: [],
  mediumRiskIssues: [],
  lowRiskIssues: [],
  statistics: {},
  collisionMatrix: [],
  recommendations: []
};

let readinessScore = 100;

function critical(msg, details = null) {
  audit.criticalBlockers.push({ message: msg, details });
  readinessScore -= 20;
}

function high(msg, details = null) {
  audit.highRiskIssues.push({ message: msg, details });
  readinessScore -= 10;
}

function medium(msg, details = null) {
  audit.mediumRiskIssues.push({ message: msg, details });
  readinessScore -= 5;
}

function low(msg, details = null) {
  audit.lowRiskIssues.push({ message: msg, details });
  readinessScore -= 1;
}

// ============================================================================
// 1. STRUCTURAL COMPLETENESS CHECK
// ============================================================================

console.log('1️⃣  Checking structural completeness...');

const REQUIRED_INTENT_STRUCTURE = [
  'states', 'actions', 'scope', 'depth', 'evidence_controls',
  'output_controls', 'memory_elements', 'failure_modes'
];

if (!intentSchema) {
  critical('intent_schema.json NOT FOUND - structural definitions missing');
} else {
  const intentsInSchema = Object.keys(intentSchema).filter(k => !k.startsWith('_'));

  for (const intent of intentsInSchema) {
    const def = intentSchema[intent];
    if (typeof def !== 'object') continue;

    const missingKeys = REQUIRED_INTENT_STRUCTURE.filter(k => !(k in def));
    if (missingKeys.length > 0) {
      medium(`Intent ${intent} missing structural keys: ${missingKeys.join(', ')}`);
    }
  }

  audit.statistics.intentsInSchema = intentsInSchema.length;
}

if (!domainSchema) {
  critical('domain_schema.json NOT FOUND - domain definitions missing');
} else {
  const domainsInSchema = Object.keys(domainSchema).filter(k => !k.startsWith('_'));
  audit.statistics.domainsInSchema = domainsInSchema.length;
}

// ============================================================================
// 2. KEYWORD & PATTERN COUNT VERIFICATION
// ============================================================================

console.log('2️⃣  Counting keywords and patterns...');

const intentStats = [];
const domainStats = [];

if (intentPatterns?.intents) {
  for (const [intentName, intentData] of Object.entries(intentPatterns.intents)) {
    const stats = {
      intent: intentName,
      keywords: { en: 0, pt: 0, es: 0, total: 0 },
      patterns: { en: 0, pt: 0, es: 0, total: 0 },
      tiers: { STRONG: 0, MEDIUM: 0, WEAK: 0, NEGATIVE: 0 }
    };

    // Count keywords
    if (intentData.keywords) {
      for (const lang of ['en', 'pt', 'es']) {
        const kws = intentData.keywords[lang] || [];
        stats.keywords[lang] = kws.length;
        stats.keywords.total += kws.length;

        // Count tiers (keywords might have tier/layer info)
        for (const kw of kws) {
          const tier = kw.tier || kw.t || 'MEDIUM';
          if (stats.tiers[tier] !== undefined) stats.tiers[tier]++;
        }
      }
    }

    // Count patterns
    if (intentData.patterns) {
      for (const lang of ['en', 'pt', 'es']) {
        const pats = intentData.patterns[lang] || [];
        stats.patterns[lang] = pats.length;
        stats.patterns.total += pats.length;
      }
    }

    intentStats.push(stats);
  }
}

if (domainLayers?.domains) {
  for (const [domainName, domainData] of Object.entries(domainLayers.domains)) {
    const stats = {
      domain: domainName,
      keywords: { en: 0, pt: 0, es: 0, total: 0 },
      patterns: { en: 0, pt: 0, es: 0, total: 0 },
      tiers: { STRONG: 0, MEDIUM: 0, WEAK: 0, NEGATIVE: 0 }
    };

    if (domainData.keywords) {
      for (const lang of ['en', 'pt', 'es']) {
        const kws = domainData.keywords[lang] || [];
        stats.keywords[lang] = kws.length;
        stats.keywords.total += kws.length;

        for (const kw of kws) {
          const tier = kw.tier || kw.t || 'MEDIUM';
          if (stats.tiers[tier] !== undefined) stats.tiers[tier]++;
        }
      }
    }

    if (domainData.patterns) {
      for (const lang of ['en', 'pt', 'es']) {
        const pats = domainData.patterns[lang] || [];
        stats.patterns[lang] = pats.length;
        stats.patterns.total += pats.length;
      }
    }

    domainStats.push(stats);
  }
}

audit.statistics.intentStats = intentStats;
audit.statistics.domainStats = domainStats;

// Flag tier imbalances
for (const s of intentStats) {
  const total = s.tiers.STRONG + s.tiers.MEDIUM + s.tiers.WEAK + s.tiers.NEGATIVE;
  if (total > 0) {
    const strongPct = (s.tiers.STRONG / total) * 100;
    const weakPct = (s.tiers.WEAK / total) * 100;

    if (strongPct > 40) {
      medium(`Intent ${s.intent}: STRONG tier is ${strongPct.toFixed(1)}% (>40%)`);
    }
    if (weakPct < 5 && total > 1000) {
      low(`Intent ${s.intent}: WEAK tier is only ${weakPct.toFixed(1)}% (<5%)`);
    }
    if (s.tiers.NEGATIVE === 0 && total > 1000) {
      medium(`Intent ${s.intent}: No NEGATIVE tier keywords`);
    }
  }
}

// ============================================================================
// 3. DUPLICATION ANALYSIS (NO REMOVAL)
// ============================================================================

console.log('3️⃣  Analyzing duplicates (READ-ONLY)...');

const allKeywords = new Map(); // keyword -> [{source, lang}]
const duplicates = { withinIntent: 0, acrossIntents: 0, acrossDomains: 0 };
const topDuplicates = [];

// Collect all intent keywords
if (intentPatterns?.intents) {
  for (const [intentName, intentData] of Object.entries(intentPatterns.intents)) {
    if (intentData.keywords) {
      for (const lang of ['en', 'pt', 'es']) {
        for (const kw of (intentData.keywords[lang] || [])) {
          const text = (kw.keyword || kw.k || kw).toString().toLowerCase().trim();
          if (!allKeywords.has(text)) {
            allKeywords.set(text, []);
          }
          allKeywords.get(text).push({ source: `intent:${intentName}`, lang, type: 'intent' });
        }
      }
    }
  }
}

// Collect all domain keywords
if (domainLayers?.domains) {
  for (const [domainName, domainData] of Object.entries(domainLayers.domains)) {
    if (domainData.keywords) {
      for (const lang of ['en', 'pt', 'es']) {
        for (const kw of (domainData.keywords[lang] || [])) {
          const text = (kw.keyword || kw.k || kw).toString().toLowerCase().trim();
          if (!allKeywords.has(text)) {
            allKeywords.set(text, []);
          }
          allKeywords.get(text).push({ source: `domain:${domainName}`, lang, type: 'domain' });
        }
      }
    }
  }
}

// Analyze duplicates
let totalDuplicateOccurrences = 0;
for (const [keyword, occurrences] of allKeywords.entries()) {
  if (occurrences.length > 1) {
    totalDuplicateOccurrences += occurrences.length - 1;

    const intents = new Set(occurrences.filter(o => o.type === 'intent').map(o => o.source));
    const domains = new Set(occurrences.filter(o => o.type === 'domain').map(o => o.source));

    if (intents.size > 1) duplicates.acrossIntents++;
    if (domains.size > 1) duplicates.acrossDomains++;

    // Check for within-intent duplicates (same intent, different entries)
    const intentCounts = {};
    for (const o of occurrences) {
      if (o.type === 'intent') {
        intentCounts[o.source] = (intentCounts[o.source] || 0) + 1;
      }
    }
    for (const count of Object.values(intentCounts)) {
      if (count > 1) duplicates.withinIntent++;
    }

    topDuplicates.push({
      keyword,
      count: occurrences.length,
      locations: occurrences.slice(0, 5).map(o => o.source)
    });
  }
}

topDuplicates.sort((a, b) => b.count - a.count);
audit.statistics.duplicates = {
  uniqueKeywords: allKeywords.size,
  totalDuplicateOccurrences,
  duplicateRatio: ((totalDuplicateOccurrences / allKeywords.size) * 100).toFixed(2) + '%',
  withinIntent: duplicates.withinIntent,
  acrossIntents: duplicates.acrossIntents,
  acrossDomains: duplicates.acrossDomains,
  top20: topDuplicates.slice(0, 20)
};

if (duplicates.acrossIntents > 1000) {
  high(`${duplicates.acrossIntents} keywords appear in multiple intents (potential routing confusion)`);
}

// ============================================================================
// 4. CROSS-INTENT LEAKAGE ANALYSIS
// ============================================================================

console.log('4️⃣  Analyzing cross-intent leakage...');

const DANGEROUS_TERMS = ['extract', 'remember', 'save', 'delete', 'upload', 'download', 'analyze', 'compare'];
const leakageReport = [];

for (const [keyword, occurrences] of allKeywords.entries()) {
  const intents = [...new Set(occurrences.filter(o => o.type === 'intent').map(o => o.source.replace('intent:', '')))];

  if (intents.length > 1) {
    const isDangerous = DANGEROUS_TERMS.some(t => keyword.includes(t));
    leakageReport.push({
      term: keyword,
      appearsIn: intents,
      riskLevel: isDangerous ? 'DANGEROUS' : 'ACCEPTABLE',
      reason: isDangerous ? 'Core action verb in multiple intents' : 'Common term, context-dependent'
    });
  }
}

audit.collisionMatrix = leakageReport.slice(0, 50);

const dangerousLeaks = leakageReport.filter(l => l.riskLevel === 'DANGEROUS');
if (dangerousLeaks.length > 0) {
  high(`${dangerousLeaks.length} DANGEROUS cross-intent leakages detected`, dangerousLeaks.slice(0, 10));
}

// ============================================================================
// 5. DOMAIN CONTAMINATION CHECK
// ============================================================================

console.log('5️⃣  Checking domain contamination...');

const DOMAIN_SPECIFIC_TERMS = {
  LEGAL: ['contract', 'clause', 'liability', 'indemnification', 'jurisdiction', 'arbitration'],
  MEDICAL: ['diagnosis', 'medication', 'symptom', 'patient', 'dosage', 'prescription'],
  FINANCE: ['revenue', 'profit', 'dividend', 'portfolio', 'equity', 'securities'],
  ENGINEERING: ['tolerance', 'specification', 'dimension', 'assembly', 'CAD', 'torque'],
  EXCEL: ['cell', 'formula', 'vlookup', 'spreadsheet', 'column', 'worksheet']
};

const contamination = [];

if (domainLayers?.domains) {
  for (const [domainName, domainData] of Object.entries(domainLayers.domains)) {
    if (!domainData.keywords) continue;

    for (const lang of ['en']) { // Check English only for term matching
      for (const kw of (domainData.keywords[lang] || [])) {
        const text = (kw.keyword || kw.k || '').toLowerCase();

        for (const [otherDomain, terms] of Object.entries(DOMAIN_SPECIFIC_TERMS)) {
          if (otherDomain === domainName) continue;

          for (const term of terms) {
            if (text.includes(term.toLowerCase())) {
              contamination.push({
                term: text,
                foundIn: domainName,
                expectedIn: otherDomain,
                matchedTerm: term,
                severity: 'MEDIUM'
              });
            }
          }
        }
      }
    }
  }
}

audit.statistics.domainContamination = contamination.slice(0, 30);

if (contamination.length > 50) {
  medium(`${contamination.length} potential domain contamination cases detected`);
}

// ============================================================================
// 6. DEPTH COVERAGE VALIDATION
// ============================================================================

console.log('6️⃣  Validating depth coverage...');

const depthCoverage = [];

if (intentSchema) {
  for (const [intentName, def] of Object.entries(intentSchema)) {
    if (intentName.startsWith('_') || typeof def !== 'object') continue;

    const depthInfo = def.depth;
    if (!depthInfo) {
      medium(`Intent ${intentName}: No depth levels defined`);
      depthCoverage.push({ intent: intentName, depths: [], status: 'MISSING' });
    } else if (typeof depthInfo === 'object') {
      const levels = Object.keys(depthInfo);
      depthCoverage.push({ intent: intentName, depths: levels, status: 'OK' });
    }
  }
}

audit.statistics.depthCoverage = depthCoverage;

// ============================================================================
// 7. ANSWER STYLE MAPPING CHECK
// ============================================================================

console.log('7️⃣  Checking answer style mappings...');

const answerStyleMapping = [];

if (outputSchema) {
  const hasAllowedSections = !!outputSchema.allowed_sections;
  const hasDomainFormats = !!outputSchema.domain_specific_formats;

  answerStyleMapping.push({
    file: 'output_schema.json',
    hasAllowedSections,
    hasDomainFormats,
    status: hasAllowedSections && hasDomainFormats ? 'OK' : 'INCOMPLETE'
  });

  if (!hasAllowedSections) {
    medium('output_schema.json missing allowed_sections');
  }
}

audit.statistics.answerStyleMapping = answerStyleMapping;

// ============================================================================
// 8. ROUTING PRIORITY AUDIT
// ============================================================================

console.log('8️⃣  Auditing routing priority...');

if (!routingPriority) {
  high('routing_priority.json NOT FOUND - no conflict resolution rules');
} else {
  const hasIntentPriority = !!routingPriority.intent_priority;
  const hasDomainPriority = !!routingPriority.domain_priority;
  const hasConflictResolution = !!routingPriority.conflict_resolution;

  audit.statistics.routingPriority = {
    hasIntentPriority,
    hasDomainPriority,
    hasConflictResolution,
    status: (hasIntentPriority && hasDomainPriority && hasConflictResolution) ? 'OK' : 'INCOMPLETE'
  };

  if (!hasConflictResolution) {
    high('routing_priority.json missing conflict_resolution rules');
  }
}

// ============================================================================
// 9. NEGATIVE TRIGGER SAFETY CHECK
// ============================================================================

console.log('9️⃣  Checking negative triggers...');

if (!negativeTriggers) {
  medium('negative_triggers.json NOT FOUND - no central negative registry');
} else {
  const domains = Object.keys(negativeTriggers.domain_negatives || {});
  const intents = Object.keys(negativeTriggers.intent_negatives || {});

  audit.statistics.negativeTriggers = {
    domainsWithNegatives: domains.length,
    intentsWithNegatives: intents.length,
    domains,
    intents
  };

  // Check for domains/intents missing negatives
  const expectedDomains = ['LEGAL', 'MEDICAL', 'FINANCE', 'ENGINEERING', 'EXCEL'];
  const missingDomainNegatives = expectedDomains.filter(d => !domains.includes(d));

  if (missingDomainNegatives.length > 0) {
    low(`Domains missing negative triggers: ${missingDomainNegatives.join(', ')}`);
  }
}

// ============================================================================
// 10. SCALE & BALANCE SANITY CHECK
// ============================================================================

console.log('🔟 Checking scale and balance...');

const EXPECTED_HEAVY_INTENTS = ['DOCUMENTS', 'EXTRACTION', 'REASONING'];
const EXPECTED_LIGHT_INTENTS = ['CONVERSATION', 'PREFERENCES', 'MEMORY'];

const scaleReport = [];

for (const s of intentStats) {
  const total = s.keywords.total + s.patterns.total;
  const isHeavy = EXPECTED_HEAVY_INTENTS.includes(s.intent);
  const isLight = EXPECTED_LIGHT_INTENTS.includes(s.intent);

  let status = 'OK';
  let note = '';

  if (isHeavy && total < 30000) {
    status = 'UNDERSIZED';
    note = 'Heavy intent should have ≥30k items';
    medium(`Intent ${s.intent} is undersized: ${total.toLocaleString()} items (expected ≥30k)`);
  } else if (isLight && total > 50000) {
    status = 'OVERSIZED';
    note = 'Light intent should be smaller';
    low(`Intent ${s.intent} may be oversized: ${total.toLocaleString()} items`);
  }

  scaleReport.push({
    intent: s.intent,
    total,
    expectedCategory: isHeavy ? 'HEAVY' : isLight ? 'LIGHT' : 'NORMAL',
    status,
    note
  });
}

audit.statistics.scaleReport = scaleReport;

// ============================================================================
// 11. HARDENING FILES CHECK (BONUS POINTS)
// ============================================================================

console.log('1️⃣1️⃣ Checking hardening files...');

const hardeningStatus = {
  routingTiebreakers: false,
  domainActivation: false,
  precedenceOrder: false,
  tierSemantics: false,
  answerStylesLinked: false
};

// Check routing_tiebreakers.json
if (routingTiebreakers && !routingTiebreakers._error) {
  hardeningStatus.routingTiebreakers = true;
  readinessScore += 5; // Bonus for having tiebreakers

  const ruleCount = routingTiebreakers.explicit_tiebreakers?.rules?.length || 0;
  audit.statistics.hardeningTiebreakers = {
    exists: true,
    explicitRules: ruleCount,
    contextTiebreakers: Object.keys(routingTiebreakers.context_tiebreakers || {}).length - 1
  };
} else {
  medium('routing_tiebreakers.json NOT FOUND - cross-intent conflicts unresolved');
}

// Check domain_activation.json
if (domainActivation && !domainActivation._error) {
  hardeningStatus.domainActivation = true;
  readinessScore += 5; // Bonus for domain gates

  const gateCount = Object.keys(domainActivation.domain_gates || {}).length;
  const sharedTerms = Object.keys(domainActivation.cross_domain_shared_terms || {}).length;
  audit.statistics.hardeningDomainActivation = {
    exists: true,
    domainGates: gateCount,
    sharedTermsMapped: sharedTerms
  };
} else {
  medium('domain_activation.json NOT FOUND - shared vocabulary not fenced');
}

// Check routing_priority has precedence_order (not just tiers)
if (routingPriority?.intent_priority?.precedence_order) {
  hardeningStatus.precedenceOrder = true;
  readinessScore += 3; // Bonus for explicit precedence

  const order = routingPriority.intent_priority.precedence_order;
  audit.statistics.hardeningPrecedence = {
    exists: true,
    order: order,
    intentsInOrder: order.length
  };
} else {
  medium('routing_priority.json missing explicit precedence_order');
}

// Check tier semantics defined
if (routingPriority?.intent_priority?.tier_semantics) {
  hardeningStatus.tierSemantics = true;
  readinessScore += 2; // Bonus for tier rules
}

// Check answer styles exist and are linked
if (answerStyles && !answerStyles._error) {
  hardeningStatus.answerStylesLinked = true;
  audit.statistics.hardeningAnswerStyles = {
    exists: true,
    styleCount: Object.keys(answerStyles).filter(k => !k.startsWith('_')).length
  };
}

audit.statistics.hardeningStatus = hardeningStatus;
const hardeningComplete = Object.values(hardeningStatus).filter(Boolean).length;
const hardeningTotal = Object.keys(hardeningStatus).length;

// ============================================================================
// GENERATE REPORT
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('                    KODA FORENSIC AUDIT REPORT');
console.log('='.repeat(70));

// Clamp score
readinessScore = Math.max(0, Math.min(100, readinessScore));

console.log('\n📊 EXECUTIVE SUMMARY');
console.log('-'.repeat(70));
console.log(`Readiness Score: ${readinessScore}/100`);
console.log(`Status: ${readinessScore >= 70 ? '✅ GO' : readinessScore >= 50 ? '⚠️ CONDITIONAL GO' : '❌ NO-GO'}`);
console.log(`Critical Blockers: ${audit.criticalBlockers.length}`);
console.log(`High-Risk Issues: ${audit.highRiskIssues.length}`);
console.log(`Medium-Risk Issues: ${audit.mediumRiskIssues.length}`);
console.log(`Low-Risk Issues: ${audit.lowRiskIssues.length}`);

// Intent Statistics Table
console.log('\n📈 INTENT STATISTICS');
console.log('-'.repeat(70));
console.log('Intent'.padEnd(15) + 'Keywords'.padStart(12) + 'Patterns'.padStart(12) + 'STRONG%'.padStart(10) + 'NEG%'.padStart(8));
console.log('-'.repeat(70));

for (const s of intentStats) {
  const total = s.tiers.STRONG + s.tiers.MEDIUM + s.tiers.WEAK + s.tiers.NEGATIVE;
  const strongPct = total > 0 ? ((s.tiers.STRONG / total) * 100).toFixed(1) : '0.0';
  const negPct = total > 0 ? ((s.tiers.NEGATIVE / total) * 100).toFixed(1) : '0.0';
  console.log(
    s.intent.padEnd(15) +
    s.keywords.total.toLocaleString().padStart(12) +
    s.patterns.total.toLocaleString().padStart(12) +
    (strongPct + '%').padStart(10) +
    (negPct + '%').padStart(8)
  );
}

const totalIntentKw = intentStats.reduce((a, s) => a + s.keywords.total, 0);
const totalIntentPat = intentStats.reduce((a, s) => a + s.patterns.total, 0);
console.log('-'.repeat(70));
console.log('TOTAL'.padEnd(15) + totalIntentKw.toLocaleString().padStart(12) + totalIntentPat.toLocaleString().padStart(12));

// Domain Statistics Table
console.log('\n📈 DOMAIN STATISTICS');
console.log('-'.repeat(70));
console.log('Domain'.padEnd(15) + 'Keywords'.padStart(12) + 'Patterns'.padStart(12) + 'STRONG%'.padStart(10) + 'NEG%'.padStart(8));
console.log('-'.repeat(70));

for (const s of domainStats) {
  const total = s.tiers.STRONG + s.tiers.MEDIUM + s.tiers.WEAK + s.tiers.NEGATIVE;
  const strongPct = total > 0 ? ((s.tiers.STRONG / total) * 100).toFixed(1) : '0.0';
  const negPct = total > 0 ? ((s.tiers.NEGATIVE / total) * 100).toFixed(1) : '0.0';
  console.log(
    s.domain.padEnd(15) +
    s.keywords.total.toLocaleString().padStart(12) +
    s.patterns.total.toLocaleString().padStart(12) +
    (strongPct + '%').padStart(10) +
    (negPct + '%').padStart(8)
  );
}

const totalDomainKw = domainStats.reduce((a, s) => a + s.keywords.total, 0);
const totalDomainPat = domainStats.reduce((a, s) => a + s.patterns.total, 0);
console.log('-'.repeat(70));
console.log('TOTAL'.padEnd(15) + totalDomainKw.toLocaleString().padStart(12) + totalDomainPat.toLocaleString().padStart(12));

// Hardening Status
console.log('\n🛡️  HARDENING STATUS');
console.log('-'.repeat(70));
console.log(`Hardening Checks: ${hardeningComplete}/${hardeningTotal} complete`);
console.log('');
console.log(`  ${hardeningStatus.routingTiebreakers ? '✅' : '❌'} routing_tiebreakers.json ${hardeningStatus.routingTiebreakers ? `(${audit.statistics.hardeningTiebreakers?.explicitRules || 0} rules)` : '(MISSING)'}`);
console.log(`  ${hardeningStatus.domainActivation ? '✅' : '❌'} domain_activation.json ${hardeningStatus.domainActivation ? `(${audit.statistics.hardeningDomainActivation?.domainGates || 0} gates)` : '(MISSING)'}`);
console.log(`  ${hardeningStatus.precedenceOrder ? '✅' : '❌'} Explicit precedence order ${hardeningStatus.precedenceOrder ? '(10 intents)' : '(MISSING)'}`);
console.log(`  ${hardeningStatus.tierSemantics ? '✅' : '❌'} Tier semantics defined`);
console.log(`  ${hardeningStatus.answerStylesLinked ? '✅' : '❌'} Answer styles linked`);

// Duplication Report
console.log('\n🔄 DUPLICATION ANALYSIS');
console.log('-'.repeat(70));
console.log(`Unique keywords analyzed: ${audit.statistics.duplicates.uniqueKeywords.toLocaleString()}`);
console.log(`Duplicate occurrences: ${audit.statistics.duplicates.totalDuplicateOccurrences.toLocaleString()}`);
console.log(`Duplicate ratio: ${audit.statistics.duplicates.duplicateRatio}`);
console.log(`Cross-intent duplicates: ${audit.statistics.duplicates.acrossIntents.toLocaleString()}`);
console.log(`Cross-domain duplicates: ${audit.statistics.duplicates.acrossDomains.toLocaleString()}`);

if (audit.statistics.duplicates.top20.length > 0) {
  console.log('\nTop 10 Most Duplicated Terms:');
  for (const d of audit.statistics.duplicates.top20.slice(0, 10)) {
    console.log(`  "${d.keyword}" - ${d.count}x in: ${d.locations.join(', ')}`);
  }
}

// Critical Blockers
if (audit.criticalBlockers.length > 0) {
  console.log('\n🔴 CRITICAL BLOCKERS');
  console.log('-'.repeat(70));
  for (const b of audit.criticalBlockers) {
    console.log(`❌ ${b.message}`);
  }
}

// High-Risk Issues
if (audit.highRiskIssues.length > 0) {
  console.log('\n🟠 HIGH-RISK ISSUES');
  console.log('-'.repeat(70));
  for (const h of audit.highRiskIssues) {
    console.log(`⚠️  ${h.message}`);
  }
}

// Medium-Risk Issues
if (audit.mediumRiskIssues.length > 0) {
  console.log('\n🟡 MEDIUM-RISK ISSUES');
  console.log('-'.repeat(70));
  for (const m of audit.mediumRiskIssues.slice(0, 15)) {
    console.log(`•  ${m.message}`);
  }
  if (audit.mediumRiskIssues.length > 15) {
    console.log(`   ... and ${audit.mediumRiskIssues.length - 15} more`);
  }
}

// Cross-Intent Leakage
if (audit.collisionMatrix.length > 0) {
  console.log('\n⚡ CROSS-INTENT LEAKAGE (Sample)');
  console.log('-'.repeat(70));
  const dangerous = audit.collisionMatrix.filter(c => c.riskLevel === 'DANGEROUS').slice(0, 10);
  if (dangerous.length > 0) {
    console.log('DANGEROUS leaks:');
    for (const d of dangerous) {
      console.log(`  "${d.term}" → ${d.appearsIn.join(', ')}`);
    }
  }
}

// Recommendations
console.log('\n📋 RECOMMENDED ACTIONS (MANUAL ONLY)');
console.log('-'.repeat(70));
console.log('1. Review cross-intent leakages and add to negative_triggers if needed');
console.log('2. Verify domain contamination cases are intentional overlaps');
console.log('3. Consider adding NEGATIVE tier keywords to intents missing them');
console.log('4. Validate routing_priority covers all conflict scenarios');
console.log('5. Ensure depth schema is referenced by intent patterns');
console.log('');
console.log('🚫 DO NOT auto-deduplicate - redundancy is intentional at this scale');
console.log('🚫 DO NOT delete cross-intent terms - use priority rules instead');
console.log('🚫 DO NOT merge domains - keep orthogonal to intents');

console.log('\n' + '='.repeat(70));
console.log('                         END OF AUDIT');
console.log('='.repeat(70));
console.log(`\nTotal items audited: ${(totalIntentKw + totalIntentPat + totalDomainKw + totalDomainPat).toLocaleString()}`);
