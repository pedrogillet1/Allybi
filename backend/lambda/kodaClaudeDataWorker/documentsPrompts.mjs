/**
 * Documents Generator Prompts - Full Production Spec
 * Master prompts for Lambda workers
 * Strict JSON output, collision avoidance, precision tiers
 */

import {
  SUB_INTENTS,
  FACETS,
  DEPTH_LEVELS,
  DEPTH_DESCRIPTIONS,
  OUTPUT_TEMPLATES,
  POLICIES
} from './documentsSchema.mjs';

const LANG_NAMES = {
  en: 'English',
  pt: 'Portuguese (Brazilian)',
  es: 'Spanish (Latin American)'
};

// System message for all calls
export const SYSTEM_PROMPT = `You are a dataset generator for Koda, a document-first RAG assistant.
You must output STRICT JSON only. No markdown, no commentary, no trailing text.

HARD CONSTRAINTS:
1. No overlap: each pattern must have a single best target label
2. Precision tiers: P0 = extremely high precision (conflictScore <= 0.25), P1 = high/medium precision (conflictScore <= 0.45)
3. Natural language only - humans actually type these
4. All outputs must be valid JSON parseable by standard JSON parsers
5. Every pattern must include: language, regex string, tier, negativeTests (3-6), conflictScore
6. Every keyword must include: language, normalized form, variants, collisionList if overlaps
7. Patterns must be safe: use \\b for word boundaries, (?:...) for non-capturing groups, ^ anchors when appropriate
8. No nested .* inside groups (avoid catastrophic backtracking)
9. No inline regex flags (we compile with /i)
10. Use escaped backslashes in JSON: \\\\b not \\b`;

/**
 * Build pattern generation prompt (P0 or P1)
 */
export function buildPatternsPrompt({ language, target, tier, count, part, description, artifactType }) {
  const langName = LANG_NAMES[language];
  const isFacet = artifactType.includes('facets');
  const targetType = isFacet ? 'facet' : 'sub-intent';

  const tierDesc = tier === 'P0'
    ? 'EXTREMELY HIGH PRECISION patterns (anchor + boundaries + clear verbs). Must not collide with other targets. conflictScore must be <= 0.25'
    : 'HIGH/MEDIUM PRECISION patterns (still safe but broader). conflictScore must be <= 0.45';

  const examples = getPatternExamples(target, tier, language);

  return `Generate exactly ${count} ${tier} regex patterns for ${targetType}: ${target}

TASK:
- Language: ${langName}
- Target: ${target}
- Tier: ${tier} (${tierDesc})
- Part: ${part} (generate unique patterns not in other parts)
- Count required: EXACTLY ${count}

DESCRIPTION: ${description}

PATTERN REQUIREMENTS:
1. Valid JavaScript regex strings (no surrounding /.../)
2. Use \\\\b for word boundaries
3. Use (?:...) for non-capturing groups
4. Use ^ anchor at start when matching query beginnings
5. NO nested .* inside groups
6. NO inline flags
7. Keep patterns specific - avoid overmatching
8. Include negativeTests: 3-6 queries that SHOULD NOT match
9. Include conflictsWith: array of other targets this might match
10. Include conflictScore: 0.0-1.0 (P0 <= 0.25, P1 <= 0.45)

${examples}

OUTPUT SCHEMA:
{
  "jobId": "${artifactType}.${language}.${target}.${tier}.part${String(part).padStart(2, '0')}",
  "language": "${language}",
  "artifactType": "${artifactType}",
  "target": "${target}",
  "tier": "${tier}",
  "items": [
    {
      "id": "${target}_${tier}_${language}_000001",
      "pattern": "^(?:show|list)\\\\s+(?:me\\\\s+)?(?:all\\\\s+)?documents",
      "tier": "${tier}",
      "negativeTests": ["summarize my contract", "hi", "how do I upload"],
      "conflictsWith": ["OTHER_TARGET"],
      "conflictScore": 0.15
    }
  ],
  "counts": { "items": ${count}, "dropped": 0 },
  "hash": "sha256-placeholder"
}

Return ONLY the JSON object, nothing else.`;
}

/**
 * Build keyword generation prompt
 */
