/**
 * ANSWER COMPOSER SERVICE - REDO 4: AST-based Answer Composition
 *
 * CENTRALIZED output formatting - ALL responses MUST pass through here.
 * Builds answers from structured nodes instead of regex string surgery.
 *
 * This is the SINGLE source of truth for response formatting.
 * DO NOT format responses anywhere else.
 *
 * Architecture:
 * - AnswerNode: Base type for all answer components (AST-like)
 * - TextNode, ListNode, TableNode, EvidenceNode: Typed node structures
 * - Factory methods: text(), bulletList(), numberedList(), table()
 * - compose(): Deterministic node-to-markdown rendering
 *
 * Canonical shapes (5 only):
 * 1. PARAGRAPH - 1-3 short paragraphs
 * 2. BULLETS - Clean bullet list (- item)
 * 3. STEPS - Numbered steps (1. 2. 3.)
 * 4. TABLE - Valid GFM markdown table
 * 5. ATTACHMENT - Structured file list via sourceButtons (no text listing)
 *
 * Benefits:
 * - No regex repairs - structure is guaranteed by construction
 * - Type-safe composition - impossible to create malformed output
 * - Easy testing - each node type can be unit tested
 * - Predictable output - same input always produces same output
 */

import { createDocMarker, createLoadMoreMarker } from '../utils/markerUtils';
import type { SourceButtonsAttachment } from './sourceButtons.service';
import { getBoilerplateStripper } from './boilerplateStripper.service';
import { getTerminologyService } from './terminology.service';
import type {
  HandlerResult,
  ComposedResponse,
  Attachment,
  FileItem,
  SourceReference,
  FileActionOperator,
  ValidationResult,
  ValidationFailure,
} from '../../types/handlerResult.types';
import type { LanguageCode } from '../../types/intentV3.types';

// =============================================================================
// AST NODE TYPES - REDO 4: Build answers from typed nodes
// =============================================================================

export type AnswerNodeType =
  | 'text'
  | 'paragraph'
  | 'heading'
  | 'emphasis'
  | 'list'
  | 'table'
  | 'evidence';

export interface BaseAnswerNode {
  type: AnswerNodeType;
}

export interface TextNode extends BaseAnswerNode {
  type: 'text';
  content: string;
}

export interface ParagraphNode extends BaseAnswerNode {
  type: 'paragraph';
  content: string;
}

export interface HeadingNode extends BaseAnswerNode {
  type: 'heading';
  level: 1 | 2 | 3;
  content: string;
}

export interface EmphasisNode extends BaseAnswerNode {
  type: 'emphasis';
  style: 'bold' | 'italic' | 'code';
  content: string;
}

export interface ListItem {
  content: string;
  subItems?: string[];
}

export interface ListNode extends BaseAnswerNode {
  type: 'list';
  style: 'bullet' | 'numbered';
  items: ListItem[];
}

export interface TableColumn {
  header: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableRow {
  cells: string[];
}

export interface TableNode extends BaseAnswerNode {
  type: 'table';
  columns: TableColumn[];
  rows: TableRow[];
}

export interface EvidenceNode extends BaseAnswerNode {
  type: 'evidence';
  quote: string;
  documentId: string;
  documentName: string;
  pageNumber?: number;
}

export type AnswerNode =
  | TextNode
  | ParagraphNode
  | HeadingNode
  | EmphasisNode
  | ListNode
  | TableNode
  | EvidenceNode;

// =============================================================================
// TYPES
// =============================================================================

export type OutputShape = 'paragraph' | 'bullets' | 'steps' | 'table' | 'attachment';

export interface FileAttachmentItem {
  id: string;
  filename: string;
  mimeType?: string;
  folderPath?: string;
  fileSize?: number;
}

export interface AttachmentData {
  type: 'file_list' | 'options' | 'disambiguation';
  items: FileAttachmentItem[];
  seeAll?: {
    label: string;
    totalCount: number;
    remainingCount: number;
  };
}

export interface ComposerInput {
  /** Raw content to format (legacy - prefer nodes for new code) */
  content: string;

  /** AST nodes to compose (REDO 4 - preferred approach) */
  nodes?: AnswerNode[];

  /** Detected or requested output shape */
  shape?: OutputShape;

  /** Language for localization */
  language: 'en' | 'pt' | 'es';

  /** For attachments - structured file data */
  attachment?: AttachmentData;

  /** Sources/citations to append (legacy - prefer sourceButtons) */
  sources?: Array<{
    id: string;
    name: string;
    pageNumber?: number;
  }>;

  /** REDO 2/3: Source buttons for frontend rendering as clickable pills */
  sourceButtons?: SourceButtonsAttachment;

  /** Optional: user's original query for format detection */
  query?: string;

  /** Optional: force specific bullet count */
  bulletCount?: number;

  /** Optional: force table format */
  wantsTable?: boolean;

  /** Intent for context-specific formatting */
  intent?: string;
}

export interface ComposerOutput {
  /** Formatted markdown text */
  text: string;

  /** The shape that was applied */
  shape: OutputShape;

  /** Structured attachment data (for UI rendering) - legacy */
  attachment?: AttachmentData;

  /** REDO 2/3: Source buttons for frontend rendering as clickable pills */
  sourceButtons?: SourceButtonsAttachment;

  /** Validation warnings */
  warnings: string[];

  /** Format enforcement actions taken */
  enforcement: {
    danglingItemsFixed: boolean;
    bulletCountEnforced: boolean;
    tableSpacingFixed: boolean;
    roboticPhrasesRemoved: boolean;
  };

