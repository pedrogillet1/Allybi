/**
 * KODA Router Test Harness
 *
 * Simulates frontend requests and returns full routing trace.
 * This is the core testing engine that eliminates UI retesting.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

// Load all routing data
let intentPatterns, domainLayers, routingPriority, routingTiebreakers;
let domainActivation, negativeTriggers, intentSchema;

function loadData() {
  intentPatterns = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'intent_patterns.json'), 'utf-8'));
  domainLayers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'domain_layers.json'), 'utf-8'));
  routingPriority = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'routing_priority.json'), 'utf-8'));
  routingTiebreakers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'routing_tiebreakers.json'), 'utf-8'));
  domainActivation = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'domain_activation.json'), 'utf-8'));
  negativeTriggers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'negative_triggers.json'), 'utf-8'));
  intentSchema = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'intent_schema.json'), 'utf-8'));
}

// Precedence order from routing_priority.json
const INTENT_PRECEDENCE = [
  'ERROR', 'FILE_ACTIONS', 'MEMORY', 'PREFERENCES',
  'EXTRACTION', 'DOCUMENTS', 'REASONING', 'EDIT', 'HELP', 'CONVERSATION'
];

/**
 * Detect language from input text
 * Simple heuristic based on common words and accents
 */
function detectLanguage(text) {
  const normalizedText = text.toLowerCase();

  // Portuguese indicators
  const ptIndicators = ['mostre', 'seção', 'cláusula', 'pagamento', 'qual', 'analise', 'riscos', 'desta', 'você', 'não', 'são', 'ção'];
  const ptScore = ptIndicators.filter(w => normalizedText.includes(w)).length;

  // Spanish indicators
  const esIndicators = ['muéstrame', 'sección', 'cláusula', 'pago', 'cuál', 'analiza', 'riesgos', 'esta', 'qué', 'cómo', 'está', 'ción'];
  const esScore = esIndicators.filter(w => normalizedText.includes(w)).length;

  // Return detected language
  if (ptScore > esScore && ptScore >= 1) return 'pt';
  if (esScore > ptScore && esScore >= 1) return 'es';
  return 'en';
}

/**
 * Match keywords against input text
 */
function matchKeywords(text, keywords, lang = 'en') {
  const normalizedText = text.toLowerCase();
  const matches = { STRONG: [], MEDIUM: [], WEAK: [], NEGATIVE: [] };

  const langKeywords = keywords[lang] || [];

  for (const kw of langKeywords) {
    const keyword = (kw.keyword || kw.k || '').toLowerCase();
    const tier = kw.tier || 'MEDIUM';

    if (keyword && normalizedText.includes(keyword)) {
      matches[tier].push({
        keyword,
        tier,
        layer: kw.layer || 'unknown'
      });
    }
  }

  return matches;
}

/**
 * Check if negative triggers block an intent/domain
 */
function checkNegativeTriggers(text, category, type = 'intent') {
  const normalizedText = text.toLowerCase();
  const triggers = type === 'intent'
    ? negativeTriggers?.intent_negatives?.[category]?.triggers?.en || []
    : negativeTriggers?.domain_negatives?.[category]?.triggers?.en || [];

  const hits = [];
  for (const trigger of triggers) {
    if (normalizedText.includes(trigger.toLowerCase())) {
      hits.push(trigger);
    }
  }

  return hits;
}

/**
 * Check tiebreaker rules
 */
function checkTiebreakers(text, matchedIntents) {
  const normalizedText = text.toLowerCase();
  const hits = [];

  const rules = routingTiebreakers?.explicit_tiebreakers?.rules || [];

  for (const rule of rules) {
    const ifTerms = rule.if_contains || [];
    const allMatch = ifTerms.every(term => normalizedText.includes(term.toLowerCase()));

    if (allMatch && matchedIntents.includes(rule.route_to)) {
      hits.push({
        rule_id: rule.id,
        route_to: rule.route_to,
        matched_terms: ifTerms,
        rationale: rule.rationale
      });
    }
  }

  return hits;
}

