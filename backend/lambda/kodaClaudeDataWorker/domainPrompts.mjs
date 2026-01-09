/**
 * KODA Domain Prompts v1.0 - MASTER GENERATION CONTRACT
 *
 * ABSOLUTE RULES (NON-NEGOTIABLE):
 * 1. NO REMOVALS - Do not delete, merge, compress, or "clean"
 * 2. NO AUTO-CONFLICT RESOLUTION - Do NOT resolve overlaps
 * 3. NO INTELLIGENCE DECISIONS - You are NOT deciding what is "better"
 * 4. EXACT COUNTS REQUIRED - If bucket says 18, output exactly 18
 * 5. OUTPUT = DATA ONLY - No prose, no markdown, no explanations
 */

const LANG_NAMES = {
  en: 'English',
  pt: 'Portuguese (Brazilian)',
  es: 'Spanish (Latin American/Neutral)'
};

// =============================================================================
// DOMAIN SYSTEM PROMPT - THE GENERATION CONTRACT
// =============================================================================

export const DOMAIN_SYSTEM_PROMPT = `You are a deterministic data generator for KODA's domain routing system.

🔴 ABSOLUTE RULES (NON-NEGOTIABLE)

1. NO REMOVALS
   - Do not delete, merge, compress, or "clean" any data
   - This is an EXPANSION ONLY task

2. NO AUTO-CONFLICT RESOLUTION
   - Do NOT resolve overlaps
   - Do NOT reduce counts due to "conflicts"
   - Do NOT deduplicate unless two strings are byte-identical

3. NO INTELLIGENCE DECISIONS
   - You are NOT deciding what is "better"
   - You are NOT simplifying
   - You are NOT optimizing

4. EXACT COUNTS REQUIRED
   - If count says 18 → output exactly 18 items
   - If you cannot hit the count, STOP and report failure

5. OUTPUT = DATA ONLY
   - Output ONLY JSON
   - No prose, no markdown, no explanations, no comments

🔒 LANGUAGE PURITY RULES (MANDATORY)

- English output → English only
- Portuguese output → Brazilian Portuguese only
- Spanish output → Neutral Latin American Spanish only
- No mixed-language tokens
- No translated idioms that don't exist in that language

📐 NORMALIZATION RULES (STRICT)

ALLOWED:
- Semantic variants
- Real phrasing diversity
- Domain-authentic terminology

FORBIDDEN:
- Case-only variants
- Punctuation-only variants
- Plural/singular spam
- Filler words
- Micro-variants that do not change routing power

📊 PHRASE LENGTH DISTRIBUTION (MANDATORY)

- 65% → 1-2 tokens
- 25% → 3-5 tokens
- 10% → 6-10 tokens (ONLY high-signal phrases)

🚫 FAILURE MODE

If you believe something is "conflicting":
❌ DO NOT delete
❌ DO NOT compress
❌ DO NOT reduce

✅ Output a failure message stating:
- which bucket
- which constraint failed
- why generation cannot continue

📋 OUTPUT FORMAT

All output MUST be valid JSON parseable by standard JSON parsers.
For patterns: Use \\\\b for word boundaries, (?:...) for non-capturing groups.
No nested .* inside groups (avoid catastrophic backtracking).`;

// =============================================================================
// KEYWORD PROMPT BUILDER
// =============================================================================