export function buildKeywordsPrompt({ language, target, count, part, description, artifactType }) {
  const langName = LANG_NAMES[language];
  const isFacet = artifactType.includes('facets');
  const targetType = isFacet ? 'facet' : 'sub-intent';

  const examples = getKeywordExamples(target, language);

  return `Generate exactly ${count} unique keywords/phrases for ${targetType}: ${target}

TASK:
- Language: ${langName}
- Target: ${target}
- Part: ${part} (generate unique keywords not in other parts)
- Count required: EXACTLY ${count}

DESCRIPTION: ${description}

KEYWORD REQUIREMENTS:
1. Single words or short phrases (1-4 words max)
2. Natural user language - what real humans type
3. Include common typos, slang, abbreviations where natural
4. NO duplicates
5. Mix of formal and casual register
6. Include variants (synonyms, alternate spellings)
7. Include collisionList if keyword overlaps other targets
8. For PT: include Brazilian Portuguese phrasing
9. For ES: include Latin American Spanish phrasing

${examples}

OUTPUT SCHEMA:
{
  "jobId": "${artifactType}.${language}.${target}.part${String(part).padStart(2, '0')}",
  "language": "${language}",
  "artifactType": "${artifactType}",
  "target": "${target}",
  "items": [
    {
      "id": "${target}_KW_${language}_000001",
      "keyword": "extract",
      "variants": ["pull out", "get me", "retrieve"],
      "notes": "Often paired with fields like date, amount, names",
      "conflictsWith": ["OTHER_TARGET"],
      "collisionRisk": "low"
    }
  ],
  "counts": { "items": ${count}, "dropped": 0 },
  "hash": "sha256-placeholder"
}

Return ONLY the JSON object, nothing else.`;
}

/**
 * Build depth examples prompt
 */
export function buildDepthExamplesPrompt({ language, target, depth, count, part, description, depthDescription }) {
  const langName = LANG_NAMES[language];

  return `Generate exactly ${count} example user queries for sub-intent ${target} at depth level ${depth}

TASK:
- Language: ${langName}
- Sub-intent: ${target}
- Depth: ${depth} - ${depthDescription}
- Part: ${part}
- Count required: EXACTLY ${count}

DESCRIPTION: ${description}

DEPTH LEVEL REQUIREMENTS:
- D0 = Micro request (one fact / one short answer) - very simple, 3-8 words
- D1 = Simple request (few bullets) - straightforward, 5-12 words
- D2 = Medium (light structure, short sections) - moderate complexity, 8-18 words
- D3 = Complex (multi-step, multi-doc, needs strategy) - detailed, 15-30 words
- D4 = Expert (audit-grade, strict validation, multiple constraints) - professional, 20-40 words

EXAMPLE REQUIREMENTS:
1. Natural conversational language
2. Realistic document-related queries
3. Match the complexity level of ${depth}
4. Include variety: questions, commands, statements
5. For PT/ES: use natural phrasing for that language

OUTPUT SCHEMA:
{
  "jobId": "documents_depth_examples.${language}.${target}.${depth}.part${String(part).padStart(2, '0')}",
  "language": "${language}",
  "artifactType": "documents_depth_examples",
  "target": "${target}",
  "depth": "${depth}",
  "items": [
    {
      "id": "${target}_${depth}_${language}_000001",
      "query": "What is the total amount in the invoice?",
      "depth": "${depth}",
      "complexity": "micro"
    }
  ],
  "counts": { "items": ${count}, "dropped": 0 },
  "hash": "sha256-placeholder"
}

Return ONLY the JSON object, nothing else.`;
}

/**
 * Build output templates prompt
 */