/**
 * 6-LAYER DOMAIN ACTIVATION SYSTEM
 *
 * Layer 1: Strong Anchors (must have >=1)
 * Layer 2: Structural Signals (must have >=1)
 * Layer 3: Reinforcement Score (weighted)
 * Layer 4: Negative Blockers (absolute override)
 * Layer 5: Tie-Breakers (collision resolution)
 * Layer 6: Activation Threshold (final decision)
 */
function checkDomainGate6Layer(text, domain, lang = 'en') {
  const normalizedText = text.toLowerCase();
  const domainConfig = domainActivation?.domains?.[domain];

  if (!domainConfig) {
    return { passed: false, reason: 'no_domain_config', layers: {} };
  }

  const layers = {
    layer1_anchors: { passed: false, hits: [] },
    layer2_structure: { passed: false, hits: [] },
    layer3_reinforcement: { score: 0, hits: [] },
    layer4_blockers: { blocked: false, hits: [] },
    layer5_tiebreakers: { applied: false, rules: [] },
    layer6_threshold: { passed: false }
  };

  // LAYER 1: Strong Anchors
  const anchors = domainConfig.layer1_strong_anchors?.anchors?.[lang] ||
                  domainConfig.layer1_strong_anchors?.anchors?.en || [];
  for (const anchor of anchors) {
    if (normalizedText.includes(anchor.toLowerCase())) {
      layers.layer1_anchors.hits.push(anchor);
    }
  }
  layers.layer1_anchors.passed = layers.layer1_anchors.hits.length >= 1;

  // LAYER 2: Structural Signals (check patterns)
  const patterns = domainConfig.layer2_structural_signals?.patterns?.[lang] ||
                   domainConfig.layer2_structural_signals?.patterns?.en || [];
  for (const pattern of patterns) {
    // For simple patterns, do string matching; for regex patterns, try regex
    try {
      if (pattern.includes('\\d') || pattern.includes('[')) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          layers.layer2_structure.hits.push(pattern);
        }
      } else if (normalizedText.includes(pattern.toLowerCase())) {
        layers.layer2_structure.hits.push(pattern);
      }
    } catch (e) {
      // Fallback to string matching if regex fails
      if (normalizedText.includes(pattern.toLowerCase())) {
        layers.layer2_structure.hits.push(pattern);
      }
    }
  }
  layers.layer2_structure.passed = layers.layer2_structure.hits.length >= 1;

  // LAYER 3: Reinforcement Score
  const reinforcements = domainConfig.layer3_reinforcement?.keywords?.[lang] ||
                         domainConfig.layer3_reinforcement?.keywords?.en || [];
  for (const r of reinforcements) {
    const term = r.term || r;
    const weight = r.weight || 0.3;
    if (normalizedText.includes(term.toLowerCase())) {
      layers.layer3_reinforcement.hits.push({ term, weight });
      layers.layer3_reinforcement.score += weight;
    }
  }

  // LAYER 4: Negative Blockers (ABSOLUTE OVERRIDE)
  const blockers = domainConfig.layer4_negative_blockers?.blockers?.[lang] ||
                   domainConfig.layer4_negative_blockers?.blockers?.en || [];
  for (const blocker of blockers) {
    if (normalizedText.includes(blocker.toLowerCase())) {
      layers.layer4_blockers.hits.push(blocker);
      layers.layer4_blockers.blocked = true;
    }
  }

  // Also check cross-domain blockers
  const crossBlockers = domainActivation?.cross_domain_blockers?.matrix || {};
  for (const [term, blockedDomains] of Object.entries(crossBlockers)) {
    if (blockedDomains.includes(domain) && normalizedText.includes(term.toLowerCase())) {
      layers.layer4_blockers.hits.push(`cross:${term}`);
      layers.layer4_blockers.blocked = true;
    }
  }

  // LAYER 5: Tie-Breakers (checked later when comparing domains)
  const tiebreakers = domainConfig.layer5_tiebreakers?.rules || [];
  for (const rule of tiebreakers) {
    const parts = rule.pattern.split(' + ').map(p => p.trim().toLowerCase());
    const allMatch = parts.every(p => normalizedText.includes(p));
    if (allMatch) {
      layers.layer5_tiebreakers.rules.push(rule);
      layers.layer5_tiebreakers.applied = true;
    }
  }

  // LAYER 6: Activation Threshold (final decision)
  // A domain activates ONLY when:
  // - Layer 1: >=1 anchor present
  // - Layer 2: >=1 structure present (OR relaxed if anchor is very strong)
  // - Layer 3: reinforcement score >= 0 (any positive helps)
  // - Layer 4: NO blockers hit

  const minReinforcementScore = domainActivation?.activation_thresholds?.min_reinforcement_score || 0;

  // Relaxed mode: if we have multiple anchors OR very specific anchor, we can relax structure requirement
  const hasStrongAnchorMatch = layers.layer1_anchors.hits.length >= 2 ||
    layers.layer1_anchors.hits.some(a => a.length > 10); // longer anchors are more specific

  layers.layer6_threshold.passed = (
    layers.layer1_anchors.passed &&
    (layers.layer2_structure.passed || hasStrongAnchorMatch) &&
    !layers.layer4_blockers.blocked
  );

  return {
    passed: layers.layer6_threshold.passed,
    reason: !layers.layer1_anchors.passed ? 'no_anchor' :
            layers.layer4_blockers.blocked ? 'blocked' :
            !layers.layer2_structure.passed && !hasStrongAnchorMatch ? 'no_structure' :
            'activated',
    layers,
    score: layers.layer1_anchors.hits.length +
           layers.layer2_structure.hits.length * 0.5 +
           layers.layer3_reinforcement.score
  };
}

