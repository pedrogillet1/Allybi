/**
 * Koda Cognitive Intelligence Prompts v4.0
 * ChatGPT-grade document-first intelligence
 * 50,232 total items across 3 languages
 */

import { DEPTH_SCALE, DOCUMENTS, HELP, CONVERSATION } from './documentsSchema.mjs';

const LANG_NAMES = {
  en: 'English',
  pt: 'Portuguese (Brazilian)',
  es: 'Spanish (Latin American)'
};

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const SYSTEM_PROMPT = `You are a dataset generator for Koda, a ChatGPT-grade document-first AI assistant.
You must output STRICT JSON only. No markdown, no commentary, no trailing text.

HARD CONSTRAINTS:
1. No overlap: each pattern/keyword must have a single best target label
2. Natural language only - humans actually type these
3. All outputs must be valid JSON parseable by standard JSON parsers
4. Patterns must be safe: use \\\\b for word boundaries, (?:...) for non-capturing groups
5. No nested .* inside groups (avoid catastrophic backtracking)
6. No inline regex flags (we compile with /i)
7. Use escaped backslashes in JSON: \\\\b not \\b
8. Keywords should include common typos, slang, abbreviations where natural
9. Consider depth levels when generating - higher depth = more analytical/complex patterns
10. For multilingual: use natural phrasing for each language, not translations`;

// ============================================================================
// KEYWORD PROMPT BUILDER
// ============================================================================

export function buildKeywordsPrompt(job) {
  const { language, target, count, part, description, intent, layer, depthRange, depth, family } = job;
  const langName = LANG_NAMES[language];

  const depthInfo = depthRange
    ? `Depth Range: D${depthRange[0]}-D${depthRange[1]} (${DEPTH_SCALE[`D${depthRange[0]}`]?.name} to ${DEPTH_SCALE[`D${depthRange[1]}`]?.name})`
    : depth ? `Depth: D${depth} (${DEPTH_SCALE[`D${depth}`]?.name})` : '';

  const familyInfo = family ? `Action Family: ${family}` : '';

  return `Generate exactly ${count} unique keywords/phrases for:

INTENT: ${intent}
LAYER: ${layer}
TARGET: ${target}
LANGUAGE: ${langName}
PART: ${part} (generate unique keywords not in other parts)
${depthInfo}
${familyInfo}

DESCRIPTION: ${description}

KEYWORD REQUIREMENTS:
1. Single words or short phrases (1-4 words max)
2. Natural user language - what real humans type
3. Include common typos, slang, abbreviations where natural
4. NO duplicates
5. Mix of formal and casual register
6. Include variants (synonyms, alternate spellings)
7. For PT: use Brazilian Portuguese phrasing
8. For ES: use Latin American Spanish phrasing
9. Consider the depth level - higher depth = more sophisticated/analytical keywords

OUTPUT SCHEMA:
{
  "jobId": "${job.jobId}",
  "language": "${language}",
  "intent": "${intent}",
  "layer": "${layer}",
  "target": "${target}",
  "items": [
    {
      "id": "${target}_KW_${language}_000001",
      "keyword": "example keyword",
      "variants": ["variant1", "variant2"],
      "notes": "usage context",
      "collisionRisk": "low|medium|high"
    }
  ],
  "counts": { "items": ${count}, "dropped": 0 }
}

Return ONLY the JSON object, nothing else.`;
}

// ============================================================================
// PATTERN PROMPT BUILDER
// ============================================================================