  /** AST metadata for debugging/testing */
  metadata?: {
    nodeCount: number;
    hasTable: boolean;
    hasList: boolean;
    evidenceCount: number;
  };
}

// =============================================================================
// ROBOTIC PHRASES TO REMOVE
// =============================================================================

const ROBOTIC_PHRASES = [
  // English
  /^Based on (the|your) (documents?|files?|context),?\s*/i,
  /^According to (the|your) (documents?|files?|context),?\s*/i,
  /^I found (that\s+)?in (the|your) (documents?|files?),?\s*/i,
  /^Looking at (the|your) (documents?|files?),?\s*/i,
  /^From (the|your) (documents?|files?),?\s*/i,
  /^The (documents?|files?) (show|indicate|mention|state)s?\s+that\s*/i,
  /^Here'?s? (what|the)\s+(I found|information):?\s*/i,
  /^Let me (help|assist|show) you:?\s*/i,
  /^I'?d be happy to help[.!]?\s*/i,

  // Portuguese
  /^Com base nos? (seus\s+)?documentos?,?\s*/i,
  /^De acordo com (os?|seus?) documentos?,?\s*/i,
  /^Encontrei (que\s+)?nos? (seus?\s+)?documentos?,?\s*/i,
  /^Olhando (para\s+)?(os?|seus?) documentos?,?\s*/i,
  /^Dos? (seus?\s+)?documentos?,?\s*/i,
  /^Os? documentos? (mostram?|indicam?|mencionam?|afirmam?) que\s*/i,
  /^Aqui está o que encontrei:?\s*/i,
  /^Vou te ajudar:?\s*/i,

  // Spanish
  /^Según (los?|tus?) documentos?,?\s*/i,
  /^De acuerdo con (los?|tus?) documentos?,?\s*/i,
];

const ROBOTIC_CLOSERS = [
  // English
  /\s*Let me know if you (need|have|want) (anything else|more|questions)[.!]?\s*$/i,
  /\s*Feel free to ask if you (need|have) (more questions|anything else)[.!]?\s*$/i,
  /\s*I'?m here (to help|if you need)[^.]*[.!]?\s*$/i,
  /\s*Is there anything else[^.]*[.!?]?\s*$/i,

  // Portuguese
  /\s*Me avise se (precisar|tiver) (de mais alguma coisa|dúvidas)[.!]?\s*$/i,
  /\s*Estou (aqui|à disposição) (para ajudar|se precisar)[^.]*[.!]?\s*$/i,
  /\s*Posso ajudar com (mais alguma coisa|algo mais)[.!?]?\s*$/i,
];

// =============================================================================
// MICROCOPY LIBRARY - ChatGPT-like natural language responses
// =============================================================================

type MicrocopyKey =
  | 'file_count'
  | 'file_list'
  | 'file_filter'
  | 'file_sort'
  | 'file_locate'
  | 'file_where'
  | 'file_open'
  | 'file_group'
  | 'file_stats'
  | 'file_not_found'
  | 'file_disambiguate'
  | 'file_topic_search';

interface MicrocopyEntry {
  en: string;
  pt: string;
  es: string;
}

/**
 * Microcopy templates for file action responses.
 * Use {count}, {filename}, {folder}, {type} as placeholders.
 */
const MICROCOPY: Record<MicrocopyKey, MicrocopyEntry[]> = {
  file_count: [
    { en: 'You have {count} files.', pt: 'Você tem {count} arquivos.', es: 'Tienes {count} archivos.' },
    { en: '{count} documents in your library.', pt: '{count} documentos na sua biblioteca.', es: '{count} documentos en tu biblioteca.' },
  ],
  file_list: [
    { en: '', pt: '', es: '' },  // CHATGPT-LIKE: No preamble, button-only file list
    { en: '', pt: '', es: '' },  // Reserved for potential variation
  ],
  file_filter: [
    { en: 'Found {count} {type} files:', pt: 'Encontrei {count} arquivos {type}:', es: 'Encontré {count} archivos {type}:' },
    { en: 'Showing {count} {type} files:', pt: 'Mostrando {count} arquivos {type}:', es: 'Mostrando {count} archivos {type}:' },
  ],
  file_sort: [
    { en: 'Sorted by {criteria}:', pt: 'Ordenados por {criteria}:', es: 'Ordenados por {criteria}:' },
  ],
  file_locate: [
    { en: 'Here it is:', pt: 'Aqui está:', es: 'Aquí está:' },
    { en: 'Found it:', pt: 'Encontrei:', es: 'Lo encontré:' },
  ],
  // FIX 2: Add file_where microcopy for location queries
  file_where: [
    { en: 'This file is in **{folder}**', pt: 'Este arquivo está em **{folder}**', es: 'Este archivo está en **{folder}**' },
  ],
  file_open: [
    { en: '', pt: '', es: '' },  // Button-only, no text
  ],
  file_not_found: [
    { en: "I couldn't find a file matching \"{query}\".", pt: 'Não encontrei um arquivo correspondente a "{query}".', es: 'No encontré un archivo que coincida con "{query}".' },
    { en: 'No files found for "{query}".', pt: 'Nenhum arquivo encontrado para "{query}".', es: 'No se encontraron archivos para "{query}".' },
  ],
  file_disambiguate: [
    { en: 'I found multiple matches. Which one do you mean?', pt: 'Encontrei várias correspondências. Qual você quer dizer?', es: 'Encontré varias coincidencias. ¿Cuál quieres decir?' },
    { en: 'There are {count} files with that name:', pt: 'Existem {count} arquivos com esse nome:', es: 'Hay {count} archivos con ese nombre:' },
  ],
  file_topic_search: [
    { en: 'Files about {topic}:', pt: 'Arquivos sobre {topic}:', es: 'Archivos sobre {topic}:' },
    { en: 'Documents mentioning {topic}:', pt: 'Documentos que mencionam {topic}:', es: 'Documentos que mencionan {topic}:' },
  ],
  file_group: [
    { en: 'Your {count} files by folder:', pt: 'Seus {count} arquivos por pasta:', es: 'Tus {count} archivos por carpeta:' },
    { en: 'Files organized by folder:', pt: 'Arquivos organizados por pasta:', es: 'Archivos organizados por carpeta:' },
  ],
  file_stats: [
    { en: 'Your workspace summary:', pt: 'Resumo do seu workspace:', es: 'Resumen de tu espacio de trabajo:' },
    { en: 'Here\'s an overview of your files:', pt: 'Aqui está uma visão geral dos seus arquivos:', es: 'Aquí tienes un resumen de tus archivos:' },
  ],
};

// =============================================================================
// DANGLING LIST PATTERNS
// =============================================================================

const DANGLING_PATTERNS = [
  // Numbered items with no content: "1. " or "2." at end
  /^\s*\d+\.\s*$/gm,
  // Bullet with no content: "- " at end
  /^\s*[-•]\s*$/gm,
  // Multiple numbers in a row with no content between: "1. 2. 3."
  /(\d+\.\s*){2,}/g,
  // "Note: Only X items" artifacts
  /\s*Note:\s*Only\s+\d+\s+items?[^.]*\.?\s*/gi,
];

// =============================================================================
// SERVICE
// =============================================================================

export class AnswerComposerService {
  private readonly DEFAULT_LIST_CAP = 10;