/**
 * Legacy checkDomainGate wrapper for backward compatibility
 */
function checkDomainGate(text, domain) {
  return checkDomainGate6Layer(text, domain, 'en');
}

/**
 * Determine depth level based on query complexity signals
 */
function determineDepth(text, intent) {
  const normalizedText = text.toLowerCase();

  // Depth signals (simplified)
  const d1Signals = ['what is', 'show', 'list', 'find', 'where'];
  const d2Signals = ['explain', 'describe', 'summarize', 'overview'];
  const d3Signals = ['compare', 'analyze', 'evaluate', 'assess'];
  const d4Signals = ['implications', 'risks', 'comprehensive', 'detailed analysis'];
  const d5Signals = ['strategic', 'long-term', 'systemic', 'full audit'];

  if (d5Signals.some(s => normalizedText.includes(s))) return 'D5';
  if (d4Signals.some(s => normalizedText.includes(s))) return 'D4';
  if (d3Signals.some(s => normalizedText.includes(s))) return 'D3';
  if (d2Signals.some(s => normalizedText.includes(s))) return 'D2';
  return 'D1';
}

/**
 * Score an intent based on keyword matches
 * CRITICAL: NEGATIVE tier blocks intent from winning
 */
function scoreIntent(matches) {
  const weights = { STRONG: 1.0, MEDIUM: 0.6, WEAK: 0.3, NEGATIVE: -1.0 };

  let score = 0;
  for (const [tier, kws] of Object.entries(matches)) {
    score += kws.length * (weights[tier] || 0);
  }

  // CRITICAL FIX: NEGATIVE matches reduce effective STRONG count
  // An intent with 2+ NEGATIVE matches should NOT be able to win via STRONG alone
  const effectiveStrongCount = Math.max(0, matches.STRONG.length - matches.NEGATIVE.length);

  // CRITICAL FIX: If negatives >= 2, intent cannot win alone
  const blockedByNegatives = matches.NEGATIVE.length >= 2;

  return {
    score,
    strongCount: matches.STRONG.length,
    effectiveStrongCount,
    mediumCount: matches.MEDIUM.length,
    weakCount: matches.WEAK.length,
    negativeCount: matches.NEGATIVE.length,
    canWinAlone: effectiveStrongCount > 0 && !blockedByNegatives && score > 0
  };
}

/**
 * Main routing function - returns full trace
 */