export function buildPatternsPrompt(job) {
  const { language, target, count, part, description, intent, layer, depthRange, depth, family } = job;
  const langName = LANG_NAMES[language];

  const depthInfo = depthRange
    ? `Depth Range: D${depthRange[0]}-D${depthRange[1]} (${DEPTH_SCALE[`D${depthRange[0]}`]?.name} to ${DEPTH_SCALE[`D${depthRange[1]}`]?.name})`
    : depth ? `Depth: D${depth} (${DEPTH_SCALE[`D${depth}`]?.name})` : '';

  const familyInfo = family ? `Action Family: ${family}` : '';

  const examples = getPatternExamples(intent, layer, target, language);

  return `Generate exactly ${count} regex patterns for:

INTENT: ${intent}
LAYER: ${layer}
TARGET: ${target}
LANGUAGE: ${langName}
PART: ${part} (generate unique patterns not in other parts)
${depthInfo}
${familyInfo}

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
9. Consider depth level - higher depth = more analytical/complex patterns

${examples}

OUTPUT SCHEMA:
{
  "jobId": "${job.jobId}",
  "language": "${language}",
  "intent": "${intent}",
  "layer": "${layer}",
  "target": "${target}",
  "items": [
    {
      "id": "${target}_PAT_${language}_000001",
      "pattern": "^(?:example)\\\\s+pattern",
      "negativeTests": ["should not match 1", "should not match 2"],
      "conflictsWith": ["OTHER_TARGET"],
      "precision": "high|medium"
    }
  ],
  "counts": { "items": ${count}, "dropped": 0 }
}

Return ONLY the JSON object, nothing else.`;
}

// ============================================================================
// PATTERN EXAMPLES BY INTENT/LAYER
// ============================================================================