  /**
   * Compose a response with the specified shape.
   * This is the ONLY method that should be used for formatting responses.
   *
   * REDO 4: If nodes[] is provided, use AST-based composition (preferred).
   * Otherwise fall back to legacy regex-based formatting.
   */
  compose(input: ComposerInput): ComposerOutput {
    const warnings: string[] = [];
    const enforcement = {
      danglingItemsFixed: false,
      bulletCountEnforced: false,
      tableSpacingFixed: false,
      roboticPhrasesRemoved: false,
    };

    // REDO 4: AST-based composition (preferred path)
    if (input.nodes && input.nodes.length > 0) {
      return this.composeFromNodes(input, warnings, enforcement);
    }

    // Handle attachments separately - they don't need text formatting
    if (input.attachment || input.shape === 'attachment') {
      return this.composeAttachment(input, warnings);
    }

    let text = input.content;

    // Step 1: Remove robotic phrases (legacy)
    text = this.removeRoboticPhrases(text);
    if (text !== input.content) {
      enforcement.roboticPhrasesRemoved = true;
    }

    // Step 1b: Apply boilerplate stripper (comprehensive stripping)
    const stripper = getBoilerplateStripper();
    const stripResult = stripper.strip(text, input.language === 'es' ? 'en' : input.language as 'en' | 'pt');
    if (stripResult.modified) {
      text = stripResult.text;
      enforcement.roboticPhrasesRemoved = true;
    }

    // Step 2: Detect shape if not specified
    const shape = input.shape || this.detectShape(text, input.query);

    // Step 3: Apply shape-specific formatting
    switch (shape) {
      case 'paragraph':
        text = this.formatParagraph(text);
        break;
      case 'bullets':
        text = this.formatBullets(text, input.bulletCount);
        if (input.bulletCount) enforcement.bulletCountEnforced = true;
        break;
      case 'steps':
        text = this.formatSteps(text);
        break;
      case 'table':
        text = this.formatTable(text);
        enforcement.tableSpacingFixed = true;
        break;
    }

    // Step 4: Fix dangling list items (applies to all shapes)
    const beforeDangling = text;
    text = this.fixDanglingItems(text);
    if (text !== beforeDangling) {
      enforcement.danglingItemsFixed = true;
    }

    // Step 5: Append sources if provided (legacy path - prefer sourceButtons)
    if (input.sources && input.sources.length > 0 && !input.sourceButtons) {
      text = this.appendSources(text, input.sources, input.language);
    }

    // Step 6: Final cleanup
    text = this.finalCleanup(text);

    return {
      text,
      shape,
      warnings,
      enforcement,
      // REDO 2/3: Pass through sourceButtons for frontend rendering
      sourceButtons: input.sourceButtons,
    };
  }

  // =============================================================================
  // HANDLER RESULT COMPOSITION - New architecture (REDO 5)
  // =============================================================================

  /**
   * Compose a ComposedResponse from a HandlerResult.
   * This is the NEW preferred entry point for all response formatting.
   *
   * Architecture:
   * 1. Handler returns structured data (HandlerResult)
   * 2. This method converts to formatted content + attachments
   * 3. Validation ensures compliance
   * 4. Repair fixes common issues
   */
  composeFromHandlerResult(result: HandlerResult): ComposedResponse {
    const attachments: Attachment[] = [];
    let content = '';
    const warnings: string[] = [];
    const repairsApplied: string[] = [];

    // DEBUG: Log incoming result
    console.log('[COMPOSE-DEBUG] composeFromHandlerResult called:', {
      intent: result.intent,
      operator: result.operator,
      buttonOnly: result.buttonOnly,
      hasFiles: !!result.files,
      filesLength: result.files?.length,
    });

    // === Step 1: Handle button-only responses (open/show) ===
    // FIX 2: 'where' should show location message, not button-only
    if (result.buttonOnly || result.operator === 'open' || result.operator === 'locate') {
      console.log('[COMPOSE-DEBUG] → routing to composeButtonOnly');
      return this.composeButtonOnly(result);
    }

    // === Step 2: Handle file action operators with microcopy ===
    // FIX 1: Also route 'stats' operator which doesn't have files array
    if (result.intent === 'file_actions' && (result.files || result.operator === 'stats')) {
      console.log('[COMPOSE-DEBUG] → routing to composeFileAction');
      return this.composeFileAction(result);
    }

    // === Step 3: Handle structured outputs (bullets, steps, table) ===
    if (result.bullets && result.bullets.length > 0) {
      content = this.composeBulletsFromResult(result, warnings, repairsApplied);
    } else if (result.steps && result.steps.length > 0) {
      content = this.composeStepsFromResult(result, warnings, repairsApplied);
    } else if (result.table) {
      content = this.composeTableFromResult(result, warnings, repairsApplied);
    } else if (result.oneLiner) {
      content = result.oneLiner;
    } else if (result.draftText) {
      // Legacy path: process raw text through existing compose()
      const composed = this.compose({
        content: result.draftText,
        language: result.language as 'en' | 'pt' | 'es',
        bulletCount: result.constraints?.exactBullets,
        wantsTable: result.constraints?.requireTable,
      });
      content = composed.text;
    }

    // === Step 4: Build attachments ===
    // Source buttons for document-grounded responses
    if (result.sourcesUsed && result.sourcesUsed.length > 0) {
      attachments.push(this.buildSourceButtonsAttachment(result.sourcesUsed));
    }

    // === Step 5: Apply boilerplate stripper ===
    if (content.length > 0) {
      const stripper = getBoilerplateStripper();
      const lang = (result.language || 'en') as 'en' | 'pt';
      const stripResult = stripper.strip(content, lang === 'es' as any ? 'en' : lang);
      if (stripResult.modified) {
        content = stripResult.text;
        repairsApplied.push('BOILERPLATE_STRIPPED');
      }
    }

    // === Step 5.5: Apply terminology enforcement ===
    if (content.length > 0) {
      const terminology = getTerminologyService();
      // Map intent to domain (finance, legal, accounting, medical are both)
      const domainMap: Record<string, string> = {
        finance: 'finance', legal: 'legal', accounting: 'accounting', medical: 'medical',
      };
      const domain = domainMap[result.intent] || 'general';
      const termResult = terminology.enforce(content, {
        domain: domain as any,
        language: (result.language || 'en') as 'en' | 'pt' | 'es',
      });
      if (termResult.modified) {
        content = termResult.text;
        repairsApplied.push('TERMINOLOGY_ENFORCED');
      }
    }

    // === Step 6: Validate and repair ===
    const validation = this.validateComposed(content, result);
    if (!validation.passed) {
      const repaired = this.repairContent(content, validation.failures, result);
      if (repaired !== content) {
        content = repaired;
        repairsApplied.push(...validation.failures.filter(f => f.canRepair).map(f => f.rule));
      }
    }

    // === Step 7: Final cleanup ===
    content = this.finalCleanup(content);

    return {
      content,
      attachments,
      language: result.language,
      meta: {
        composedBy: 'AnswerComposerV1',
        warnings: warnings.length > 0 ? warnings : undefined,
        repairsApplied: repairsApplied.length > 0 ? repairsApplied : undefined,
        validationPassed: validation.passed,
      },
    };
  }