function routeQuery(input, lang = 'auto') {
  if (!intentPatterns) loadData();

  // Auto-detect language if not specified
  const detectedLang = lang === 'auto' ? detectLanguage(input) : lang;

  const startTime = Date.now();
  const trace = {
    trace_id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    input,
    lang: detectedLang,
    intent: null,
    domain: [],
    depth: null,
    routing: {
      intent_scores: {},
      domain_scores: {},
      matched_keywords: [],
      matched_patterns: [],
      negative_triggers_hit: [],
      tie_breakers_hit: [],
      decision_path: []
    },
    format: {
      template_id: null,
      sections: []
    },
    timing: {
      router_ms: 0
    },
    warnings: [],
    errors: []
  };

  // BEGINNER_OVERRIDE: Check for navigation patterns first
  // If query contains navigation verb + file reference, force FILE_ACTIONS
  // BUT exclude: error states, help requests, and document content queries
  const normalizedInput = input.toLowerCase();

  // Pure file navigation verbs (NOT error or help)
  const navigationVerbs = ['where is file', 'show me file', 'open file', 'open the file', 'find file',
    'find my file', 'find the file', 'find my document', 'show my files', 'show my uploads',
    'open the pdf', 'view the file', 'view the pdf', 'list files', 'list my files',
    'my files', 'my upload', 'where did my upload', 'recent uploads', 'search files',
    'delete file', 'move file', 'rename file', 'download file', 'upload file'];

  // Exclusions: error states, help requests, content queries
  const errorExclusions = ["can't access", 'crashed', 'failed', 'error', 'not working', "won't load",
    "why can't you find", "can't you find", "didn't upload", "that didn't"];
  const helpExclusions = ['how do i', 'how does', 'what is the', 'size limit',
    "why can't i see", "can't i see", "what formats"];
  const contentExclusions = ['clause', 'section', 'article', 'force majeure', 'payment terms',
    'read only', 'no modifications', 'explain'];

  const hasNavigationVerb = navigationVerbs.some(v => normalizedInput.includes(v));
  const hasErrorExclusion = errorExclusions.some(e => normalizedInput.includes(e));
  const hasHelpExclusion = helpExclusions.some(h => normalizedInput.includes(h));
  const hasContentExclusion = contentExclusions.some(c => normalizedInput.includes(c));

  // Only trigger beginner override if:
  // 1. Has navigation verb
  // 2. No error/help/content exclusions
  if (hasNavigationVerb && !hasErrorExclusion && !hasHelpExclusion && !hasContentExclusion) {
    trace.routing.decision_path.push('BEGINNER_OVERRIDE: Pure file navigation detected');
    trace.routing.decision_path.push('Forcing FILE_ACTIONS, skipping domain activation');
    trace.intent = 'FILE_ACTIONS';
    trace.domain = ['general'];
    trace.depth = 'D1';
    trace.routing.decision_reason = 'beginner_override';
    trace.format.template_id = 'GENERAL_FILE_ACTIONS_D1';
    trace.format.sections = ['FileCard', 'ActionButtons', 'NextSuggestions'];
    trace.timing.router_ms = Date.now() - startTime;
    return trace;
  }

  // Step 1: Score all intents
  const intentScores = {};

  for (const [intentName, intentData] of Object.entries(intentPatterns.intents || {})) {
    const matches = matchKeywords(input, intentData.keywords || {}, detectedLang);
    const score = scoreIntent(matches);

    // Check negative triggers
    const negativeHits = checkNegativeTriggers(input, intentName, 'intent');
    if (negativeHits.length > 0) {
      score.score -= negativeHits.length * 0.5;
      trace.routing.negative_triggers_hit.push({
        intent: intentName,
        triggers: negativeHits
      });
    }

    intentScores[intentName] = {
      ...score,
      matches
    };

    // Collect all matched keywords for trace
    for (const tier of ['STRONG', 'MEDIUM', 'WEAK']) {
      for (const kw of matches[tier]) {
        trace.routing.matched_keywords.push({
          keyword: kw.keyword,
          tier: kw.tier,
          intent: intentName
        });
      }
    }
  }

  trace.routing.intent_scores = Object.fromEntries(
    Object.entries(intentScores).map(([k, v]) => [k, { score: v.score, strong: v.strongCount }])
  );

  // Step 2: Determine winning intent using precedence order
  let winningIntent = 'CONVERSATION'; // fallback
  let decisionReason = 'fallback';

  // First pass: find intents with STRONG matches (considering NEGATIVE blocking)
  const strongIntents = Object.entries(intentScores)
    .filter(([_, s]) => s.canWinAlone && s.score > 0)
    .sort((a, b) => {
      // CRITICAL: Sort by total SCORE first (incorporates NEGATIVE penalties)
      if (Math.abs(a[1].score - b[1].score) > 0.5) {
        return b[1].score - a[1].score;
      }
      // Then by effective STRONG count (STRONG minus NEGATIVE)
      const effA = a[1].effectiveStrongCount || a[1].strongCount;
      const effB = b[1].effectiveStrongCount || b[1].strongCount;
      if (effA !== effB) {
        return effB - effA;
      }
      // Finally by precedence order as tiebreaker
      const aIdx = INTENT_PRECEDENCE.indexOf(a[0]);
      const bIdx = INTENT_PRECEDENCE.indexOf(b[0]);
      return aIdx - bIdx;
    });

  if (strongIntents.length > 0) {
    winningIntent = strongIntents[0][0];
    decisionReason = 'strong_keyword_match';
    trace.routing.decision_path.push(`Strong match: ${winningIntent}`);

    // Check for tiebreakers if multiple strong matches
    if (strongIntents.length > 1) {
      const matchedIntentNames = strongIntents.map(([name]) => name);
      const tiebreakers = checkTiebreakers(input, matchedIntentNames);

      if (tiebreakers.length > 0) {
        winningIntent = tiebreakers[0].route_to;
        decisionReason = 'tiebreaker_rule';
        trace.routing.tie_breakers_hit = tiebreakers;
        trace.routing.decision_path.push(`Tiebreaker applied: ${tiebreakers[0].rule_id}`);
      } else {
        trace.routing.decision_path.push(`Precedence order used: ${winningIntent} > ${strongIntents[1][0]}`);
      }
    }
  } else {
    // Second pass: use highest scoring intent with precedence
    const scoredIntents = Object.entries(intentScores)
      .filter(([_, s]) => s.score > 0)
      .sort((a, b) => {
        const aIdx = INTENT_PRECEDENCE.indexOf(a[0]);
        const bIdx = INTENT_PRECEDENCE.indexOf(b[0]);
        if (Math.abs(a[1].score - b[1].score) < 0.5) {
          return aIdx - bIdx; // Use precedence for close scores
        }
        return b[1].score - a[1].score;
      });

    if (scoredIntents.length > 0) {
      winningIntent = scoredIntents[0][0];
      decisionReason = 'highest_score_with_precedence';
      trace.routing.decision_path.push(`Score-based: ${winningIntent} (${scoredIntents[0][1].score.toFixed(2)})`);
    } else {
      trace.routing.decision_path.push('No matches, using fallback: CONVERSATION');
    }
  }

  trace.intent = winningIntent;
  trace.routing.decision_reason = decisionReason;

  // Step 3: Score domains using 6-layer activation
  const domainScores = {};

  for (const [domainName, domainData] of Object.entries(domainLayers.domains || {})) {
    // Use the 6-layer activation system
    const gateResult = checkDomainGate6Layer(input, domainName, detectedLang);

    // Also check legacy keyword matches for backward compatibility
    const matches = matchKeywords(input, domainData.keywords || {}, detectedLang);
    const keywordScore = scoreIntent(matches);

    // Combine scores: gate score (from 6-layer) + keyword score
    const combinedScore = gateResult.passed ?
      (gateResult.score || 1) + keywordScore.score * 0.5 :
      0; // If gate fails, domain doesn't activate

    domainScores[domainName] = {
      score: combinedScore,
      gateResult,
      keywordScore: keywordScore.score,
      layers: gateResult.layers
    };

    // Add decision path for debugging
    if (gateResult.passed) {
      trace.routing.decision_path.push(
        `Domain ${domainName}: activated (anchors: ${gateResult.layers?.layer1_anchors?.hits?.length || 0}, ` +
        `structure: ${gateResult.layers?.layer2_structure?.hits?.length || 0})`
      );
    } else if (gateResult.reason) {
      trace.warnings.push(`Domain ${domainName} failed: ${gateResult.reason}`);
    }
  }

  trace.routing.domain_scores = Object.fromEntries(
    Object.entries(domainScores).map(([k, v]) => [k, {
      score: v.score,
      activated: v.gateResult.passed,
      reason: v.gateResult.reason,
      anchors: v.gateResult.layers?.layer1_anchors?.hits || [],
      blocked: v.gateResult.layers?.layer4_blockers?.blocked || false
    }])
  );

  // Select winning domains - ONLY domains that passed the 6-layer gate
  const activeDomains = Object.entries(domainScores)
    .filter(([_, s]) => s.gateResult.passed && s.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 2)
    .map(([name]) => name.toLowerCase());

  trace.domain = activeDomains.length > 0 ? activeDomains : ['general'];

  // Step 4: Determine depth
  trace.depth = determineDepth(input, winningIntent);

  // Step 5: Determine output format
  trace.format = {
    template_id: `${trace.domain[0].toUpperCase()}_${winningIntent}_${trace.depth}`,
    sections: getExpectedSections(winningIntent, trace.domain[0])
  };

  // Timing
  trace.timing.router_ms = Date.now() - startTime;

  return trace;
}