export function buildDomainKeywordsPrompt(job) {
  const { domain, bucket, language, count, description, tiers } = job;
  const langName = LANG_NAMES[language];

  // Calculate tier distribution for this batch
  const tierDistribution = calculateTierDistribution(count, tiers);

  return `Generate exactly ${count} domain routing keywords for:

DOMAIN: ${domain}
BUCKET: ${bucket}
LANGUAGE: ${langName}

BUCKET DESCRIPTION: ${description}

TIER DISTRIBUTION FOR THIS BATCH:
- STRONG: ${tierDistribution.STRONG} (high-confidence domain signals)
- MEDIUM: ${tierDistribution.MEDIUM} (moderate confidence signals)
- WEAK: ${tierDistribution.WEAK} (low confidence, contextual signals)
- NEGATIVE: ${tierDistribution.NEGATIVE} (signals that EXCLUDE this domain)

KEYWORD REQUIREMENTS (NON-NEGOTIABLE):
1. Generate EXACTLY ${count} keywords - no more, no less
2. Each keyword is a routing signal, not a definition
3. Include domain-specific terminology real professionals use
4. STRONG = unambiguous domain marker
5. MEDIUM = likely domain indicator, needs context
6. WEAK = possible indicator, highly contextual
7. NEGATIVE = explicitly NOT this domain

PHRASE LENGTH DISTRIBUTION:
- 65% should be 1-2 tokens
- 25% should be 3-5 tokens
- 10% should be 6-10 tokens

OUTPUT SCHEMA (STRICT JSON):
{
  "jobId": "${job.jobId}",
  "domain": "${domain}",
  "bucket": "${bucket}",
  "language": "${language}",
  "items": [
    { "t": "STRONG", "k": "exact keyword phrase" },
    { "t": "MEDIUM", "k": "another keyword" },
    { "t": "WEAK", "k": "contextual keyword" },
    { "t": "NEGATIVE", "k": "exclusion keyword" }
  ],
  "counts": { "total": ${count}, "STRONG": ${tierDistribution.STRONG}, "MEDIUM": ${tierDistribution.MEDIUM}, "WEAK": ${tierDistribution.WEAK}, "NEGATIVE": ${tierDistribution.NEGATIVE} }
}

Return ONLY the JSON object. Generate ALL ${count} items with exact tier distribution.`;
}

// =============================================================================
// PATTERN PROMPT BUILDER
// =============================================================================

export function buildDomainPatternsPrompt(job) {
  const { domain, bucket, language, count, description } = job;
  const langName = LANG_NAMES[language];

  return `Generate exactly ${count} regex patterns for domain routing:

DOMAIN: ${domain}
BUCKET: ${bucket}
LANGUAGE: ${langName}

BUCKET DESCRIPTION: ${description}

PATTERN REQUIREMENTS (NON-NEGOTIABLE):
1. Generate EXACTLY ${count} patterns - no more, no less
2. Valid JavaScript regex strings (no surrounding /.../i)
3. Use \\\\b for word boundaries
4. Use (?:...) for non-capturing groups
5. Use ^ anchor at start when matching query beginnings
6. NO nested .* inside groups (avoid catastrophic backtracking)
7. NO inline flags (we compile with /i)
8. Keep patterns specific enough to avoid overmatching
9. Keep patterns general enough to catch natural language variation

PATTERN TYPES TO INCLUDE:
- Question patterns (what, where, how, why + domain terms)
- Command patterns (find, show, extract + domain terms)
- Declarative patterns (I need, looking for + domain terms)
- Contextual patterns (in the contract, from the report + domain terms)

REGEX SAFETY:
- Escape special characters properly
- Use \\\\s+ for whitespace (not just space)
- Use \\\\w+ for word characters
- Avoid greedy .* - prefer non-greedy .*? or specific patterns

OUTPUT SCHEMA (STRICT JSON):
{
  "jobId": "${job.jobId}",
  "domain": "${domain}",
  "bucket": "${bucket}",
  "language": "${language}",
  "items": [
    { "p": "^(?:find|show)\\\\s+(?:the\\\\s+)?${domain.toLowerCase()}\\\\b" }
  ],
  "counts": { "total": ${count} }
}

Return ONLY the JSON object. Generate ALL ${count} patterns.`;
}

// =============================================================================
// TIER DISTRIBUTION CALCULATOR
// =============================================================================

function calculateTierDistribution(count, tiers) {
  const total = tiers.STRONG + tiers.MEDIUM + tiers.WEAK + tiers.NEGATIVE;
  return {
    STRONG: Math.round((tiers.STRONG / total) * count),
    MEDIUM: Math.round((tiers.MEDIUM / total) * count),
    WEAK: Math.round((tiers.WEAK / total) * count),
    NEGATIVE: Math.max(1, Math.round((tiers.NEGATIVE / total) * count))
  };
}

// =============================================================================
// UNIFIED PROMPT DISPATCHER
// =============================================================================

export function buildDomainPrompt(job) {
  if (job.artifactType === 'keywords') {
    return buildDomainKeywordsPrompt(job);
  } else {
    return buildDomainPatternsPrompt(job);
  }
}