  /**
   * Compose button-only response (open/where/show).
   * Returns empty content with file attachment only.
   */
  private composeButtonOnly(result: HandlerResult): ComposedResponse {
    const attachments: Attachment[] = [];

    if (result.files && result.files.length > 0) {
      attachments.push({
        type: 'source_buttons',
        buttons: result.files.map(f => ({
          documentId: f.documentId,
          title: f.title || f.filename,
          mimeType: f.mimeType,
          filename: f.filename,
        })),
      });
    }

    return {
      content: '',  // Button-only = no text content
      attachments,
      language: result.language,
      meta: { composedBy: 'AnswerComposerV1' },
    };
  }

  /**
   * Compose file action response with microcopy.
   * Maps operator to ChatGPT-like natural language.
   */
  private composeFileAction(result: HandlerResult): ComposedResponse {
    const lang = (result.language || 'en') as 'en' | 'pt' | 'es';
    const attachments: Attachment[] = [];
    let content = '';

    const operator = result.operator as FileActionOperator;
    const files = result.files || [];
    const totalCount = result.totalCount || files.length;

    // DEBUG: Log file action composition
    console.log('[COMPOSE-DEBUG] composeFileAction:', {
      operator,
      filesLength: files.length,
      firstFileFolderPath: files[0]?.folderPath,
      lang,
    });

    switch (operator) {
      case 'count':
        content = this.getMicrocopy('file_count', lang, { count: String(totalCount) });
        break;

      case 'list':
        content = this.getMicrocopy('file_list', lang);
        // CHATGPT PARITY: Include file names in text content (not just attachments)
        content += this.renderFileListAsText(files);
        attachments.push(this.buildFileListAttachment(files, totalCount, lang));
        break;

      case 'filter':
        content = this.getMicrocopy('file_filter', lang, { count: String(files.length), type: '' });
        // CHATGPT PARITY: Include file names in text content
        content += this.renderFileListAsText(files);
        attachments.push(this.buildFileListAttachment(files, totalCount, lang));
        break;

      case 'sort':
        content = this.getMicrocopy('file_sort', lang, { criteria: 'date' });
        // CHATGPT PARITY: Include file names in text content
        content += this.renderFileListAsText(files);
        attachments.push(this.buildFileListAttachment(files, totalCount, lang));
        break;

      case 'locate':
      case 'open':
        content = this.getMicrocopy('file_locate', lang);
        if (files.length > 0) {
          attachments.push({
            type: 'source_buttons',
            buttons: files.map(f => ({
              documentId: f.documentId,
              title: f.title || f.filename,
              mimeType: f.mimeType,
              filename: f.filename,
            })),
          });
        }
        break;

      case 'where':  // FIX 2: Handle 'where' with folder location message
        if (files.length > 0) {
          const folder = files[0].folderPath || 'Root';
          content = this.getMicrocopy('file_where', lang, { folder });
          attachments.push({
            type: 'source_buttons',
            buttons: files.map(f => ({
              documentId: f.documentId,
              title: f.title || f.filename,
              mimeType: f.mimeType,
              filename: f.filename,
            })),
          });
        } else {
          content = this.getMicrocopy('file_not_found', lang);
        }
        break;

      case 'search':
        content = this.getMicrocopy('file_topic_search', lang, { topic: '' });
        attachments.push(this.buildFileListAttachment(files, totalCount, lang));
        break;

      case 'group':
        // Group by folder - structured attachment with folder groupings
        content = this.getMicrocopy('file_group', lang, { count: String(totalCount) });
        attachments.push({
          type: 'grouped_files',
          groups: result.groups || [],  // Array of { folder: string, files: FileItem[] }
          totalCount,
        });
        break;

      case 'stats':
        // Workspace overview - format stats into readable bullets
        content = this.composeStatsContent(result, lang);
        break;

      case 'disambiguate':
        content = this.getMicrocopy('file_disambiguate', lang, { count: String(files.length) });
        attachments.push({
          type: 'select_file',
          prompt: content,
          options: files,
        });
        content = '';  // Prompt is in attachment
        break;

      case 'not_found':
        content = this.getMicrocopy('file_not_found', lang, { query: '' });
        break;

      default:
        content = this.getMicrocopy('file_list', lang);
        if (files.length > 0) {
          attachments.push(this.buildFileListAttachment(files, totalCount, lang));
        }
    }

    return {
      content,
      attachments,
      language: result.language,
      meta: { composedBy: 'AnswerComposerV1' },
    };
  }

