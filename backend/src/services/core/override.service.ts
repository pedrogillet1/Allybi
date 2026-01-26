/**
 * Intent Override Service (V4)
 *
 * Applies deterministic rules to override intent classification
 * based on workspace context and query patterns.
 *
 * NOTE: Uses V4 simplified intent names (documents, help, conversation, etc.)
 */

import { IntentClassificationV3 } from '../../types/ragV3.types';

export interface OverrideParams {
  intent: IntentClassificationV3;
  userId: string;
  query: string;
  workspaceStats: {
    docCount: number;
  };
}

export type OverrideResult = IntentClassificationV3;

class OverrideService {
  // Help-related keywords - SPECIFIC to product usage, not generic verbs
  // Avoid generic phrases like "how to", "how do i" which absorb document questions
  private readonly helpKeywords = [
    // English - Koda-specific help
    'help with koda', 'koda tutorial', 'koda guide', 'how does koda work',
    'upload files', 'upload documents', 'supported file types', 'file types supported',
    'search my workspace', 'organize files', 'create folder', 'delete folder',
    'keyboard shortcuts', 'getting started', 'user manual', 'help documentation',
    // Portuguese - Koda-specific help
    'ajuda do koda', 'tutorial do koda', 'guia do koda', 'como funciona o koda',
    'enviar arquivos', 'tipos de arquivo', 'organizar arquivos', 'criar pasta',
    'atalhos de teclado', 'começar a usar', 'manual do usuário',
    // Spanish - Koda-specific help
    'ayuda de koda', 'tutorial de koda', 'guía de koda', 'cómo funciona koda',
    'subir archivos', 'tipos de archivo', 'organizar archivos', 'crear carpeta',
    'atajos de teclado', 'empezar a usar', 'manual de usuario',
  ];

  // Intents that should NEVER be overridden to 'help'
  // V4 simplified intent names
  private readonly protectedIntents = [
    'error',        // Includes: safety, out-of-scope, ambiguous, unknown
    'conversation', // Includes: chitchat, feedback
    'reasoning',    // Math, logic, general knowledge
    'extraction',   // Meta-AI queries
    'edit',         // Text transforms, rewrites
    'memory',       // Store/recall
    'preferences',  // User settings
  ];

  /**
   * Apply override rules to intent classification.
   *
   * Rules (V4 - Fixed to avoid over-absorption):
   * 1. High-confidence matches (>=0.95) are IMMUNE to override
   * 2. Protected intents (error, conversation, etc.) are NEVER overridden
   * 3. No documents + SPECIFIC Koda help keywords → 'help' (but not document queries)
   * 4. Document intents with no documents → Keep intent, add noDocsGuidance flag (don't override!)
   */
  public async override(params: OverrideParams): Promise<OverrideResult> {
    const { intent, query, workspaceStats } = params;
    const normalizedQuery = query.trim().toLowerCase();

    // Rule 1: Very high confidence pattern match should NOT be overridden
    if (intent.confidence >= 0.95 && intent.matchedPattern) {
      return intent;
    }

    // Rule 2: Protected intents should NEVER be overridden to 'help'
    if (this.protectedIntents.includes(intent.primaryIntent)) {
      return intent;
    }

    // Rule 3: No documents + SPECIFIC Koda help keywords → 'help'
    // Only override if query explicitly asks about Koda usage (not document questions)
    if (
      workspaceStats.docCount === 0 &&
      this.containsHelpKeyword(normalizedQuery) &&
      intent.primaryIntent !== 'help' &&
      !this.isDocumentContentQuery(normalizedQuery)
    ) {
      return {
        ...intent,
        primaryIntent: 'help',
        confidence: 1.0,
        overrideReason: 'No documents and query contains Koda-specific help keywords',
      };
    }

    // Rule 4: Document query but no documents → ADD GUIDANCE FLAG, but DON'T change intent
    // This allows the handler to show appropriate "no documents" messaging
    // without breaking intent classification accuracy
    // V4: 'documents' + domain-specific intents (excel, accounting, etc.)
    const documentIntents = ['documents', 'excel', 'accounting', 'engineering', 'finance', 'legal', 'medical'];
    if (
      workspaceStats.docCount === 0 &&
      documentIntents.includes(intent.primaryIntent)
    ) {
      return {
        ...intent,
        // KEEP the original intent - don't override to 'help'!
        noDocsGuidance: true,
        overrideReason: 'No documents available - guidance flag added',
      } as IntentClassificationV3;
    }

    // No override needed
    return intent;
  }

  /**
   * Check if query is asking about document CONTENT (not Koda features).
   * Used to prevent absorbing DOC_QA queries into PRODUCT_HELP.
   */
  private isDocumentContentQuery(normalizedQuery: string): boolean {
    const contentIndicators = [
      // English
      'what does', 'according to', 'based on', 'in the document', 'in the file',
      'says about', 'mention', 'contract say', 'report say', 'document say',
      'summarize', 'summary of', 'find in', 'search for', 'look for',
      // Portuguese
      'o que diz', 'de acordo com', 'no documento', 'no arquivo', 'fala sobre',
      'resumir', 'resumo de', 'encontrar em', 'buscar',
      // Spanish
      'qué dice', 'según', 'en el documento', 'en el archivo', 'habla sobre',
      'resumir', 'resumen de', 'encontrar en', 'buscar',
    ];
    return contentIndicators.some(ind => normalizedQuery.includes(ind));
  }

  /**
   * Check if query contains any help-related keywords.
   */
  private containsHelpKeyword(normalizedQuery: string): boolean {
    return this.helpKeywords.some(keyword => normalizedQuery.includes(keyword));
  }

  /**
   * Check if query is asking about documents.
   */
  public isDocumentQuery(query: string): boolean {
    const docKeywords = [
      'document', 'file', 'arquivo', 'documento', 'fichero', 'archivo',
      'upload', 'enviar', 'carregar', 'subir',
    ];
    const normalized = query.toLowerCase();
    return docKeywords.some(kw => normalized.includes(kw));
  }
}

// Export class for DI container injection
export { OverrideService };

// Singleton removed - use container.getOverride() instead
export default OverrideService;
