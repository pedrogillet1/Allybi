/**
 * Prompt Templates: Validation Rules Generation
 * Generate rules for refining intent classification
 */

import { LanguageCode } from '../schemas/patterns.schema.js';
import {
  IntentName,
  ValidationVariation,
  INTENT_HIERARCHY,
  SUB_INTENT_DESCRIPTIONS,
  GENERATION_TARGETS
} from '../schemas/intents.schema.js';
import {
  VALIDATION_VARIATION_DESCRIPTIONS,
  VALIDATION_DISTRIBUTION
} from '../schemas/validation-rules.schema.js';

export interface ValidationRulesPromptParams {
  intent: IntentName;
  subIntent: string;
  count: number;
  existingRules?: string[];
}

export function buildValidationRulesPrompt(params: ValidationRulesPromptParams): string {
  const { intent, subIntent, count, existingRules } = params;

  const intentDesc = INTENT_HIERARCHY[intent].description;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;

  // Get other intents for exclusion rules
  const otherIntents = Object.keys(INTENT_HIERARCHY).filter(i => i !== intent);

  // Calculate distribution
  const requiredCount = Math.round(count * VALIDATION_DISTRIBUTION.required_context);
  const exclusionsCount = Math.round(count * VALIDATION_DISTRIBUTION.exclusions);
  const modifiersCount = count - requiredCount - exclusionsCount;

  const existingSection = existingRules?.length
    ? `\n\n## Existing Rules (DO NOT duplicate)\n${existingRules.slice(0, 10).map(r => `- ${r}`).join('\n')}`
    : '';

  return `You are generating validation rules for an intent classification system. These rules refine classification after initial pattern matching.

## Target
- **Intent**: ${intent} - ${intentDesc}
- **Sub-intent**: ${subIntent} - ${subIntentDesc}
- **Total rules needed**: ${count}

## Distribution Required
Generate rules in these proportions:
- **required_context** (${requiredCount}): ${VALIDATION_VARIATION_DESCRIPTIONS.required_context}
- **exclusions** (${exclusionsCount}): ${VALIDATION_VARIATION_DESCRIPTIONS.exclusions}
- **confidence_modifiers** (${modifiersCount}): ${VALIDATION_VARIATION_DESCRIPTIONS.confidence_modifiers}

## Rule Types
1. **requires**: Must have certain context to match
   - Example: "Requires mention of document/file/report"
2. **excludes**: Exclude if certain patterns present
   - Example: "Exclude if contains 'how to upload'" (→ help intent)
3. **boost**: Increase confidence if condition met
   - Example: "Boost if contains specific filename"
4. **penalize**: Decrease confidence if condition met
   - Example: "Penalize if query is too short (<3 words)"

## Context for Exclusion Rules
Other intents that might be confused with ${intent}:${subIntent}:
${otherIntents.slice(0, 5).map(i => `- ${i}: ${INTENT_HIERARCHY[i as IntentName].description}`).join('\n')}

## Rule Quality Guidelines
1. **Specific**: Target real classification edge cases
2. **Actionable**: Clear conditions that can be checked
3. **Balanced**: Don't over-constrain matching
4. **Language-aware**: Some rules may be language-specific${existingSection}

## Output Format
Return ONLY a JSON array with this structure:
[
  {
    "id": "unique_rule_id",
    "name": "Brief rule name",
    "description": "Detailed description of what this rule does",
    "variation": "required_context|exclusions|confidence_modifiers",
    "rule": {
      "type": "requires|excludes|boost|penalize",
      "condition": "human-readable condition",
      "values": ["keyword1", "keyword2"],
      "modifier": -0.3 to 0.3 (for boost/penalize)
    },
    "languages": ["en", "pt", "es"] or null for all,
    "priority": 1-100
  }
]

Generate exactly ${count} validation rules now:`;
}

export function buildBatchValidationRulesPrompt(params: {
  intent: IntentName;
  subIntents: string[];
  countPerSubIntent: number;
}): string {
  const { intent, subIntents, countPerSubIntent } = params;

  const intentDesc = INTENT_HIERARCHY[intent].description;
  const subIntentDescs = subIntents.map(si =>
    `- **${si}**: ${SUB_INTENT_DESCRIPTIONS[intent]?.[si] || si}`
  ).join('\n');

  const otherIntents = Object.keys(INTENT_HIERARCHY).filter(i => i !== intent);

  return `You are generating validation rules for an intent classification system.

## Task
Generate ${countPerSubIntent} validation rules for EACH sub-intent listed below.

## Intent: ${intent}
${intentDesc}

## Sub-intents to cover:
${subIntentDescs}

## Distribution per sub-intent
For each sub-intent, include:
- 35% required_context (must have certain elements)
- 35% exclusions (must not have certain elements)
- 30% confidence_modifiers (boost/penalize confidence)

## Other Intents (for exclusion rules)
${otherIntents.slice(0, 5).map(i => `- ${i}`).join('\n')}

## Rule Types
- requires: Must have context (e.g., document mention)
- excludes: Must not have patterns (e.g., "how to use")
- boost: Increase confidence (+0.1 to +0.3)
- penalize: Decrease confidence (-0.1 to -0.3)

## Output Format
{
  "rules": [
    {
      "id": "rule_id",
      "name": "Rule name",
      "description": "What the rule does",
      "subIntent": "the sub-intent",
      "variation": "required_context|exclusions|confidence_modifiers",
      "rule": {
        "type": "requires|excludes|boost|penalize",
        "condition": "human-readable condition",
        "values": ["keywords"],
        "modifier": -0.3 to 0.3
      },
      "priority": 1-100
    }
  ]
}

Generate ${countPerSubIntent * subIntents.length} total rules now:`;
}
