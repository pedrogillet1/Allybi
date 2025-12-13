/**
 * Prompt Templates: Fallback Responses
 * Templates for generating fallback message variations
 */

import { LanguageCode, FallbackScenario, FallbackStyle, FallbackCategory, SUPPORTED_LANGUAGES } from '../schemas/index.js';

export interface FallbackPromptParams {
  scenario: FallbackScenario;
  style: FallbackStyle;
  languages: LanguageCode[];
  existingTemplates?: Record<LanguageCode, string[]>;
}

const SCENARIO_DESCRIPTIONS: Record<FallbackScenario, { desc: string; context: string; placeholders: string[] }> = {
  NO_DOCUMENTS: {
    desc: 'User has no documents in their workspace',
    context: 'Empty workspace, first-time user or deleted all files',
    placeholders: []
  },
  DOC_NOT_FOUND: {
    desc: 'Specific document name not found',
    context: 'User mentioned a filename that does not exist',
    placeholders: ['documentName']
  },
  DOC_NOT_PROCESSED_YET: {
    desc: 'Document still being processed/indexed',
    context: 'Recently uploaded file not yet ready for queries',
    placeholders: []
  },
  NO_RELEVANT_CONTENT: {
    desc: 'No matching content in documents',
    context: 'Query executed but no relevant results found',
    placeholders: []
  },
  AMBIGUOUS_QUERY: {
    desc: 'Query too vague to answer',
    context: 'User query lacks specificity',
    placeholders: []
  },
  MULTIPLE_DOCS_MATCH: {
    desc: 'Multiple documents match the name',
    context: 'Ambiguous document reference',
    placeholders: ['documentName', 'candidateList']
  },
  ERROR_RETRIEVAL: {
    desc: 'Search/retrieval system error',
    context: 'Technical error during document search',
    placeholders: []
  },
  ERROR_GENERATION: {
    desc: 'LLM generation error',
    context: 'Error generating response from AI',
    placeholders: []
  },
  NO_RELEVANT_DOCS: {
    desc: 'No relevant documents for query',
    context: 'Documents exist but none match the query',
    placeholders: []
  },
  UNSUPPORTED_INTENT: {
    desc: 'Intent type not supported',
    context: 'User requested unsupported functionality',
    placeholders: []
  },
  FEATURE_NOT_IMPLEMENTED: {
    desc: 'Feature not yet implemented',
    context: 'Valid request but feature is on roadmap',
    placeholders: []
  },
  INTERNAL_ERROR: {
    desc: 'Internal server error',
    context: 'Unexpected system error',
    placeholders: []
  },
  RATE_LIMIT: {
    desc: 'Rate limit exceeded',
    context: 'User made too many requests',
    placeholders: []
  },
  UPLOAD_IN_PROGRESS: {
    desc: 'Document upload in progress',
    context: 'File still uploading/processing',
    placeholders: []
  },
  LLM_ERROR: {
    desc: 'LLM service error',
    context: 'AI service temporarily unavailable',
    placeholders: []
  },
  AMBIGUOUS: {
    desc: 'Ambiguous request requiring clarification',
    context: 'General ambiguity in user intent',
    placeholders: []
  },
  AMBIGUOUS_QUESTION: {
    desc: 'Ambiguous question about documents',
    context: 'Question needs more specificity',
    placeholders: []
  },
  OUT_OF_SCOPE: {
    desc: 'Request out of scope or inappropriate',
    context: 'Non-document-related or inappropriate request',
    placeholders: []
  },
  SAFETY_CONCERN: {
    desc: 'Safety or mental health concern detected',
    context: 'User message indicates potential crisis',
    placeholders: []
  },
  LOW_CONFIDENCE: {
    desc: 'Low confidence in retrieved content',
    context: 'Results found but relevance uncertain',
    placeholders: []
  },
  EMPTY_QUERY: {
    desc: 'Empty or whitespace-only query',
    context: 'User sent blank message',
    placeholders: []
  }
};