export function buildOutputTemplatesPrompt({ templates }) {
  return `Generate output template definitions for Koda's response formatting.

TASK: Generate ${templates.length} output templates with definitions in all 3 languages (en, pt, es)

TEMPLATES TO GENERATE:
${templates.map((t, i) => `${i + 1}. ${t}`).join('\n')}

TEMPLATE REQUIREMENTS:
Each template must include:
- id: template ID
- name: { en, pt, es } - localized names
- rules: { maxParagraphs, maxBullets, maxSentenceWords, allowedMarkdown, docLinkBehavior, showMoreMarker }
- example: { en, pt, es } - example output in each language

OUTPUT SCHEMA:
{
  "jobId": "documents_output_templates.ALL_LANGUAGES",
  "artifactType": "documents_output_templates",
  "templates": [
    {
      "id": "O_ONE_LINER",
      "name": { "en": "One liner", "pt": "Uma linha", "es": "Una linea" },
      "rules": {
        "maxParagraphs": 1,
        "maxBullets": 0,
        "maxSentenceWords": 30,
        "allowedMarkdown": false,
        "docLinkBehavior": "none",
        "showMoreMarker": null
      },
      "example": {
        "en": "The contract expires on December 31, 2024.",
        "pt": "O contrato expira em 31 de dezembro de 2024.",
        "es": "El contrato vence el 31 de diciembre de 2024."
      }
    }
  ],
  "counts": { "items": ${templates.length} }
}

Return ONLY the JSON object, nothing else.`;
}

/**
 * Build policies prompt
 */
export function buildPoliciesPrompt({ policies }) {
  return `Generate policy definitions for Koda's document answer behavior.

TASK: Generate ${policies.length} policy definitions with rules and explanations in all 3 languages

POLICIES TO GENERATE:
${policies.map((p, i) => `${i + 1}. ${p}`).join('\n')}

POLICY REQUIREMENTS:
Each policy must include:
- id: policy ID
- when: { subIntents: [], facetsAny: [] } - trigger conditions
- rules: { mustCite, noHallucination, maxVerbosity, ifMissingEvidence }
- explanations: { en, pt, es } - localized explanation text

OUTPUT SCHEMA:
{
  "jobId": "documents_policies.ALL_LANGUAGES",
  "artifactType": "documents_policies",
  "policies": [
    {
      "id": "P_DOC_FACTUAL_STRICT",
      "when": {
        "subIntents": ["D1_ASK", "D6_EXTRACT", "D10_CALC"],
        "facetsAny": ["F_DOC_REFERENCE", "F_NUMERIC_HEAVY"]
      },
      "rules": {
        "mustCite": true,
        "noHallucination": true,
        "maxVerbosity": "medium",
        "ifMissingEvidence": "useFallback:NO_EVIDENCE",
        "allowedTransformations": ["summarize"],
        "forbiddenTransformations": ["invent", "extrapolate"]
      },
      "explanations": {
        "en": "Answer only using the user's documents. If not present, say you can't find it.",
        "pt": "Responda apenas usando os documentos do usuario. Se nao encontrar, diga que nao foi possivel localizar.",
        "es": "Responde solo usando los documentos del usuario. Si no esta presente, di que no puedes encontrarlo."
      }
    }
  ],
  "counts": { "items": ${policies.length} }
}

Return ONLY the JSON object, nothing else.`;
}

/**
 * Get pattern examples for anchoring generation quality
 */
