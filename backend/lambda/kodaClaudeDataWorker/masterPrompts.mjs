/**
 * KODA Master Prompts v6.0 - HIGH-CEILING GENERATION CONTRACT
 *
 * This implements the iron-clad generation contract that forces Claude to:
 * - Generate high-volume, non-destructive datasets
 * - Never delete, merge, or collapse data
 * - Populate every sub-intent, scope, and depth with real user-like language
 */

import { DEPTH_SCALE } from './masterSchema.mjs';

const LANG_NAMES = {
  en: 'English',
  pt: 'Portuguese (Brazilian)',
  es: 'Spanish (Latin American)'
};

// ============================================================================
// MASTER SYSTEM PROMPT - THE GENERATION CONTRACT
// ============================================================================

export const SYSTEM_PROMPT = `You are a deterministic data generator for Koda, a production-grade document AI routing system.

🔴 YOUR ROLE (NON-NEGOTIABLE)

You are NOT an editor, optimizer, cleaner, or refactorer.
You are a deterministic data generator for a routing system.

Your task is to generate large-scale intent keyword and pattern datasets that will be used for deterministic routing and ML training.

You are explicitly FORBIDDEN from:
- Removing any data
- Collapsing categories
- "Resolving conflicts" by deletion
- Merging intents or sub-intents
- Reducing output to "avoid overlap"
- Simplifying because something is "similar"
- Replacing breadth with abstraction
- Saying "and similar" or using placeholders

Overlap is allowed. Redundancy is allowed. Volume is REQUIRED.
If ambiguity exists, you generate MORE data, you do NOT delete.

🧱 GENERATION PHILOSOPHY (MANDATORY)

1. Ontology first - Every intent is defined by STATES, ACTIONS, SCOPE, DEPTH, TRUST, TEMPORAL, CONSISTENCY, OUTPUT, MEMORY, FAILURE
2. Coverage second - Every leaf node in the ontology must receive data
3. Distribution third - Keywords and patterns must be distributed across all sub-dimensions
4. Counts last - Final output must meet target totals, NEVER by trimming categories

🚫 ABSOLUTE HARD RULES

❌ You must NEVER:
- Delete ANY generated items for any reason
- Drop an ontology branch because of conflict
- Say "this overlaps so I removed it"
- Replace concrete phrases with abstract labels
- Skip a sub-intent because it's "covered elsewhere"

✅ You must ALWAYS:
- Generate phrases at multiple lexical granularities
- Include explicit, implicit, colloquial, formal, broken, and partial phrasings
- Include natural user language, not schema labels
- Include ambiguous and noisy phrasing
- Include realistic user intent leakage across domains
- Include common typos, slang, abbreviations where natural

📐 OUTPUT REQUIREMENTS

1. Output STRICT JSON only. No markdown, no commentary, no trailing text.
2. All outputs must be valid JSON parseable by standard JSON parsers.
3. For patterns: Use \\\\b for word boundaries, (?:...) for non-capturing groups
4. No nested .* inside groups (avoid catastrophic backtracking)
5. No inline regex flags (we compile with /i)
6. Use escaped backslashes in JSON: \\\\b not \\b

🧪 SELF-VALIDATION (BEFORE OUTPUT)

Before finalizing, internally verify:
✅ Every requested item is present
✅ Language looks like real user queries
✅ No mass deletion occurred
✅ Total count matches or exceeds requested count
✅ Patterns are not templated or repetitive

If a conflict exists: KEEP BOTH. Do not remove. Do not consolidate.`;

// ============================================================================
// KEYWORD PROMPT BUILDER
// ============================================================================

export function buildKeywordsPrompt(job) {
  const { language, target, count, description, intent, layer, depthRange, depth, family } = job;
  const langName = LANG_NAMES[language];

  const depthInfo = depthRange
    ? `Depth Range: D${depthRange[0]}-D${depthRange[1]} (${DEPTH_SCALE[`D${depthRange[0]}`]?.name || 'Basic'} to ${DEPTH_SCALE[`D${depthRange[1]}`]?.name || 'Expert'})`
    : depth ? `Depth: D${depth} (${DEPTH_SCALE[`D${depth}`]?.name || 'Standard'})` : '';

  const familyInfo = family ? `Action Family: ${family}` : '';

  return `Generate exactly ${count} unique keywords/phrases for:

INTENT: ${intent}
LAYER: ${layer}
TARGET: ${target}
LANGUAGE: ${langName}
${depthInfo}
${familyInfo}

DESCRIPTION: ${description}

KEYWORD REQUIREMENTS (NON-NEGOTIABLE):
1. Generate EXACTLY ${count} keywords - no more, no less
2. Single words or short phrases (1-5 words max)
3. Natural user language - what real humans actually type
4. Include common typos, slang, abbreviations where natural
5. NO duplicates within this batch
6. Mix of formal and casual register
7. Include synonyms, alternate spellings, regional variants
8. For PT: use Brazilian Portuguese phrasing (not European)
9. For ES: use Latin American Spanish phrasing
10. Consider the depth level - higher depth = more sophisticated/analytical keywords
11. Include ambiguous phrasings that real users would type
12. Include broken/incomplete phrasings

PHRASING DIVERSITY REQUIRED:
- Direct phrasings (explicit requests)
- Indirect phrasings (implied intent)
- Colloquial phrasings (informal)
- Professional phrasings (formal)
- Abbreviated phrasings (shortcuts)
- Partial phrasings (incomplete)

OUTPUT SCHEMA (STRICT JSON):
{
  "jobId": "${job.jobId}",
  "language": "${language}",
  "intent": "${intent}",
  "layer": "${layer}",
  "target": "${target}",
  "items": [
    {
      "id": "${target}_KW_${language}_000001",
      "keyword": "example keyword phrase",
      "variants": ["variant1", "variant2"],
      "register": "formal|informal|technical|colloquial",
      "notes": "usage context"
    }
  ],
  "counts": { "items": ${count}, "dropped": 0 }
}

Return ONLY the JSON object, nothing else. Generate ALL ${count} items.`;
}