function getPatternExamples(intent, layer, target, language) {
  const examples = {
    DOCUMENTS: {
      states: {
        SINGLE_DOC: [
          '^(?:in|from)\\\\s+(?:this|the|that)\\\\s+(?:document|file|pdf)',
          '\\\\b(?:the|this|that)\\\\s+(?:contract|report|invoice)\\\\b'
        ],
        MULTIPLE_DOCS: [
          '^(?:across|in)\\\\s+(?:all|multiple|these|those)\\\\s+(?:documents|files)',
          '\\\\b(?:compare|between)\\\\s+(?:the|these)\\\\s+(?:documents|files)\\\\b'
        ],
        AMBIGUOUS_REF: [
          '^(?:it|that|this)\\\\s+(?:says|mentions|shows)\\\\b',
          '\\\\b(?:the document|that file)\\\\b(?!\\\\s+(?:named|called))'
        ],
        LEGAL_STYLE: [
          '\\\\b(?:clause|section|article|provision|hereby|whereas)\\\\b',
          '\\\\b(?:liability|indemnity|warranty|obligation|party)\\\\b'
        ],
        VERSIONED: [
          '\\\\b(?:version|v\\\\d|revision|rev\\\\s*\\\\d)\\\\b',
          '\\\\b(?:latest|previous|old|new)\\\\s+(?:version|draft)\\\\b'
        ],
        FINANCIAL_STYLE: [
          '\\\\b(?:revenue|expenses|profit|loss|margin|EBITDA|balance\\\\s+sheet)\\\\b',
          '\\\\b(?:Q[1-4]|FY\\\\d|fiscal|quarterly|annual)\\\\s+(?:report|results)\\\\b'
        ]
      },
      actions: {
        LOCATE_FACT: [
          '^(?:find|where|what)\\\\b.*\\\\b(?:says?|mentions?|states?)\\\\b',
          '^(?:look for|search for|find)\\\\b.*\\\\b(?:in|from)\\\\s+(?:the|this)\\\\s+doc'
        ],
        SUMMARIZE: [
          '^(?:summarize|summary|tl;?dr|tldr|overview)\\\\b',
          '^(?:give me|provide|what are)\\\\s+(?:the)?\\\\s*(?:key|main|important)\\\\s+(?:points|takeaways)'
        ],
        EXTRACT_VALUES: [
          '^(?:extract|pull|get|find|list)\\\\s+(?:all\\\\s+)?(?:the\\\\s+)?(?:values?|numbers?|figures?)\\\\b',
          '\\\\b(?:what is the|give me the)\\\\s+(?:total|amount|value|number)\\\\b'
        ],
        EXTRACT_DATES: [
          '^(?:extract|pull|get|find|list)\\\\s+(?:all\\\\s+)?(?:the\\\\s+)?dates?\\\\b',
          '\\\\b(?:when|what date|deadline|due date|expiration)\\\\b.*\\\\b(?:document|contract|file)\\\\b'
        ],
        ASSESS_RISK: [
          '^(?:assess|evaluate|analyze|identify)\\\\s+(?:the\\\\s+)?(?:risks?|exposure|liability)',
          '\\\\b(?:risk|danger|concern|issue|problem)\\\\b.*\\\\b(?:document|contract|agreement)\\\\b'
        ],
        COMPARE_DOCUMENTS: [
          '^(?:compare|contrast|diff|difference)\\\\s+(?:between\\\\s+)?(?:the|these)\\\\s+(?:documents|files|versions)',
          '\\\\b(?:vs|versus|compared to)\\\\b.*\\\\b(?:document|file|version)\\\\b'
        ],
        INTERPRET_MEANING: [
          '^(?:what does|explain|interpret|meaning of)\\\\s+(?:this|that|the)\\\\s+(?:clause|section|part)',
          '\\\\b(?:does this mean|is this saying|interpret)\\\\b'
        ],
        DETECT_INCONSISTENCIES: [
          '\\\\b(?:inconsistent|contradiction|conflict|mismatch)\\\\b.*\\\\b(?:document|contract)\\\\b',
          '\\\\b(?:does this conflict|are these consistent|check for)\\\\s+(?:conflicts?|inconsistencies?)\\\\b'
        ]
      },
      scope: {
        SINGLE_SECTION: [
          '\\\\b(?:just|only)\\\\s+(?:this|that)\\\\s+(?:section|part|paragraph|clause)\\\\b',
          '\\\\b(?:in section|section\\\\s+\\\\d)\\\\b'
        ],
        ENTIRE_DOCUMENT: [
          '\\\\b(?:entire|whole|full|complete)\\\\s+(?:document|file|contract)\\\\b',
          '\\\\b(?:throughout|across)\\\\s+(?:the\\\\s+)?(?:document|file)\\\\b'
        ],
        MULTIPLE_DOCUMENTS: [
          '\\\\b(?:all|both|these)\\\\s+(?:documents?|files?|contracts?)\\\\b',
          '\\\\b(?:across|in all|every)\\\\s+(?:document|file)\\\\b'
        ],
        NUMERIC_ONLY: [
          '\\\\b(?:just|only)\\\\s+(?:the\\\\s+)?(?:numbers?|figures?|values?|amounts?)\\\\b',
          '\\\\b(?:numeric|numerical|quantitative)\\\\s+(?:data|info|information)\\\\b'
        ]
      },
      analyticalDepth: {
        SURFACE_LOOKUP: [
          '^(?:what is|find|where is|show me)\\\\b',
          '\\\\b(?:quick|simple|basic)\\\\s+(?:answer|lookup|search)\\\\b'
        ],
        RISK_ANALYSIS: [
          '\\\\b(?:analyze|assess|evaluate)\\\\s+(?:the\\\\s+)?(?:risk|risks|exposure|liability)\\\\b',
          '\\\\b(?:risk assessment|risk analysis|due diligence)\\\\b'
        ],
        FINANCIAL_IMPACT: [
          '\\\\b(?:financial|monetary|cost)\\\\s+(?:impact|implication|consequence)\\\\b',
          '\\\\b(?:what would|how much|total cost|financial exposure)\\\\b'
        ],
        EXPERT_INTERPRETATION: [
          '\\\\b(?:expert|professional|legal|technical)\\\\s+(?:opinion|analysis|interpretation)\\\\b',
          '\\\\b(?:from a legal standpoint|professionally speaking)\\\\b'
        ]
      },
      evidenceControl: {
        DIRECT_CITATION: [
          '\\\\b(?:quote|cite|exact|verbatim|word for word)\\\\b',
          '\\\\b(?:show me exactly|direct quote|cite the)\\\\s+(?:text|passage|section)\\\\b'
        ],
        NUMERICAL_PRECISION: [
          '\\\\b(?:exact|precise|specific)\\\\s+(?:number|figure|amount|value)\\\\b',
          '\\\\b(?:to the cent|exact amount|precise figure)\\\\b'
        ],
        LEGAL_PRECISION: [
          '\\\\b(?:legally|contractually)\\\\s+(?:speaking|accurate|precise)\\\\b',
          '\\\\b(?:for legal purposes|legally binding|court-ready)\\\\b'
        ],
        LOW_CONFIDENCE_DISCLAIMER: [
          '\\\\b(?:might|may|possibly|potentially|uncertain)\\\\b.*\\\\b(?:document|info|data)\\\\b',
          '\\\\b(?:not sure|uncertain|unclear)\\\\s+(?:if|whether|about)\\\\b'
        ]
      },
      outputControl: {
        BULLET_POINTS: [
          '\\\\b(?:bullet|bullets|bulleted|bullet points|bullet list)\\\\b',
          '\\\\b(?:as bullets|in bullets|use bullets)\\\\b'
        ],
        TABLE: [
          '\\\\b(?:as a table|table format|in a table|tabular)\\\\b',
          '\\\\b(?:make a table|create a table|put in table)\\\\b'
        ],
        HIGHLIGHT_RISKS: [
          '\\\\b(?:highlight|flag|mark|show)\\\\s+(?:the\\\\s+)?(?:risks?|concerns?|issues?)\\\\b',
          '\\\\b(?:what are the risks|identify risks)\\\\b'
        ],
        EXECUTIVE_SUMMARY_FIRST: [
          '\\\\b(?:executive summary|summary first|overview first)\\\\b',
          '\\\\b(?:start with|lead with)\\\\s+(?:the\\\\s+)?(?:summary|key points)\\\\b'
        ],
        ASK_FOLLOWUP: [
          '\\\\b(?:ask me|prompt me|follow up|clarify)\\\\s+(?:if|when)\\\\b',
          '\\\\b(?:need more info|unclear|ambiguous)\\\\b.*\\\\b(?:ask|clarify)\\\\b'
        ]
      },
      domains: {
        FINANCE: [
          '\\\\b(?:financial|revenue|profit|investment|portfolio|ROI)\\\\b',
          '\\\\b(?:stock|equity|bond|fund|asset|liability)\\\\b'
        ],
        LEGAL: [
          '\\\\b(?:legal|contract|clause|liability|indemnity|warranty)\\\\b',
          '\\\\b(?:lawsuit|litigation|compliance|regulation|statute)\\\\b'
        ],
        MEDICAL: [
          '\\\\b(?:medical|health|patient|diagnosis|treatment|symptom)\\\\b',
          '\\\\b(?:clinical|prescription|dosage|side effect|contraindication)\\\\b'
        ],
        ENGINEERING: [
          '\\\\b(?:engineering|specification|tolerance|load|stress|design)\\\\b',
          '\\\\b(?:technical|schematic|blueprint|CAD|drawing)\\\\b'
        ]
      }
    },
    REASONING: {
      states: {
        DIRECT_LOGICAL: [
          '\\\\b(?:therefore|thus|hence|so)\\\\b.*\\\\b(?:must|should|will)\\\\b',
          '\\\\b(?:if|given|since|because)\\\\b.*\\\\b(?:then|therefore)\\\\b'
        ],
        HYPOTHETICAL: [
          '\\\\b(?:what if|suppose|assuming|hypothetically)\\\\b',
          "\\\\b(?:if we assume|let's say|imagine)\\\\b"
        ],
        CONFLICTING_PREMISES: [
          '\\\\b(?:but|however|on the other hand|contradicts)\\\\b',
          "\\\\b(?:conflict|inconsistent|doesn't match|disagree)\\\\b"
        ],
        TRADEOFF: [
          '\\\\b(?:trade-?off|balance|versus|vs)\\\\b',
          '\\\\b(?:pros and cons|advantages and disadvantages|weigh)\\\\b'
        ]
      },
      actions: {
        DEDUCE: [
          '^(?:deduce|derive|conclude|infer)\\\\s+(?:from|based on)\\\\b',
          '\\\\b(?:what can we deduce|logically follows|conclusion)\\\\b'
        ],
        VALIDATE_ASSUMPTION: [
          '\\\\b(?:valid|correct|accurate|true)\\\\s+(?:assumption|premise|claim)\\\\b',
          '\\\\b(?:is it correct|does this hold|verify|check)\\\\s+(?:assumption|premise)\\\\b'
        ],
        CHALLENGE_ASSUMPTION: [
          '\\\\b(?:challenge|question|doubt|dispute)\\\\s+(?:the\\\\s+)?(?:assumption|premise|claim)\\\\b',
          '\\\\b(?:what if this is wrong|alternative|counter)\\\\b'
        ],
        COMPARE_ALTERNATIVES: [
          '\\\\b(?:compare|contrast|evaluate)\\\\s+(?:the\\\\s+)?(?:options?|alternatives?|choices?)\\\\b',
          '\\\\b(?:which is better|option A vs|between these)\\\\b'
        ],
        IDENTIFY_BOTTLENECK: [
          '\\\\b(?:bottleneck|constraint|limiting factor|blocker)\\\\b',
          "\\\\b(?:what's blocking|where is the|main constraint)\\\\b"
        ],
        EXPLAIN_REASONING: [
          '\\\\b(?:explain|show|walk through)\\\\s+(?:your|the)\\\\s+(?:reasoning|logic|thinking)\\\\b',
          '\\\\b(?:why did you|how did you|step by step)\\\\s+(?:conclude|reason)\\\\b'
        ]
      },
      terminationConditions: {
        CONCLUSION_REACHED: [
          '\\\\b(?:in conclusion|finally|therefore|thus)\\\\b',
          '\\\\b(?:we can conclude|the answer is|result is)\\\\b'
        ],
        CONFIDENCE_THRESHOLD: [
          '\\\\b(?:confident|certain|sure)\\\\s+(?:enough|that|about)\\\\b',
          '\\\\b(?:high confidence|low confidence|uncertain)\\\\b'
        ],
        MISSING_DATA_BLOCKING: [
          '\\\\b(?:missing|need more|insufficient)\\\\s+(?:data|info|information)\\\\b',
          '\\\\b(?:cannot proceed|blocked|need to know)\\\\b'
        ]
      },
      failureModes: {
        CIRCULAR_REASONING: [
          '\\\\b(?:circular|assumes what|begging the question)\\\\b',
          '\\\\b(?:circular logic|self-referential|proves itself)\\\\b'
        ],
        OVERGENERALIZATION: [
          '\\\\b(?:always|never|all|none|everyone|no one)\\\\b.*\\\\b(?:absolute|generalize)\\\\b',
          '\\\\b(?:too broad|overgeneralized|sweeping claim)\\\\b'
        ],
        CONFLICTING_EVIDENCE: [
          '\\\\b(?:conflicting|contradictory|opposing)\\\\s+(?:evidence|data|information)\\\\b',
          "\\\\b(?:evidence conflicts|data contradicts|doesn't match)\\\\b"
        ]
      }
    },
    HELP: {
      states: {
        FIRST_TIME_USER: [
          '^(?:how do I|how to|what do I|where do I)\\\\s+(?:start|begin|get started)',
          '^(?:new here|first time|just started|beginner)\\\\b'
        ],
        ERROR_ENCOUNTERED: [
          '\\\\b(?:error|failed|not working|broken|bug|issue)\\\\b',
          "\\\\b(?:something went wrong|keeps failing|won't work)\\\\b"
        ],
        UPLOAD_ISSUE: [
          '\\\\b(?:upload|uploading)\\\\s+(?:failed|error|not working|stuck)',
          "\\\\b(?:can't upload|unable to upload|won't upload)\\\\b"
        ]
      },
      actions: {
        EXPLAIN_FEATURE: [
          '^(?:what does|what is|how does|explain)\\\\s+(?:the\\\\s+)?\\\\w+\\\\s+(?:feature|do|work)',
          '^(?:tell me about|describe|explain)\\\\s+(?:the\\\\s+)?(?:feature|functionality)'
        ],
        TROUBLESHOOT: [
          '^(?:fix|solve|resolve|troubleshoot|debug)\\\\b',
          "\\\\b(?:why is|why does|why won't|why can't)\\\\b.*\\\\b(?:work|working)\\\\b"
        ],
        GUIDE_STEP_BY_STEP: [
          '^(?:how do I|how to|steps to|guide me|walk me through)\\\\b',
          '\\\\b(?:step by step|instructions|tutorial)\\\\b'
        ]
      }
    },
    CONVERSATION: {
      states: {
        CLARIFICATION: [
          "^(?:what do you mean|clarify|explain that|I don't understand)\\\\b",
          '\\\\b(?:unclear|confused|not sure what you mean)\\\\b'
        ],
        EXPANSION: [
          '^(?:tell me more|more detail|expand on|elaborate)\\\\b',
          '\\\\b(?:can you explain more|go deeper|more information)\\\\b'
        ],
        CORRECTION: [
          "^(?:no|that's wrong|incorrect|not what I meant|I meant)\\\\b",
          "\\\\b(?:you misunderstood|that's not right|actually I wanted)\\\\b"
        ],
        TOPIC_SHIFT: [
          "^(?:anyway|moving on|different question|let's talk about|what about)\\\\b",
          '\\\\b(?:change topic|new question|something else)\\\\b'
        ]
      },
      actions: {
        EXPAND_ANSWER: [
          '^(?:more|expand|elaborate|tell me more|go on)\\\\b',
          '\\\\b(?:more detail|keep going|continue|and then)\\\\b'
        ],
        SHORTEN_ANSWER: [
          '^(?:shorter|brief|concise|tl;?dr|just the|quick)\\\\b',
          '\\\\b(?:too long|make it shorter|summarize that)\\\\b'
        ],
        REPHRASE_ANSWER: [
          '^(?:rephrase|say differently|in other words|simpler)\\\\b',
          '\\\\b(?:explain differently|another way|can you rephrase)\\\\b'
        ],
        HANDLE_FRUSTRATION: [
          '\\\\b(?:ugh|argh|frustrated|annoying|annoyed|useless)\\\\b',
          "\\\\b(?:this is stupid|doesn't help|not helpful|waste of time)\\\\b"
        ]
      }
    }
  };

  const intentExamples = examples[intent];
  if (!intentExamples) return '';

  const layerExamples = intentExamples[layer];
  if (!layerExamples) return '';

  const targetExamples = layerExamples[target];
  if (!targetExamples) {
    // Return generic examples for the layer
    const firstTarget = Object.values(layerExamples)[0];
    if (firstTarget) {
      return `EXAMPLE PATTERNS FOR ${layer.toUpperCase()}:
${firstTarget.map(p => `- "${p}"`).join('\n')}`;
    }
    return '';
  }

  return `EXAMPLE PATTERNS FOR ${target}:
${targetExamples.map(p => `- "${p}"`).join('\n')}`;
}

// ============================================================================
// UNIFIED PROMPT DISPATCHER
// ============================================================================

export function buildPrompt(job) {
  const { artifactType } = job;

  if (artifactType.includes('keywords')) {
    return buildKeywordsPrompt(job);
  } else if (artifactType.includes('patterns')) {
    return buildPatternsPrompt(job);
  }

  // Fallback for unknown types
  return buildKeywordsPrompt(job);
}

// ============================================================================
// LEGACY EXPORTS (for compatibility)
// ============================================================================

export function buildDepthExamplesPrompt(job) {
  return buildKeywordsPrompt({ ...job, layer: 'depth' });
}

export function buildOutputTemplatesPrompt(job) {
  return buildKeywordsPrompt({ ...job, layer: 'outputControl' });
}

export function buildPoliciesPrompt(job) {
  return buildKeywordsPrompt({ ...job, layer: 'policies' });
}

export function getPromptBuilder(artifactType) {
  return buildPrompt;
}