function getPatternExamples(target, tier, language) {
  const examples = {
    // All 16 Sub-intents
    D1_ASK: {
      P0: [
        '^(?:what|where|who|when|which)\\\\b.*\\\\b(?:document|file|contract|report)\\\\b',
        '^(?:tell me|explain)\\\\b.*\\\\b(?:about|regarding)\\\\b.*\\\\b(?:doc|file)\\\\b'
      ],
      P1: [
        '\\\\b(?:according to|based on|from)\\\\b.*\\\\b(?:document|file)\\\\b',
        '\\\\b(?:does it say|does the doc mention)\\\\b'
      ]
    },
    D2_FIND: {
      P0: [
        '^(?:find|locate|show me|where is)\\\\b.*\\\\b(?:file|document|pdf)\\\\b',
        '^(?:open|pull up|bring up)\\\\b.*\\\\b(?:the|my|that)\\\\b.*\\\\b(?:doc|file)\\\\b'
      ],
      P1: [
        '\\\\b(?:looking for|searching for|need to find)\\\\b.*\\\\b(?:document|file)\\\\b'
      ]
    },
    D3_LIST: {
      P0: [
        '^(?:list|show|display)\\\\b.*\\\\b(?:all|my|the)\\\\b.*\\\\b(?:documents|files)\\\\b',
        '^(?:how many|count)\\\\b.*\\\\b(?:documents|files|pdfs)\\\\b'
      ],
      P1: [
        '\\\\b(?:what documents|which files)\\\\b.*\\\\b(?:do I have|are there)\\\\b'
      ]
    },
    D4_SUMMARIZE: {
      P0: [
        '^(?:summarize|summary of|tl;dr|tldr)\\\\b.*\\\\b(?:document|file|contract)\\\\b',
        '^(?:give me|provide)\\\\b.*\\\\b(?:summary|overview|key points)\\\\b'
      ],
      P1: [
        '\\\\b(?:main points|key takeaways|executive summary)\\\\b'
      ]
    },
    D5_COMPARE: {
      P0: [
        '^(?:compare|contrast|difference between)\\\\b.*\\\\b(?:document|file|version)\\\\b',
        '^(?:what is different|what changed)\\\\b.*\\\\b(?:between|in)\\\\b'
      ],
      P1: [
        '\\\\b(?:vs|versus|compared to)\\\\b.*\\\\b(?:document|file)\\\\b',
        '\\\\b(?:side by side|which is better)\\\\b'
      ]
    },
    D6_EXTRACT: {
      P0: [
        '^(?:extract|pull|get)\\\\b.*\\\\b(?:from|out of)\\\\b.*\\\\b(?:document|file)\\\\b',
        '^(?:list|show me)\\\\b.*\\\\b(?:all|the)\\\\b.*\\\\b(?:dates|amounts|names|fields)\\\\b'
      ],
      P1: [
        '\\\\b(?:what are the|give me the)\\\\b.*\\\\b(?:values|numbers|entities)\\\\b'
      ]
    },
    D7_ANALYZE: {
      P0: [
        '^(?:analyze|analyse|assess|evaluate)\\\\b.*\\\\b(?:document|file|contract)\\\\b',
        '^(?:what is the risk|identify risks)\\\\b.*\\\\b(?:in|from)\\\\b'
      ],
      P1: [
        '\\\\b(?:interpretation|analysis of|assessment)\\\\b.*\\\\b(?:document|file)\\\\b',
        '\\\\b(?:implications|meaning of)\\\\b'
      ]
    },
    D8_ORGANIZE: {
      P0: [
        '^(?:organize|sort|categorize|tag)\\\\b.*\\\\b(?:documents|files|my)\\\\b',
        '^(?:create folder|move to folder|rename)\\\\b.*\\\\b(?:document|file)\\\\b'
      ],
      P1: [
        '\\\\b(?:suggest folders|recommend tags|group by)\\\\b',
        '\\\\b(?:detect duplicates|find duplicates)\\\\b'
      ]
    },
    D9_TIMELINE: {
      P0: [
        '^(?:timeline|chronology|sequence of events)\\\\b.*\\\\b(?:in|from)\\\\b.*\\\\b(?:document|file)\\\\b',
        '^(?:when did|what dates|list dates)\\\\b.*\\\\b(?:in|from)\\\\b'
      ],
      P1: [
        '\\\\b(?:chronological order|date order|history of)\\\\b',
        '\\\\b(?:events in|milestones)\\\\b.*\\\\b(?:document|file)\\\\b'
      ]
    },
    D10_CALC: {
      P0: [
        '^(?:calculate|compute|sum|total|add up)\\\\b.*\\\\b(?:from|in)\\\\b.*\\\\b(?:document|file)\\\\b',
        '^(?:what is the total|how much is)\\\\b.*\\\\b(?:in|from)\\\\b'
      ],
      P1: [
        '\\\\b(?:average|percentage|multiply|divide)\\\\b.*\\\\b(?:document|values)\\\\b',
        '\\\\b(?:math|calculation|formula)\\\\b.*\\\\b(?:based on|from)\\\\b'
      ]
    },
    D11_TABLES: {
      P0: [
        '^(?:create table|make table|convert to table)\\\\b.*\\\\b(?:from|using)\\\\b',
        '^(?:show|display|export)\\\\b.*\\\\b(?:as table|as csv|as spreadsheet)\\\\b'
      ],
      P1: [
        '\\\\b(?:tabular format|rows and columns|grid view)\\\\b',
        '\\\\b(?:spreadsheet|csv|xlsx)\\\\b.*\\\\b(?:format|output)\\\\b'
      ]
    },
    D12_CITATIONS: {
      P0: [
        '^(?:cite|citation|source|reference)\\\\b.*\\\\b(?:for|of)\\\\b',
        '^(?:where did you get|what is the source)\\\\b'
      ],
      P1: [
        '\\\\b(?:bibliography|references|sources)\\\\b',
        '\\\\b(?:which document|which file)\\\\b.*\\\\b(?:says|mentions)\\\\b'
      ]
    },
    D13_TRANSLATE: {
      P0: [
        '^(?:translate|translation)\\\\b.*\\\\b(?:to|into)\\\\b.*\\\\b(?:english|portuguese|spanish)\\\\b',
        '^(?:convert|change)\\\\b.*\\\\b(?:language|to english|to portuguese)\\\\b'
      ],
      P1: [
        '\\\\b(?:in english|em portugues|en espanol)\\\\b.*\\\\b(?:version|please)\\\\b',
        '\\\\b(?:multilingual|other language)\\\\b'
      ]
    },
    D14_REDACT: {
      P0: [
        '^(?:redact|mask|hide|remove)\\\\b.*\\\\b(?:sensitive|personal|private)\\\\b',
        '^(?:anonymize|censor|blur)\\\\b.*\\\\b(?:information|data|names)\\\\b'
      ],
      P1: [
        '\\\\b(?:pii|ssn|credit card)\\\\b.*\\\\b(?:remove|hide|mask)\\\\b',
        '\\\\b(?:confidential|sensitive)\\\\b.*\\\\b(?:data|info)\\\\b'
      ]
    },
    D15_VALIDATE: {
      P0: [
        '^(?:validate|verify|check)\\\\b.*\\\\b(?:consistency|accuracy|correctness)\\\\b',
        '^(?:find|identify)\\\\b.*\\\\b(?:contradictions|inconsistencies|errors)\\\\b'
      ],
      P1: [
        '\\\\b(?:missing info|gaps|incomplete)\\\\b.*\\\\b(?:document|file)\\\\b',
        '\\\\b(?:does it match|is it consistent)\\\\b'
      ]
    },
    D16_WORKFLOW: {
      P0: [
        '^(?:first|step 1)\\\\b.*\\\\b(?:then|after that|next)\\\\b',
        '^(?:summarize|extract|compare)\\\\b.*\\\\b(?:then|and then|after)\\\\b'
      ],
      P1: [
        '\\\\b(?:workflow|multi-step|process)\\\\b.*\\\\b(?:document|documents)\\\\b',
        '\\\\b(?:step by step|in sequence|one by one)\\\\b'
      ]
    },
    // 14 Facets
    F_DOC_REFERENCE: {
      P0: [
        '\\\\b(?:this|that|the)\\\\s+(?:document|file|pdf|contract)\\\\b',
        '\\\\b(?:my|attached|uploaded)\\\\s+(?:document|file)\\\\b'
      ],
      P1: [
        '\\\\b(?:it|the doc|the file)\\\\b'
      ]
    },
    F_FOLDER_PATH: {
      P0: [
        '\\\\b(?:in folder|in directory|under)\\\\s+[\\\\w/]+\\\\b',
        '\\\\b(?:subfolder|subdirectory|path)\\\\b'
      ],
      P1: [
        '\\\\b(?:folder|directory|location)\\\\b'
      ]
    },
    F_FILETYPE: {
      P0: [
        '\\\\b(?:pdf|docx?|xlsx?|pptx?|csv)\\\\b',
        '\\\\b(?:word doc|spreadsheet|powerpoint|image)\\\\b'
      ],
      P1: [
        '\\\\b(?:file type|format)\\\\b'
      ]
    },
    F_TIME: {
      P0: [
        '\\\\b(?:last|past|this)\\\\s+(?:week|month|year)\\\\b',
        '\\\\b(?:in|from|since)\\\\s+(?:2020|2021|2022|2023|2024|2025)\\\\b'
      ],
      P1: [
        '\\\\b(?:recent|latest|yesterday|today)\\\\b'
      ]
    },
    F_LANGUAGE_MENTION: {
      P0: [
        '\\\\b(?:in english|em portugues|en espanol)\\\\b',
        '\\\\b(?:portuguese|spanish|english)\\\\s+(?:version|document)\\\\b'
      ],
      P1: [
        '\\\\b(?:translate|language)\\\\b'
      ]
    },
    F_OUTPUT_STYLE: {
      P0: [
        '\\\\b(?:bullet points|as bullets|bulleted)\\\\b',
        '\\\\b(?:as table|table format|in a table)\\\\b'
      ],
      P1: [
        '\\\\b(?:short|brief|detailed|step by step)\\\\b'
      ]
    },
    F_SCOPE_LIMIT: {
      P0: [
        '\\\\b(?:only this|just this|only the)\\\\s+(?:document|file)\\\\b',
        '\\\\b(?:only|just)\\\\s+(?:invoices|contracts|last \\\\d+)\\\\b'
      ],
      P1: [
        '\\\\b(?:limit to|exclude|filter)\\\\b'
      ]
    },
    F_ENTITY_FOCUS: {
      P0: [
        '\\\\b(?:about|regarding|for)\\\\s+(?:company|vendor|client|customer)\\\\b',
        '\\\\b(?:company|vendor|client)\\\\s+(?:name|info|details)\\\\b'
      ],
      P1: [
        '\\\\b(?:person|entity|organization)\\\\b'
      ]
    },
    F_NUMERIC_HEAVY: {
      P0: [
        '\\\\b(?:numbers|amounts|figures|totals)\\\\b',
        '\\\\b(?:financial|monetary|numeric)\\\\b'
      ],
      P1: [
        '\\\\b(?:statistics|percentages|values)\\\\b'
      ]
    },
    F_LEGAL_TONE: {
      P0: [
        '\\\\b(?:clause|section|article|provision)\\\\b',
        '\\\\b(?:liability|indemnity|warranty|compliance)\\\\b'
      ],
      P1: [
        '\\\\b(?:legal|contract terms|agreement)\\\\b'
      ]
    },
    F_MEDICAL_TONE: {
      P0: [
        '\\\\b(?:diagnosis|symptoms|treatment|medication)\\\\b',
        '\\\\b(?:lab results|patient|prescription)\\\\b'
      ],
      P1: [
        '\\\\b(?:medical|health|clinical)\\\\b'
      ]
    },
    F_ACCOUNTING_TONE: {
      P0: [
        '\\\\b(?:ledger|journal|balance sheet|income statement)\\\\b',
        '\\\\b(?:debit|credit|reconciliation|tax)\\\\b'
      ],
      P1: [
        '\\\\b(?:accounting|financial|invoice)\\\\b'
      ]
    },
    F_PRIVACY_RISK: {
      P0: [
        '\\\\b(?:ssn|social security|credit card|passport)\\\\b',
        '\\\\b(?:pii|personal data|sensitive info)\\\\b'
      ],
      P1: [
        '\\\\b(?:private|confidential|personal)\\\\b'
      ]
    },
    F_AMBIGUITY_SIGNAL: {
      P0: [
        '^(?:it|that|this)\\\\s+(?:says|mentions|shows)\\\\b',
        '\\\\b(?:the document|that file)\\\\b(?!\\\\s+(?:named|called))'
      ],
      P1: [
        '\\\\b(?:something|somewhere|not sure)\\\\b'
      ]
    }
  };

  const targetExamples = examples[target] || examples.D1_ASK;
  const tierExamples = targetExamples[tier] || targetExamples.P0 || [];

  return `EXAMPLE ${tier} PATTERNS FOR ${target}:
${tierExamples.map(p => `- "${p}"`).join('\n')}`;
}

