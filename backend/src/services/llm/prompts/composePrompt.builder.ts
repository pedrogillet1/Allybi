// src/services/llm/prompts/composePrompt.builder.ts
/**
 * COMPOSE PROMPT BUILDER
 *
 * Constructs the answer-composition prompt sent to the LLM.
 * Injects evidence chunks, formatting rules, and domain-aware tone.
 *
 * Sources from data_banks/prompts/compose_answer_prompt.any.json
 */

import { injectable } from 'tsyringe';

export interface ComposePromptContext {
  userQuery: string;
  language: 'en' | 'pt' | 'es';
  operator: string;
  domain?: string;
  evidence: Array<{
    text: string;
    docName: string;
    page?: number;
    confidence: number;
  }>;
  outputShape?: 'paragraph' | 'bullets' | 'numbered_list' | 'table';
  maxSentences?: number;
  requireSourceButtons?: boolean;
}

export interface ComposePromptOutput {
  systemPrompt: string;
  userPrompt: string;
}

@injectable()
export class ComposePromptBuilder {
  /** Build answer composition prompt from context */
  build(context: ComposePromptContext): ComposePromptOutput {
    // TODO: Compose answer prompt from bank
    throw new Error('ComposePromptBuilder.build not implemented');
  }
}
