// src/services/llm/prompts/retrievalPrompt.builder.ts
/**
 * RETRIEVAL PROMPT BUILDER
 *
 * Constructs the retrieval-plan prompt sent to the LLM to generate
 * query variants, required terms, exclusions, and location targets.
 *
 * Sources from data_banks/prompts/retrieval_prompt.any.json
 */

import { injectable } from 'tsyringe';

export interface RetrievalPromptContext {
  userQuery: string;
  language: 'en' | 'pt' | 'es';
  domain?: string;
  scopedDocNames?: string[];
  signals?: {
    numericIntent?: boolean;
    comparisonIntent?: boolean;
    timeRangePresent?: boolean;
    entityMentioned?: string;
  };
}

export interface RetrievalPromptOutput {
  systemPrompt: string;
  userPrompt: string;
}

@injectable()
export class RetrievalPromptBuilder {
  /** Build retrieval plan prompt from context */
  build(context: RetrievalPromptContext): RetrievalPromptOutput {
    // TODO: Compose retrieval prompt from bank
    throw new Error('RetrievalPromptBuilder.build not implemented');
  }
}