/**
 * Get keyword examples for anchoring generation quality
 */
function getKeywordExamples(target, language) {
  const examples = {
    // 16 Sub-intents
    D1_ASK: ['what does it say', 'according to', 'based on the document', 'where does it mention'],
    D2_FIND: ['find', 'locate', 'where is', 'which file', 'show me the document', 'open', 'pull up'],
    D3_LIST: ['list', 'show all', 'how many', 'count', 'documents I have', 'my files'],
    D4_SUMMARIZE: ['summarize', 'summary', 'tl;dr', 'key points', 'overview', 'main ideas'],
    D5_COMPARE: ['compare', 'difference', 'vs', 'which is higher', 'side-by-side', 'contrast'],
    D6_EXTRACT: ['extract', 'pull', 'get me', 'list fields', 'capture', 'parse', 'take out'],
    D7_ANALYZE: ['analyze', 'analysis', 'assess', 'evaluate', 'risk', 'interpret'],
    D8_ORGANIZE: ['organize', 'folder', 'tag', 'categorize', 'rename', 'sort'],
    D9_TIMELINE: ['timeline', 'chronological', 'sequence of events', 'dates', 'when did', 'history of'],
    D10_CALC: ['calculate', 'sum', 'total', 'add up', 'compute', 'how much', 'what is the total'],
    D11_TABLES: ['table', 'spreadsheet', 'csv', 'rows and columns', 'make a table', 'tabular', 'grid'],
    D12_CITATIONS: ['citation', 'source', 'reference', 'where did you get', 'cite', 'bibliography'],
    D13_TRANSLATE: ['translate', 'translation', 'in english', 'em portugues', 'en espanol', 'convert language'],
    D14_REDACT: ['redact', 'mask', 'hide', 'remove sensitive', 'blur out', 'censor', 'anonymize'],
    D15_VALIDATE: ['validate', 'check', 'verify', 'contradictions', 'inconsistent', 'missing info', 'gaps'],
    D16_WORKFLOW: ['first summarize then', 'step by step', 'workflow', 'process', 'then extract', 'multi-step'],
    // 14 Facets
    F_DOC_REFERENCE: ['this document', 'that file', 'the contract', 'my pdf', 'the spreadsheet', 'attached'],
    F_FOLDER_PATH: ['in folder', 'subfolder', 'directory', 'path', 'under clients', 'in projects'],
    F_FILETYPE: ['pdf', 'docx', 'xlsx', 'spreadsheet', 'word doc', 'powerpoint', 'pptx'],
    F_TIME: ['last week', 'yesterday', 'in 2023', 'recent', 'latest', 'this month', 'last year'],
    F_LANGUAGE_MENTION: ['in english', 'em portugues', 'en espanol', 'portuguese version', 'spanish doc'],
    F_OUTPUT_STYLE: ['bullet points', 'table format', 'short answer', 'detailed', 'step by step', 'brief'],
    F_SCOPE_LIMIT: ['only this doc', 'just the invoice', 'only last 3', 'exclude', 'limit to'],
    F_ENTITY_FOCUS: ['company', 'vendor', 'client', 'person', 'supplier', 'customer'],
    F_NUMERIC_HEAVY: ['numbers', 'amounts', 'figures', 'financial', 'statistics', 'percentages'],
    F_LEGAL_TONE: ['clause', 'terms', 'liability', 'compliance', 'legal', 'contract terms'],
    F_MEDICAL_TONE: ['diagnosis', 'symptoms', 'medication', 'lab results', 'patient', 'treatment'],
    F_ACCOUNTING_TONE: ['ledger', 'tax', 'invoice', 'reconciliation', 'debit', 'credit', 'balance'],
    F_PRIVACY_RISK: ['personal info', 'ssn', 'credit card', 'private', 'confidential', 'pii'],
    F_AMBIGUITY_SIGNAL: ['it', 'that thing', 'the document', 'something', 'unclear', 'not sure which']
  };

  const targetExamples = examples[target] || examples.D1_ASK;
  return `EXAMPLE KEYWORDS FOR ${target}:
${targetExamples.map(k => `- "${k}"`).join('\n')}`;
}

/**
 * Get the appropriate prompt builder for artifact type
 */
export function getPromptBuilder(artifactType) {
  const builders = {
    documents_patterns: buildPatternsPrompt,
    documents_keywords: buildKeywordsPrompt,
    documents_facets_patterns: buildPatternsPrompt,
    documents_facets_keywords: buildKeywordsPrompt,
    documents_depth_examples: buildDepthExamplesPrompt,
    documents_output_templates: buildOutputTemplatesPrompt,
    documents_policies: buildPoliciesPrompt
  };
  return builders[artifactType];
}
