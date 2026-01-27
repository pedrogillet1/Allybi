// src/services/llm/prompts/systemPrompt.builder.ts
/**
 * SYSTEM PROMPT BUILDER
 *
 * Constructs the system prompt for LLM calls based on:
 * - Intent family / operator
 * - Language
 * - Domain overlays
 * - Active scope / doc context
 *
 * Sources prompt fragments from data_banks/prompts/system_prompt.any.json
 */

import { injectable } from 'tsyringe';

export interface SystemPromptContext {
  intentFamily?: string;
  operator?: string;
  language: 'en' | 'pt' | 'es';
  domain?: string;
  hasDocContext: boolean;
  activeDocName?: string;
  scopeLocked?: boolean;
}

@injectable()
export class SystemPromptBuilder {
  /** Build a complete system prompt from context */
  build(context: SystemPromptContext): string {
    // TODO: Compose system prompt from bank fragments
    throw new Error('SystemPromptBuilder.build not implemented');
  }

  /** Get the global base prompt for a language */
  getBase(language: 'en' | 'pt' | 'es'): string {
    // TODO: Load global base from bank
    throw new Error('SystemPromptBuilder.getBase not implemented');
  }

  /** Get the intent-specific overlay */
  getIntentOverlay(intentFamily: string, language: 'en' | 'pt' | 'es'): string | null {
    // TODO: Load intent overlay from bank
    throw new Error('SystemPromptBuilder.getIntentOverlay not implemented');
  }

  /** Get the operator-specific overlay */
  getOperatorOverlay(operator: string, language: 'en' | 'pt' | 'es'): string | null {
    // TODO: Load operator overlay from bank
    throw new Error('SystemPromptBuilder.getOperatorOverlay not implemented');
  }
}
