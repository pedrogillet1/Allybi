// src/services/llm/prompts/toolPrompt.builder.ts
/**
 * TOOL PROMPT BUILDER
 *
 * Constructs prompts for tool-style behaviors:
 * - nav_pills (open/where/discovery)
 * - file list routing
 * - locate_content
 * - extraction
 *
 * Sources from data_banks/prompts/tool_prompts.any.json
 */

import { injectable } from 'tsyringe';

export type ToolPromptKind =
  | 'nav_pills'
  | 'file_list'
  | 'locate_content'
  | 'extraction'
  | 'disambiguation';

export interface ToolPromptContext {
  kind: ToolPromptKind;
  language: 'en' | 'pt' | 'es';
  userQuery: string;
  candidates?: Array<{
    docId: string;
    fileName: string;
    relevanceScore: number;
  }>;
  activeDocName?: string;
}

export interface ToolPromptOutput {
  systemPrompt: string;
  userPrompt: string;
}

@injectable()
export class ToolPromptBuilder {
  /** Build tool prompt from context */
  build(context: ToolPromptContext): ToolPromptOutput {
    // TODO: Compose tool prompt from bank
    throw new Error('ToolPromptBuilder.build not implemented');
  }
}