/**
 * Get expected output sections for an intent/domain combination
 */
function getExpectedSections(intent, domain) {
  const sectionMap = {
    DOCUMENTS: {
      legal: ['Relevant Sections', 'Key Clauses', 'Cross-References'],
      medical: ['Relevant Records', 'Lab Values', 'Timeline'],
      finance: ['Relevant Data', 'Key Figures', 'Period Comparison'],
      default: ['Content', 'References', 'Navigation']
    },
    EXTRACTION: {
      legal: ['Extracted Values', 'Source Citations', 'Confidence'],
      medical: ['Extracted Data', 'Reference Ranges', 'Units'],
      finance: ['Extracted Figures', 'Calculations', 'Sources'],
      default: ['Extracted Data', 'Source', 'Confidence']
    },
    REASONING: {
      legal: ['Analysis', 'Implications', 'Risks', 'Recommendations'],
      medical: ['Clinical Interpretation', 'Considerations', 'Limitations'],
      finance: ['Financial Analysis', 'Trends', 'Risks'],
      default: ['Analysis', 'Interpretation', 'Considerations']
    },
    EDIT: {
      default: ['Original', 'Suggested Changes', 'Rationale']
    },
    HELP: {
      default: ['Answer', 'Related Features', 'Next Steps']
    },
    CONVERSATION: {
      default: ['Response']
    },
    ERROR: {
      default: ['Error Description', 'Suggested Actions', 'Support']
    },
    FILE_ACTIONS: {
      default: ['Action Status', 'File Details', 'Next Steps']
    },
    MEMORY: {
      default: ['Recalled Information', 'Context', 'Relevance']
    },
    PREFERENCES: {
      default: ['Current Setting', 'Change Applied', 'Related Settings']
    }
  };

  const intentSections = sectionMap[intent] || sectionMap.CONVERSATION;
  return intentSections[domain] || intentSections.default || ['Response'];
}