  /**
   * Get microcopy template with placeholders filled.
   */
  private getMicrocopy(
    key: MicrocopyKey,
    lang: 'en' | 'pt' | 'es',
    vars?: Record<string, string>
  ): string {
    const templates = MICROCOPY[key];
    if (!templates || templates.length === 0) return '';

    // Pick first template (could randomize for variety)
    const template = templates[0][lang] || templates[0].en;

    if (!vars) return template;

    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * CHATGPT PARITY: Render file list as text for answer content.
   * Returns newline-separated list of filenames.
   */
  private renderFileListAsText(files: FileItem[]): string {
    if (!files || files.length === 0) return '';
    const displayFiles = files.slice(0, this.DEFAULT_LIST_CAP);
    const lines = displayFiles.map(f => `- ${f.filename}`);
    return '\n' + lines.join('\n');
  }

  /**
   * Build file_list attachment from FileItem array.
   */
  private buildFileListAttachment(
    files: FileItem[],
    totalCount: number,
    lang: 'en' | 'pt' | 'es'
  ): Attachment {
    const displayFiles = files.slice(0, this.DEFAULT_LIST_CAP);
    const seeAllLabels = { en: 'See all', pt: 'Ver todos', es: 'Ver todos' };

    return {
      type: 'file_list',
      items: displayFiles,
      totalCount,
      seeAllLabel: totalCount > this.DEFAULT_LIST_CAP
        ? `${seeAllLabels[lang]} ${totalCount}`
        : undefined,
    };
  }

  /**
   * Build source_buttons attachment from SourceReference array.
   */
  private buildSourceButtonsAttachment(sources: SourceReference[]): Attachment {
    return {
      type: 'source_buttons',
      buttons: sources.slice(0, this.DEFAULT_LIST_CAP).map(s => ({
        documentId: s.documentId,
        title: s.documentName,
        mimeType: s.mimeType,
        filename: s.filename,
      })),
    };
  }

  /**
   * Compose workspace stats into formatted content.
   * Creates a structured markdown response with type breakdown and folder breakdown.
   */
  private composeStatsContent(result: HandlerResult, lang: 'en' | 'pt' | 'es'): string {
    const stats = result.stats;
    if (!stats || stats.totalCount === 0) {
      const noFilesMessages = {
        en: 'You have no files in your workspace.',
        pt: 'Você não tem arquivos no seu workspace.',
        es: 'No tienes archivos en tu espacio de trabajo.',
      };
      return noFilesMessages[lang];
    }

    const microcopy = this.getMicrocopy('file_stats', lang);
    const lines: string[] = [microcopy, ''];

    // Total line
    const totalLabels = {
      en: `**Total**: ${stats.totalCount} files (${stats.formattedSize})`,
      pt: `**Total**: ${stats.totalCount} arquivos (${stats.formattedSize})`,
      es: `**Total**: ${stats.totalCount} archivos (${stats.formattedSize})`,
    };
    lines.push(totalLabels[lang], '');

    // By Type section
    const byTypeLabels = { en: '**By Type:**', pt: '**Por Tipo:**', es: '**Por Tipo:**' };
    lines.push(byTypeLabels[lang]);
    for (const [ext, count] of Object.entries(stats.byExtension)) {
      lines.push(`- **${ext.toUpperCase()}**: ${count}`);
    }
    lines.push('');

    // By Folder section
    const byFolderLabels = { en: '**By Folder:**', pt: '**Por Pasta:**', es: '**Por Carpeta:**' };
    lines.push(byFolderLabels[lang]);
    const fileLabels = { en: 'files', pt: 'arquivos', es: 'archivos' };
    for (const [folder, count] of Object.entries(stats.byFolder)) {
      lines.push(`- **${folder}**: ${count} ${fileLabels[lang]}`);
    }

    return lines.join('\n');
  }

  /**
   * Compose bullets from HandlerResult.bullets array.
   */
  private composeBulletsFromResult(
    result: HandlerResult,
    warnings: string[],
    repairsApplied: string[]
  ): string {
    let bullets = result.bullets || [];

    // Enforce exact count if specified
    if (result.constraints?.exactBullets) {
      const target = result.constraints.exactBullets;
      if (bullets.length > target) {
        bullets = bullets.slice(0, target);
        repairsApplied.push('BULLET_COUNT_TRIMMED');
      } else if (bullets.length < target) {
        warnings.push(`Expected ${target} bullets but only have ${bullets.length}`);
      }
    }

    return bullets.map(b => `- ${b}`).join('\n');
  }

  /**
   * Compose numbered steps from HandlerResult.steps array.
   */
  private composeStepsFromResult(
    result: HandlerResult,
    warnings: string[],
    repairsApplied: string[]
  ): string {
    let steps = result.steps || [];

    // Enforce exact count if specified
    if (result.constraints?.exactNumberedItems) {
      const target = result.constraints.exactNumberedItems;
      if (steps.length > target) {
        steps = steps.slice(0, target);
        repairsApplied.push('STEP_COUNT_TRIMMED');
      } else if (steps.length < target) {
        warnings.push(`Expected ${target} steps but only have ${steps.length}`);
      }
    }

    return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }

  /**
   * Compose table from HandlerResult.table.
   */
  private composeTableFromResult(
    result: HandlerResult,
    warnings: string[],
    repairsApplied: string[]
  ): string {
    const table = result.table;
    if (!table || !table.headers || !table.rows) return '';

    const lines: string[] = [];

    // Header
    lines.push(`| ${table.headers.join(' | ')} |`);

    // Separator
    lines.push(`| ${table.headers.map(() => '---').join(' | ')} |`);

    // Rows
    for (const row of table.rows) {
      const cells = row.slice(0, table.headers.length);
      while (cells.length < table.headers.length) cells.push('');
      lines.push(`| ${cells.join(' | ')} |`);
    }

    if (table.caption) {
      lines.push('');
      lines.push(`*${table.caption}*`);
    }

    return lines.join('\n');
  }

  // =============================================================================
  // VALIDATION AND REPAIR
  // =============================================================================

  /**
   * Validate composed content against rules.
   */
  private validateComposed(content: string, result: HandlerResult): ValidationResult {
    const failures: ValidationFailure[] = [];

    // Rule 1: Ends with ellipsis (truncation)
    if (/\.\.\.\s*$/.test(content)) {
      failures.push({
        rule: 'TRUNCATION',
        reason: 'Content ends with "..." indicating truncation',
        evidence: content.slice(-50),
        canRepair: true,
      });
    }

    // Rule 2: Orphan numbered item (e.g., "2." with no content)
    if (/^\s*\d+\.\s*$/m.test(content)) {
      failures.push({
        rule: 'ORPHAN_NUMBERED',
        reason: 'Numbered item with no content',
        evidence: content.match(/^\s*\d+\.\s*$/m)?.[0],
        canRepair: true,
      });
    }

    // Rule 3: Button-only should have no content
    if (result.buttonOnly && content.trim().length > 0) {
      failures.push({
        rule: 'BUTTON_ONLY_HAS_CONTENT',
        reason: 'Button-only response should have empty content',
        evidence: content.slice(0, 100),
        canRepair: true,
      });
    }

    // Rule 4: Exact bullet count mismatch
    if (result.constraints?.exactBullets) {
      const bulletCount = (content.match(/^\s*[-•]\s+.+$/gm) || []).length;
      if (bulletCount !== result.constraints.exactBullets) {
        failures.push({
          rule: 'BULLET_COUNT_MISMATCH',
          reason: `Expected ${result.constraints.exactBullets} bullets, found ${bulletCount}`,
          canRepair: bulletCount > result.constraints.exactBullets,
        });
      }
    }

    // Rule 5: Table required but not found
    if (result.constraints?.requireTable && !/\|.*\|.*\|/.test(content)) {
      failures.push({
        rule: 'TABLE_REQUIRED',
        reason: 'Table format required but not found',
        canRepair: false,
      });
    }

    // Rule 6: Mid-sentence cut
    if (/[a-z],?\s*$/i.test(content) && !/[.!?:]\s*$/.test(content)) {
      failures.push({
        rule: 'MID_SENTENCE',
        reason: 'Content appears cut mid-sentence',
        evidence: content.slice(-50),
        canRepair: true,
      });
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * Attempt to repair content based on validation failures.
   */
  private repairContent(
    content: string,
    failures: ValidationFailure[],
    result: HandlerResult
  ): string {
    let repaired = content;

    for (const failure of failures) {
      if (!failure.canRepair) continue;

      switch (failure.rule) {
        case 'TRUNCATION':
          // Remove trailing ellipsis and try to end at sentence
          repaired = repaired.replace(/\.\.\.\s*$/, '');
          // Find last complete sentence (without 's' flag for ES2017 compat)
          const sentenceMatches = repaired.match(/[\s\S]*[.!?]/);
          if (sentenceMatches) {
            repaired = sentenceMatches[0].trim();
          }
          break;

        case 'ORPHAN_NUMBERED':
          // Remove orphan numbered items
          repaired = repaired.replace(/^\s*\d+\.\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
          break;

        case 'BUTTON_ONLY_HAS_CONTENT':
          // Clear content for button-only
          repaired = '';
          break;

        case 'BULLET_COUNT_MISMATCH':
          // Trim excess bullets
          if (result.constraints?.exactBullets) {
            const bullets = repaired.match(/^\s*[-•]\s+.+$/gm) || [];
            const trimmed = bullets.slice(0, result.constraints.exactBullets);
            repaired = trimmed.join('\n');
          }
          break;

        case 'MID_SENTENCE':
          // Try to find last complete sentence (without 's' flag for ES2017 compat)
          const completeMatches = repaired.match(/[\s\S]*[.!?]/);
          if (completeMatches) {
            repaired = completeMatches[0].trim();
          }
          break;
      }
    }

    return repaired;
  }

  // =============================================================================
  // REDO 4: AST-BASED COMPOSITION
  // =============================================================================

  /**
   * Compose output from AST nodes (REDO 4 - preferred approach).
   * Each node type has deterministic rendering - no regex repairs needed.
   */
  private composeFromNodes(
    input: ComposerInput,
    warnings: string[],
    enforcement: ComposerOutput['enforcement']
  ): ComposerOutput {
    const nodes = input.nodes!;

    // Render each node to markdown
    const contentParts: string[] = [];
    let hasTable = false;
    let hasList = false;
    let evidenceCount = 0;

    for (const node of nodes) {
      const rendered = this.renderNode(node, input.language);
      if (rendered.trim()) {
        contentParts.push(rendered);
      }

      // Track metadata
      if (node.type === 'table') hasTable = true;
      if (node.type === 'list') hasList = true;
      if (node.type === 'evidence') evidenceCount++;
    }

    // Join with appropriate spacing
    const text = this.joinWithSpacing(contentParts);

    // Detect shape from nodes
    const shape = this.detectShapeFromNodes(nodes);

    return {
      text,
      shape,
      warnings,
      enforcement,
      // REDO 2/3: Pass through sourceButtons
      sourceButtons: input.sourceButtons,
      metadata: {
        nodeCount: nodes.length,
        hasTable,
        hasList,
        evidenceCount,
      },
    };
  }

  /**
   * Render a single AST node to markdown string.
   * Each node type has deterministic rendering rules - guaranteed well-formed output.
   */
  private renderNode(node: AnswerNode, language: 'en' | 'pt' | 'es'): string {
    switch (node.type) {
      case 'text':
        return this.renderTextNode(node);
      case 'paragraph':
        return this.renderParagraphNode(node);
      case 'heading':
        return this.renderHeadingNode(node);
      case 'emphasis':
        return this.renderEmphasisNode(node);
      case 'list':
        return this.renderListNode(node);
      case 'table':
        return this.renderTableNode(node);
      case 'evidence':
        return this.renderEvidenceNode(node, language);
      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = node;
        return '';
    }
  }

  private renderTextNode(node: TextNode): string {
    return node.content.trim();
  }

  private renderParagraphNode(node: ParagraphNode): string {
    return node.content.trim();
  }

  private renderHeadingNode(node: HeadingNode): string {
    const prefix = '#'.repeat(node.level);
    return `${prefix} ${node.content}`;
  }

  private renderEmphasisNode(node: EmphasisNode): string {
    switch (node.style) {
      case 'bold':
        return `**${node.content}**`;
      case 'italic':
        return `*${node.content}*`;
      case 'code':
        return `\`${node.content}\``;
    }
  }

  private renderListNode(node: ListNode): string {
    const lines: string[] = [];

    node.items.forEach((item, idx) => {
      const prefix = node.style === 'numbered' ? `${idx + 1}.` : '-';
      lines.push(`${prefix} ${item.content}`);

      // Render sub-items with indentation
      if (item.subItems) {
        item.subItems.forEach(subItem => {
          lines.push(`  - ${subItem}`);
        });
      }
    });

    // Each item on its own line - guaranteed by construction (not regex)
    return lines.join('\n');
  }

  private renderTableNode(node: TableNode): string {
    if (node.columns.length === 0 || node.rows.length === 0) {
      return '';
    }

    const lines: string[] = [];

    // Header row
    const headers = node.columns.map(col => col.header);
    lines.push(`| ${headers.join(' | ')} |`);

    // Separator row with alignment
    const separators = node.columns.map(col => {
      switch (col.align) {
        case 'left': return ':---';
        case 'center': return ':---:';
        case 'right': return '---:';
        default: return '---';
      }
    });
    lines.push(`| ${separators.join(' | ')} |`);

    // Data rows
    for (const row of node.rows) {
      const cells = row.cells.slice(0, node.columns.length);
      while (cells.length < node.columns.length) {
        cells.push('');
      }
      lines.push(`| ${cells.join(' | ')} |`);
    }

    return lines.join('\n');
  }

  private renderEvidenceNode(node: EvidenceNode, language: 'en' | 'pt' | 'es'): string {
    // Render quoted evidence as blockquote (filename in sources panel, not here)
    const quote = node.quote.trim();
    const quotedLines = quote.split('\n').map(line => `> ${line}`);
    return quotedLines.join('\n');
  }

  /**
   * Join content parts with appropriate spacing (double newlines for markdown).
   */
  private joinWithSpacing(parts: string[]): string {
    const nonEmpty = parts.filter(p => p.trim().length > 0);
    if (nonEmpty.length === 0) return '';
    if (nonEmpty.length === 1) return nonEmpty[0];
    return nonEmpty.join('\n\n');
  }

  /**
   * Detect output shape from AST nodes.
   */
  private detectShapeFromNodes(nodes: AnswerNode[]): OutputShape {
    const hasTable = nodes.some(n => n.type === 'table');
    if (hasTable) return 'table';

    const hasList = nodes.some(n => n.type === 'list');
    if (hasList) {
      const listNode = nodes.find(n => n.type === 'list') as ListNode;
      return listNode.style === 'numbered' ? 'steps' : 'bullets';
    }

    return 'paragraph';
  }

  // =============================================================================
  // FACTORY METHODS - Create typed nodes with validation (REDO 4)
  // =============================================================================

  /** Create a text node */
  text(content: string): TextNode {
    return { type: 'text', content };
  }

  /** Create a paragraph node */
  paragraph(content: string): ParagraphNode {
    return { type: 'paragraph', content };
  }

  /** Create a heading node */
  heading(level: 1 | 2 | 3, content: string): HeadingNode {
    return { type: 'heading', level, content };
  }

  /** Create an emphasis node (bold, italic, or code) */
  emphasis(style: 'bold' | 'italic' | 'code', content: string): EmphasisNode {
    return { type: 'emphasis', style, content };
  }

  /** Create a bullet list node */
  bulletList(items: string[] | ListItem[]): ListNode {
    const normalizedItems = items.map(item =>
      typeof item === 'string' ? { content: item } : item
    );
    return { type: 'list', style: 'bullet', items: normalizedItems };
  }

  /** Create a numbered list node */
  numberedList(items: string[] | ListItem[]): ListNode {
    const normalizedItems = items.map(item =>
      typeof item === 'string' ? { content: item } : item
    );
    return { type: 'list', style: 'numbered', items: normalizedItems };
  }

  /** Create a table node from columns and data */
  table(columns: string[] | TableColumn[], data: string[][]): TableNode {
    const normalizedColumns = columns.map(col =>
      typeof col === 'string' ? { header: col } : col
    );
    const rows = data.map(cells => ({ cells }));
    return { type: 'table', columns: normalizedColumns, rows };
  }

  /** Create an evidence node (quoted from document) */
  evidence(quote: string, documentId: string, documentName: string, pageNumber?: number): EvidenceNode {
    return { type: 'evidence', quote, documentId, documentName, pageNumber };
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /** Enforce exact list count by trimming */
  enforceListCount(node: ListNode, targetCount: number): ListNode {
    if (node.items.length <= targetCount) return node;
    return { ...node, items: node.items.slice(0, targetCount) };
  }

  /** Convert list to numbered style */
  toNumbered(node: ListNode): ListNode {
    return { ...node, style: 'numbered' };
  }

  /** Convert list to bullet style */
  toBullet(node: ListNode): ListNode {
    return { ...node, style: 'bullet' };
  }

  /** Build sourceButtons from sources array */
  buildSourceButtons(
    sources: Array<{
      id: string;
      title: string;
      mimeType?: string;
      // Location within doc (page, slide, sheet, cell)
      location?: {
        type: 'page' | 'slide' | 'sheet' | 'cell' | 'section';
        value: string | number;
        label?: string;
      };
      // For legacy callers passing page number directly
      pageNumber?: number;
    }>,
    language: 'en' | 'pt' | 'es',
    listCap?: number
  ): SourceButtonsAttachment | undefined {
    if (!sources || sources.length === 0) return undefined;

    const cap = listCap ?? this.DEFAULT_LIST_CAP;
    const displaySources = sources.slice(0, cap);

    const buttons = displaySources.map(src => {
      // Build location object if pageNumber provided but not location
      let location = src.location;
      if (!location && src.pageNumber) {
        location = {
          type: 'page' as const,
          value: src.pageNumber,
          label: `Page ${src.pageNumber}`,
        };
      }

      return {
        documentId: src.id,
        title: src.title,
        mimeType: src.mimeType,
        ...(location ? { location } : {}),
      };
    });

    const result: SourceButtonsAttachment = {
      type: 'source_buttons',
      buttons,
    };

    if (sources.length > cap) {
      const seeAllLabels = { en: 'See all', pt: 'Ver todos', es: 'Ver todos' };
      result.seeAll = {
        label: seeAllLabels[language],
        totalCount: sources.length,
        remainingCount: sources.length - cap,
      };
    }

    return result;
  }

  // =============================================================================
  // LEGACY METHODS (regex-based fallback)
  // =============================================================================

  /**
   * Compose an attachment response (file list, options, etc.)
   *
   * REDO 3: For file listings, use sourceButtons instead of DOC markers.
   * The frontend renders sourceButtons as clickable pills.
   */
  private composeAttachment(input: ComposerInput, warnings: string[]): ComposerOutput {
    const attachment = input.attachment || {
      type: 'file_list' as const,
      items: [],
    };

    // For attachments, the text is just the preamble - no file listing
    // REDO 3: Actual files are in sourceButtons, not in text
    const text = input.content || '';

    // REDO 3: Build sourceButtons from attachment items if not provided
    // NOTE: folderPath is NOT a document location (page/slide/sheet) - don't pass it
    let sourceButtons = input.sourceButtons;
    if (!sourceButtons && attachment.items.length > 0) {
      sourceButtons = this.buildSourceButtons(
        attachment.items.map(item => ({
          id: item.id,
          title: item.filename,
          mimeType: item.mimeType,
          // folderPath is stored separately, not as location (which is for page/slide/sheet)
        })),
        input.language,
        this.DEFAULT_LIST_CAP
      );
    }

    return {
      text,
      shape: 'attachment',
      attachment,
      sourceButtons,
      warnings,
      enforcement: {
        danglingItemsFixed: false,
        bulletCountEnforced: false,
        tableSpacingFixed: false,
        roboticPhrasesRemoved: false,
      },
    };
  }

  /**
   * Detect the appropriate shape from content
   */
  private detectShape(text: string, query?: string): OutputShape {
    // Check query for explicit format requests
    if (query) {
      const q = query.toLowerCase();
      if (/\b(table|tabela|tabla)\b/i.test(q) || /\bformat.*(table|tabela)/i.test(q)) {
        return 'table';
      }
      if (/\b(step|passo|etapa|paso)\s*(by|a)\s*(step|passo|etapa|paso)/i.test(q)) {
        return 'steps';
      }
      if (/\b(bullet|ponto|item|lista)\b/i.test(q) || /\bexactly\s+\d+\s+(bullet|point|item)/i.test(q)) {
        return 'bullets';
      }
    }

    // Check content structure
    const hasTable = /\|.*\|.*\|/m.test(text) && /^[\s]*\|[-:]+\|/m.test(text);
    if (hasTable) return 'table';

    const bulletLines = (text.match(/^\s*[-•]\s+.+$/gm) || []).length;
    const numberedLines = (text.match(/^\s*\d+\.\s+.+$/gm) || []).length;

    if (numberedLines >= 3) return 'steps';
    if (bulletLines >= 3) return 'bullets';

    return 'paragraph';
  }

  /**
   * Remove robotic preambles and closers
   */
  private removeRoboticPhrases(text: string): string {
    let result = text;

    // Remove preambles (can appear anywhere, not just start)
    for (const pattern of ROBOTIC_PHRASES) {
      result = result.replace(pattern, '');
    }

    // Remove closers
    for (const pattern of ROBOTIC_CLOSERS) {
      result = result.replace(pattern, '');
    }

    // Clean up leading/trailing whitespace and punctuation
    result = result.replace(/^\s*[,.:;]\s*/, '').trim();

    return result;
  }

  /**
   * Format as paragraph (max 3 paragraphs)
   */
  private formatParagraph(text: string): string {
    // Split into paragraphs
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

    // Limit to 3 paragraphs max
    const limited = paragraphs.slice(0, 3);

    return limited.join('\n\n');
  }

  /**
   * Format as bullet list
   */
  private formatBullets(text: string, targetCount?: number): string {
    // Extract existing bullets or convert numbered to bullets
    let bullets: string[] = [];

    // Try to extract bullet items
    const bulletMatches = text.match(/^\s*[-•]\s+(.+)$/gm);
    const numberedMatches = text.match(/^\s*\d+\.\s+(.+)$/gm);

    if (bulletMatches) {
      bullets = bulletMatches.map(b => b.replace(/^\s*[-•]\s+/, '').trim());
    } else if (numberedMatches) {
      bullets = numberedMatches.map(b => b.replace(/^\s*\d+\.\s+/, '').trim());
    } else {
      // Try to split by sentences or semicolons
      const sentences = text.split(/[.;]\s+/).filter(s => s.trim().length > 10);
      bullets = sentences.map(s => s.trim().replace(/[.;]$/, ''));
    }

    // Enforce target count if specified
    if (targetCount && bullets.length > targetCount) {
      bullets = bullets.slice(0, targetCount);
    }

    // Format as clean bullets
    return bullets.map(b => `- ${b}`).join('\n');
  }

  /**
   * Format as numbered steps
   */
  private formatSteps(text: string): string {
    // Extract existing numbered items or convert bullets
    let steps: string[] = [];

    const numberedMatches = text.match(/^\s*\d+\.\s+(.+)$/gm);
    const bulletMatches = text.match(/^\s*[-•]\s+(.+)$/gm);

    if (numberedMatches) {
      steps = numberedMatches.map(s => s.replace(/^\s*\d+\.\s+/, '').trim());
    } else if (bulletMatches) {
      steps = bulletMatches.map(b => b.replace(/^\s*[-•]\s+/, '').trim());
    } else {
      // Try to split by newlines or periods
      const lines = text.split(/\n+/).filter(l => l.trim().length > 10);
      steps = lines.map(l => l.trim());
    }

    // Format as numbered list
    return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }

  /**
   * Format as table (ensure proper GFM spacing)
   */
  private formatTable(text: string): string {
    // Ensure blank lines before and after table
    let result = text;

    // Find table content (lines with |)
    const lines = result.split('\n');
    const tableStartIndex = lines.findIndex(l => l.includes('|'));
    const tableEndIndex = lines.length - 1 - [...lines].reverse().findIndex(l => l.includes('|'));

    if (tableStartIndex >= 0 && tableEndIndex >= tableStartIndex) {
      // Ensure blank line before table (if not at start)
      if (tableStartIndex > 0 && lines[tableStartIndex - 1].trim() !== '') {
        lines.splice(tableStartIndex, 0, '');
      }

      // Ensure blank line after table (if not at end)
      const newEndIndex = lines.length - 1 - [...lines].reverse().findIndex(l => l.includes('|'));
      if (newEndIndex < lines.length - 1 && lines[newEndIndex + 1]?.trim() !== '') {
        lines.splice(newEndIndex + 1, 0, '');
      }

      result = lines.join('\n');
    }

    return result;
  }

  /**
   * Fix dangling list items (numbers/bullets with no content)
   */
  private fixDanglingItems(text: string): string {
    let result = text;

    for (const pattern of DANGLING_PATTERNS) {
      result = result.replace(pattern, '');
    }

    // Clean up multiple blank lines
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
  }

  /**
   * Append sources section
   */
  private appendSources(
    text: string,
    sources: Array<{ id: string; name: string; pageNumber?: number }>,
    language: 'en' | 'pt' | 'es'
  ): string {
    if (sources.length === 0) return text;

    const headers: Record<string, string> = {
      en: 'Sources',
      pt: 'Fontes',
      es: 'Fuentes',
    };

    const header = headers[language] || headers.en;
    const sourceLines = sources.map(s => {
      const marker = createDocMarker({ id: s.id, name: s.name, ctx: 'text' });
      const page = s.pageNumber ? ` (p. ${s.pageNumber})` : '';
      return `- ${marker}${page}`;
    });

    return `${text}\n\n**${header}:**\n${sourceLines.join('\n')}`;
  }

  /**
   * Final cleanup pass
   */
  private finalCleanup(text: string): string {
    let result = text;

    // Remove multiple spaces
    result = result.replace(/  +/g, ' ');

    // Remove multiple blank lines
    result = result.replace(/\n{3,}/g, '\n\n');

    // Remove trailing whitespace from lines
    result = result.split('\n').map(l => l.trimEnd()).join('\n');

    // Trim overall
    result = result.trim();

    return result;
  }
}

// Singleton instance
let composerInstance: AnswerComposerService | null = null;

export function getAnswerComposer(): AnswerComposerService {
  if (!composerInstance) {
    composerInstance = new AnswerComposerService();
  }
  return composerInstance;
}