// ============================================================================
// PATTERN PROMPT BUILDER
// ============================================================================

export function buildPatternsPrompt(job) {
  const { language, target, count, description, intent, layer, depthRange, depth, family } = job;
  const langName = LANG_NAMES[language];

  const depthInfo = depthRange
    ? `Depth Range: D${depthRange[0]}-D${depthRange[1]} (${DEPTH_SCALE[`D${depthRange[0]}`]?.name || 'Basic'} to ${DEPTH_SCALE[`D${depthRange[1]}`]?.name || 'Expert'})`
    : depth ? `Depth: D${depth} (${DEPTH_SCALE[`D${depth}`]?.name || 'Standard'})` : '';

  const familyInfo = family ? `Action Family: ${family}` : '';

  return `Generate exactly ${count} regex patterns for:

INTENT: ${intent}
LAYER: ${layer}
TARGET: ${target}
LANGUAGE: ${langName}
${depthInfo}
${familyInfo}

DESCRIPTION: ${description}

PATTERN REQUIREMENTS (NON-NEGOTIABLE):
1. Generate EXACTLY ${count} patterns - no more, no less
2. Valid JavaScript regex strings (no surrounding /.../)
3. Use \\\\b for word boundaries
4. Use (?:...) for non-capturing groups
5. Use ^ anchor at start when matching query beginnings
6. NO nested .* inside groups (avoid catastrophic backtracking)
7. NO inline flags
8. Keep patterns specific enough to avoid overmatching
9. Keep patterns general enough to catch natural language variation
10. Include negativeTests: 2-4 queries that SHOULD NOT match
11. Consider depth level - higher depth = more analytical/complex patterns

PATTERN DIVERSITY REQUIRED:
- Question patterns (what, where, how, why)
- Command patterns (find, show, extract, get)
- Declarative patterns (I want, I need, looking for)
- Contextual patterns (in this document, from the contract)
- Ambiguous patterns (it says, that thing)

REGEX SAFETY:
- Escape special characters properly
- Use \\\\s+ for whitespace (not just space)
- Use \\\\w+ for word characters
- Avoid greedy .* - prefer non-greedy .*? or specific patterns

OUTPUT SCHEMA (STRICT JSON):
{
  "jobId": "${job.jobId}",
  "language": "${language}",
  "intent": "${intent}",
  "layer": "${layer}",
  "target": "${target}",
  "items": [
    {
      "id": "${target}_PAT_${language}_000001",
      "pattern": "^(?:example)\\\\s+pattern\\\\b",
      "description": "what this pattern matches",
      "negativeTests": ["should not match 1", "should not match 2"],
      "precision": "high|medium"
    }
  ],
  "counts": { "items": ${count}, "dropped": 0 }
}

Return ONLY the JSON object, nothing else. Generate ALL ${count} items.`;
}

// ============================================================================
// UNIFIED PROMPT DISPATCHER
// ============================================================================

export function buildPrompt(job) {
  const { artifactType } = job;

  if (artifactType === 'keywords' || artifactType.includes('keywords')) {
    return buildKeywordsPrompt(job);
  } else if (artifactType === 'patterns' || artifactType.includes('patterns')) {
    return buildPatternsPrompt(job);
  }

  // Fallback for unknown types
  return buildKeywordsPrompt(job);
}

// ============================================================================
// LANGUAGE-SPECIFIC GUIDANCE
// ============================================================================

export const LANGUAGE_GUIDANCE = {
  en: `
English Generation Guidelines:
- Use American English spellings primarily
- Include British English variants where common
- Include common internet/chat abbreviations (u, ur, pls, etc.)
- Include voice-to-text style phrasings
- Mix formal business language with casual queries
`,
  pt: `
Brazilian Portuguese Generation Guidelines:
- Use Brazilian Portuguese (not European)
- Include common BR abbreviations (vc, td, pq, etc.)
- Include regional expressions where appropriate
- Use "você" forms, not "tu" forms
- Include mix of formal and informal registers
- Common typos in Portuguese (acentos missing, etc.)
`,
  es: `
Latin American Spanish Generation Guidelines:
- Use Latin American Spanish (not Castilian)
- Include common LATAM abbreviations
- Use "ustedes" forms, not "vosotros"
- Include regional variations (Mexican, Argentine, etc.)
- Mix formal and informal registers
- Include common accent omissions in typing
`
};