/**
 * Batch route multiple queries
 */
function batchRoute(queries, lang = 'en') {
  return queries.map(q => routeQuery(q, lang));
}

/**
 * Validate routing result against expected values
 */
function validateRouting(result, expected) {
  const failures = [];

  if (expected.intent && result.intent !== expected.intent) {
    failures.push({
      field: 'intent',
      expected: expected.intent,
      actual: result.intent
    });
  }

  if (expected.domain) {
    const expectedDomains = Array.isArray(expected.domain) ? expected.domain : [expected.domain];
    const missingDomains = expectedDomains.filter(d => !result.domain.includes(d.toLowerCase()));
    if (missingDomains.length > 0) {
      failures.push({
        field: 'domain',
        expected: expectedDomains,
        actual: result.domain,
        missing: missingDomains
      });
    }
  }

  if (expected.depth && result.depth !== expected.depth) {
    // Allow one level of variance
    const depthOrder = ['D1', 'D2', 'D3', 'D4', 'D5'];
    const expectedIdx = depthOrder.indexOf(expected.depth);
    const actualIdx = depthOrder.indexOf(result.depth);
    if (Math.abs(expectedIdx - actualIdx) > 1) {
      failures.push({
        field: 'depth',
        expected: expected.depth,
        actual: result.depth
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures
  };
}

module.exports = {
  loadData,
  routeQuery,
  batchRoute,
  validateRouting,
  matchKeywords,
  checkTiebreakers,
  checkDomainGate,
  checkDomainGate6Layer,
  determineDepth,
  INTENT_PRECEDENCE
};