const STYLE_GUIDANCE: Record<FallbackStyle, { maxLength: number; tone: string; structure: string }> = {
  one_liner: {
    maxLength: 100,
    tone: 'concise, direct',
    structure: 'Single sentence, no bullets or lists'
  },
  short_guidance: {
    maxLength: 300,
    tone: 'helpful, actionable',
    structure: 'Statement + 2-3 bullet points with suggestions'
  },
  detailed_explainer: {
    maxLength: 500,
    tone: 'educational, thorough',
    structure: 'Explanation paragraph + detailed steps'
  },
  friendly_redirect: {
    maxLength: 200,
    tone: 'warm, redirecting',
    structure: 'Acknowledgment + alternative suggestions'
  },
  technical_error: {
    maxLength: 250,
    tone: 'apologetic, professional',
    structure: 'Error acknowledgment + recovery steps'
  }
};

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish'
};

export function buildFallbackPrompt(params: FallbackPromptParams): string {
  const { scenario, style, languages, existingTemplates } = params;
  const scenarioInfo = SCENARIO_DESCRIPTIONS[scenario];
  const styleInfo = STYLE_GUIDANCE[style];

  const existingSection = existingTemplates
    ? `\n\n## Existing Templates (create VARIATIONS, not duplicates)\n${
        Object.entries(existingTemplates)
          .map(([lang, templates]) => `${lang}:\n${templates.map(t => `- "${t}"`).join('\n')}`)
          .join('\n\n')
      }`
    : '';

  return `You are generating fallback response templates for a document assistant chatbot.

## Scenario
- **Key**: ${scenario}
- **Description**: ${scenarioInfo.desc}
- **Context**: ${scenarioInfo.context}
- **Placeholders available**: ${scenarioInfo.placeholders.length ? scenarioInfo.placeholders.map(p => `{{${p}}}`).join(', ') : 'none'}

## Style Requirements
- **Style**: ${style}
- **Max length**: ${styleInfo.maxLength} characters
- **Tone**: ${styleInfo.tone}
- **Structure**: ${styleInfo.structure}

## Languages to Generate
${languages.map(l => `- ${LANGUAGE_NAMES[l]} (${l})`).join('\n')}

## Template Rules
1. Use {{placeholder}} syntax for dynamic values
2. Use **bold** for emphasis
3. Keep within max length
4. Make messages helpful and actionable
5. Maintain consistent tone across languages
6. Translations should be natural, not literal${existingSection}

## Output Format
Return ONLY a JSON object with templates for each language:

{
  "en": {
    "template": "The English template text",
    "placeholders": ["placeholder1", "placeholder2"]
  },
  "pt": {
    "template": "O texto do template em português",
    "placeholders": ["placeholder1", "placeholder2"]
  },
  "es": {
    "template": "El texto de la plantilla en español",
    "placeholders": ["placeholder1", "placeholder2"]
  }
}

Generate the templates now:`;
}

export function buildBatchFallbackPrompt(params: {
  scenarios: FallbackScenario[];
  styles: FallbackStyle[];
  languages: LanguageCode[];
}): string {
  const { scenarios, styles, languages } = params;

  return `You are generating fallback response templates for a document assistant chatbot.

## Task
Generate templates for these combinations:
- Scenarios: ${scenarios.join(', ')}
- Styles: ${styles.join(', ')}
- Languages: ${languages.join(', ')}

## Scenario Details
${scenarios.map(s => {
  const info = SCENARIO_DESCRIPTIONS[s];
  return `- ${s}: ${info.desc} (placeholders: ${info.placeholders.join(', ') || 'none'})`;
}).join('\n')}

## Style Details
${styles.map(s => {
  const info = STYLE_GUIDANCE[s];
  return `- ${s}: ${info.tone}, max ${info.maxLength} chars, ${info.structure}`;
}).join('\n')}

## Output Format
{
  "fallbacks": [
    {
      "scenario": "SCENARIO_KEY",
      "style": "style_id",
      "languages": {
        "en": { "template": "...", "placeholders": [] },
        "pt": { "template": "...", "placeholders": [] },
        "es": { "template": "...", "placeholders": [] }
      }
    }
  ]
}

Generate templates now:`;
}
